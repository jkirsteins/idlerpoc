# Quest Economics Validation: Realistic Fuel Costs

## Purpose

Validate that the cost-based quest payment system (from `economy-rebalancing.md`) remains profitable under realistic kg-based fuel costs.

## Methodology

For each ship class and representative routes:

1. Calculate realistic fuel consumption (kg) from fuel_analysis.md
2. Calculate fuel costs using proposed refueling prices
3. Calculate crew costs from existing salary system
4. Verify quest payment (130-200% floor) covers costs with profit margin
5. Identify any routes that become unprofitable

## Fuel Pricing Assumptions

From `docs/fuel-cargo-tradeoff-design.md`:

| Fuel Type             | Base Price | Used By               |
| --------------------- | ---------- | --------------------- |
| Liquid Hydrogen (LH2) | 2 cr/kg    | Chemical, Fission NTR |
| Deuterium (D)         | 20 cr/kg   | Fusion drives         |

### Location Multipliers

| Location        | Multiplier | LH2 Price | D Price  |
| --------------- | ---------- | --------- | -------- |
| Earth           | 0.8x       | 1.6 cr/kg | 16 cr/kg |
| Gateway Station | 1.0x       | 2.0 cr/kg | 20 cr/kg |
| Meridian Depot  | 1.0x       | 2.0 cr/kg | 20 cr/kg |
| Forge Station   | 1.2x       | 2.4 cr/kg | 24 cr/kg |
| Mars            | 0.9x       | 1.8 cr/kg | 18 cr/kg |
| Freeport        | 1.5x       | 3.0 cr/kg | 30 cr/kg |

## Class I: Station Keeper (Chemical Propulsion)

**Ship Specs**:

- Engine: RS-44 Bipropellant (Chemical)
- Mass: 50,000 kg dry
- Max Fuel: 3,500 kg (70% of 5,000 kg capacity)
- Crew: Captain + 1 (2.5 cr/tick salary)
- Fuel Type: Chemical bipropellant (~2 cr/kg, same as LH2)

### Route 1: Earth → Gateway Station (400 km)

**Fuel Analysis** (from fuel_analysis.md):

- Chemical engines very inefficient
- Estimated fuel: ~500 kg one-way (limited delta-v budget)
- Round trip: ~1,000 kg

**Cost Breakdown**:

- Fuel cost: 1,000 kg × 1.6 cr/kg (Earth price) = 1,600 cr
- Trip time: ~1,191 ticks (from economy-rebalancing.md)
- Crew cost: 2.5 cr/tick × 1,191 = 2,978 cr
- **Total cost**: 4,578 cr

**Quest Payment** (130-200% floor):

- Minimum: 4,578 × 1.3 = 5,951 cr
- Maximum: 4,578 × 2.0 = 9,156 cr
- **Profit**: 1,373 - 4,578 cr ✓

**Verdict**: PROFITABLE (30-100% profit margin)

### Route 2: Earth → Meridian (20,000 km)

**Fuel Analysis**:

- Chemical engine cannot efficiently reach 20,000 km
- Would require ~3,000+ kg (near or exceeding tank capacity)
- **Design intent**: Station Keeper is LEO/MEO only (Class I)

**Verdict**: IMPOSSIBLE by design - Class I ships are orbital-only ✓

## Class II: Wayfarer (Fission NTR)

**Ship Specs**:

- Engine: NTR-200 Mk1 (900s Isp, 4,000 N thrust)
- Mass: 200,000 kg dry
- Max Fuel: 28,000 kg (70% of 40,000 kg capacity)
- Crew: Captain + Pilot + Engineer (4 cr/tick default)
- Fuel Type: Liquid Hydrogen (LH2)

### Route 1: Earth → Gateway Station (400 km)

**Fuel Analysis** (from fuel_analysis.md):

- Δv required: ~430 m/s
- Fuel mass: ~10,000 kg one-way
- Round trip: ~20,000 kg

**Capacity Check**:

- Max fuel: 28,000 kg
- Required: 20,000 kg
- Margin: 8,000 kg (40% reserve) ✓

**Cost Breakdown**:

- Fuel cost: 20,000 kg × 1.6 cr/kg (Earth price) = 32,000 cr
- Trip time: ~600 ticks (estimated from burn-coast-burn)
- Crew cost: 4 cr/tick × 600 = 2,400 cr
- **Total cost**: 34,400 cr

**Quest Payment** (130-200% floor):

- Minimum: 34,400 × 1.3 = 44,720 cr
- Maximum: 34,400 × 2.0 = 68,800 cr
- **Profit**: 10,320 - 34,400 cr ✓

