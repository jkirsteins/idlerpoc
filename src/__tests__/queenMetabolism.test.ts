import { describe, expect, it } from 'vitest';

import { SWARM_CONSTANTS } from '../models/swarmTypes';
import { createNewGame } from '../gameFactory';
import { applyTick, processCatchUp } from '../gameTickSwarm';

describe('queen metabolism', () => {
  it('depletes queen reserves (buffer + energy) across two in-game years', () => {
    const game = createNewGame();
    // Disable egg production so queen doesn't spend energy on eggs
    game.swarm.queens[0].eggProduction.enabled = false;

    // Queen starts with 100 energy + 100 biomass buffer = 200 total reserves.
    // Metabolism depletes 100 energy/year, buffer refuels energy each tick.
    // Buffer depletes in ~1 year. Then energy starts draining.
    // At 15% energy (15), dormancy kicks in (10% metabolism rate).
    // After 2 years: buffer empty, energy ~13.5 due to dormancy slow-down.
    const twoYearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR * 2;
    applyTick(game, game.lastTickTimestamp + twoYearTicks * 1000, twoYearTicks);

    const queen = game.swarm.queens[0];
    expect(queen).toBeTruthy();
    // Buffer should be fully depleted
    expect(queen.biomassBuffer.current).toBeLessThanOrEqual(0.5);
    // Energy partially depleted but dormancy preserves it
    expect(queen.energy.current).toBeLessThan(queen.energy.max * 0.2);
    expect(queen.energy.current).toBeGreaterThan(0);
    // Health should be intact — still has energy reserves
    expect(queen.health.current).toBeGreaterThan(95);
    // Queen should be dormant (no workers, low energy, buffer empty)
    expect(queen.isDormant).toBe(true);
  });

  it('drains health after reserves depleted then queen dies (via catch-up)', () => {
    const game = createNewGame();
    // Disable egg production so queen doesn't spend energy on eggs
    game.swarm.queens[0].eggProduction.enabled = false;

    // With dormancy active (10% metabolism), queen survives ~73 years.
    // Use processCatchUp (batch path) which handles long absences efficiently
    // without tick-by-tick simulation.
    const oneYearTicks = SWARM_CONSTANTS.TICKS_PER_YEAR;
    const totalTicks = oneYearTicks * 80;

    // Simulate a long absence via catch-up (>1 day triggers batch path)
    const catchUpTime = game.lastTickTimestamp + totalTicks * 1000;
    processCatchUp(game, catchUpTime);

    expect(game.swarm.queens.length).toBe(0);
  });
});
