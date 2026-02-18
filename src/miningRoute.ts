import type { GameData, Ship, MiningRoute, WorldLocation } from './models';
import { getFinancials } from './models';
import { startShipFlight, estimateFlightDurationTicks } from './flightPhysics';
import { sellAllOre } from './miningSystem';
import { getRemainingOreCapacity, getOreCargoWeight } from './miningSystem';
import { addLog } from './logSystem';
import { formatMiningRouteName, getDistanceBetween } from './utils';
import { getFuelPricePerKg } from './fuelPricing';
import { formatFuelMass, calculateFuelPercentage } from './ui/fuelFormatting';
import { formatCredits, formatMass } from './formatting';
import {
  getProvisionsSurvivalTicks,
  getProvisionsSurvivalDays,
  autoResupplyProvisions,
} from './provisionsSystem';
import { TICKS_PER_DAY } from './timeSystem';

/**
 * Mining Route System
 *
 * Automates the mine → sell → return loop so mining is fully idle-compatible.
 * Can be initiated from a mine location (immediate mining) or from any station
 * with a reachable mine (ship auto-flies to mine first).
 *
 * Route phases:
 *   mining   → cargo full triggers auto-flight to sell station
 *   selling  → arrive at sell station, auto-sell ore, auto-refuel, fly back
 *   returning → arrive back at mine location, auto-orbit, resume mining
 */

// ─── Route Setup ────────────────────────────────────────────────

/**
 * Start an automated mining route.
 *
 * When `mineLocationId` is omitted, the ship must be orbiting a mine-enabled
 * location (existing behavior — mining begins immediately).
 *
 * When `mineLocationId` is provided, the ship can be at any docked/orbiting
 * location and will auto-fly to the mine as the first step of the route.
 */
