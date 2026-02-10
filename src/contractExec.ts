import type { GameData, Ship, ActiveContract, Quest } from './models';
import { startShipFlight } from './flightPhysics';
import { addLog } from './logSystem';
import { generateAllLocationQuests } from './questGen';
import { getDaysSinceEpoch, TICKS_PER_DAY } from './timeSystem';
import { generateHireableCrewByLocation } from './gameFactory';
import { awardEventSkillGains, logSkillUps } from './skillProgression';
import {
  checkAutoRefuel,
  autoRestartRouteTrip,
  setAcceptQuestFn,
} from './routeAssignment';
import { getFuelPricePerKg } from './ui/refuelDialog';
import { unassignCrewFromAllSlots, getCrewForJobType } from './jobSlots';
import {
  awardMasteryXp,
  routeMasteryKey,
  tradeRouteMasteryKey,
} from './masterySystem';

/**
 * Contract Execution
 *
 * Manages active contract state and transitions (per-ship)
 */

// Register acceptQuest with routeAssignment to break circular dependency.
// acceptQuest is a hoisted function declaration, so this is safe at top-level.
setAcceptQuestFn(acceptQuest);

/**
 * Auto-refuel a ship to 100% at a station between legs.
 * Always tops up the tank. If the ship can't afford a full refuel, auto-pauses.
 */
function tryAutoRefuelForLeg(
  gameData: GameData,
  ship: Ship,
  locationId: string
): boolean {
  const fuelNeededKg = ship.maxFuelKg - ship.fuelKg;
  if (fuelNeededKg <= 0) return true; // Already full

  const location = gameData.world.locations.find((l) => l.id === locationId);
  if (!location || !location.services.includes('refuel')) {
    return false;
  }

  const pricePerKg = getFuelPricePerKg(location, ship);
  const fullCost = Math.round(fuelNeededKg * pricePerKg);

  if (gameData.credits >= fullCost) {
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

  // Can't afford full tank — auto-pause
  gameData.isPaused = true;
  addLog(
    gameData.log,
    gameData.gameTime,
    'refueled',
    `${ship.name} cannot afford refuel at ${location.name} (${fullCost.toLocaleString()} cr needed, have ${gameData.credits.toLocaleString()} cr)`,
    ship.name
  );
  return false;
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

    unassignCrewFromAllSlots(ship, crew.id);

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
    const skillUps = awardEventSkillGains(ship, {
      type: 'first_arrival',
      locationId,
    });
    if (skillUps.length > 0) {
      logSkillUps(gameData.log, gameData.gameTime, ship.name, skillUps);
    }
  }
}

// ─── Mastery XP helpers ──────────────────────────────────────────

/** Count total unique route pairs in the world (for mastery pool cap). */
function countRoutePairs(gameData: GameData): number {
  const n = gameData.world.locations.length;
  return (n * (n - 1)) / 2;
}

/** Base mastery XP per flight arrival / trip completion. */
const PILOTING_MASTERY_XP_PER_FLIGHT = 100;
const COMMERCE_MASTERY_XP_PER_TRIP = 100;

/**
 * Award piloting route mastery XP to helm crew on flight arrival.
 */
function awardPilotingRouteMastery(
  gameData: GameData,
  ship: Ship,
  originId: string,
  destId: string
): void {
  const helmCrew = getCrewForJobType(ship, 'helm');
  const key = routeMasteryKey(originId, destId);
  const totalRoutes = countRoutePairs(gameData);

  for (const crew of helmCrew) {
    awardMasteryXp(
      crew.mastery.piloting,
      key,
      PILOTING_MASTERY_XP_PER_FLIGHT,
      Math.floor(crew.skills.piloting),
      totalRoutes
    );
  }
}

/**
 * Award commerce trade route mastery XP to the captain on trip completion.
 */
