import type { LogEntry } from './models';

/**
 * Log System
 *
 * Creates log entries for significant game events.
 * The log is capped at MAX_LOG_ENTRIES to prevent unbounded growth
 * which would eventually exceed localStorage's ~5 MB quota and cause
 * silent save failures.
 */

/**
 * Maximum number of log entries kept in the save.
 * Oldest entries beyond this limit are discarded.
 */
export const MAX_LOG_ENTRIES = 200;

export function createLogEntry(
  gameTime: number,
  type: LogEntry['type'],
  message: string,
  shipName?: string
): LogEntry {
  const entry: LogEntry = {
    gameTime,
    type,
    message,
  };
  if (shipName) {
    entry.shipName = shipName;
  }
  return entry;
}

export function addLog(
  log: LogEntry[],
  gameTime: number,
  type: LogEntry['type'],
  message: string,
  shipName?: string
): void {
  log.push(createLogEntry(gameTime, type, message, shipName));

  // Trim oldest entries to stay within budget.
  // We keep a small buffer above MAX_LOG_ENTRIES before trimming to
  // avoid splicing on every single push.
  const TRIM_BUFFER = 50;
  if (log.length > MAX_LOG_ENTRIES + TRIM_BUFFER) {
    log.splice(0, log.length - MAX_LOG_ENTRIES);
  }
}
