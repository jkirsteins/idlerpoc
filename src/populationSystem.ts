// Population System - Neural capacity and homeostatic equilibrium

import type { GameData, Worker, Queen } from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import { getMasteryLevel } from './foragingSystem';

// ============================================================================
// NEURAL CAPACITY
// ============================================================================

export function calculateTotalNeuralCapacity(queens: Queen[]): number {
  return queens.reduce((sum, queen) => sum + queen.neuralCapacity, 0);
}

export function calculateNeuralLoad(
  totalWorkers: number,
  neuralCapacity: number
): number {
  if (neuralCapacity === 0) return 0;
  return totalWorkers / neuralCapacity;
}

export function calculateCoordinationEfficiency(neuralLoad: number): number {
  if (neuralLoad <= 1) {
    return 1.0; // Full efficiency
  }
  // Efficiency drops as ratio^4
  return 1.0 / Math.pow(neuralLoad, SWARM_CONSTANTS.OVERLOAD_EXPONENT);
}

// ============================================================================
// METABOLISM
// ============================================================================

export interface MetabolicRates {
  workerUpkeep: number; // Per worker per tick
  queenUpkeep: number; // Per queen per tick
  totalUpkeep: number;
}

export function calculateMetabolicRates(
  workers: Worker[],
  queens: Queen[]
): MetabolicRates {
  const workerUpkeep = workers.reduce((sum, w) => sum + w.metabolismPerTick, 0);
  const queenUpkeep = queens.reduce(
    (sum, queen) => sum + queen.metabolismPerTick,
    0
  );

  return {
    workerUpkeep,
    queenUpkeep,
    totalUpkeep: workerUpkeep + queenUpkeep,
  };
}

// ============================================================================
// ENERGY BALANCE
// ============================================================================

export interface EnergyBalance {
  production: number;
  consumption: number;
  net: number;
  deficit: number;
  surplus: number;
}

export function calculateEnergyBalance(
  workers: Worker[],
  queens: Queen[],
  efficiency: number
): EnergyBalance {
  // Production = biomass gathered * efficiency
  // This is calculated elsewhere and passed in
  // For now, we'll calculate it from worker gathering activity

  const production = calculateWorkerProduction(workers) * efficiency;
  const consumption = calculateMetabolicRates(workers, queens).totalUpkeep;
  const net = production - consumption;

  return {
    production,
    consumption,
    net,
    deficit: net < 0 ? -net : 0,
    surplus: net > 0 ? net : 0,
  };
}

function calculateWorkerProduction(workers: Worker[]): number {
  // Estimate biomass production based on gathering workers.
  // Includes skill + mastery modifiers to match the actual gathering formula.
  // Note: neural efficiency is applied externally by the caller.
  const gatheringWorkers = workers.filter((w) => w.state === 'gathering');
  const baseRate = SWARM_CONSTANTS.BASE_GATHER_RATE;

  return gatheringWorkers.reduce((sum, worker) => {
    const skillMod = 1 + worker.skills.foraging / 100;
    const masteryLevel = getMasteryLevel(worker.skills.mastery.surfaceLichen);
    const masteryMod = 1 + masteryLevel / 200;
    return sum + baseRate * skillMod * masteryMod;
  }, 0);
}

// ============================================================================
// STARVATION
// ============================================================================

export interface StarvationResult {
  deaths: number;
  biomassRecovered: number;
  workersStarving: number;
}

export function calculateStarvationDeaths(
  workers: Worker[],
  energyDeficit: number
): StarvationResult {
  const result: StarvationResult = {
    deaths: 0,
    biomassRecovered: 0,
    workersStarving: 0,
  };

  if (energyDeficit <= 0) {
    return result;
  }

  // Calculate potential deaths from energy deficit
  const upkeepPerWorker =
    workers.length > 0
      ? workers[0].metabolismPerTick
      : SWARM_CONSTANTS.WORKER_ENERGY_MAX /
        SWARM_CONSTANTS.WORKER_ENERGY_DEPLETION_TICKS;
  const potentialDeaths = Math.min(
    workers.length,
    SWARM_CONSTANTS.STARVATION_COEFFICIENT * (energyDeficit / upkeepPerWorker)
  );

  // Kill workers with lowest health first
  const sortedWorkers = [...workers].sort(
    (a, b) => a.health.current - b.health.current
  );
  const workersToKill = sortedWorkers.slice(0, Math.floor(potentialDeaths));

  result.deaths = workersToKill.length;

  // Calculate biomass recovered
  result.biomassRecovered =
    workersToKill.length *
    SWARM_CONSTANTS.WORKER_RECYCLE_BIOMASS *
    SWARM_CONSTANTS.RECYCLE_EFFICIENCY;

  // Count starving workers (energy depleted)
  result.workersStarving = workers.filter((w) => w.energy.current <= 0).length;

  return result;
}

