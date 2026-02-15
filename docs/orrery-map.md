# Orrery Map Architecture

The orrery map is an SVG-based solar system visualization used by both the Nav tab (single-ship) and Fleet Map tab (multi-ship). It has two modes: **Overview** (full solar system) and **Focus** (zoomed into a cluster like the Earth system). This document covers the coordinate systems, projection pipeline, and known pitfalls.

## Coordinate Systems

### Heliocentric (km)

All game positions are stored as heliocentric (Sun-centered) `{x, y}` in kilometers. This includes:

- `getLocationPosition(loc, gameTime, world)` in `src/orbitalMechanics.ts` — returns heliocentric km
- `FlightPlan.originPos` — heliocentric position of origin, **frozen at departure time**
- `FlightPlan.interceptPos` — heliocentric position of destination, **frozen at estimated arrival time**
- `FlightPlan.shipPos` — heliocentric position updated each tick via `lerpVec2(originPos, interceptPos, progress)`

### Local Frame (km, relative to cluster owner)

For intra-cluster operations (e.g., Earth-to-Gateway), positions must be converted to the **local frame** — relative to the cluster's parent body:

```
localPos = heliocentricPos - parentBodyHeliocentricPos(atRelevantTime)
```

The cluster owner is found via `findClusterOwner(loc, world)` in `src/flightPhysics.ts`, which walks up the `orbital.parentId` chain.

### SVG Coordinates

The map uses logarithmic scaling to compress the vast range of orbital distances into a viewable SVG space (30–180 SVG units from center).

- **Overview mode**: `projectToSvg(xKm, yKm)` — log-scales heliocentric distance from Sun
- **Focus mode**: `projectToSvgLocal(parentPos, satPos, logMin, logMax)` — subtracts parent position, log-scales the local distance

All projection functions are in `src/ui/mapProjection.ts`.

## Frozen Trajectory Model

Flight trajectories are **not** recomputed each tick. Instead:

