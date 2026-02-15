import { describe, it, expect } from 'vitest';

const AU_IN_KM = 149597870.7;
const AU_TO_SVG_SCALE = 160 / 0.07;

function planetToSvgCoords(
  x: number | undefined | null,
  y: number | undefined | null
) {
  const planetX = Number(x) || 0;
  const planetY = Number(y) || 0;
  const distanceAU =
    Math.sqrt(planetX * planetX + planetY * planetY) / AU_IN_KM;
  const svgRadius = distanceAU * AU_TO_SVG_SCALE;
  const angle = Math.atan2(planetY, planetX);
  return {
    x: svgRadius * Math.cos(angle),
    y: svgRadius * Math.sin(angle),
  };
}

describe('orrery planet position conversion', () => {
  it('should handle valid coordinates', () => {
    const result = planetToSvgCoords(2000000, 3000000);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });

  it('should handle undefined x/y', () => {
    const result = planetToSvgCoords(undefined, undefined);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });

  it('should handle null x/y', () => {
    const result = planetToSvgCoords(null, null);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });

  it('should handle NaN x/y', () => {
    const result = planetToSvgCoords(NaN, NaN);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });

  it('should handle mixed invalid values', () => {
    const result = planetToSvgCoords(undefined, NaN);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });
});
