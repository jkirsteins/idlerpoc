# Skill System Revamp: Melvor-Inspired Mastery

## Overview

Replace the current 7-skill system (piloting, astrogation, engineering, strength, charisma, loyalty, commerce) with a focused 3-skill system inspired by Melvor Idle's mastery mechanics. The three skills are:

1. **Piloting** — Flight, navigation, and ship handling
2. **Mining** — Resource extraction and ore processing
3. **Commerce** — Trade, negotiation, and economic optimization

Each skill has three progression layers (modeled after Melvor):

| Layer                               | What it tracks                   | What it rewards                            |
| ----------------------------------- | -------------------------------- | ------------------------------------------ |
| **Skill Level** (0-99)              | Total skill XP from training     | Unlocks new actions/content                |
| **Item Mastery** (0-99 per item)    | XP per individual sub-item       | Per-item efficiency bonuses                |
| **Mastery Pool** (0-100% per skill) | Auto-accumulates from mastery XP | Skill-wide passive bonuses at 10/25/50/95% |

---

## Skill 1: Piloting

### Skill Level Unlocks

Piloting level determines where you can go and what ships you can fly.

| Level | Unlock                                          |
| ----- | ----------------------------------------------- |
| 0     | Earth orbit, Gateway Station (LEO)              |
| 10    | Debris Field Alpha, Scrapyard Ring (near-Earth) |
| 20    | Meridian Depot (MEO)                            |
| 25    | Class II ships (Wayfarer, Corsair, etc.)        |
| 35    | Forge Station (lunar orbit)                     |
| 45    | Freeport Station, The Scatter                   |
| 50    | Class III ships (Firebrand, Leviathan)          |
| 60    | Mars                                            |
| 75    | Class IV ships, Jupiter Station                 |
| 95    | Class V ships                                   |

### Per-Item Mastery: Route Familiarity

Each route (origin→destination pair) has an independent mastery level (0-99). Flying a route earns route mastery XP.

| Mastery Level | Bonus for that route                      |
| ------------- | ----------------------------------------- |
| 10            | -5% fuel consumption                      |
| 25            | -10% fuel, -5% travel time                |
| 40            | -15% fuel, -10% travel time               |
| 50            | +5% encounter evasion chance              |
| 65            | -20% fuel, -15% travel time               |
| 80            | +10% encounter evasion, -20% travel time  |
| 99            | -25% fuel, -25% travel time, +15% evasion |

Route mastery bonuses are emergent: a pilot who's flown Earth→Mars 50 times knows the optimal burn profiles, gravity assist windows, and pirate patrol patterns.

### Mastery Pool Checkpoints (Piloting)

| Threshold | Bonus                                |
| --------- | ------------------------------------ |
| 10%       | +5% Piloting mastery XP              |
| 25%       | -0.1s engine warmup time             |
| 50%       | +5% fuel efficiency on all routes    |
| 95%       | +10% encounter evasion on all routes |

### Training

- **Passive**: Helm job slot trains piloting during flight (existing mechanic)
- **Route mastery**: Earned per-tick during flight on that route
- **Event gains**: Encounter evasion/fleeing awards flat piloting XP

---

## Skill 2: Mining

### Skill Level Unlocks

Mining level determines what ores you can extract and what equipment you can operate.

| Level | Unlock                                 |
| ----- | -------------------------------------- |
| 0     | Can mine Iron Ore (basic mining laser) |
| 10    | Can mine Copper Ore, Silicate          |
| 15    | Can use Improved Mining Laser          |
| 25    | Can mine Titanium Ore, Rare Earth      |
| 30    | Can use Heavy Mining Drill             |
| 40    | Can mine Platinum Ore                  |
| 50    | Can use Deep Core Extractor            |
| 60    | Can mine Helium-3 (gas extraction)     |
| 75    | Can use Fusion-Assisted Drill          |
| 90    | Can mine Exotic Matter                 |

### Per-Item Mastery: Ore Familiarity

Each ore type has an independent mastery level (0-99). Mining a specific ore earns mastery XP for that ore.

