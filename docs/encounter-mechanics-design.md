# Encounter System: Mechanics Design Document

**Author:** Game Designer
**Status:** Implemented — see `src/encounterSystem.ts` and `src/combatSystem.ts`
**Scope:** Phase B1 (Core Encounters)

---

## 1. Design Principles

1. **Nothing hardcoded.** Every input derives from existing game data.
2. **Per-tick evaluation.** Encounter chance reflects ship state at the moment of the check — position, equipment condition, crew health, flight phase — not a pre-rolled value.
3. **Idle-safe.** Fast-forward (catch-up) ticks cap severity at harassment. No boarding while the player is away.
4. **Emergent tradeoffs.** Fast ships are visible. Stealthy ships are slow. Armed ships are expensive. Every player choice has encounter consequences.

---

## 2. Encounter Detection: Per-Tick Probability

### 2.1 Core Formula

For each in-flight ship, every tick:

```
encounterChance = BASE_RATE × positionDanger × heatSignature × crewSkillFactor
```

A random roll `Math.random() < encounterChance` triggers an encounter.

### 2.2 BASE_RATE

```
BASE_RATE = 0.00005  (0.005% per tick)
```

Calibration: `1 - (1 - 0.00005)^3000 ≈ 13.9%` encounter chance over a 3000-tick Earth-Mars flight with all multipliers at 1.0.

### 2.3 Multiplier 1: Position Danger

Derives entirely from `worldGen.ts` location data — faction affiliations and distances.

**Step A — Interpolate ship position in 1D km-from-Earth:**

```typescript
const origin = world.locations.find((l) => l.id === flight.origin);
const dest = world.locations.find((l) => l.id === flight.destination);
const originDist = origin.distanceFromEarth; // km
const destDist = dest.distanceFromEarth; // km
const progress = flight.distanceCovered / flight.totalDistance; // 0..1
const currentKm = originDist + (destDist - originDist) * progress;
```

**Step B — Alliance distance factor:**

Calculate distance to nearest Terran Alliance location:

```typescript
const allianceLocations = world.locations.filter(
  (l) => l.factionId === 'terran_alliance'
);
const allianceDistance = Math.min(
  ...allianceLocations.map((l) => Math.abs(currentKm - l.distanceFromEarth))
);
const dangerFromAlliance = clamp(allianceDistance / 5_000_000, 0.1, 5.0);
```

Reference values (from actual world data):
| Ship Position | Nearest TA Location | allianceDistance | dangerFromAlliance |
|---|---|---|---|
| 0 km (Earth) | Earth (0) | 0 | 0.1 |
| 400 km (Gateway) | Gateway (400) | 0 | 0.1 |
| 384,400 km (Forge) | Forge (384,400) | 0 | 0.1 |
| 1,200,000 km (Freeport) | Forge (384,400) | 815,600 | 0.163 |
| 2,500,000 km (Scatter) | Forge (384,400) | 2,115,600 | 0.423 |
| 27,300,000 km (midway to Mars) | Mars (54,600,000) | 27,300,000 | 5.0 (capped) |
| 54,600,000 km (Mars) | Mars (54,600,000) | 0 | 0.1 |
| 341,000,000 km (midway to Jupiter) | Mars (54,600,000) | 286,400,000 | 5.0 (capped) |
| 628,000,000 km (Jupiter) | Jupiter (628,000,000) | 0 | 0.1 |

**Step C — Lawless proximity bonus:**

Free Traders Guild locations (Freeport at 1.2M km, The Scatter at 2.5M km) increase danger via proximity:

```typescript
const freeportProximity = Math.max(
  0,
  1 - Math.abs(currentKm - 1_200_000) / 500_000
);
const scatterProximity = Math.max(
  0,
  1 - Math.abs(currentKm - 2_500_000) / 1_000_000
);
const lawlessBonus = 1 + (freeportProximity + scatterProximity) * 2.0;
```

Note: These distances come from the actual `worldGen.ts` location data (`freeport_station.distanceFromEarth = 1_200_000`, `the_scatter.distanceFromEarth = 2_500_000`). The implementation should read these dynamically from the world data, not hardcode the km values.

