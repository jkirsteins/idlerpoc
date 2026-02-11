# Fuel/Cargo Trade-off System Design

## Executive Summary

This document defines the fuel/cargo capacity allocation system for mass-based realistic fuel consumption. The design ensures:

1. **Physical realism** - Fuel and cargo compete for the same mass budget (per WORLDRULES.md)
2. **Emergent gameplay** - Ship range and cargo capacity emerge from player decisions
3. **Strategic depth** - Players must balance fuel reserves vs cargo profits
4. **Progressive complexity** - Simple for beginners, strategically rich for advanced players

## Core Principle: Shared Capacity Pool

**Fuel and cargo share the same mass capacity pool.** Every kg of cargo reduces fuel capacity by 1 kg, and vice versa.

```
Total Capacity = Fuel Mass + Cargo Mass + Crew Mass
```

This creates the fundamental trade-off: carrying more cargo means shorter range OR more frequent refueling.

## Ship Capacity Specifications

### Capacity Allocation by Ship Class

Each ship has a **total capacity** derived from its `cargoCapacity` field (already defined in `shipClasses.ts`):

| Ship Class         | Total Capacity | Suggested Default Split     | Notes                    |
| ------------------ | -------------- | --------------------------- | ------------------------ |
| Station Keeper (I) | 5,000 kg       | 3,500 fuel / 1,500 cargo    | Short-range shuttle      |
| Wayfarer (II)      | 40,000 kg      | 28,000 fuel / 12,000 cargo  | Inner system trader      |
| Corsair (II)       | 60,000 kg      | 40,000 fuel / 20,000 cargo  | Combat-capable freighter |
| Dreadnought (II)   | 80,000 kg      | 50,000 fuel / 30,000 cargo  | Military surplus         |
| Phantom (II)       | 30,000 kg      | 21,000 fuel / 9,000 cargo   | Stealth courier          |
| Firebrand (III)    | 100,000 kg     | 70,000 fuel / 30,000 cargo  | Entry torch ship         |
| Leviathan (III)    | 200,000 kg     | 140,000 fuel / 60,000 cargo | Deep system hauler       |

### Capacity vs Fuel Requirements

From `/Users/janiskirsteins/Downloads/fuel_analysis.md`, realistic fuel needs are:

| Trip            | Distance  | Fuel Mass Required |
| --------------- | --------- | ------------------ |
| Gateway Station | 400 km    | ~10,000 kg         |
| Meridian Depot  | 20,000 km | ~80,000 kg         |
| Mars            | 54.6M km  | ~600,000 kg        |

**Key insight**: Even the Wayfarer (40,000 kg total) cannot reach Meridian with a full tank (28,000 kg default). This creates strategic pressure.

## Configuration System Design

### Option 1: Fixed Ratios (RECOMMENDED for MVP)

**Description**: Each ship has a predefined fuel/cargo split that cannot be changed.

**Advantages**:

- Simple to understand and implement
- No UI needed for allocation
- Easy to balance per ship class
- Clear ship identity (e.g., "combat ships have more fuel, traders have more cargo")

**Disadvantages**:

- Less player agency
- Cannot adapt to specific missions

**Implementation**:

```typescript
interface ShipClass {
  // ... existing fields
  maxFuelKg: number; // Maximum fuel tank capacity (kg)
  maxCargoKg: number; // Maximum cargo hold capacity (kg)
  // cargoCapacity remains as total capacity for reference
}
```

**Suggested Ratios**:

- **Class I (Chemical)**: 70% fuel, 30% cargo (fuel-limited by design)
- **Class II (Fission NTR)**: 60-70% fuel, 30-40% cargo (balanced trading)
- **Class III (Fusion)**: 70% fuel, 30% cargo (fuel-hungry torch ships)
- **Combat variants**: +10% fuel (Corsair, Dreadnought, Phantom)
- **Cargo variants**: +10% cargo (when added later)

### Option 2: Manual Allocation (Future Enhancement)

**Description**: Players manually allocate capacity between fuel and cargo before each departure.

**Advantages**:

- Maximum player agency
- Adapt to mission requirements
- Emergent min/maxing strategies

**Disadvantages**:

- UI complexity (slider, validation, presets)
- Potential confusion for new players
- Balance testing required

**When to implement**: After MVP proves the core system works. Add to BACKLOG.md.

**UI Concept** (deferred):

```
┌─ Fuel/Cargo Allocation ─────────────────┐
│                                          │
│  Fuel: [████████████░░░░] 28,000 kg     │
│  Cargo: [░░░░████████████] 12,000 kg    │
│  Total: 40,000 kg                        │
│                                          │
│  [Save as Preset]  [Reset to Default]   │
└──────────────────────────────────────────┘
```

