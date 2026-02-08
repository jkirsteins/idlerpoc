/**
 * Example: Updating fuel displays from percentage to kg
 *
 * This shows the pattern for updating UI components to use kg-based fuel.
 */

import type { Ship } from '../src/models';
import {
  formatFuelMass,
  calculateFuelPercentage,
  getFuelColorClass,
} from '../src/ui/fuelFormatting';
import { renderStatBar } from '../src/ui/components/statBars';

// ============================================
// BEFORE (percentage-based)
// ============================================
function _renderFuelBar_OLD(ship: Ship): HTMLElement {
  const fuel = ship.fuel; // This is a percentage 0-100

  let colorClass = 'bar-good';
  if (fuel <= 20) {
    colorClass = 'bar-danger';
  } else if (fuel <= 50) {
    colorClass = 'bar-warning';
  }

  return renderStatBar({
    label: 'FUEL',
    percentage: fuel,
    valueLabel: `${fuel.toFixed(1)}%`,
    colorClass,
    mode: 'full',
  });
}

// ============================================
// AFTER (kg-based)
// ============================================
function _renderFuelBar_NEW(ship: Ship): HTMLElement {
  // Calculate percentage from kg values for bar fill and color
  const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);

  // Get color based on percentage thresholds (same as before)
  const colorClass = getFuelColorClass(fuelPercentage);

  return renderStatBar({
    label: 'FUEL',
    percentage: fuelPercentage, // Use calculated percentage for bar fill
    valueLabel: formatFuelMass(ship.fuelKg), // Display kg, not %
    colorClass,
    mode: 'full',
  });
}

// ============================================
// Alternative: Show both kg and percentage
// ============================================
function _renderFuelBar_WITH_PERCENTAGE(ship: Ship): HTMLElement {
  const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  const colorClass = getFuelColorClass(fuelPercentage);

  return renderStatBar({
    label: 'FUEL',
    percentage: fuelPercentage,
    valueLabel: `${formatFuelMass(ship.fuelKg)} (${fuelPercentage.toFixed(0)}%)`,
    colorClass,
    mode: 'full',
  });
}

// ============================================
// Example: Simple text display update
// ============================================

// BEFORE:
const fuelLabel_OLD = document.createElement('div');
fuelLabel_OLD.textContent = `Fuel: ${Math.round(ship.fuel)}%`;

// AFTER:
const fuelLabel_NEW = document.createElement('div');
fuelLabel_NEW.textContent = `Fuel: ${formatFuelMass(ship.fuelKg)}`;

// ============================================
// Example: Inline style color update
// ============================================
import { getFuelColorHex } from '../src/ui/fuelFormatting';

// BEFORE:
const fuelColor_OLD =
  ship.fuel <= 20 ? '#e94560' : ship.fuel <= 50 ? '#ffc107' : '#4caf50';
fuel.style.color = fuelColor_OLD;

// AFTER:
const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
fuel.style.color = getFuelColorHex(fuelPercentage);

// ============================================
// Example: Fuel bar fill width (CSS percentage)
// ============================================

// BEFORE:
fuelFill.style.width = `${ship.fuel}%`; // Direct percentage

// AFTER:
const fillPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
fuelFill.style.width = `${fillPercentage}%`;

// ============================================
// Key Principles:
// ============================================
// 1. Display values use kg (formatFuelMass)
// 2. Bar fills and colors use percentage (calculateFuelPercentage)
// 3. Color thresholds remain the same (20%, 50%)
// 4. Use shared formatting functions for consistency
// 5. All displays must update on every tick via component.update()
