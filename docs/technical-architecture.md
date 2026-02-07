# Phase B1: Technical Implementation Architecture

**Author:** Staff Engineer
**Status:** Implementation plan — pending team approval
**Scope:** Phase B1 (Core Encounters) based on mechanics design + UX design docs

---

## 1. Implementation Overview

Phase B1 introduces the encounter system in 3 implementation tasks:

1. **Core encounter detection** (`encounterSystem.ts`) — per-tick probability calculations
2. **Auto-resolve combat** (`combatSystem.ts`) — evade → negotiate → combat → outcome pipeline
3. **UI components** — threat badges, encounter logs, catch-up report, regional status

Each task produces a self-contained module with comprehensive unit tests.

---

## 2. New Files

### 2.1 `src/encounterSystem.ts`

Core detection module. Pure functions, no side effects, fully testable.

**Exports:**

```typescript
// Per-tick encounter probability (returns 0..1)
function calculateEncounterChance(ship: Ship, gameData: GameData): number;

// Individual multiplier calculations (exported for testing + UI reuse)
function calculatePositionDanger(currentKm: number, world: World): number;
function calculateHeatSignature(engineDef: EngineDefinition, flightPhase: FlightPhase): number;
function calculateCrewSkillFactor(ship: Ship): number;

// Ship position interpolation (exported for UI reuse in navigation view)
function getShipPositionKm(ship: Ship, world: World): number;

// Route risk estimation (for quest cards + navigation view)
function estimateRouteRisk(origin: WorldLocation, destination: WorldLocation, ship: Ship, world: World): number;

// Threat level classification
function getThreatLevel(cumulativeRisk: number): 'clear' | 'caution' | 'danger' | 'critical';
function getThreatNarrative(level: string): string;

// Encounter cooldown check
function isOnCooldown(ship: Ship, gameTime: number): boolean;

// Tuning constants (exported as object for transparency)
const ENCOUNTER_CONSTANTS: { ... };
```

**Design decisions:**

- All position/danger calculations read from `World.locations` dynamically — no hardcoded km values for Freeport/Scatter
- `lawlessBonus` iterates over `free_traders_guild` faction locations rather than hardcoding specific location IDs
- `estimateRouteRisk` samples ~20 points along a route and averages, giving a quick approximation for UI display
- Constants object is exported so tests can verify behavior at boundary values

### 2.2 `src/combatSystem.ts`

Auto-resolve pipeline. Pure functions returning result objects, no mutations.

**Exports:**

```typescript
// Full pipeline: returns result + array of mutations to apply
function resolveEncounter(
  ship: Ship,
  gameData: GameData,
  isCatchUp: boolean
): EncounterResult;

// Individual pipeline stages (exported for testing)
function generateThreatLevel(currentKm: number, ship: Ship): number;
function attemptEvasion(
  ship: Ship,
  flight: FlightState
): { success: boolean; roll: number; chance: number };
function attemptNegotiation(ship: Ship): {
  success: boolean;
  negotiatorName: string;
  roll: number;
  chance: number;
};
function calculateDefenseScore(ship: Ship): number;
function determineCombatOutcome(
  defenseScore: number,
  pirateAttack: number,
  isCatchUp: boolean
): 'victory' | 'harassment' | 'boarding';

// Apply encounter effects (the only function that mutates state)
function applyEncounterOutcome(
  result: EncounterResult,
  ship: Ship,
  gameData: GameData
): void;

// Narrative log message generation
function getEncounterNarrative(result: EncounterResult, ship: Ship): string;
```

**Design decisions:**

- `resolveEncounter` is the main entry point — it creates an `EncounterResult` describing what happened
- `applyEncounterOutcome` is the only function that mutates game state — separation enables easy testing
- `isCatchUp` flag caps outcomes at harassment during fast-forward
- Random rolls use `Math.random()` internally but results are captured in `EncounterResult` for log/debug
- The narrative system picks random messages from arrays, with template substitution for crew names/costs

### 2.3 `src/__tests__/encounterSystem.test.ts`

Unit tests for detection module.

