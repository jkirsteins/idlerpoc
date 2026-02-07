import type { GameData, Ship, ActiveContract, Quest } from './models';
import {
  initializeFlight,
  computeMaxRange,
  calculateFuelCost,
} from './flightPhysics';
import { addLog } from './logSystem';
import { getShipClass } from './shipClasses';
import { generateAllLocationQuests } from './questGen';
import { getDaysSinceEpoch, TICKS_PER_DAY } from './timeSystem';
import { generateHireableCrewByLocation } from './gameFactory';
import { getEngineDefinition } from './engines';
import { getDistanceBetween } from './worldGen';

/**
 * Contract Execution
 *
 * Manages active contract state and transitions (per-ship)
 */

/**
 * Get location IDs where player ships are docked
 */
function getDockedLocationIds(gameData: GameData): string[] {
  const ids = new Set<string>();
  for (const ship of gameData.ships) {
    if (ship.location.status === 'docked' && ship.location.dockedAt) {
      ids.add(ship.location.dockedAt);
    }
  }
  return Array.from(ids);
}

/**
 * Regenerate quests if we've crossed a day boundary
 */
function regenerateQuestsIfNewDay(gameData: GameData, ship: Ship): void {
  const currentDay = getDaysSinceEpoch(gameData.gameTime);
  if (currentDay > gameData.lastQuestRegenDay) {
    gameData.availableQuests = generateAllLocationQuests(ship, gameData.world);
    gameData.lastQuestRegenDay = currentDay;

    // Regenerate hireable crew only for stations with docked ships
    const dockedIds = getDockedLocationIds(gameData);
    gameData.hireableCrewByLocation = generateHireableCrewByLocation(
      gameData.world,
      dockedIds
    );
  }
}

/**
 * Remove unpaid crew on docking
 */
function removeUnpaidCrew(gameData: GameData, ship: Ship): void {
  const unpaidCrew = ship.crew.filter((c) => c.unpaidTicks > 0 && !c.isCaptain);

  for (const crew of unpaidCrew) {
    const crewIndex = ship.crew.indexOf(crew);
    if (crewIndex !== -1) {
      ship.crew.splice(crewIndex, 1);
    }

    for (const room of ship.rooms) {
      const roomIndex = room.assignedCrewIds.indexOf(crew.id);
      if (roomIndex !== -1) {
        room.assignedCrewIds.splice(roomIndex, 1);
      }
    }

    addLog(
      gameData.log,
      gameData.gameTime,
      'crew_departed',
      `${crew.name} departed due to unpaid wages (${Math.ceil(crew.unpaidTicks / TICKS_PER_DAY)} unpaid days)`,
      ship.name
    );
  }
}

/**
 * Add credits and track lifetime earnings
 */
function addCredits(gameData: GameData, amount: number): void {
  gameData.credits += amount;
  gameData.lifetimeCreditsEarned += amount;
}

/**
 * Start a contract by accepting a quest
 */
export function acceptQuest(
  gameData: GameData,
  ship: Ship,
  quest: Quest
): void {
  const { world, gameTime } = gameData;

  const contract: ActiveContract = {
    quest,
    tripsCompleted: 0,
    cargoDelivered: 0,
    creditsEarned: 0,
    leg: 'outbound',
    paused: false,
  };

  ship.activeContract = contract;

  addLog(
    gameData.log,
    gameTime,
    'contract_accepted',
    `Accepted contract: ${quest.title}`,
    ship.name
  );

  const origin = world.locations.find((l) => l.id === quest.origin);
  const destination = world.locations.find((l) => l.id === quest.destination);

  if (!origin || !destination) {
    throw new Error('Invalid quest locations');
  }

  ship.location.status = 'in_flight';
  delete ship.location.dockedAt;

  ship.location.flight = initializeFlight(ship, origin, destination, false);

  ship.engine.state = 'warming_up';
  ship.engine.warmupProgress = 0;

  addLog(
    gameData.log,
    gameTime,
    'departure',
    `Departed ${origin.name} en route to ${destination.name}`,
    ship.name
  );
}

/**
 * Complete current leg of contract flight
 */
