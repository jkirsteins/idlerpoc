import type {
  GameData,
  Ship,
  ActiveContract,
  Quest,
  WorldLocation,
} from './models';
import { getShipCommander } from './models';
import { startShipFlight } from './flightPhysics';
import { addLog } from './logSystem';
import { formatFuelMass } from './ui/fuelFormatting';
import { formatCredits } from './formatting';
import { generateAllLocationQuests, resolveQuestForShip } from './questGen';
import { getDaysSinceEpoch, TICKS_PER_DAY } from './timeSystem';
import { generateHireableCrewByLocation } from './gameFactory';
import { awardEventSkillGains, logSkillUps } from './skillProgression';
import {
  checkAutoRefuel,
  autoRestartRouteTrip,
  setAcceptQuestFn,
} from './routeAssignment';
import { handleMiningRouteArrival } from './miningRoute';
import { emit } from './gameEvents';
import { getFuelPricePerKg } from './ui/refuelDialog';
import {
  generateFleetRescueQuests,
  completeRescueDelivery,
} from './rescueSystem';
import { recordDailySnapshot } from './dailyLedger';
import { unassignCrewFromAllSlots, getCrewForJobType } from './jobSlots';
import { getFleetAuraIncomeMultiplier } from './captainBonus';
import {
  awardMasteryXp,
  routeMasteryKey,
  tradeRouteMasteryKey,
  getCommercePoolPaymentBonus,
} from './masterySystem';
import { getBestCrewPool } from './crewRoles';

/**
 * Contract Execution
 *
 * Manages active contract state and transitions (per-ship)
 */

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
      `Auto-refueled ${ship.name} at ${location.name}: ${formatFuelMass(fuelNeededKg)} (${formatCredits(fullCost)})`,
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
    `${ship.name} cannot afford refuel at ${location.name} (${formatCredits(fullCost)} needed, have ${formatCredits(gameData.credits)})`,
    ship.name
  );
  return false;
}

/**
 * Regenerate quests if we've crossed a day boundary.
 * All non-trade-route quests are regenerated fresh each day.
 * Uses the full fleet for payment calculation so the reference ship
 * isn't arbitrarily whichever ship triggered the day boundary.
 */
export function regenerateQuestsIfNewDay(gameData: GameData): void {
  const currentDay = getDaysSinceEpoch(gameData.gameTime);
  if (currentDay > gameData.lastQuestRegenDay) {
    // Record ledger snapshot at day boundary
    recordDailySnapshot(gameData);

    gameData.availableQuests = generateAllLocationQuests(
      gameData.ships,
      gameData.world
    );
    gameData.lastQuestRegenDay = currentDay;

    // Inject rescue quests for stranded ships at all locations
    injectRescueQuests(gameData);

    // Regenerate hireable crew for all stations with hire service
    gameData.hireableCrewByLocation = generateHireableCrewByLocation(
      gameData.world
    );
  }
}

/**
 * Inject rescue quests for stranded ships into available quests.
 * Rescue quests appear at every location (fleet emergency broadcast).
 */
function injectRescueQuests(gameData: GameData): void {
  const rescueQuests = generateFleetRescueQuests(gameData);
  if (rescueQuests.length === 0) return;

  for (const location of gameData.world.locations) {
    const locationQuests = gameData.availableQuests[location.id] || [];
    // Remove stale rescue quests for ships that are no longer stranded
    const filtered = locationQuests.filter((q) => q.type !== 'rescue');
    // Add current rescue quests
    filtered.push(...rescueQuests);
    gameData.availableQuests[location.id] = filtered;
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
 * Add credits and track lifetime earnings.
 * When a ship is provided, applies the fleet coordination aura multiplier
 * based on the ship's proximity to the captain.
 */
function addCredits(gameData: GameData, amount: number, ship?: Ship): number {
  const auraMultiplier = ship
    ? getFleetAuraIncomeMultiplier(ship, gameData)
    : 1.0;

  // Commerce pool 95% checkpoint: +10% payment on all contracts
  const commercePoolMultiplier = ship
    ? 1 + getCommercePoolPaymentBonus(getBestCrewPool(ship.crew, 'commerce'))
    : 1.0;

  const boosted = Math.round(amount * auraMultiplier * commercePoolMultiplier);
  gameData.credits += boosted;
  gameData.lifetimeCreditsEarned += boosted;
  return boosted;
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
      logSkillUps(
        gameData.log,
        gameData.gameTime,
        ship.name,
        skillUps,
        gameData,
        ship
      );
    }

    const location = gameData.world.locations.find((l) => l.id === locationId);
    if (location) {
      emit(gameData, {
        type: 'first_visit',
        ship,
        locationId,
        locationName: location.name,
        distanceFromEarth: location.distanceFromEarth,
      });
    }
  }
}