### 2.4 `src/__tests__/combatSystem.test.ts`

Unit tests for combat pipeline.

---

## 3. Modified Files

### 3.1 `src/models/index.ts`

**Add to `Ship` interface:**

```typescript
lastEncounterTime?: number; // gameTime of last encounter (cooldown)
```

**Add to `GameData` interface:**

```typescript
encounterStats?: {
  totalEncounters: number;
  evaded: number;
  negotiated: number;
  victories: number;
  harassments: number;
  boardings: number;
};
```

**Extend `LogEntryType` union:**

```typescript
| 'encounter_evaded'
| 'encounter_negotiated'
| 'encounter_victory'
| 'encounter_harassment'
| 'encounter_boarding'
```

**Add `EncounterResult` interface:**

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
  healthLost?: Record<string, number>;
  equipmentDegraded?: Record<string, number>;
  flightDelayAdded?: number;
  negotiatorName?: string;
}
```

No migration needed — `lastEncounterTime` and `encounterStats` are optional fields. Existing saves load fine without them. New log types are additive.

### 3.2 `src/gameTick.ts`

**Integration point in `applyShipTick()`:**

```
Existing flow:
1. Engine warmup
2. Flight physics (advanceFlight)
3. Fuel consumption
4. ─── INSERT ENCOUNTER CHECK HERE ───
5. Torch ship mechanics (radiation, heat, containment)
6. Flight completion check
7. Air filter degradation
8. Gravity exposure

New code:
4a. if (ship in flight && has flight state && not on cooldown)
4b.   chance = calculateEncounterChance(ship, gameData)
4c.   if (Math.random() < chance)
4d.     result = resolveEncounter(ship, gameData, isCatchUp=false)
4e.     applyEncounterOutcome(result, ship, gameData)
4f.     ship.lastEncounterTime = gameData.gameTime
4g.     log narrative entry
4h.     update encounterStats
```

**Why this position?**

- After flight physics: ship position/velocity must be current for accurate probability
- Before torch mechanics: boarding damage degrades equipment, which changes heat/radiation calcs this same tick (cascading interaction)
- Before flight completion: can't have encounters after arrival

**`applyTick` signature stays the same** — no new parameters. The `isCatchUp` flag is handled in `main.ts` (see below).

### 3.3 `src/main.ts`

**Modify `fastForwardTicks()`:**

- Before the fast-forward loop, create a `CatchUpReport` accumulator
- Pass a flag to mark ticks as catch-up (encounters capped at harassment)
- After loop, if encounters occurred, set `state.showCatchUpReport = true` and attach report

The cleanest approach: add a module-level or exported flag `isCatchUpMode` that `gameTick.ts` can check, or pass it through `applyTick()`. I prefer adding an optional parameter to `applyTick`:

```typescript
export function applyTick(
  gameData: GameData,
  isCatchUp: boolean = false
): boolean;
```

This keeps the interface minimal — only `fastForwardTicks` passes `true`.

**Modify state type** to include:

```typescript
showCatchUpReport?: boolean;
catchUpReport?: CatchUpReport;
```

### 3.4 `src/style.css`

Add CSS for:

- `.threat-badge` (4 levels: clear/caution/danger/critical)
- Encounter log entry border colors (5 types)
- `.catchup-report` modal
- `.regional-status` flight indicator
- Navigation marker threat coloring

All colors from existing palette — no new colors introduced.

### 3.5 UI Files

**`src/ui/workTab.ts`:**

- Add threat badge to quest cards (after fuel/time, before salary)
- Add threat badge to active flight status section

**`src/ui/navigationView.ts`:**

- Add threat badges to navigation legend per destination
- Add threat coloring to nav-marker-dot elements

**`src/ui/tabbedView.ts`:**

- Add regional status text to ship header during flight

**`src/ui/renderer.ts`:**

- Add catch-up report modal rendering (conditional on `showCatchUpReport`)
- Add callback for dismissing catch-up report

---

## 4. Data Flow

### 4.1 Per-Tick Encounter Detection

```
main.ts tick interval (1s)
  → applyTick(gameData)
    → for each ship: applyShipTick(gameData, ship)
      → [flight physics update]
      → calculateEncounterChance(ship, gameData)
        → getShipPositionKm(ship, world) — interpolate 1D position
        → calculatePositionDanger(posKm, world) — faction distances
        → calculateHeatSignature(engineDef, phase) — engine heat
        → calculateCrewSkillFactor(ship) — bridge astrogation
        → return BASE_RATE × positionDanger × heatSignature × crewSkill
      → if (Math.random() < chance):
        → resolveEncounter(ship, gameData, false)
          → generateThreatLevel(posKm, ship)
          → attemptEvasion(ship, flight)
          → if failed: attemptNegotiation(ship)
          → if failed: calculateDefenseScore(ship) vs pirateAttack
          → return EncounterResult
        → applyEncounterOutcome(result, ship, gameData)
          → mutate ship/gameData based on outcome type
        → add log entry
      → [torch mechanics continue — now with any encounter damage applied]
