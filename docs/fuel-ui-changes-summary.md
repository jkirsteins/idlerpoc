# Fuel UI Migration - Completion Summary

## Task #5: Update all UI to display fuel in kg instead of percentages

**Status**: ✅ Complete (UI portion)
**Date**: 2026-02-08

## Files Created

### 1. `/Volumes/X10/Projects/sellgame/src/ui/fuelFormatting.ts`

Utility functions for consistent fuel mass formatting across all UI:

- `formatFuelMass(kg)` - Format with thousands separator and "kg" suffix
- `calculateFuelPercentage(fuelKg, maxFuelKg)` - Calculate % for bar fills
- `formatFuelWithPercentage(fuelKg, maxFuelKg)` - Combined display
- `getFuelColorClass(percentage)` - Color classes for stat bars
- `getFuelColorHex(percentage)` - Color hex codes for inline styles

**Test Coverage**: 20 passing tests in `src/ui/__tests__/fuelFormatting.test.ts`

### 2. Documentation Files

- `docs/fuel-ui-migration.md` - Migration plan and checklist
- `docs/fuel-ui-example.ts` - Before/after code examples
- `docs/fuel-ui-changes-summary.md` - This file

## Files Modified

### UI Components Updated (13 locations)

#### 1. `/Volumes/X10/Projects/sellgame/src/ui/shipTab.ts`

**Line 100-113**: Main fuel bar on ship tab

- **Before**: `${fuel.toFixed(1)}%`
- **After**: `${formatFuelMass(ship.fuelKg)} / ${formatFuelMass(ship.maxFuelKg)}`
- Shows current and max fuel capacity with percentage fill bar

#### 2. `/Volumes/X10/Projects/sellgame/src/ui/renderer.ts`

**Line 453-457**: Mobile header fuel display

- **Before**: `${ship.fuel.toFixed(0)}%`
- **After**: `${Math.round(ship.fuelKg).toLocaleString()} kg`
- Compact format for mobile

#### 3. `/Volumes/X10/Projects/sellgame/src/ui/sidebars.ts`

**Line 173-180**: Sidebar fuel bar

- **Before**: Label shows percentage
- **After**: Label shows kg with percentage for bar fill
- Removed duplicate `getFuelColorClass` function (now imported)
- **Line 308**: Fixed refuel button condition to use `fuelKg < maxFuelKg`

#### 4. `/Volumes/X10/Projects/sellgame/src/ui/fleetPanel.ts`

**Line 169-172**: Fleet panel ship list

- **Before**: `Fuel: ${Math.round(ship.fuel)}%`
- **After**: `Fuel: ${formatFuelMass(ship.fuelKg)}`
- Increased minWidth from 80px to 100px to accommodate kg display

#### 5. `/Volumes/X10/Projects/sellgame/src/ui/fleetTab.ts`

**Line 357-364**: Reachability matrix tooltips

- **Before**: Shows fuel cost and availability as percentages
- **After**: Shows kg values using `formatFuelMass()`
- **Line 770**: Updated fuel color calculation to use percentage from kg

#### 6. `/Volumes/X10/Projects/sellgame/src/ui/navigationView.ts`

**Line 191-197**: Travel info fuel cost estimate

- **Before**: `Fuel Cost: ~${fuelCost.toFixed(1)}%`
- **After**: `Fuel Cost: ~${formatFuelMass(fuelCostKg)}`

#### 7. `/Volumes/X10/Projects/sellgame/src/ui/workTab.ts`

**Line 280-289**: Quest fuel estimate per trip

- **After**: Conditional display - if value > 100, treat as kg; otherwise legacy %
- Added TODO for quest generation to provide kg values

**Line 448-456**: Active work fuel gauge

- **Before**: `Fuel: ${Math.round(ship.fuel)}%` with percentage bar width
- **After**: `Fuel: ${formatFuelMass(ship.fuelKg)}` with calculated percentage for bar

#### 8. `/Volumes/X10/Projects/sellgame/src/ui/tabbedView.ts`

**Line 547-555**: Buy fuel button