**Verdict**: PROFITABLE (30-100% profit margin)

### Route 2: Earth → Meridian Depot (20,000 km)

**Fuel Analysis** (from fuel_analysis.md):

- Δv required: ~3,000 m/s
- Fuel mass: ~80,000 kg one-way
- Round trip: ~160,000 kg

**Capacity Check**:

- Max fuel: 28,000 kg
- Required: 160,000 kg (round trip)
- **INSUFFICIENT** - Cannot complete in one tank

**Multi-Leg Strategy**:

1. Earth → Gateway (10,000 kg)
2. Refuel at Gateway (full tank: 28,000 kg)
3. Gateway → Meridian (40,000 kg) - STILL INSUFFICIENT
4. **Problem**: Even with Gateway refuel, cannot reach Meridian

**Revised Analysis**:

- One-way fuel: 80,000 kg (exceeds 28,000 kg tank)
- **Meridian is UNREACHABLE** for Wayfarer without cargo sacrifice

**Alternate Strategy**: Reduce cargo to increase fuel capacity

- If manual allocation implemented, could carry 80,000 kg fuel + 0 kg cargo
- But current design uses fixed ratios

**Verdict**: IMPOSSIBLE in current design - Requires Class III ship OR manual fuel allocation ✓

### Route 3: Earth → Forge Station (384,400 km)

**Fuel Analysis** (estimated):

- Δv required: ~2,500 m/s
- Fuel mass: ~65,000 kg one-way
- Round trip: ~130,000 kg

**Capacity Check**:

- Max fuel: 28,000 kg
- Required: 130,000 kg (round trip)
- **INSUFFICIENT**

**Verdict**: IMPOSSIBLE - Requires multiple refueling stops or Class III ship

### Route 4: Earth → Mars (54.6M km)

**Fuel Analysis** (from fuel_analysis.md):

- Δv required: ~20,000 m/s
- Fuel mass: ~600,000 kg one-way
- **Completely impossible** for Class II ships

**Verdict**: IMPOSSIBLE by design - Requires Class III fusion ship ✓

## Class II: Corsair (Combat Freighter)

**Ship Specs**:

- Engine: NTR-450 Mk2 (900s Isp, 10,000 N thrust)
- Mass: 350,000 kg dry
- Max Fuel: 42,000 kg (70% of 60,000 kg capacity)
- Crew: Captain + 3 (5.5 cr/tick)
- Fuel Type: Liquid Hydrogen (LH2)

### Route 1: Earth → Gateway (400 km)

**Fuel Analysis**:

- Heavier ship (350k vs 200k kg) but more powerful engine
- Estimated fuel: ~12,000 kg one-way (accounting for higher mass)
- Round trip: ~24,000 kg

**Capacity Check**:

- Max fuel: 42,000 kg
- Required: 24,000 kg
- Margin: 18,000 kg (75% reserve) ✓

**Cost Breakdown**:

- Fuel cost: 24,000 kg × 1.6 cr/kg = 38,400 cr
- Crew cost: ~3,300 cr (600 ticks)
- **Total cost**: 41,700 cr

**Quest Payment** (130-200% floor):

- Minimum: 54,210 cr
- Maximum: 83,400 cr
- **Profit**: 12,510 - 41,700 cr ✓

**Verdict**: PROFITABLE

### Route 2: Earth → Meridian (20,000 km)

**Fuel Analysis**:

- Higher thrust but also higher mass (350k kg)
- Estimated fuel: ~90,000 kg one-way (worse than Wayfarer due to mass)
- Round trip: ~180,000 kg

**Capacity Check**:

- Max fuel: 42,000 kg
- Required: 180,000 kg
- **INSUFFICIENT**

**Verdict**: IMPOSSIBLE - Same issue as Wayfarer

## Class II: Dreadnought (Heavy Cruiser)

**Ship Specs**:

- Engine: NTR-800 Heavy (900s Isp, 20,000 N thrust)
- Mass: 500,000 kg dry (very heavy)
- Max Fuel: 56,000 kg (70% of 80,000 kg capacity)
- Crew: Captain + 5 (8 cr/tick)
- Fuel Type: Liquid Hydrogen (LH2)
- Feature: Rotating habitat (no zero-g exposure)

### Route 1: Earth → Gateway (400 km)

**Fuel Analysis**:

- Massive ship (500k kg) but proportionally powerful engine
- Estimated fuel: ~15,000 kg one-way
- Round trip: ~30,000 kg

**Capacity Check**:

