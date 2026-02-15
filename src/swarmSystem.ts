// Swarm System - Queen and Worker Management

import type {
  Queen,
  Worker,
  QueenDirective,
  LogEntry,
} from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import {
  DEFAULT_QUEEN_ALIEN_TYPE_ID,
  getQueenMetabolismProfile,
} from './alienTypes';

// ============================================================================
// QUEEN OPERATIONS
// ============================================================================

export function createQueen(zoneId: string, yearTicks: number): Queen {
  const profile = getQueenMetabolismProfile(
    DEFAULT_QUEEN_ALIEN_TYPE_ID,
    100,
    100,
    yearTicks
  );

  return {
    id: `queen-${Date.now()}`,
    locationZoneId: zoneId,
    alienTypeId: DEFAULT_QUEEN_ALIEN_TYPE_ID,
    neuralCapacity: SWARM_CONSTANTS.QUEEN_BASE_CAPACITY,
    directive: 'idle',
    commandQueue: [],
    eggProduction: {
      enabled: false,
      inProgress: false,
      progress: 0,
      ticksRemaining: 0,
    },
    energy: {
      current: 100,
      max: 100,
    },
    health: {
      current: 100,
      max: 100,
    },
    metabolismPerTick: profile.metabolismPerTick,
    hpDecayPerTickAtZeroEnergy: profile.hpDecayPerTickAtZeroEnergy,
  };
}

export function setQueenDirective(
  queen: Queen,
  directive: QueenDirective
): void {
  queen.directive = directive;
  // Clear and regenerate command queue
  regenerateCommandQueue(queen);
}

export function toggleEggProduction(queen: Queen, enabled: boolean): void {
  queen.eggProduction.enabled = enabled;
}

export function canQueenAcceptBiomass(queen: Queen): boolean {
  return queen.energy.current < queen.energy.max;
}

export function queenReceiveBiomass(queen: Queen, amount: number): void {
  queen.energy.current = Math.min(
    queen.energy.current + amount,
    queen.energy.max
  );
}

// ============================================================================
// EGG PRODUCTION
// ============================================================================

export function processEggProduction(
  queen: Queen,
  gameTime: number
): Worker | null {
  // Check if production enabled and not in progress
  if (!queen.eggProduction.enabled) {
    return null;
  }

  if (!queen.eggProduction.inProgress) {
    // Start new egg if we have energy
    if (queen.energy.current >= SWARM_CONSTANTS.EGG_COST) {
      queen.energy.current -= SWARM_CONSTANTS.EGG_COST;
      queen.eggProduction.inProgress = true;
      queen.eggProduction.progress = 0;
      queen.eggProduction.ticksRemaining = SWARM_CONSTANTS.TOTAL_SPAWN_TICKS;
    }
    return null;
  }

  // Egg in progress
  queen.eggProduction.ticksRemaining--;

  // Calculate progress percentage
  const totalTicks = SWARM_CONSTANTS.TOTAL_SPAWN_TICKS;
  const elapsed = totalTicks - queen.eggProduction.ticksRemaining;
  queen.eggProduction.progress = (elapsed / totalTicks) * 100;

  // Check if complete
  if (queen.eggProduction.ticksRemaining <= 0) {
    queen.eggProduction.inProgress = false;
    queen.eggProduction.progress = 0;

    // Create new worker
    return createWorker(queen.id, gameTime);
  }

  return null;
}

// ============================================================================
// WORKER CREATION
// ============================================================================

