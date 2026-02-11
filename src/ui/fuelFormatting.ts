/**
 * Fuel-specific formatting utilities.
 *
 * General mass formatting lives in `src/formatting.ts` — this module
 * re-exports it under a fuel-specific name and adds fuel-only helpers
 * (percentage, colour).
 */
import { formatMass } from '../formatting';

/** Format fuel mass in kilograms.  Delegates to the shared `formatMass`. */
export const formatFuelMass = formatMass;

/**
 * Format fuel percentage for display (used alongside kg in some contexts).
 * Example: 75.5 → "75.5%"
 */
export function formatFuelPercentage(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}

/**
 * Calculate fuel percentage from current and max kg values.
 */
export function calculateFuelPercentage(
  fuelKg: number,
  maxFuelKg: number
): number {
  if (maxFuelKg === 0) return 0;
  return (fuelKg / maxFuelKg) * 100;
}

/**
 * Format fuel display showing both kg and percentage.
 * Example: "45,000 kg (75%)"
 */
export function formatFuelWithPercentage(
  fuelKg: number,
  maxFuelKg: number
): string {
  const percentage = calculateFuelPercentage(fuelKg, maxFuelKg);
  return `${formatFuelMass(fuelKg)} (${percentage.toFixed(0)}%)`;
}

/**
 * Get color class for fuel level (for stat bars and warnings).
 * Uses same thresholds as percentage-based system.
 */
export function getFuelColorClass(percentage: number): string {
  if (percentage <= 20) return 'bar-danger';
  if (percentage <= 50) return 'bar-warning';
  return 'bar-good';
}

/**
 * Get color hex for fuel level (for inline styles).
 */
export function getFuelColorHex(percentage: number): string {
  if (percentage <= 20) return '#e94560';
  if (percentage <= 50) return '#ffc107';
  return '#4caf50';
}