**Step D — Final position danger:**

```typescript
positionDanger = dangerFromAlliance * lawlessBonus;
```

### 2.4 Multiplier 2: Heat Signature

Derives from `engines.ts` `wasteHeatOutput` and current flight phase from `FlightState.phase`.

```typescript
const engineDef = getEngineDefinition(ship.engine.definitionId);
const wasteHeat = engineDef.wasteHeatOutput;
const phaseMultiplier = flight.phase === 'coasting' ? 0.1 : 1.0;
const heatSignature = 1 + (wasteHeat * phaseMultiplier) / 200;
```

Reference values (from actual engine data):
| Engine | wasteHeatOutput | Burning | Coasting |
|---|---|---|---|
| RS-44 Chemical | 0 kW | 1.00 | 1.00 |
| NTR-200 Mk1 | 10 kW | 1.05 | 1.005 |
| NTR-300S Stealth | 10 kW | 1.05 | 1.005 |
| NTR-450 Mk2 | 15 kW | 1.075 | 1.0075 |
| NTR-800 Heavy | 30 kW | 1.15 | 1.015 |
| FDR-100 Sunfire | 150 kW | 1.75 | 1.075 |
| FDR-300 Hellion | 250 kW | 2.25 | 1.125 |
| FDR-500 Torch | 400 kW | 3.00 | 1.20 |
| UNAS Colossus | 800 kW | 5.00 | 1.40 |

**Emergent tradeoff:** Torch ships are fast but glow like beacons during burns. The Phantom (NTR-300S, 10 kW) is nearly invisible. During coast phases, all ships become harder to detect.

### 2.5 Multiplier 3: Crew Skill Factor

Best astrogation skill among bridge-assigned crew. Derives from `CrewMember.skills.astrogation` and room assignments.

```typescript
const bridge = ship.rooms.find((r) => r.type === 'bridge');
const bridgeCrew = bridge
  ? bridge.assignedCrewIds
      .map((id) => ship.crew.find((c) => c.id === id))
      .filter(Boolean)
  : [];
const bestAstrogation = Math.max(
  0,
  ...bridgeCrew.map((c) => c.skills.astrogation)
);
const crewSkillFactor = 1 / (1 + bestAstrogation * 0.08);
```

Reference values:
| Astrogation Skill | crewSkillFactor | Reduction |
|---|---|---|
| 0 (no navigator) | 1.00 | 0% |
| 3 (novice) | 0.81 | 19% |
| 5 (competent) | 0.71 | 29% |
| 7 (skilled) | 0.64 | 36% |
| 10 (master) | 0.56 | 44% |

### 2.6 Encounter Cooldown

After an encounter triggers, the ship is immune for a minimum duration:

```typescript
const ENCOUNTER_COOLDOWN_SECONDS = 500 * GAME_SECONDS_PER_TICK; // 500 ticks = ~10.4 game days

if (
  ship.lastEncounterTick != null &&
  gameData.gameTime - ship.lastEncounterTick < ENCOUNTER_COOLDOWN_SECONDS
) {
  return; // Skip encounter check
}
```

This prevents encounter stacking and ensures pacing. ~10 game days between encounters minimum.

### 2.7 Calibration Targets

| Route                    | ~Ticks   | Avg positionDanger | Engine (heat)  | Crew Skill 5 | Expected % |
| ------------------------ | -------- | ------------------ | -------------- | ------------ | ---------- |
| Earth → Gateway          | ~5       | 0.1                | NTR (1.05)     | 0.71         | ~0.002%    |
| Earth → Forge Station    | ~200     | 0.1                | NTR (1.05)     | 0.71         | ~0.07%     |
| Earth → Freeport         | ~500     | ~0.5 avg           | NTR (1.05)     | 0.71         | ~1.8%      |
| Earth → Mars (NTR)       | ~3000    | ~1.0 avg           | NTR (1.15)     | 0.71         | ~12%       |
| Earth → Mars (Fusion)    | ~3000    | ~1.0 avg           | Sunfire (1.75) | 0.71         | ~17%       |
| Through Scatter region   | variable | ~2.5               | Sunfire (1.75) | 0.71         | ~30%+      |
| Earth → Jupiter (Fusion) | ~10000   | ~2.0 avg           | Hellion (2.25) | 0.71         | ~45%+      |

