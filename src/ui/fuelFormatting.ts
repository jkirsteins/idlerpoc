/**
 * Utility functions for formatting fuel mass displays in the UI.
 * Part of the fuel system realism update.
 */

/**
 * Format fuel mass in kilograms with appropriate unit suffix.
 * Examples:
 * - 500 kg → "500 kg"
 * - 1,500 kg → "1,500 kg"
 * - 10,000 kg → "10,000 kg"
 * - 100,000 kg → "100,000 kg"
 */
export function formatFuelMass(kg: number): string {
  return `${Math.round(kg).toLocaleString()} kg`;
}

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