- Max fuel: 56,000 kg
- Required: 30,000 kg
- Margin: 26,000 kg (87% reserve) ✓

**Cost Breakdown**:

- Fuel cost: 30,000 kg × 1.6 cr/kg = 48,000 cr
- Crew cost: ~4,800 cr (600 ticks)
- **Total cost**: 52,800 cr

**Quest Payment** (130-200% floor):

- Minimum: 68,640 cr
- Maximum: 105,600 cr
- **Profit**: 15,840 - 52,800 cr ✓

**Verdict**: PROFITABLE but lower margins due to mass

### Route 2: Earth → Meridian (20,000 km)

**Fuel Analysis**:

- Very heavy ship requires proportionally more fuel
- Estimated fuel: ~110,000 kg one-way
- Round trip: ~220,000 kg

**Capacity Check**:

- Max fuel: 56,000 kg
- Required: 220,000 kg
- **INSUFFICIENT**

**Verdict**: IMPOSSIBLE - Heavier ships have WORSE range for same engine type

## Class III: Firebrand (Entry Fusion Torch)

**Ship Specs**:

- Engine: FDR-I "Sunfire" (D-D Fusion, 0.01g sustained)
- Mass: 800,000 kg dry
- Max Fuel: 70,000 kg (70% of 100,000 kg capacity)
- Crew: Captain + 9 (12 cr/tick for full crew)
- Fuel Type: Deuterium (D)
- Equipment: Radiation shielding, heat radiators, mag confinement

**Important**: Fusion fuel is 10x more expensive (20 cr/kg vs 2 cr/kg)

### Route 1: Earth → Gateway (400 km)

**Fuel Analysis**:

- Fusion has much higher Isp (~10,000s vs 900s)
- Mass ratio for 430 m/s: Much lower fuel consumption
- Estimated fuel: ~3,500 kg one-way (10x better than fission)
- Round trip: ~7,000 kg

**Capacity Check**:

- Max fuel: 70,000 kg
- Required: 7,000 kg
- Margin: 63,000 kg (900% reserve) ✓✓✓

**Cost Breakdown**:

- Fuel cost: 7,000 kg × 16 cr/kg (Earth D price) = 112,000 cr
- Crew cost: ~7,200 cr (600 ticks)
- **Total cost**: 119,200 cr

**Quest Payment** (130-200% floor):

- Minimum: 154,960 cr
- Maximum: 238,400 cr
- **Profit**: 35,760 - 119,200 cr ✓

**Verdict**: PROFITABLE but margins squeezed by expensive fusion fuel

**Note**: Even though fuel consumption is lower, fuel cost per kg is 10x higher. Short routes are LESS efficient for fusion ships.

### Route 2: Earth → Meridian (20,000 km)

**Fuel Analysis**:

- Fusion Isp advantage significant at longer distances
- Estimated fuel: ~25,000 kg one-way
- Round trip: ~50,000 kg

**Capacity Check**:

- Max fuel: 70,000 kg
- Required: 50,000 kg
- Margin: 20,000 kg (40% reserve) ✓

**Cost Breakdown**:

- Fuel cost: 50,000 kg × 16 cr/kg = 800,000 cr
- Trip time: ~1,500 ticks (faster than fission)
- Crew cost: 12 cr/tick × 1,500 = 18,000 cr
- **Total cost**: 818,000 cr

**Quest Payment** (130-200% floor):

- Minimum: 1,063,400 cr
- Maximum: 1,636,000 cr
- **Profit**: 245,400 - 818,000 cr ✓

**Verdict**: PROFITABLE - Long routes justify fusion fuel costs

### Route 3: Earth → Mars (54.6M km)

**Fuel Analysis** (from fuel_analysis.md):

- Δv required: ~20,000 m/s
- Fusion Isp (~10,000s) makes this achievable
- Estimated fuel: ~150,000 kg one-way
- Round trip: ~300,000 kg

**Capacity Check**:

- Max fuel: 70,000 kg
- Required: 300,000 kg
- **INSUFFICIENT** - Need Leviathan or multiple refueling stops

**Verdict**: IMPOSSIBLE for entry-level fusion ship - Need deep system hauler

## Class III: Leviathan (Deep System Hauler)

**Ship Specs**:

- Engine: FDR-III "Hellion" (Advanced D-D Fusion, 0.1g sustained)
- Mass: 1,200,000 kg dry
- Max Fuel: 140,000 kg (70% of 200,000 kg capacity)
- Crew: Captain + 15 (20 cr/tick full crew)
- Fuel Type: Deuterium (D)
- Feature: Rotating habitat, point defense, heavy shielding