export function completeLeg(gameData: GameData, ship: Ship): void {
  const { world, gameTime } = gameData;
  const activeContract = ship.activeContract;

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
          `Arrived at ${destination.name}`,
          ship.name
        );

        removeUnpaidCrew(gameData, ship);
        regenerateQuestsIfNewDay(gameData, ship);
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

  addLog(
    gameData.log,
    gameTime,
    'arrival',
    `Arrived at ${arrivalLocation.name}`,
    ship.name
  );

  if (activeContract.leg === 'outbound') {
    if (quest.type === 'delivery' || quest.type === 'passenger') {
      activeContract.tripsCompleted = 1;
      activeContract.creditsEarned = quest.paymentOnCompletion;
      addCredits(gameData, quest.paymentOnCompletion);

      addLog(
        gameData.log,
        gameTime,
        'contract_complete',
        `Contract completed: ${quest.title}. Earned ${quest.paymentOnCompletion.toLocaleString()} credits.`,
        ship.name
      );

      ship.location.status = 'docked';
      ship.location.dockedAt = arrivalLocation.id;
      delete ship.location.flight;
      ship.engine.state = 'off';
      ship.engine.warmupProgress = 0;
      ship.activeContract = null;

      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData, ship);
    } else {
      activeContract.leg = 'inbound';

      const nextOrigin = destLoc;
      const nextDestination = originLoc;
      const distanceKm = getDistanceBetween(nextOrigin, nextDestination);

      const shipClass = getShipClass(ship.classId);
      if (!shipClass) return;
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const maxRangeKm = computeMaxRange(shipClass, engineDef);
      const requiredFuel = calculateFuelCost(distanceKm, maxRangeKm);

      if (ship.fuel < requiredFuel * 1.1) {
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
          `Low fuel at ${arrivalLocation.name}! Contract "${quest.title}" paused - refuel to continue.`,
          ship.name
        );

        removeUnpaidCrew(gameData, ship);
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
        `Departed ${nextOrigin.name} en route to ${nextDestination.name} (${quest.title})`,
        ship.name
      );
    }
  } else {
    activeContract.tripsCompleted++;

    if (quest.type === 'supply') {
      activeContract.cargoDelivered += quest.cargoRequired;
    }

    if (quest.paymentPerTrip > 0) {
      activeContract.creditsEarned += quest.paymentPerTrip;
      addCredits(gameData, quest.paymentPerTrip);

      addLog(
        gameData.log,
        gameTime,
        'payment',
        `Trip ${activeContract.tripsCompleted} complete. Earned ${quest.paymentPerTrip.toLocaleString()} credits.`,
        ship.name
      );
    } else {
      let message = `Trip ${activeContract.tripsCompleted}/${quest.tripsRequired === -1 ? '\u221e' : quest.tripsRequired} complete`;
      if (quest.paymentOnCompletion > 0) {
        message += `. Payment of ${quest.paymentOnCompletion.toLocaleString()} credits on contract completion.`;
      }
      addLog(gameData.log, gameTime, 'trip_complete', message, ship.name);
    }

    const isComplete =
      (quest.tripsRequired > 0 &&
        activeContract.tripsCompleted >= quest.tripsRequired) ||
      (quest.type === 'supply' &&
        activeContract.cargoDelivered >= quest.totalCargoRequired);

    if (isComplete) {
      if (quest.paymentOnCompletion > 0) {
        activeContract.creditsEarned += quest.paymentOnCompletion;
        addCredits(gameData, quest.paymentOnCompletion);
      }

      addLog(
        gameData.log,
        gameTime,
        'contract_complete',
        `Contract completed: ${quest.title}. Total earned: ${activeContract.creditsEarned.toLocaleString()} credits.`,
        ship.name
      );

      ship.location.status = 'docked';
      ship.location.dockedAt = arrivalLocation.id;
      delete ship.location.flight;
      ship.engine.state = 'off';
      ship.engine.warmupProgress = 0;
      ship.activeContract = null;

      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData, ship);
    } else {
      activeContract.leg = 'outbound';

      const nextOrigin = originLoc;
      const nextDestination = destLoc;
      const distanceKm = getDistanceBetween(nextOrigin, nextDestination);

      const shipClass = getShipClass(ship.classId);
      if (!shipClass) return;
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const maxRangeKm = computeMaxRange(shipClass, engineDef);
      const requiredFuel = calculateFuelCost(distanceKm, maxRangeKm);

      if (ship.fuel < requiredFuel * 1.1) {
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
          `Low fuel at ${arrivalLocation.name}! Contract "${quest.title}" paused - refuel to continue.`,
          ship.name
        );

        removeUnpaidCrew(gameData, ship);
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
        `Departed ${nextOrigin.name} en route to ${nextDestination.name} (${quest.title})`,
        ship.name
      );
    }
  }
}

/**
 * Pause contract at nearest port (dock on arrival)
 */
export function pauseContract(ship: Ship): void {
  if (!ship.activeContract || !ship.location.flight) {
    return;
  }

  ship.location.flight.dockOnArrival = true;
  ship.activeContract.paused = true;
}

/**
 * Resume paused contract
 */
export function resumeContract(gameData: GameData, ship: Ship): void {
  const { world, gameTime } = gameData;

  if (!ship.activeContract || !ship.activeContract.paused) {
    return;
  }

  const quest = ship.activeContract.quest;
  const originLoc = world.locations.find((l) => l.id === quest.origin);
  const destLoc = world.locations.find((l) => l.id === quest.destination);

  if (!originLoc || !destLoc) {
    return;
  }

  const currentLoc = ship.location.dockedAt
    ? world.locations.find((l) => l.id === ship.location.dockedAt)
    : null;

  if (!currentLoc) {
    return;
  }

  const nextDestination =
    ship.activeContract.leg === 'outbound' ? destLoc : originLoc;

  ship.activeContract.paused = false;
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
    `Resumed contract. Departed ${currentLoc.name} en route to ${nextDestination.name}`,
    ship.name
  );
}

/**
 * Abandon active contract
 */
export function abandonContract(gameData: GameData, ship: Ship): void {
  if (!ship.activeContract) {
    return;
  }

  const quest = ship.activeContract.quest;

  addLog(
    gameData.log,
    gameData.gameTime,
    'contract_abandoned',
    `Abandoned contract: ${quest.title}. Earned ${ship.activeContract.creditsEarned.toLocaleString()} credits from completed trips.`,
    ship.name
  );

  if (ship.location.flight) {
    ship.location.flight.dockOnArrival = true;
  }

  ship.activeContract = null;

  regenerateQuestsIfNewDay(gameData, ship);
}
