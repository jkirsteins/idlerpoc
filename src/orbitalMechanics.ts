import type { Vec2, OrbitalParams, WorldLocation, World } from './models';
import { GAME_SECONDS_PER_DAY } from './timeSystem';

/**
 * Orbital Mechanics Engine
 *
 * Bodies follow circular or elliptical orbits. Earth satellites orbit Earth
 * (hierarchical), everything else orbits the Sun. Positions are in km with
 * Sun at origin (0,0).
 *
 * Elliptical orbits use Kepler's equation solved via Newton-Raphson iteration.
 * For eccentricity < 0.1 (all game bodies), convergence is near-instant.
 *
 * Key functions:
 * - getOrbitalAngle(): true anomaly at a given gameTime
 * - getLocationPosition(): 2D position (recursive for hierarchical orbits)
 * - updateWorldPositions(): batch-update all locations each tick
 * - solveIntercept(): aim at a moving target for flight planning
 * - computeLaunchWindow(): find next optimal alignment
 */

const TWO_PI = 2 * Math.PI;

// ─── Kepler Equation Solver ───────────────────────────────────────

/**
 * Solve Kepler's equation M = E - e·sin(E) for eccentric anomaly E.
 * Uses Newton-Raphson iteration. For e < 0.1, converges in 2-3 iterations.
 */
