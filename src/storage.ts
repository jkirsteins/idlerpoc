import type { GameData } from './models';

const STORAGE_KEY = 'spaceship_game_data';

export function saveGame(gameData: GameData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameData));
}

export function loadGame(): GameData | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as GameData;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}