```

### 4.2 Fast-Forward Flow

```
main.ts page load
  → fastForwardTicks(gameData)
    → for i in 0..ticksToApply:
      → applyTick(gameData, isCatchUp=true)
        → encounter check runs but outcomes capped at harassment
        → accumulate results in CatchUpReport
    → if encounters occurred:
      → state.showCatchUpReport = true
      → state.catchUpReport = report
  → renderApp()
    → if showCatchUpReport: render catch-up modal
    → else: render normal game view
```

### 4.3 Route Risk Estimation (UI)

```
workTab.ts / navigationView.ts render
  → estimateRouteRisk(origin, dest, ship, world)
    → sample 20 points along route
    → for each point: calculatePositionDanger(km, world) × calculateHeatSignature(...)
    → average effective rate per tick
    → calculate cumulative probability: 1 - (1 - avgRate)^estimatedTicks
    → return cumulative risk (0..1)
  → getThreatLevel(risk) → 'clear' | 'caution' | 'danger' | 'critical'
  → render threat badge with appropriate color and narrative
```

---

## 5. Testing Strategy

### 5.1 Test Framework

Vitest (already installed), configured in `vite.config.ts` with global test APIs.

### 5.2 encounterSystem.test.ts

**Position danger tests:**

- Ship at Earth (0 km) → danger ≈ 0.1 (minimum)
- Ship at Mars (54.6M km) → danger ≈ 0.1 (near Alliance)
- Ship midway Earth-Mars (27.3M km) → danger = 5.0 (capped max)
- Ship at Freeport (1.2M km) → lawless bonus active
- Ship at The Scatter (2.5M km) → lawless bonus active + higher danger

**Heat signature tests:**

- Chemical engine (0 kW) burning → 1.0
- NTR stealth (10 kW) burning → 1.05
- Fusion Sunfire (150 kW) burning → 1.75
- Fusion Sunfire coasting → 1.075
- UNAS Colossus (800 kW) burning → 5.0

**Crew skill factor tests:**

- No crew on bridge → 1.0
- Skill 5 navigator → 0.714
- Skill 10 navigator → 0.556

**Cooldown tests:**

- Just had encounter → on cooldown
- Cooldown expired → not on cooldown
- No previous encounter → not on cooldown

**Route risk estimation tests:**

- Earth → Gateway → CLEAR
- Earth → Mars with fusion ship → CAUTION/DANGER
- Through Scatter region → DANGER/CRITICAL

**Threat level classification tests:**

- < 5% → 'clear'
- 10% → 'caution'
- 20% → 'danger'
- 35% → 'critical'

### 5.3 combatSystem.test.ts

**Threat generation tests:**

- Near Earth, light cargo → threat 1
- Mid-system, heavy cargo → threat 5-7
- Deep space, heavy cargo → threat 8-10
- Threat always clamped 1-10

**Evasion tests:**

- High velocity (50,000 m/s) + scanner + skill 10 → ~65% evasion
- Stationary + no scanner + skill 0 → 0% evasion
- Mid-range values → reasonable intermediate chance

**Negotiation tests:**

- Charisma 10 → 50% chance
- Charisma 0 → 0% chance
- Ransom scales with credits and threat level
- Minimum ransom of 50 credits

**Defense score tests:**

- Bare Station Keeper → ~0.5 (mass only)
- Corsair with PD + armory crew + rifles + deflector → ~45
- Leviathan with full combat crew → ~88

**Combat outcome tests:**

- defense >= attack × 1.5 → victory
- defense >= attack × 0.75 → harassment
- defense < attack × 0.75 → boarding
- Catch-up mode: boarding → downgraded to harassment

**Outcome application tests:**

- Victory: +2% PD degradation, bounty credits added
- Harassment: +5% PD degradation, crew health reduced, flight delayed
- Boarding: crew health reduced (armor mitigates), credits stolen, all equipment +10%
- Boarding with armored vest: damage reduced by 50%

**Narrative tests:**

- Each outcome type generates appropriate message
- Ship name included in log entries
- Crew names substituted in negotiation messages
- Credit amounts included where applicable

### 5.4 Test Utilities

Create `src/__tests__/testHelpers.ts` with factory functions:

```typescript
function createTestShip(overrides?: Partial<Ship>): Ship;
function createTestGameData(overrides?: Partial<GameData>): GameData;
function createTestFlight(overrides?: Partial<FlightState>): FlightState;
function createTestWorld(): World; // Uses real worldGen.generateWorld()
```

These ensure test ships have valid structure (rooms, crew, equipment) without boilerplate.

---

## 6. Performance Considerations

**Per-tick cost:** The encounter check adds ~5 function calls per in-flight ship per tick:

1. `isOnCooldown` — one comparison
2. `getShipPositionKm` — simple interpolation
3. `calculatePositionDanger` — iterates 8 locations (tiny)
4. `calculateHeatSignature` — one lookup + arithmetic
5. `calculateCrewSkillFactor` — iterates bridge crew (max ~3)

Total: negligible. No DOM access, no async, no heavy computation.

**Fast-forward cost:** Up to 1000 ticks × N ships. Same lightweight calculations. The existing fast-forward already processes flight physics and salary deductions per tick, so encounter checks add minimal overhead.

**UI cost:** `estimateRouteRisk` samples 20 points per route. For 8 locations, that's 160 position danger calculations during render. Each is trivial (iterate 8 locations). Not a concern.

---

## 7. Architecture Principles Preserved

1. **Emergent behavior:** All encounter inputs derive from existing game data — world positions, engine specs, crew skills, equipment condition. No new hardcoded stats.

2. **Central tick update:** Encounter check runs inside `applyShipTick()`, integrated into the single tick loop. No separate timers or parallel systems.

3. **Pure functions:** Detection and resolution functions are pure (deterministic given inputs + random seed). State mutation is isolated to `applyEncounterOutcome()`.

4. **Existing patterns:** New code follows established patterns — definition arrays, getter functions, per-ship processing, log entry creation.

5. **No migration needed:** All new model fields are optional. Existing saves work without modification.

---

## 8. Implementation Order

### Task #5: Core Encounter Detection (encounterSystem.ts)

- Implement all detection functions
- Implement route risk estimation for UI
- Implement threat level classification
- Add `lastEncounterTime` to Ship model
- Add `encounterStats` to GameData model
- Add encounter log types to model
- Full unit test suite
- Wire into gameTick.ts (detection only, no resolution yet — skip encounter if combat system not ready, or implement a minimal "always evade" placeholder)

### Task #6: Auto-Resolve Combat (combatSystem.ts)

- Implement full pipeline (evade → negotiate → combat → outcome)
- Implement outcome application (state mutations)
- Implement narrative generation
- Implement fast-forward severity cap
- Add CatchUpReport accumulation to main.ts fast-forward
- Full unit test suite
- Complete gameTick.ts integration

### Task #7: Encounter UI Components

- Threat badge component
- Quest card integration
- Navigation view threat coloring
- Ship header regional status
- Encounter log entry styling
- Catch-up report modal
- CSS additions
- Verify all UI uses "days" not "ticks"

---

**End of Technical Architecture**
