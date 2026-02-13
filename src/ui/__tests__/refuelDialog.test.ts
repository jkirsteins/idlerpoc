import { describe, it, expect } from 'vitest';
import { getFuelPricePerKg } from '../../fuelPricing';
import type { WorldLocation } from '../../models';

describe('fuelPricing', () => {
  describe('getFuelPricePerKg (no ship — location-only pricing)', () => {
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

    it('should return cislunar pricing (1.0x) for 1k-500k km', () => {
      const loc1 = createLocation(1000);
      const loc2 = createLocation(50000);
      const loc3 = createLocation(384400); // Moon distance

      expect(getFuelPricePerKg(loc1)).toBe(basePricePerKg * 1.0);
      expect(getFuelPricePerKg(loc2)).toBe(basePricePerKg * 1.0);
      expect(getFuelPricePerKg(loc3)).toBe(basePricePerKg * 1.0);
    });

    it('should return deep cislunar pricing (1.5x) for 500k-5M km', () => {
      const loc1 = createLocation(500000);
      const loc2 = createLocation(1500000); // Freeport
      const loc3 = createLocation(1800000); // Scatter

      expect(getFuelPricePerKg(loc1)).toBe(basePricePerKg * 1.5);
      expect(getFuelPricePerKg(loc2)).toBe(basePricePerKg * 1.5);
      expect(getFuelPricePerKg(loc3)).toBe(basePricePerKg * 1.5);
    });

    it('should return Mars pricing (2.0x) for 5M-100M km', () => {
      const marsLoc = createLocation(55_000_000);
      expect(getFuelPricePerKg(marsLoc)).toBe(basePricePerKg * 2.0);
    });

    it('should return belt/Jupiter pricing (2.5x) for >= 100M km', () => {
      const vestaLoc = createLocation(110_000_000);
      const jupiterLoc = createLocation(588_000_000);

      expect(getFuelPricePerKg(vestaLoc)).toBe(basePricePerKg * 2.5);
      expect(getFuelPricePerKg(jupiterLoc)).toBe(basePricePerKg * 2.5);
    });

    it('should provide realistic pricing examples', () => {
      // Gateway Station (LEO, 400 km) - cheap
      const gateway = createLocation(400);
      expect(getFuelPricePerKg(gateway)).toBe(1.6); // 2 × 0.8

      // Tycho Colony (Moon, 384,400 km) - standard
      const tycho = createLocation(384400);
      expect(getFuelPricePerKg(tycho)).toBe(2.0); // 2 × 1.0

      // Mars (55M km) - expensive
      const mars = createLocation(55_000_000);
      expect(getFuelPricePerKg(mars)).toBe(4.0); // 2 × 2.0
    });

    it('should show price progression with distance', () => {
      const earth = getFuelPricePerKg(createLocation(0));
      const cislunar = getFuelPricePerKg(createLocation(10000));
      const deepCislunar = getFuelPricePerKg(createLocation(1500000));
      const mars = getFuelPricePerKg(createLocation(55_000_000));
      const belt = getFuelPricePerKg(createLocation(200_000_000));

      // Prices should increase with distance
      expect(earth).toBeLessThan(cislunar);
      expect(cislunar).toBeLessThan(deepCislunar);
      expect(deepCislunar).toBeLessThan(mars);
      expect(mars).toBeLessThan(belt);

      // Belt should be >3x more expensive than Earth
      expect(belt / earth).toBeGreaterThan(3);
    });
  });
});
