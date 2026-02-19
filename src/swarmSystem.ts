// Swarm System - Queen and Worker Management

import type {
  Queen,
  Worker,
  QueenDirective,
  LogEntry,
  Egg,
  EggType,
  Structure,
} from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import { calculateSkillGainRate, getMasteryLevel } from './foragingSystem';
import {
  DEFAULT_QUEEN_ALIEN_TYPE_ID,
  getQueenMetabolismProfile,
} from './alienTypes';
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

  return {
    id: `queen-${Date.now()}`,
    locationZoneId: zoneId,
    alienTypeId: DEFAULT_QUEEN_ALIEN_TYPE_ID,
    neuralCapacity: SWARM_CONSTANTS.QUEEN_BASE_CAPACITY,
    directive: 'idle',
    commandQueue: [],
    eggProduction: {
      enabled: false,
      isLaying: false,
      layingProgress: 0,
      layingTicksRemaining: 0,
      cooldownTicksRemaining: 0,
      manualCooldown: false,
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

      // Set cooldown based on manual vs auto
      ep.cooldownTicksRemaining = ep.manualCooldown
        ? SWARM_CONSTANTS.EGG_MANUAL_COOLDOWN_TICKS
        : SWARM_CONSTANTS.EGG_AUTO_COOLDOWN_TICKS;
      ep.manualCooldown = false;

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

  // Not laying, not in cooldown — try to start (auto or manual)
  if (!ep.enabled && !ep.manualCooldown) return null;

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

  if (ep.isLaying) {
    // Speed up active laying — halve remaining ticks (min 1)
    ep.layingTicksRemaining = Math.max(
      1,
      Math.floor(ep.layingTicksRemaining / 2)
    );
    ep.manualCooldown = true;
    return;
  }

  if (ep.cooldownTicksRemaining > 0) {
    // Shorten cooldown to manual value
    ep.cooldownTicksRemaining = Math.min(
      ep.cooldownTicksRemaining,
      SWARM_CONSTANTS.EGG_MANUAL_COOLDOWN_TICKS
    );
    ep.manualCooldown = true;
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
  ep.manualCooldown = true;
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

  // 1. Energy depletes by metabolism (always, like queen)
  worker.energy.current = Math.max(
    0,
    worker.energy.current - worker.metabolismPerTick
  );

  // 2. Self-maintenance: refuel energy from cargo (eat what metabolism costs)
  if (worker.energy.current < worker.energy.max && worker.cargo.current > 0) {
    const needed = worker.metabolismPerTick;
    const consumed = Math.min(needed, worker.cargo.current);
    worker.energy.current = Math.min(
      worker.energy.current + consumed,
      worker.energy.max
    );
    worker.cargo.current -= consumed;
    worker.state = 'self_maintenance';
  }

  // 3. If energy=0, health depletes (starvation cascade, mirrors queen)
  if (worker.energy.current <= 0) {
    worker.health.current = Math.max(
      0,
      worker.health.current - worker.hpDecayPerTickAtZeroEnergy
    );
    result.starvationDamage = true;

    if (worker.health.current <= 0) {
      result.died = true;
      return result;
    }
  }

  // 4. Execute order
  if (!worker.order) {
    worker.state = worker.cargo.current > 0 ? 'idle_cargo_full' : 'idle_empty';
    return result;
  }

  const orderType = worker.order.type;
  if (orderType === 'gather_biomass') {
    processGatherOrder(worker, queen, result);
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
      worker.order = queen.commandQueue[0];
    }
  });
}