1. At departure, `originPos` is frozen (origin's heliocentric position at departure time)
2. At departure, `interceptPos` is frozen (destination's heliocentric position at estimated arrival time)
3. Each tick, `shipPos = lerpVec2(originPos, interceptPos, progress)` in `gameTick.ts`

The intercept solver (`solveIntercept` in `orbitalMechanics.ts`) pre-computes where the destination will be when the ship arrives, so the ship flies toward the destination's future position.

### Frozen Trajectory Rendering in Focus Mode

`computeFrozenTrajectoryLocal()` in `mapProjection.ts` projects each frozen endpoint using the parent body's position **at the time that endpoint was frozen**:

- Origin is projected relative to `parentPos(departureTime)`
- Destination is projected relative to `parentPos(arrivalTime)`

This ensures endpoints appear at the correct local-frame angle even though the parent body has moved between departure and arrival.

## The Heliocentric Lerp Problem

**This is the single most important architectural pitfall in the orrery system.**

`shipPos = lerpVec2(originPos, interceptPos, progress)` interpolates between two heliocentric positions frozen at different times. For **inter-cluster** flights (e.g., Earth orbit to Mars orbit), this is fine — the ship traces a reasonable path through heliocentric space.

For **intra-cluster** flights (e.g., Earth to Gateway Station at 400 km LEO), this breaks:

- `originPos` = Earth's heliocentric position at departure (e.g., `(150,000,000, 0)` km)
- `interceptPos` = Gateway's heliocentric position at arrival (e.g., `(150,238,000, ...)` km, because Earth moved ~238,000 km along its solar orbit during the flight)
- The lerp traces the **chord of Earth's solar orbit**, not the 400 km local path

At 50% progress, `shipPos` sits near Earth's position at departure time — which by redirect time is ~120,000 km from Earth's current position. This stale position causes:

1. **Inflated redirect ETA**: The intercept solver sees a 120,000+ km distance instead of ~200 km
2. **Wrong trajectory origin on map**: The origin projects far beyond the cluster in focus mode

### The Fix (Two Parts)

**Part 1 — Local-frame interpolation in `redirectShipFlight()`** (`flightPhysics.ts`):

Instead of using the stale heliocentric `shipPos`, convert to local frame, interpolate there, then convert back:

```
originLocal = originPos - parentPos(departureTime)
interceptLocal = interceptPos - parentPos(arrivalTime)
shipLocal = lerp(originLocal, interceptLocal, progress)
correctShipPos = parentPos(currentTime) + shipLocal
```

**Part 2 — Solver origin co-movement** (`orbitalMechanics.ts`):

The intercept solver iterates to find arrival time. During iteration, it must co-move the origin with its parent body. Without this, a fixed heliocentric origin drifts as the solver iterates different arrival times, producing wildly wrong distances. The `originParent` option in `solveIntercept` enables this co-movement.

### When Does This Matter?

Any code that reads `FlightPlan.shipPos` for intra-cluster flights and uses it as a real position (not just for rendering the ship dot along the frozen trajectory). Currently this only affects `redirectShipFlight()`, but any future feature that needs the ship's "true" position mid-flight must apply the same local-frame correction.

Normal (non-redirect) flights don't hit this bug because `originPos` comes from the actual station position at departure, and the frozen trajectory + solver handle the rest correctly.

## Cluster Hierarchy

Locations form a tree via `orbital.parentId`:

```
Sun
├── Earth (orbits Sun)
│   ├── Gateway Station (orbits Earth)
│   └── Moon (orbits Earth)
├── Mars (orbits Sun)
│   └── Phobos Station (orbits Mars)
└── Jupiter (orbits Sun)
```

`findClusterOwner(loc, world)` walks up this tree to find the top-level body (e.g., Gateway → Earth, Phobos Station → Mars). This determines the parent body used for local-frame conversions.

## Ship Visualization

Ship dots, trajectories, and labels are rendered by `updateShipVisualization()` in `orreryUpdate.ts`, shared between Nav tab (single ship) and Fleet Map (multi-ship).

### Ship Dots

- **Size**: All ships use `r=1.5` (smaller than location dots)
- **Active ship stroke**: Yellow (`#ffc107`) during burn phases (accelerating/decelerating), white (`#fff`) during coast, width = `radius * 0.3`
- **Inactive ship stroke**: Ship color, width = `radius * 0.2`

### Ship Labels

- Only shown for the active ship (to reduce clutter in Fleet Map)
- Font size `4` (smaller than location labels which use `7`)

### Destination Ring

- Blue ring (`#4a9eff`) around the active ship's destination
- Radius = `locationDotRadius * 1.6` (proportional to location size, not a fixed offset)
- Shown in both Nav tab and Fleet Map
- Nav tab hides it when destination equals current location or selected location (to avoid redundant highlighting)

## Key Files

| File                                         | Responsibility                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/ui/orreryCore.ts`                       | SVG element creation, orrery visualization setup, shared refs                             |
| `src/ui/orreryUpdate.ts`                     | Ship visualization (dots, trajectories, labels), destination ring, gravity assist markers |
| `src/ui/orreryMap.ts`                        | Unified orrery map component used by both Nav and Fleet tabs                              |
| `src/ui/navigationView.ts`                   | Nav tab integration, single-ship orrery with selection overlay                            |
| `src/ui/fleetMapOrrery.ts`                   | Fleet Map tab integration, multi-ship orrery with legend                                  |
| `src/ui/mapProjection.ts`                    | Coordinate projection functions (heliocentric → SVG, local → SVG)                         |
| `src/orbitalMechanics.ts`                    | `getLocationPosition()`, `solveIntercept()`, orbital position computation                 |
| `src/flightPhysics.ts`                       | `initializeFlight()`, `redirectShipFlight()`, `findClusterOwner()`                        |
| `src/gameTick.ts`                            | `updateFlightPosition()` — per-tick `shipPos` lerp                                        |
| `src/__tests__/trajectoryProjection.test.ts` | Tests for trajectory projection and redirect correctness                                  |
