import { describe, it, expect } from 'vitest';
import {
  getOrbitalAngle,
  getLocationPosition,
  euclideanDistance,
  updateWorldPositions,
  solveIntercept,
  computeLaunchWindow,
  classifyAlignment,
  lerpVec2,
} from '../orbitalMechanics';
import { GAME_SECONDS_PER_DAY } from '../timeSystem';
import { createTestWorld } from './testHelpers';
import type { OrbitalParams, Vec2 } from '../models';

describe('getOrbitalAngle', () => {
  const orbital: OrbitalParams = {
    parentId: null,
    orbitalRadiusKm: 149_597_870,
    orbitalPeriodSec: 365.25 * GAME_SECONDS_PER_DAY,
    initialAngleRad: 0,
  };

  it('returns initialAngleRad at gameTime=0', () => {
    expect(getOrbitalAngle(orbital, 0)).toBe(0);
  });

  it('returns π at half-period', () => {
    const halfPeriod = orbital.orbitalPeriodSec / 2;
    expect(getOrbitalAngle(orbital, halfPeriod)).toBeCloseTo(Math.PI, 5);
  });

  it('returns ~0 after full period (wraps around)', () => {
    const angle = getOrbitalAngle(orbital, orbital.orbitalPeriodSec);
    // Should be 2π mod 2π ≈ 0 (or very close)
    expect(angle % (2 * Math.PI)).toBeCloseTo(0, 5);
  });

  it('respects initialAngleRad offset', () => {
    const offset: OrbitalParams = { ...orbital, initialAngleRad: Math.PI / 4 };
    expect(getOrbitalAngle(offset, 0)).toBeCloseTo(Math.PI / 4, 5);
  });

  it('returns initialAngleRad when period is 0', () => {
    const zero: OrbitalParams = {
      ...orbital,
      orbitalPeriodSec: 0,
      initialAngleRad: 1.5,
    };
    expect(getOrbitalAngle(zero, 999_999)).toBe(1.5);
  });
});

describe('getLocationPosition', () => {
  it('places Sun-orbiting body on x-axis at angle 0', () => {
    const world = createTestWorld();
    const earth = world.locations.find((l) => l.id === 'earth')!;
    const pos = getLocationPosition(earth, 0, world);
    expect(pos.x).toBeCloseTo(earth.orbital!.orbitalRadiusKm, 0);
    expect(pos.y).toBeCloseTo(0, 0);
  });

  it('places Earth satellite relative to Earth', () => {
    const world = createTestWorld();
    const earth = world.locations.find((l) => l.id === 'earth')!;
    const leo = world.locations.find((l) => l.id === 'leo_station')!;
    const earthPos = getLocationPosition(earth, 0, world);
    const leoPos = getLocationPosition(leo, 0, world);
    // LEO orbits Earth at 400 km — should be within 400 km of Earth
    const dist = euclideanDistance(earthPos, leoPos);
    expect(dist).toBeCloseTo(400, 0);
  });

  it('moves position at half-period to opposite side of orbit', () => {
    const world = createTestWorld();
    const mars = world.locations.find((l) => l.id === 'mars')!;
    const pos0 = getLocationPosition(mars, 0, world);
    const posHalf = getLocationPosition(
      mars,
      mars.orbital!.orbitalPeriodSec / 2,
      world
    );
    // At half period, should be on opposite side (roughly 2× orbital radius apart)
    const dist = euclideanDistance(pos0, posHalf);
    expect(dist).toBeCloseTo(mars.orbital!.orbitalRadiusKm * 2, -3);
  });
});

