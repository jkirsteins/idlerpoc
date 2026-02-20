// Swarm System - Queen and Worker Management

import type {
  Queen,
  Worker,
  QueenDirective,
  LogEntry,
  Egg,
  EggType,
  Structure,
  Zone,
} from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import { calculateSkillGainRate, getMasteryLevel } from './foragingSystem';
import {
  DEFAULT_QUEEN_ALIEN_TYPE_ID,
  getQueenMetabolismProfile,
} from './alienTypes';
import { processMetabolismCascade } from './metabolismCascade';
import { onSwarm } from './swarmEvents';

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

  const queen: Queen = {
    id: `queen-${Date.now()}`,
    locationZoneId: zoneId,
    alienTypeId: DEFAULT_QUEEN_ALIEN_TYPE_ID,
    neuralCapacity: SWARM_CONSTANTS.QUEEN_BASE_CAPACITY,
    directive: 'gather_biomass',
    commandQueue: [],
    eggProduction: {
      enabled: false,
      isLaying: false,
      layingProgress: 0,
      layingTicksRemaining: 0,
      cooldownTicksRemaining: 0,
    },
    broodSkill: 0,
    broodMastery: { worker: 0 },
    energy: {
      current: 100,
      max: 100,
    },
    health: {
      current: 100,
      max: 100,
    },
    biomassBuffer: {
      current: SWARM_CONSTANTS.QUEEN_BIOMASS_BUFFER_MAX,
      max: SWARM_CONSTANTS.QUEEN_BIOMASS_BUFFER_MAX,
    },
    metabolismPerTick: profile.metabolismPerTick,
    hpDecayPerTickAtZeroEnergy: profile.hpDecayPerTickAtZeroEnergy,
  };

  // Populate command queue so workers hatched immediately have orders
  regenerateCommandQueue(queen);

  return queen;
}

export function setQueenDirective(
  queen: Queen,
  directive: QueenDirective,
  gameTime: number = 0
): void {
  queen.directive = directive;
  // Clear and regenerate command queue
  regenerateCommandQueue(queen, gameTime);
}

export function toggleEggProduction(queen: Queen, enabled: boolean): void {
  queen.eggProduction.enabled = enabled;
}

export function canQueenAcceptBiomass(queen: Queen): boolean {
  return queen.biomassBuffer.current < queen.biomassBuffer.max;
}

export function queenReceiveBiomass(queen: Queen, amount: number): void {
  queen.biomassBuffer.current = Math.min(
    queen.biomassBuffer.current + amount,
    queen.biomassBuffer.max
  );
}

// ============================================================================
// EGG PRODUCTION - Two-stage: Queen Laying + Egg Gestation
// ============================================================================

// --- Effective tick calculations (skill-adjusted) ---

export function getEffectiveLayingTicks(queen: Queen): number {
  return SWARM_CONSTANTS.EGG_LAYING_TICKS / (1 + queen.broodSkill / 100);
}

export function getEffectiveGestationTicks(
  queen: Queen,
  _eggType: EggType
): number {
  const masteryLevel = getMasteryLevel(queen.broodMastery.worker);
  return SWARM_CONSTANTS.EGG_TOTAL_GESTATION_TICKS / (1 + masteryLevel / 100);
}

function getEffectiveIncubationTicks(queen: Queen): number {
  const masteryLevel = getMasteryLevel(queen.broodMastery.worker);
  return SWARM_CONSTANTS.EGG_INCUBATION_TICKS / (1 + masteryLevel / 100);
}

function getEffectiveMaturationTicks(queen: Queen): number {
  const masteryLevel = getMasteryLevel(queen.broodMastery.worker);
  return SWARM_CONSTANTS.EGG_MATURATION_TICKS / (1 + masteryLevel / 100);
}

// --- Nursery helpers ---