Safe routes near Earth remain safe. Danger ramps up with distance from Alliance space and proximity to lawless zones.

---

## 3. Encounter Resolution: Auto-Battle Pipeline

All encounters auto-resolve in a single tick. No player input during resolution — this is an idle/incremental game.

### Pipeline: Threat → Evade → Negotiate → Combat → Outcome

### 3.1 Step 1: Pirate Threat Generation

Threat level (1-10) emerges from position and cargo weight:

```typescript
const baseThreat = clamp(Math.floor(currentKm / 10_000_000), 1, 8);
const cargoWeight = ship.cargo.reduce((sum, item) => {
  const def = getCrewEquipmentDefinition(item.definitionId);
  return sum + def.weight;
}, 0);
const cargoBonus = Math.floor(cargoWeight / 5000);
const threatLevel = clamp(baseThreat + cargoBonus, 1, 10);
```

Note: `cargoWeight` currently uses crew equipment weight. The BACKLOG notes cargo weight estimation is hardcoded at `* 100`. When proper cargo weight tracking is implemented, this formula should use that instead.

| Position                     | baseThreat | Typical cargoBonus | Total |
| ---------------------------- | ---------- | ------------------ | ----- |
| Near Earth (<10M km)         | 1          | 0-1                | 1-2   |
| Mid-inner system (10-30M km) | 1-3        | 0-2                | 1-5   |
| Mars vicinity (54.6M km)     | 5          | 1-3                | 6-8   |
| Deep space (>100M km)        | 8          | 2-4                | 8-10  |

### 3.2 Step 2: Evasion Attempt

High velocity + scanner + astrogation skill = chance to outrun the encounter entirely.

```typescript
// Velocity factor: fast ships are hard to intercept
const velocity = flight.currentVelocity; // m/s
const velocityFactor = clamp(velocity / 50_000, 0, 0.3);

// Nav scanner bonus (ship equipment)
const navScanner = ship.equipment.find(
  (eq) => eq.definitionId === 'nav_scanner'
);
const scannerBonus = navScanner ? 0.15 : 0;

// Astrogation skill (same bridge crew as detection)
const astrogationBonus = bestAstrogation * 0.02;

const evasionChance = velocityFactor + scannerBonus + astrogationBonus;
```

| Factor            | Source                                 | Max Contribution  |
| ----------------- | -------------------------------------- | ----------------- |
| Velocity          | `FlightState.currentVelocity` / 50,000 | 30%               |
| Nav Scanner       | `nav_scanner` equipment present        | 15%               |
| Astrogation       | Bridge crew best skill × 0.02          | 20% (at skill 10) |
| **Total Maximum** |                                        | **65%**           |

If `Math.random() < evasionChance`: encounter evaded. Log narrative, no damage.

### 3.3 Step 3: Negotiation Attempt

If evasion fails, charisma crew attempt to buy safe passage.

```typescript
const bestCharisma = Math.max(0, ...ship.crew.map((c) => c.skills.charisma));
const negotiationChance = bestCharisma / 20; // Max 50% at skill 10
```

If `Math.random() < negotiationChance`:

