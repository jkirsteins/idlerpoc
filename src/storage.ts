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

    return loaded as GameData;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}