| Mastery Level | Bonus for that ore                                 |
| ------------- | -------------------------------------------------- |
| 10            | +5% yield (more ore per mining tick)               |
| 25            | +10% yield, -5% equipment wear                     |
| 40            | +15% yield, +5% chance to find rare variant        |
| 50            | -10% equipment wear, +10% rare variant chance      |
| 65            | +25% yield                                         |
| 80            | +30% yield, +15% rare variant, -15% equipment wear |
| 99            | +40% yield, +20% rare variant, -20% equipment wear |

### Mastery Pool Checkpoints (Mining)

| Threshold | Bonus                                        |
| --------- | -------------------------------------------- |
| 10%       | +5% Mining mastery XP                        |
| 25%       | +5% yield on all ores                        |
| 50%       | -10% equipment degradation rate while mining |
| 95%       | +10% chance to double any ore drop           |

### Mining Equipment (Crew Equipment Slot)

Mining equipment goes in crew equipment slots. The miner must have the equipment to mine.

| Equipment               | Cost      | Mining Level Req | Ores Available       | Mining Rate |
| ----------------------- | --------- | ---------------- | -------------------- | ----------- |
| Basic Mining Laser      | 500 cr    | 0                | Iron, Silicate       | 1.0x        |
| Improved Mining Laser   | 1,500 cr  | 15               | + Copper, Rare Earth | 1.5x        |
| Heavy Mining Drill      | 4,000 cr  | 30               | + Titanium           | 2.0x        |
| Deep Core Extractor     | 10,000 cr | 50               | + Platinum           | 2.5x        |
| Fusion-Assisted Drill   | 25,000 cr | 75               | + Helium-3           | 3.5x        |
| Quantum Resonance Drill | 75,000 cr | 90               | + Exotic Matter      | 5.0x        |

### Mining Mechanics

- Mining occurs while orbiting a location with `mine` service
- Crew assigned to a `mining` job slot train Mining skill + earn ore mastery XP
- Mining yield per tick: `baseRate × equipmentMultiplier × (1 + oreMasteryBonus) × (1 + poolBonus)`
- Mined ore goes into cargo hold; sell at stations with `trade` service
- Mining equipment (crew slot) degrades with use; higher ore mastery reduces degradation

### Training

- **Passive**: Mining job slot trains mining skill while orbiting mining locations
- **Ore mastery**: Earned per mining tick for the specific ore being mined
- **Event gains**: Contract completion involving ore delivery awards flat mining XP

---

## Skill 3: Commerce

### Skill Level Unlocks

Commerce level determines what trade contracts you can access and economic bonuses.

| Level | Unlock                                             |
| ----- | -------------------------------------------------- |
| 0     | Basic delivery contracts                           |
| 10    | Freight contracts                                  |
| 15    | Passenger contracts                                |
| 25    | +5% quest payment, -5% fuel cost, Supply contracts |
| 35    | Standing freight routes                            |
| 50    | +10% quest payment, -10% fuel cost                 |
| 65    | Premium contracts (higher pay, longer routes)      |
| 75    | +15% quest payment, -15% fuel cost                 |
| 85    | Exclusive trade routes (highest-value routes)      |
| 95    | +20% quest payment, -20% fuel cost                 |

### Per-Item Mastery: Trade Route Knowledge

Each trade route (location pair) has an independent mastery level (0-99). Completing contracts on that route earns route commerce mastery.

| Mastery Level | Bonus for that route                                            |
| ------------- | --------------------------------------------------------------- |
| 10            | +3% payment bonus for contracts on this route                   |
| 25            | +5% payment, learn commodity cycle (shows best buy/sell timing) |
| 40            | +8% payment, -5% fuel discount on this route                    |
| 50            | +10% payment, access to exclusive local contracts               |
| 65            | +12% payment, -8% fuel discount                                 |
| 80            | +15% payment, -10% fuel discount, priority docking              |
| 99            | +20% payment, -15% fuel discount, guaranteed best prices        |

### Mastery Pool Checkpoints (Commerce)

| Threshold | Bonus                                      |
| --------- | ------------------------------------------ |
| 10%       | +5% Commerce mastery XP                    |
| 25%       | -5% crew salary costs (better negotiation) |
| 50%       | +5% sell price for all ore and goods       |
| 95%       | +10% payment on all contracts              |

### Training

