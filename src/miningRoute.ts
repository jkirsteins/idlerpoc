import type { GameData, Ship, MiningRoute } from './models';
import { startShipFlight } from './flightPhysics';
import { sellAllOre } from './miningSystem';
import { getRemainingOreCapacity } from './miningSystem';
import { addLog } from './logSystem';
import { getFuelPricePerKg } from './ui/refuelDialog';
import { formatFuelMass, calculateFuelPercentage } from './ui/fuelFormatting';
import { formatCredits } from './formatting';

/**
 * Mining Route System
 *
 * Automates the mine → sell → return loop so mining is fully idle-compatible.
 * Initiated from the mining panel while orbiting a mine-enabled location.
 *
 * Route phases:
 *   mining   → cargo full triggers auto-flight to sell station
 *   selling  → arrive at sell station, auto-sell ore, auto-refuel, fly back
 *   returning → arrive back at mine location, auto-orbit, resume mining
 */

// ─── Route Setup ────────────────────────────────────────────────

/**
 * Start an automated mining route from the current mine location.
 * Ship must be orbiting a mine-enabled location.
 */
export function assignMiningRoute(
  gameData: GameData,
  ship: Ship,
  sellLocationId: string
): { success: boolean; error?: string } {
  // Must be orbiting
  if (ship.location.status !== 'orbiting' || !ship.location.orbitingAt) {
    return { success: false, error: 'Ship must be orbiting a mining location' };
  }

  const mineLocation = gameData.world.locations.find(
    (l) => l.id === ship.location.orbitingAt
  );
  if (!mineLocation || !mineLocation.services.includes('mine')) {
    return {
      success: false,
      error: 'Current location does not support mining',
    };
  }

  // Validate sell location exists and has trade service
  const sellLocation = gameData.world.locations.find(
    (l) => l.id === sellLocationId
  );
  if (!sellLocation || !sellLocation.services.includes('trade')) {
    return {
      success: false,
      error: 'Selected location does not offer trade services',
    };
  }

  // Must not have an active contract or freight route
  if (ship.activeContract) {
    return { success: false, error: 'Ship has an active contract' };
  }
  if (ship.routeAssignment) {
    return { success: false, error: 'Ship is assigned to a freight route' };
  }

  ship.miningRoute = {
    mineLocationId: mineLocation.id,
    sellLocationId,
    status: 'mining',
    totalTrips: 0,
    totalCreditsEarned: 0,
    assignedAt: gameData.gameTime,
  };

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Mining route established: mine at ${mineLocation.name}, sell at ${sellLocation.name}`,
    ship.name
  );

  return { success: true };
}

/**
 * Cancel the mining route. If in flight, completes current leg then stops.
 */
export function cancelMiningRoute(gameData: GameData, ship: Ship): void {
  if (!ship.miningRoute) return;

  const route = ship.miningRoute;
  const mineLoc = gameData.world.locations.find(
    (l) => l.id === route.mineLocationId
  );
  const sellLoc = gameData.world.locations.find(
    (l) => l.id === route.sellLocationId
  );

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Mining route ended: ${mineLoc?.name} ↔ ${sellLoc?.name}. ${route.totalTrips} trips, ${formatCredits(route.totalCreditsEarned)} earned.`,
    ship.name
  );

  ship.miningRoute = null;
}

// ─── Tick Integration: Cargo Full → Depart ──────────────────────

/**
 * Called from gameTick when mining and cargo is full.
 * If a mining route is active, auto-depart to sell station.
 * Returns true if a departure was initiated.
 */
export function checkMiningRouteDeparture(
  gameData: GameData,
  ship: Ship
): boolean {
  const route = ship.miningRoute;
  if (!route || route.status !== 'mining') return false;

  // Only depart when cargo is full
  if (getRemainingOreCapacity(ship) > 0) return false;

  const mineLocation = gameData.world.locations.find(
    (l) => l.id === route.mineLocationId
  );
  const sellLocation = gameData.world.locations.find(
    (l) => l.id === route.sellLocationId
  );

  if (!mineLocation || !sellLocation) {
    // Locations gone — end route
    ship.miningRoute = null;
    return false;
  }

  // Try to start flight to sell station (dockOnArrival = true for auto-sell)
  const departed = startShipFlight(
    ship,
    mineLocation,
    sellLocation,
    true, // dock on arrival so we can sell
    ship.flightProfileBurnFraction
  );

  if (!departed) {
    // Helm unmanned — log warning but don't cancel route
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Mining route paused: cargo full but helm is unmanned. Assign crew to helm.`,
      ship.name
    );
    return false;
  }

  route.status = 'selling';

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Cargo full — departing to ${sellLocation.name} to sell ore`,
    ship.name
  );

  return true;
}

