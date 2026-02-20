// Game Tick - Master tick system for swarm simulation

import type {
  GameData,
  Worker,
  Egg,
  LogEntry,
  Zone,
} from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import { updatePlanetPositions } from './trappist1Data';
import {
  processQueenLaying,
  processEggGestation,
  processWorkerTick,
  assignOrders,
  createLogEntry,
  createWorker,
} from './swarmSystem';
import { processMetabolismCascade } from './metabolismCascade';
import { gainForagingSkill, gainMasteryXp } from './foragingSystem';
import { emitSwarm } from './swarmEvents';
import {
  calculateTotalNeuralCapacity,
  calculateNeuralLoad,
  calculateCoordinationEfficiency,
  calculateEnergyBalance,
  createDailySummary,
  formatDailySummary,
} from './populationSystem';

// ============================================================================
// TICK PROCESSING
// ============================================================================

export interface TickResult {
  workersHatched: number;
  workersDied: number;
  queensDied: number;
  eggsLaid: number;
  eggsHatched: number;
  netEnergy: number;
  logEntries: LogEntry[];
}

export function applyTick(
  data: GameData,
  currentTime: number,
  forcedTicks?: number
): TickResult {
  const result: TickResult = {
    workersHatched: 0,
    workersDied: 0,
    queensDied: 0,
    eggsLaid: 0,
    eggsHatched: 0,
    netEnergy: 0,
    logEntries: [],
  };

  const elapsedTicks =
    typeof forcedTicks === 'number'
      ? Math.floor(forcedTicks)
      : Math.floor((currentTime - data.lastTickTimestamp) / 1000);
  if (elapsedTicks <= 0) return result;

  // Cap at reasonable max for realtime path (forced ticks are pre-batched externally)
  const ticksToProcess =
    typeof forcedTicks === 'number'
      ? elapsedTicks
      : Math.min(elapsedTicks, SWARM_CONSTANTS.TICKS_PER_DAY);

  // Process each tick
  for (let i = 0; i < ticksToProcess; i++) {
    const tickResult = processSingleTick(data);

    result.workersHatched += tickResult.workersHatched;
    result.workersDied += tickResult.workersDied;
    result.queensDied += tickResult.queensDied;
    result.eggsLaid += tickResult.eggsLaid;
    result.eggsHatched += tickResult.eggsHatched;
    result.netEnergy += tickResult.netEnergy;
    result.logEntries.push(...tickResult.logEntries);

    data.gameTime += 1;
  }

  data.lastTickTimestamp = currentTime;

  // Check for day boundary and generate summary
  const currentDay = Math.floor(data.gameTime / SWARM_CONSTANTS.TICKS_PER_DAY);
  const lastRecordedDay =
    data.dailyStats.length > 0
      ? data.dailyStats[data.dailyStats.length - 1].day
      : -1;

  if (currentDay > lastRecordedDay) {
    const summary = createDailySummary(
      currentDay,
      data,
      { workers: result.workersDied, queens: result.queensDied },
      result.workersHatched,
      result.eggsLaid,
      result.netEnergy
    );

    data.dailyStats.push(summary);

    // Log the summary
    result.logEntries.push(
      createLogEntry('daily_summary', formatDailySummary(summary), { summary })
    );
  }

  return result;
}

// ============================================================================
// SINGLE TICK PROCESSING
// ============================================================================

interface SingleTickResult {
  workersHatched: number;
  workersDied: number;
  queensDied: number;
  eggsLaid: number;
  eggsHatched: number;
  netEnergy: number;
  logEntries: LogEntry[];
}