### Option 3: Modular Tank System (Far Future)

**Description**: Purchase/install different fuel tank modules that trade capacity permanently.

**Example**:

- Extended Range Tank: +20,000 kg fuel, -20,000 kg cargo, costs 500,000 cr
- Cargo Maximizer Module: +15,000 kg cargo, -15,000 kg fuel, costs 300,000 cr

**When to implement**: Only if equipment installation UI is added (currently in BACKLOG.md). Would require shop system, installation mechanics, and deep economic rebalancing.

## Fuel Tank Sizing Rationale

### Design Constraints from WORLDRULES.md

From WORLDRULES.md lines 118-146:

> **Reaction Mass Ratio**: 3:1 (3 kg propellant per 1 kg payload for typical mission)

For the Wayfarer (200,000 kg dry mass), a "typical mission" would need 600,000 kg fuel for 3:1 ratio. This is **15x the total cargo capacity** (40,000 kg).

**Conclusion**: Full 3:1 ratio is not achievable within ship capacity. This is intentional - it creates range pressure and fueling strategy.

### Realistic Tank Sizing

Ships should be able to:

1. **Complete short-haul routes with margin** (Gateway, Meridian)
2. **Reach medium-range stations with partial cargo** (Forge, Freeport)
3. **Require strategic refueling for long-range routes** (Mars, Outer System)

**Wayfarer example**:

- Max fuel: 28,000 kg (70% of 40,000 kg)
- Gateway trip (10,000 kg) → 3 round trips per tank, safe
- Meridian trip (80,000 kg) → **Cannot reach**, must refuel at Gateway first
- Mars trip (600,000 kg) → **Impossible** in one tank, requires Class III ship

This creates **emergent route planning** - players must choose refueling stops based on ship capabilities.

### Fuel Reserves and Safety Margins

**Design question**: Should fuel tanks have a "reserve" buffer?

**Recommendation**: No explicit reserve system for MVP. Players naturally leave margin. Future enhancement could add:

- Warning when fuel < 20% of route requirement
- "Reserve fuel" toggle that prevents undocking if fuel below threshold
- Add to BACKLOG.md if requested

## Refueling Pricing Design

### Price Structure

**Base fuel cost per kg**: Derived from hydrogen market price and fission fuel costs.

**Suggested base prices**:

- **Liquid Hydrogen (LH2)**: 2 cr/kg (for fission NTR engines)
  - Rationale: Cheap bulk propellant, available everywhere
- **Deuterium (D)**: 20 cr/kg (for fusion engines)
  - Rationale: 10x rarer, requires isotope separation
- **Helium-3 (He3)**: 200 cr/kg (for advanced fusion, not yet implemented)
  - Rationale: Extremely rare, mined from lunar regolith or gas giants

### Location Multipliers

Refueling costs vary by location based on:

1. **Infrastructure** - Does the station produce fuel locally?
2. **Supply chains** - How far from major production centers?
3. **Economic power** - Wealthy stations subsidize fuel for trade

| Location        | Fuel Type | Multiplier | Final Cost/kg (LH2) | Notes                        |
| --------------- | --------- | ---------- | ------------------- | ---------------------------- |
| Earth           | All       | 0.8x       | 1.6 cr/kg           | Major production hub         |
| Gateway Station | All       | 1.0x       | 2.0 cr/kg           | Standard orbital station     |
| Forge Station   | All       | 1.2x       | 2.4 cr/kg           | Industrial but remote        |
| Mars            | All       | 0.9x       | 1.8 cr/kg           | Local water ice → hydrogen   |
| Freeport        | All       | 1.5x       | 3.0 cr/kg           | Independent, far from supply |
| Belt Stations   | All       | 1.8x       | 3.6 cr/kg           | Remote, expensive logistics  |
| Outer System    | All       | 2.5x       | 5.0 cr/kg           | Extremely remote             |

### Refueling Cost Examples

**Wayfarer with 28,000 kg tank capacity**:

| Location | Full Tank Cost (LH2) | Cost as % of Tank Value |
| -------- | -------------------- | ----------------------- |
| Earth    | 44,800 cr            | ~0.5% of ship price     |
| Gateway  | 56,000 cr            | Reference standard      |
| Freeport | 84,000 cr            | 1.5x premium            |

**Impact on economics**:

- Gateway round trip (~10,000 kg fuel) costs 20,000 cr
- Quest pays 30,000-46,000 cr (from economy-rebalancing.md)
- **Profit after fuel**: 10,000-26,000 cr
- Still profitable even with realistic fuel costs