### Route 1: Earth → Mars (54.6M km)

**Fuel Analysis**:

- More powerful engine but also heavier ship
- Estimated fuel: ~200,000 kg one-way (high-speed transit)
- Round trip: ~400,000 kg

**Capacity Check**:

- Max fuel: 140,000 kg
- Required: 400,000 kg
- **INSUFFICIENT** even for Leviathan

**Multi-Leg Strategy**:

1. Earth → Forge Station (refuel)
2. Forge → Mars (refuel)
3. Mars → return route

**Single-Leg Analysis** (Earth → Forge):

- Distance: 384,400 km
- Fuel: ~30,000 kg one-way
- Round trip: ~60,000 kg ✓ Within capacity

**Cost Breakdown** (Earth → Forge → Mars multi-leg):

- Total fuel: ~250,000 kg (with refueling)
- Fuel cost: 250,000 × avg 18 cr/kg = 4,500,000 cr
- Trip time: ~4,000 ticks
- Crew cost: 20 cr/tick × 4,000 = 80,000 cr
- **Total cost**: 4,580,000 cr

**Quest Payment** (130-200% floor):

- Minimum: 5,954,000 cr
- Maximum: 9,160,000 cr
- **Profit**: 1,374,000 - 4,580,000 cr ✓

**Verdict**: PROFITABLE but requires multi-million credit investment

## Summary of Findings

### Routes by Profitability

| Ship Class     | Route          | Distance   | Fuel Cost  | Total Cost | Payment Range        | Verdict               |
| -------------- | -------------- | ---------- | ---------- | ---------- | -------------------- | --------------------- |
| Station Keeper | Earth→Gateway  | 400 km     | 1,600 cr   | 4,578 cr   | 5,951 - 9,156 cr     | ✓ PROFITABLE          |
| Station Keeper | Earth→Meridian | 20,000 km  | N/A        | N/A        | N/A                  | ✗ IMPOSSIBLE (design) |
| Wayfarer       | Earth→Gateway  | 400 km     | 32,000 cr  | 34,400 cr  | 44,720 - 68,800 cr   | ✓ PROFITABLE          |
| Wayfarer       | Earth→Meridian | 20,000 km  | N/A        | N/A        | N/A                  | ✗ IMPOSSIBLE (fuel)   |
| Wayfarer       | Earth→Forge    | 384,400 km | N/A        | N/A        | N/A                  | ✗ IMPOSSIBLE (fuel)   |
| Corsair        | Earth→Gateway  | 400 km     | 38,400 cr  | 41,700 cr  | 54,210 - 83,400 cr   | ✓ PROFITABLE          |
| Corsair        | Earth→Meridian | 20,000 km  | N/A        | N/A        | N/A                  | ✗ IMPOSSIBLE (fuel)   |
| Dreadnought    | Earth→Gateway  | 400 km     | 48,000 cr  | 52,800 cr  | 68,640 - 105,600 cr  | ✓ PROFITABLE          |
| Dreadnought    | Earth→Meridian | 20,000 km  | N/A        | N/A        | N/A                  | ✗ IMPOSSIBLE (fuel)   |
| Firebrand      | Earth→Gateway  | 400 km     | 112,000 cr | 119,200 cr | 154,960 - 238,400 cr | ✓ PROFITABLE          |
| Firebrand      | Earth→Meridian | 20,000 km  | 800,000 cr | 818,000 cr | 1.06M - 1.64M cr     | ✓ PROFITABLE          |
| Firebrand      | Earth→Mars     | 54.6M km   | N/A        | N/A        | N/A                  | ✗ IMPOSSIBLE (fuel)   |
| Leviathan      | Earth→Mars\*   | 54.6M km   | 4.5M cr    | 4.58M cr   | 5.95M - 9.16M cr     | ✓ PROFITABLE          |

\*Multi-leg journey with refueling stops

### Key Insights

1. **Cost-based floor system WORKS** ✓
   - All achievable routes are profitable
   - 30-100% profit margins maintained
   - System self-balances with realistic fuel costs

2. **Fuel costs dominate economics for Class III ships**
   - Firebrand Earth→Meridian: 800k fuel vs 7k crew
   - Fuel is 99% of operating costs
   - Short routes inefficient for fusion ships (high fuel cost, low utilization)

3. **Range pressure creates strategic gameplay** ✓
   - Class I: LEO/MEO only (orbital)
   - Class II: Gateway + short routes only
   - Class III: Required for distant stations
   - Ship progression feels necessary, not arbitrary

