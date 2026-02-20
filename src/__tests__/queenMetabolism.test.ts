import { describe, expect, it } from 'vitest';

import { SWARM_CONSTANTS } from '../models/swarmTypes';
import { createNewGame } from '../gameFactory';
import { applyTick } from '../gameTickSwarm';

describe('queen metabolism', () => {
  it('depletes queen energy to near zero across one in-game year', () => {
    const game = createNewGame();
    // Disable egg production so queen doesn't spend energy on eggs
    game.swarm.queens[0].eggProduction.enabled = false;

    const oneYearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR;
    applyTick(game, game.lastTickTimestamp + oneYearTicks * 1000, oneYearTicks);

    const queen = game.swarm.queens[0];
    expect(queen).toBeTruthy();
    expect(queen.energy.current).toBeLessThanOrEqual(0.5);
    expect(queen.health.current).toBeGreaterThan(95);
  });

  it('drains health over seven years at zero energy then queen dies', () => {
    const game = createNewGame();
    // Disable egg production so queen doesn't spend energy on eggs
    game.swarm.queens[0].eggProduction.enabled = false;

    const oneYearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR;
    const totalTicks = oneYearTicks * 8 + 5;
    applyTick(game, game.lastTickTimestamp + totalTicks * 1000, totalTicks);

    expect(game.swarm.queens.length).toBe(0);
  });
});
