import { describe, expect, it } from 'vitest';

import { createNewGame } from '../gameFactory';
import { normalizePlanetsFromSave } from '../trappist1Data';

describe('swarm ownership', () => {
  it('starts with exactly one queen and one owned starting zone', () => {
    const game = createNewGame();

    expect(game.swarm.queens.length).toBe(1);

    const ownedZones = game.planets
      .flatMap((planet) => planet.zones)
      .filter((zone) => zone.ownedBySwarm);
    expect(ownedZones.length).toBe(1);
    expect(ownedZones[0].id).toBe(game.swarm.queens[0].locationZoneId);
  });

  it('backfills missing ownership from legacy non-unexplored zones', () => {
    const game = createNewGame();
    const asimov = game.planets.find((planet) => planet.id === 'asimov');
    expect(asimov).toBeTruthy();

    asimov!.zones[1].state = 'converting';
    asimov!.zones[1].ownedBySwarm = undefined as unknown as boolean;

    const normalized = normalizePlanetsFromSave(game.planets);
    const normalizedAsimov = normalized.find(
      (planet) => planet.id === 'asimov'
    );
    expect(normalizedAsimov).toBeTruthy();
    expect(normalizedAsimov!.zones[1].ownedBySwarm).toBe(true);
  });
});