4. **Meridian Depot is UNREACHABLE for Class II ships**
   - Wayfarer needs 160,000 kg round trip, has 28,000 kg tank
   - Design decision needed: Is this intentional?

5. **No quest reward rebalancing needed** ✓✓✓
   - Payments scale automatically with fuel costs
   - 130-200% floor guarantees profitability
   - System is robust to fuel price changes

## Design Recommendations

### 1. Clarify Class II Range Intent

**Option A: Meridian is Class III territory** (RECOMMENDED)

- Keep current tank sizes (28k - 56k kg)
- Class II ships limited to Gateway, short routes
- Creates clear progression pressure to upgrade to fusion
- Matches WORLDRULES.md (Class II = Inner System, ~3 AU max)

**Option B: Class II can reach Meridian with tight margins**

- Increase fission tank sizes to 80-90% of capacity
- Wayfarer: 32,000 kg fuel (80% of 40k) → barely reaches Meridian
- Reduces strategic tension, makes fusion less necessary

**Recommendation**: Option A. Meridian should require Class III or multi-leg strategy.

### 2. Add Refueling Stop Bonuses

For multi-leg journeys (e.g., Earth→Gateway→Meridian), consider:

- "Hub station bonus": +10% payment for routes using Gateway as waypoint
- Makes refueling stops feel rewarding, not punishing
- Encourages emergent route planning

**Implementation**:

```typescript
if (route includes refueling stop at hub station) {
  payment *= 1.1; // 10% hub bonus
}
```

### 3. Standing Freight Removed

Standing freight was removed as a quest type — it was redundant with trade routes (both were infinite, automatable routes). Trade routes alone now fill the "passive income" role at 120% cost floor. See `docs/quest-reward-balancing.md` for the active vs passive income design.

### 4. Fusion Ship Short-Route Inefficiency

**Issue**: Firebrand loses money on short routes relative to capability:

- Earth→Gateway: 154,960 - 238,400 cr payment
- Wayfarer same route: 44,720 - 68,800 cr payment
- Firebrand costs 120M cr, Wayfarer costs 8.5M cr

Fusion ships are economically inefficient for short hauls (high fuel cost, low utilization).

**Verdict**: This is GOOD design ✓

- Creates niche protection for Class II ships
- Fusion ships should focus on long-haul routes
- Players must choose right ship for the job

### 5. Quest Card Fuel Cost Display

**Recommendation**: Show estimated fuel cost on quest cards:

```
┌─ Delivery Quest ─────────────────────┐
│ Destination: Meridian Depot          │
│ Payment: 1,200,000 cr                │
│ Est. Fuel: ~50,000 kg (800,000 cr)   │
│ Crew Cost: ~18,000 cr                │
│ Est. Profit: 382,000 - 818,000 cr    │
└───────────────────────────────────────┘
```

Helps players make informed decisions, especially for expensive fusion routes.

## Implementation Checklist

### No Code Changes Required ✓

The existing cost-based payment system in `src/questGen.ts` already:

- Calculates crew costs from actual salaries
- Estimates fuel costs from trip distance
- Applies 130-200% floor multiplier
- Adds cargo premiums and distance bonuses

### Only Required Changes:

1. **Update fuel cost calculation** (when kg-based fuel implemented):

```typescript
// Current:
const fuelCost = fuelCostPercent * 2 * 5; // Round trip, 5 cr per %

// New:
const fuelCostKg = calculateFuelCostKg(distanceKm, ship);
const fuelPrice = getLocationFuelPrice(currentLocation);
const fuelCost = fuelCostKg * 2 * fuelPrice; // Round trip
```

2. **Add fuel cost display to quest cards** (UI task):

```typescript
const estimatedFuelKg = calculateFuelCostKg(distanceKm, ship) * 2;
const fuelCost = estimatedFuelKg * fuelPrice;
// Display in quest card UI
```

## Conclusion

**✓ Quest payment system is VALIDATED for realistic fuel costs**

The existing cost-based floor system:

- Maintains profitability across all ship classes
- Scales correctly with fuel price changes
- Creates natural ship progression pressure
- Requires NO manual rebalancing

**✓ No quest reward increases needed**

Fuel costs are incorporated into the cost floor calculation, so payments automatically increase to match.

**✓ Emergent gameplay achieved**

Range limitations create strategic decisions:

- Ship selection matters (Class I vs II vs III)
- Route planning matters (refueling stops)
- Cost vs time trade-offs (fusion expensive but fast)

**Task #7 Status: COMPLETE** - Economics validated, no rebalancing needed beyond automatic scaling.
