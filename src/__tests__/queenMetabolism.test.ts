import { describe, expect, it } from 'vitest';

import { SWARM_CONSTANTS } from '../models/swarmTypes';
import { createNewGame } from '../gameFactory';
import { applyTick } from '../gameTickSwarm';

describe('queen metabolism', () => {
  it('depletes queen reserves (buffer + energy) across two in-game years', () => {
    const game = createNewGame();
    // Disable egg production so queen doesn't spend energy on eggs
    game.swarm.queens[0].eggProduction.enabled = false;

    // Queen starts with 100 energy + 100 biomass buffer = 200 total reserves.
    // Metabolism depletes 100 energy/year, buffer refuels energy each tick.
    // Total reserves last ~2 years.
    const twoYearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR * 2;
    applyTick(game, game.lastTickTimestamp + twoYearTicks * 1000, twoYearTicks);

    const queen = game.swarm.queens[0];
    expect(queen).toBeTruthy();
    expect(queen.energy.current).toBeLessThanOrEqual(0.5);
    expect(queen.biomassBuffer.current).toBeLessThanOrEqual(0.5);
    expect(queen.health.current).toBeGreaterThan(95);
  });

  it('drains health after reserves depleted then queen dies', () => {
    const game = createNewGame();
    // Disable egg production so queen doesn't spend energy on eggs
    game.swarm.queens[0].eggProduction.enabled = false;

    // 2 years to deplete reserves (energy + buffer), 7 years to die from health drain
    // Total: ~9 years + safety margin
    const oneYearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR;
    const totalTicks = oneYearTicks * 10;
    applyTick(game, game.lastTickTimestamp + totalTicks * 1000, totalTicks);

    expect(game.swarm.queens.length).toBe(0);
  });
});
