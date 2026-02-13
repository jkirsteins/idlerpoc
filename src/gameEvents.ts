import type {
  GameData,
  Ship,
  CrewMember,
  EncounterResult,
  SkillId,
} from './models';

// ── Event Definitions ────────────────────────────────────────────

/** Ship docked at a location (trade station, mining outpost, etc.). */
export interface ShipDockedEvent {
  type: 'ship_docked';
  ship: Ship;
  locationId: string;
}

/** Crew member hired at a station. */
export interface CrewHiredEvent {
  type: 'crew_hired';
  crew: CrewMember;
  ship: Ship;
  locationId: string;
}

/** Crew member died. */
export interface CrewDeathEvent {
  type: 'crew_death';
  crew: CrewMember;
  ship: Ship;
  cause: 'radiation' | 'suffocation' | 'starvation' | 'combat';
}

/** Crew member departed (quit due to unpaid salary). */
export interface CrewDepartedEvent {
  type: 'crew_departed';
  crew: CrewMember;
  ship: Ship;
  serviceDuration: number; // gameTime since hired
  unpaidTicks: number;
}

/** Crew member's health dropped dangerously low but survived. */
export interface CrewNearDeathEvent {
  type: 'crew_near_death';
  crew: CrewMember;
  ship: Ship;
  healthRemaining: number;
  prevHealth: number;
  cause: 'radiation' | 'suffocation' | 'starvation' | 'combat';
}

/** Crew member crossed a named skill rank boundary. */
export interface CrewSkillMilestoneEvent {
  type: 'crew_skill_milestone';
  crew: CrewMember;
  ship: Ship;
  skill: SkillId;
  newLevel: number;
  newRank: string;
}

/** Crew member's role changed due to skill growth. */
export interface CrewRoleChangeEvent {
  type: 'crew_role_change';
  crew: CrewMember;
  ship: Ship;
  oldRole: string;
  newRole: string;
}

/** An encounter was resolved (any outcome). */
export interface EncounterResolvedEvent {
  type: 'encounter_resolved';
  result: EncounterResult;
  ship: Ship;
}

/** A ship became stranded (no fuel to reach refueling). */
export interface ShipStrandedEvent {
  type: 'ship_stranded';
  ship: Ship;
  locationId: string;
  provisionsDays: number;
}

/** A stranded ship was rescued. */
export interface ShipRescuedEvent {
  type: 'ship_rescued';
  rescuerShip: Ship;
  strandedShip: Ship;
  fuelDelivered: number;
}

/** A multi-trip contract was completed. */
export interface ContractCompletedEvent {
  type: 'contract_completed';
  ship: Ship;
  questTitle: string;
  tripsCompleted: number;
  totalCreditsEarned: number;
}

/** Ship arrived at a new location for the first time. */
export interface FirstVisitEvent {
  type: 'first_visit';
  ship: Ship;
  locationId: string;
  locationName: string;
  distanceFromEarth: number;
}

/** A gravity assist was successfully performed. */
export interface GravityAssistEvent {
  type: 'gravity_assist';
  ship: Ship;
  pilotName: string;
  pilotId: string;
  bodyName: string;
  fuelSaved: number;
  success: boolean;
}

/**
 * Discriminated union of all game events.
 *
 * Add new event interfaces above, then include them in this union.
 * The event bus emits synchronously within the current tick.
 */
export type GameEvent =
  | ShipDockedEvent
  | CrewHiredEvent
  | CrewDeathEvent
  | CrewDepartedEvent
  | CrewNearDeathEvent
  | CrewSkillMilestoneEvent
  | CrewRoleChangeEvent
  | EncounterResolvedEvent
  | ShipStrandedEvent
  | ShipRescuedEvent
  | ContractCompletedEvent
  | FirstVisitEvent
  | GravityAssistEvent;

// ── Event Bus ────────────────────────────────────────────────────

/**
 * Map from event type string to the concrete event interface.
 * Enables type-safe handlers: `on('ship_docked', (gd, e) => e.locationId)`.
 */
type EventMap = {
  [E in GameEvent as E['type']]: E;
};

type EventHandler<T extends GameEvent = GameEvent> = (
  gameData: GameData,
  event: T
) => void;

let _handlers: Record<string, EventHandler[]> = {};

/**
 * Subscribe to a specific event type.
 * The handler receives the narrowed event type automatically.
 * Returns an unsubscribe function (useful for tests).
 */
export function on<K extends keyof EventMap>(
  eventType: K,
  handler: EventHandler<EventMap[K]>
): () => void {
  if (!_handlers[eventType]) {
    _handlers[eventType] = [];
  }
  const list = _handlers[eventType];
  // Safe cast: handlers are always called with the matching event type via emit()
  list.push(handler as EventHandler);

  return () => {
    const idx = list.indexOf(handler as EventHandler);
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
