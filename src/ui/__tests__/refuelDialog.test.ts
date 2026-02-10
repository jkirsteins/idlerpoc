import { describe, it, expect } from 'vitest';
import { getFuelPricePerKg } from '../refuelDialog';
import type { WorldLocation } from '../../models';

describe('refuelDialog', () => {
  describe('getFuelPricePerKg', () => {
    const basePricePerKg = 2; // Base price for reference

    function createLocation(distanceFromEarth: number): WorldLocation {
      return {
        id: 'test',
        name: 'Test Location',
        type: 'space_station',
        description: 'Test',
        distanceFromEarth,
        x: 0,
        y: 0,
        services: ['refuel'],
        size: 1,
        pilotingRequirement: 0,
      };
    }

    it('should return Earth/LEO pricing (0.8x) for locations < 1000 km', () => {
      const earthLoc = createLocation(0);
      const leoLoc = createLocation(400);

      expect(getFuelPricePerKg(earthLoc)).toBe(basePricePerKg * 0.8);
      expect(getFuelPricePerKg(leoLoc)).toBe(basePricePerKg * 0.8);
    });

    it('should return inner system pricing (1.0x) for 1k-100k km', () => {
      const innerLoc1 = createLocation(1000);
      const innerLoc2 = createLocation(50000);
      const innerLoc3 = createLocation(99999);

      expect(getFuelPricePerKg(innerLoc1)).toBe(basePricePerKg * 1.0);
      expect(getFuelPricePerKg(innerLoc2)).toBe(basePricePerKg * 1.0);
      expect(getFuelPricePerKg(innerLoc3)).toBe(basePricePerKg * 1.0);
    });

    it('should return mid system pricing (1.5x) for 100k-1M km', () => {
      const midLoc1 = createLocation(100000);
      const midLoc2 = createLocation(500000);
      const midLoc3 = createLocation(999999);

      expect(getFuelPricePerKg(midLoc1)).toBe(basePricePerKg * 1.5);
      expect(getFuelPricePerKg(midLoc2)).toBe(basePricePerKg * 1.5);
      expect(getFuelPricePerKg(midLoc3)).toBe(basePricePerKg * 1.5);
    });

    it('should return outer system pricing (2.5x) for > 1M km', () => {
      const outerLoc1 = createLocation(1000000);
      const outerLoc2 = createLocation(54600000); // Mars distance
      const outerLoc3 = createLocation(100000000);

      expect(getFuelPricePerKg(outerLoc1)).toBe(basePricePerKg * 2.5);
      expect(getFuelPricePerKg(outerLoc2)).toBe(basePricePerKg * 2.5);
      expect(getFuelPricePerKg(outerLoc3)).toBe(basePricePerKg * 2.5);
    });

    it('should provide realistic pricing examples', () => {
      // Gateway Station (LEO, 400 km) - cheap
      const gateway = createLocation(400);
      expect(getFuelPricePerKg(gateway)).toBe(1.6); // 2 × 0.8

      // Meridian Depot (MEO, 20,000 km) - standard
      const meridian = createLocation(20000);
      expect(getFuelPricePerKg(meridian)).toBe(2.0); // 2 × 1.0

      // Mars Orbit (54.6M km) - expensive
      const mars = createLocation(54600000);
      expect(getFuelPricePerKg(mars)).toBe(5.0); // 2 × 2.5
    });

    it('should calculate total cost correctly', () => {
      const location = createLocation(400); // 1.6 cr/kg
      const pricePerKg = getFuelPricePerKg(location);

      // Wayfarer max fuel: 28,000 kg
      // Half tank: 14,000 kg
      // Cost: 14,000 × 1.6 = 22,400 cr
      const halfTankKg = 14000;
      const totalCost = halfTankKg * pricePerKg;

      expect(totalCost).toBe(22400);
    });

    it('should show price progression with distance', () => {
      const earth = getFuelPricePerKg(createLocation(0));
      const inner = getFuelPricePerKg(createLocation(10000));
      const mid = getFuelPricePerKg(createLocation(500000));
      const outer = getFuelPricePerKg(createLocation(54600000));

      // Prices should increase with distance
      expect(earth).toBeLessThan(inner);
      expect(inner).toBeLessThan(mid);
      expect(mid).toBeLessThan(outer);

      // Outer system should be >3x more expensive than Earth
      expect(outer / earth).toBeGreaterThan(3);
    });
  });
});
