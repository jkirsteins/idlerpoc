import type { LogEntry } from './models';

/**
 * Log System
 *
 * Creates log entries for significant game events
 */

export function createLogEntry(
  gameTime: number,
  type: LogEntry['type'],
  message: string
): LogEntry {
  return {
    gameTime,
    type,
    message,
  };
}

export function addLog(
  log: LogEntry[],
  gameTime: number,
  type: LogEntry['type'],
  message: string
): void {
  log.push(createLogEntry(gameTime, type, message));
}
