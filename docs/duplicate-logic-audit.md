# Duplicate Logic Audit

Comprehensive audit of duplicated logic patterns in the codebase that pose latent
bug risks. Each item describes the duplication, the divergence risk, and a
recommended consolidation approach.

---

## CRITICAL: Ship Dry Mass Calculation (3 inconsistent variants)

The "dry mass" of a ship (mass excluding fuel) is computed inline in **10+
locations** across 4 files, with **three different formulas**:

### Variant A: Hull only (missing crew AND cargo)

| File | Line | Context |
|------|------|---------|
| `flightPhysics.ts` | 68 | `getCurrentShipMass()` uses `const dryMass = shipClass.mass` then adds crew/cargo separately |

This one isn't actually wrong in context since crew/cargo are added later in the
same function, but the intermediate `dryMass` local variable name is misleading
and differs from how `dryMass` is used elsewhere.

### Variant B: Hull + crew, **missing cargo** (WRONG for fuel calculations)

| File | Line | Context |
|------|------|---------|
| `flightPhysics.ts` | 343 | `initializeFlight()` — `shipClass.mass + ship.crew.length * 80` |
| `questGen.ts` | 149 | `calculatePayment()` — same formula |
| `fleetAnalytics.ts` | 239 | fuel summary display |
| `fleetAnalytics.ts` | 302 | contract match scoring |
| `fleetAnalytics.ts` | 377 | profit estimation |

### Variant C: Hull + crew + cargo (CORRECT)

| File | Line | Context |
|------|------|---------|
| `flightPhysics.ts` | 259-262 | `calculateOneLegFuelKg()` |
| `questGen.ts` | 51-54 | `calculateTripFuelKg()` |

### Impact

`initializeFlight()` (Variant B) plans the actual burn/coast/burn profile using
a dry mass that **excludes cargo weight**. Meanwhile `calculateOneLegFuelKg()`
(Variant C) estimates fuel for the same trip **including cargo**. This means:

- Trip time planning underestimates the ship's inertia (lighter dry mass =
  higher acceleration = shorter trip).
- Fuel estimation accounts for cargo but the flight plan doesn't.
- The two can diverge further as cargo grows.

All `fleetAnalytics.ts` instances (Variant B) undercount mass for profit/fuel
estimates displayed to the player.

### Recommendation

Extract a single `calculateDryMass(ship: Ship): number` function in
`flightPhysics.ts` that includes hull + crew + cargo. All call sites should
import and use it.

---

## CRITICAL: Fuel Price Inconsistency (2.0 vs 0.5 cr/kg)

| File | Line | Value | Usage |
|------|------|-------|-------|
| `questGen.ts` | 22 | `FUEL_PRICE_PER_KG = 2.0` | Quest payment cost floor calculation |
| `questGen.ts` | 158, 596 | `fuelKgRequired * 2 * FUEL_PRICE_PER_KG` | Round-trip fuel cost for quest economics |
| `fleetAnalytics.ts` | 385 | `fuelNeededKg * 0.5` | Profit estimation in fleet analytics UI |

The fleet analytics UI displays estimated profit to the player using **0.5 cr/kg**
(4x cheaper than the actual 2.0 cr/kg used in quest generation). This makes every
contract look more profitable than it actually is.

Meanwhile, actual refueling uses the location-aware `getFuelPricePerKg()` from
`refuelDialog.ts` which returns 1.6-5.0 cr/kg depending on location. Neither
constant matches the real price.

### Recommendation

All fuel cost estimates should use `getFuelPricePerKg()` or at minimum a shared
constant. The fleet analytics hardcoded `0.5` must be fixed immediately.

---

## CRITICAL: `calculateFuelCost()` Stub Still in Use

`flightPhysics.ts:296-307` contains a function explicitly marked as a temporary
stub:

```typescript
// TEMPORARY STUB: Calculate fuel cost for a trip
// TODO: Replace with proper implementation using Tsiolkovsky equation
export function calculateFuelCost(distanceKm, maxRangeKm): number {
  return fraction * 25200; // Linear approximation of fuel usage
}
```

This linear approximation is used by:

| File | Line | Context |
|------|------|---------|
| `ui/navigationView.ts` | 217 | Fuel cost display on navigation chart |
| `ui/fleetTab.ts` | 359 | Reachability check in fleet tab |

Meanwhile, all game logic uses `calculateTripFuelKg()` or
`calculateOneLegFuelKg()` which use proper Tsiolkovsky physics. The navigation
and fleet UIs show fundamentally different fuel numbers than the game actually
consumes.

### Recommendation

Delete `calculateFuelCost()` and update `navigationView.ts` and `fleetTab.ts` to
use `calculateTripFuelKg()` or `calculateOneLegFuelKg()`.

---

## HIGH: Radiation Shielding Effectiveness (3x duplication)

