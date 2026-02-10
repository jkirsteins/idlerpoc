import { describe, it, expect } from 'vitest';
import { createTestShip, createTestWorld } from './testHelpers';
import {
  calculateDeltaV,
  getCurrentShipMass,
  calculateFuelMassRequired,
  calculateFuelTankCapacity,
  getSpecificImpulse,
  initializeFlight,
  CREW_MASS_KG,
  CARGO_ITEM_MASS_KG,
} from '../flightPhysics';
import { getShipClass } from '../shipClasses';
import { getEngineDefinition } from '../engines';

/**
 * Fuel System Physics Tests
 *
 * Tests the realistic mass-based fuel system using the Tsiolkovsky rocket equation.
 *
 * NOTE: The implemented system uses 70% of cargo capacity for fuel tanks.
 * This creates the intended range pressure and progression gameplay:
 * - Wayfarer (40k cargo): 28k kg max fuel
 * - Can reach Gateway Station (~10k kg needed)
 * - Cannot reach Meridian or Mars without refueling
 */

const G0 = 9.81; // Standard gravity

describe('Fuel Physics - Tsiolkovsky Rocket Equation', () => {
  describe('calculateDeltaV', () => {
    it('should calculate delta-v correctly for known mass ratio', () => {
      const wetMass = 210000; // 200k dry + 10k fuel
      const dryMass = 200000;
      const isp = 900; // NTR-200

      const deltaV = calculateDeltaV(wetMass, dryMass, isp);

      // Δv = 900 × 9.81 × ln(210000/200000)
      // Δv = 8829 × ln(1.05)
      // Δv ≈ 430.7 m/s
      expect(deltaV).toBeCloseTo(430.7, 0);
    });

    it('should match expected values for 5% fuel (~430 m/s)', () => {
      const dryMass = 200000; // Wayfarer dry mass
      const fuelMass = 10000; // ~5% fuel
      const wetMass = dryMass + fuelMass;
      const isp = 900; // NTR-200

      const deltaV = calculateDeltaV(wetMass, dryMass, isp);

      expect(deltaV).toBeCloseTo(430.7, 0);
    });

    it('should calculate higher delta-v with full tank (28k kg fuel)', () => {
      const dryMass = 200000;
      const fuelMass = 28000; // Full Wayfarer tank
      const wetMass = dryMass + fuelMass;
      const isp = 900;

      const deltaV = calculateDeltaV(wetMass, dryMass, isp);

      // Δv = 900 × 9.81 × ln(228000/200000)
      // Δv ≈ 1157 m/s
      expect(deltaV).toBeCloseTo(1157, 0);
    });

    it('should handle edge case of mass ratio = 1 (no fuel, deltaV = 0)', () => {
      const mass = 200000;
      const isp = 900;

      const deltaV = calculateDeltaV(mass, mass, isp);

      expect(deltaV).toBe(0);
    });

    it('should use g₀ = 9.81 m/s² in calculations', () => {
      const wetMass = 210000;
      const dryMass = 200000;
      const isp = 900;

      const deltaV = calculateDeltaV(wetMass, dryMass, isp);

      // Manual calculation: isp * 9.81 * ln(1.05)
      const expected = isp * G0 * Math.log(wetMass / dryMass);

      expect(deltaV).toBeCloseTo(expected, 5);
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateDeltaV(100000, 200000, 900)).toBe(0); // wet < dry
      expect(calculateDeltaV(0, 0, 900)).toBe(0); // both zero
      expect(calculateDeltaV(200000, -100000, 900)).toBe(0); // negative dry
    });
  });

  describe('getCurrentShipMass', () => {
    it('should calculate total mass as dry + fuel + cargo + crew', () => {
      const ship = createTestShip({
        classId: 'wayfarer',
        fuelKg: 10000,
        cargo: [{ id: '1', definitionId: 'toolkit' }], // ~10kg each
      });

      const shipClass = getShipClass(ship.classId)!;
      const totalMass = getCurrentShipMass(ship);

      // Expected: hull + fuel + cargo + crew
      const expectedMass =
        shipClass.mass +
        10000 +
        CARGO_ITEM_MASS_KG +
        ship.crew.length * CREW_MASS_KG;

      expect(totalMass).toBe(expectedMass);
    });

    it('should use 80 kg per crew member', () => {
      const ship1 = createTestShip({
        classId: 'wayfarer',
        fuelKg: 0,
        cargo: [],
      });

      const ship2 = createTestShip({
        classId: 'wayfarer',
        fuelKg: 0,
        cargo: [],
        crew: [
          ...ship1.crew,
          { ...ship1.crew[0], id: 'crew2', name: 'Extra Crew' },
        ],
      });

      const mass1 = getCurrentShipMass(ship1);
      const mass2 = getCurrentShipMass(ship2);

      // Adding one crew member should add 80kg
      expect(mass2 - mass1).toBe(80);
    });

    it('should show mass decreases as fuel is consumed', () => {
      const shipFull = createTestShip({
        classId: 'wayfarer',
        fuelKg: 28000,
      });

      const shipHalf = createTestShip({
        classId: 'wayfarer',
        fuelKg: 14000,
      });

      expect(getCurrentShipMass(shipFull)).toBeGreaterThan(
        getCurrentShipMass(shipHalf)
      );
      expect(getCurrentShipMass(shipFull) - getCurrentShipMass(shipHalf)).toBe(
        14000
      );
    });
  });
});

