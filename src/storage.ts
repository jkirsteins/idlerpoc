import type { GameData } from './models';

const STORAGE_KEY = 'spaceship_game_data';

export function saveGame(gameData: GameData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameData));
}

export function loadGame(): GameData | null {
  const data = localStorage.getItem(STORAGE_KEY);
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
