/**
 * Provisions-specific formatting utilities.
 *
 * Mirrors the fuel formatting pattern in `fuelFormatting.ts`.
 * Thresholds: ≤10 % danger, ≤30 % warning, else good.
 */

/**
 * Get color class for provisions level (for stat bars).
 */
export function getProvisionsColorClass(percentage: number): string {
  if (percentage <= 10) return 'bar-danger';
  if (percentage <= 30) return 'bar-warning';
  return 'bar-good';
}

/**
 * Get color hex for provisions level (for inline styles).
 */
export function getProvisionsColorHex(percentage: number): string {
  if (percentage <= 10) return '#e94560';
  if (percentage <= 30) return '#ffc107';
  return '#4caf50';
}
