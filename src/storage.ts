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

    // Check if this is an old incompatible save (missing new fields)
    if (
      loaded.gameTime === undefined ||
      loaded.availableQuests === undefined ||
      loaded.activeContract === undefined ||
      loaded.log === undefined ||
      loaded.lastTickTimestamp === undefined
    ) {
      // Incompatible save format - clear it
      console.log(
        'Incompatible save detected (missing top-level fields), clearing...'
      );
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Check if world locations have the size field
    if (!loaded.world?.locations || loaded.world.locations.length === 0) {
      console.log('Incompatible save detected (no locations), clearing...');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Check if first location has size field (all should have it)
    if (loaded.world.locations[0].size === undefined) {
      console.log(
        'Incompatible save detected (locations missing size field), clearing...'
      );
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return loaded as GameData;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}