export function createNursery(zoneId: string): Structure {
  return {
    id: `nursery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'nursery',
    zoneId,
    capacity: SWARM_CONSTANTS.NURSERY_BASE_CAPACITY,
  };
}

export function getNurseryForQueen(
  queen: Queen,
  structures: Structure[]
): Structure | undefined {
  return structures.find(
    (s) => s.type === 'nursery' && s.zoneId === queen.locationZoneId
  );
}

export function getNurseryAvailableSpace(
  nursery: Structure,
  eggs: Egg[]
): number {
  const eggsInNursery = eggs.filter((e) => e.nurseryId === nursery.id).length;
  return nursery.capacity - eggsInNursery;
}

// --- Egg entity creation ---

export function createEgg(queenId: string, nurseryId: string): Egg {
  return {
    id: `egg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    queenId,
    nurseryId,
    type: 'worker',
    phase: 'incubating',
    ticksInPhase: 0,
    totalTicks: 0,
  };
}

// --- Queen laying (Phase A: queen action with cooldown) ---

export function processQueenLaying(
  queen: Queen,
  eggs: Egg[],
  structures: Structure[]
): Egg | null {
  const ep = queen.eggProduction;
  if (!ep.enabled && !ep.isLaying && ep.cooldownTicksRemaining <= 0)
    return null;

  // Handle cooldown
  if (ep.cooldownTicksRemaining > 0) {
    ep.cooldownTicksRemaining--;
    return null;
  }

  // Currently laying — count down
  if (ep.isLaying) {
    ep.layingTicksRemaining--;

    const effectiveTicks = getEffectiveLayingTicks(queen);
    const elapsed = effectiveTicks - ep.layingTicksRemaining;
    ep.layingProgress = Math.min(100, (elapsed / effectiveTicks) * 100);

    if (ep.layingTicksRemaining <= 0) {
      // Laying complete — create egg
      ep.isLaying = false;
      ep.layingProgress = 0;
      ep.cooldownTicksRemaining = SWARM_CONSTANTS.EGG_COOLDOWN_TICKS;

      // Award brood skill XP
      const skillGain =
        calculateSkillGainRate(queen.broodSkill) *
        SWARM_CONSTANTS.BROOD_XP_PER_LAY *
        SWARM_CONSTANTS.SKILL_ACTIVITY_MULTIPLIER;
      queen.broodSkill = Math.min(
        100,
        queen.broodSkill + skillGain / SWARM_CONSTANTS.SKILL_GAIN_DIVISOR
      );

      // Find nursery and create egg
      const nursery = getNurseryForQueen(queen, structures);
      if (nursery) {
        const egg = createEgg(queen.id, nursery.id);
        return egg;
      }
    }
    return null;
  }

  // Not laying, not in cooldown — only auto-start if enabled
  if (!ep.enabled) return null;

  // Check nursery space
  const nursery = getNurseryForQueen(queen, structures);
  if (!nursery) return null;
  if (getNurseryAvailableSpace(nursery, eggs) <= 0) return null;

  // Check energy
  if (queen.energy.current < SWARM_CONSTANTS.EGG_COST) return null;

  // Start laying
  queen.energy.current -= SWARM_CONSTANTS.EGG_COST;
  ep.isLaying = true;
  ep.layingTicksRemaining = Math.ceil(getEffectiveLayingTicks(queen));
  ep.layingProgress = 0;

  return null;
}

// --- Manual lay trigger (called by UI button) ---

export function triggerManualLay(
  queen: Queen,
  eggs: Egg[],
  structures: Structure[]
): void {
  const ep = queen.eggProduction;

  // Always enable auto-lay when manually clicking
  ep.enabled = true;

  // During laying: advance progress by tapping
  if (ep.isLaying) {
    ep.layingTicksRemaining = Math.max(
      0,
      ep.layingTicksRemaining - SWARM_CONSTANTS.SPEED_UP_ADVANCE_TICKS
    );
    return;
  }

  // During cooldown: advance cooldown by tapping
  if (ep.cooldownTicksRemaining > 0) {
    ep.cooldownTicksRemaining = Math.max(
      0,
      ep.cooldownTicksRemaining - SWARM_CONSTANTS.SPEED_UP_ADVANCE_TICKS
    );
    return;
  }

  // Ready to lay — start immediately
  const nursery = getNurseryForQueen(queen, structures);
  if (!nursery) return;
  if (getNurseryAvailableSpace(nursery, eggs) <= 0) return;
  if (queen.energy.current < SWARM_CONSTANTS.EGG_COST) return;

  queen.energy.current -= SWARM_CONSTANTS.EGG_COST;
  ep.isLaying = true;
  ep.layingTicksRemaining = Math.ceil(getEffectiveLayingTicks(queen));
  ep.layingProgress = 0;
}

