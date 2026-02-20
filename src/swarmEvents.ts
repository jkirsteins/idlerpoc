import type { GameData, Worker, Queen } from './models/swarmTypes';

// ── Event Definitions ────────────────────────────────────────────

/** A worker hatched from an egg and joined the swarm. */
export interface WorkerHatchedEvent {
  type: 'worker_hatched';
  worker: Worker;
  queen: Queen;
}

/**
 * Discriminated union of all swarm events.
 * Add new event interfaces above, then include them in this union.
 * The event bus emits synchronously within the current tick.
 */
export type SwarmEvent = WorkerHatchedEvent;

// ── Event Bus ────────────────────────────────────────────────────

type SwarmEventHandler = (gameData: GameData, event: SwarmEvent) => void;

let _handlers: Record<string, SwarmEventHandler[]> = {};

/**
 * Subscribe to a specific swarm event type.
 * Returns an unsubscribe function.
 */
export function onSwarm(
  eventType: SwarmEvent['type'],
  handler: SwarmEventHandler
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
 * Emit a swarm event synchronously to all registered handlers.
 * Handlers run in registration order within the current call stack.
 */
export function emitSwarm(gameData: GameData, event: SwarmEvent): void {
  const list = _handlers[event.type];
  if (!list || list.length === 0) return;
  for (const handler of list) {
    handler(gameData, event);
  }
}

/** Remove all listeners. Used in tests to reset state between runs. */
export function clearSwarmListeners(): void {
  _handlers = {};
}