- **Ransom cost:** `gameData.credits * (0.05 + Math.random() * 0.10) * (threatLevel / 10)`
  - 5-15% of credits, scaled by threat
  - Minimum 50 credits (pirates won't bother for less)
- Deduct from shared wallet
- Log narrative with negotiator name and cost

This gives the cook/quartermaster role encounter relevance via charisma.

### 3.4 Step 4: Combat Resolution

If neither evasion nor negotiation succeeds, combat resolves automatically.

**Ship Defense Score** (all from existing systems):

```typescript
let defenseScore = 0;

// 1. Point Defense equipment (PD-40 Flak Turret)
const pdEquipment = ship.equipment.find(
  (eq) => eq.definitionId === 'point_defense'
);
if (pdEquipment) {
  const pdEffectiveness = 1 - pdEquipment.degradation / 200;
  let pdScore = 20 * pdEffectiveness;

  // Point Defense Station staffing bonus (+50%)
  const pdStation = ship.rooms.find((r) => r.type === 'point_defense_station');
  if (
    pdStation &&
    pdStation.state === 'operational' &&
    pdStation.assignedCrewIds.length > 0
  ) {
    // Gunner skill further modifies PD effectiveness
    const pdCrew = pdStation.assignedCrewIds
      .map((id) => ship.crew.find((c) => c.id === id))
      .filter(Boolean);
    const bestGunnerSkill = Math.max(
      0,
      ...pdCrew.map((c) => c.skills.strength)
    );
    const staffingBonus = 0.5 + bestGunnerSkill * 0.05; // 50% base + 5% per skill point
    pdScore *= 1 + staffingBonus;
  }

  defenseScore += pdScore;
}

// 2. Crew in armory with weapons
const armory = ship.rooms.find((r) => r.type === 'armory');
if (armory && armory.state === 'operational') {
  for (const crewId of armory.assignedCrewIds) {
    const crew = ship.crew.find((c) => c.id === crewId);
    if (crew) {
      // Strength skill base
      let crewCombat = crew.skills.strength;

      // Weapon attack score
      for (const eq of crew.equipment) {
        const eqDef = getCrewEquipmentDefinition(eq.definitionId);
        crewCombat += eqDef.attackScore; // sidearm: +3, rifle: +7
      }

      // Health modifier (injured crew fight worse)
      crewCombat *= crew.health / 100;

      defenseScore += crewCombat;
    }
  }
}

// 3. Deflector Shield passive defense
const deflector = ship.equipment.find(
  (eq) => eq.definitionId === 'deflector_shield'
);
if (deflector) {
  defenseScore += 10;
}

// 4. Ship mass bonus (heavy ships are harder to board)
const shipClass = getShipClass(ship.classId);
const massBonus = shipClass.mass / 100_000;
defenseScore += massBonus;
```

Defense score reference by ship class:

| Ship                   | PD  | PD Station+Gunner(5) | Armory Crew | Deflector | Mass | Total (approx) |
| ---------------------- | --- | -------------------- | ----------- | --------- | ---- | -------------- |
| Station Keeper         | -   | -                    | -           | -         | 0.5  | 0.5            |
| Wayfarer               | -   | -                    | -           | -         | 2.0  | 2.0            |
| Corsair (equipped)     | 20  | -                    | 1×(5+7)=12  | 10        | 3.5  | 45.5           |
| Phantom (equipped)     | 20  | -                    | 1×(5+3)=8   | 10        | 2.5  | 40.5           |
| Dreadnought (equipped) | 20  | -                    | 2×(5+7)=24  | 10        | 5.0  | 59.0           |
| Leviathan (full)       | 20  | +50%=30              | 3×(5+7)=36  | 10        | 12.0 | 88.0           |

**Pirate Attack Score:**

```typescript
const pirateAttack = threatLevel * 5;
```

| Threat Level | Pirate Attack | Needed Defense for Victory | Needed for Draw |
| ------------ | ------------- | -------------------------- | --------------- |
| 1            | 5             | 7.5                        | 3.75            |
| 3            | 15            | 22.5                       | 11.25           |
| 5            | 25            | 37.5                       | 18.75           |
| 7            | 35            | 52.5                       | 26.25           |
| 10           | 50            | 75.0                       | 37.50           |

### 3.5 Step 5: Outcome

Compare `defenseScore` vs `pirateAttack`:

#### Victory (defenseScore >= pirateAttack × 1.5)

The crew decisively repels the attack.

- Point defense degradation: +2%
- Bounty: `threatLevel × 50` credits added to shared wallet
- XP: Award combat XP to armory crew and PD station crew (future, per BACKLOG)
- Log: `"[ShipName] Pirate raider repelled. Crew earned {bounty} credit bounty."`

#### Harassment (defenseScore >= pirateAttack × 0.75)

The pirates harass but cannot overcome defenses.

- Defense equipment degradation: +5% on point_defense
- Crew health loss: 5-10 HP to all crew (random per crew member)
- Flight delay: +5% to remaining flight time (`flight.totalTime *= 1.05`)
- Log: `"[ShipName] Pirate skirmish in contested space. Minor damage sustained."`

#### Boarding (defenseScore < pirateAttack × 0.75)

Pirates overwhelm defenses and board the ship.

- Crew health loss: 15-25 HP per crew member
  - Crew with `armored_vest` equipment: reduce damage by 50%
- Credit theft: 10-25% of shared wallet stolen
- Equipment degradation: +10% on ALL ship equipment (including radiators, shielding)
- **Cascading consequence:** degraded radiators → excess heat next tick → further degradation → possible radiation spikes (this leverages the existing torch ship cascade in `gameTick.ts`)
- Log: `"[ShipName] Ship boarded by pirates. {credits} credits stolen, crew injured."`

### 3.6 Fast-Forward Severity Cap

During catch-up ticks (when `numTicks > 1` in the tick loop), encounter outcomes are capped at **harassment**. Even if combat resolution would produce a boarding result, downgrade to harassment.

```typescript
const isCatchUp = ticksToProcess > 1;
if (isCatchUp && outcome === 'boarding') {
  outcome = 'harassment';
}
```

This ensures players don't return to devastated fleets.

---

## 4. Data Model Changes

### 4.1 Ship Model Extension

```typescript
// Add to Ship interface
lastEncounterTime?: number;  // gameTime of last encounter (for cooldown)
```

### 4.2 GameData Extension

```typescript
// Add to GameData interface
encounterStats?: {
  totalEncounters: number;
  evaded: number;
  negotiated: number;
  victories: number;
  harassments: number;
  boardings: number;
};
```

### 4.3 Log Entry Types

Add new log entry types:

```typescript
// Add to LogEntryType union
| 'encounter_evaded'
| 'encounter_negotiated'
| 'encounter_victory'
| 'encounter_harassment'
| 'encounter_boarding'
```

### 4.4 Encounter Result Type

```typescript
interface EncounterResult {
  type: 'evaded' | 'negotiated' | 'victory' | 'harassment' | 'boarding';
  shipId: string;
  threatLevel: number;
  positionKm: number;
  defenseScore?: number;
  pirateAttack?: number;
  creditsLost?: number;
  creditsGained?: number;
  healthLost?: Record<string, number>; // crewId -> HP lost
  equipmentDegraded?: Record<string, number>; // equipmentId -> degradation added
  flightDelayAdded?: number; // game-seconds added
}
```

---

## 5. Integration Points

### 5.1 gameTick.ts

The encounter check runs inside `applyShipTick()`, after flight physics but before flight completion:

```
1. Engine warmup
2. Flight physics advancement
3. Fuel consumption
4. >>> ENCOUNTER CHECK (new) <<<
5. Torch ship mechanics (radiation, heat, containment)
6. Flight completion check
7. Air filter degradation
8. Gravity exposure
```

The encounter check must run **before** torch mechanics because boarding outcomes can degrade equipment, which changes subsequent heat/radiation calculations within the same tick.

### 5.2 Existing Systems Activated

| System                          | Currently                                 | With Encounters               |
| ------------------------------- | ----------------------------------------- | ----------------------------- |
| `point_defense` equipment       | Exists, hasDegradation: true              | Primary automated defense     |
| `point_defense_station` room    | Exists, preferredRole: gunner             | Staffing multiplies PD score  |
| `deflector_shield` equipment    | Exists, hasDegradation: false             | +10 passive defense           |
| `nav_scanner` equipment         | Exists, hasDegradation: false             | +15% evasion chance           |
| `armory` room                   | Exists, maxCrew: 3, preferredRole: gunner | Crew combat station           |
| Gunner role / `strength` skill  | Exists, unused                            | Combat effectiveness          |
| `sidearm` (attackScore: 3)      | Defined, unused                           | Crew combat damage            |
| `rifle` (attackScore: 7)        | Defined, unused                           | Crew combat damage            |
| `armored_vest` (armor category) | Exists, unused                            | 50% boarding damage reduction |
| `charisma` skill                | No gameplay effect                        | Negotiation chance            |
| `ntr_stealth` engine (10 kW)    | No advantage over other NTRs              | Lowest heat signature         |
| Ship mass (`shipClasses.ts`)    | Display/physics only                      | Boarding deterrence           |
| Flight phase (coasting)         | Physics only                              | 90% heat reduction            |
| `currentVelocity`               | Display only                              | Evasion factor (up to 30%)    |

---

## 6. Emergent System Interactions

1. **Engine heat → Detection → Encounter frequency:** Torch ships (150-800 kW) attract pirates. Phantom (10 kW) avoids them. Speed vs. safety tradeoff.

2. **Equipment degradation → Defense → Outcome:** A ship with degraded PD (50% degradation = half effectiveness) fights at half strength. Neglecting maintenance has cascading combat consequences.

3. **Boarding damage → Equipment degradation → Torch cascade:** Pirates damage radiators → excess heat next tick → further equipment degradation → radiation spikes → crew health crisis. The existing cascade from `gameTick.ts` amplifies encounter consequences naturally.

4. **Crew skills → Three resolution paths:**
   - Navigator (astrogation): evasion chance
   - Gunner (strength): combat defense
   - Quartermaster (charisma): negotiation chance
   - Different crew compositions favor different strategies

5. **Route economics → Risk-reward:** Dangerous routes (Scatter, deep space) are more profitable but riskier. A Leviathan with full combat crew can handle threats that would devastate a Wayfarer.

6. **Flight phase awareness:** Ships are safest during coast phase (heat signature drops to near-baseline). Burn phases are the vulnerable windows.

---

## 7. Balance Considerations

### 7.1 Tunable Constants

All constants that may need balance tuning, collected in one place:

```typescript
const ENCOUNTER_CONSTANTS = {
  BASE_RATE: 0.00005, // Per-tick base probability
  COOLDOWN_TICKS: 500, // Minimum ticks between encounters
  ALLIANCE_DISTANCE_DIVISOR: 5_000_000, // km; controls how fast danger ramps with distance
  DANGER_MIN: 0.1, // Minimum position danger (near Alliance)
  DANGER_MAX: 5.0, // Maximum position danger (deep space)
  LAWLESS_RADIUS_FREEPORT: 500_000, // km; radius of Freeport danger zone
  LAWLESS_RADIUS_SCATTER: 1_000_000, // km; radius of Scatter danger zone
  LAWLESS_MULTIPLIER: 2.0, // Max danger bonus per lawless zone
  HEAT_DIVISOR: 200, // kW; controls heat→signature scaling
  COAST_HEAT_FACTOR: 0.1, // Heat multiplier during coast phase
  ASTROGATION_FACTOR: 0.08, // Skill→detection reduction scaling
  EVASION_VELOCITY_DIVISOR: 50_000, // m/s; velocity for max evasion
  EVASION_VELOCITY_CAP: 0.3, // Max evasion from velocity
  EVASION_SCANNER_BONUS: 0.15, // Evasion from nav_scanner
  EVASION_SKILL_FACTOR: 0.02, // Evasion per astrogation point
  NEGOTIATION_DIVISOR: 20, // Charisma→negotiation scaling
  PD_BASE_SCORE: 20, // Point defense base combat value
  PD_STAFFING_BASE_BONUS: 0.5, // PD station staffing bonus (50%)
  PD_SKILL_BONUS: 0.05, // PD bonus per gunner skill point
  DEFLECTOR_BONUS: 10, // Passive defense from deflector
  MASS_DIVISOR: 100_000, // kg; mass→defense scaling
  THREAT_POSITION_DIVISOR: 10_000_000, // km; position→threat scaling
  THREAT_CARGO_DIVISOR: 5_000, // kg; cargo→threat scaling
  PIRATE_ATTACK_MULTIPLIER: 5, // Threat→attack score
  VICTORY_THRESHOLD: 1.5, // defense/attack ratio for victory
  HARASSMENT_THRESHOLD: 0.75, // defense/attack ratio for harassment
  VICTORY_PD_DEGRADATION: 2, // % degradation on PD from victory
  VICTORY_BOUNTY_PER_THREAT: 50, // Credits per threat level
  HARASSMENT_PD_DEGRADATION: 5, // % degradation from harassment
  HARASSMENT_HEALTH_MIN: 5, // Min HP loss from harassment
  HARASSMENT_HEALTH_MAX: 10, // Max HP loss from harassment
  HARASSMENT_FLIGHT_DELAY: 0.05, // 5% flight time added
  BOARDING_HEALTH_MIN: 15, // Min HP loss from boarding
  BOARDING_HEALTH_MAX: 25, // Max HP loss from boarding
  BOARDING_ARMOR_REDUCTION: 0.5, // Armor reduces boarding damage by 50%
  BOARDING_CREDIT_MIN: 0.1, // Min % credits stolen
  BOARDING_CREDIT_MAX: 0.25, // Max % credits stolen
  BOARDING_EQUIPMENT_DEGRADATION: 10, // % degradation on ALL equipment
};
```

### 7.2 Early Game Safety

Class I ships (Station Keeper) operate in LEO/MEO (0-20,000 km from Earth). With `dangerFromAlliance = 0.1` and no lawless proximity, effective encounter rate is ~0.0000005 per tick. Over a typical 5-tick hop: essentially 0%. Early game is safe by design.

### 7.3 Mid-Game Tension

Class II ships venturing to Freeport/Scatter face meaningful but manageable risk. A well-equipped Corsair (armory + PD + gunner + deflector) can handle threat level 3-5 encounters with victory outcomes. Players who skip defense equipment face harassment or boarding.

### 7.4 Late-Game Challenge

Class III torch ships face a double bind: their fusion drives make them visible (heatSignature 1.75-3.0), and deep space encounters have higher threat levels. But they also have more equipment slots, larger crews, and access to PD stations. The Leviathan with a full combat crew represents the endgame defensive peak.

---

## 8. Narrative Log Templates

All log entries include ship name prefix for fleet context.

```typescript
const ENCOUNTER_NARRATIVES = {
  evaded: [
    'Long-range sensor contact detected. Navigator plotted evasive course — contact lost.',
    'Unidentified vessel on intercept course. Too fast to catch — contact faded.',
    'Hazard scanner flagged incoming signature. Evasive burn executed successfully.',
  ],
  negotiated: [
    'Pirate hail received. {crewName} negotiated safe passage for {cost} credits.',
    'Armed vessel demanded tribute. {crewName} talked them down to {cost} credits.',
    'Hostile contact established comms. {crewName} brokered a deal: {cost} credits for passage.',
  ],
  victory: [
    'Pirate raider engaged. Point defense repelled the attack. Bounty: {bounty} credits.',
    'Hostile vessel opened fire. Crew fought back — attacker retreated. Bounty: {bounty} credits.',
    'Pirates attempted intercept. Ship defenses held. {bounty} credit bounty claimed.',
  ],
  harassment: [
    'Pirate skirmish in contested space. Minor damage sustained.',
    'Hit-and-run attack by raiders. Hull scarring and minor injuries.',
    'Pirates harassed the ship through the region. Some equipment damage taken.',
  ],
  boarding: [
    'Ship boarded by pirates. {credits} credits stolen, crew injured.',
    'Pirates overwhelmed defenses and boarded. Cargo raided, {credits} credits seized.',
    'Hostile boarding action. Crew injured, {credits} credits lost. Equipment damaged.',
  ],
};
```

---

## 9. File Structure

New files for Phase B1:

```
src/encounterSystem.ts    — Detection probability calculation
src/combatSystem.ts       — Auto-resolve pipeline (evade → negotiate → combat → outcome)
```

Modified files:

```
src/models/index.ts       — Add lastEncounterTime to Ship, encounterStats to GameData, new log types
src/gameTick.ts           — Add encounter check in applyShipTick()
src/logSystem.ts          — Add encounter log formatting (if needed)
```

---

**End of Encounter Mechanics Design**
