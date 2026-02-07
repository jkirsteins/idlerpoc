import type { GameData, ActiveContract, Quest } from './models';
import {
  initializeFlight,
  computeMaxRange,
  calculateFuelCost,
} from './flightPhysics';
import { addLog } from './logSystem';
import { getShipClass } from './shipClasses';
import { generateAllLocationQuests } from './questGen';
import { getDaysSinceEpoch, TICKS_PER_DAY } from './timeSystem';
import { generateHireableCrew } from './gameFactory';
import { getEngineDefinition } from './engines';
import { getDistanceBetween } from './worldGen';

/**
 * Contract Execution
 *
 * Manages active contract state and transitions
 */

/**
 * Regenerate quests if we've crossed a day boundary
 */
function regenerateQuestsIfNewDay(gameData: GameData): void {
  const currentDay = getDaysSinceEpoch(gameData.gameTime);
  if (currentDay > gameData.lastQuestRegenDay) {
    gameData.availableQuests = generateAllLocationQuests(
      gameData.ship,
      gameData.world
    );
    gameData.lastQuestRegenDay = currentDay;

    // Also regenerate hireable crew
    gameData.hireableCrew = generateHireableCrew();
  }
}

/**
 * Remove unpaid crew on docking
 */
function removeUnpaidCrew(gameData: GameData): void {
  const { ship, gameTime } = gameData;
  const unpaidCrew = ship.crew.filter((c) => c.unpaidTicks > 0 && !c.isCaptain);

  for (const crew of unpaidCrew) {
    // Remove from ship.crew
    const crewIndex = ship.crew.indexOf(crew);
    if (crewIndex !== -1) {
      ship.crew.splice(crewIndex, 1);
    }

    // Remove from all rooms
    for (const room of ship.rooms) {
      const roomIndex = room.assignedCrewIds.indexOf(crew.id);
      if (roomIndex !== -1) {
        room.assignedCrewIds.splice(roomIndex, 1);
      }
    }

    // Log departure
    addLog(
      gameData.log,
      gameTime,
      'crew_departed',
      `${crew.name} departed due to unpaid wages (${Math.ceil(crew.unpaidTicks / TICKS_PER_DAY)} unpaid days)`
    );
  }
}

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

  // Handle manual trip completion (no contract)
  if (!activeContract && ship.location.flight) {
    const flight = ship.location.flight;
    if (flight.dockOnArrival) {
      const destination = world.locations.find(
        (l) => l.id === flight.destination
      );
      if (destination) {
        ship.location.status = 'docked';
        ship.location.dockedAt = destination.id;
        delete ship.location.flight;
        ship.engine.state = 'off';
        ship.engine.warmupProgress = 0;

        addLog(
          gameData.log,
          gameTime,
          'arrival',
          `Arrived at ${destination.name}`
        );

        // Remove unpaid crew
        removeUnpaidCrew(gameData);

        // Regenerate quests if new day
        regenerateQuestsIfNewDay(gameData);
      }
    }
    return;
  }

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

      // Remove unpaid crew
      removeUnpaidCrew(gameData);

      // Regenerate quests if new day
      regenerateQuestsIfNewDay(gameData);
    } else {
      // Freight/supply contracts: continue to inbound leg
      activeContract.leg = 'inbound';

      // Check if there's enough fuel for return leg
      const nextOrigin = destLoc;
      const nextDestination = originLoc;
      const distanceKm = getDistanceBetween(nextOrigin, nextDestination);

      // Calculate required fuel
      const shipClass = getShipClass(ship.classId);
      if (!shipClass) return;
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const maxRangeKm = computeMaxRange(shipClass, engineDef);
      const requiredFuel = calculateFuelCost(distanceKm, maxRangeKm);

      if (ship.fuel < requiredFuel * 1.1) {
        // Not enough fuel (need 10% buffer), pause contract
        activeContract.paused = true;
        ship.location.status = 'docked';
        ship.location.dockedAt = arrivalLocation.id;
        delete ship.location.flight;
        ship.engine.state = 'off';
        ship.engine.warmupProgress = 0;

        addLog(
          gameData.log,
          gameTime,
          'arrival',
          `Low fuel at ${arrivalLocation.name}! Contract "${quest.title}" paused - refuel to continue.`
        );

        // Remove unpaid crew
        removeUnpaidCrew(gameData);
        return;
      }

      // Start return leg
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
        `Departed ${nextOrigin.name} en route to ${nextDestination.name} (${quest.title})`
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

      // Remove unpaid crew
      removeUnpaidCrew(gameData);

      // Regenerate quests if new day
      regenerateQuestsIfNewDay(gameData);
    } else {
      // Start next outbound leg
      activeContract.leg = 'outbound';

      // Check if there's enough fuel for next outbound leg
      const nextOrigin = originLoc;
      const nextDestination = destLoc;
      const distanceKm = getDistanceBetween(nextOrigin, nextDestination);

      // Calculate required fuel
      const shipClass = getShipClass(ship.classId);
      if (!shipClass) return;
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const maxRangeKm = computeMaxRange(shipClass, engineDef);
      const requiredFuel = calculateFuelCost(distanceKm, maxRangeKm);

      if (ship.fuel < requiredFuel * 1.1) {
        // Not enough fuel (need 10% buffer), pause contract
        activeContract.paused = true;
        ship.location.status = 'docked';
        ship.location.dockedAt = arrivalLocation.id;
        delete ship.location.flight;
        ship.engine.state = 'off';
        ship.engine.warmupProgress = 0;

        addLog(
          gameData.log,
          gameTime,
          'arrival',
          `Low fuel at ${arrivalLocation.name}! Contract "${quest.title}" paused - refuel to continue.`
        );

        // Remove unpaid crew
        removeUnpaidCrew(gameData);
        return;
      }

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
        `Departed ${nextOrigin.name} en route to ${nextDestination.name} (${quest.title})`
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
  const { ship, gameTime, activeContract } = gameData;

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

  if (ship.location.flight) {
    // Mid-flight: let the flight finish naturally, dock on arrival
    ship.location.flight.dockOnArrival = true;
  }
  // If already docked: nothing to do, ship stays docked

  gameData.activeContract = null;

  // Regenerate quests if new day
  regenerateQuestsIfNewDay(gameData);
}
