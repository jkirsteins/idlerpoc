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
      console.log('Incompatible save detected, clearing...');
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
