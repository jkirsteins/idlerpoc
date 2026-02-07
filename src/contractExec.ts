import type { GameData, ActiveContract, Quest, WorldLocation } from './models';
import { initializeFlight } from './flightPhysics';
import { addLog } from './logSystem';

/**
 * Contract Execution
 *
 * Manages active contract state and transitions
 */

/**
 * Start a contract by accepting a quest
 */
export function acceptQuest(gameData: GameData, quest: Quest): void {
  const { ship, world, gameTime } = gameData;

  // Create active contract
  const contract: ActiveContract = {
    quest,
    tripsCompleted: 0,
    cargoDelivered: 0,
    creditsEarned: 0,
    leg: 'outbound',
    paused: false,
  };

  gameData.activeContract = contract;

  // Log acceptance
  addLog(
    gameData.log,
    gameTime,
    'contract_accepted',
    `Accepted contract: ${quest.title}`
  );

  // Undock and start flight
  const origin = world.locations.find((l) => l.id === quest.origin);
  const destination = world.locations.find((l) => l.id === quest.destination);

  if (!origin || !destination) {
    throw new Error('Invalid quest locations');
  }

  ship.location.status = 'in_flight';
  delete ship.location.dockedAt;

  // Initialize flight
  ship.location.flight = initializeFlight(ship, origin, destination, false);

  // Start engine warmup
  ship.engine.state = 'warming_up';
  ship.engine.warmupProgress = 0;

  // Log departure
  addLog(
    gameData.log,
    gameTime,
    'departure',
    `Departed ${origin.name} en route to ${destination.name}`
  );
}

/**
 * Complete current leg of contract flight
 */
export function completeLeg(gameData: GameData): void {
  const { ship, world, gameTime, activeContract } = gameData;

  if (!activeContract || !ship.location.flight) {
    return;
  }

  const quest = activeContract.quest;
  const originLoc = world.locations.find((l) => l.id === quest.origin);
  const destLoc = world.locations.find((l) => l.id === quest.destination);

  if (!originLoc || !destLoc) {
    return;
  }

  const arrivalLocation =
    activeContract.leg === 'outbound' ? destLoc : originLoc;

  // Log arrival
  addLog(
    gameData.log,
    gameTime,
    'arrival',
    `Arrived at ${arrivalLocation.name}`
  );

  // Handle leg completion based on type
  if (activeContract.leg === 'outbound') {
    // Completed outbound leg
    if (quest.type === 'delivery' || quest.type === 'passenger') {
      // One-way quests: complete on arrival at destination
      activeContract.tripsCompleted = 1;
      activeContract.creditsEarned = quest.paymentOnCompletion;
      ship.credits += quest.paymentOnCompletion;

      addLog(
        gameData.log,
        gameTime,
        'contract_complete',
        `Contract completed: ${quest.title}. Earned ${quest.paymentOnCompletion.toLocaleString()} credits.`
      );

      // Dock and clear contract
      ship.location.status = 'docked';
      ship.location.dockedAt = arrivalLocation.id;
      delete ship.location.flight;
      ship.engine.state = 'off';
      ship.engine.warmupProgress = 0;
      gameData.activeContract = null;
    } else {
      // Freight/supply contracts: continue to inbound leg
      activeContract.leg = 'inbound';

      // Dock briefly if destination has refuel
      if (arrivalLocation.services.includes('refuel')) {
        ship.fuel = Math.min(100, ship.fuel + 20); // Quick refuel
        addLog(
          gameData.log,
          gameTime,
          'refueled',
          `Refueled at ${arrivalLocation.name}`
        );
      }

      // Start return leg
      const nextOrigin = destLoc;
      const nextDestination = originLoc;
      ship.location.flight = initializeFlight(
        ship,
        nextOrigin,
        nextDestination,
        false
      );
      ship.engine.state = 'warming_up';
      ship.engine.warmupProgress = 0;

      addLog(
        gameData.log,
        gameTime,
        'departure',
        `Departed ${nextOrigin.name} en route to ${nextDestination.name}`
      );
    }
  } else {
    // Completed inbound leg (return to origin)
    activeContract.tripsCompleted++;

    // Update cargo delivered for supply contracts
    if (quest.type === 'supply') {
      activeContract.cargoDelivered += quest.cargoRequired;
    }

    // Pay per-trip payment
    if (quest.paymentPerTrip > 0) {
      activeContract.creditsEarned += quest.paymentPerTrip;
      ship.credits += quest.paymentPerTrip;

      addLog(
        gameData.log,
        gameTime,
        'payment',
        `Trip ${activeContract.tripsCompleted} complete. Earned ${quest.paymentPerTrip.toLocaleString()} credits.`
      );
    } else {
      addLog(
        gameData.log,
        gameTime,
        'trip_complete',
        `Trip ${activeContract.tripsCompleted}/${quest.tripsRequired === -1 ? '∞' : quest.tripsRequired} complete`
      );
    }

    // Check if contract is complete
    const isComplete =
      (quest.tripsRequired > 0 &&
        activeContract.tripsCompleted >= quest.tripsRequired) ||
      (quest.type === 'supply' &&
        activeContract.cargoDelivered >= quest.totalCargoRequired);

    if (isComplete) {
      // Contract complete
      if (quest.paymentOnCompletion > 0) {
        activeContract.creditsEarned += quest.paymentOnCompletion;
        ship.credits += quest.paymentOnCompletion;

        addLog(
          gameData.log,
          gameTime,
          'contract_complete',
          `Contract completed: ${quest.title}. Total earned: ${activeContract.creditsEarned.toLocaleString()} credits.`
        );
      } else {
        addLog(
          gameData.log,
          gameTime,
          'contract_complete',
          `Contract completed: ${quest.title}. Total earned: ${activeContract.creditsEarned.toLocaleString()} credits.`
        );
      }

      // Dock and clear contract
      ship.location.status = 'docked';
      ship.location.dockedAt = arrivalLocation.id;
      delete ship.location.flight;
      ship.engine.state = 'off';
      ship.engine.warmupProgress = 0;
      gameData.activeContract = null;
    } else {
      // Start next outbound leg
      activeContract.leg = 'outbound';

      // Dock briefly if origin has refuel
      if (arrivalLocation.services.includes('refuel')) {
        ship.fuel = Math.min(100, ship.fuel + 20); // Quick refuel
        addLog(
          gameData.log,
          gameTime,
          'refueled',
          `Refueled at ${arrivalLocation.name}`
        );
      }

      const nextOrigin = originLoc;
      const nextDestination = destLoc;
      ship.location.flight = initializeFlight(
        ship,
        nextOrigin,
        nextDestination,
        false
      );
      ship.engine.state = 'warming_up';
      ship.engine.warmupProgress = 0;

      addLog(
        gameData.log,
        gameTime,
        'departure',
        `Departed ${nextOrigin.name} en route to ${nextDestination.name}`
      );
    }
  }
}

