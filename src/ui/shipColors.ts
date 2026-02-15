/**
 * Ship Color Palette and Assignment
 *
 * Provides consistent color coding for multi-ship visualization across
 * the Fleet Map orrery and other multi-ship UIs.
 *
 * Design:
 * - Active ship is always red (#e94560) with glow for visual prominence
 * - Other ships get distinct, visually accessible colors hashed from their ID
 * - Colors are chosen to work on dark backgrounds and be distinguishable
 */

const SHIP_COLORS = [
  '#e94560', // red (reserved for active ship)
  '#4a9eff', // blue
  '#4caf50', // green
  '#ffc107', // amber
  '#9c27b0', // purple
  '#ff6b35', // orange
  '#00bcd4', // cyan
  '#e91e63', // pink
];

/**
 * Get a consistent color for a ship.
 * Active ship is always red, other ships get colors based on their ID hash.
 */
export function getShipColor(shipId: string, isActive: boolean): string {
  if (isActive) return SHIP_COLORS[0]; // Always red for active ship

  // Hash the shipId to a consistent index in the color palette
  const hash = shipId
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Skip index 0 (reserved for active ship)
  return SHIP_COLORS[1 + (hash % (SHIP_COLORS.length - 1))];
}