export function createWorker(queenId: string, _gameTime: number): Worker {
  return {
    id: `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    queenId,
    state: 'idle_empty',
    health: SWARM_CONSTANTS.WORKER_HEALTH_MAX,
    cargo: {
      current: 0,
      max: SWARM_CONSTANTS.WORKER_CARGO_MAX,
    },
    skills: {
      foraging: 0,
      mastery: {
        surfaceLichen: 0,
      },
    },
  };
}

// ============================================================================
// COMMAND QUEUE
// ============================================================================

export function regenerateCommandQueue(queen: Queen): void {
  queen.commandQueue = [];

  if (queen.directive === 'gather_biomass') {
    // Fill queue with gather orders
    // Queue size = neural capacity (max concurrent gatherers)
    for (let i = 0; i < queen.neuralCapacity; i++) {
      queen.commandQueue.push({
        type: 'gather_biomass',
        priority: 10,
        issuedAt: Date.now(),
      });
    }
  } else if (queen.directive === 'idle') {
    // Fill with idle orders
    for (let i = 0; i < queen.neuralCapacity; i++) {
      queen.commandQueue.push({
        type: 'idle',
        priority: 1,
        issuedAt: Date.now(),
      });
    }
  }
}

export function assignOrders(queen: Queen, workers: Worker[]): void {
  // Get available workers (idle states)
  const availableWorkers = workers.filter(
    (w) =>
      w.queenId === queen.id &&
      (w.state === 'idle_empty' || w.state === 'idle_cargo_full')
  );

  if (availableWorkers.length === 0) return;

  // Sort by foraging skill (highest first)
  availableWorkers.sort((a, b) => b.skills.foraging - a.skills.foraging);

  // Assign orders from queue
  const ordersToAssign = Math.min(
    availableWorkers.length,
    queen.commandQueue.length
  );

  for (let i = 0; i < ordersToAssign; i++) {
    const worker = availableWorkers[i];
    const order = queen.commandQueue[i];

    worker.order = order;

    // Set initial state based on order
    if (order.type === 'gather_biomass') {
      worker.state = 'gathering';
    } else if (order.type === 'idle') {
      worker.state = 'idle_empty';
    }
  }

  // Remaining workers get idle
  for (let i = ordersToAssign; i < availableWorkers.length; i++) {
    availableWorkers[i].order = {
      type: 'idle',
      priority: 0,
      issuedAt: Date.now(),
    };
    availableWorkers[i].state = 'idle_empty';
  }
}

// ============================================================================
// WORKER TICK
// ============================================================================

export interface WorkerTickResult {
  worker: Worker;
  biomassGathered: number;
  biomassDelivered: number;
  died: boolean;
  starvationDamage: boolean;
}

export function processWorkerTick(
  worker: Worker,
  queen: Queen
): WorkerTickResult {
  const result: WorkerTickResult = {
    worker,
    biomassGathered: 0,
    biomassDelivered: 0,
    died: false,
    starvationDamage: false,
  };

  // 1. Self-maintenance (highest priority)
  if (worker.cargo.current >= SWARM_CONSTANTS.WORKER_UPKEEP_ENERGY) {
    worker.cargo.current -= SWARM_CONSTANTS.WORKER_UPKEEP_ENERGY;
    worker.state = 'self_maintenance';
  } else {
    // Starvation - take health damage
    worker.health -= 5; // Damage per tick when starving
    result.starvationDamage = true;

    if (worker.health <= 0) {
      result.died = true;
      return result;
    }
  }

  // 2. Execute order
  if (!worker.order) {
    worker.state = 'idle_empty';
    return result;
  }

  const orderType = worker.order.type;
  if (orderType === 'gather_biomass') {
    processGatherOrder(worker, queen, result);
  } else if (orderType === 'idle') {
    // Just self-maintenance already done
    worker.state = worker.cargo.current > 0 ? 'idle_cargo_full' : 'idle_empty';
  } else {
    // Future order types not yet implemented: combat, explore_zone, build_structure
    worker.state = 'idle_empty';
  }

  return result;
}

function processGatherOrder(
  worker: Worker,
  queen: Queen,
  result: WorkerTickResult
): void {
  // If cargo not full: gather
  if (worker.cargo.current < worker.cargo.max) {
    // Base gather rate + skill modifier
    const skillModifier = 1 + worker.skills.foraging / 100;
    const masteryModifier = 1 + worker.skills.mastery.surfaceLichen / 200;
    const gatherRate =
      SWARM_CONSTANTS.BASE_GATHER_RATE * skillModifier * masteryModifier;

    worker.cargo.current = Math.min(
      worker.cargo.current + gatherRate,
      worker.cargo.max
    );

    result.biomassGathered = gatherRate;
    worker.state = 'gathering';
    return;
  }

  // Cargo full: try to unload to queen
  if (canQueenAcceptBiomass(queen)) {
    queenReceiveBiomass(queen, worker.cargo.current);
    result.biomassDelivered = worker.cargo.current;
    worker.cargo.current = 0;
    worker.state = 'gathering'; // Go gather more
  } else {
    // Queen full - idle with cargo full
    worker.state = 'idle_cargo_full';
  }
}

// ============================================================================
// SWARM AGGREGATES
// ============================================================================

export interface SwarmAggregates {
  totalWorkers: number;
  totalQueens: number;
  neuralCapacity: number;
  neuralLoad: number;
  efficiency: number;

  workerStates: {
    selfMaintenance: number;
    gathering: number;
    idleEmpty: number;
    idleCargoFull: number;
  };
}

export function calculateSwarmAggregates(swarm: {
  queens: Queen[];
  workers: Worker[];
}): SwarmAggregates {
  const totalWorkers = swarm.workers.length;
  const totalQueens = swarm.queens.length;
  const neuralCapacity = swarm.queens.reduce(
    (sum, q) => sum + q.neuralCapacity,
    0
  );
  const neuralLoad = neuralCapacity > 0 ? totalWorkers / neuralCapacity : 0;

  // Calculate efficiency
  let efficiency = 1.0;
  if (neuralLoad > 1) {
    efficiency = 1.0 / Math.pow(neuralLoad, SWARM_CONSTANTS.OVERLOAD_EXPONENT);
  }

  // Count worker states
  const workerStates = {
    selfMaintenance: 0,
    gathering: 0,
    idleEmpty: 0,
    idleCargoFull: 0,
  };

  for (const worker of swarm.workers) {
    switch (worker.state) {
      case 'self_maintenance':
        workerStates.selfMaintenance++;
        break;
      case 'gathering':
        workerStates.gathering++;
        break;
      case 'idle_empty':
        workerStates.idleEmpty++;
        break;
      case 'idle_cargo_full':
        workerStates.idleCargoFull++;
        break;
    }
  }

  return {
    totalWorkers,
    totalQueens,
    neuralCapacity,
    neuralLoad,
    efficiency,
    workerStates,
  };
}

// ============================================================================
// LOGGING
// ============================================================================

export function createLogEntry(
  type: LogEntry['type'],
  message: string,
  data?: Record<string, unknown>
): LogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    type,
    message,
    data,
  };
}
