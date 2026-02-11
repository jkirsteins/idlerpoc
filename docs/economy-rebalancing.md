# Economy Rebalancing Design

## Problem Statement

The current quest payment system produces unprofitable or barely-profitable quests for most routes. Players lose money on short-haul routes and gamble on medium routes. The economy fails to create the intended pressure loop of "accept contracts → fly → earn → upgrade."

## Root Cause Analysis

### 1. Payment formula disconnected from actual costs

The `calculatePayment()` function uses three fixed distance tiers with random base values, then applies a `log2` time multiplier. This creates several failures:

**Distance tiers too coarse (3 tiers, arbitrary thresholds):**

- `< 1,000 km`: 50–200 cr base
- `1,000–500,000 km`: 200–2,000 cr base
- `> 500,000 km`: 2,000–10,000 cr base

A 1,000 km trip and a 384,000 km trip fall in the same tier despite wildly different crew costs.

**Time multiplier scales too slowly:**
The `1 + log2(tripTicks / 10)` formula yields ~7x for a 1000-tick trip and ~10x for an 8000-tick trip. A trip that takes 8x longer only pays ~1.4x more after the multiplier. Meanwhile crew salaries scale linearly with time.

**Concrete examples (Station Keeper starting ship):**
| Route | Distance | Round-Trip Ticks | Salary Cost | Payment Range | Profit |
|-------|----------|-----------------|-------------|---------------|--------|
| Earth→Gateway | 400 km | 1,191 | 2,978 cr | 431–1,724 cr | **-1,254 to -2,547** |
| Earth→Meridian | 20,000 km | 1,191 | 2,979 cr | 1,724–17,241 cr | -1,292 to +14,225 |

**Wayfarer (Class II):**
| Route | Distance | Round-Trip Ticks | Salary Cost | Payment Range | Profit |
|-------|----------|-----------------|-------------|---------------|--------|
| Earth→Forge | 384,400 km | 7,725 | 23,176 cr | 2,398–23,984 cr | **-20,783 to +803** |
| Earth→Freeport | 1,200,000 km | 7,732 | 23,195 cr | 23,987–119,933 cr | +774 to +96,720 |

### 2. Short-haul routes are always net losses

The Station Keeper's 400km Earth→Gateway route takes ~1,191 ticks round-trip because the chemical engine accelerates at only 0.03 m/s². The trip is _physically slow_, but the distance tier pays as if it were a quick hop. Crew salary during those 1,191 ticks (2,978 cr) always exceeds the maximum possible payment (1,724 cr).

### 3. High payment variance on medium routes

A Wayfarer running Earth→Forge earns 2,398–23,984 credits for costs of 23,176. Only the top ~4% of random rolls produce profit. This feels like gambling, not trading.

## Proposed Solution: Cost-Based Payment Floor

Replace the distance-tier system with a payment formula that guarantees minimum profitability while preserving variance for upside.

### New Payment Formula

```
payment = max(costFloor, distanceBasedPayment) * questTypeMultiplier

where:
  crewCostEstimate = estimatedRoundTripTicks * shipCrewSalaryPerTick
  fuelCostEstimate = estimatedRoundTripFuelPercent * 5
  totalCostEstimate = crewCostEstimate + fuelCostEstimate

  costFloor = totalCostEstimate * (1.3 + random(0, 0.7))
    → guarantees 130%–200% of operating costs

  distanceBasedPayment = calculateDistancePayment(distanceKm, cargoKg)
    → the old system, retained for long/lucrative routes
```

### Why this works

1. **Short routes become viable:** Even a 400km trip pays at least 130% of crew + fuel costs. The profit margin is thin but positive, rewarding efficient play.

2. **Medium routes are reliable:** Instead of 96% chance of loss, every contract is profitable. Variance comes from the 1.3–2.0x range rather than from the base payment range.

3. **Long routes remain lucrative:** For long-distance routes, the distance-based payment naturally exceeds the cost floor, preserving the big-haul reward.