function processSingleTick(data: GameData): SingleTickResult {
  const result: SingleTickResult = {
    workersHatched: 0,
    workersDied: 0,
    queensDied: 0,
    eggsLaid: 0,
    eggsHatched: 0,
    netEnergy: 0,
    logEntries: [],
  };

  const { swarm, planets } = data;

  // 1. Update planet positions
  updatePlanetPositions(planets, data.gameTime);

  // 2. Calculate neural efficiency BEFORE worker processing so it
  //    constrains gathering rates (the core homeostatic mechanism).
  const neuralCapacity = calculateTotalNeuralCapacity(swarm.queens);
  const neuralLoad = calculateNeuralLoad(swarm.workers.length, neuralCapacity);
  const efficiency = calculateCoordinationEfficiency(neuralLoad);

  // 2b. Build zone ID map + queen→zone cache + regrowth.
  //     Only needed when workers exist (no biomass consumed → no regrowth needed).
  //     Zone ID map enables O(1) lookups for worker.assignedZoneId.
  //     Regrowth runs on ALL harvesting zones, not just queen zones.
  const zoneIdMap = new Map<string, Zone>();
  const queenZoneCache = new Map<string, Zone | undefined>();

  if (swarm.workers.length > 0) {
    for (const planet of planets) {
      for (const zone of planet.zones) {
        zoneIdMap.set(zone.id, zone);

        // Zone regrowth — once per tick, before workers gather.
        if (zone.state === 'harvesting' && zone.biomassRate > 0) {
          const maxBiomass = zone.biomassRate * 1000;
          if (zone.biomassAvailable < maxBiomass) {
            zone.biomassAvailable = Math.min(
              zone.biomassAvailable + zone.biomassRate,
              maxBiomass
            );
          }
        }
      }
    }
  }

  for (const queen of swarm.queens) {
    if (zoneIdMap.size > 0) {
      queenZoneCache.set(queen.id, zoneIdMap.get(queen.locationZoneId));
    }
  }

  // 3. Process each queen (universal metabolism cascade)
  for (const queen of swarm.queens) {
    // Dormancy: isolated queen with depleted reserves enters hibernation
    // at reduced metabolism to survive extended absences.
    const wasAlreadyDormant = queen.isDormant === true;
    if (queen.isDormant) {
      // Wake up if buffer refueled or workers exist
      if (queen.biomassBuffer.current > 0 || swarm.workers.length > 0) {
        queen.isDormant = false;
      }
    }
    if (
      !queen.isDormant &&
      queen.energy.current <
        queen.energy.max * SWARM_CONSTANTS.QUEEN_DORMANCY_ENERGY_THRESHOLD &&
      swarm.workers.length === 0 &&
      queen.biomassBuffer.current <= 0
    ) {
      queen.isDormant = true;
      if (!wasAlreadyDormant) {
        result.logEntries.push(
          createLogEntry(
            'daily_summary',
            'Queen entered dormancy — no workers, reserves critical',
            {
              queenId: queen.id,
            }
          )
        );
      }
    }

    // Apply reduced metabolism when dormant
    const savedMetabolism = queen.metabolismPerTick;
    if (queen.isDormant) {
      queen.metabolismPerTick *=
        SWARM_CONSTANTS.QUEEN_DORMANCY_METABOLISM_FACTOR;
    }
    const cascadeResult = processMetabolismCascade(queen);
    queen.metabolismPerTick = savedMetabolism; // Restore original rate

    if (cascadeResult.died) {
      result.queensDied++;
      result.logEntries.push(
        createLogEntry('queen_died', `Queen died from starvation`, {
          queenId: queen.id,
        })
      );
      const queenIndex = swarm.queens.indexOf(queen);
      if (queenIndex > -1) {
        swarm.queens.splice(queenIndex, 1);
      }
      continue;
    }

    // Egg laying (queen action with cooldown)
    const newEgg = processQueenLaying(
      queen,
      data.swarm.eggs,
      data.swarm.structures
    );
    if (newEgg) {
      data.swarm.eggs.push(newEgg);
      result.eggsLaid++;
      result.logEntries.push(
        createLogEntry('egg_laid', 'Queen laid a new egg', {
          eggId: newEgg.id,
        })
      );
    }

    // Re-evaluate orders periodically
    if (data.gameTime % SWARM_CONSTANTS.ORDER_REEVALUATION_INTERVAL === 0) {
      assignOrders(queen, swarm.workers, data.gameTime);
    }
  }

  // 3b. Process egg gestation (independent of queen laying)
  const eggsToRemove: Egg[] = [];
  for (const egg of data.swarm.eggs) {
    const queen = swarm.queens.find((q) => q.id === egg.queenId);
    const gestationResult = processEggGestation(egg, queen, data.gameTime);
    if (gestationResult.hatched && gestationResult.worker && queen) {
      swarm.workers.push(gestationResult.worker);
      result.workersHatched++;
      result.eggsHatched++;
      eggsToRemove.push(egg);
      result.logEntries.push(
        createLogEntry('egg_hatched', 'A worker hatched from an egg', {
          workerId: gestationResult.worker.id,
          eggId: egg.id,
        })
      );
      // Notify subscribers (queen assigns orders immediately)
      emitSwarm(data, {
        type: 'worker_hatched',
        worker: gestationResult.worker,
        queen,
      });
    }
  }
  for (const egg of eggsToRemove) {
    const index = data.swarm.eggs.indexOf(egg);
    if (index > -1) data.swarm.eggs.splice(index, 1);
  }

  // 4. Process workers (energy→health cascade handled inside processWorkerTick)
  //    Neural efficiency and zone availability now constrain gathering per worker.
  //    Track actual biomass gathered for accurate energy balance display.
  const workersToRemove: Worker[] = [];
  let actualProductionThisTick = 0;

  for (const worker of swarm.workers) {
    const queen = swarm.queens.find((q) => q.id === worker.queenId);
    if (!queen) {
      // Orphaned worker - remove
      workersToRemove.push(worker);
      continue;
    }

    // Look up the worker's assigned zone, falling back to the queen's zone.
    // Uses zoneIdMap (built in step 2b) for O(1) lookup.
    const zone = worker.assignedZoneId
      ? zoneIdMap.get(worker.assignedZoneId)
      : queenZoneCache.get(queen.id);

    // Process worker tick (energy depletion, self-maintenance, orders)
    const tickResult = processWorkerTick(worker, queen, zone, efficiency);

    actualProductionThisTick += tickResult.biomassGathered;

    if (tickResult.died) {
      workersToRemove.push(worker);
      result.workersDied++;
      result.logEntries.push(
        createLogEntry('worker_died', `Worker died from starvation`, {
          workerId: worker.id,
        })
      );
    } else {
      // Gain skills
      if (tickResult.biomassGathered > 0) {
        gainForagingSkill(worker, tickResult.biomassGathered);
        gainMasteryXp(worker, 'surface_lichen', tickResult.biomassGathered);
      }
    }
  }

  // Remove dead workers
  for (const worker of workersToRemove) {
    const index = swarm.workers.indexOf(worker);
    if (index > -1) {
      swarm.workers.splice(index, 1);
    }
  }

  // Store actual biomass gathered this tick for accurate display.
  data.swarm.lastTickProduction = actualProductionThisTick;

  // 5. Calculate energy balance (for display/stats only — population
  //    equilibrium is now entirely driven by the per-organism metabolism
  //    cascade, not a macro starvation overlay).
  //    Uses actual production instead of estimate for accuracy.
  const balance = calculateEnergyBalance(
    swarm.workers,
    swarm.queens,
    efficiency,
    actualProductionThisTick
  );
  result.netEnergy = balance.net;

  return result;
}

