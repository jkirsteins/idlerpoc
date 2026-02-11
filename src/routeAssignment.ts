import type { GameData, Ship, Quest } from './models';
import { canAcceptQuest } from './questGen';
import { addLog } from './logSystem';
import { generateId } from './utils';
import { getFuelPricePerKg } from './ui/refuelDialog';

type AcceptQuestFn = (gameData: GameData, ship: Ship, quest: Quest) => void;

/**
 * Late-bound reference to acceptQuest, set by contractExec at import time
 * to break the contractExec ↔ routeAssignment circular dependency.
 */
let _acceptQuest: AcceptQuestFn | null = null;

export function setAcceptQuestFn(fn: AcceptQuestFn): void {
  _acceptQuest = fn;
}

/**
 * Route Assignment System
 *
 * Enables ships to run automated trade routes indefinitely
 */

/**
 * Assign ship to automated trade route
 *
 * CONSTRAINTS:
 * - Only trade_route quests (tripsRequired === -1)
 * - Ship must be docked at origin location
 * - Ship must have no active contract
 * - Quest must pass canAcceptQuest() validation
 */
export function assignShipToRoute(
  gameData: GameData,
  ship: Ship,
  questId: string,
  autoRefuel: boolean = true,
  autoRefuelThreshold: number = 30
): { success: boolean; error?: string } {
  // Validation: Ship must be docked
  const location = ship.location.dockedAt;
  if (!location) {
    return { success: false, error: 'Ship must be docked to assign route' };
  }

  // Validation: Find quest at current location
  const quest = gameData.availableQuests[location]?.find(
    (q) => q.id === questId
  );
  if (!quest) {
    return { success: false, error: 'Quest not found at this location' };
  }

  // Validation: Must be a trade route
  if (quest.type !== 'trade_route') {
    return {
      success: false,
      error: 'Only trade route quests can be automated',
    };
  }

  // Validation: Ship must not have active contract
  if (ship.activeContract) {
    return { success: false, error: 'Ship has active contract' };
  }

  // Validation: Ship must be able to accept quest
  const validation = canAcceptQuest(ship, quest);
  if (!validation.canAccept) {
    return { success: false, error: validation.reason };
  }

  // Create route assignment
  ship.routeAssignment = {
    questId: quest.id,
    originId: quest.origin,
    destinationId: quest.destination,
    autoRefuel,
    autoRefuelThreshold,
    totalTripsCompleted: 0,
    creditsEarned: 0,
    assignedAt: gameData.gameTime,
    lastTripCompletedAt: gameData.gameTime,
  };

  // Start first trip using existing acceptQuest flow
  _acceptQuest!(gameData, ship, quest);

  const originLoc = gameData.world.locations.find((l) => l.id === quest.origin);
  const destLoc = gameData.world.locations.find(
    (l) => l.id === quest.destination
  );

  addLog(
    gameData.log,
    gameData.gameTime,
    'contract_accepted',
    `Assigned to automated route: ${originLoc?.name} ↔ ${destLoc?.name}`,
    ship.name
  );

  return { success: true };
}

/**
 * Remove ship from route assignment
 *
 * If ship is in flight, it will complete current trip and then stop
 * If ship is docked, route is immediately removed
 */
export function unassignShipFromRoute(gameData: GameData, ship: Ship): void {
  if (!ship.routeAssignment) return;

  const assignment = ship.routeAssignment; // Save for logging before clearing

  const originLoc = gameData.world.locations.find(
    (l) => l.id === assignment.originId
  );
  const destLoc = gameData.world.locations.find(
    (l) => l.id === assignment.destinationId
  );

  addLog(
    gameData.log,
    gameData.gameTime,
    'contract_abandoned',
    `Ended automated route: ${originLoc?.name} ↔ ${destLoc?.name}. Completed ${assignment.totalTripsCompleted} trips, earned ${assignment.creditsEarned.toLocaleString()} credits total.`,
    ship.name
  );

  // Remove route assignment
  // If in flight, let current trip complete naturally (contract remains active)
  ship.routeAssignment = null;
}

/**
 * Check and execute auto-refuel for route-assigned ships
 * Called when ship docks during automated route
 */