// ============================================================================
// HOMEOSTATIC EQUILIBRIUM
// ============================================================================

export interface EquilibriumState {
  stable: boolean;
  targetPopulation: number;
  currentPopulation: number;
  trend: 'growing' | 'shrinking' | 'stable';
  estimatedDaysToEquilibrium: number;
}

export function calculateEquilibrium(
  workers: Worker[],
  queens: Queen[],
  currentEfficiency: number
): EquilibriumState {
  const currentPopulation = workers.length;
  const neuralCapacity = calculateTotalNeuralCapacity(queens);

  // At equilibrium: production * efficiency = consumption
  // Let W = workers, P = production per worker, E = efficiency, U = upkeep
  // W * P * E = W * U + fixed_costs
  // If E = 1 (W <= capacity): W * P = W * U => stable if P = U
  // If E < 1 (W > capacity): W * P / (W/C)^4 = W * U

  // Simplified: equilibrium occurs when neuralLoad ≈ 1.0
  // or when production balances consumption

  const balance = calculateEnergyBalance(workers, queens, currentEfficiency);

  let trend: 'growing' | 'shrinking' | 'stable';
  if (balance.net > SWARM_CONSTANTS.EQUILIBRIUM_TREND_THRESHOLD) {
    trend = 'growing';
  } else if (balance.net < -SWARM_CONSTANTS.EQUILIBRIUM_TREND_THRESHOLD) {
    trend = 'shrinking';
  } else {
    trend = 'stable';
  }

  // Estimate target population
  const targetPopulation = Math.floor(
    neuralCapacity * SWARM_CONSTANTS.EQUILIBRIUM_TARGET_LOAD
  );

  return {
    stable: trend === 'stable',
    targetPopulation,
    currentPopulation,
    trend,
    estimatedDaysToEquilibrium:
      trend === 'stable'
        ? 0
        : Math.abs(currentPopulation - targetPopulation) /
          SWARM_CONSTANTS.EQUILIBRIUM_CONVERGENCE_RATE,
  };
}

// ============================================================================
// DAILY SUMMARY
// ============================================================================

export interface DailySummary {
  day: number;
  workersDied: number;
  queensDied: number;
  workersHatched: number;
  eggsLaid: number;
  netEnergy: number;
  peakWorkers: number;
  efficiency: number;
}

export function createDailySummary(
  day: number,
  data: GameData,
  deaths: { workers: number; queens: number },
  hatches: number,
  eggs: number,
  netEnergy: number
): DailySummary {
  const workers = data.swarm.workers;
  const queens = data.swarm.queens;

  const neuralCapacity = calculateTotalNeuralCapacity(queens);
  const neuralLoad = calculateNeuralLoad(workers.length, neuralCapacity);
  const efficiency = calculateCoordinationEfficiency(neuralLoad);

  return {
    day,
    workersDied: deaths.workers,
    queensDied: deaths.queens,
    workersHatched: hatches,
    eggsLaid: eggs,
    netEnergy,
    peakWorkers: workers.length,
    efficiency,
  };
}

export function formatDailySummary(summary: DailySummary): string {
  const parts: string[] = [`Day ${summary.day} Summary:`];

  if (summary.eggsLaid > 0) {
    parts.push(
      `• ${summary.eggsLaid} egg${summary.eggsLaid !== 1 ? 's' : ''} laid`
    );
  }

  if (summary.workersHatched > 0) {
    parts.push(
      `• ${summary.workersHatched} worker${summary.workersHatched !== 1 ? 's' : ''} hatched`
    );
  }

  if (summary.workersDied > 0) {
    parts.push(
      `• ${summary.workersDied} worker${summary.workersDied !== 1 ? 's' : ''} died (starvation)`
    );
  }

  if (summary.queensDied > 0) {
    parts.push(`• ${summary.queensDied} QUEEN died (starvation)`);
    parts.push('• ⚠️ CRITICAL: Swarm collapse imminent');
  }

  const activeEggs =
    'activeEggs' in summary
      ? (summary as DailySummary & { activeEggs?: number }).activeEggs
      : undefined;
  if (activeEggs !== undefined && activeEggs > 0) {
    parts.push(`• Nursery: ${activeEggs} eggs gestating`);
  }

  parts.push(
    `• Population: ${summary.peakWorkers} workers (${Math.round(summary.efficiency * 100)}% efficiency)`
  );
  parts.push(
    `• Net energy: ${summary.netEnergy > 0 ? '+' : ''}${Math.round(summary.netEnergy)}`
  );

  return parts.join('\n');
}