### Partial Refueling

**UI Design**:

```
┌─ Refuel at Gateway Station ─────────────┐
│  Current Fuel: 12,450 kg / 28,000 kg    │
│  Available Space: 15,550 kg             │
│                                          │
│  Fuel Type: Liquid Hydrogen (LH2)       │
│  Price: 2.0 cr/kg                        │
│                                          │
│  Amount: [████████░░░░] 10,000 kg       │
│  Cost: 20,000 cr                         │
│                                          │
│  New Total: 22,450 kg (80% of max)      │
│                                          │
│  [Refuel]  [Fill Tank (31,100 cr)]     │
└──────────────────────────────────────────┘
```

**Implementation**:

- Slider allows any amount from 0 to (maxFuelKg - currentFuelKg)
- "Fill Tank" button is shortcut for max
- Cost calculated in real-time as slider moves
- Validate ship has enough credits before allowing refuel

## Integration with Quest Economics

### Quest Payment Adjustments

From `docs/economy-rebalancing.md`, the current payment system already uses cost-based floors:

```typescript
const fuelCost = fuelCostPercent * 2 * 5; // Round trip, 5 cr per fuel %
```

**Required change for kg-based fuel**:

```typescript
const fuelCostKg = calculateFuelCostKg(distanceKm, ship);
const fuelPrice = getLocationFuelPrice(currentLocation);
const fuelCost = fuelCostKg * 2 * fuelPrice; // Round trip at current location price
```

**Impact**: Quest payments automatically scale with realistic fuel costs. The 130-200% cost floor ensures profitability.

### Example Quest Economics (Wayfarer)

**Earth → Gateway (400 km)**:

- Fuel required: 10,000 kg
- Fuel cost (Earth): 10,000 × 1.6 = 16,000 cr
- Round trip fuel: 32,000 cr
- Crew cost: 2,979 cr (from economy-rebalancing.md)
- **Total cost**: 34,979 cr
- **Quest payment** (130-200% floor): 45,473 - 69,958 cr
- **Profit**: 10,494 - 34,979 cr ✓ Profitable

**Earth → Meridian (20,000 km)** - IMPOSSIBLE with full tank:

- Fuel required: 80,000 kg
- Wayfarer max fuel: 28,000 kg
- **Player must**: Refuel at Gateway (mid-route), or carry less cargo to fit more fuel

This creates **emergent gameplay** - players must plan refueling stops for long routes.

### Quest Reward Scaling

**Do quest rewards need 2-5x increases?**

**Answer: NO** - The cost-based floor system already accounts for fuel costs. If fuel costs increase (kg-based), the floor increases proportionally. No manual quest rebalancing needed.

**Note**: Trade routes use a 120% cost floor, so they track fuel cost changes automatically. See `docs/quest-reward-balancing.md` for the active vs passive income design.

## Crew Mass Accounting

From WORLDRULES.md lines 390-395:

> **Crew count** → consumption rate (30 kg/crew/day base)

**Design decision**: Should crew body mass (~80 kg per person) reduce capacity?

**Recommendation**: YES, but separate from cargo capacity.

```typescript
function getCurrentShipMass(ship: Ship): number {
  const dryMass = shipClass.mass;
  const fuelMass = ship.fuelKg;
  const cargoMass = ship.cargo.reduce((sum, item) => sum + item.mass, 0);
  const crewMass = ship.crew.length * 80; // ~80kg per crew member
  return dryMass + fuelMass + cargoMass + crewMass;
}
```

**Capacity model**:

- **Fuel capacity**: `maxFuelKg` (fixed per ship)
- **Cargo capacity**: `maxCargoKg` (fixed per ship)
- **Crew mass**: Does NOT reduce fuel/cargo capacity (separate life support)
- **Total mass**: Used for physics calculations (acceleration, delta-v)

**Rationale**: Crew live in quarters, not cargo hold. Crew mass affects ship physics but not cargo economics.

## UI/UX Requirements

### Ship Tab - Fuel Display

Replace percentage display with kg display:

```
Before:
Fuel: ████████████░░░ 75%

After:
Fuel: ████████████░░░ 21,000 / 28,000 kg (75%)
```

### Navigation Chart - Range Circles

Update range calculation to use current fuel mass:

