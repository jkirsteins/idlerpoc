# Command Queue System

## Overview

The Command Queue System provides hierarchical task distribution from the player down to individual workers. It enables emergent swarm behavior where strategic decisions cascade into tactical execution without micro-management.

## Core Principles

1. **Orders are persistent** — "Do this until cancelled"
2. **Queen assigns based on skill** — Highest-skilled workers get priority orders
3. **Workers carry physical cargo** — Not instant resource transfer
4. **Self-maintenance first** — Workers survive before following orders
5. **Visual aggregates only** — No individual worker tracking in UI

## Architecture

```
Player
  ↓ (sets directive)
Queen
  ↓ (generates orders)
Command Queue
  ↓ (workers pull orders)
Workers (execute)
```

## Directives

### v1: Simple Directives

**"Gather Biomass"**

- Queen generates `gather_biomass` orders
- Assigns to highest-foraging-skill available workers
- Workers: gather → fill cargo → return to queen → unload → repeat

**"Idle"**

- Queen generates `idle` orders
- Workers: self-maintain → wait
- Conserves energy, no gathering

### Future Directives

- **"Explore"** — Expand to new zones
- **"Combat"** — Clear predators
- **"Build"** — Construct structures
- **"Defend"** — Protect territory

## Order Types (Extensible)

```typescript
interface WorkerOrder {
  type:
    | 'gather_biomass'
    | 'idle'
    | 'explore_zone'
    | 'combat'
    | 'build_structure';
  targetZoneId?: string; // For location-specific orders
  targetStructureId?: string; // For construction orders
  priority: number; // Higher = more important
  issuedAt: number; // Game tick when issued
}
```

## Assignment Algorithm

### Frequency

Re-evaluate every 10 ticks or when:

- Player changes directive
- Workers die or hatch
- Order queue empties

### Process

```typescript
function assignOrders(queen: Queen, workers: Worker[]) {
  // 1. Get available workers
  const available = workers.filter(
    (w) => w.state === 'idle_empty' || w.state === 'idle_cargo_full'
  );

  // 2. Rank by relevant skill
  available.sort((a, b) => {
    if (queen.directive === 'gather_biomass') {
      return b.skills.foraging - a.skills.foraging;
    }
    // Future: sort by combat, building, etc.
    return 0;
  });

  // 3. Fill priority orders
  const ordersNeeded = queen.commandQueue.length;
  for (let i = 0; i < Math.min(available.length, ordersNeeded); i++) {
    available[i].order = queen.commandQueue[i];
    available[i].state = orderToState(queen.commandQueue[i]);
  }

  // 4. Remaining workers get idle
  for (let i = ordersNeeded; i < available.length; i++) {
    available[i].order = { type: 'idle', priority: 0, issuedAt: now };
    available[i].state = 'idle_empty';
  }
}
```

## Worker Decision Loop

Each tick, every worker executes:

```typescript
function workerTick(worker: Worker, queen: Queen) {
  // 1. Self-maintenance (highest priority)
  if (worker.cargo.current >= UPKEEP_COST) {
    worker.cargo.current -= UPKEEP_COST;
  } else {
    // Starvation - emergency gather or die
    worker.health -= STARVATION_DAMAGE;
    if (worker.health <= 0) {
      die(worker);
      return;
    }
  }

  // 2. Execute order
  if (!worker.order) {
    worker.state = 'idle_empty';
    return;
  }

  switch (worker.order.type) {
    case 'gather_biomass':
      executeGatherOrder(worker, queen);
      break;
    case 'idle':
      // Already handled self-maintenance
      worker.state = 'idle_empty';
      break;
    // Future: explore, combat, build
  }
}

function executeGatherOrder(worker: Worker, queen: Queen) {
  // If cargo not full: gather
  if (worker.cargo.current < worker.cargo.max) {
    const gathered = calculateGatherRate(worker);
    worker.cargo.current = Math.min(
      worker.cargo.current + gathered,
      worker.cargo.max
    );

    // Gain skill XP
    gainForagingXP(worker, gathered);

    worker.state = 'gathering';
    return;
  }

  // Cargo full: try to unload to queen
  if (queen.canAcceptBiomass()) {
    queen.receiveBiomass(worker.cargo.current);
    worker.cargo.current = 0;
    worker.state = 'gathering'; // Go gather more
  } else {
    // Queen full - idle with cargo
    worker.state = 'idle_cargo_full';
  }
}
```

## Cargo System

### Principles

- Workers carry physical biomass (not abstract resources)
- Must physically transport to queen
- Creates throughput bottleneck
- Adds spatial element (future: positioning matters)

### Capacity

```typescript
interface WorkerCargo {
  current: number; // 0-10
  max: number; // 10 (base)
}
```

### Flow

```
Zone (biomass source)
  ↓
Worker gathers (fills cargo)
  ↓
Worker returns to queen
  ↓
Worker unloads (if queen has space)
  ↓
Queen converts to energy
  ↓
Queen lays eggs (consumes energy)
  ↓
New workers hatch
```

## Multi-Queen (Future)

Each queen maintains:

- Separate command queue
- Separate worker pool
- Separate position/location

Workers "belong" to specific queen (queenId field).

Queens coordinate via:

- Pheromone signals (same planet)
- System brain (different planets)

No cross-queen worker sharing.

## Spatial System (Future)

Worker movement within zones:

```typescript
interface WorkerPosition {
  x: number; // 0-100 (zone coordinates)
  y: number;
  targetX?: number; // Where moving
  targetY?: number;
  moving: boolean;
}
```

**Gather Cycle**:

1. Pick random target point in zone
2. Move to target (speed based on...?)
3. Spend time gathering (fills cargo)
4. Move back to queen position
5. Unload if possible

**Visual**: Zone-level orrery shows worker dots moving.

## Performance Considerations

### Aggregation

- UI shows aggregates only ("12 gathering, 5 idle")
- Individual worker state stored but not rendered per-tick
- Bulk updates every N ticks

### Tick Optimization

- Workers processed in batches
- Skip idle workers (minimal processing)
- Spatial indexing (future) for zone queries

## Error Handling

### Worker Death

- Remove from assignments
- Recycle biomass
- Queen regenerates orders

### Queen Death

- Workers lose coordination (feral state)
- Efficiency drops to near-zero
- Must establish new queen or lose swarm

### Order Stuck

- Worker cargo full, queen full for extended period
- Auto-cancel order after timeout?
- Or worker starves (player problem to solve)

## UI Integration

### Swarm Tab

```
Worker Distribution:
• Self-maintenance: 5
• Gathering: 12
• Idle (empty): 4
• Idle (cargo full): 3  ← Problem indicator
```

### Problem Indicators

- **Idle (cargo full)**: Queen at capacity — expand storage or enable egg production
- **Low efficiency**: Over neural capacity — let workers die or expand capacity
- **High starvation**: Energy deficit — check gathering rate vs. consumption

## Future Extensions

### Priority System

```typescript
interface WorkerOrder {
  type: OrderType;
  priority: 1-10;  // Higher = more important
  deadline?: number;  // Must complete by tick
}
```

### Squad System

- Group workers into squads (4-8 workers)
- Squad shares orders
- Squad leader bonus

### Autonomous Behaviors

- Workers auto-switch to "emergency gather" if starving
- Workers auto-explore adjacent zones if main zone saturated
- Workers auto-assist combat if threatened

## Summary

The Command Queue System enables:

- **Strategic depth** without micro-management
- **Biological plausibility** via cargo/movement constraints
- **Emergent behavior** from simple rules
- **Extensibility** for future features
- **Performance** via aggregation and batching

The swarm is not controlled. It is guided.
