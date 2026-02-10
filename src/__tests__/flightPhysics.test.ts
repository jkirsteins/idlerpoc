import { describe, it, expect } from 'vitest';
import { initializeFlight, advanceFlight } from '../flightPhysics';
import { createTestShip } from './testHelpers';
import { generateWorld } from '../worldGen';
import { getShipClass } from '../shipClasses';
import { getEngineDefinition } from '../engines';
import type { WorldLocation } from '../models';

describe('flightPhysics', () => {
  describe('initializeFlight - travel time scaling', () => {
    it('should produce longer travel time for farther destinations', () => {
      const ship = createTestShip({
        classId: 'wayfarer',
        fuelKg: 28000, // Full tank
        maxFuelKg: 28000,
      });
      const world = generateWorld();

      // Find Gateway Station (400 km) and Meridian Depot (20,000 km)
      const earth = world.locations.find((loc) => loc.id === 'earth')!;
      const gatewayStation = world.locations.find(
        (loc) => loc.id === 'leo_station'
      )!;
      const meridianDepot = world.locations.find(
        (loc) => loc.id === 'meo_depot'
      )!;

      expect(earth).toBeDefined();
      expect(gatewayStation).toBeDefined();
      expect(meridianDepot).toBeDefined();

      // Initialize flights
      const shortFlight = initializeFlight(ship, earth, gatewayStation);
      const longFlight = initializeFlight(ship, earth, meridianDepot);

      // Verify distances
      expect(shortFlight.totalDistance).toBe(400_000); // 400 km in meters
      expect(longFlight.totalDistance).toBe(20_000_000); // 20,000 km in meters

      // Long flight should take significantly more time
      expect(longFlight.totalTime).toBeGreaterThan(shortFlight.totalTime);

      // The ratio should be meaningful (not close to 1)
      // 50x distance difference should produce a noticeable time difference
      const timeRatio = longFlight.totalTime / shortFlight.totalTime;
      expect(timeRatio).toBeGreaterThan(2); // At minimum, 2x longer
    });

    it('should show that 50x distance difference produces meaningful time difference', () => {
      const ship = createTestShip({
        classId: 'wayfarer',
        fuelKg: 28000, // Full tank
        maxFuelKg: 28000,
      });
      const world = generateWorld();

      const earth = world.locations.find((loc) => loc.id === 'earth')!;
      const gatewayStation = world.locations.find(
        (loc) => loc.id === 'leo_station'
      )!;
      const meridianDepot = world.locations.find(
        (loc) => loc.id === 'meo_depot'
      )!;

      // 20,000 / 400 = 50x distance difference
      const distanceRatio =
        meridianDepot.distanceFromEarth / gatewayStation.distanceFromEarth;
      expect(distanceRatio).toBe(50);

      const shortFlight = initializeFlight(ship, earth, gatewayStation);
      const longFlight = initializeFlight(ship, earth, meridianDepot);

      // Time ratio should NOT be close to 1 (that was the bug)
      const timeRatio = longFlight.totalTime / shortFlight.totalTime;

      // Both trips are in mini-brachistochrone regime (no coast phase)
      // Time scales with sqrt(distance), so 50x distance = ~7x time
      // The key fix is that they're NOT the same (which was the bug)
      expect(timeRatio).toBeGreaterThan(5);
      expect(timeRatio).toBeLessThan(10);
    });

    it('should verify mini-brachistochrone branch for very short distances', () => {
      const ship = createTestShip({
        classId: 'wayfarer',
        fuelKg: 28000, // Full tank
        maxFuelKg: 28000,
      });

      const shipClass = getShipClass(ship.classId)!;
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      // Use total mass (dry + fuel + cargo + crew) like initializeFlight does
      const totalMass = shipClass.mass + ship.fuelKg + ship.crew.length * 80;
      const acceleration = engineDef.thrust / totalMass;

      // Create two very close locations
      const origin: WorldLocation = {
        id: 'test_origin',
        name: 'Test Origin',
        type: 'space_station',
        factionId: 'terran_alliance',
        description: 'Test location',
        distanceFromEarth: 0,
        x: 50,
        y: 50,
        services: [],
        size: 1,
        pilotingRequirement: 0,
      };

      const nearDestination: WorldLocation = {
        ...origin,
        id: 'test_near',
        name: 'Test Near',
        distanceFromEarth: 10, // 10 km - very short distance
      };

      const flight = initializeFlight(ship, origin, nearDestination);

      // For mini-brachistochrone (no coast phase), time = 2 * sqrt(d/a)
      const expectedTime = 2 * Math.sqrt((10 * 1000) / acceleration); // 10 km in meters

      // Should have no coast phase
      expect(flight.coastTime).toBe(0);

      // Total time should match the brachistochrone formula
      expect(flight.totalTime).toBeCloseTo(expectedTime, 0);
    });

    it('should verify burn-coast-burn branch for longer distances', () => {
      const ship = createTestShip({
        classId: 'wayfarer',
        fuelKg: 28000, // Full tank
        maxFuelKg: 28000,
      });
      const world = generateWorld();

      const earth = world.locations.find((loc) => loc.id === 'earth')!;
      const mars = world.locations.find((loc) => loc.id === 'mars')!;

      const flight = initializeFlight(ship, earth, mars);

      // Mars trip (54.6M km) should be long enough for coast phase
      expect(flight.coastTime).toBeGreaterThan(0);

      // Now verify even longer trips have more coast time
      const jupiter = world.locations.find(
        (loc) => loc.id === 'jupiter_station'
      );

      if (jupiter) {
        const jupiterTrip = initializeFlight(ship, earth, jupiter);
        expect(jupiterTrip.coastTime).toBeGreaterThan(flight.coastTime);
        expect(jupiterTrip.totalTime).toBeGreaterThan(flight.totalTime);
      }
    });

    it('should use same cruise velocity logic as computeMaxRange', () => {
      const ship = createTestShip({
        classId: 'wayfarer',
        fuelKg: 28000, // Full tank
        maxFuelKg: 28000,
      });
      const world = generateWorld();

      const shipClass = getShipClass(ship.classId)!;
      const engineDef = getEngineDefinition(ship.engine.definitionId);

      // With realistic physics, delta-v comes from Tsiolkovsky equation
      // Calculate expected delta-v with current fuel
      const dryMass = shipClass.mass + ship.crew.length * 80;
      const wetMass = dryMass + ship.fuelKg;
      const specificImpulse = 900; // NTR-200 from WORLDRULES.md
      const G0 = 9.81;
      const availableDeltaV =
        specificImpulse * G0 * Math.log(wetMass / dryMass);
      const allocatedDeltaV = Math.min(
        availableDeltaV * 0.5,
        0.5 * engineDef.maxDeltaV
      );
      const expectedCruiseVelocity = allocatedDeltaV / 2;

      // Initialize a long-distance flight
      const earth = world.locations.find((loc) => loc.id === 'earth')!;
      const mars = world.locations.find((loc) => loc.id === 'mars')!;
      const flight = initializeFlight(ship, earth, mars);

      // Calculate the cruise velocity from the flight parameters
      // For burn-coast-burn: v_cruise = acceleration * burnTime
      const actualCruiseVelocity = flight.acceleration * flight.burnTime;

      // Should match computeMaxRange's cruise velocity
      expect(actualCruiseVelocity).toBeCloseTo(expectedCruiseVelocity, 0);
    });
  });

  describe('advanceFlight', () => {
    it('should advance flight state correctly over time', () => {
      const ship = createTestShip({
        classId: 'wayfarer',
        fuelKg: 28000, // Full tank
        maxFuelKg: 28000,
      });
      const world = generateWorld();

      const earth = world.locations.find((loc) => loc.id === 'earth')!;
      const gatewayStation = world.locations.find(
        (loc) => loc.id === 'leo_station'
      )!;

      const flight = initializeFlight(ship, earth, gatewayStation);

      // Should start accelerating
      expect(flight.phase).toBe('accelerating');
      expect(flight.elapsedTime).toBe(0);
      expect(flight.distanceCovered).toBe(0);

      // Advance until complete
      let complete = false;
      let ticks = 0;
      const maxTicks = 10000; // Safety limit

      while (!complete && ticks < maxTicks) {
        complete = advanceFlight(flight);
        ticks++;
      }

      // Should complete within reasonable time
      expect(complete).toBe(true);
      expect(ticks).toBeLessThan(maxTicks);

      // Should have covered the full distance
      expect(flight.distanceCovered).toBeCloseTo(flight.totalDistance, 0);
      expect(flight.currentVelocity).toBe(0); // Should end at rest
    });
  });
});