function solveKepler(meanAnomaly: number, eccentricity: number): number {
  if (eccentricity === 0) return meanAnomaly;
  let E = meanAnomaly; // initial guess
  for (let i = 0; i < 6; i++) {
    const dE =
      (meanAnomaly - E + eccentricity * Math.sin(E)) /
      (1 - eccentricity * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Convert eccentric anomaly E to true anomaly θ.
 */
function eccentricToTrueAnomaly(E: number, eccentricity: number): number {
  if (eccentricity === 0) return E;
  return (
    2 *
    Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
    )
  );
}

// ─── Core Position Functions ──────────────────────────────────────

/**
 * Calculate true anomaly (radians) at a given gameTime.
 * For circular orbits (e=0), this equals the mean anomaly.
 * For elliptical orbits, solves Kepler's equation.
 */
export function getOrbitalAngle(
  orbital: OrbitalParams,
  gameTime: number
): number {
  if (orbital.orbitalPeriodSec <= 0) return orbital.initialAngleRad;
  const e = orbital.eccentricity ?? 0;

  // Mean anomaly advances linearly with time
  const meanAnomaly =
    orbital.initialAngleRad + (TWO_PI * gameTime) / orbital.orbitalPeriodSec;

  if (e === 0) {
    // Circular orbit — true anomaly equals mean anomaly
    return meanAnomaly % TWO_PI;
  }

  // Solve Kepler's equation for eccentric anomaly, then convert to true anomaly
  const M = meanAnomaly % TWO_PI;
  const E = solveKepler(M, e);
  return eccentricToTrueAnomaly(E, e);
}

/**
 * Compute the orbital radius at a given true anomaly for an elliptical orbit.
 * r = a(1 - e²) / (1 + e·cos(θ))
 * For circular orbits (e=0), r = a.
 */
function orbitalRadius(
  semiMajorAxis: number,
  eccentricity: number,
  trueAnomaly: number
): number {
  if (eccentricity === 0) return semiMajorAxis;
  return (
    (semiMajorAxis * (1 - eccentricity * eccentricity)) /
    (1 + eccentricity * Math.cos(trueAnomaly))
  );
}

/**
 * Get the 2D position (km from Sun) of a location at a given gameTime.
 * Recursive: if location orbits Earth, first computes Earth's position,
 * then adds the local orbital offset.
 *
 * For elliptical orbits, the radius varies with the true anomaly.
 */
export function getLocationPosition(
  location: WorldLocation,
  gameTime: number,
  world: World
): Vec2 {
  const orbital = location.orbital;
  if (!orbital) {
    // Legacy location without orbital params — return current x/y
    return { x: location.x, y: location.y };
  }

  const e = orbital.eccentricity ?? 0;
  const trueAnomaly = getOrbitalAngle(orbital, gameTime);
  const r = orbitalRadius(orbital.orbitalRadiusKm, e, trueAnomaly);
  const localX = r * Math.cos(trueAnomaly);
  const localY = r * Math.sin(trueAnomaly);

  if (orbital.parentId === null) {
    // Orbits the Sun directly
    return { x: localX, y: localY };
  }

  // Hierarchical orbit — add parent's position
  const parent = world.locations.find((l) => l.id === orbital.parentId);
  if (!parent) {
    // Parent not found — treat as Sun-orbiting
    return { x: localX, y: localY };
  }

  const parentPos = getLocationPosition(parent, gameTime, world);
  return {
    x: parentPos.x + localX,
    y: parentPos.y + localY,
  };
}

/** Euclidean distance between two 2D points. */
export function euclideanDistance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance between two locations at a specific gameTime. */
export function getDistanceBetweenAt(
  locA: WorldLocation,
  locB: WorldLocation,
  gameTime: number,
  world: World
): number {
  const posA = getLocationPosition(locA, gameTime, world);
  const posB = getLocationPosition(locB, gameTime, world);
  return euclideanDistance(posA, posB);
}

/**
 * Update all location positions and distanceFromEarth for the current tick.
 * Called once at the top of applyTick().
 */
export function updateWorldPositions(world: World, gameTime: number): void {
  const earth = world.locations.find((l) => l.id === 'earth');
  let earthPos: Vec2 = { x: 0, y: 0 };

  // First pass: compute Earth's position (needed for distanceFromEarth)
  if (earth?.orbital) {
    earthPos = getLocationPosition(earth, gameTime, world);
  }

  // Second pass: update all locations
  for (const loc of world.locations) {
    if (!loc.orbital) continue;

    const pos = getLocationPosition(loc, gameTime, world);
    loc.x = pos.x;
    loc.y = pos.y;

    // distanceFromEarth = Euclidean distance to Earth's current position
    if (loc.id === 'earth') {
      loc.distanceFromEarth = 0;
    } else {
      loc.distanceFromEarth = euclideanDistance(pos, earthPos);
    }
  }
}

// ─── Intercept Solver ─────────────────────────────────────────────

/**
 * Iteratively solve for the intercept position of a moving destination.
 *
 * Given origin position and estimated travel time, predicts where the
 * destination will be when the ship arrives, then recalculates travel
 * time to that new position, and repeats until convergence.
 *
 * When `origin` is provided, both origin and destination positions are
 * computed at the same future time each iteration. This correctly handles
 * co-moving bodies (e.g. Gateway Station orbiting Earth): their common
 * orbital motion cancels out, yielding the true relative distance instead
 * of a phantom distance caused by the parent body's solar orbit.
 *
 * @returns { interceptPos, originPosAtArrival, travelDistanceKm, arrivalGameTime }
 */
export function solveIntercept(
  originPos: Vec2,
  destination: WorldLocation,
  estimateTravelTime: (distanceKm: number) => number, // game-seconds
  gameTime: number,
  world: World,
  maxIterations: number = 10,
  origin?: WorldLocation
): {
  interceptPos: Vec2;
  originPosAtArrival: Vec2;
  travelDistanceKm: number;
  arrivalGameTime: number;
} {
  // Initial guess: both positions at current gameTime
  let interceptPos = getLocationPosition(destination, gameTime, world);
  let currentOriginPos = origin
    ? getLocationPosition(origin, gameTime, world)
    : originPos;
  let travelDistanceKm = euclideanDistance(currentOriginPos, interceptPos);
  let travelTimeSec = estimateTravelTime(travelDistanceKm);
  let arrivalGameTime = gameTime + travelTimeSec;

  for (let i = 0; i < maxIterations; i++) {
    const newInterceptPos = getLocationPosition(
      destination,
      arrivalGameTime,
      world
    );
    // Compute origin position at the same arrival time so that
    // co-orbiting bodies' shared motion cancels out.
    const newOriginPos = origin
      ? getLocationPosition(origin, arrivalGameTime, world)
      : originPos;
    const newDistance = euclideanDistance(newOriginPos, newInterceptPos);

    // Convergence check: distance changed by less than 0.1%
    if (
      Math.abs(newDistance - travelDistanceKm) / Math.max(travelDistanceKm, 1) <
      0.001
    ) {
      interceptPos = newInterceptPos;
      currentOriginPos = newOriginPos;
      travelDistanceKm = newDistance;
      break;
    }

    interceptPos = newInterceptPos;
    currentOriginPos = newOriginPos;
    travelDistanceKm = newDistance;
    travelTimeSec = estimateTravelTime(travelDistanceKm);
    arrivalGameTime = gameTime + travelTimeSec;
  }

  return {
    interceptPos,
    originPosAtArrival: currentOriginPos,
    travelDistanceKm,
    arrivalGameTime,
  };
}

// ─── Launch Windows ───────────────────────────────────────────────

export type AlignmentQuality = 'excellent' | 'good' | 'moderate' | 'poor';

export interface LaunchWindow {
  currentDistanceKm: number;
  minDistanceKm: number;
  maxDistanceKm: number;
  alignment: AlignmentQuality;
  nextOptimalGameTime: number; // gameTime of next distance minimum
  nextOptimalInDays: number; // game-days until next minimum
}

/**
 * Classify alignment quality based on where the current distance falls
 * within the [min, max] range.
 */
export function classifyAlignment(
  currentDistance: number,
  minDistance: number,
  maxDistance: number
): AlignmentQuality {
  const range = maxDistance - minDistance;
  if (range <= 0) return 'excellent'; // No variation (e.g. same orbit)

  const normalized = (currentDistance - minDistance) / range;
  if (normalized <= 0.2) return 'excellent';
  if (normalized <= 0.45) return 'good';
  if (normalized <= 0.7) return 'moderate';
  return 'poor';
}

/**
 * Compute launch window data for a pair of locations.
 *
 * Samples distances over a look-ahead period (default: 2x the longer
 * orbital period, capped at 10 game-years) to find min/max distances
 * and the next distance minimum.
 */
export function computeLaunchWindow(
  origin: WorldLocation,
  destination: WorldLocation,
  gameTime: number,
  world: World,
  lookAheadDays?: number
): LaunchWindow | null {
  const oA = origin.orbital;
  const oB = destination.orbital;
  if (!oA || !oB) return null;

  // Determine look-ahead: ~2x the synodic period
  const periodA = oA.orbitalPeriodSec;
  const periodB = oB.orbitalPeriodSec;
  const maxPeriod = Math.max(periodA, periodB);

  // Synodic period for two orbits: 1/|1/T1 - 1/T2|
  let synodicPeriodSec: number;
  if (periodA > 0 && periodB > 0 && periodA !== periodB) {
    synodicPeriodSec = 1 / Math.abs(1 / periodA - 1 / periodB);
  } else {
    synodicPeriodSec = maxPeriod;
  }

  const defaultLookAheadSec = Math.min(
    synodicPeriodSec * 2,
    GAME_SECONDS_PER_DAY * 365 * 10 // cap at 10 game-years
  );
  const lookAheadSec = lookAheadDays
    ? lookAheadDays * GAME_SECONDS_PER_DAY
    : defaultLookAheadSec;

  // Sample at intervals (~every game-day, minimum 100 samples)
  const numSamples = Math.max(
    100,
    Math.min(1000, Math.ceil(lookAheadSec / GAME_SECONDS_PER_DAY))
  );
  const stepSec = lookAheadSec / numSamples;

  const currentDistance = getDistanceBetweenAt(
    origin,
    destination,
    gameTime,
    world
  );
  let minDistance = currentDistance;
  let maxDistance = currentDistance;
  let nextMinTime = gameTime;
  let prevDist = currentDistance;
  let foundMinimum = false;

  for (let i = 1; i <= numSamples; i++) {
    const t = gameTime + i * stepSec;
    const dist = getDistanceBetweenAt(origin, destination, t, world);

    if (dist < minDistance) minDistance = dist;
    if (dist > maxDistance) maxDistance = dist;

    // Detect first local minimum (distance was decreasing, now increasing)
    if (!foundMinimum && dist > prevDist && prevDist < currentDistance * 0.95) {
      nextMinTime = gameTime + (i - 1) * stepSec;
      foundMinimum = true;
    }

    prevDist = dist;
  }

  // If no minimum found and current is already near the minimum, we're at optimal
  if (!foundMinimum) {
    nextMinTime = gameTime;
  }

  const nextOptimalInDays = Math.max(
    0,
    (nextMinTime - gameTime) / GAME_SECONDS_PER_DAY
  );

  return {
    currentDistanceKm: currentDistance,
    minDistanceKm: minDistance,
    maxDistanceKm: maxDistance,
    alignment: classifyAlignment(currentDistance, minDistance, maxDistance),
    nextOptimalGameTime: nextMinTime,
    nextOptimalInDays,
  };
}

/** Linear interpolation between two Vec2 points. */
export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}
