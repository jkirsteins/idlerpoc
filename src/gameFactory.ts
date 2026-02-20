// Game Factory - Create new swarm games

import type { GameData, Swarm } from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import {
  generateTRAPPIST1System,
  getStartingZone,
  normalizePlanetsFromSave,
} from './trappist1Data';
import { createQueen, createNursery, createLogEntry } from './swarmSystem';
import {
  DEFAULT_QUEEN_ALIEN_TYPE_ID,
  getQueenMetabolismProfile,
  type AlienTypeId,
} from './alienTypes';

// ============================================================================
// NEW GAME CREATION
// ============================================================================

export function createNewGame(): GameData {
  const now = Date.now();

  // Generate TRAPPIST-1 system
  const planets = generateTRAPPIST1System();

  // Get starting zone (auto-conquered)
  const startingZone = getStartingZone(planets);
  const yearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR;

  // Create initial queen
  const queen = createQueen(startingZone.id, yearTicks);

  // Create starting nursery in the queen's zone
  const nursery = createNursery(startingZone.id);

  // Create swarm
  const swarm: Swarm = {
    queens: [queen],
    workers: [],
    eggs: [],
    structures: [nursery],
  };

  // Create game data
  const gameData: GameData = {
    saveVersion: 100, // Breaking change from space game
    gameTime: 0,
    createdAt: now,
    lastTickTimestamp: now,

    swarm,
    planets,
    homePlanetId: 'asimov',

    resources: {
      energy: {
        current: 50,
        max: 100,
      },
    },

    dailyStats: [],

    log: [
      createLogEntry(
        'daily_summary',
        'Welcome to TRAPPIST-1. A queen has emerged in the fertile cradle.',
        { startingZone: startingZone.name }
      ),
    ],

    isPaused: false,
  };

  return gameData;
}

// ============================================================================
// SAVE/LOAD
// ============================================================================

export function saveGame(data: GameData): string {
  return JSON.stringify(data);
}