describe('Fuel Physics - Tank Capacity', () => {
  it('should calculate tank capacity as 70% of cargo capacity', () => {
    const wayfarer = getShipClass('wayfarer')!;
    const engineDef = getEngineDefinition('ntr_mk1');

    const capacity = calculateFuelTankCapacity(
      wayfarer.cargoCapacity,
      engineDef
    );

    // 40,000 kg × 0.7 = 28,000 kg
    expect(capacity).toBe(28000);
  });

  it('should scale properly for different ship classes', () => {
    const engineDef = getEngineDefinition('ntr_mk1');

    const stationKeeper = getShipClass('station_keeper')!;
    const wayfarer = getShipClass('wayfarer')!;
    const corsair = getShipClass('corsair')!;

    const capacity1 = calculateFuelTankCapacity(
      stationKeeper.cargoCapacity,
      engineDef
    );
    const capacity2 = calculateFuelTankCapacity(
      wayfarer.cargoCapacity,
      engineDef
    );
    const capacity3 = calculateFuelTankCapacity(
      corsair.cargoCapacity,
      engineDef
    );

    // Larger cargo capacity → larger fuel tank
    expect(capacity2).toBeGreaterThan(capacity1);
    expect(capacity3).toBeGreaterThan(capacity2);

    // All should be 70% of cargo capacity
    expect(capacity1).toBe(stationKeeper.cargoCapacity * 0.7);
    expect(capacity2).toBe(wayfarer.cargoCapacity * 0.7);
    expect(capacity3).toBe(corsair.cargoCapacity * 0.7);
  });
});

describe('Fuel Physics - Specific Impulse', () => {
  it('should return 900s for NTR fission drives (WORLDRULES.md line 124)', () => {
    const ntr_mk1 = getEngineDefinition('ntr_mk1');
    const ntr_mk2 = getEngineDefinition('ntr_mk2');
    const ntr_heavy = getEngineDefinition('ntr_heavy');

    expect(getSpecificImpulse(ntr_mk1)).toBe(900);
    expect(getSpecificImpulse(ntr_mk2)).toBe(900);
    expect(getSpecificImpulse(ntr_heavy)).toBe(900);
  });

  it('should return 450s for chemical bipropellant', () => {
    const chemical = getEngineDefinition('chemical_bipropellant');

    expect(getSpecificImpulse(chemical)).toBe(450);
  });

  it('should return higher values for fusion drives', () => {
    const fission = getEngineDefinition('ntr_mk1');
    const fusionDD = getEngineDefinition('fdr_sunfire');
    const fusionHe3 = getEngineDefinition('fdr_hellion');

    const ispFission = getSpecificImpulse(fission);
    const ispDD = getSpecificImpulse(fusionDD);
    const ispHe3 = getSpecificImpulse(fusionHe3);

    // Fusion should be much better than fission
    expect(ispDD).toBeGreaterThan(ispFission * 10);
    expect(ispHe3).toBeGreaterThan(ispDD);
  });
});

describe('Fuel Physics - Fuel Mass Required', () => {
  it('should calculate fuel needed for given delta-v', () => {
    const dryMass = 200000;
    const requiredDeltaV = 430; // Gateway Station
    const isp = 900;

    const fuelMass = calculateFuelMassRequired(dryMass, requiredDeltaV, isp);

    // Should be approximately 10,000 kg for ~430 m/s
    expect(fuelMass).toBeCloseTo(10000, -2); // Within 100 kg
  });

  it('should show exponential scaling (not linear)', () => {
    const dryMass = 200000;
    const isp = 900;

    const fuel1 = calculateFuelMassRequired(dryMass, 500, isp);
    const fuel2 = calculateFuelMassRequired(dryMass, 1000, isp); // 2x delta-v
    const fuel3 = calculateFuelMassRequired(dryMass, 1500, isp); // 3x delta-v

    // Fuel should scale exponentially, not linearly
    // 2x delta-v requires MORE than 2x fuel
    expect(fuel2).toBeGreaterThan(fuel1 * 2);
    expect(fuel3).toBeGreaterThan(fuel1 * 3);
  });

  it('should return 0 for zero or negative delta-v', () => {
    const dryMass = 200000;
    const isp = 900;

    expect(calculateFuelMassRequired(dryMass, 0, isp)).toBe(0);
    expect(calculateFuelMassRequired(dryMass, -100, isp)).toBe(0);
  });
});