- **Passive**: Commerce is NOT trained via job slot — only through completing contracts (same as current design)
- **Captain** earns: `1.0 + 0.5 × tripsCompleted` per contract completion
- **First officer** earns 50% of captain's amount
- **Trade route mastery**: Earned on contract completion for that specific route pair

---

## Mining Destinations (Near-Earth, Station Keeper Accessible)

New locations within Station Keeper range (≤2,000 km from Earth):

| Location                     | Distance | Type          | Resources                          | Services    | Piloting Req |
| ---------------------------- | -------- | ------------- | ---------------------------------- | ----------- | ------------ |
| **Debris Field Alpha**       | 300 km   | asteroid_belt | Iron Ore, Silicate                 | mine        | 10           |
| **Scrapyard Ring**           | 800 km   | orbital       | Copper Ore, Iron Ore               | mine, trade | 10           |
| **Near-Earth Asteroid 2247** | 1,500 km | asteroid_belt | Titanium Ore, Rare Earth, Iron Ore | mine        | 25           |

Existing locations gain mining capabilities:

| Location                      | Resources Added                        | Notes                      |
| ----------------------------- | -------------------------------------- | -------------------------- |
| **The Scatter** (2.5M km)     | Platinum Ore, Titanium Ore, Rare Earth | Already has `mine` service |
| **Mars** (54.6M km)           | Helium-3, Rare Earth, Iron Ore         | Add `mine` service         |
| **Jupiter Station** (628M km) | Helium-3, Exotic Matter                | Add `mine` service         |

---

## Resource Types (Ore)

| Ore           | Base Value | Mining Level | Availability                                 | Weight (kg/unit) |
| ------------- | ---------- | ------------ | -------------------------------------------- | ---------------- |
| Iron Ore      | 5 cr       | 0            | Debris Field Alpha, Scrapyard Ring, NEA-2247 | 10               |
| Silicate      | 3 cr       | 0            | Debris Field Alpha                           | 8                |
| Copper Ore    | 8 cr       | 10           | Scrapyard Ring, NEA-2247                     | 12               |
| Rare Earth    | 15 cr      | 10           | NEA-2247, The Scatter, Mars                  | 5                |
| Titanium Ore  | 25 cr      | 25           | NEA-2247, The Scatter                        | 15               |
| Platinum Ore  | 50 cr      | 40           | The Scatter                                  | 8                |
| Helium-3      | 80 cr      | 60           | Mars, Jupiter Station                        | 2                |
| Exotic Matter | 200 cr     | 90           | Jupiter Station                              | 1                |

Ore sells at stations with `trade` service. Price varies by ±20% based on location demand (planets pay more for raw materials; stations pay more for rare elements).

---

## Cross-Skill Dependencies

The three skills create a web of dependencies:

```
PILOTING ──unlocks──> DESTINATIONS ──contain──> ORES
                                                  │
MINING ───unlocks──> MINING EQUIPMENT ──mines──> ORES ──sell──> CREDITS
                                                                   │
COMMERCE ──unlocks──> TRADE CONTRACTS ──earn──> CREDITS ──buy──> SHIPS + EQUIPMENT
                          │                                        │
                          └───────────────requires────────────────┘
```

**Piloting × Mining**: You need piloting skill to reach asteroid belts, but mining skill to extract resources once there. A pilot with no mining crew can still run trade contracts; a miner with no pilot can't reach rich asteroids.

**Mining × Commerce**: Raw ore has base value, but Commerce mastery on a trade route increases sell prices. A miner with Commerce expertise knows which station pays the most for platinum.

**Commerce × Piloting**: Better trade contracts require both Commerce skill (to unlock them) and Piloting skill (to reach the destinations they serve). The most profitable routes require high-level both.

---

## Crew Role Simplification

With 3 skills, crew roles simplify to:

| Highest Skill | Role   |
| ------------- | ------ |
| Piloting      | Pilot  |
| Mining        | Miner  |
| Commerce      | Trader |

Captain is always the player character. Role priority for ties: Piloting > Mining > Commerce.

### Job Slots (Simplified)

| Job Slot   | Skill Trained             | Source                                         |
| ---------- | ------------------------- | ---------------------------------------------- |
| helm       | piloting                  | bridge room                                    |
| mining_ops | mining                    | mining equipment (when orbiting mine location) |
| rest       | (none)                    | quarters                                       |
| patient    | (none)                    | medbay                                         |
| repair     | (none, repairs equipment) | ship-wide                                      |

