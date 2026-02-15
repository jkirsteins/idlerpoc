import { describe, expect, it } from 'vitest';

import { createNewGame } from '../gameFactory';
import { applyTick } from '../gameTickSwarm';

function runTicks(ticks: number): ReturnType<typeof createNewGame> {
  const game = createNewGame();

  for (let i = 0; i < ticks; i++) {
    applyTick(game, game.lastTickTimestamp + 1000);
  }

  return game;
}

describe('queen metabolism', () => {
  it('depletes queen energy to near zero across one in-game year', () => {
    const seed = createNewGame();
    const homePlanet = seed.planets.find(
      (planet) => planet.id === seed.homePlanetId
    );
    expect(homePlanet).toBeTruthy();

    const oneYearTicks = homePlanet!.dayLengthTicks;
    const game = runTicks(oneYearTicks);
    const queen = game.swarm.queens[0];
    expect(queen).toBeTruthy();
    expect(queen.energy.current).toBeLessThanOrEqual(0.5);
    expect(queen.health.current).toBeGreaterThan(95);
  });

  it('drains health over seven years at zero energy then queen dies', () => {
    const seed = createNewGame();
    const homePlanet = seed.planets.find(
      (planet) => planet.id === seed.homePlanetId
    );
    expect(homePlanet).toBeTruthy();

    const oneYearTicks = homePlanet!.dayLengthTicks;
    const game = runTicks(oneYearTicks * 8 + 5);
    expect(game.swarm.queens.length).toBe(0);
  });
});
