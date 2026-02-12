import type { Ship, GameData } from './models';
import { unassignCrewFromAllSlots } from './jobSlots';
import { addLog } from './logSystem';

/**
 * Check for crew deaths after all health modifications in a tick.
 * Crew members with health <= 0 are removed from the ship.
 * The captain (player avatar) is exempt — health floors at 1.
 *
 * Returns true if any crew died.
 */
export function processCrewDeaths(ship: Ship, gameData: GameData): boolean {
  const deadCrew = ship.crew.filter((c) => c.health <= 0 && !c.isCaptain);

  // Floor captain health at 1 — they're the player avatar
  for (const crew of ship.crew) {
    if (crew.isCaptain && crew.health <= 0) {
      crew.health = 1;
    }
  }

  if (deadCrew.length === 0) return false;

  for (const crew of deadCrew) {
    const crewIndex = ship.crew.indexOf(crew);
    if (crewIndex !== -1) {
      ship.crew.splice(crewIndex, 1);
    }

    unassignCrewFromAllSlots(ship, crew.id);

    addLog(
      gameData.log,
      gameData.gameTime,
      'crew_death',
      `${crew.name} has died aboard ${ship.name}.`,
      ship.name
    );
  }

  return true;
}
