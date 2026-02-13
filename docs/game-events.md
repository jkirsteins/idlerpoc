# Game Event Bus

Lightweight publish/subscribe system for cross-cutting side effects that must fire on state transitions.

## Why events?

Ship state transitions (docked → in_flight → docked) can happen mid-tick during synchronous call chains. For example, `completeLeg()` may dock a ship, restart a route, and launch back to flight — all within a single tick. Systems that **poll** `ship.location.status` during tick processing will miss these transient transitions.

The event bus solves this by emitting events at the point of transition. Subscribers fire synchronously within the same call stack, guaranteeing they run before any subsequent state change.

## Architecture

```
src/gameEvents.ts          ← event bus (zero game-system imports)
src/contractExec.ts        ← emits ship_docked from dockShipAtLocation()
src/provisionsSystem.ts    ← subscribes to ship_docked for auto-resupply
src/main.ts                ← calls init*Events() at startup
```

### Module constraints

- **`gameEvents.ts`** imports only types from `models/index.ts`. No game system imports — this prevents circular dependencies.
- **Emitters** import `emit` from `gameEvents.ts` and call it from canonical transition functions.
- **Subscribers** import `on` from `gameEvents.ts` and register handlers in `init*Events()` functions.
- **`main.ts`** calls all `init*Events()` functions during `init()`.

## API

```typescript
import { on, emit, clearAllListeners } from './gameEvents';

// Subscribe — returns an unsubscribe function
const unsub = on('ship_docked', (gameData, event) => {
  // event.ship, event.locationId
});

// Emit — synchronous, all handlers run before emit() returns
emit(gameData, { type: 'ship_docked', ship, locationId });

// Test cleanup
clearAllListeners();
```

## Events

### `ship_docked`

Fired by `dockShipAtLocation()` whenever a ship transitions to the docked state.

| Field        | Type     | Description                     |
| ------------ | -------- | ------------------------------- |
| `ship`       | `Ship`   | The ship that just docked       |
| `locationId` | `string` | ID of the location it docked at |

**Current subscribers:**

- `provisionsSystem.ts` — auto-resupply provisions at trade stations

## Adding a new event

1. Define a new interface in `gameEvents.ts` (e.g. `ShipDepartedEvent`)
2. Add it to the `GameEvent` discriminated union
3. Emit from the canonical transition function
4. Subscribe in the relevant system's `init*Events()` function
5. Call `init*Events()` from `main.ts::init()` if it's a new system

## Adding a new subscriber

1. Import `on` from `./gameEvents` in the subscribing system
2. Export an `init*Events()` function that calls `on(eventType, handler)`
3. Ensure the handler is **idempotent** — it may fire multiple times for the same logical event (e.g. a ship that docks, fails to depart, then docks again at the same location)
4. Call `init*Events()` from `main.ts::init()`

## Design principles

- **Handlers must be idempotent.** The same event may fire multiple times.
- **Synchronous dispatch.** Handlers run in registration order within `emit()`. No async, no queuing.
- **Status polling for ongoing effects only.** Use tick-based status checks for continuous effects (e.g. provisions consumption while in flight). Use events for one-time transition effects (e.g. provisions resupply on docking).
- **Canonical functions are the single source of truth.** Never set `ship.location.status = 'docked'` directly — always call `dockShipAtLocation()`. This ensures the event fires.