// --- Egg gestation (Phase B: independent egg processing) ---

export interface EggGestationResult {
  hatched: boolean;
  worker?: Worker;
}

export function processEggGestation(
  egg: Egg,
  queen: Queen | undefined,
  gameTime: number
): EggGestationResult {
  egg.ticksInPhase++;
  egg.totalTicks++;

  // Calculate mastery-adjusted phase duration
  const phaseDuration =
    egg.phase === 'incubating'
      ? queen
        ? getEffectiveIncubationTicks(queen)
        : SWARM_CONSTANTS.EGG_INCUBATION_TICKS
      : queen
        ? getEffectiveMaturationTicks(queen)
        : SWARM_CONSTANTS.EGG_MATURATION_TICKS;

  if (egg.ticksInPhase >= phaseDuration) {
    if (egg.phase === 'incubating') {
      egg.phase = 'maturing';
      egg.ticksInPhase = 0;
      return { hatched: false };
    } else {
      // Maturation complete — hatch
      if (queen) {
        // Award mastery XP
        queen.broodMastery.worker += SWARM_CONSTANTS.EGG_HATCH_MASTERY_XP;
      }
      const worker = createWorker(egg.queenId, gameTime);
      return { hatched: true, worker };
    }
  }

  return { hatched: false };
}

// --- Egg progress for UI ---

export function getEggProgress(egg: Egg, queen: Queen | undefined): number {
  const totalGestation = queen
    ? getEffectiveGestationTicks(queen, egg.type)
    : SWARM_CONSTANTS.EGG_TOTAL_GESTATION_TICKS;
  return Math.min(100, (egg.totalTicks / totalGestation) * 100);
}

// ============================================================================
// WORKER CREATION
// ============================================================================