// ─── Arrival Handling ───────────────────────────────────────────

/**
 * Called from completeLeg() when a ship with a mining route arrives
 * at a destination (no active contract).
 * Returns true if the mining route handled the arrival.
 */
export function handleMiningRouteArrival(
  gameData: GameData,
  ship: Ship
): boolean {
  const route = ship.miningRoute;
  if (!route) return false;

  if (route.status === 'selling') {
    return handleSellArrival(gameData, ship, route);
  }

  if (route.status === 'returning') {
    return handleMineArrival(gameData, ship, route);
  }

  return false;
}

/**
 * Arrived at sell station: auto-sell ore, auto-refuel, depart back to mine.
 */
function handleSellArrival(
  gameData: GameData,
  ship: Ship,
  route: MiningRoute
): boolean {
  const sellLocation = gameData.world.locations.find(
    (l) => l.id === route.sellLocationId
  );
  const mineLocation = gameData.world.locations.find(
    (l) => l.id === route.mineLocationId
  );

  if (!sellLocation || !mineLocation) {
    ship.miningRoute = null;
    return false;
  }

  // Auto-sell all ore
  const saleTotal = sellAllOre(ship, sellLocation, gameData);
  route.totalCreditsEarned += saleTotal;

  if (saleTotal > 0) {
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Auto-sold ore at ${sellLocation.name} for ${formatCredits(saleTotal)}`,
      ship.name
    );
  }

  // Auto-refuel if needed and station supports it
  if (sellLocation.services.includes('refuel')) {
    autoRefuelForMiningRoute(gameData, ship, sellLocation);
  }

  // Depart back to mine (orbit on arrival)
  const departed = startShipFlight(
    ship,
    sellLocation,
    mineLocation,
    false, // orbit on arrival (not dock)
    ship.flightProfileBurnFraction
  );

  if (!departed) {
    // Helm unmanned — stay docked, don't cancel route
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Mining route paused at ${sellLocation.name}: helm unmanned. Assign crew to helm to continue.`,
      ship.name
    );
    route.status = 'returning'; // Will retry on next tick? No — need explicit handling
    return true;
  }

  route.status = 'returning';
  route.totalTrips++;

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Returning to ${mineLocation.name} to resume mining (trip #${route.totalTrips})`,
    ship.name
  );

  return true;
}

/**
 * Arrived back at mine location: set to orbiting, resume mining.
 */
function handleMineArrival(
  gameData: GameData,
  ship: Ship,
  route: MiningRoute
): boolean {
  const mineLocation = gameData.world.locations.find(
    (l) => l.id === route.mineLocationId
  );

  if (!mineLocation) {
    ship.miningRoute = null;
    return false;
  }

  route.status = 'mining';

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Arrived at ${mineLocation.name} — resuming mining operations`,
    ship.name
  );

  return true;
}

// ─── Auto-Refuel ────────────────────────────────────────────────

function autoRefuelForMiningRoute(
  gameData: GameData,
  ship: Ship,
  location: import('./models').WorldLocation
): void {
  const fuelPct = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  if (fuelPct >= 30) return; // Only refuel below 30%

  const fuelNeededKg = ship.maxFuelKg - ship.fuelKg;
  const pricePerKg = getFuelPricePerKg(location, ship);
  const fuelCost = Math.round(fuelNeededKg * pricePerKg);

  if (gameData.credits >= fuelCost) {
    ship.fuelKg = ship.maxFuelKg;
    gameData.credits -= fuelCost;
    ship.metrics.fuelCostsPaid += fuelCost;

    addLog(
      gameData.log,
      gameData.gameTime,
      'refueled',
      `Auto-refueled ${ship.name} at ${location.name}: ${formatFuelMass(fuelNeededKg)} (${formatCredits(fuelCost)})`,
      ship.name
    );
  } else {
    // Not enough credits — end mining route
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Mining route ended: insufficient credits for refuel (need ${formatCredits(fuelCost)}, have ${formatCredits(gameData.credits)})`,
      ship.name
    );
    ship.miningRoute = null;
  }
}