```typescript
function computeCurrentRange(ship: Ship): number {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const shipClass = getShipClass(ship.classId);

  const dryMass =
    shipClass.mass + getCurrentCargoMass(ship) + ship.crew.length * 80;
  const wetMass = dryMass + ship.fuelKg;

  const massRatio = wetMass / dryMass;
  const deltaV = engineDef.specificImpulse * 9.81 * Math.log(massRatio);

  // Convert delta-v to range using burn-coast-burn profile
  return calculateRangeFromDeltaV(deltaV, engineDef, shipClass);
}
```

Range circle dynamically shrinks as fuel is consumed during flight.

### Refuel UI (New)

When docked at stations with 'refuel' service (all current stations):

1. **Refuel button** in station services menu
2. **Refuel modal** with:
   - Current fuel / max fuel display
   - Fuel type and price per kg
   - Amount slider (0 to available space)
   - Total cost display
   - "Fill Tank" shortcut button
3. **Validation**: Cannot refuel beyond max capacity, cannot refuel without credits

### Pre-Departure Warnings

Before undocking, check fuel vs route requirement:

```
┌─ Insufficient Fuel Warning ────────────┐
│  ⚠️ Low fuel for selected destination   │
│                                          │
│  Required: ~10,000 kg                   │
│  Current: 8,500 kg                      │
│  Shortage: 1,500 kg                     │
│                                          │
│  You may run out of fuel mid-flight.    │
│                                          │
│  [Refuel] [Undock Anyway] [Cancel]     │
└──────────────────────────────────────────┘
```

## Implementation Checklist

### Phase 1: Data Model (Depends on task #3)

- [ ] Add `fuelKg` and `maxFuelKg` to Ship model
- [ ] Add `maxFuelKg` and `maxCargoKg` to ShipClass definitions
- [ ] Update ship initialization to set fuel in kg
- [ ] Update `getCurrentShipMass()` to include crew mass

### Phase 2: Physics Integration (Depends on task #2)

- [ ] Update fuel consumption to deduct kg, not percentages
- [ ] Update `computeCurrentRange()` to use Tsiolkovsky equation with current fuel mass
- [ ] Update flight physics to recalculate mass as fuel burns

### Phase 3: Refueling System (Task #6)

- [ ] Define fuel types and base prices (LH2, D, He3)
- [ ] Define location multipliers for all stations
- [ ] Add 'refuel' service to all station locations
- [ ] Implement refuel UI (modal with slider)
- [ ] Add partial refueling logic
- [ ] Update quest payment to use kg-based fuel costs

### Phase 4: UI Updates (Task #5)

- [ ] Update fuel display to show kg/max kg
- [ ] Update navigation chart range circles
- [ ] Add pre-departure fuel warnings
- [ ] Update quest cards to show fuel cost in kg

### Phase 5: Balance Testing (Task #7, #8)

- [ ] Test all routes for profitability
- [ ] Verify short-haul routes profitable
- [ ] Verify long-haul routes require refueling stops
- [ ] Test edge cases (empty tank, full cargo, etc.)

## Deferred Features (Add to BACKLOG.md)

1. **Manual Fuel/Cargo Allocation** - Slider UI for custom splits
2. **Fuel Reserve System** - Minimum fuel buffer warnings
3. **Modular Fuel Tanks** - Purchasable tank upgrades
4. **Fuel Trading** - Buy low, sell high speculation
5. **Emergency Fuel Delivery** - Rescue mechanic for stranded ships
6. **Fuel Efficiency Upgrades** - Engine modifications to reduce consumption
7. **Alternative Propellants** - Chemical, ion, etc. for different engine types

## Open Questions for Team Lead

1. **Should Class II ships be able to reach Meridian in one tank?**
   - Option A: No (forces Gateway refuel stop, more strategic)
   - Option B: Yes (increase default fuel % to 75-80%)

2. **Should fuel prices vary over time?**
   - Could add market dynamics later
   - For MVP, fixed prices are simpler

3. **Should we show fuel costs on quest cards before accepting?**
   - Helps decision-making
   - Might clutter UI
   - Suggest: Show estimated fuel cost in parentheses next to payment

4. **Fusion fuel pricing?**
   - Firebrand/Leviathan use fusion drives
   - Deuterium should be 10x hydrogen price (20 cr/kg base)
   - Need to update engine definitions with fuel type

## References

- `/Users/janiskirsteins/Downloads/fuel_analysis.md` - Realistic fuel requirements
- `/Volumes/X10/Projects/sellgame/WORLDRULES.md` - Physics specifications
- `/Volumes/X10/Projects/sellgame/docs/economy-rebalancing.md` - Quest payment system
- `/Volumes/X10/Projects/sellgame/src/shipClasses.ts` - Ship capacity definitions
- `/Volumes/X10/Projects/sellgame/CLAUDE.md` - Design principles