// ============================================================================
// CATCH-UP PROCESSING (for offline)
// ============================================================================

export function processCatchUp(
  data: GameData,
  currentTime: number
): TickResult {
  const elapsedMs = currentTime - data.lastTickTimestamp;
  const elapsedTicks = Math.floor(elapsedMs / 1000);

  if (elapsedTicks <= 0) {
    return {
      workersHatched: 0,
      workersDied: 0,
      queensDied: 0,
      eggsLaid: 0,
      eggsHatched: 0,
      netEnergy: 0,
      logEntries: [],
    };
  }

  // For long absences, batch process
  if (elapsedTicks > SWARM_CONSTANTS.TICKS_PER_DAY) {
    return processBatchedCatchUp(data, currentTime, elapsedTicks);
  }

  return applyTick(data, currentTime);
}

function processBatchedCatchUp(
  data: GameData,
  currentTime: number,
  elapsedTicks: number
): TickResult {
  // Simplified batch processing for long absences
  // Instead of tick-by-tick, calculate equilibrium and jump

  const result: TickResult = {
    workersHatched: 0,
    workersDied: 0,
    queensDied: 0,
    eggsLaid: 0,
    eggsHatched: 0,
    netEnergy: 0,
    logEntries: [],
  };

  const { swarm } = data;
  const neuralCapacity = calculateTotalNeuralCapacity(swarm.queens);

  // Resolve mid-gestation eggs: complete any eggs that would have hatched
  const gestationTicks = SWARM_CONSTANTS.EGG_TOTAL_GESTATION_TICKS;
  const eggsToHatch: Egg[] = [];
  for (const egg of swarm.eggs) {
    const remainingTicks = gestationTicks - egg.totalTicks;
    if (remainingTicks <= elapsedTicks) {
      eggsToHatch.push(egg);
    } else {
      // Advance egg progress
      egg.totalTicks += elapsedTicks;
      egg.ticksInPhase += elapsedTicks;
      // Check phase transition
      if (
        egg.phase === 'incubating' &&
        egg.ticksInPhase >= SWARM_CONSTANTS.EGG_INCUBATION_TICKS
      ) {
        egg.ticksInPhase -= SWARM_CONSTANTS.EGG_INCUBATION_TICKS;
        egg.phase = 'maturing';
      }
    }
  }
  for (const egg of eggsToHatch) {
    const queen = swarm.queens.find((q) => q.id === egg.queenId);
    if (queen) {
      swarm.workers.push(createWorker(queen.id, data.gameTime));
      queen.broodMastery.worker += SWARM_CONSTANTS.EGG_HATCH_MASTERY_XP;
      result.workersHatched++;
      result.eggsHatched++;
    }
    const idx = swarm.eggs.indexOf(egg);
    if (idx > -1) swarm.eggs.splice(idx, 1);
  }

  // Simulate queen metabolism during catch-up using phase-based approach.
  // Phases: buffer depletion → energy depletion → dormancy energy → HP decay.
  const queensToRemove: typeof swarm.queens = [];
  for (const queen of swarm.queens) {
    // Estimate net biomass delivered from workers during absence.
    const workerCount = swarm.workers.filter(
      (w) => w.queenId === queen.id
    ).length;
    const workerSelfConsumption =
      SWARM_CONSTANTS.WORKER_ENERGY_MAX /
      SWARM_CONSTANTS.WORKER_ENERGY_DEPLETION_TICKS;
    const neuralLoad = calculateNeuralLoad(workerCount, queen.neuralCapacity);
    const workerEfficiency = calculateCoordinationEfficiency(neuralLoad);
    const grossDeliveryPerWorker =
      SWARM_CONSTANTS.BASE_GATHER_RATE * workerEfficiency;
    const netDeliveryPerWorker = Math.max(
      0,
      grossDeliveryPerWorker - workerSelfConsumption
    );
    const totalDelivered = netDeliveryPerWorker * workerCount * elapsedTicks;

    const baseMet = queen.metabolismPerTick;
    const dormancyFactor = SWARM_CONSTANTS.QUEEN_DORMANCY_METABOLISM_FACTOR;
    const dormancyThreshold =
      queen.energy.max * SWARM_CONSTANTS.QUEEN_DORMANCY_ENERGY_THRESHOLD;
    const canGoDormant = workerCount === 0;

    // Starting pool values (buffer includes deliveries, capped at max)
    let currentBuffer = Math.min(
      queen.biomassBuffer.max,
      queen.biomassBuffer.current + totalDelivered
    );
    let currentEnergy = queen.energy.current;
    let currentHealth = queen.health.current;
    let ticksRemaining = elapsedTicks;

    // Phase 1: Deplete buffer at full metabolism rate.
    // In the tick cascade, metabolism drains energy then buffer refuels it.
    // Net effect: buffer is consumed first while energy stays topped off.
    if (currentBuffer > 0 && ticksRemaining > 0) {
      const ticksToDeplete = Math.ceil(currentBuffer / baseMet);
      const ticksInPhase = Math.min(ticksRemaining, ticksToDeplete);
      currentBuffer = Math.max(0, currentBuffer - baseMet * ticksInPhase);
      ticksRemaining -= ticksInPhase;
    }

    // Phase 2: Deplete energy at full rate.
    // If dormancy-eligible, drain only to the dormancy threshold (15%).
    // Otherwise drain fully.
    if (currentEnergy > 0 && ticksRemaining > 0) {
      const drainTarget = canGoDormant
        ? Math.max(0, currentEnergy - dormancyThreshold)
        : currentEnergy;
      if (drainTarget > 0) {
        const ticksToTarget = Math.ceil(drainTarget / baseMet);
        const ticksInPhase = Math.min(ticksRemaining, ticksToTarget);
        currentEnergy = Math.max(
          canGoDormant ? dormancyThreshold : 0,
          currentEnergy - baseMet * ticksInPhase
        );
        ticksRemaining -= ticksInPhase;
      }
    }

    // Phase 3: Dormancy — deplete remaining energy at 10% metabolism rate.
    if (canGoDormant && currentEnergy > 0 && ticksRemaining > 0) {
      const dormantMet = baseMet * dormancyFactor;
      const ticksToZero = Math.ceil(currentEnergy / dormantMet);
      const ticksInPhase = Math.min(ticksRemaining, ticksToZero);
      currentEnergy = Math.max(0, currentEnergy - dormantMet * ticksInPhase);
      ticksRemaining -= ticksInPhase;
    }

    // Phase 4: Starvation — HP decay for remaining ticks at zero energy.
    if (currentEnergy <= 0 && ticksRemaining > 0) {
      const effectiveDecay = canGoDormant
        ? queen.hpDecayPerTickAtZeroEnergy * dormancyFactor
        : queen.hpDecayPerTickAtZeroEnergy;
      currentHealth = Math.max(
        0,
        currentHealth - effectiveDecay * ticksRemaining
      );
    }

    // Apply final state
    queen.biomassBuffer.current = currentBuffer;
    queen.energy.current = currentEnergy;
    queen.health.current = currentHealth;
    queen.isDormant =
      canGoDormant && currentEnergy <= dormancyThreshold && currentBuffer <= 0;

    if (currentHealth <= 0) {
      result.queensDied++;
      queensToRemove.push(queen);
      result.logEntries.push(
        createLogEntry(
          'queen_died',
          `Queen died from starvation during absence`,
          { queenId: queen.id }
        )
      );
    }
  }

  // Remove dead queens
  for (const queen of queensToRemove) {
    const idx = swarm.queens.indexOf(queen);
    if (idx > -1) swarm.queens.splice(idx, 1);
  }

  // Simulate toward equilibrium
  const daysElapsed = elapsedTicks / SWARM_CONSTANTS.TICKS_PER_DAY;

  // Target: slightly over capacity for stability
  const targetWorkers = Math.floor(
    neuralCapacity * SWARM_CONSTANTS.EQUILIBRIUM_TARGET_LOAD
  );
  const populationBefore = swarm.workers.length;

  if (populationBefore < targetWorkers) {
    // Population growth
    const newWorkers = Math.floor(
      (targetWorkers - populationBefore) *
        SWARM_CONSTANTS.CATCHUP_GROWTH_RATE *
        daysElapsed
    );

    for (let i = 0; i < newWorkers; i++) {
      const queen = swarm.queens[0];
      if (queen) {
        swarm.workers.push(createWorker(queen.id, data.gameTime));
        result.workersHatched++;
      }
    }
  } else if (
    populationBefore >
    targetWorkers * SWARM_CONSTANTS.CATCHUP_OVERCAPACITY_THRESHOLD
  ) {
    // Population crash from overcapacity
    const deaths = Math.floor(
      (populationBefore - targetWorkers) *
        SWARM_CONSTANTS.CATCHUP_DEATH_RATE *
        daysElapsed
    );
    const actualDeaths = Math.min(deaths, swarm.workers.length);

    for (let i = 0; i < actualDeaths; i++) {
      swarm.workers.pop();
      result.workersDied++;
    }
  }

  // Normalize surviving worker pools after catch-up.
  // Workers that survived evidently had enough food — stale pre-offline
  // pool values would cause a "first tick massacre" otherwise.
  for (const worker of swarm.workers) {
    worker.energy.current = worker.energy.max;
    worker.health.current = worker.health.max;
    worker.biomassBuffer.current = worker.biomassBuffer.max;
    worker.cargo.current = 0;
    worker.state = 'gathering';
  }

  // Update timestamps
  data.gameTime += elapsedTicks;
  data.lastTickTimestamp = currentTime;

  // Generate daily summaries for missed days
  const daysToSummarize = Math.floor(daysElapsed);
  const lastDay =
    data.dailyStats.length > 0
      ? data.dailyStats[data.dailyStats.length - 1].day
      : 0;

  for (let day = lastDay + 1; day <= lastDay + daysToSummarize; day++) {
    const summary = createDailySummary(
      day,
      data,
      { workers: result.workersDied, queens: result.queensDied },
      result.workersHatched,
      result.eggsLaid,
      result.netEnergy
    );
    data.dailyStats.push(summary);
  }

  result.logEntries.push(
    createLogEntry(
      'daily_summary',
      `Caught up on ${Math.floor(daysElapsed)} days. Population: ${swarm.workers.length} workers`,
      { daysElapsed, currentWorkers: swarm.workers.length }
    )
  );

  return result;
}
