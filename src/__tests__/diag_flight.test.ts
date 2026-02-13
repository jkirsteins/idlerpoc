import { describe, it, expect } from 'vitest';
import { initializeFlight } from '../flightPhysics';
import {
  updateWorldPositions,
  getLocationPosition,
  euclideanDistance,
} from '../orbitalMechanics';
import { createTestShip, createTestWorld } from './testHelpers';

describe('co-orbiting flight distance (frozen-origin fix)', () => {
  it('Gateway→Earth orbital flight should be ~400 km, not millions', () => {
    const world = createTestWorld();
    const gameTime = 1_555_200; // Day 18
    updateWorldPositions(world, gameTime);

    const earth = world.locations.find((l) => l.id === 'earth')!;
    const gateway = world.locations.find((l) => l.id === 'leo_station')!;

    // Confirm 2D distance is ~400 km
    const earthPos = getLocationPosition(earth, gameTime, world);
    const gatewayPos = getLocationPosition(gateway, gameTime, world);
    const dist2D = euclideanDistance(earthPos, gatewayPos);
    expect(dist2D).toBeGreaterThan(300);
    expect(dist2D).toBeLessThan(500);

    // Create a station keeper ship
    const ship = createTestShip({
      classId: 'station_keeper',
      fuelKg: 8000,
      maxFuelKg: 8000,
      provisionsKg: 420,
      engine: {
        id: 'eng1',
        definitionId: 'chemical_bipropellant',
        state: 'online',
        warmupProgress: 100,
      },
    });

    // Flight WITH orbital mechanics should produce sane values
    const flight = initializeFlight(ship, gateway, earth, false, 1.0, {
      gameTime,
      world,
    });

    // Travel time should be under 1 game day for a 400 km trip
    expect(flight.totalTime).toBeLessThan(86400);
    // Distance should be ~400 km in meters (not millions/billions)
    expect(flight.totalDistance).toBeLessThan(600_000);
    expect(flight.totalDistance).toBeGreaterThan(200_000);
  });

  it('Earth→Mars orbital flight should still be interplanetary scale', () => {
    const world = createTestWorld();
    const gameTime = 1_555_200;
    updateWorldPositions(world, gameTime);

    const earth = world.locations.find((l) => l.id === 'earth')!;
    const mars = world.locations.find((l) => l.id === 'mars')!;

    const ship = createTestShip({
      classId: 'wayfarer',
      fuelKg: 150_000,
      maxFuelKg: 150_000,
    });

    const flight = initializeFlight(ship, earth, mars, false, 1.0, {
      gameTime,
      world,
    });

    // Mars is 78M+ km from Earth — distance should be in that range
    expect(flight.totalDistance).toBeGreaterThan(50_000_000_000); // >50M km in meters
    // Trip should take multiple days
    expect(flight.totalTime).toBeGreaterThan(86400 * 5);
  });

  it('legacy (non-orbital) path still works for Gateway→Earth', () => {
    const world = createTestWorld();
    updateWorldPositions(world, 0);

    const earth = world.locations.find((l) => l.id === 'earth')!;
    const gateway = world.locations.find((l) => l.id === 'leo_station')!;

    const ship = createTestShip({
      classId: 'station_keeper',
      fuelKg: 8000,
      maxFuelKg: 8000,
      provisionsKg: 420,
      engine: {
        id: 'eng1',
        definitionId: 'chemical_bipropellant',
        state: 'online',
        warmupProgress: 100,
      },
    });

    // Without orbital options — uses static distance
    const flight = initializeFlight(ship, gateway, earth);
    expect(flight.totalTime).toBeLessThan(86400);
    expect(flight.totalDistance).toBeLessThan(600_000);
  });
});
