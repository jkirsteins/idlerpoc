// Game Tick - Master tick system for swarm simulation

import type { GameData, Worker, Egg, LogEntry } from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import { updatePlanetPositions } from './trappist1Data';
import {
  processQueenLaying,
  processEggGestation,
  processWorkerTick,
  assignOrders,
  calculateSwarmAggregates,
  createLogEntry,
} from './swarmSystem';
import { gainForagingSkill, gainMasteryXp } from './foragingSystem';
import {
  calculateTotalNeuralCapacity,
  calculateNeuralLoad,
  calculateCoordinationEfficiency,
  calculateEnergyBalance,
  calculateStarvationDeaths,
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

  // 2. Calculate swarm aggregates (for future use)
  void calculateSwarmAggregates(swarm);

  // 3. Process each queen
  for (const queen of swarm.queens) {
    queen.energy.current = Math.max(
      0,
      queen.energy.current - queen.metabolismPerTick
    );

    if (queen.energy.current <= 0) {
      queen.health.current = Math.max(
        0,
        queen.health.current - queen.hpDecayPerTickAtZeroEnergy
      );

      if (queen.health.current <= 0) {
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
      assignOrders(queen, swarm.workers);
    }
  }

  // 3b. Process egg gestation (independent of queen laying)
  const eggsToRemove: Egg[] = [];
  const newlyHatchedIds = new Set<string>();
  for (const egg of data.swarm.eggs) {
    const queen = swarm.queens.find((q) => q.id === egg.queenId);
    const gestationResult = processEggGestation(egg, queen, data.gameTime);
    if (gestationResult.hatched && gestationResult.worker) {
      swarm.workers.push(gestationResult.worker);
      newlyHatchedIds.add(gestationResult.worker.id);
      result.workersHatched++;
      result.eggsHatched++;
      eggsToRemove.push(egg);
      result.logEntries.push(
        createLogEntry('egg_hatched', 'A worker hatched from an egg', {
          workerId: gestationResult.worker.id,
          eggId: egg.id,
        })
      );
    }
  }
  for (const egg of eggsToRemove) {
    const index = data.swarm.eggs.indexOf(egg);
    if (index > -1) data.swarm.eggs.splice(index, 1);
  }

  // 4. Process workers (skip newly hatched — they get a grace tick)
  const workersToRemove: Worker[] = [];

  for (const worker of swarm.workers) {
    if (newlyHatchedIds.has(worker.id)) continue;

    const queen = swarm.queens.find((q) => q.id === worker.queenId);
    if (!queen) {
      // Orphaned worker - remove
      workersToRemove.push(worker);
      continue;
    }

    // Health decay
    worker.health -= SWARM_CONSTANTS.WORKER_HEALTH_DECAY;
    if (worker.health <= 0) {
      workersToRemove.push(worker);
      result.workersDied++;
      continue;
    }

    // Process worker tick
    const tickResult = processWorkerTick(worker, queen);

    if (tickResult.died) {
      workersToRemove.push(worker);
      result.workersDied++;
      result.logEntries.push(
        createLogEntry('worker_died', `Worker died from starvation`, {
          workerId: worker.id,
        })
      );
    } else {
      // Track biomass for stats
      void tickResult.biomassGathered;

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

  // 5. Calculate energy balance
  const neuralCapacity = calculateTotalNeuralCapacity(swarm.queens);
  const neuralLoad = calculateNeuralLoad(swarm.workers.length, neuralCapacity);
  const efficiency = calculateCoordinationEfficiency(neuralLoad);

  const balance = calculateEnergyBalance(
    swarm.workers,
    swarm.queens,
    efficiency
  );
  result.netEnergy = balance.net;

  // 6. Apply starvation deaths
  if (balance.deficit > 0) {
    const starvationResult = calculateStarvationDeaths(
      swarm.workers,
      balance.deficit
    );

    // Kill starving workers
    const sortedWorkers = [...swarm.workers].sort(
      (a, b) => a.health - b.health
    );
    const workersToStarve = sortedWorkers.slice(0, starvationResult.deaths);

    for (const worker of workersToStarve) {
      const index = swarm.workers.indexOf(worker);
      if (index > -1) {
        swarm.workers.splice(index, 1);
        result.workersDied++;
      }
    }

    // Add biomass from recycling
    if (starvationResult.biomassRecovered > 0) {
      // Distribute to queens proportionally
      for (const queen of swarm.queens) {
        const share = starvationResult.biomassRecovered / swarm.queens.length;
        queen.energy.current = Math.min(
          queen.energy.current + share,
          queen.energy.max
        );
      }
    }
  }

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
      swarm.workers.push({
        id: `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        queenId: queen.id,
        state: 'idle_empty',
        health: SWARM_CONSTANTS.WORKER_HEALTH_MAX,
        cargo: { current: 0, max: SWARM_CONSTANTS.WORKER_CARGO_MAX },
        skills: { foraging: 0, mastery: { surfaceLichen: 0 } },
      });
      queen.broodMastery.worker += SWARM_CONSTANTS.EGG_HATCH_MASTERY_XP;
      result.workersHatched++;
      result.eggsHatched++;
    }
    const idx = swarm.eggs.indexOf(egg);
    if (idx > -1) swarm.eggs.splice(idx, 1);
  }

  // Simulate toward equilibrium
  const daysElapsed = elapsedTicks / SWARM_CONSTANTS.TICKS_PER_DAY;

  // Target: slightly over capacity for stability
  const targetWorkers = Math.floor(neuralCapacity * 1.2);
  const currentWorkers = swarm.workers.length;

  if (currentWorkers < targetWorkers) {
    // Population growth
    const growthRate = 0.1; // 10% per day toward target
    const newWorkers = Math.floor(
      (targetWorkers - currentWorkers) * growthRate * daysElapsed
    );

    for (let i = 0; i < newWorkers; i++) {
      const queen = swarm.queens[0];
      if (queen) {
        swarm.workers.push({
          id: `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          queenId: queen.id,
          state: 'idle_empty',
          health: SWARM_CONSTANTS.WORKER_HEALTH_MAX,
          cargo: { current: 0, max: SWARM_CONSTANTS.WORKER_CARGO_MAX },
          skills: { foraging: 0, mastery: { surfaceLichen: 0 } },
        });
        result.workersHatched++;
      }
    }
  } else if (currentWorkers > targetWorkers * 1.5) {
    // Population crash from overcapacity
    const deaths = Math.floor(
      (currentWorkers - targetWorkers) * 0.2 * daysElapsed
    );
    const actualDeaths = Math.min(deaths, swarm.workers.length);

    for (let i = 0; i < actualDeaths; i++) {
      swarm.workers.pop();
      result.workersDied++;
    }
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
      { workers: result.workersDied, queens: 0 },
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
