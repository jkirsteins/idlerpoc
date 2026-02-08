# Fuel System Testing Plan

## Overview

Comprehensive test plan for the realistic mass-based fuel system implementation. This replaces the abstract percentage-based system with physics-accurate kg-based fuel tracking using the Tsiolkovsky rocket equation.

## Test Environment Setup

### Prerequisites

- Vitest test framework (already configured)
- Test helpers in `/Volumes/X10/Projects/sellgame/src/__tests__/testHelpers.ts`
- Existing flight physics tests as baseline

### Test Data References

- **Fuel analysis document**: `/Users/janiskirsteins/Downloads/fuel_analysis.md`
- **WORLDRULES.md**: Specifies 3:1 reaction mass ratio (line 125)
- **Ship classes**: Wayfarer (200,000 kg), Corsair (350,000 kg), Dreadnought (500,000 kg)
- **Engines**: NTR-200 (900s Isp), NTR-450, NTR-800

## Test Categories

### 1. Physics Validation Tests

#### 1.1 Tsiolkovsky Rocket Equation

**Purpose**: Verify the rocket equation is correctly implemented

```typescript
// Test cases:
- Delta-v calculation with known mass ratio
- Example: 200,000 kg dry, 210,000 kg wet (5% fuel), 900s Isp
- Expected: ~430 m/s delta-v
- Verify: deltaV = Isp × g₀ × ln(m_wet / m_dry)
- Where g₀ = 9.81 m/s²
```

**Critical values from fuel_analysis.md**:
| Trip | Distance | Δv Required | Fuel Mass | % of Wet Mass |
|------|----------|-------------|-----------|---------------|
| Gateway (400 km) | 400 km | ~430 m/s | ~10,000 kg | ~5% |
| Meridian (20,000 km) | 20,000 km | ~3,000 m/s | ~80,000 kg | ~28% |
| Mars (54.6M km) | 54.6M km | ~20,000 m/s | ~600,000 kg | ~75% |

#### 1.2 Dynamic Mass Calculations

**Purpose**: Verify ship mass changes as fuel burns

```typescript
// Test cases:
- Initial mass = dry mass + fuel mass + cargo mass + crew mass
- Crew mass = crew count × 80 kg
- Mass decreases as fuel is consumed
- Acceleration increases as mass decreases (F = ma, so a = F/m)
```

#### 1.3 Mass Ratio Validation

**Purpose**: Verify 3:1 reaction mass ratio from WORLDRULES.md

```typescript
// Test case:
- 200,000 kg Wayfarer
- Typical mission: 600,000 kg fuel
- Mass ratio: 800,000 / 200,000 = 4:1 (matches 3:1 propellant per payload)
```

#### 1.4 Acceleration During Flight

**Purpose**: Verify acceleration increases as fuel burns

```typescript
// Test case:
- Start: 800,000 kg total (200k dry + 600k fuel)
- Acceleration_start = thrust / 800,000
- Mid-flight: 500,000 kg (300k fuel burned)
- Acceleration_mid = thrust / 500,000
- End: 200,000 kg (fuel depleted)
- Acceleration_end = thrust / 200,000
// Should verify: Acceleration_end ≈ 4x Acceleration_start
```

### 2. Gameplay Balance Tests

#### 2.1 Short Trip Fuel Consumption

**Purpose**: Verify Gateway Station trip uses ~10,000 kg fuel

```typescript
// Test case:
- Ship: Wayfarer (200,000 kg)
- Engine: NTR-200 (900s Isp)
- Trip: Earth to Gateway Station (400 km)
- Expected fuel: ~10,000 kg (±20% tolerance)
```

#### 2.2 Long Trip Fuel Consumption

**Purpose**: Verify Mars trip uses ~600,000 kg fuel

```typescript
// Test case:
- Ship: Wayfarer (200,000 kg)
- Engine: NTR-200 (900s Isp)
- Trip: Earth to Mars (54.6M km)
- Expected fuel: ~600,000 kg (±20% tolerance)
```

#### 2.3 Medium Distance Scaling

**Purpose**: Verify fuel consumption scales correctly for medium trips

```typescript
// Test case:
- Trip: Meridian Depot (20,000 km)
- Expected fuel: ~80,000 kg
- Verify scaling is non-linear (exponential, not linear)
```

#### 2.4 Cargo Impact on Fuel Efficiency

**Purpose**: Verify heavy cargo requires more fuel

```typescript
// Test cases:
- Empty ship vs. 50% cargo vs. 100% cargo
- Same distance, different fuel consumption
- Heavier ship = worse mass ratio = more fuel needed
```

### 3. Edge Cases and Error Handling

#### 3.1 Zero Fuel Scenarios

**Purpose**: Handle ships with no fuel

```typescript
// Test cases:
- Cannot initiate flight with 0 fuel
- Warning/error message displayed
- Ship cannot leave dock
```

#### 3.2 Insufficient Fuel Mid-Flight

**Purpose**: Handle running out of fuel during travel

```typescript
// Test cases:
- Fuel depletes before reaching destination
- Ship stranded in space
- Emergency protocols activated
```

#### 3.3 Maximum Capacity Limits

**Purpose**: Verify fuel tank capacity is enforced

```typescript
// Test cases:
- Cannot refuel beyond maxFuelKg
- Refueling stops at capacity
- Display shows capacity reached
```

#### 3.4 Fuel/Cargo Trade-offs (if implemented)

**Purpose**: Verify fuel and cargo compete for capacity

```typescript
// Test cases (if task #4 implemented):
- Total capacity = maxFuelKg + maxCargoKg
- Filling fuel reduces cargo space
- Filling cargo reduces fuel capacity
```

