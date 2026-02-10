/**
 * Time System
 *
 * 1 tick = 1 real second = 3 game minutes (180 game seconds)
 * 1 game day = 480 ticks (~8 real minutes)
 * 1 game month (30 days) = 14,400 ticks (~4 real hours)
 *
 * Epoch: 2247-01-01 00:00 (gameTime = 0)
 */

export const GAME_SECONDS_PER_TICK = 180; // 3 game minutes (10x slower pacing for idle gameplay)
export const TICKS_PER_DAY = 480;
export const GAME_SECONDS_PER_DAY = 86400; // 24 hours
export const EPOCH_YEAR = 2247;
export const EPOCH_MONTH = 0; // January (0-indexed)
export const EPOCH_DAY = 1;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Convert game time (elapsed game-seconds since epoch) to a Date object
 */
export function gameTimeToDate(gameTime: number): Date {
  const epochDate = new Date(EPOCH_YEAR, EPOCH_MONTH, EPOCH_DAY, 0, 0, 0);
  const gameMillis = gameTime * 1000;
  return new Date(epochDate.getTime() + gameMillis);
}

/**
 * Format game time as "Jan 1, 2247 - Day 1"
 */
export function formatGameDate(gameTime: number): string {
  const date = gameTimeToDate(gameTime);
  const month = MONTH_NAMES[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  // Calculate day number within the year
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear =
    Math.floor(
      (date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  return `${month} ${day}, ${year} - Day ${dayOfYear}`;
}

/**
 * Format game time with hours and minutes: "Jan 1, 2247 14:30"
 */
export function formatGameDateTime(gameTime: number): string {
  const date = gameTimeToDate(gameTime);
  const month = MONTH_NAMES[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${month} ${day}, ${year} ${hours}:${minutes}`;
}

/**
 * Advance game time by one day
 */
export function advanceDay(currentGameTime: number): number {
  return currentGameTime + GAME_SECONDS_PER_DAY;
}

/**
 * Advance to the start of the next day (midnight)
 */
export function advanceToNextDayStart(currentGameTime: number): number {
  const nextDay = getDaysSinceEpoch(currentGameTime) + 1;
  return nextDay * GAME_SECONDS_PER_DAY;
}

/**
 * Get the number of days elapsed since epoch
 */
export function getDaysSinceEpoch(gameTime: number): number {
  return Math.floor(gameTime / GAME_SECONDS_PER_DAY);
}

/**
 * Format duration in game time to human-readable string
 */
export function formatDuration(gameSeconds: number): string {
  if (gameSeconds < 60) {
    return `${Math.round(gameSeconds)}s`;
  } else if (gameSeconds < 3600) {
    const minutes = Math.floor(gameSeconds / 60);
    const seconds = Math.round(gameSeconds % 60);
    if (seconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  } else if (gameSeconds < 86400) {
    const hours = Math.floor(gameSeconds / 3600);
    const minutes = Math.round((gameSeconds % 3600) / 60);
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  } else {
    const days = Math.floor(gameSeconds / 86400);
    const hours = Math.round((gameSeconds % 86400) / 3600);
    if (hours === 0) {
      return `${days}d`;
    }
    return `${days}d ${hours}h`;
  }
}

/**
 * Convert game seconds to ticks
 */
export function gameSecondsToTicks(gameSeconds: number): number {
  return Math.ceil(gameSeconds / GAME_SECONDS_PER_TICK);
}

/**
 * Convert ticks to game seconds
 */
export function ticksToGameSeconds(ticks: number): number {
  return ticks * GAME_SECONDS_PER_TICK;
}

/**
 * Format real-world duration to human-readable string
 */
export function formatRealDuration(realSeconds: number): string {
  if (realSeconds < 60) {
    return `${Math.round(realSeconds)}s`;
  } else if (realSeconds < 3600) {
    const minutes = Math.floor(realSeconds / 60);
    const seconds = Math.round(realSeconds % 60);
    if (seconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(realSeconds / 3600);
    const minutes = Math.round((realSeconds % 3600) / 60);
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Format duration showing both game time and real-world time.
 * Example: "2.5d (irl 3m)"
 */
export function formatDualTime(gameSeconds: number): string {
  const gamePart = formatDuration(gameSeconds);
  const realSeconds = gameSeconds / GAME_SECONDS_PER_TICK; // 1 tick = 1 real second
  const realPart = formatRealDuration(realSeconds);
  return `${gamePart} (irl ${realPart})`;
}
