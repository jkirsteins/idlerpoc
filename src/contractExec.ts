import type { GameData, Ship, ActiveContract, Quest } from './models';
import { initializeFlight, calculateOneLegFuelKg } from './flightPhysics';
import { addLog } from './logSystem';
import { generateAllLocationQuests } from './questGen';
import { getDaysSinceEpoch, TICKS_PER_DAY } from './timeSystem';
import { generateHireableCrewByLocation } from './gameFactory';
import { getDistanceBetween } from './worldGen';
import { awardEventXP, logLevelUps } from './skillProgression';
import { checkAutoRefuel, autoRestartRouteTrip } from './routeAssignment';
import { getFuelPricePerKg } from './ui/refuelDialog';

/**
 * Contract Execution
 *
 * Manages active contract state and transitions (per-ship)
 */

/**
 * Try to auto-refuel a ship at a station before continuing to the next leg.
 * Uses location-based fuel pricing. Returns true if the ship now has enough fuel.
 *
 * For route-assigned ships with autoRefuel enabled, also proactively refuels
 * when fuel percentage drops below the configured threshold (default 30%).
 * This prevents gradual fuel depletion where each leg uses slightly less fuel
 * than the previous (lighter ship = less fuel needed), causing the "enough for
 * next leg" check to always pass while the tank slowly drains.
 */
function tryAutoRefuelForLeg(
  gameData: GameData,
  ship: Ship,
  locationId: string,
  requiredFuelKg: number
): boolean {
  const hasEnoughForLeg = ship.fuelKg >= requiredFuelKg * 1.1;

  // For route-assigned ships, also check percentage threshold
  let belowThreshold = false;
  if (ship.routeAssignment?.autoRefuel) {
    const fuelPercentage = (ship.fuelKg / ship.maxFuelKg) * 100;
    belowThreshold = fuelPercentage < ship.routeAssignment.autoRefuelThreshold;
  }

  // No refuel needed if enough fuel for leg AND above threshold
  if (hasEnoughForLeg && !belowThreshold) return true;

  const location = gameData.world.locations.find((l) => l.id === locationId);
  if (!location || !location.services.includes('refuel')) {
    return hasEnoughForLeg; // Can't refuel, but may still have enough for next leg
  }

  const fuelNeededKg = ship.maxFuelKg - ship.fuelKg;
  if (fuelNeededKg <= 0) return true; // Already full

  const pricePerKg = getFuelPricePerKg(location);
  const fullCost = Math.round(fuelNeededKg * pricePerKg);

  if (gameData.credits >= fullCost) {
    // Can afford full tank
    ship.fuelKg = ship.maxFuelKg;
    gameData.credits -= fullCost;
    ship.metrics.fuelCostsPaid += fullCost;

    addLog(
      gameData.log,
      gameData.gameTime,
      'refueled',
      `Auto-refueled ${ship.name} at ${location.name}: ${Math.round(fuelNeededKg).toLocaleString()} kg (${fullCost.toLocaleString()} cr)`,
      ship.name
    );
    return true;
  }

  // Can't afford full tank — buy as much as we can
  const affordableKg = Math.floor(gameData.credits / pricePerKg);
  if (affordableKg > 0) {
    const partialCost = Math.round(affordableKg * pricePerKg);
    ship.fuelKg += affordableKg;
    gameData.credits -= partialCost;
    ship.metrics.fuelCostsPaid += partialCost;

    addLog(
      gameData.log,
      gameData.gameTime,
      'refueled',
      `Partial refuel ${ship.name} at ${location.name}: ${affordableKg.toLocaleString()} kg (${partialCost.toLocaleString()} cr, low funds)`,
      ship.name
    );
  }

  // If we couldn't refuel enough, pause and alert
  if (ship.fuelKg < requiredFuelKg * 1.1) {
    gameData.isPaused = true;
    addLog(
      gameData.log,
      gameData.gameTime,
      'refueled',
      `${ship.name} cannot afford fuel at ${location.name} (need ${Math.round(requiredFuelKg).toLocaleString()} kg, have ${Math.round(ship.fuelKg).toLocaleString()} kg)`,
      ship.name
    );
  }

  return ship.fuelKg >= requiredFuelKg * 1.1;
}

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
 * Award first-arrival XP if this is the ship's first visit to a location.
 * Mutates gameData.visitedLocations.
 */
