// Game Factory - Create new swarm games

import type { GameData, Swarm } from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';
import {
  generateTRAPPIST1System,
  getStartingZone,
  normalizePlanetsFromSave,
} from './trappist1Data';
import { createQueen, createLogEntry } from './swarmSystem';
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
  const homePlanet = planets.find((planet) => planet.id === 'asimov');
  const yearTicks = homePlanet?.dayLengthTicks ?? SWARM_CONSTANTS.TICKS_PER_DAY;

  // Create initial queen
  const queen = createQueen(startingZone.id, yearTicks);

  // Create swarm
  const swarm: Swarm = {
    queens: [queen],
    workers: [],
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

    const homePlanet = parsed.planets.find((p) => p.id === parsed.homePlanetId);
    const yearTicks =
      homePlanet?.dayLengthTicks ?? SWARM_CONSTANTS.TICKS_PER_DAY;

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