Identical loop computing `1 - eq.degradation / 200` for radiation shielding:

| File | Line | Context |
|------|------|---------|
| `gameTick.ts` | 227-234 | Actual game logic (radiation damage) |
| `ui/sidebars.ts` | 528-535 | Sidebar display |
| `ui/shipTab.ts` | 432-438 | Ship tab display |

If the degradation formula changes (e.g., `/200` becomes `/150`), the game logic
and two UI locations must all be updated in lockstep.

### Recommendation

Extract `getEffectiveRadiationShielding(ship: Ship): number` to a shared module
(e.g., `equipment.ts` or a new `shipSystems.ts`).

---

## HIGH: Heat Dissipation Effectiveness (3x duplication)

Same pattern as radiation shielding — identical loop with `1 - eq.degradation / 200`:

| File | Line | Context |
|------|------|---------|
| `gameTick.ts` | 261-268 | Actual game logic (heat damage) |
| `ui/sidebars.ts` | 560-566 | Sidebar display |
| `ui/shipTab.ts` | 471-477 | Ship tab display |

### Recommendation

Extract `getEffectiveHeatDissipation(ship: Ship): number` alongside the radiation
function.

---

## HIGH: Trip Time Estimation vs Flight Initialization (missing guards)

`estimateTripTime()` in `questGen.ts:235-273` and `initializeFlight()` in
`flightPhysics.ts:317-413` implement the same burn-coast-burn physics but with
different edge-case handling:

| Guard | `initializeFlight()` | `estimateTripTime()` |
|-------|---------------------|---------------------|
| Zero thrust/fuel | Returns `GAME_SECONDS_PER_TICK` (line 374) | No guard |
| Negative coast distance | `Math.max(0, ...)` (line 384) | No guard |
| Zero cruise velocity | `v_cruise > 0 ? ... : 0` (line 385) | No guard |
| NaN/Infinity sanity | Explicit check (line 392) | No guard |

Also, `estimateTripTime()` uses `shipClass.mass` as the acceleration base
(line 246), while `initializeFlight()` uses `getCurrentShipMass(ship)` which
includes fuel, cargo, and crew (line 338). This means time estimates shown on
quest cards are calculated with a **lighter ship** than the actual flight plan,
making trips appear shorter than they are.

### Recommendation

Have `estimateTripTime()` delegate to or share a common helper with
`initializeFlight()`. At minimum, add the same edge-case guards and use the same
mass basis.

---

## HIGH: Crew Salary Calculation (6+ locations)

The pattern "sum of `getCrewRoleDefinition(crew.role).salary`" appears in:

| File | Line | Context |
|------|------|---------|
| `gameTick.ts` | 81-88 | Actual salary deduction |
| `questGen.ts` | 135-138 | Quest payment calculation |
| `questGen.ts` | 588-591 | Contract validation |
| `fleetAnalytics.ts` | 392-395 | Profit estimation |
| `ui/workTab.ts` | 325-330 | Work tab display |
| `ui/sidebars.ts` | 403-408 | Sidebar display |
| `ui/tabbedView.ts` | 403-408 | Tab bar display |

### Recommendation

Extract `calculateShipSalaryPerTick(ship: Ship): number` to `crewRoles.ts` or a
shared helper module.

---

## HIGH: Magic Number `80` (crew mass) — 10+ locations

The value `80` (kg per crew member) appears hardcoded in:

- `flightPhysics.ts` lines 78, 261, 343
- `questGen.ts` lines 53, 149
- `fleetAnalytics.ts` lines 239, 302, 377
- Test files: `fuelPhysics.test.ts:108`, `flightPhysics.test.ts:93,171`

### Recommendation

Define `const CREW_MASS_KG = 80` in `flightPhysics.ts` (or `models/index.ts`)
and export it. Tests should import the constant rather than hardcoding it.

---

## HIGH: Magic Number `10` (cargo item mass) — 3 locations

The value `10` (kg per cargo item) appears in:

| File | Line |
|------|------|
| `flightPhysics.ts` | 74 (with comment "will be refined later") |
| `flightPhysics.ts` | 262 |
| `questGen.ts` | 54 |

Note: `ui/shipTab.ts:838` uses `* 100` for cargo display, which is a separate
bug (10x the actual weight used in physics).

### Recommendation

Define `const CARGO_ITEM_MASS_KG = 10` as a shared constant. Fix the `* 100` in
`shipTab.ts` to use the same constant.

---

## HIGH: "Best Piloting Skill" Pattern (4 locations)

The pattern of finding the highest piloting skill among a crew subset is
copy-pasted across:

