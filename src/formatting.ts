/**
 * Centralized value-display formatting utilities.
 *
 * Every player-visible number should pass through one of these functions
 * so that format changes (locale, abbreviation rules, unit labels) only
 * need to happen in one place.
 */

// ── Credits ──────────────────────────────────────────────────────

/** Format a credit amount for display.  Example: `1,234 cr` */
export function formatCredits(amount: number): string {
  return `${Math.round(amount).toLocaleString()} cr`;
}

// ── Distance ─────────────────────────────────────────────────────

/**
 * Abbreviate a large number with K / M suffixes.
 * Examples: 500 → "500", 12000 → "12K", 1500000 → "1.5M"
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(0) + 'K';
  return num.toFixed(0);
}

/**
 * Format a distance in kilometres for display.
 * Examples: 0.3 → "< 1 km", 800 → "800 km", 45000 → "45K km", 1.5e6 → "1.5M km"
 */
export function formatDistance(km: number): string {
  if (km < 0.5) return '< 1 km';
  if (km < 1_000) return `${Math.round(km)} km`;
  return `${formatLargeNumber(km)} km`;
}

/**
 * Classify a range value into a human-readable orbital region label.
 */
export function getRangeLabel(rangeKm: number): string {
  if (rangeKm < 50_000) return 'LEO/MEO';
  if (rangeKm < 1_000_000) return 'GEO/Cislunar';
  if (rangeKm < 10_000_000) return 'Inner System';
  if (rangeKm < 100_000_000) return 'Mars';
  if (rangeKm < 500_000_000) return 'Jupiter';
  return 'Outer System';
}

// ── Mass ─────────────────────────────────────────────────────────

/** Format a mass value in kilograms.  Example: `12,500 kg` */
export function formatMass(kg: number): string {
  return `${Math.round(kg).toLocaleString()} kg`;
}

// ── Atmosphere ───────────────────────────────────────────────────

export function formatAtmosphericMass(units: number): string {
  return `${formatLargeNumber(units)} atm-u`;
}

export function formatPressureIndex(index: number): string {
  return `${index.toFixed(2)} P`;
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// ── Log Timestamps ──────────────────────────────────────

/**
 * Format a log entry timestamp showing real-life time (primary) with in-game time as flavor.
 * Example: `Feb 14, 2026 3:45 PM (Day 42)`
 */
export function formatLogTimestamp(realTime: number, gameTime: number): string {
  // Format real-time (milliseconds since epoch)
  const date = new Date(realTime);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();
  const time = date.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Format in-game date from gameTime (game-seconds since epoch 2247-01-01)
  const epochDate = new Date(2247, 0, 1, 0, 0, 0);
  const gameMillis = gameTime * 1000;
  const gameDate = new Date(epochDate.getTime() + gameMillis);
  const startOfYear = new Date(gameDate.getFullYear(), 0, 1);
  const dayOfYear =
    Math.floor(
      (gameDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  return `${month} ${day}, ${year} ${time} (Day ${dayOfYear})`;
}
