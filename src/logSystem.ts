import type { LogEntry } from './models';

/**
 * Log System
 *
 * Creates log entries for significant game events
 */

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
}