export function checkAutoRefuel(
  gameData: GameData,
  ship: Ship,
  locationId: string
): { refueled: boolean; reason?: string } {
  if (!ship.routeAssignment || !ship.routeAssignment.autoRefuel) {
    return { refueled: false, reason: 'Auto-refuel not enabled' };
  }

  const location = gameData.world.locations.find((l) => l.id === locationId);
  if (!location || !location.services.includes('refuel')) {
    return { refueled: false, reason: 'Location does not offer refueling' };
  }

  const threshold = ship.routeAssignment.autoRefuelThreshold;
  const fuelPercentage = (ship.fuelKg / ship.maxFuelKg) * 100;

  if (fuelPercentage < threshold) {
    // Calculate refuel amount and cost using location-based pricing
    const fuelNeededKg = ship.maxFuelKg - ship.fuelKg;
    const pricePerKg = getFuelPricePerKg(location, ship);
    const fuelCost = Math.round(fuelNeededKg * pricePerKg);

    if (gameData.credits >= fuelCost) {
      ship.fuelKg = ship.maxFuelKg;
      gameData.credits -= fuelCost;

      // Track refuel cost in ship metrics
      ship.metrics.fuelCostsPaid += fuelCost;

      addLog(
        gameData.log,
        gameData.gameTime,
        'refueled',
        `Auto-refueled ${ship.name} at ${location.name}: ${Math.round(fuelNeededKg).toLocaleString()} kg (${fuelCost.toLocaleString()} cr)`,
        ship.name
      );

      return { refueled: true };
    } else {
      // Insufficient funds - pause route assignment
      const originLoc = gameData.world.locations.find(
        (l) => l.id === ship.routeAssignment!.originId
      );
      const destLoc = gameData.world.locations.find(
        (l) => l.id === ship.routeAssignment!.destinationId
      );

      addLog(
        gameData.log,
        gameData.gameTime,
        'contract_abandoned',
        `Route assignment ended at ${location.name}: insufficient credits for refuel (needed ${fuelCost}, have ${gameData.credits}). Route ${originLoc?.name} ↔ ${destLoc?.name} completed ${ship.routeAssignment.totalTripsCompleted} trips.`,
        ship.name
      );

      // End route assignment due to insufficient funds
      ship.routeAssignment = null;

      if (ship.activeContract) {
        ship.activeContract.paused = true;
      }

      return { refueled: false, reason: 'Insufficient credits' };
    }
  }

  return { refueled: false, reason: 'Fuel above threshold' };
}

/**
 * Auto-restart next trip for route-assigned ships.
 * Called after inbound leg completion in completeLeg().
 *
 * @param previousQuest The quest from the just-completed contract. Must be
 *   passed explicitly because ship.activeContract is already null by the
 *   time this function runs.
 */
export function autoRestartRouteTrip(
  gameData: GameData,
  ship: Ship,
  previousQuest?: Quest
): { restarted: boolean; reason?: string } {
  if (!ship.routeAssignment) {
    return { restarted: false, reason: 'No route assignment' };
  }

  const assignment = ship.routeAssignment;

  // Find origin and destination locations
  const originLoc = gameData.world.locations.find(
    (l) => l.id === assignment.originId
  );
  const destLoc = gameData.world.locations.find(
    (l) => l.id === assignment.destinationId
  );

  if (!originLoc || !destLoc) {
    // Route locations no longer exist - end assignment
    ship.routeAssignment = null;
    return { restarted: false, reason: 'Route locations not found' };
  }

  // Create a new quest instance for the next trip, carrying forward the
  // payment and cargo values from the previous quest.
  const nextQuest: Quest = {
    id: generateId(),
    type: 'trade_route',
    title: `Freight: ${originLoc.name} → ${destLoc.name}`,
    description: `Automated freight route`,
    origin: assignment.originId,
    destination: assignment.destinationId,
    cargoRequired: previousQuest?.cargoRequired || 0,
    totalCargoRequired: 0,
    tripsRequired: -1, // Unlimited
    paymentPerTrip: previousQuest?.paymentPerTrip || 0,
    paymentOnCompletion: 0,
    expiresAfterDays: 0,
    estimatedFuelPerTrip: previousQuest?.estimatedFuelPerTrip || 0,
    estimatedTripTicks: previousQuest?.estimatedTripTicks || 0,
  };

  // Start next trip immediately (no user interaction)
  _acceptQuest!(gameData, ship, nextQuest);

  addLog(
    gameData.log,
    gameData.gameTime,
    'departure',
    `Continuing automated route: ${originLoc.name} → ${destLoc.name} (trip ${assignment.totalTripsCompleted + 1})`,
    ship.name
  );

  return { restarted: true };
}