export function createWorker(queenId: string, _gameTime: number): Worker {
  // Derive metabolism rates from pool sizes and depletion durations
  const metabolismPerTick =
    SWARM_CONSTANTS.WORKER_ENERGY_MAX /
    SWARM_CONSTANTS.WORKER_ENERGY_DEPLETION_TICKS;
  const hpDecayPerTickAtZeroEnergy =
    SWARM_CONSTANTS.WORKER_HEALTH_MAX /
    SWARM_CONSTANTS.WORKER_HP_DEPLETION_TICKS_AT_ZERO_ENERGY;

  return {
    id: `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    queenId,
    state: 'idle_empty',
    energy: {
      current: SWARM_CONSTANTS.WORKER_ENERGY_MAX,
      max: SWARM_CONSTANTS.WORKER_ENERGY_MAX,
    },
    health: {
      current: SWARM_CONSTANTS.WORKER_HEALTH_MAX,
      max: SWARM_CONSTANTS.WORKER_HEALTH_MAX,
    },
    biomassBuffer: {
      current: SWARM_CONSTANTS.WORKER_BIOMASS_BUFFER_MAX,
      max: SWARM_CONSTANTS.WORKER_BIOMASS_BUFFER_MAX,
    },
    metabolismPerTick,
    hpDecayPerTickAtZeroEnergy,
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

export function regenerateCommandQueue(
  queen: Queen,
  gameTime: number = 0
): void {
  queen.commandQueue = [];

  if (queen.directive === 'gather_biomass') {
    // Fill queue with gather orders
    // Queue size = neural capacity (max concurrent gatherers)
    for (let i = 0; i < queen.neuralCapacity; i++) {
      queen.commandQueue.push({
        type: 'gather_biomass',
        priority: 10,
        issuedAt: gameTime,
      });
    }
  } else if (queen.directive === 'idle') {
    // Fill with idle orders
    for (let i = 0; i < queen.neuralCapacity; i++) {
      queen.commandQueue.push({
        type: 'idle',
        priority: 1,
        issuedAt: gameTime,
      });
    }
  }
}

export function assignOrders(
  queen: Queen,
  workers: Worker[],
  gameTime: number = 0
): void {
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
      issuedAt: gameTime,
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
  queen: Queen,
  zone: Zone | undefined,
  neuralEfficiency: number
): WorkerTickResult {
  const result: WorkerTickResult = {
    worker,
    biomassGathered: 0,
    biomassDelivered: 0,
    died: false,
    starvationDamage: false,
  };

  // Pre-cascade: Replenish biomass buffer from cargo (worker-specific intake)
  if (
    worker.biomassBuffer.current < worker.biomassBuffer.max &&
    worker.cargo.current > 0
  ) {
    const bufferDeficit =
      worker.biomassBuffer.max - worker.biomassBuffer.current;
    const transferred = Math.min(bufferDeficit, worker.cargo.current);
    worker.biomassBuffer.current += transferred;
    worker.cargo.current -= transferred;
    worker.state = 'self_maintenance';
  }

  // Universal metabolism cascade (shared with all organisms)
  const cascadeResult = processMetabolismCascade(worker);
  result.starvationDamage = cascadeResult.starvationDamage;

  if (cascadeResult.died) {
    result.died = true;
    return result;
  }

  // Execute order
  if (!worker.order) {
    worker.state = worker.cargo.current > 0 ? 'idle_cargo_full' : 'idle_empty';
    return result;
  }

  const orderType = worker.order.type;
  if (orderType === 'gather_biomass') {
    processGatherOrder(worker, queen, zone, neuralEfficiency, result);
  } else if (orderType === 'idle') {
    worker.state = worker.cargo.current > 0 ? 'idle_cargo_full' : 'idle_empty';
  } else {
    worker.state = 'idle_empty';
  }

  return result;
}

function processGatherOrder(
  worker: Worker,
  queen: Queen,
  zone: Zone | undefined,
  neuralEfficiency: number,
  result: WorkerTickResult
): void {
  // If cargo not full: gather
  if (worker.cargo.current < worker.cargo.max) {
    // Base gather rate + skill + mastery + neural efficiency modifiers
    const skillModifier = 1 + worker.skills.foraging / 100;
    const masteryLevel = getMasteryLevel(worker.skills.mastery.surfaceLichen);
    const masteryModifier = 1 + masteryLevel / 200;
    let gatherRate =
      SWARM_CONSTANTS.BASE_GATHER_RATE *
      skillModifier *
      masteryModifier *
      neuralEfficiency;

    // Clamp to zone's available biomass and deplete it
    if (zone) {
      gatherRate = Math.min(gatherRate, zone.biomassAvailable);
      zone.biomassAvailable -= gatherRate;
    }

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
  totalEggs: number;
  totalStructures: number;
  neuralCapacity: number;
  neuralLoad: number;
  efficiency: number;

  workerStates: {
    selfMaintenance: number;
    gathering: number;
    idleEmpty: number;
    idleCargoFull: number;
  };

  eggPhases: {
    incubating: number;
    maturing: number;
  };
}

export function calculateSwarmAggregates(swarm: {
  queens: Queen[];
  workers: Worker[];
  eggs: Egg[];
  structures: Structure[];
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

  // Count egg phases
  const eggPhases = { incubating: 0, maturing: 0 };
  for (const egg of swarm.eggs) {
    if (egg.phase === 'incubating') eggPhases.incubating++;
    else if (egg.phase === 'maturing') eggPhases.maturing++;
  }

  return {
    totalWorkers,
    totalQueens,
    totalEggs: swarm.eggs.length,
    totalStructures: swarm.structures.length,
    neuralCapacity,
    neuralLoad,
    efficiency,
    workerStates,
    eggPhases,
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

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Register swarm system event handlers.
 * Called once at application startup from main.ts.
 */
export function initSwarmEvents(): void {
  // When a worker hatches, immediately assign it an order from the queen's
  // command queue so it can start working on its first tick.
  onSwarm('worker_hatched', (_gameData, event) => {
    if (event.type !== 'worker_hatched') return;
    const { worker, queen } = event;
    if (queen.commandQueue.length > 0) {
      const order = queen.commandQueue[0];
      worker.order = order;
      // Set state to match order type so the worker acts immediately
      if (order.type === 'gather_biomass') {
        worker.state = 'gathering';
      } else if (order.type === 'idle') {
        worker.state = 'idle_empty';
      }
    }
  });
}