/**
 * Pause contract at nearest port (dock on arrival)
 */
export function pauseContract(gameData: GameData): void {
  const { ship, activeContract } = gameData;

  if (!activeContract || !ship.location.flight) {
    return;
  }

  // Set flag to dock on arrival
  ship.location.flight.dockOnArrival = true;
  activeContract.paused = true;
}

/**
 * Resume paused contract
 */
export function resumeContract(gameData: GameData): void {
  const { ship, world, gameTime, activeContract } = gameData;

  if (!activeContract || !activeContract.paused) {
    return;
  }

  const quest = activeContract.quest;
  const originLoc = world.locations.find((l) => l.id === quest.origin);
  const destLoc = world.locations.find((l) => l.id === quest.destination);

  if (!originLoc || !destLoc) {
    return;
  }

  // Determine current location and next destination
  const currentLoc = ship.location.dockedAt
    ? world.locations.find((l) => l.id === ship.location.dockedAt)
    : null;

  if (!currentLoc) {
    return;
  }

  const nextDestination =
    activeContract.leg === 'outbound' ? destLoc : originLoc;

  // Undock and resume flight
  activeContract.paused = false;
  ship.location.status = 'in_flight';
  delete ship.location.dockedAt;

  ship.location.flight = initializeFlight(
    ship,
    currentLoc,
    nextDestination,
    false
  );
  ship.engine.state = 'warming_up';
  ship.engine.warmupProgress = 0;

  addLog(
    gameData.log,
    gameTime,
    'departure',
    `Resumed contract. Departed ${currentLoc.name} en route to ${nextDestination.name}`
  );
}

/**
 * Abandon active contract
 */
export function abandonContract(gameData: GameData): void {
  const { ship, world, gameTime, activeContract } = gameData;

  if (!activeContract) {
    return;
  }

  const quest = activeContract.quest;

  addLog(
    gameData.log,
    gameTime,
    'contract_abandoned',
    `Abandoned contract: ${quest.title}. Earned ${activeContract.creditsEarned.toLocaleString()} credits from completed trips.`
  );

  // Determine dock location
  let dockLocation: WorldLocation | undefined;

  if (ship.location.flight) {
    // In flight: dock at destination
    const destId = ship.location.flight.destination;
    dockLocation = world.locations.find((l) => l.id === destId);
  } else if (ship.location.dockedAt) {
    // Already docked
    dockLocation = world.locations.find((l) => l.id === ship.location.dockedAt);
  }

  if (dockLocation) {
    ship.location.status = 'docked';
    ship.location.dockedAt = dockLocation.id;
    delete ship.location.flight;
    ship.engine.state = 'off';
    ship.engine.warmupProgress = 0;
  }

  gameData.activeContract = null;
}