// ─── Mastery XP helpers ──────────────────────────────────────────

/** Count total unique route pairs in the world (for mastery pool cap). */
function countRoutePairs(gameData: GameData): number {
  const n = gameData.world.locations.length;
  return (n * (n - 1)) / 2;
}

/**
 * Count total piloting mastery items: route pairs + gravity assist bodies.
 * Both route mastery and gravity assist mastery share the piloting pool,
 * so all callers must use the same count to prevent pool cap oscillation.
 */
export function countPilotingMasteryItems(gameData: GameData): number {
  // Avoid importing GRAVITY_BODIES to prevent circular dependency;
  // hardcoded count matches GRAVITY_BODIES.length in gravityAssistSystem.ts.
  const GRAVITY_BODY_COUNT = 5;
  return countRoutePairs(gameData) + GRAVITY_BODY_COUNT;
}

/** Base mastery XP per flight arrival / trip completion. */
const PILOTING_MASTERY_XP_PER_FLIGHT = 100;
const COMMERCE_MASTERY_XP_PER_TRIP = 100;

/** Register acceptQuest with routeAssignment to break circular dependency. */
export function initContractExec(): void {
  setAcceptQuestFn(acceptQuest);
}

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
  const totalItems = countPilotingMasteryItems(gameData);

  for (const crew of helmCrew) {
    awardMasteryXp(
      crew.mastery.piloting,
      key,
      PILOTING_MASTERY_XP_PER_FLIGHT,
      Math.floor(crew.skills.piloting),
      totalItems
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
  const captain = getShipCommander(ship);
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

  // Freeze resolved per-ship values into the contract snapshot so that
  // cargo, payment, fuel, and time are locked to the accepting ship's state.
  const resolvedQuest = resolveQuestForShip(quest, ship, world);

  const contract: ActiveContract = {
    quest: resolvedQuest,
    tripsCompleted: 0,
    cargoDelivered: 0,
    creditsEarned: 0,
    leg: 'outbound',
    paused: false,
    acceptedOnDay: getDaysSinceEpoch(gameTime),
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
    ship.flightProfileBurnFraction,
    gameTime,
    world
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
 * Dock ship at a location: clear flight plan, turn off engine,
 * and emit a `ship_docked` event so subscribers (provisions resupply,
 * etc.) can react to the transition.
 *
 * Single source of truth for the docked-at-location state transition.
 * All code that docks a ship **must** call this function.
 */
export function dockShipAtLocation(
  gameData: GameData,
  ship: Ship,
  locationId: string
): void {
  ship.location.status = 'docked';
  ship.location.dockedAt = locationId;
  delete ship.location.orbitingAt;
  delete ship.activeFlightPlan;
  ship.engine.state = 'off';
  ship.engine.warmupProgress = 0;

  emit(gameData, { type: 'ship_docked', ship, locationId });
}

/**
 * Try to refuel and depart for the next contract leg.
 *
 * Gates checked in order: player pause → fuel → helm.
 * On any failure the ship docks at departFrom and the contract pauses.
 * On success the ship is in-flight toward departTo.
 */
function tryDepartNextLeg(
  gameData: GameData,
  ship: Ship,
  departFrom: WorldLocation,
  departTo: WorldLocation,
  questTitle: string
): void {
  const activeContract = ship.activeContract!;
  const { gameTime } = gameData;

  // Player-initiated pause — dock here instead of continuing
  if (activeContract.paused) {
    dockShipAtLocation(gameData, ship, departFrom.id);
    addLog(
      gameData.log,
      gameTime,
      'arrival',
      `Docked at ${departFrom.name}. Contract "${questTitle}" paused.`,
      ship.name
    );
    checkFirstArrival(gameData, ship, departFrom.id);
    removeUnpaidCrew(gameData, ship);
    return;
  }

  // Auto-refuel before departure
  const hasFuel = tryAutoRefuelForLeg(gameData, ship, departFrom.id);
  if (!hasFuel) {
    activeContract.paused = true;
    gameData.isPaused = true;
    dockShipAtLocation(gameData, ship, departFrom.id);
    addLog(
      gameData.log,
      gameTime,
      'arrival',
      `Low fuel at ${departFrom.name}! Contract "${questTitle}" paused - refuel to continue.`,
      ship.name
    );
    checkFirstArrival(gameData, ship, departFrom.id);
    removeUnpaidCrew(gameData, ship);
    return;
  }

  // Try to depart
  const departed = startShipFlight(
    ship,
    departFrom,
    departTo,
    false,
    ship.flightProfileBurnFraction,
    gameTime,
    gameData.world
  );
  if (!departed) {
    activeContract.paused = true;
    dockShipAtLocation(gameData, ship, departFrom.id);
    addLog(
      gameData.log,
      gameTime,
      'arrival',
      `Helm unmanned at ${departFrom.name}! Contract "${questTitle}" paused — assign crew to helm.`,
      ship.name
    );
    checkFirstArrival(gameData, ship, departFrom.id);
    removeUnpaidCrew(gameData, ship);
    return;
  }

  addLog(
    gameData.log,
    gameTime,
    'departure',
    `Departed ${departFrom.name} en route to ${departTo.name} (${questTitle})`,
    ship.name
  );
}

/**
 * Complete current leg of a flight (manual or contract).
 */
export function completeLeg(gameData: GameData, ship: Ship): void {
  const { world, gameTime } = gameData;
  const activeContract = ship.activeContract;

  // ── Manual trip (no contract) ──────────────────────────────────
  if (!activeContract && ship.activeFlightPlan) {
    const flight = ship.activeFlightPlan;
    const destination = world.locations.find(
      (l) => l.id === flight.destination
    );
    if (destination) {
      if (flight.dockOnArrival) {
        dockShipAtLocation(gameData, ship, destination.id);
      } else {
        ship.location.status = 'orbiting';
        ship.location.orbitingAt = destination.id;
        delete ship.location.dockedAt;
        delete ship.activeFlightPlan;
        ship.engine.state = 'off';
        ship.engine.warmupProgress = 0;
      }

      addLog(
        gameData.log,
        gameTime,
        'arrival',
        `Arrived at ${destination.name}`,
        ship.name
      );

      awardPilotingRouteMastery(
        gameData,
        ship,
        flight.origin,
        flight.destination
      );

      checkFirstArrival(gameData, ship, destination.id);
      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData);

      // Mining route auto-continuation (sell ore, refuel, return to mine)
      handleMiningRouteArrival(gameData, ship);
    }
    return;
  }

  if (!activeContract || !ship.activeFlightPlan) {
    return;
  }

  // ── Contract flight ────────────────────────────────────────────
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

  awardPilotingRouteMastery(gameData, ship, quest.origin, quest.destination);

  // ── Deferred abandon — player chose "Abandon" while in-flight ──
  if (activeContract.abandonRequested) {
    // If arriving on the inbound leg, the round trip is complete — pay first
    if (activeContract.leg === 'inbound' && quest.paymentPerTrip > 0) {
      activeContract.tripsCompleted++;
      const tripEarned = addCredits(gameData, quest.paymentPerTrip, ship);
      activeContract.creditsEarned += tripEarned;
      ship.metrics.creditsEarned += tripEarned;

      if (ship.routeAssignment) {
        ship.routeAssignment.totalTripsCompleted++;
        ship.routeAssignment.creditsEarned += tripEarned;
        ship.routeAssignment.lastTripCompletedAt = gameTime;
      }

      addLog(
        gameData.log,
        gameTime,
        'payment',
        `Trip ${activeContract.tripsCompleted} complete. Earned ${formatCredits(tripEarned)}.`,
        ship.name
      );
    }

    dockShipAtLocation(gameData, ship, arrivalLocation.id);
    abandonContract(gameData, ship);
    checkFirstArrival(gameData, ship, arrivalLocation.id);
    removeUnpaidCrew(gameData, ship);
    regenerateQuestsIfNewDay(gameData);
    return;
  }

  // ── Deadline check — expire contract if past deadline ──────────
  if (quest.expiresAfterDays > 0 && activeContract.acceptedOnDay != null) {
    const currentDay = getDaysSinceEpoch(gameTime);
    const daysElapsed = currentDay - activeContract.acceptedOnDay;
    if (daysElapsed >= quest.expiresAfterDays) {
      const earned = activeContract.creditsEarned;
      addLog(
        gameData.log,
        gameTime,
        'contract_expired',
        `Contract expired: ${quest.title}. Deadline of ${quest.expiresAfterDays} days reached.${earned > 0 ? ` Kept ${formatCredits(earned)} earned from completed trips.` : ''}`,
        ship.name
      );
      dockShipAtLocation(gameData, ship, arrivalLocation.id);
      ship.activeContract = null;
      checkFirstArrival(gameData, ship, arrivalLocation.id);
      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData);
      return;
    }
  }

  // ── Outbound leg ───────────────────────────────────────────────
  if (activeContract.leg === 'outbound') {
    if (quest.type === 'rescue') {
      // Rescue quest: deliver fuel to stranded ship, then complete
      completeRescueDelivery(gameData, ship, quest);
      activeContract.tripsCompleted = 1;

      ship.metrics.contractsCompleted++;
      ship.metrics.lastActivityTime = gameTime;

      addLog(
        gameData.log,
        gameTime,
        'contract_complete',
        `Rescue mission completed: ${quest.title}`,
        ship.name
      );

      emit(gameData, {
        type: 'contract_completed',
        ship,
        questTitle: quest.title,
        tripsCompleted: 1,
        totalCreditsEarned: 0,
      });

      dockShipAtLocation(gameData, ship, arrivalLocation.id);
      ship.activeContract = null;

      checkFirstArrival(gameData, ship, arrivalLocation.id);
      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData);
      return;
    }

    if (quest.type === 'delivery' || quest.type === 'passenger') {
      // Single-leg contracts complete immediately
      activeContract.tripsCompleted = 1;
      const earned = addCredits(gameData, quest.paymentOnCompletion, ship);
      activeContract.creditsEarned = earned;

      ship.metrics.creditsEarned += earned;
      ship.metrics.contractsCompleted++;
      ship.metrics.lastActivityTime = gameTime;

      addLog(
        gameData.log,
        gameTime,
        'contract_complete',
        `Contract completed: ${quest.title}. Earned ${formatCredits(earned)}.`,
        ship.name
      );

      const skillUps = awardEventSkillGains(ship, {
        type: 'contract_completed',
        tripsCompleted: 1,
      });
      if (skillUps.length > 0) {
        logSkillUps(
          gameData.log,
          gameTime,
          ship.name,
          skillUps,
          gameData,
          ship
        );
      }

      awardCommerceRouteMastery(
        gameData,
        ship,
        quest.origin,
        quest.destination
      );

      emit(gameData, {
        type: 'contract_completed',
        ship,
        questTitle: quest.title,
        tripsCompleted: 1,
        totalCreditsEarned: earned,
      });

      dockShipAtLocation(gameData, ship, arrivalLocation.id);
      ship.activeContract = null;

      checkFirstArrival(gameData, ship, arrivalLocation.id);
      removeUnpaidCrew(gameData, ship);
      regenerateQuestsIfNewDay(gameData);
    } else {
      // Multi-leg: dock at waypoint (triggers provisions resupply etc.
      // via ship_docked event), then flip to inbound and try to continue
      activeContract.leg = 'inbound';
      dockShipAtLocation(gameData, ship, destLoc.id);
      tryDepartNextLeg(gameData, ship, destLoc, originLoc, quest.title);
    }
    return;
  }

  // ── Inbound leg ────────────────────────────────────────────────
  activeContract.tripsCompleted++;

  if (quest.paymentPerTrip > 0) {
    const tripEarned = addCredits(gameData, quest.paymentPerTrip, ship);
    activeContract.creditsEarned += tripEarned;

    ship.metrics.creditsEarned += tripEarned;

    if (ship.routeAssignment) {
      ship.routeAssignment.totalTripsCompleted++;
      ship.routeAssignment.creditsEarned += tripEarned;
      ship.routeAssignment.lastTripCompletedAt = gameTime;
    }

    addLog(
      gameData.log,
      gameTime,
      'payment',
      `Trip ${activeContract.tripsCompleted} complete. Earned ${formatCredits(tripEarned)}.`,
      ship.name
    );
  } else {
    let message = `Trip ${activeContract.tripsCompleted}/${quest.tripsRequired === -1 ? '\u221e' : quest.tripsRequired} complete`;
    if (quest.paymentOnCompletion > 0) {
      message += `. Payment of ${formatCredits(quest.paymentOnCompletion)} on contract completion.`;
    }
    addLog(gameData.log, gameTime, 'trip_complete', message, ship.name);
  }

  awardCommerceRouteMastery(gameData, ship, quest.origin, quest.destination);

  const isComplete =
    quest.tripsRequired > 0 &&
    activeContract.tripsCompleted >= quest.tripsRequired;

  if (isComplete) {
    if (quest.paymentOnCompletion > 0) {
      const completionEarned = addCredits(
        gameData,
        quest.paymentOnCompletion,
        ship
      );
      activeContract.creditsEarned += completionEarned;

      ship.metrics.creditsEarned += completionEarned;
    }

    ship.metrics.contractsCompleted++;
    ship.metrics.lastActivityTime = gameTime;

    addLog(
      gameData.log,
      gameTime,
      'contract_complete',
      `Contract completed: ${quest.title}. Total earned: ${formatCredits(activeContract.creditsEarned)}.`,
      ship.name
    );

    const skillUps = awardEventSkillGains(ship, {
      type: 'contract_completed',
      tripsCompleted: activeContract.tripsCompleted,
    });
    if (skillUps.length > 0) {
      logSkillUps(gameData.log, gameTime, ship.name, skillUps, gameData, ship);
    }

    emit(gameData, {
      type: 'contract_completed',
      ship,
      questTitle: quest.title,
      tripsCompleted: activeContract.tripsCompleted,
      totalCreditsEarned: activeContract.creditsEarned,
    });

    dockShipAtLocation(gameData, ship, arrivalLocation.id);

    const hasRouteAssignment = ship.routeAssignment !== null;

    ship.activeContract = null;

    checkFirstArrival(gameData, ship, arrivalLocation.id);
    removeUnpaidCrew(gameData, ship);
    regenerateQuestsIfNewDay(gameData);

    if (hasRouteAssignment) {
      checkAutoRefuel(gameData, ship, arrivalLocation.id);

      if (ship.routeAssignment) {
        autoRestartRouteTrip(gameData, ship);
      }
    }
  } else {
    // More trips needed — dock at waypoint (triggers provisions resupply
    // etc. via ship_docked event), then flip to outbound and try to continue
    activeContract.leg = 'outbound';
    dockShipAtLocation(gameData, ship, originLoc.id);
    tryDepartNextLeg(gameData, ship, originLoc, destLoc, quest.title);
  }
}

/**
 * Pause contract — ship will dock when the current leg completes
 * instead of continuing the route. `completeLeg` checks
 * `activeContract.paused` at every leg transition, so this single
 * flag is the only thing we need to set.
 */
export function pauseContract(ship: Ship): void {
  if (!ship.activeContract) {
    return;
  }

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
    ship.flightProfileBurnFraction,
    gameTime,
    world
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
    `Abandoned contract: ${quest.title}. Earned ${formatCredits(ship.activeContract.creditsEarned)} from completed trips.`,
    ship.name
  );

  if (ship.activeFlightPlan) {
    ship.activeFlightPlan.dockOnArrival = true;
  }

  ship.activeContract = null;

  regenerateQuestsIfNewDay(gameData);
}