function awardCommerceRouteMastery(
  gameData: GameData,
  ship: Ship,
  originId: string,
  destId: string
): void {
  const captain = ship.crew.find((c) => c.isCaptain);
  if (!captain) return;
  const key = tradeRouteMasteryKey(originId, destId);
  const totalRoutes = countRoutePairs(gameData);

  awardMasteryXp(
    captain.mastery.commerce,
    key,
    COMMERCE_MASTERY_XP_PER_TRIP,
    Math.floor(captain.skills.commerce),
    totalRoutes
  );
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

  const departed = startShipFlight(
    ship,
    origin,
    destination,
    false,
    ship.flightProfileBurnFraction
  );

  if (!departed) {
    // No helm crew — cannot fly. Pause contract and stay docked.
    ship.activeContract.paused = true;
    addLog(
      gameData.log,
      gameTime,
      'contract_accepted',
      `Contract "${quest.title}" accepted but helm is unmanned — assign a crew member to helm to depart.`,
      ship.name
    );
    return;
  }

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

      // Award piloting mastery for manual flight
      awardPilotingRouteMastery(
        gameData,
        ship,
        flight.origin,
        flight.destination
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

  // Award piloting route mastery on every contract flight arrival
  awardPilotingRouteMastery(gameData, ship, quest.origin, quest.destination);

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
      const skillUps = awardEventSkillGains(ship, {
        type: 'contract_completed',
        tripsCompleted: 1,
      });
      if (skillUps.length > 0) {
        logSkillUps(gameData.log, gameTime, ship.name, skillUps);
      }

      // Award commerce mastery for delivery/passenger completion
      awardCommerceRouteMastery(
        gameData,
        ship,
        quest.origin,
        quest.destination
      );

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

      // Auto-refuel to 100% at destination before return trip
      const hasFuel = tryAutoRefuelForLeg(gameData, ship, arrivalLocation.id);

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

      const departed = startShipFlight(
        ship,
        nextOrigin,
        nextDestination,
        false,
        ship.flightProfileBurnFraction
      );

      if (!departed) {
        // No helm crew — pause contract at current location
        activeContract.paused = true;
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
          `Helm unmanned at ${arrivalLocation.name}! Contract "${quest.title}" paused — assign crew to helm.`,
          ship.name
        );

        checkFirstArrival(gameData, ship, arrivalLocation.id);
        removeUnpaidCrew(gameData, ship);
        return;
      }

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

    // Award commerce mastery for completing a round trip
    awardCommerceRouteMastery(gameData, ship, quest.origin, quest.destination);

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
      const skillUps = awardEventSkillGains(ship, {
        type: 'contract_completed',
        tripsCompleted: activeContract.tripsCompleted,
      });
      if (skillUps.length > 0) {
        logSkillUps(gameData.log, gameTime, ship.name, skillUps);
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

      // Auto-refuel to 100% at origin before next outbound trip
      const hasFuel = tryAutoRefuelForLeg(gameData, ship, arrivalLocation.id);

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

      const departed = startShipFlight(
        ship,
        nextOrigin,
        nextDestination,
        false,
        ship.flightProfileBurnFraction
      );

      if (!departed) {
        // No helm crew — pause contract at current location
        activeContract.paused = true;
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
          `Helm unmanned at ${arrivalLocation.name}! Contract "${quest.title}" paused — assign crew to helm.`,
          ship.name
        );

        checkFirstArrival(gameData, ship, arrivalLocation.id);
        removeUnpaidCrew(gameData, ship);
        return;
      }

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

  const departed = startShipFlight(
    ship,
    currentLoc,
    nextDestination,
    false,
    ship.flightProfileBurnFraction
  );

  if (!departed) {
    // No helm crew — stay paused
    addLog(
      gameData.log,
      gameTime,
      'departure',
      `Cannot resume contract — helm is unmanned. Assign crew to helm to depart.`,
      ship.name
    );
    return;
  }

  ship.activeContract.paused = false;

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
