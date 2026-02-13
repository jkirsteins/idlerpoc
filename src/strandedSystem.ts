import type { Ship, GameData, WorldLocation } from './models';
import { calculateOneLegFuelKg } from './flightPhysics';
import { getDistanceBetween } from './utils';
import { getProvisionsSurvivalDays } from './provisionsSystem';
import { addLog } from './logSystem';

/**
 * Stranded Ship Detection
 *
 * A ship is stranded when it cannot reach ANY location with refueling
 * service using its current fuel, AND cannot buy fuel at its current
 * location (either no refuel service or no credits).
 */

/** Get the location a non-flying ship is at. */
function getShipLocationId(ship: Ship): string | undefined {
  if (ship.location.status === 'docked') return ship.location.dockedAt;
  if (ship.location.status === 'orbiting') return ship.location.orbitingAt;
  return undefined;
}

/**
 * Find the nearest location with refuel service from a given location.
 * Returns the location and the one-way fuel cost to reach it, or null
 * if no refuel station exists in the world.
 */
export function findNearestRefuelStation(
  ship: Ship,
  currentLoc: WorldLocation,
  world: GameData['world']
): {
  location: WorldLocation;
  fuelNeededKg: number;
  distanceKm: number;
} | null {
  let nearest: {
    location: WorldLocation;
    fuelNeededKg: number;
    distanceKm: number;
  } | null = null;
  let minFuel = Infinity;

  for (const loc of world.locations) {
    if (!loc.services.includes('refuel')) continue;
    if (loc.id === currentLoc.id) continue;

    const distanceKm = getDistanceBetween(currentLoc, loc);
    if (distanceKm <= 0) continue;

    const fuelNeeded = calculateOneLegFuelKg(ship, distanceKm);
    if (fuelNeeded < minFuel) {
      minFuel = fuelNeeded;
      nearest = { location: loc, fuelNeededKg: fuelNeeded, distanceKm };
    }
  }

  return nearest;
}

/**
 * Check whether a ship is stranded.
 *
 * A ship is stranded when ALL of the following are true:
 * 1. Ship is docked or orbiting (not in flight)
 * 2. Ship has crew aboard
 * 3. Cannot buy fuel at current location (no refuel service, or zero credits)
 * 4. Cannot reach any refuel station with current fuel
 */
export function isShipStranded(ship: Ship, gameData: GameData): boolean {
  // In-flight ships aren't stranded (they're committed to a trajectory)
  if (ship.location.status === 'in_flight') return false;

  // Empty ships aren't stranded
  if (ship.crew.length === 0) return false;

  const locationId = getShipLocationId(ship);
  if (!locationId) return false;

  const currentLoc = gameData.world.locations.find((l) => l.id === locationId);
  if (!currentLoc) return false;

  // Can refuel at current location?
  if (currentLoc.services.includes('refuel') && gameData.credits > 0) {
    return false;
  }

  // Can reach any refuel station with current fuel?
  for (const loc of gameData.world.locations) {
    if (!loc.services.includes('refuel')) continue;
    if (loc.id === locationId) continue;

    const distanceKm = getDistanceBetween(currentLoc, loc);
    if (distanceKm <= 0) continue;

    const fuelNeeded = calculateOneLegFuelKg(ship, distanceKm);
    if (fuelNeeded <= ship.fuelKg) {
      return false; // Can reach at least one refuel station
    }
  }

  return true; // Cannot reach any refuel station
}

/**
 * Get stranded ship info for UI display and rescue quest generation.
 */
export interface StrandedShipInfo {
  ship: Ship;
  locationId: string;
  location: WorldLocation;
  survivalDays: number;
  nearestRefuel: {
    location: WorldLocation;
    fuelNeededKg: number;
    distanceKm: number;
  } | null;
}

export function getStrandedShipInfo(
  ship: Ship,
  gameData: GameData
): StrandedShipInfo | null {
  if (!isShipStranded(ship, gameData)) return null;

  const locationId = getShipLocationId(ship);
  if (!locationId) return null;

  const location = gameData.world.locations.find((l) => l.id === locationId);
  if (!location) return null;

  const survivalDays = getProvisionsSurvivalDays(ship);
  const nearestRefuel = findNearestRefuelStation(
    ship,
    location,
    gameData.world
  );

  return {
    ship,
    locationId,
    location,
    survivalDays,
    nearestRefuel,
  };
}

/**
 * Get all stranded ships in the fleet.
 */
export function getStrandedShips(gameData: GameData): StrandedShipInfo[] {
  const stranded: StrandedShipInfo[] = [];
  for (const ship of gameData.ships) {
    const info = getStrandedShipInfo(ship, gameData);
    if (info) stranded.push(info);
  }
  return stranded;
}

// ── Stranded log tracking ────────────────────────────────────────

/** Lazy-init set to track which ships have had their stranded status logged. */
let _strandedLoggedShips: Set<string> | null = null;
function getStrandedLogSet(): Set<string> {
  if (!_strandedLoggedShips) _strandedLoggedShips = new Set();
  return _strandedLoggedShips;
}

/**
 * Check for newly stranded ships and log warnings.
 * Called from the game tick.
 */
export function checkStrandedShips(gameData: GameData): void {
  const logSet = getStrandedLogSet();
  for (const ship of gameData.ships) {
    const stranded = isShipStranded(ship, gameData);

    if (stranded && !logSet.has(ship.id)) {
      logSet.add(ship.id);

      const info = getStrandedShipInfo(ship, gameData);
      const survivalMsg =
        info && info.survivalDays < Infinity
          ? ` Provisions for ${Math.ceil(info.survivalDays)} days.`
          : '';

      addLog(
        gameData.log,
        gameData.gameTime,
        'stranded',
        `${ship.name} is stranded at ${info?.location.name ?? 'unknown location'}! No fuel to reach a refueling station.${survivalMsg}`,
        ship.name
      );

      // Auto-pause on critical alert
      if (gameData.autoPauseSettings.onCriticalAlert) {
        gameData.isPaused = true;
      }
    } else if (!stranded && logSet.has(ship.id)) {
      logSet.delete(ship.id);
    }
  }
}
