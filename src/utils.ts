import type { WorldLocation } from './models';

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
 * Extracted to break circular dependency between flightPhysics and worldGen.
 */
export function getDistanceBetween(
  locA: WorldLocation,
  locB: WorldLocation
): number {
  return Math.abs(locA.distanceFromEarth - locB.distanceFromEarth);
}
