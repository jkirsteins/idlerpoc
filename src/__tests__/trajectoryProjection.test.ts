import { describe, it, expect } from 'vitest';
import {
  computeFrozenTrajectoryLocal,
  projectToSvgLocal,
  localOrbitalRadiusToSvg,
} from '../ui/mapProjection';
import { getLocationPosition, lerpVec2 } from '../orbitalMechanics';
import { initializeFlight, redirectShipFlight } from '../flightPhysics';
import { createTestWorld, createTestShip } from './testHelpers';
import type { Vec2 } from '../models';

describe('trajectoryProjection', () => {
  describe('computeFrozenTrajectoryLocal - deterministic behavior', () => {
    it('trajectory endpoints are fixed across multiple ticks', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;

      expect(earth).toBeDefined();
      expect(gateway).toBeDefined();

      // Define frozen positions at some arbitrary arrival time
      const arrivalGameTime = 100_000;
      const earthPosAtArrival = getLocationPosition(
        earth,
        arrivalGameTime,
        world
      );
      const gatewayPosAtArrival = getLocationPosition(
        gateway,
        arrivalGameTime,
        world
      );

      // Log scale parameters for Earth's satellites
      const logMin = Math.log10(400); // LEO at 400 km
      const logMax = Math.log10(400_000); // ~Moon distance

      // Call computeFrozenTrajectoryLocal multiple times with DIFFERENT current game times
      // but the SAME frozen positions and arrival time
      const result1 = computeFrozenTrajectoryLocal(
        earthPosAtArrival,
        gatewayPosAtArrival,
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      const result2 = computeFrozenTrajectoryLocal(
        earthPosAtArrival,
        gatewayPosAtArrival,
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      // Results should be identical (deterministic given same inputs)
      expect(result1.originSvg.x).toBeCloseTo(result2.originSvg.x, 10);
      expect(result1.originSvg.y).toBeCloseTo(result2.originSvg.y, 10);
      expect(result1.destSvg.x).toBeCloseTo(result2.destSvg.x, 10);
      expect(result1.destSvg.y).toBeCloseTo(result2.destSvg.y, 10);
    });

    it('gateway station orbits while trajectory stays fixed', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;

      expect(earth).toBeDefined();
      expect(gateway).toBeDefined();
      expect(gateway.orbital).toBeDefined();

      const orbitalPeriod = gateway.orbital!.orbitalPeriodSec;

      // Gateway's live position at two different times (half period apart)
      const livePos1 = getLocationPosition(gateway, 0, world);
      const livePos2 = getLocationPosition(gateway, orbitalPeriod / 2, world);

      // Verify Gateway has moved significantly (opposite sides of Earth)
      const dx = livePos2.x - livePos1.x;
      const dy = livePos2.y - livePos1.y;
      const movementDistance = Math.sqrt(dx * dx + dy * dy);

      // Should be roughly 2× orbital radius (diameter)
      expect(movementDistance).toBeGreaterThan(
        gateway.orbital!.orbitalRadiusKm * 1.8
      );

      // Now use FROZEN positions (both at the same arrival time)
      const arrivalGameTime = 50_000;
      const frozenOriginPos = getLocationPosition(
        earth,
        arrivalGameTime,
        world
      );
      const frozenInterceptPos = getLocationPosition(
        gateway,
        arrivalGameTime,
        world
      );

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      // Call with the same frozen positions at different "current" times
      // (the function doesn't use current time, only arrival time)
      const trajectory1 = computeFrozenTrajectoryLocal(
        frozenOriginPos,
        frozenInterceptPos,
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      const trajectory2 = computeFrozenTrajectoryLocal(
        frozenOriginPos,
        frozenInterceptPos,
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      // Trajectories should be identical despite Gateway's real orbit moving
      expect(trajectory1.originSvg.x).toBeCloseTo(trajectory2.originSvg.x, 10);
      expect(trajectory1.originSvg.y).toBeCloseTo(trajectory2.originSvg.y, 10);
      expect(trajectory1.destSvg.x).toBeCloseTo(trajectory2.destSvg.x, 10);
      expect(trajectory1.destSvg.y).toBeCloseTo(trajectory2.destSvg.y, 10);
    });
  });

  describe('computeFrozenTrajectoryLocal - Earth-centric coordinates', () => {
    it('one end of trajectory is at Earth (0,0 in local SVG)', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;

      expect(earth).toBeDefined();
      expect(gateway).toBeDefined();

      const arrivalGameTime = 75_000;
      const earthPos = getLocationPosition(earth, arrivalGameTime, world);
      const gatewayPos = getLocationPosition(gateway, arrivalGameTime, world);

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      // For an Earth→Gateway flight, origin is Earth's position
      const trajectory = computeFrozenTrajectoryLocal(
        earthPos, // origin at Earth
        gatewayPos, // intercept at Gateway
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      // Origin should be at (0, 0) since it's Earth relative to Earth
      expect(trajectory.originSvg.x).toBeCloseTo(0, 1);
      expect(trajectory.originSvg.y).toBeCloseTo(0, 1);

      // Destination should be non-zero (Gateway is at ~400 km from Earth)
      const destDistance = Math.sqrt(
        trajectory.destSvg.x * trajectory.destSvg.x +
          trajectory.destSvg.y * trajectory.destSvg.y
      );
      expect(destDistance).toBeGreaterThan(10); // Should be visible on SVG
    });

    it('distance from Earth to trajectory far end matches Gateway orbital radius', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;

      expect(earth).toBeDefined();
      expect(gateway).toBeDefined();
      expect(gateway.orbital).toBeDefined();

      const gatewayOrbitalRadiusKm = gateway.orbital!.orbitalRadiusKm;
      const arrivalGameTime = 75_000;
      const earthPos = getLocationPosition(earth, arrivalGameTime, world);
      const gatewayPos = getLocationPosition(gateway, arrivalGameTime, world);

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      // Compute frozen trajectory
      const trajectory = computeFrozenTrajectoryLocal(
        earthPos,
        gatewayPos,
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      // Calculate expected SVG radius for Gateway's orbital radius
      const expectedSvgRadius = localOrbitalRadiusToSvg(
        gatewayOrbitalRadiusKm,
        logMin,
        logMax
      );

      // Calculate actual SVG distance from origin (0,0) to destination
      const actualSvgDistance = Math.sqrt(
        trajectory.destSvg.x * trajectory.destSvg.x +
          trajectory.destSvg.y * trajectory.destSvg.y
      );

      // They should match (within floating point tolerance)
      expect(actualSvgDistance).toBeCloseTo(expectedSvgRadius, 1);
    });
  });

  describe('projectToSvgLocal - reference frame consistency', () => {
    it('projects satellite at same position as parent to (0,0)', () => {
      const parentPos: Vec2 = { x: 150_000_000, y: 50_000_000 }; // Some Sun position
      const satPos: Vec2 = { x: 150_000_000, y: 50_000_000 }; // Same as parent

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      const result = projectToSvgLocal(parentPos, satPos, logMin, logMax);

      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('preserves angle from parent body', () => {
      const parentPos: Vec2 = { x: 100_000, y: 200_000 };

      // Satellite at 45 degrees (northeast) from parent at 1000 km distance
      const satPos: Vec2 = {
        x: parentPos.x + 707.1, // 1000 * cos(45°) ≈ 707.1
        y: parentPos.y + 707.1, // 1000 * sin(45°) ≈ 707.1
      };

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      const result = projectToSvgLocal(parentPos, satPos, logMin, logMax);

      // Calculate angle of result
      const angle = Math.atan2(result.y, result.x);

      // Should be 45 degrees (π/4 radians)
      expect(angle).toBeCloseTo(Math.PI / 4, 5);
    });

    it('log-scales distance consistently', () => {
      const parentPos: Vec2 = { x: 0, y: 0 };
      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      // Three satellites at different distances
      const sat1Pos: Vec2 = { x: 400, y: 0 }; // Min distance
      const sat2Pos: Vec2 = { x: 4_000, y: 0 }; // Mid distance (log-middle)
      const sat3Pos: Vec2 = { x: 400_000, y: 0 }; // Max distance

      const svg1 = projectToSvgLocal(parentPos, sat1Pos, logMin, logMax);
      const svg2 = projectToSvgLocal(parentPos, sat2Pos, logMin, logMax);
      const svg3 = projectToSvgLocal(parentPos, sat3Pos, logMin, logMax);

      // All should be on positive x-axis (y ≈ 0)
      expect(svg1.y).toBeCloseTo(0, 5);
      expect(svg2.y).toBeCloseTo(0, 5);
      expect(svg3.y).toBeCloseTo(0, 5);

      // SVG distances should follow log scale
      const dist1 = svg1.x; // Should be ~30 (minimum)
      const dist2 = svg2.x; // Should be middle
      const dist3 = svg3.x; // Should be ~180 (maximum)

      expect(dist1).toBeCloseTo(30, 0);
      expect(dist3).toBeCloseTo(180, 0);
      expect(dist2).toBeGreaterThan(dist1);
      expect(dist2).toBeLessThan(dist3);
    });
  });

  describe('localOrbitalRadiusToSvg - scale validation', () => {
    it('maps minimum radius to 30 SVG units', () => {
      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      const result = localOrbitalRadiusToSvg(400, logMin, logMax);
      expect(result).toBeCloseTo(30, 1);
    });

    it('maps maximum radius to 180 SVG units', () => {
      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      const result = localOrbitalRadiusToSvg(400_000, logMin, logMax);
      expect(result).toBeCloseTo(180, 1);
    });

    it('handles degenerate case where all satellites at same radius', () => {
      const radius = 1000;
      const logMin = Math.log10(radius);
      const logMax = Math.log10(radius); // Same as logMin

      const result = localOrbitalRadiusToSvg(radius, logMin, logMax);

      // Should return middle value (105) for degenerate case
      expect(result).toBe(105);
    });

    it('maps mid-range radius to middle SVG units', () => {
      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      // Geometric mean of min and max: sqrt(400 * 400,000) = 12,649 km
      const midRadius = Math.sqrt(400 * 400_000);

      const result = localOrbitalRadiusToSvg(midRadius, logMin, logMax);

      // Should be roughly in the middle of 30..180 range (105)
      expect(result).toBeCloseTo(105, 5);
    });
  });

  describe('computeFrozenTrajectoryLocal - real world scenario', () => {
    it('Earth to Gateway Station trajectory is stable', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;

      expect(earth).toBeDefined();
      expect(gateway).toBeDefined();

      // Simulate a flight plan's frozen positions
      const arrivalGameTime = 200_000;
      const originPos = getLocationPosition(earth, arrivalGameTime, world);
      const interceptPos = getLocationPosition(gateway, arrivalGameTime, world);

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      const trajectory = computeFrozenTrajectoryLocal(
        originPos,
        interceptPos,
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      // Origin at Earth → should be near (0,0)
      expect(Math.abs(trajectory.originSvg.x)).toBeLessThan(5);
      expect(Math.abs(trajectory.originSvg.y)).toBeLessThan(5);

      // Destination at Gateway → should be at ~400 km orbit radius in SVG
      const destDist = Math.sqrt(
        trajectory.destSvg.x ** 2 + trajectory.destSvg.y ** 2
      );

      // Gateway is at minimum radius in our scale, so should be ~30 SVG units
      expect(destDist).toBeCloseTo(30, 5);
    });

    it('Earth to GEO Depot trajectory shows larger separation', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const geo = world.locations.find((l) => l.id === 'geo_depot')!;

      expect(earth).toBeDefined();
      expect(geo).toBeDefined();
      expect(geo.orbital).toBeDefined();

      const arrivalGameTime = 200_000;
      const originPos = getLocationPosition(earth, arrivalGameTime, world);
      const interceptPos = getLocationPosition(geo, arrivalGameTime, world);

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      const trajectory = computeFrozenTrajectoryLocal(
        originPos,
        interceptPos,
        arrivalGameTime,
        { parentLoc: earth, world, logMin, logMax }
      );

      // Origin at Earth → near (0,0)
      expect(Math.abs(trajectory.originSvg.x)).toBeLessThan(5);
      expect(Math.abs(trajectory.originSvg.y)).toBeLessThan(5);

      // GEO is much farther than Gateway (35,786 km vs 400 km)
      const destDist = Math.sqrt(
        trajectory.destSvg.x ** 2 + trajectory.destSvg.y ** 2
      );

      // Should be significantly larger than Gateway's 30 SVG units
      expect(destDist).toBeGreaterThan(50);
      expect(destDist).toBeLessThan(180); // But still within max range
    });
  });

  describe('initializeFlight origin position at launch time', () => {
    it('originPos reflects launch-time position, not arrival-time position', () => {
      const world = createTestWorld();
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;
      const geo = world.locations.find((l) => l.id === 'geo_depot')!;

      expect(gateway).toBeDefined();
      expect(geo).toBeDefined();

      const gameTime = 50_000;

      // Dock the test ship at Gateway
      const ship = createTestShip({
        location: { status: 'docked', dockedAt: 'leo_station' },
      });

      const flight = initializeFlight(ship, gateway, geo, false, 1.0, {
        gameTime,
        world,
      });

      // Gateway's position at launch time
      const gatewayAtLaunch = getLocationPosition(gateway, gameTime, world);

      // originPos should match Gateway's position at LAUNCH time
      expect(flight.originPos).toBeDefined();
      const dx = flight.originPos!.x - gatewayAtLaunch.x;
      const dy = flight.originPos!.y - gatewayAtLaunch.y;
      const distFromLaunch = Math.sqrt(dx * dx + dy * dy);
      expect(distFromLaunch).toBeLessThan(1); // within 1 km

      // Gateway orbits fast (LEO ~90min period). By arrival time, it should
      // have moved significantly. originPos should NOT match arrival position.
      const arrivalTime = flight.estimatedArrivalGameTime!;
      const gatewayAtArrival = getLocationPosition(gateway, arrivalTime, world);
      const dxArr = flight.originPos!.x - gatewayAtArrival.x;
      const dyArr = flight.originPos!.y - gatewayAtArrival.y;
      const distFromArrival = Math.sqrt(dxArr * dxArr + dyArr * dyArr);

      // If the flight is long enough for Gateway to move, these should differ
      // Gateway orbital radius is ~400km, so diameter movement is ~800km
      if (arrivalTime - gameTime > gateway.orbital!.orbitalPeriodSec * 0.1) {
        expect(distFromArrival).toBeGreaterThan(10); // moved significantly
      }
    });
  });

  describe('computeFrozenTrajectoryLocal with split departure/arrival times', () => {
    it('projects origin at departure time and destination at arrival time', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;
      const geo = world.locations.find((l) => l.id === 'geo_depot')!;

      const departureTime = 10_000;
      const arrivalTime = 100_000;

      // Get positions at their respective times
      const gatewayAtDeparture = getLocationPosition(
        gateway,
        departureTime,
        world
      );
      const geoAtArrival = getLocationPosition(geo, arrivalTime, world);

      const logMin = Math.log10(400);
      const logMax = Math.log10(400_000);

      // Call with departureGameTime parameter
      const result = computeFrozenTrajectoryLocal(
        gatewayAtDeparture,
        geoAtArrival,
        arrivalTime,
        {
          parentLoc: earth,
          world,
          logMin,
          logMax,
          departureGameTime: departureTime,
        }
      );

      // Compute expected: origin projected relative to Earth at departure time
      const earthAtDeparture = getLocationPosition(earth, departureTime, world);
      const expectedOrigin = projectToSvgLocal(
        earthAtDeparture,
        gatewayAtDeparture,
        logMin,
        logMax
      );

      // Destination projected relative to Earth at arrival time
      const earthAtArrival = getLocationPosition(earth, arrivalTime, world);
      const expectedDest = projectToSvgLocal(
        earthAtArrival,
        geoAtArrival,
        logMin,
        logMax
      );

      expect(result.originSvg.x).toBeCloseTo(expectedOrigin.x, 5);
      expect(result.originSvg.y).toBeCloseTo(expectedOrigin.y, 5);
      expect(result.destSvg.x).toBeCloseTo(expectedDest.x, 5);
      expect(result.destSvg.y).toBeCloseTo(expectedDest.y, 5);
    });
  });

  describe('round-trip trajectory continuity', () => {
    it('return flight originPos matches outbound arrival location', () => {
      const world = createTestWorld();
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;
      const geo = world.locations.find((l) => l.id === 'geo_depot')!;

      const departureTime = 50_000;

      // Outbound: Gateway → GEO
      const ship = createTestShip({
        location: { status: 'docked', dockedAt: 'leo_station' },
      });
      const outbound = initializeFlight(ship, gateway, geo, false, 1.0, {
        gameTime: departureTime,
        world,
      });

      const arrivalTime = outbound.estimatedArrivalGameTime!;

      // Return: GEO → Gateway (departing at outbound's arrival time)
      const returnShip = createTestShip({
        location: { status: 'docked', dockedAt: 'geo_depot' },
      });
      const returnFlight = initializeFlight(
        returnShip,
        geo,
        gateway,
        false,
        1.0,
        { gameTime: arrivalTime, world }
      );

      // Return flight's originPos should be GEO's position at the NEW departure
      // time (which equals outbound arrival time), NOT at the return arrival time
      const geoAtReturnDeparture = getLocationPosition(geo, arrivalTime, world);
      expect(returnFlight.originPos).toBeDefined();
      const dx = returnFlight.originPos!.x - geoAtReturnDeparture.x;
      const dy = returnFlight.originPos!.y - geoAtReturnDeparture.y;
      const distFromDeparture = Math.sqrt(dx * dx + dy * dy);
      expect(distFromDeparture).toBeLessThan(1);

      // Return flight's originPos should NOT match GEO at the return arrival time
      const returnArrivalTime = returnFlight.estimatedArrivalGameTime!;
      if (
        returnArrivalTime - arrivalTime >
        geo.orbital!.orbitalPeriodSec * 0.1
      ) {
        const geoAtReturnArrival = getLocationPosition(
          geo,
          returnArrivalTime,
          world
        );
        const dxArr = returnFlight.originPos!.x - geoAtReturnArrival.x;
        const dyArr = returnFlight.originPos!.y - geoAtReturnArrival.y;
        const distFromArrival = Math.sqrt(dxArr * dxArr + dyArr * dyArr);
        expect(distFromArrival).toBeGreaterThan(10);
      }
    });
  });

  describe('shipPos interpolation stays near parent body', () => {
    it('mid-flight shipPos for local flight is near Earth, not along orbital chord', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;
      const geo = world.locations.find((l) => l.id === 'geo_depot')!;

      const gameTime = 50_000;

      const ship = createTestShip({
        location: { status: 'docked', dockedAt: 'leo_station' },
      });

      const flight = initializeFlight(ship, gateway, geo, false, 1.0, {
        gameTime,
        world,
      });

      expect(flight.originPos).toBeDefined();
      expect(flight.interceptPos).toBeDefined();

      // Simulate 50% progress — interpolate shipPos as updateFlightPosition does
      const progress = 0.5;
      const shipPos = lerpVec2(
        flight.originPos!,
        flight.interceptPos!,
        progress
      );

      // Earth's position at mid-flight time
      const midTime =
        gameTime + (flight.estimatedArrivalGameTime! - gameTime) * 0.5;
      const earthAtMid = getLocationPosition(earth, midTime, world);

      // Ship should be near Earth (within ~50,000 km, which covers GEO orbit)
      // NOT millions of km away along a chord of Earth's solar orbit
      const distFromEarth = Math.sqrt(
        (shipPos.x - earthAtMid.x) ** 2 + (shipPos.y - earthAtMid.y) ** 2
      );

      // GEO is at ~36,000 km from Earth. Ship should be within that range + margin.
      // If interpolation crosses time frames, distance would be millions of km.
      expect(distFromEarth).toBeLessThan(50_000);
    });

    it('redirect from mid-flight gets reasonable travel time', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;
      const geo = world.locations.find((l) => l.id === 'geo_depot')!;

      const gameTime = 50_000;

      const ship = createTestShip({
        location: { status: 'docked', dockedAt: 'leo_station' },
      });

      const outbound = initializeFlight(ship, gateway, geo, false, 1.0, {
        gameTime,
        world,
      });

      // Simulate ship at 50% progress
      const progress = 0.5;
      const shipPos = lerpVec2(
        outbound.originPos!,
        outbound.interceptPos!,
        progress
      );

      // Build redirect flight from mid-flight position to Gateway
      const virtualOrigin = {
        distanceFromEarth: 20_000, // approximate
        id: 'leo_station',
      } as import('../models').WorldLocation;

      const redirectTime =
        gameTime + (outbound.estimatedArrivalGameTime! - gameTime) * 0.5;
      const redirect = initializeFlight(
        ship,
        virtualOrigin,
        gateway,
        false,
        1.0,
        { gameTime: redirectTime, world, originPos: shipPos }
      );

      const earthAtRedirect = getLocationPosition(earth, redirectTime, world);
      const distShipFromEarth = Math.sqrt(
        (shipPos.x - earthAtRedirect.x) ** 2 +
          (shipPos.y - earthAtRedirect.y) ** 2
      );

      // Ship should be within the Earth system
      expect(distShipFromEarth).toBeLessThan(50_000);

      const redirectDistKm = redirect.totalDistance / 1000;
      // Distance should be reasonable (< 100,000 km for intra-Earth flight)
      expect(redirectDistKm).toBeLessThan(100_000);

      // Travel time should be reasonable (< 1 year = ~31.5M game seconds)
      expect(redirect.totalTime).toBeLessThan(31_500_000);
    });
  });

  describe('redirect from Earth→Gateway mid-flight back to Earth', () => {
    it('gets reasonable travel time when redirecting back to Earth', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;

      const gameTime = 50_000;

      const ship = createTestShip({
        location: { status: 'docked', dockedAt: 'earth' },
      });

      // Start flight from Earth to Gateway Station
      const outbound = initializeFlight(ship, earth, gateway, false, 1.0, {
        gameTime,
        world,
      });

      expect(outbound.originPos).toBeDefined();
      expect(outbound.interceptPos).toBeDefined();

      // Simulate ship at 50% progress — lerp as updateFlightPosition does
      const progress = 0.5;
      const shipPos = lerpVec2(
        outbound.originPos!,
        outbound.interceptPos!,
        progress
      );

      const redirectTime =
        gameTime + (outbound.estimatedArrivalGameTime! - gameTime) * progress;

      // Ship should be near Earth at mid-flight (Gateway is LEO, 400km)
      const earthAtRedirect = getLocationPosition(earth, redirectTime, world);
      const distShipFromEarth = Math.sqrt(
        (shipPos.x - earthAtRedirect.x) ** 2 +
          (shipPos.y - earthAtRedirect.y) ** 2
      );
      // Ship at 50% between Earth and LEO should be ~200km from Earth.
      // If lerp drifts along Earth's solar orbit chord, this will be millions of km.
      expect(distShipFromEarth).toBeLessThan(50_000);

      // Redirect back to Earth from mid-flight
      const virtualOrigin = {
        distanceFromEarth: 200,
        id: 'earth',
      } as import('../models').WorldLocation;

      const redirect = initializeFlight(
        ship,
        virtualOrigin,
        earth,
        false,
        1.0,
        { gameTime: redirectTime, world, originPos: shipPos }
      );

      const redirectDistKm = redirect.totalDistance / 1000;
      // Distance should be reasonable (< 1,000 km for a ~200km return to Earth)
      expect(redirectDistKm).toBeLessThan(1_000);

      // Travel time should be reasonable (< 1 day game time)
      expect(redirect.totalTime).toBeLessThan(86_400);
    });
  });

  describe('redirect with corrected ship position via redirectShipFlight', () => {
    it('redirectShipFlight computes correct local-frame position for intra-cluster redirect', () => {
      const world = createTestWorld();
      const earth = world.locations.find((l) => l.id === 'earth')!;
      const gateway = world.locations.find((l) => l.id === 'leo_station')!;

      const gameTime = 50_000;

      const ship = createTestShip({
        location: { status: 'docked', dockedAt: 'earth' },
      });

      // Start flight from Earth to Gateway Station
      const outbound = initializeFlight(ship, earth, gateway, false, 1.0, {
        gameTime,
        world,
      });

      expect(outbound.originPos).toBeDefined();
      expect(outbound.interceptPos).toBeDefined();

      // Simulate 50% progress
      const progress = 0.5;
      const rawShipPos = lerpVec2(
        outbound.originPos!,
        outbound.interceptPos!,
        progress
      );
      const redirectTime =
        gameTime + (outbound.estimatedArrivalGameTime! - gameTime) * progress;

      const earthAtRedirect = getLocationPosition(earth, redirectTime, world);

      // Set up ship with active flight plan to simulate redirect
      ship.activeFlightPlan = {
        ...outbound,
        shipPos: rawShipPos,
        distanceCovered: outbound.totalDistance * progress,
        elapsedTime: outbound.totalTime * progress,
      };
      ship.location = { status: 'in_flight' };

      // Use redirectShipFlight to redirect back to Earth
      const currentKm =
        (outbound.originKm ?? 0) + (outbound.totalDistance / 1000) * progress;
      const success = redirectShipFlight(
        ship,
        currentKm,
        earth,
        true,
        1.0,
        redirectTime,
        world
      );

      expect(success).toBe(true);
      expect(ship.activeFlightPlan).toBeDefined();

      // The redirect flight's originPos should be near Earth at redirect time
      const redirectOrigin = ship.activeFlightPlan.originPos!;
      const originDistFromEarth = Math.sqrt(
        (redirectOrigin.x - earthAtRedirect.x) ** 2 +
          (redirectOrigin.y - earthAtRedirect.y) ** 2
      );
      // Origin should be within the Earth system (< 1,000 km)
      expect(originDistFromEarth).toBeLessThan(1_000);

      // Travel distance should be reasonable (< 1,000 km)
      const redirectDistKm = ship.activeFlightPlan.totalDistance / 1000;
      expect(redirectDistKm).toBeLessThan(1_000);

      // Travel time should be reasonable (< 1 day)
      expect(ship.activeFlightPlan.totalTime).toBeLessThan(86_400);
    });
  });
});