export function loadGame(saveData: string): GameData | null {
  try {
    const parsed = JSON.parse(saveData) as GameData;

    // Version check - reject old space game saves
    if (parsed.saveVersion < 100) {
      console.warn('Old save version detected. Starting new game.');
      return null;
    }

    // Validate required fields
    if (!parsed.swarm || !parsed.planets) {
      console.error('Invalid save data');
      return null;
    }

    parsed.planets = normalizePlanetsFromSave(parsed.planets);

    // Backfill eggs and structures arrays for old saves
    const swarmRaw = parsed.swarm as unknown as Record<string, unknown>;
    if (!Array.isArray(swarmRaw.eggs)) {
      (parsed.swarm as { eggs: unknown[] }).eggs = [];
    }
    if (!Array.isArray(swarmRaw.structures)) {
      (parsed.swarm as { structures: unknown[] }).structures = [];
    }

    const yearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR;

    for (const queen of parsed.swarm.queens) {
      const energyMax = Math.max(1, queen.energy?.max ?? 100);
      const healthMax = Math.max(1, queen.health?.max ?? 100);
      const alienTypeId =
        typeof queen.alienTypeId === 'string'
          ? (queen.alienTypeId as AlienTypeId)
          : DEFAULT_QUEEN_ALIEN_TYPE_ID;

      queen.alienTypeId = alienTypeId;
      queen.energy = {
        current: Math.max(0, Math.min(energyMax, queen.energy?.current ?? 50)),
        max: energyMax,
      };
      queen.health = {
        current: Math.max(0, Math.min(healthMax, queen.health?.current ?? 100)),
        max: healthMax,
      };

      if (
        typeof queen.metabolismPerTick !== 'number' ||
        !Number.isFinite(queen.metabolismPerTick) ||
        queen.metabolismPerTick <= 0 ||
        typeof queen.hpDecayPerTickAtZeroEnergy !== 'number' ||
        !Number.isFinite(queen.hpDecayPerTickAtZeroEnergy) ||
        queen.hpDecayPerTickAtZeroEnergy <= 0
      ) {
        const profile = getQueenMetabolismProfile(
          alienTypeId,
          energyMax,
          healthMax,
          yearTicks
        );
        queen.metabolismPerTick = profile.metabolismPerTick;
        queen.hpDecayPerTickAtZeroEnergy = profile.hpDecayPerTickAtZeroEnergy;
      }

      // Backfill brood skill/mastery for old saves
      if (typeof queen.broodSkill !== 'number') {
        queen.broodSkill = 0;
      }
      if (
        !queen.broodMastery ||
        typeof queen.broodMastery.worker !== 'number'
      ) {
        queen.broodMastery = { worker: 0 };
      }

      // Migrate old EggProduction shape (inProgress) to new shape (isLaying)
      const ep = queen.eggProduction as unknown as Record<string, unknown>;
      if (ep.inProgress !== undefined) {
        const wasInProgress = ep.inProgress as boolean;
        const oldTicksRemaining = (ep.ticksRemaining as number) ?? 0;
        const enabled = (ep.enabled as boolean) ?? false;

        // Old system: single timer covering laying + gestation
        // If timer was in the laying portion (> gestation ticks remaining),
        // the queen was still laying. Otherwise, create an egg entity.
        const gestationTicks = SWARM_CONSTANTS.EGG_TOTAL_GESTATION_TICKS;
        const wasStillLaying =
          wasInProgress && oldTicksRemaining > gestationTicks;

        queen.eggProduction = {
          enabled,
          isLaying: wasStillLaying,
          layingProgress: 0,
          layingTicksRemaining: wasStillLaying
            ? Math.max(0, oldTicksRemaining - gestationTicks)
            : 0,
          cooldownTicksRemaining: 0,
          manualCooldown: false,
        };

        // If old egg was in gestation phase, create an egg entity in a nursery
        if (wasInProgress && !wasStillLaying && oldTicksRemaining > 0) {
          // Ensure we have a nursery
          let nursery = parsed.swarm.structures.find(
            (s) => s.type === 'nursery' && s.zoneId === queen.locationZoneId
          );
          if (!nursery) {
            nursery = createNursery(queen.locationZoneId);
            parsed.swarm.structures.push(nursery);
          }

          const elapsedGestation = gestationTicks - oldTicksRemaining;
          const incubationTicks = SWARM_CONSTANTS.EGG_INCUBATION_TICKS;
          parsed.swarm.eggs.push({
            id: `egg-migrated-${Date.now()}`,
            queenId: queen.id,
            nurseryId: nursery.id,
            type: 'worker' as const,
            phase:
              elapsedGestation < incubationTicks ? 'incubating' : 'maturing',
            ticksInPhase:
              elapsedGestation < incubationTicks
                ? elapsedGestation
                : elapsedGestation - incubationTicks,
            totalTicks: elapsedGestation,
          });
        }
      }
    }

    // Backfill worker energy pool and metabolism for old saves
    for (const worker of parsed.swarm.workers) {
      const w = worker as unknown as Record<string, unknown>;
      if (!worker.energy || typeof worker.energy !== 'object') {
        worker.energy = {
          current: SWARM_CONSTANTS.WORKER_ENERGY_MAX,
          max: SWARM_CONSTANTS.WORKER_ENERGY_MAX,
        };
      }
      if (
        !worker.health ||
        typeof worker.health !== 'object' ||
        !('current' in worker.health)
      ) {
        // Migrate from old number health to EnergyPool
        const oldHealth =
          typeof w.health === 'number'
            ? w.health
            : SWARM_CONSTANTS.WORKER_HEALTH_MAX;
        worker.health = {
          current: Math.max(
            0,
            Math.min(SWARM_CONSTANTS.WORKER_HEALTH_MAX, oldHealth)
          ),
          max: SWARM_CONSTANTS.WORKER_HEALTH_MAX,
        };
      }
      if (
        typeof worker.metabolismPerTick !== 'number' ||
        !Number.isFinite(worker.metabolismPerTick) ||
        worker.metabolismPerTick <= 0
      ) {
        worker.metabolismPerTick =
          SWARM_CONSTANTS.WORKER_ENERGY_MAX /
          SWARM_CONSTANTS.WORKER_ENERGY_DEPLETION_TICKS;
      }
      if (
        typeof worker.hpDecayPerTickAtZeroEnergy !== 'number' ||
        !Number.isFinite(worker.hpDecayPerTickAtZeroEnergy) ||
        worker.hpDecayPerTickAtZeroEnergy <= 0
      ) {
        worker.hpDecayPerTickAtZeroEnergy =
          SWARM_CONSTANTS.WORKER_HEALTH_MAX /
          SWARM_CONSTANTS.WORKER_HP_DEPLETION_TICKS_AT_ZERO_ENERGY;
      }
    }

    // Ensure at least one nursery exists (for old saves that had no structures)
    if (
      parsed.swarm.structures.length === 0 &&
      parsed.swarm.queens.length > 0
    ) {
      const firstQueen = parsed.swarm.queens[0];
      parsed.swarm.structures.push(createNursery(firstQueen.locationZoneId));
    }

    return parsed;
  } catch (error) {
    console.error('Failed to load save:', error);
    return null;
  }
}

// ============================================================================
// GAME STATE CHECKS
// ============================================================================

export function isGameOver(data: GameData): boolean {
  // Game over if no queens and no workers
  return data.swarm.queens.length === 0 && data.swarm.workers.length === 0;
}

export function getGameStatus(data: GameData): string {
  if (isGameOver(data)) {
    return 'Game Over - Swarm extinct';
  }

  const queen = data.swarm.queens[0];
  if (!queen) {
    return 'Critical - No queen';
  }

  const workerCount = data.swarm.workers.length;
  const capacity = queen.neuralCapacity;

  if (workerCount === 0) {
    return 'Starting - No workers yet';
  } else if (workerCount < capacity) {
    return 'Growing - Below capacity';
  } else if (workerCount < capacity * 1.5) {
    return 'Stable - Near capacity';
  } else {
    return 'Strained - Over capacity';
  }
}