### 4. UI Validation Tests

#### 4.1 Fuel Display in Kilograms

**Purpose**: Verify all UI shows kg, not percentages

```typescript
// Locations to check:
- Ship status panel
- Refueling screen
- Flight planning screen
- Fleet management screen
```

**Format requirements**:

- Display format: "450,000 kg / 600,000 kg"
- No percentage displays (unless as secondary info)
- Consistent number formatting with commas

#### 4.2 No "Tick" Terminology

**Purpose**: Verify UI uses game time (days/hours), not ticks

```typescript
// Check all time displays:
- Flight duration estimates
- Fuel consumption rates
- Quest deadlines
// Should use: "2 days (irl 5 min)" NOT "48 ticks"
```

#### 4.3 Refueling Cost Display

**Purpose**: Verify per-kg pricing is displayed correctly

```typescript
// Test refuel screen shows:
- Price per kg
- Total cost for amount selected
- Current fuel / max fuel
- Slider or input for amount
```

#### 4.4 Time Display Consistency

**Purpose**: Verify dual time format (game time + real time)

```typescript
// Format: "X days Y hours (irl Z min)"
// Example: "2 days 8 hours (irl 7 min)"
```

### 5. Integration Tests

#### 5.1 Full Flight Cycle

**Purpose**: Test complete flight from departure to arrival

```typescript
// Test sequence:
1. Check initial fuel (kg)
2. Initiate flight
3. Verify fuel consumption per tick
4. Verify acceleration changes as mass decreases
5. Complete flight
6. Verify final fuel amount
7. Compare expected vs. actual consumption
```

#### 5.2 Refueling Integration

**Purpose**: Test refueling workflow

```typescript
// Test sequence:
1. Dock at station with 'refuel' service
2. Open refuel screen
3. Select fuel amount (kg)
4. Verify cost calculation (price_per_kg × amount)
5. Purchase fuel
6. Verify ship.fuelKg updated
7. Verify credits deducted
8. Verify log entry created
```

#### 5.3 Quest System Integration

**Purpose**: Verify quests account for realistic fuel costs

```typescript
// Test cases:
- Quest fuel estimates match actual consumption
- Quest rewards cover fuel costs with profit margin
- Long-distance quests are profitable
- Short quests don't become unprofitable due to fuel
```

## Test Execution Plan

### Phase 1: Unit Tests (Physics Core)

**When**: After tasks #2-3 complete

1. Tsiolkovsky equation calculations
2. Dynamic mass functions
3. Fuel consumption calculations
4. Mass ratio validations

### Phase 2: Integration Tests (Gameplay)

**When**: After task #5 complete (UI updates)

1. Short/medium/long trip scenarios
2. Cargo impact tests
3. Refueling workflows
4. Edge case handling

### Phase 3: UI/UX Validation

**When**: After task #5 complete

1. Manual testing of all screens
2. Format validation (kg display, time format)
3. Consistency checks across UI
4. User flow testing

### Phase 4: Balance Testing

**When**: After task #7 complete (economy balance)

1. Quest profitability analysis
2. Fuel cost vs. payment ratios
3. Long-term economic viability
4. Player experience testing

## Test Data Fixtures

### Expected Values Reference

Based on fuel_analysis.md calculations:

```typescript
const EXPECTED_FUEL_CONSUMPTION = {
  gateway_station: {
    distance_km: 400,
    delta_v_ms: 430,
    fuel_kg: 10_000,
    fuel_percent: 5,
  },
  meridian_depot: {
    distance_km: 20_000,
    delta_v_ms: 3_000,
    fuel_kg: 80_000,
    fuel_percent: 28,
  },
  mars: {
    distance_km: 54_600_000,
    delta_v_ms: 20_000,
    fuel_kg: 600_000,
    fuel_percent: 75,
  },
};

const SHIP_SPECS = {
  wayfarer: {
    dry_mass_kg: 200_000,
    engine_isp: 900, // NTR-200
    engine_thrust: 4_000, // Newtons
  },
};
```

## Pass/Fail Criteria

### Physics Tests

- **Pass**: Calculated values within ±5% of expected values
- **Fail**: Deviation > 5% or incorrect formula

### Gameplay Tests

- **Pass**: Fuel consumption within ±20% of expected values
- **Fail**: Deviation > 20% or game-breaking behavior

### UI Tests

- **Pass**: All displays show kg format, no "tick" terminology
- **Fail**: Any percentage displays or "tick" references found

### Edge Case Tests

- **Pass**: All edge cases handled gracefully without crashes
- **Fail**: Any crash, hang, or undefined behavior

## Known Issues to Watch For

1. **Integer overflow**: Large fuel masses (600,000+ kg) in calculations
2. **Floating point precision**: Rocket equation uses logarithms
3. **Division by zero**: When fuel/mass approaches zero
4. **Negative fuel**: Edge cases where fuel < 0 due to rounding
5. **UI update lag**: Fuel display updating each tick during flight
6. **Save compatibility**: Old saves with `fuel: number` percentage

## Test Report Format

After testing, document results in:
`/Volumes/X10/Projects/sellgame/FUEL_SYSTEM_TEST_RESULTS.md`

Include:

- Date tested
- Commit hash
- Pass/fail summary by category
- Detailed failure descriptions
- Performance observations
- Balance recommendations
- Bug reports (if any)

## Notes

- Testing cannot begin until tasks #2-3 (physics implementation) and #3 (model changes) are complete
- UI testing requires task #5 (UI updates) to be complete
- Balance testing requires task #7 (economy balance) to be complete
- Some tests may need adjustment as implementation details emerge
- Coordinate with game-engine-engineer and ui-engineer for test timing
