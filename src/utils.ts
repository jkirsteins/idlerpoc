import type { GameData, Ship, WorldLocation } from './models';

/**
 * Generate a random ID string (9 chars, base-36).
 * Extracted to its own module to avoid circular dependencies
 * between gameFactory, jobSlots, and routeAssignment.
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Get distance between two locations (km).
 *
 * Uses 2D Euclidean distance from orbital positions (x/y in km, updated
 * each tick by updateWorldPositions). Falls back to 1D |distanceFromEarth|
 * when orbital data is absent (legacy saves before migration).
 */
export function getDistanceBetween(
  locA: WorldLocation,
  locB: WorldLocation
): number {
  // If both locations have orbital data, use 2D Euclidean distance
  if (locA.orbital && locB.orbital) {
    const dx = locA.x - locB.x;
    const dy = locA.y - locB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  // Legacy fallback
  return Math.abs(locA.distanceFromEarth - locB.distanceFromEarth);
}

/**
 * Deterministic string hash (DJB2 variant).
 * Returns a non-negative integer, well-distributed for short strings.
 * Used for personality generation and template selection.
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Format a trade route name: "Origin ↔ Destination" (bidirectional). */
export function formatTradeRouteName(
  originName: string,
  destName: string
): string {
  return `${originName} \u2194 ${destName}`;
}

/** Format a mining route name: "Mine → Sell" (directional). */
export function formatMiningRouteName(
  mineName: string,
  sellName: string
): string {
  return `${mineName} \u2192 ${sellName}`;
}

/** Resolve a ship's mining route to a formatted name, or undefined if no route. */
export function getMiningRouteName(
  ship: Ship,
  gameData: GameData
): string | undefined {
  if (!ship.miningRoute) return undefined;
  const mine = gameData.world.locations.find(
    (l) => l.id === ship.miningRoute!.mineLocationId
  );
  const sell = gameData.world.locations.find(
    (l) => l.id === ship.miningRoute!.sellLocationId
  );
  return formatMiningRouteName(
    mine?.name ?? ship.miningRoute.mineLocationId,
    sell?.name ?? ship.miningRoute.sellLocationId
  );
}
