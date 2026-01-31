import type { Character } from './character';

const STORAGE_KEY = 'idle_game_character';

export function saveCharacter(character: Character): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(character));
}

export function loadCharacter(): Character | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as Character;
  } catch {
    return null;
  }
}

export function clearCharacter(): void {
  localStorage.removeItem(STORAGE_KEY);
}
