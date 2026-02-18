import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatRealDuration,
  formatDualTime,
} from '../timeSystem';

// ── formatDuration ────────────────────────────────────────────────

describe('formatDuration', () => {
  // One representative test per branch to confirm basic behavior
  it('formats each time unit', () => {
    expect(formatDuration(15)).toBe('15s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(90000)).toBe('1d 1h');
  });

  // Rounding boundary regression tests — the actual bug
  it('carries seconds to minutes when rounding hits 60', () => {
    expect(formatDuration(59.5)).toBe('1m');
    expect(formatDuration(119.5)).toBe('2m');
  });

  it('carries seconds past minutes into hours', () => {
    expect(formatDuration(3599.5)).toBe('1h');
  });

  it('carries minutes to hours when rounding hits 60', () => {
    expect(formatDuration(7199.5)).toBe('2h');
  });

  it('carries minutes past hours into days', () => {
    expect(formatDuration(86399.5)).toBe('1d');
  });

  it('carries hours to days when rounding hits 24', () => {
    expect(formatDuration(172799.5)).toBe('2d');
  });
});

// ── formatRealDuration ────────────────────────────────────────────

describe('formatRealDuration', () => {
  // Same rounding bug — fewer branches (no days bracket)
  it('carries seconds to minutes when rounding hits 60', () => {
    expect(formatRealDuration(59.5)).toBe('1m');
    expect(formatRealDuration(119.5)).toBe('2m');
  });

  it('carries seconds past minutes into hours', () => {
    expect(formatRealDuration(3599.5)).toBe('1h');
  });

  it('carries minutes to hours when rounding hits 60', () => {
    expect(formatRealDuration(7199.5)).toBe('2h');
  });
});

// ── formatDualTime ────────────────────────────────────────────────

describe('formatDualTime', () => {
  it('shows both game and real time', () => {
    // 86400 game sec = 1 game day, / 180 = 480 real sec = 8 real min
    expect(formatDualTime(86400)).toBe('1d (irl 8m)');
  });
});
