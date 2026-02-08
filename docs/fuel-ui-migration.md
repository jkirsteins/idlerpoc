# Fuel UI Migration Plan

## Overview

Update all UI components to display fuel in kilograms instead of percentages, following the mount-once/update-on-tick pattern.

## Data Requirements

Before UI can be updated, the Ship model needs:

- `ship.fuelKg: number` - Current fuel mass in kg
- `ship.maxFuelKg: number` - Maximum fuel capacity in kg

## UI Components to Update

### 1. Ship Tab Fuel Bar

**File**: `src/ui/shipTab.ts:100-115`
**Current**: Shows `${fuel.toFixed(1)}%`
**New**: Show `${formatFuelMass(ship.fuelKg)}` with percentage calculated from kg values
**Note**: Uses renderStatBar component - percentage for bar fill, kg for label

### 2. Mobile Header Fuel Display

**File**: `src/ui/renderer.ts:453-457`
**Current**: Shows `${ship.fuel.toFixed(0)}%`
**New**: Show `${Math.round(ship.fuelKg).toLocaleString()} kg`
**Note**: Keep color coding based on percentage thresholds

### 3. Sidebar Fuel Bar

**File**: `src/ui/sidebars.ts:165-175`
**Current**: Label shows `${ship.fuel.toFixed(1)}%`
**New**: Show `${formatFuelMass(ship.fuelKg)}`
**Note**: Uses renderStatBar with percentage for bar fill

### 4. Fleet Panel Ship List

**File**: `src/ui/fleetPanel.ts:168-172`
**Current**: Shows `Fuel: ${Math.round(ship.fuel)}%`
**New**: Show `Fuel: ${formatFuelMass(ship.fuelKg)}`
**Note**: Compact display for fleet list

### 5. Fleet Tab Fuel Line

**File**: `src/ui/fleetTab.ts:767`
**Current**: Dynamic context already, may already handle kg
**Action**: Verify and update if needed

### 6. Navigation View Travel Info

**File**: `src/ui/navigationView.ts:196`
**Current**: Shows `Fuel Cost: ~${fuelCost.toFixed(1)}%`
**New**: Show `Fuel Cost: ~${formatFuelMass(fuelCostKg)}`
**Note**: Needs fuel calculation to return kg instead of percentage

### 7. Quest Fuel Estimate (Work Tab)

**File**: `src/ui/workTab.ts:277`
**Current**: Shows `Fuel: ~${Math.round(quest.estimatedFuelPerTrip)}% per trip`
**New**: Show `Fuel: ~${formatFuelMass(quest.estimatedFuelPerTripKg)} per trip`
**Note**: Requires quest generation to calculate fuel in kg

### 8. Active Work Fuel Label

**File**: `src/ui/workTab.ts:445`
**Current**: Shows `Fuel: ${Math.round(ship.fuel)}%`
**New**: Show `Fuel: ${formatFuelMass(ship.fuelKg)}`

### 9. Active Work Fuel Bar Fill

**File**: `src/ui/workTab.ts:452`
**Current**: Bar width set to `${ship.fuel}%`
**New**: Calculate percentage from kg values: `${calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg)}%`

### 10. Buy Fuel Button

**File**: `src/ui/tabbedView.ts:543-551`
**Current**: Shows `Buy Fuel (${Math.round(fuelNeeded)}% → ${cost} cr)`
**New**: Complete redesign for kg-based refueling (task #6)
**Note**: Should show per-kg pricing and allow amount selection

## Settings/Thresholds to Update

### 11. Auto-Refuel Threshold

**File**: `src/ui/settingsTab.ts:166`
**Current**: Description mentions "10%"
**Action**: Update description to reference kg or percentage threshold

### 12. Fleet Tab Auto-Refuel Display

**File**: `src/ui/workTab.ts:715`
**Current**: Shows threshold as percentage
**Action**: Update to show kg threshold (or both)

### 13. Fleet Tab Fuel Cost Tooltips

**File**: `src/ui/fleetTab.ts:354,358`
**Current**: Shows fuel cost as percentage
**Action**: Update tooltips to show kg

## Shared Utilities Created

### fuelFormatting.ts

Created utility functions:

- `formatFuelMass(kg)` - Format kg with thousands separator
- `formatFuelWithPercentage(fuelKg, maxFuelKg)` - Show both kg and %
- `calculateFuelPercentage(fuelKg, maxFuelKg)` - Calculate % from kg
- `getFuelColorClass(percentage)` - Get color class for stat bars
- `getFuelColorHex(percentage)` - Get color hex for inline styles

## Dependencies

### Blocked on:

- Task #3: Add mass-based fuel fields to Ship model
- Fuel calculation functions need to return kg values

### Impacts:

- Task #6: Refueling UI redesign (separate task)
- Quest generation needs to calculate fuel in kg
- Flight physics needs to consume fuel in kg
- Navigation calculations need to return fuel costs in kg

## Testing Checklist

After implementation:

- [ ] Ship tab fuel bar shows kg and correct percentage fill
- [ ] Mobile header shows kg with correct color
- [ ] Sidebar fuel bar shows kg with correct fill
- [ ] Fleet panel shows kg for all ships
- [ ] Navigation travel estimates show fuel cost in kg
- [ ] Quest details show fuel cost in kg per trip
- [ ] Active work panel shows kg and correct bar fill
- [ ] Color coding (red/yellow/green) still works correctly
- [ ] All fuel displays update correctly during flight
- [ ] Auto-refuel thresholds still work (may need adjustment)