| File | Line | Crew Subset |
|------|------|-------------|
| `encounterSystem.ts` | 161-166 | `relevantCrew` (bridge crew) |
| `worldGen.ts` | 123-128 | All ship crew |
| `combatSystem.ts` | 167-170 | Bridge crew (scanner + helm) |
| `combatSystem.ts` | 191-197 | Comms crew |

### Recommendation

Extract `getBestSkill(crew: CrewMember[], skillId: SkillId): number` to a shared
helper in `crewRoles.ts`.

---

## MEDIUM: Repair Points Calculation (2 locations)

The formula `crew.skills.piloting * 0.05` for repair points appears in:

| File | Line | Context |
|------|------|---------|
| `gameTick.ts` | 445 | Actual repair logic |
| `ui/shipTab.ts` | 1062 | Repair rate display |

This also seems like a potential design bug — repair points are based on
**piloting** skill rather than a dedicated engineering/repair skill.

### Recommendation

Extract a `calculateRepairPointsPerTick(crew: CrewMember): number` function.

---

## MEDIUM: `FUEL_FRACTION = 0.7` (2 locations in same file)

| File | Line | Function |
|------|------|----------|
| `flightPhysics.ts` | 42 | `calculateFuelTankCapacity()` |
| `flightPhysics.ts` | 55 | `calculateAvailableCargoCapacity()` |

Both functions define `const FUEL_FRACTION = 0.7` locally. If one is changed
without the other, fuel tank + cargo capacity won't sum to 100%.

### Recommendation

Define `FUEL_FRACTION` once at module scope and share it between both functions.

---

## MEDIUM: Equipment Degradation Divisors (/200 vs /100)

Two different degradation-to-effectiveness formulas are used:

| Formula | Used For | Files |
|---------|----------|-------|
| `1 - degradation / 200` | Radiation shielding, heat dissipation, point defense, deflectors | gameTick.ts, sidebars.ts, shipTab.ts, combatSystem.ts |
| `1 - degradation / 100` | Oxygen generation (air filtration) | lifeSupportSystem.ts |

This may be intentional (oxygen equipment is more sensitive) but it's not
documented. If someone "fixes" the inconsistency, they may break the intended
balance.

### Recommendation

Document the intentional difference. Better yet, add an `effectivenessDivisor`
property to equipment definitions so the formula is data-driven rather than
hardcoded per call site.

---

## MEDIUM: Inline Fuel Calculation in `fleetAnalytics.ts` (duplicated 3x within one file)

The brachistochrone delta-v + fuel mass calculation block:

```typescript
const distanceMeters = dist * 1000;
const currentMass = getCurrentShipMass(ship);
const acceleration = thrust / currentMass;
const requiredDeltaV = 2 * Math.sqrt(distanceMeters * acceleration);
const dryMass = shipClass.mass + ship.crew.length * 80;
const fuelNeededKg = calculateFuelMassRequired(dryMass, requiredDeltaV, specificImpulse);
```

appears at lines 234-245, 297-308, and 372-383 of `fleetAnalytics.ts`. This is
essentially a copy of `calculateOneLegFuelKg()` from `flightPhysics.ts` but:

1. Uses Variant B dry mass (no cargo)
2. Doesn't account for burn fraction
3. Doesn't cap to `engineDef.maxDeltaV`

### Recommendation

Replace all three with calls to `calculateOneLegFuelKg()`.

---

## LOW: Quest Crew Skill Bonus (3 near-identical loops)

In `questGen.ts:200-215`, three loops iterate over different job types with the
same `Math.max(0, crew.skills.piloting - 50) * factor` pattern. This isn't
dangerous but is unnecessarily verbose.

---

## Summary Prioritization

| Priority | Issue | Risk if not fixed |
|----------|-------|-------------------|
| CRITICAL | Dry mass inconsistency (3 variants) | Wrong fuel/time calculations in different contexts |
| CRITICAL | Fuel price 0.5 vs 2.0 cr/kg | Fleet analytics shows 4x wrong profit estimates |
| CRITICAL | `calculateFuelCost()` stub in use | Nav/fleet UI shows fundamentally wrong fuel numbers |
| HIGH | Radiation/heat effectiveness 3x | UI and game logic diverge on formula change |
| HIGH | Trip time missing guards | Potential NaN/negative times in quest estimation |
| HIGH | Trip time mass basis mismatch | Quest cards show shorter trips than reality |
| HIGH | Salary calc 6+ locations | Any salary formula change must update 6+ files |
| HIGH | Magic numbers 80, 10 | 13+ locations to update on any mass model change |
| HIGH | Best-piloting pattern 4x | Subtle bugs if crew subset logic diverges |
| MEDIUM | Repair points 2x | UI shows wrong rate if formula changes |
| MEDIUM | FUEL_FRACTION 2x | Fuel + cargo won't sum to 100% if one changes |
| MEDIUM | fleetAnalytics inline fuel calc 3x | Already diverged from canonical implementation |
