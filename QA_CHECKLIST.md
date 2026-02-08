# QA Checklist - Realistic Fuel System

## Test Readiness Status

### Prerequisites

- [ ] Task #2: Tsiolkovsky rocket equation implemented
- [ ] Task #3: Mass-based fuel fields added to Ship model
- [ ] Task #5: UI updated to display kg instead of percentages
- [ ] Task #6: kg-based refueling implemented
- [ ] Task #7: Quest rewards balanced for fuel economics

## Phase 1: Physics Unit Tests (Requires Tasks #2-3)

### Tsiolkovsky Rocket Equation

- [ ] Delta-v calculation with known mass ratio
- [ ] Gateway Station values (~430 m/s, ~10k kg fuel)
- [ ] Meridian Depot values (~3k m/s, ~80k kg fuel)
- [ ] Mars values (~20k m/s, ~600k kg fuel)
- [ ] Edge case: mass ratio = 1 (no fuel)
- [ ] Constant g₀ = 9.81 m/s² verification

### Dynamic Mass Calculations

- [ ] Total mass = dry + fuel + cargo + crew
- [ ] Crew mass = count × 80 kg
- [ ] Mass decreases as fuel consumed
- [ ] Cargo mass accounting

### Mass Ratio Validation (WORLDRULES.md)

- [ ] 3:1 reaction mass ratio verification
- [ ] Wayfarer: 200k dry + 600k fuel = 800k wet (4:1 ratio)
- [ ] Verification matches specification

### Dynamic Acceleration

- [ ] Initial acceleration calculation (full fuel)
- [ ] Acceleration increases as fuel burns
- [ ] ~4x increase for 75% fuel consumption
- [ ] Per-tick recalculation during burns

### Fuel Consumption Accuracy

- [ ] Short trip (Gateway): ~10k kg ±20%
- [ ] Medium trip (Meridian): ~80k kg ±20%
- [ ] Long trip (Mars): ~600k kg ±20%
- [ ] Non-linear scaling verification
- [ ] Exponential vs. linear verification

### Cargo Impact

- [ ] Heavy cargo requires more fuel
- [ ] Empty vs. full cargo difference measurable
- [ ] Mass ratio calculations account for cargo

### Edge Cases

- [ ] Zero fuel handling
- [ ] Insufficient fuel prevents flight
- [ ] Maximum capacity enforcement
- [ ] Large mass values (600k+ kg) no overflow
- [ ] Logarithm precision maintained
- [ ] No negative fuel values

### Engine Specifications

- [ ] NTR-200: 900s Isp verification
- [ ] Higher Isp = better efficiency
- [ ] Matches engines.ts definitions

## Phase 2: Integration Tests (Requires Task #5)

### Full Flight Cycle

- [ ] Initial fuel (kg) recorded
- [ ] Flight initiation successful
- [ ] Fuel consumption per tick correct
- [ ] Acceleration changes tracked
- [ ] Flight completes successfully
- [ ] Final fuel amount matches expected
- [ ] Actual vs. expected comparison

### Refueling Workflow (Requires Task #6)

- [ ] Dock at station with 'refuel' service
- [ ] Refuel screen opens
- [ ] Fuel amount selection (kg)
- [ ] Cost calculation: price_per_kg × amount
- [ ] Fuel purchased successfully
- [ ] ship.fuelKg updated correctly
- [ ] Credits deducted correctly
- [ ] Log entry created

### Quest System Integration (Requires Task #7)

- [ ] Fuel estimates match actual consumption
- [ ] Quest rewards profitable after fuel costs
- [ ] Long-distance quests remain viable
- [ ] Short quests not unprofitable

## Phase 3: UI/UX Validation (Requires Task #5)

### Fuel Display Format

- [ ] Ship status panel shows kg
- [ ] Refueling screen shows kg
- [ ] Flight planning shows kg
- [ ] Fleet management shows kg
- [ ] Format: "450,000 kg / 600,000 kg"
- [ ] No percentage displays (or clearly secondary)
- [ ] Number formatting with commas

### Terminology Check

- [ ] No "tick" in flight duration displays
- [ ] No "tick" in fuel consumption rates
- [ ] No "tick" in quest deadlines
- [ ] Game time format: "X days Y hours (irl Z min)"
- [ ] Consistent time display across all screens

### Refueling UI (Requires Task #6)

- [ ] Price per kg displayed
- [ ] Total cost calculated correctly
- [ ] Current fuel / max fuel shown
- [ ] Amount selection interface clear
- [ ] Visual feedback on selection

### Time Display Consistency

- [ ] Dual format used everywhere
- [ ] Game time + real time shown
- [ ] Format consistent: "2d 8h (irl 7 min)"
- [ ] Shared components used for time display

## Phase 4: Balance Testing (Requires Task #7)

### Economic Viability

- [ ] Quest profitability analysis
- [ ] Fuel cost vs. payment ratios reasonable
- [ ] Long-term economic sustainability
- [ ] Player can maintain positive cash flow

### Gameplay Feel

- [ ] Short trips feel quick and cheap
- [ ] Long trips feel expensive but rewarding
- [ ] Fuel management adds strategic depth
- [ ] Not overly punishing or tedious

## Phase 5: Regression Testing

### Existing Features

- [ ] Flight physics still works correctly
- [ ] Quest system still functional
- [ ] Refueling (old system) replaced properly
- [ ] No crashes on game load
- [ ] No crashes during flight
- [ ] Save/load works (or reset required)

### Performance

- [ ] No lag during fuel calculations
- [ ] UI updates smoothly during flight
- [ ] No memory leaks during long flights
- [ ] Game tick performance acceptable

## Bug Tracking

### Critical Bugs (Ship Stoppers)

- None yet

### High Priority Bugs

- None yet

### Medium Priority Issues

- None yet

### Low Priority / Nice to Have

- None yet

## Test Results Summary

### Overall Status

- **Not Started**: Awaiting implementation (tasks #2-3 in progress)

### Phase Completion

- Phase 1 (Physics): 0% (0/50 tests)
- Phase 2 (Integration): 0% (0/15 tests)
- Phase 3 (UI/UX): 0% (0/20 tests)
- Phase 4 (Balance): 0% (0/10 tests)
- Phase 5 (Regression): 0% (0/10 tests)

### Notes

- Created comprehensive test plan: FUEL_SYSTEM_TEST_PLAN.md
- Created test scaffolding: fuelPhysics.test.ts
- Monitoring task progress
- Ready to begin testing when implementation complete

### Next Steps (Updated)

1. ✅ Phase 1 physics tests - COMPLETE (22/22 passing)
2. Begin Phase 2 integration testing
3. Begin Phase 3 UI/UX validation
4. Complete Phase 4 balance testing when task #7 done