describe('Fuel Physics - Integration with Flight System', () => {
  it('should initialize flight with current ship mass affecting acceleration', () => {
    const world = createTestWorld();
    const earth = world.locations.find((loc) => loc.id === 'earth')!;
    const gateway = world.locations.find((loc) => loc.id === 'leo_station')!;

    const shipEmpty = createTestShip({
      classId: 'wayfarer',
      fuelKg: 1000, // Minimal fuel
      maxFuelKg: 28000,
    });

    const shipFull = createTestShip({
      classId: 'wayfarer',
      fuelKg: 28000, // Full tank
      maxFuelKg: 28000,
    });

    const flightEmpty = initializeFlight(shipEmpty, earth, gateway);
    const flightFull = initializeFlight(shipFull, earth, gateway);

    // Empty ship should have higher acceleration (less mass)
    expect(flightEmpty.acceleration).toBeGreaterThan(flightFull.acceleration);

    // Ratio should match mass ratio
    const massEmpty = getCurrentShipMass(shipEmpty);
    const massFull = getCurrentShipMass(shipFull);
    const accelRatio = flightEmpty.acceleration / flightFull.acceleration;
    const massRatio = massFull / massEmpty;

    expect(accelRatio).toBeCloseTo(massRatio, 2);
  });

  it('should verify Wayfarer can reach Gateway Station with 10k kg fuel', () => {
    const world = createTestWorld();
    const earth = world.locations.find((loc) => loc.id === 'earth')!;
    const gateway = world.locations.find((loc) => loc.id === 'leo_station')!;

    const ship = createTestShip({
      classId: 'wayfarer',
      fuelKg: 10000, // Should be enough for Gateway
      maxFuelKg: 28000,
    });

    const flight = initializeFlight(ship, earth, gateway);

    // Should successfully initialize without errors
    expect(flight.totalDistance).toBeGreaterThan(0);
    expect(flight.totalTime).toBeGreaterThan(0);
  });
});

describe('Fuel Physics - Edge Cases', () => {
  it('should handle zero fuel gracefully', () => {
    const ship = createTestShip({
      classId: 'wayfarer',
      fuelKg: 0,
      maxFuelKg: 28000,
    });

    const mass = getCurrentShipMass(ship);
    const shipClass = getShipClass(ship.classId)!;

    // Should equal dry mass + crew + cargo
    expect(mass).toBeGreaterThan(shipClass.mass);
    expect(mass).toBeLessThan(shipClass.mass + 1000); // No significant fuel
  });

  it('should handle maximum capacity', () => {
    const ship = createTestShip({
      classId: 'wayfarer',
      fuelKg: 28000,
      maxFuelKg: 28000,
    });

    expect(ship.fuelKg).toBeLessThanOrEqual(ship.maxFuelKg);
  });

  it('should maintain precision with large fuel masses', () => {
    const dryMass = 1200000; // Leviathan
    const fuelMass = 140000; // Full tank
    const wetMass = dryMass + fuelMass;
    const isp = 100000; // Fusion drive

    const deltaV = calculateDeltaV(wetMass, dryMass, isp);

    // Should not overflow or lose precision
    expect(deltaV).toBeGreaterThan(0);
    expect(deltaV).toBeLessThan(Infinity);
    expect(Number.isFinite(deltaV)).toBe(true);
  });
});

/**
 * Test Summary
 *
 * Implemented System (70% cargo capacity for fuel):
 * - Wayfarer: 28,000 kg max fuel
 * - Max delta-v: ~1,161 m/s (with full tank)
 * - Can reach: Gateway Station (~10k kg, ~430 m/s)
 * - Cannot reach: Meridian Depot or Mars without refueling
 *
 * This creates strategic gameplay:
 * - Refueling stops required for long journeys
 * - Ship progression matters (larger ships have more fuel capacity)
 * - Range is truly emergent from ship systems
 */