export function assignMiningRoute(
  gameData: GameData,
  ship: Ship,
  sellLocationId: string,
  mineLocationId?: string
): { success: boolean; error?: string } {
  // Must not have an active contract
  if (ship.activeContract) {
    return { success: false, error: 'Ship has an active contract' };
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

  // ── Remote start: mine location explicitly specified ──
  if (mineLocationId) {
    const currentLocId = ship.location.dockedAt || ship.location.orbitingAt;
    if (!currentLocId) {
      return {
        success: false,
        error: 'Ship must be docked or orbiting a station',
      };
    }

    const mineLocation = gameData.world.locations.find(
      (l) => l.id === mineLocationId
    );
    if (!mineLocation || !mineLocation.services.includes('mine')) {
      return {
        success: false,
        error: 'Selected location does not support mining',
      };
    }

    const currentLocation = gameData.world.locations.find(
      (l) => l.id === currentLocId
    );
    if (!currentLocation) {
      return { success: false, error: 'Current location not found' };
    }

    ship.miningRoute = {
      mineLocationId: mineLocation.id,
      sellLocationId,
      status: 'returning',
      totalTrips: 0,
      totalCreditsEarned: 0,
      assignedAt: gameData.gameTime,
    };

    // Initiate flight to the mine (orbit on arrival)
    const departed = startShipFlight(
      ship,
      currentLocation,
      mineLocation,
      false,
      ship.flightProfileBurnFraction,
      gameData.gameTime,
      gameData.world
    );

    if (!departed) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'mining_route',
        `Mining route established but helm unmanned — assign crew to helm to depart to ${mineLocation.name}`,
        ship.name
      );
    } else {
      addLog(
        gameData.log,
        gameData.gameTime,
        'mining_route',
        `Mining route established: departing to ${mineLocation.name}, sell at ${sellLocation.name}`,
        ship.name
      );
    }

    return { success: true };
  }

  // ── Local start: ship already at the mine ──
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

  // Note ore retained in cargo so the player knows it wasn't lost
  const oreWeight = getOreCargoWeight(ship);
  const oreSuffix =
    oreWeight > 0 ? ` ${formatMass(oreWeight)} of ore retained in cargo.` : '';

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Mining route ended: ${formatMiningRouteName(mineLoc?.name ?? '?', sellLoc?.name ?? '?')}. ${route.totalTrips} trips, ${formatCredits(route.totalCreditsEarned)} earned.${oreSuffix}`,
    ship.name
  );

  ship.miningRoute = null;

  // Clear fractional ore accumulator — stale fractions from the old route
  // should not carry over to future mining sessions
  ship.miningAccumulator = {};
}

// ─── Player Controls ────────────────────────────────────────────

/**
 * Force immediate departure to sell station, even if cargo isn't full.
 * The route continues normally after selling (auto-returns to mine).
 * Only works when the ship is actively mining (status === 'mining').
 *
 * Safety gates: helm, provisions. Fuel is not gated because the ship
 * is departing *toward* a refuelling station (sell stations have refuel).
 */
export function goSellNow(gameData: GameData, ship: Ship): boolean {
  const route = ship.miningRoute;
  if (!route || route.status !== 'mining') return false;

  const mineLocation = gameData.world.locations.find(
    (l) => l.id === route.mineLocationId
  );
  const sellLocation = gameData.world.locations.find(
    (l) => l.id === route.sellLocationId
  );

  if (!mineLocation || !sellLocation) return false;

  // Provisions gate — ensure crew can survive the trip
  if (!checkProvisionsForTrip(ship, mineLocation, sellLocation, gameData)) {
    return false;
  }

  const departed = startShipFlight(
    ship,
    mineLocation,
    sellLocation,
    true,
    ship.flightProfileBurnFraction,
    gameData.gameTime,
    gameData.world
  );

  if (!departed) {
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Cannot depart to sell — helm is unmanned. Assign crew to helm.`,
      ship.name
    );
    return false;
  }

  route.status = 'selling';

  const oreWeight = getOreCargoWeight(ship);
  const cargoPart =
    oreWeight > 0 ? ` with ${formatMass(oreWeight)} of ore` : ' (empty cargo)';

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Departing to ${sellLocation.name}${cargoPart}`,
    ship.name
  );

  return true;
}

/**
 * Set a deferred action on the mining route. The action is applied when the
 * ship next docks at the sell station.
 */
export function setMiningPendingAction(
  ship: Ship,
  action: 'pause' | 'abandon' | null
): void {
  if (!ship.miningRoute) return;
  ship.miningRoute.pendingAction = action ?? undefined;
}

/**
 * Resume a paused mining route. Departs from sell station back to the mine.
 *
 * Safety gates: helm, provisions.
 */
export function resumeMiningRoute(gameData: GameData, ship: Ship): boolean {
  const route = ship.miningRoute;
  if (!route || route.status !== 'paused') return false;

  const sellLocation = gameData.world.locations.find(
    (l) => l.id === route.sellLocationId
  );
  const mineLocation = gameData.world.locations.find(
    (l) => l.id === route.mineLocationId
  );

  if (!sellLocation || !mineLocation) return false;

  // Provisions gate — ensure crew can survive the trip to the mine
  if (!checkProvisionsForTrip(ship, sellLocation, mineLocation, gameData)) {
    return false;
  }

  const departed = startShipFlight(
    ship,
    sellLocation,
    mineLocation,
    false, // orbit on arrival
    ship.flightProfileBurnFraction,
    gameData.gameTime,
    gameData.world
  );

  if (!departed) {
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Cannot resume mining route — helm is unmanned. Assign crew to helm to depart.`,
      ship.name
    );
    return false;
  }

  route.status = 'returning';
  route.pendingAction = undefined;

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Resumed mining route. Departing ${sellLocation.name} for ${mineLocation.name}`,
    ship.name
  );

  return true;
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
    ship.flightProfileBurnFraction,
    gameData.gameTime,
    gameData.world
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

// ─── Provisions Check: Auto-Return Before Starvation ────────────

/** Safety buffer: depart early enough to arrive with this many days of food remaining. */
const PROVISIONS_SAFETY_BUFFER_DAYS = 2;

/**
 * Check if the ship has enough provisions to survive a trip between two locations.
 * Returns true if provisions are sufficient, false (with log warning) if not.
 */
function checkProvisionsForTrip(
  ship: Ship,
  from: WorldLocation,
  to: WorldLocation,
  gameData: GameData
): boolean {
  const survivalTicks = getProvisionsSurvivalTicks(ship);
  // No crew → no provisions needed
  if (!Number.isFinite(survivalTicks)) return true;

  const distanceKm = getDistanceBetween(from, to);
  const flightTicks = estimateFlightDurationTicks(
    ship,
    distanceKm,
    ship.flightProfileBurnFraction
  );
  const safetyBufferTicks = TICKS_PER_DAY * PROVISIONS_SAFETY_BUFFER_DAYS;

  if (survivalTicks <= flightTicks + safetyBufferTicks) {
    const daysRemaining = Math.ceil(getProvisionsSurvivalDays(ship));
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Cannot depart — provisions too low (${daysRemaining} days remaining). Resupply to continue.`,
      ship.name
    );
    return false;
  }

  return true;
}

