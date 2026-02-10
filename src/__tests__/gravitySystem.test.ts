import { describe, it, expect } from 'vitest';
import {
  getGravityDegradationLevel,
  getRecoveryTarget,
  estimateRecoveryTime,
  applyGravityRecovery,
  formatExposureDays,
} from '../gravitySystem';
import { createTestShip, createTestCrew } from './testHelpers';

const SECONDS_PER_DAY = 24 * 60 * 60;

describe('getRecoveryTarget', () => {
  it('returns threshold 0 / level none when exposure is below safe threshold', () => {
    const result = getRecoveryTarget(10 * SECONDS_PER_DAY);
    expect(result.threshold).toBe(0);
    expect(result.level).toBe('none');
  });

  it('returns safe threshold / level none when in minor zone', () => {
    const result = getRecoveryTarget(30 * SECONDS_PER_DAY);
    expect(result.threshold).toBe(14 * SECONDS_PER_DAY);
    expect(result.level).toBe('none');
  });

  it('returns minor threshold / level minor when in moderate zone', () => {
    const result = getRecoveryTarget(100 * SECONDS_PER_DAY);
    expect(result.threshold).toBe(60 * SECONDS_PER_DAY);
    expect(result.level).toBe('minor');
  });

  it('returns moderate threshold / level moderate when in severe zone', () => {
    const result = getRecoveryTarget(200 * SECONDS_PER_DAY);
    expect(result.threshold).toBe(180 * SECONDS_PER_DAY);
    expect(result.level).toBe('moderate');
  });

  it('returns severe threshold / level severe when in critical zone', () => {
    const result = getRecoveryTarget(400 * SECONDS_PER_DAY);
    expect(result.threshold).toBe(365 * SECONDS_PER_DAY);
    expect(result.level).toBe('severe');
  });
});

describe('estimateRecoveryTime', () => {
  it('returns 0 for zero exposure', () => {
    const result = estimateRecoveryTime(0);
    expect(result.gameSecondsToFullRecovery).toBe(0);
    expect(result.gameSecondsToNextLevel).toBe(0);
    expect(result.targetLevel).toBe('none');
  });

  it('estimates correct full recovery time for minor atrophy', () => {
    // 30 days exposure, recovery rate 0.5x, so 60 days of game-time to recover
    const exposure = 30 * SECONDS_PER_DAY;
    const result = estimateRecoveryTime(exposure);
    expect(result.gameSecondsToFullRecovery).toBe(60 * SECONDS_PER_DAY);
  });

  it('estimates time to reach next lower level from minor to none', () => {
    // At 30 days exposure, need to recover below 14 days threshold
    // Excess: 30 - 14 = 16 days of exposure above threshold
    // At 0.5x rate: 16 / 0.5 = 32 days of game-time
    const exposure = 30 * SECONDS_PER_DAY;
    const result = estimateRecoveryTime(exposure);
    expect(result.targetLevel).toBe('none');
    expect(result.gameSecondsToNextLevel).toBe(32 * SECONDS_PER_DAY);
  });

  it('estimates time from moderate to minor', () => {
    // At 100 days exposure, need to recover below 60 days threshold
    // Excess: 100 - 60 = 40 days
    // At 0.5x rate: 40 / 0.5 = 80 days of game-time
    const exposure = 100 * SECONDS_PER_DAY;
    const result = estimateRecoveryTime(exposure);
    expect(result.targetLevel).toBe('minor');
    expect(result.gameSecondsToNextLevel).toBe(80 * SECONDS_PER_DAY);
  });

  it('returns full recovery time when already at none level', () => {
    // 5 days exposure, still in 'none' zone
    const exposure = 5 * SECONDS_PER_DAY;
    const result = estimateRecoveryTime(exposure);
    expect(result.targetLevel).toBe('none');
    // Full recovery: 5 / 0.5 = 10 days of game-time
    expect(result.gameSecondsToFullRecovery).toBe(10 * SECONDS_PER_DAY);
    expect(result.gameSecondsToNextLevel).toBe(10 * SECONDS_PER_DAY);
  });

  it('shows correct IRL time for short flights', () => {
    // 45 real seconds of flight = 45 * 180 = 8100 game-seconds exposure
    const exposure = 8100;
    const result = estimateRecoveryTime(exposure);
    // Full recovery: 8100 / 0.5 = 16200 game-seconds
    // IRL: 16200 / 180 = 90 real seconds (1.5 min, ~2x the 45s flight)
    expect(result.gameSecondsToFullRecovery).toBe(16200);
  });
});

describe('applyGravityRecovery when docked', () => {
  it('reduces crew zero-g exposure when docked', () => {
    const crew = createTestCrew({ zeroGExposure: 30 * SECONDS_PER_DAY });
    const ship = createTestShip({
      crew: [crew],
      location: { status: 'docked', dockedAt: 'earth' },
    });

    applyGravityRecovery(ship, SECONDS_PER_DAY);

    // Recovery: 1 day * 0.5 = 0.5 days recovered
    const expectedExposure = 30 * SECONDS_PER_DAY - 0.5 * SECONDS_PER_DAY;
    expect(ship.crew[0].zeroGExposure).toBe(expectedExposure);
  });

  it('does not reduce below zero', () => {
    const crew = createTestCrew({ zeroGExposure: 100 }); // tiny exposure
    const ship = createTestShip({
      crew: [crew],
      location: { status: 'docked', dockedAt: 'earth' },
    });

    applyGravityRecovery(ship, SECONDS_PER_DAY);
    expect(ship.crew[0].zeroGExposure).toBe(0);
  });

  it('does not recover when not docked', () => {
    const crew = createTestCrew({ zeroGExposure: 30 * SECONDS_PER_DAY });
    const ship = createTestShip({
      crew: [crew],
      location: { status: 'in_flight' },
    });

    applyGravityRecovery(ship, SECONDS_PER_DAY);
    expect(ship.crew[0].zeroGExposure).toBe(30 * SECONDS_PER_DAY);
  });

  it('recovers enough to cross a threshold after sufficient days', () => {
    // Start at 15 days (minor atrophy, just above 14-day safe threshold)
    const crew = createTestCrew({ zeroGExposure: 15 * SECONDS_PER_DAY });
    const ship = createTestShip({
      crew: [crew],
      location: { status: 'docked', dockedAt: 'earth' },
    });

    expect(getGravityDegradationLevel(ship.crew[0].zeroGExposure)).toBe(
      'minor'
    );

    // Advance 3 days: recover 3 * 0.5 = 1.5 days → 13.5 days (below 14-day threshold)
    applyGravityRecovery(ship, 3 * SECONDS_PER_DAY);

    expect(getGravityDegradationLevel(ship.crew[0].zeroGExposure)).toBe('none');
    expect(formatExposureDays(ship.crew[0].zeroGExposure)).toBe(13);
  });
});