function checkFirstArrival(
  gameData: GameData,
  ship: Ship,
  locationId: string
): void {
  if (!gameData.visitedLocations.includes(locationId)) {
    gameData.visitedLocations.push(locationId);
    const levelUps = awardEventXP(ship, {
      type: 'first_arrival',
      locationId,
    });
    if (levelUps.length > 0) {
      logLevelUps(gameData.log, gameData.gameTime, ship.name, levelUps);
    }
  }
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
  delete ship.location.orbitingAt;

  ship.activeFlightPlan = initializeFlight(ship, origin, destination, false);

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
  if (!activeContract && ship.activeFlightPlan) {
    const flight = ship.activeFlightPlan;
    const destination = world.locations.find(
      (l) => l.id === flight.destination
    );
    if (destination) {
      if (flight.dockOnArrival) {
        ship.location.status = 'docked';
        ship.location.dockedAt = destination.id;
        delete ship.location.orbitingAt;
      } else {
        ship.location.status = 'orbiting';
        ship.location.orbitingAt = destination.id;
      }
      delete ship.activeFlightPlan;
      ship.engine.state = 'off';
      ship.engine.warmupProgress = 0;

      addLog(
        gameData.log,
        gameTime,
        'arrival',
        `Arrived at ${destination.name}`,
        ship.name
      );

      checkFirstArrival(gameData, ship, destination.id);
      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData, ship);
    }
    return;
  }

  if (!activeContract || !ship.activeFlightPlan) {
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

      // Track per-ship earnings
      ship.metrics.creditsEarned += quest.paymentOnCompletion;
      ship.metrics.contractsCompleted++;
      ship.metrics.lastActivityTime = gameTime;

      addLog(
        gameData.log,
        gameTime,
        'contract_complete',
        `Contract completed: ${quest.title}. Earned ${quest.paymentOnCompletion.toLocaleString()} credits.`,
        ship.name
      );

      // Award contract completion XP
      const levelUps = awardEventXP(ship, {
        type: 'contract_completed',
        tripsCompleted: 1,
      });
      if (levelUps.length > 0) {
        logLevelUps(gameData.log, gameTime, ship.name, levelUps);
      }

      ship.location.status = 'docked';
      ship.location.dockedAt = arrivalLocation.id;
      delete ship.location.orbitingAt;
      delete ship.activeFlightPlan;
      ship.engine.state = 'off';
      ship.engine.warmupProgress = 0;
      ship.activeContract = null;

      checkFirstArrival(gameData, ship, arrivalLocation.id);
      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData, ship);
    } else {
      activeContract.leg = 'inbound';

      const nextOrigin = destLoc;
      const nextDestination = originLoc;
      const distanceKm = getDistanceBetween(nextOrigin, nextDestination);

      // Calculate fuel required for return leg (burn-coast-burn aware)
      const requiredFuelKg = calculateOneLegFuelKg(ship, distanceKm);

      // Auto-refuel at destination before return trip
      const hasFuel = tryAutoRefuelForLeg(
        gameData,
        ship,
        arrivalLocation.id,
        requiredFuelKg
      );

      if (!hasFuel) {
        activeContract.paused = true;
        gameData.isPaused = true;
        ship.location.status = 'docked';
        ship.location.dockedAt = arrivalLocation.id;
        delete ship.location.orbitingAt;
        delete ship.activeFlightPlan;
        ship.engine.state = 'off';
        ship.engine.warmupProgress = 0;

        addLog(
          gameData.log,
          gameTime,
          'arrival',
          `Low fuel at ${arrivalLocation.name}! Contract "${quest.title}" paused - refuel to continue.`,
          ship.name
        );

        checkFirstArrival(gameData, ship, arrivalLocation.id);
        removeUnpaidCrew(gameData, ship);
        return;
      }

      ship.activeFlightPlan = initializeFlight(
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

      // Track per-ship earnings
      ship.metrics.creditsEarned += quest.paymentPerTrip;

      // Track route assignment earnings
      if (ship.routeAssignment) {
        ship.routeAssignment.totalTripsCompleted++;
        ship.routeAssignment.creditsEarned += quest.paymentPerTrip;
        ship.routeAssignment.lastTripCompletedAt = gameTime;
      }

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

        // Track per-ship earnings
        ship.metrics.creditsEarned += quest.paymentOnCompletion;
      }

      // Track contract completion
      ship.metrics.contractsCompleted++;
      ship.metrics.lastActivityTime = gameTime;

      addLog(
        gameData.log,
        gameTime,
        'contract_complete',
        `Contract completed: ${quest.title}. Total earned: ${activeContract.creditsEarned.toLocaleString()} credits.`,
        ship.name
      );

      // Award contract completion XP (scales with trips completed)
      const levelUps = awardEventXP(ship, {
        type: 'contract_completed',
        tripsCompleted: activeContract.tripsCompleted,
      });
      if (levelUps.length > 0) {
        logLevelUps(gameData.log, gameTime, ship.name, levelUps);
      }

      ship.location.status = 'docked';
      ship.location.dockedAt = arrivalLocation.id;
      delete ship.location.orbitingAt;
      delete ship.activeFlightPlan;
      ship.engine.state = 'off';
      ship.engine.warmupProgress = 0;

      // Check for route assignment auto-restart BEFORE clearing contract
      const hasRouteAssignment = ship.routeAssignment !== null;

      ship.activeContract = null;

      checkFirstArrival(gameData, ship, arrivalLocation.id);
      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData, ship);

      // Auto-restart route if ship is assigned to automated route
      if (hasRouteAssignment) {
        // Check auto-refuel before starting next trip
        checkAutoRefuel(gameData, ship, arrivalLocation.id);

        // Auto-restart next trip (only if route still assigned - may be removed by failed refuel)
        if (ship.routeAssignment) {
          autoRestartRouteTrip(gameData, ship);
        }
      }
    } else {
      activeContract.leg = 'outbound';

      const nextOrigin = originLoc;
      const nextDestination = destLoc;
      const distanceKm = getDistanceBetween(nextOrigin, nextDestination);

      // Calculate fuel required for next leg (burn-coast-burn aware)
      const requiredFuelKg = calculateOneLegFuelKg(ship, distanceKm);

      // Auto-refuel at origin before next outbound trip
      const hasFuel = tryAutoRefuelForLeg(
        gameData,
        ship,
        arrivalLocation.id,
        requiredFuelKg
      );

      if (!hasFuel) {
        activeContract.paused = true;
        gameData.isPaused = true;
        ship.location.status = 'docked';
        ship.location.dockedAt = arrivalLocation.id;
        delete ship.location.orbitingAt;
        delete ship.activeFlightPlan;
        ship.engine.state = 'off';
        ship.engine.warmupProgress = 0;

        addLog(
          gameData.log,
          gameTime,
          'arrival',
          `Low fuel at ${arrivalLocation.name}! Contract "${quest.title}" paused - refuel to continue.`,
          ship.name
        );

        checkFirstArrival(gameData, ship, arrivalLocation.id);
        removeUnpaidCrew(gameData, ship);
        return;
      }

      ship.activeFlightPlan = initializeFlight(
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
  if (!ship.activeContract || !ship.activeFlightPlan) {
    return;
  }

  ship.activeFlightPlan.dockOnArrival = true;
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
  delete ship.location.orbitingAt;

  ship.activeFlightPlan = initializeFlight(
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

  if (ship.activeFlightPlan) {
    ship.activeFlightPlan.dockOnArrival = true;
  }

  ship.activeContract = null;

  regenerateQuestsIfNewDay(gameData, ship);
}
