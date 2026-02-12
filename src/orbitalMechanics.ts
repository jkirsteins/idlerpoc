import type { Vec2, OrbitalParams, WorldLocation, World } from './models';
import { GAME_SECONDS_PER_DAY } from './timeSystem';

/**
 * Orbital Mechanics Engine
 *
 * All bodies follow circular orbits. Earth satellites orbit Earth (hierarchical),
 * everything else orbits the Sun. Positions are in km with Sun at origin (0,0).
 *
 * Key functions:
 * - getOrbitalAngle(): angle at a given gameTime
 * - getLocationPosition(): 2D position (recursive for hierarchical orbits)
 * - updateWorldPositions(): batch-update all locations each tick
 * - solveIntercept(): aim at a moving target for flight planning
 * - computeLaunchWindow(): find next optimal alignment
 */

const TWO_PI = 2 * Math.PI;

// ─── Core Position Functions ──────────────────────────────────────

/** Calculate orbital angle (radians) at a given gameTime. */
export function getOrbitalAngle(
  orbital: OrbitalParams,
  gameTime: number
): number {
  if (orbital.orbitalPeriodSec <= 0) return orbital.initialAngleRad;
  const angle =
    orbital.initialAngleRad + (TWO_PI * gameTime) / orbital.orbitalPeriodSec;
  // Normalise to [0, 2π) for consistency
  return angle % TWO_PI;
}

/**
 * Get the 2D position (km from Sun) of a location at a given gameTime.
 * Recursive: if location orbits Earth, first computes Earth's position,
 * then adds the local orbital offset.
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

  const angle = getOrbitalAngle(orbital, gameTime);
  const localX = orbital.orbitalRadiusKm * Math.cos(angle);
  const localY = orbital.orbitalRadiusKm * Math.sin(angle);

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
 * @returns { interceptPos, travelDistanceKm, arrivalGameTime }
 */
export function solveIntercept(
  originPos: Vec2,
  destination: WorldLocation,
  estimateTravelTime: (distanceKm: number) => number, // game-seconds
  gameTime: number,
  world: World,
  maxIterations: number = 10
): {
  interceptPos: Vec2;
  travelDistanceKm: number;
  arrivalGameTime: number;
} {
  // Initial guess: destination's current position
  let interceptPos = getLocationPosition(destination, gameTime, world);
  let travelDistanceKm = euclideanDistance(originPos, interceptPos);
  let travelTimeSec = estimateTravelTime(travelDistanceKm);
  let arrivalGameTime = gameTime + travelTimeSec;

  for (let i = 0; i < maxIterations; i++) {
    const newInterceptPos = getLocationPosition(
      destination,
      arrivalGameTime,
      world
    );
    const newDistance = euclideanDistance(originPos, newInterceptPos);

    // Convergence check: distance changed by less than 0.1%
    if (
      Math.abs(newDistance - travelDistanceKm) / Math.max(travelDistanceKm, 1) <
      0.001
    ) {
      interceptPos = newInterceptPos;
      travelDistanceKm = newDistance;
      break;
    }

    interceptPos = newInterceptPos;
    travelDistanceKm = newDistance;
    travelTimeSec = estimateTravelTime(travelDistanceKm);
    arrivalGameTime = gameTime + travelTimeSec;
  }

  return { interceptPos, travelDistanceKm, arrivalGameTime };
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