4. **Emergent from systems:** Payment scales with _actual trip costs_ derived from ship physics (trip time from engine/mass), crew composition (salaries), and fuel economy. No hardcoded values per ship class.

### Implementation: New `calculatePayment` Function

```typescript
function calculatePayment(
  ship: Ship,
  distanceKm: number,
  cargoKg: number = 0
): number {
  // 1. Estimate operating costs for round trip
  const tripTimeSecs = estimateTripTime(ship, distanceKm);
  const roundTripTicks = (tripTimeSecs * 2) / GAME_SECONDS_PER_TICK;

  const crewSalaryPerTick = ship.crew.reduce((sum, c) => {
    const roleDef = getCrewRoleDefinition(c.role);
    return sum + (roleDef?.salary ?? 0);
  }, 0);

  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = shipClass ? computeMaxRange(shipClass, engineDef) : 1;
  const fuelCostPercent = calculateFuelCost(distanceKm, maxRangeKm);

  const crewCost = crewSalaryPerTick * roundTripTicks;
  const fuelCost = fuelCostPercent * 2 * 5; // Round trip, 5 cr per %
  const totalCost = crewCost + fuelCost;

  // 2. Cost floor: 130-200% of operating costs
  const costFloor = totalCost * (1.3 + Math.random() * 0.7);

  // 3. Cargo premium (same as before)
  let cargoPremium = 1;
  if (cargoKg > 0) {
    cargoPremium = 1 + (cargoKg / 10000) * 0.5;
  }

  // 4. Distance-based bonus for long hauls (replaces old tiers)
  //    This rewards seeking out distant, harder routes
  let distanceBonus = 0;
  if (distanceKm > 500000) {
    distanceBonus = totalCost * (distanceKm / 1000000) * 0.5;
  }

  const payment = (costFloor + distanceBonus) * cargoPremium;

  return Math.round(payment);
}
```

### Quest Type Multipliers (active vs passive balancing)

See `docs/quest-reward-balancing.md` for the full design rationale.

| Quest Type       | Multiplier      | Rationale                                                     |
| ---------------- | --------------- | ------------------------------------------------------------- |
| Passenger        | 2.0x            | Highest active premium: tightest deadline (3d), quarters req. |
| Delivery         | 1.5x            | High active premium: one-shot, 7d expiry                      |
| Supply           | 2.5x total      | High commitment: large bulk contract, 30d expiry, lump sum    |
| Freight          | 1.2x per trip   | Semi-active: multi-trip with 14d deadline                     |
| Standing Freight | 0.6x per trip   | Passive: infinite, automatable — modest but always profitable |
| Trade Route      | 120% cost floor | Baseline passive income: permanent, deterministic, automated  |

### Expected Outcomes

**Station Keeper, Earth→Gateway (400km):**

- Operating cost: ~2,979 cr
- New payment: 3,873–5,958 cr (was 431–1,724)
- Profit: +894 to +2,979 cr (thin but positive)

**Wayfarer, Earth→Forge (384,400km):**

- Operating cost: ~23,181 cr
- New payment: 30,135–46,362 cr (was 2,398–23,984)
- Profit: +6,954 to +23,181 cr (reliable)

**Wayfarer, Earth→Freeport (1,200,000km):**

- Operating cost: ~23,213 cr
- New payment: 30,177–57,746 cr (was 23,987–119,933)
- Note: The distance bonus kicks in, preserving lucrative long-haul incentive

### Crew Skill Integration (Future)

The cost-based formula naturally supports crew skill bonuses:

- A **skilled navigator** reduces trip time → lowers cost floor → increases profit margin at same payment
- A **skilled engineer** could improve fuel efficiency → same effect
- This creates a virtuous cycle where investing in crew skills increases profitability

### No Changes Required To

- Crew salary rates (already well-balanced relative to roles)
- Fuel pricing (simple, predictable)
- Ship unlock thresholds (dependent on lifetime earnings, which will increase naturally with profitable quests)
- Quest types and variety
- Contract execution mechanics

## Migration

Per CLAUDE.md: no migration code. Reset game state on incompatible changes.