describe('euclideanDistance', () => {
  it('returns 0 for same point', () => {
    expect(euclideanDistance({ x: 5, y: 3 }, { x: 5, y: 3 })).toBe(0);
  });

  it('computes distance correctly', () => {
    expect(euclideanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('updateWorldPositions', () => {
  it('sets x/y for all locations with orbital params', () => {
    const world = createTestWorld();
    updateWorldPositions(world, 0);
    for (const loc of world.locations) {
      if (loc.orbital) {
        expect(typeof loc.x).toBe('number');
        expect(typeof loc.y).toBe('number');
        // At least one coordinate should be nonzero (body isn't at origin)
        expect(Math.abs(loc.x) + Math.abs(loc.y)).toBeGreaterThan(0);
      }
    }
  });

  it('sets distanceFromEarth=0 for Earth', () => {
    const world = createTestWorld();
    updateWorldPositions(world, 0);
    const earth = world.locations.find((l) => l.id === 'earth')!;
    expect(earth.distanceFromEarth).toBe(0);
  });

  it('computes reasonable distanceFromEarth for Mars', () => {
    const world = createTestWorld();
    // With all angles=0, Mars is aligned with Earth — minimum distance
    updateWorldPositions(world, 0);
    const mars = world.locations.find((l) => l.id === 'mars')!;
    // Mars at 227.9M km, Earth at 149.6M km → distance ~78M km (same side)
    expect(mars.distanceFromEarth).toBeGreaterThan(50_000_000);
    expect(mars.distanceFromEarth).toBeLessThan(500_000_000);
  });

  it('updates positions over time (Earth-Mars distance varies)', () => {
    const world = createTestWorld();
    updateWorldPositions(world, 0);
    const mars0 = world.locations.find(
      (l) => l.id === 'mars'
    )!.distanceFromEarth;

    // Advance roughly half an Earth year — Earth has moved but Mars hasn't moved much
    updateWorldPositions(world, 182 * GAME_SECONDS_PER_DAY);
    const marsHalf = world.locations.find(
      (l) => l.id === 'mars'
    )!.distanceFromEarth;

    // Distance should have changed meaningfully
    expect(Math.abs(marsHalf - mars0)).toBeGreaterThan(10_000_000);
  });
});

describe('Earth-Mars distance range', () => {
  it('varies between ~55M km and ~400M km over a synodic period', () => {
    const world = createTestWorld();
    // Sample every 10 game-days over 2+ years
    const samples = 800;
    let minDist = Infinity;
    let maxDist = 0;
    for (let i = 0; i < samples; i++) {
      const t = i * 10 * GAME_SECONDS_PER_DAY;
      updateWorldPositions(world, t);
      const mars = world.locations.find((l) => l.id === 'mars')!;
      if (mars.distanceFromEarth < minDist) minDist = mars.distanceFromEarth;
      if (mars.distanceFromEarth > maxDist) maxDist = mars.distanceFromEarth;
    }
    // Minimum ~78M km (both at angle 0, diff = 227.9M - 149.6M)
    // Maximum ~377M km (opposition)
    expect(minDist).toBeGreaterThan(50_000_000);
    expect(minDist).toBeLessThan(120_000_000);
    expect(maxDist).toBeGreaterThan(250_000_000);
    expect(maxDist).toBeLessThan(500_000_000);
  });
});

describe('solveIntercept', () => {
  it('converges for near-Earth destination (slow orbit)', () => {
    const world = createTestWorld();
    updateWorldPositions(world, 0);
    const earth = world.locations.find((l) => l.id === 'earth')!;
    // Use Forge Station (18.5 day period) — slow enough that intercept converges
    const forge = world.locations.find((l) => l.id === 'forge_station')!;
    const originPos: Vec2 = { x: earth.x, y: earth.y };

    const result = solveIntercept(
      originPos,
      forge,
      // Very fast travel estimate so destination barely moves
      (distKm) => distKm * 0.001,
      0,
      world
    );

    expect(result.travelDistanceKm).toBeGreaterThan(0);
    expect(result.travelDistanceKm).toBeLessThan(500_000); // ~326,000 km
    expect(result.arrivalGameTime).toBeGreaterThan(0);
  });

  it('converges for interplanetary destination', () => {
    const world = createTestWorld();
    updateWorldPositions(world, 0);
    const earth = world.locations.find((l) => l.id === 'earth')!;
    const mars = world.locations.find((l) => l.id === 'mars')!;
    const originPos: Vec2 = { x: earth.x, y: earth.y };

    const result = solveIntercept(
      originPos,
      mars,
      // Simulate ~30 day travel for interplanetary
      (distKm) => (distKm / 78_000_000) * 30 * GAME_SECONDS_PER_DAY,
      0,
      world
    );

    expect(result.travelDistanceKm).toBeGreaterThan(50_000_000);
    expect(result.arrivalGameTime).toBeGreaterThan(0);
  });
});

describe('computeLaunchWindow', () => {
  it('returns null for locations without orbital params', () => {
    const world = createTestWorld();
    const loc = world.locations.find((l) => l.id === 'earth')!;
    const fakeLoc = { ...loc, orbital: undefined };
    const result = computeLaunchWindow(fakeLoc, loc, 0, world);
    expect(result).toBeNull();
  });

  it('finds launch window between Earth and Mars', () => {
    const world = createTestWorld();
    const earth = world.locations.find((l) => l.id === 'earth')!;
    const mars = world.locations.find((l) => l.id === 'mars')!;

    const window = computeLaunchWindow(earth, mars, 0, world);
    expect(window).not.toBeNull();
    expect(window!.currentDistanceKm).toBeGreaterThan(0);
    expect(window!.minDistanceKm).toBeLessThanOrEqual(
      window!.currentDistanceKm
    );
    expect(window!.maxDistanceKm).toBeGreaterThanOrEqual(
      window!.currentDistanceKm
    );
    expect(window!.alignment).toBeDefined();
  });

  it('reports excellent alignment at close approach', () => {
    const world = createTestWorld();
    const earth = world.locations.find((l) => l.id === 'earth')!;
    const mars = world.locations.find((l) => l.id === 'mars')!;

    // At gameTime=0 with all angles=0, both are on same side of Sun
    // This is near minimum distance (excellent alignment)
    const window = computeLaunchWindow(earth, mars, 0, world);
    expect(window).not.toBeNull();
    expect(window!.alignment).toBe('excellent');
  });
});

describe('classifyAlignment', () => {
  it('returns excellent when at minimum distance', () => {
    expect(classifyAlignment(100, 100, 400)).toBe('excellent');
  });

  it('returns good in lower-middle range', () => {
    expect(classifyAlignment(200, 100, 400)).toBe('good');
  });

  it('returns moderate in upper-middle range', () => {
    expect(classifyAlignment(280, 100, 400)).toBe('moderate');
  });

  it('returns poor near maximum distance', () => {
    expect(classifyAlignment(380, 100, 400)).toBe('poor');
  });

  it('returns excellent when no variation', () => {
    expect(classifyAlignment(100, 100, 100)).toBe('excellent');
  });
});

describe('lerpVec2', () => {
  const a: Vec2 = { x: 0, y: 0 };
  const b: Vec2 = { x: 10, y: 20 };

  it('returns a at t=0', () => {
    const result = lerpVec2(a, b, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('returns b at t=1', () => {
    const result = lerpVec2(a, b, 1);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });

  it('returns midpoint at t=0.5', () => {
    const result = lerpVec2(a, b, 0.5);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });
});
