import type { GameData } from './models';

const STORAGE_KEY = 'spaceship_game_data';

/** Whether the last save attempt failed (used for UI warnings). */
let _lastSaveFailed = false;

export function lastSaveFailed(): boolean {
  return _lastSaveFailed;
}

/**
 * Persist game state to localStorage.
 * Returns true on success, false if the write failed (e.g. quota exceeded,
 * private-browsing restrictions, or storage disabled).
 */
export function saveGame(gameData: GameData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameData));
    _lastSaveFailed = false;
    return true;
  } catch (e) {
    console.error('Failed to save game:', e);
    _lastSaveFailed = true;
    return false;
  }
}

export function loadGame(): GameData | null {
  let data: string | null;
  try {
    data = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to read save from localStorage:', e);
    return null;
  }
  if (!data) return null;
  try {
    const loaded = JSON.parse(data) as Partial<GameData>;

    // Check for fleet architecture (new format)
    if (!loaded.ships || !loaded.activeShipId || loaded.credits === undefined) {
      console.log('Incompatible save detected (pre-fleet format), clearing...');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Validate basic structure
    if (
      loaded.gameTime === undefined ||
      loaded.availableQuests === undefined ||
      loaded.log === undefined ||
      loaded.lastTickTimestamp === undefined ||
      loaded.lastQuestRegenDay === undefined
    ) {
      console.log(
        'Incompatible save detected (missing top-level fields), clearing...'
      );
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Check if availableQuests is the old array format
    if (Array.isArray(loaded.availableQuests)) {
      console.log(
        'Incompatible save detected (old quest array format), clearing...'
      );
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Backfill new fields for old saves
    if (!loaded.visitedLocations) {
      loaded.visitedLocations = [];
    }

    // Backfill time system fields for old saves
    if (loaded.isPaused === undefined) {
      loaded.isPaused = false;
    }
    if (loaded.timeSpeed === undefined) {
      loaded.timeSpeed = 1;
    }
    if (!loaded.autoPauseSettings) {
      loaded.autoPauseSettings = {
        onArrival: true,
        onContractComplete: true,
        onCriticalAlert: true,
        onLowFuel: true,
      };
    }

    // Backfill ship metrics for old saves
    if (loaded.ships) {
      for (const ship of loaded.ships) {
        if (!ship.metrics) {
          ship.metrics = {
            creditsEarned: 0,
            fuelCostsPaid: 0,
            crewCostsPaid: 0,
            repairCostsPaid: 0,
            contractsCompleted: 0,
            totalFlightTicks: 0,
            totalIdleTicks: 0,
            lastActivityTime: 0,
          };
        }
        // Backfill role if missing
        if (ship.role === undefined) {
          ship.role = undefined;
        }
        // Backfill flight profile burn fraction (default: max speed)
        if (ship.flightProfileBurnFraction === undefined) {
          ship.flightProfileBurnFraction = 1.0;
        }
        // Backfill burnFraction on active flight plans
        if (
          ship.activeFlightPlan &&
          ship.activeFlightPlan.burnFraction === undefined
        ) {
          ship.activeFlightPlan.burnFraction = 1.0;
        }
        // Backfill oxygen level for old saves
        if (ship.oxygenLevel === undefined) {
          ship.oxygenLevel = 100;
        }
      }
    }

    return loaded as GameData;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}