Commerce is NOT trained via job slots — only by completing contracts.

---

## Crew/Skill UI Changes

### Skill Panel (per crew member)

Each skill shows:

1. **Skill Level** (0-99) with rank name and progress bar to next rank
2. **Mastery items** — expandable list showing all route/ore masteries with individual progress bars
3. **Mastery Pool** — fill bar showing 10/25/50/95% thresholds with active bonuses highlighted

### Mastery Overview Panel

A new panel (or tab section) showing:

- Per-skill: pool fill %, active checkpoint bonuses, total mastery items completed
- Per-item: individual mastery levels, current bonuses, progress to next breakpoint
- Spend pool XP button with warning when crossing below checkpoint

### Navigation Enhancements

- Destinations show piloting level requirement (locked/unlocked indicator)
- Mining locations show available ores with mining level requirements
- Route cards show route mastery level and current bonuses

### Quest Card Enhancements

- Show Commerce mastery level for that route
- Show commerce-derived bonus pay
- Lock indicator for contract types above current Commerce level

---

## Encounter System (Simplified)

With only Piloting skill affecting encounters:

- **Evasion**: Based on best pilot's piloting skill (replaces astrogation factor)
- **Negotiation**: Removed (was charisma-based; Commerce doesn't help mid-combat)
- **Combat defense**: Based on ship equipment only (removes strength factor)
- **Pipeline**: Evade → Flee → Combat → Outcome
- **Outcomes**: Evasion, Fled, Victory, Harassment, Boarding (negotiation removed)

Piloting skill reduces encounter probability AND improves evasion:

```
encounterReduction = 1 / (1 + bestPiloting × 0.008)
evasionBonus = bestPiloting × 0.004
```

---

## Migration Notes

This is an incompatible save change (per CLAUDE.md: "For a proof of concept we should just reset the game state when making incompatible changes"). Increment `saveVersion` and force new game.

### Files Affected

**Core data:**

- `src/models/index.ts` — SkillId, CrewSkills, new OreId/MiningEquipmentId types
- `src/skillRanks.ts` — Remove unused skill thresholds, add piloting destination gates
- `src/skillProgression.ts` — Rewrite for 3 skills + mastery XP
- `src/crewRoles.ts` — 3 roles only (pilot, miner, trader)
- `src/jobSlots.ts` — Simplify to helm, mining_ops, rest, patient, repair

**New files:**

- `src/oreTypes.ts` — Ore definitions with base values, mining level requirements
- `src/miningEquipment.ts` — Mining equipment definitions (crew equipment)
- `src/masterySystem.ts` — Mastery XP calculation, pool management, checkpoint bonuses

**Modified systems:**

- `src/worldGen.ts` — New mining destinations, piloting level gates
- `src/encounterSystem.ts` — Simplified to piloting-only
- `src/combatSystem.ts` — Remove negotiation, strength; defense from equipment only
- `src/questGen.ts` — Commerce-gated contract types
- `src/contractExec.ts` — Commerce mastery gains on completion
- `src/gameTick.ts` — Mining tick processing, mastery XP flow

**UI:**

- `src/ui/crewTab.ts` — New mastery display
- `src/ui/renderer.ts` — Mining overlay on nav tab when orbiting
- `src/gamepediaData.ts` — New articles for mining, mastery, updated skill articles

**Equipment:**

- `src/crewEquipment.ts` — Add mining equipment category
- `src/equipment.ts` — No change (ship equipment unchanged)

---

## Pacing Targets

| Milestone                                | Real Time  |
| ---------------------------------------- | ---------- |
| First ore mined                          | 5 minutes  |
| Piloting 10 (unlock mining destinations) | 30 minutes |
| Mining 10 (copper/silicate)              | 1 hour     |
| Commerce 25 (freight contracts)          | 2 hours    |
| Piloting 25 (Class II ships)             | 1 day      |
| First mastery item to level 25           | 2 days     |
| Mining 50 (deep core extractor)          | 1 week     |
| First mastery pool to 50%                | 2 weeks    |
| Piloting 50 (Class III ships)            | 5 days     |
| All mastery pools at 95%                 | 2+ months  |
| All item masteries at 99                 | 4+ months  |
