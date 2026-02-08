import { describe, it, expect } from 'vitest';
import {
  formatFuelMass,
  formatFuelPercentage,
  calculateFuelPercentage,
  formatFuelWithPercentage,
  getFuelColorClass,
  getFuelColorHex,
} from '../fuelFormatting';

describe('fuelFormatting', () => {
  describe('formatFuelMass', () => {
    it('should format small fuel amounts', () => {
      expect(formatFuelMass(500)).toBe('500 kg');
    });

    it('should format with thousands separator', () => {
      expect(formatFuelMass(1500)).toBe('1,500 kg');
      expect(formatFuelMass(10000)).toBe('10,000 kg');
      expect(formatFuelMass(100000)).toBe('100,000 kg');
    });

    it('should round to nearest integer', () => {
      expect(formatFuelMass(1234.56)).toBe('1,235 kg');
      expect(formatFuelMass(1234.44)).toBe('1,234 kg');
    });

    it('should handle zero', () => {
      expect(formatFuelMass(0)).toBe('0 kg');
    });
  });

  describe('formatFuelPercentage', () => {
    it('should format percentage with one decimal', () => {
      expect(formatFuelPercentage(75.5)).toBe('75.5%');
      expect(formatFuelPercentage(100)).toBe('100.0%');
      expect(formatFuelPercentage(0)).toBe('0.0%');
    });
  });

  describe('calculateFuelPercentage', () => {
    it('should calculate correct percentage', () => {
      expect(calculateFuelPercentage(50000, 100000)).toBe(50);
      expect(calculateFuelPercentage(75000, 100000)).toBe(75);
      expect(calculateFuelPercentage(100000, 100000)).toBe(100);
    });

    it('should handle zero fuel', () => {
      expect(calculateFuelPercentage(0, 100000)).toBe(0);
    });

    it('should handle zero capacity', () => {
      expect(calculateFuelPercentage(1000, 0)).toBe(0);
    });

    it('should handle fractional percentages', () => {
      expect(calculateFuelPercentage(12345, 100000)).toBeCloseTo(12.345, 2);
    });
  });

  describe('formatFuelWithPercentage', () => {
    it('should format both kg and percentage', () => {
      expect(formatFuelWithPercentage(75000, 100000)).toBe('75,000 kg (75%)');
      expect(formatFuelWithPercentage(50000, 100000)).toBe('50,000 kg (50%)');
    });

    it('should round percentage to nearest integer', () => {
      expect(formatFuelWithPercentage(12345, 100000)).toBe('12,345 kg (12%)');
      expect(formatFuelWithPercentage(75678, 100000)).toBe('75,678 kg (76%)');
    });
  });

  describe('getFuelColorClass', () => {
    it('should return danger for low fuel', () => {
      expect(getFuelColorClass(0)).toBe('bar-danger');
      expect(getFuelColorClass(10)).toBe('bar-danger');
      expect(getFuelColorClass(20)).toBe('bar-danger');
    });

    it('should return warning for medium fuel', () => {
      expect(getFuelColorClass(21)).toBe('bar-warning');
      expect(getFuelColorClass(40)).toBe('bar-warning');
      expect(getFuelColorClass(50)).toBe('bar-warning');
    });

    it('should return good for high fuel', () => {
      expect(getFuelColorClass(51)).toBe('bar-good');
      expect(getFuelColorClass(75)).toBe('bar-good');
      expect(getFuelColorClass(100)).toBe('bar-good');
    });
  });

  describe('getFuelColorHex', () => {
    it('should return red for low fuel', () => {
      expect(getFuelColorHex(0)).toBe('#e94560');
      expect(getFuelColorHex(20)).toBe('#e94560');
    });

    it('should return yellow for medium fuel', () => {
      expect(getFuelColorHex(21)).toBe('#ffc107');
      expect(getFuelColorHex(50)).toBe('#ffc107');
    });

    it('should return green for high fuel', () => {
      expect(getFuelColorHex(51)).toBe('#4caf50');
      expect(getFuelColorHex(100)).toBe('#4caf50');
    });
  });

  describe('realistic fuel scenarios', () => {
    it('should handle Wayfarer with full fuel tank', () => {
      // Wayfarer: 70% of 40,000 kg cargo capacity = 28,000 kg max fuel
      const maxFuel = 28000;
      const currentFuel = maxFuel;

      expect(calculateFuelPercentage(currentFuel, maxFuel)).toBe(100);
      expect(formatFuelWithPercentage(currentFuel, maxFuel)).toBe(
        '28,000 kg (100%)'
      );
      expect(getFuelColorClass(100)).toBe('bar-good');
    });

    it('should handle Gateway Station trip fuel usage', () => {
      // Gateway Station trip uses significant fuel from smaller tank
      const maxFuel = 28000; // Wayfarer max fuel (70% of 40k cargo capacity)
      const usedFuel = 5000; // ~18% used for Gateway trip
      const remaining = maxFuel - usedFuel;

      const percentage = calculateFuelPercentage(remaining, maxFuel);
      expect(percentage).toBeCloseTo(82.14, 1); // ~82% remaining
      expect(formatFuelMass(remaining)).toBe('23,000 kg');
    });

    it('should handle low fuel warning scenario', () => {
      // Ship at 15% fuel (danger threshold)
      const maxFuel = 28000;
      const currentFuel = 4200; // 15%

      expect(calculateFuelPercentage(currentFuel, maxFuel)).toBe(15);
      expect(getFuelColorClass(15)).toBe('bar-danger');
      expect(getFuelColorHex(15)).toBe('#e94560');
    });

    it('should handle Station Keeper smaller fuel tank', () => {
      // Station Keeper: 70% of 5,000 kg = 3,500 kg max fuel
      const maxFuel = 3500;
      const currentFuel = 1750; // 50%

      expect(calculateFuelPercentage(currentFuel, maxFuel)).toBe(50);
      expect(formatFuelWithPercentage(currentFuel, maxFuel)).toBe(
        '1,750 kg (50%)'
      );
      expect(getFuelColorClass(50)).toBe('bar-warning');
    });

    it('should handle Leviathan large fuel tank', () => {
      // Leviathan: 70% of 200,000 kg = 140,000 kg max fuel
      const maxFuel = 140000;
      const currentFuel = 100000; // ~71%

      const percentage = calculateFuelPercentage(currentFuel, maxFuel);
      expect(percentage).toBeCloseTo(71.43, 1);
      expect(formatFuelMass(currentFuel)).toBe('100,000 kg');
      expect(getFuelColorClass(percentage)).toBe('bar-good');
    });
  });
});