/**
 * Called every tick during the mining phase.
 * If remaining provisions won't last through the return trip + safety buffer,
 * auto-depart to the sell station to resupply.
 * Returns true if a departure was initiated.
 */
export function checkMiningRouteProvisionsReturn(
  gameData: GameData,
  ship: Ship
): boolean {
  const route = ship.miningRoute;
  if (!route || route.status !== 'mining') return false;

  const mineLocation = gameData.world.locations.find(
    (l) => l.id === route.mineLocationId
  );
  const sellLocation = gameData.world.locations.find(
    (l) => l.id === route.sellLocationId
  );
  if (!mineLocation || !sellLocation) return false;

  const survivalTicks = getProvisionsSurvivalTicks(ship);
  // Don't trigger if provisions are infinite (no crew)
  if (!Number.isFinite(survivalTicks)) return false;

  const distanceKm = getDistanceBetween(mineLocation, sellLocation);
  const returnFlightTicks = estimateFlightDurationTicks(
    ship,
    distanceKm,
    ship.flightProfileBurnFraction
  );
  const safetyBufferTicks = TICKS_PER_DAY * PROVISIONS_SAFETY_BUFFER_DAYS;

  // Enough provisions — keep mining
  if (survivalTicks > returnFlightTicks + safetyBufferTicks) return false;

  // Try to start flight to sell station for resupply
  const departed = startShipFlight(
    ship,
    mineLocation,
    sellLocation,
    true, // dock on arrival for auto-sell and provisions resupply
    ship.flightProfileBurnFraction,
    gameData.gameTime,
    gameData.world
  );

  if (!departed) {
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Mining route alert: provisions critical but helm unmanned. Assign crew to helm.`,
      ship.name
    );
    return false;
  }

  route.status = 'selling';
  const daysRemaining = Math.ceil(getProvisionsSurvivalDays(ship));

  addLog(
    gameData.log,
    gameData.gameTime,
    'mining_route',
    `Low provisions (${daysRemaining} days remaining) — departing to ${sellLocation.name} to resupply`,
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

  // Resupply provisions with post-sale credits.
  // The ship_docked event fired BEFORE ore was sold (credits may have
  // been insufficient). This explicit call ensures provisions are
  // topped up now that revenue is available.
  autoResupplyProvisions(gameData, ship, sellLocation.id);

  // ── Check deferred player action ──
  if (route.pendingAction === 'abandon') {
    route.totalTrips++;
    const routeName = formatMiningRouteName(
      mineLocation.name,
      sellLocation.name
    );
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Mining route ended: ${routeName}. ${route.totalTrips} trips, ${formatCredits(route.totalCreditsEarned)} earned.`,
      ship.name
    );
    ship.miningRoute = null;
    ship.miningAccumulator = {};
    return true;
  }

  if (route.pendingAction === 'pause') {
    route.status = 'paused';
    route.pendingAction = undefined;
    route.totalTrips++;

    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Mining route paused at ${sellLocation.name}. ${route.totalTrips} trips completed, ${formatCredits(route.totalCreditsEarned)} earned. Resume to continue.`,
      ship.name
    );
    return true;
  }

  // Depart back to mine (orbit on arrival)
  const departed = startShipFlight(
    ship,
    sellLocation,
    mineLocation,
    false, // orbit on arrival (not dock)
    ship.flightProfileBurnFraction,
    gameData.gameTime,
    gameData.world
  );

  if (!departed) {
    // Helm unmanned — stay docked, keep status as 'selling' so retry can pick it up
    addLog(
      gameData.log,
      gameData.gameTime,
      'mining_route',
      `Mining route paused at ${sellLocation.name}: helm unmanned. Assign crew to helm to continue.`,
      ship.name
    );
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

// ─── Stall Retry ────────────────────────────────────────────────

/**
 * Called each tick for docked/orbiting ships with an active mining route
 * that are NOT in flight. Retries stalled departures (e.g. helm was unmanned).
 */
export function retryMiningRouteDeparture(
  gameData: GameData,
  ship: Ship
): boolean {
  const route = ship.miningRoute;
  if (!route) return false;
  if (ship.location.status === 'in_flight') return false;

  if (route.status === 'selling' && ship.location.status === 'docked') {
    // Stalled at sell station — retry departure back to mine
    return handleSellArrival(gameData, ship, route);
  }

  // Stalled initial departure to mine (remote start, helm was unmanned)
  if (route.status === 'returning') {
    const atLocation = ship.location.dockedAt || ship.location.orbitingAt;
    if (atLocation && atLocation !== route.mineLocationId) {
      const currentLoc = gameData.world.locations.find(
        (l) => l.id === atLocation
      );
      const mineLoc = gameData.world.locations.find(
        (l) => l.id === route.mineLocationId
      );
      if (currentLoc && mineLoc) {
        const departed = startShipFlight(
          ship,
          currentLoc,
          mineLoc,
          false,
          ship.flightProfileBurnFraction,
          gameData.gameTime,
          gameData.world
        );
        if (departed) {
          addLog(
            gameData.log,
            gameData.gameTime,
            'mining_route',
            `Departing to ${mineLoc.name} to begin mining operations`,
            ship.name
          );
        }
        return departed;
      }
    }
  }

  return false;
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
    getFinancials(gameData).expenseFuel += fuelCost;

    addLog(
      gameData.log,
      gameData.gameTime,
      'refueled',
      `Auto-refueled ${ship.name} at ${location.name}: ${formatFuelMass(fuelNeededKg)} (${formatCredits(fuelCost)})`,
      ship.name,
      { credits: fuelCost }
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

// ─── Shared UI Helpers ──────────────────────────────────────────

export interface MiningRouteActionOption {
  label: string;
  desc: string;
  style: string;
}

/**
 * Single source of truth for mining route radio-card option data.
 * Used by both flightStatus (during transit) and miningPanel (while mining).
 */
export function getMiningRouteActionOptions(
  route: MiningRoute
): Record<'continue' | 'pause' | 'abandon', MiningRouteActionOption> {
  return {
    continue: {
      label: 'Continue route',
      desc: 'Mining route continues normally. Ship auto-sells and returns to mine.',
      style: 'default',
    },
    pause: {
      label: 'Pause on next sell',
      desc: 'Route pauses after selling ore. Ship stays docked. Resume anytime.',
      style: 'caution',
    },
    abandon: {
      label: 'Abandon on next sell',
      desc: `Ends mining route after selling ore. You keep ${formatCredits(route.totalCreditsEarned)} from completed trips.`,
      style: 'danger',
    },
  };
}

/**
 * Derive the currently selected action from route state.
 */
export function getSelectedMiningAction(
  route: MiningRoute
): 'continue' | 'pause' | 'abandon' {
  return route.pendingAction === 'abandon'
    ? 'abandon'
    : route.pendingAction === 'pause'
      ? 'pause'
      : 'continue';
}