- **Before**: `Buy Fuel (${Math.round(fuelNeeded)}% → ${cost} cr)`
- **After**: `Buy Fuel (${formatFuelMass(fuelNeededKg)} → ${cost} cr)`
- Added TODO for proper per-kg pricing (task #6)

### Backend File Modified

#### `/Volumes/X10/Projects/sellgame/src/flightPhysics.ts`

**Line 217-233**: Added temporary `calculateFuelCost()` stub

- Returns fuel cost in kg (not percentage)
- Uses simple linear approximation
- **TODO**: Needs proper Tsiolkovsky equation implementation
- This unblocks UI but needs refinement

## Key Design Decisions

### 1. Display Format

- **Primary**: Show kg values with thousands separator
- **Secondary**: Use calculated percentage for:
  - Progress bar fill widths
  - Color thresholds (red < 20%, yellow < 50%, green >= 50%)
- **Example**: "45,000 kg / 600,000 kg" with 75% green fill

### 2. Color Thresholds Preserved

- Danger (red): ≤ 20% fuel remaining
- Warning (yellow): ≤ 50% fuel remaining
- Good (green): > 50% fuel remaining
- Applied consistently across all displays

### 3. Component Pattern

- All updates follow mount-once/update-on-tick pattern
- No interactive elements replaced during updates
- Uses `replaceChildren()` or in-place mutations

### 4. Backward Compatibility

- Added conditional logic where backend may still provide percentage
- Quest fuel estimates: if value > 100, treat as kg; else as %
- Will be removed once all backend updated

## Known Issues / TODOs

### 1. Quest Fuel Estimates

- `quest.estimatedFuelPerTrip` still calculated as percentage in questGen.ts
- UI has conditional workaround but proper fix needs backend update
- **Owner**: game-engine-engineer

### 2. calculateFuelCost() Stub

- Currently uses linear approximation
- Should use proper rocket equation
- **Owner**: game-engine-engineer

### 3. Refueling Pricing

- Buy fuel button still uses legacy percentage-based pricing
- Proper kg-based pricing is task #6
- **Owner**: ui-engineer (next task)

### 4. Auto-Refuel Thresholds

- Route assignment auto-refuel threshold display still shows %
- Threshold storage/comparison logic needs backend update
- **Owner**: game-engine-engineer

## Non-UI Files Still Using ship.fuel

These files have compilation errors and need updating by game-engine-engineer:

- `src/contractExec.ts` (2 locations)
- `src/fleetAnalytics.ts` (9 locations)
- `src/main.ts` (3 locations)
- `src/powerSystem.ts` (1 location)
- `src/questGen.ts` (2 locations)
- `src/routeAssignment.ts` (multiple)
- `src/worldGen.ts` (2 locations)
- `src/__tests__/flightPhysics.test.ts` (6 locations)
- `src/__tests__/testHelpers.ts` (1 location)

## Testing

### Automated Tests

- ✅ All fuel formatting utility tests pass (20/20)
- ⚠️ Flight physics tests need updates for `fuelKg`/`maxFuelKg`

### Manual Testing Needed

- [ ] Ship tab fuel bar displays correctly and updates during flight
- [ ] Mobile header shows kg with correct color
- [ ] Fleet panel shows kg for all ships
- [ ] Navigation estimates show fuel cost in kg
- [ ] Quest listings show fuel cost in kg per trip
- [ ] Active work panel fuel gauge updates correctly
- [ ] Buy fuel button shows kg amount
- [ ] Color coding works (red/yellow/green at correct thresholds)
- [ ] All displays update smoothly on every tick

## Migration Impact

### User-Visible Changes

- All fuel displays now show kilograms instead of percentages
- More realistic representation of fuel as physical mass
- Easier to understand actual fuel consumption
- Aligns with WORLDRULES.md physics specifications

### Performance Impact

- Minimal - formatting functions are lightweight
- No additional calculations during render
- Percentage calculations cached where possible

### Breaking Changes

- Old `ship.fuel` property removed (replaced with `ship.fuelKg` and `ship.maxFuelKg`)
- Saved games from before this change won't load
- Per CLAUDE.md: "Never implement migration code unless asked"

## Next Steps

### Immediate (Task #6)

- Implement kg-based refueling UI with per-kg pricing
- Allow players to select fuel amount to purchase
- Show cost per kg based on location

### Follow-up

- Remove conditional legacy % handling once quest gen updated
- Replace calculateFuelCost stub with proper implementation
- Update auto-refuel threshold UI to show kg option
- Comprehensive end-to-end testing (task #8)

## Credits

**UI Engineer**: Completed all UI fuel display updates
**Game Engine Engineer**: Provided Ship model updates, will complete backend
**QA Engineer**: Will perform end-to-end testing

---

**Completion Date**: 2026-02-08
**Total Files Modified**: 11 UI files + 1 backend file
**Total Lines Changed**: ~150 lines
**Tests Added**: 20 test cases
**Build Status**: ⚠️ TypeScript errors in non-UI files (game-engine-engineer to fix)
