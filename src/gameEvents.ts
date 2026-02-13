import type { GameData, Ship } from './models';

// ── Event Definitions ────────────────────────────────────────────

/** Ship docked at a location (trade station, mining outpost, etc.). */
export interface ShipDockedEvent {
  type: 'ship_docked';
  ship: Ship;
  locationId: string;
}

/**
 * Discriminated union of all game events.
 *
 * Add new event interfaces above, then include them in this union.
 * The event bus emits synchronously within the current tick.
 */
export type GameEvent = ShipDockedEvent;

// ── Event Bus ────────────────────────────────────────────────────

type EventHandler = (gameData: GameData, event: GameEvent) => void;

let _handlers: Record<string, EventHandler[]> = {};

/**
 * Subscribe to a specific event type.
 * Returns an unsubscribe function (useful for tests).
 */
export function on(
  eventType: GameEvent['type'],
  handler: EventHandler
): () => void {
  if (!_handlers[eventType]) {
    _handlers[eventType] = [];
  }
  const list = _handlers[eventType];
  list.push(handler);

  return () => {
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  };
}

/**
 * Emit an event synchronously to all registered handlers.
 * Handlers run in registration order within the current call stack.
 */
export function emit(gameData: GameData, event: GameEvent): void {
  const list = _handlers[event.type];
  if (!list || list.length === 0) return;
  for (const handler of list) {
    handler(gameData, event);
  }
}

/** Remove all listeners. Used in tests to reset state between runs. */
export function clearAllListeners(): void {
  _handlers = {};
}
