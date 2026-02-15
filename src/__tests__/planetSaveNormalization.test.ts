import { describe, expect, it } from 'vitest';

import {
  generateTRAPPIST1System,
  normalizePlanetsFromSave,
} from '../trappist1Data';

describe('normalizePlanetsFromSave', () => {
  it('backfills missing zone hex coordinates from canonical data', () => {
    const planets = generateTRAPPIST1System();
    const broken = structuredClone(planets);

    const asimov = broken.find((planet) => planet.id === 'asimov');
    if (!asimov) throw new Error('expected Asimov in generated planets');

    asimov.zones[0].hexQ = undefined as unknown as number;
    asimov.zones[0].hexR = undefined as unknown as number;
    asimov.zones[0].hexS = undefined as unknown as number;
    asimov.zones[0].insolationBand = undefined as unknown as
      | 'light'
      | 'terminator'
      | 'dark';
    asimov.zones[0].atmosphericGases = undefined as unknown as {
      n2: number;
      co2: number;
      o2: number;
      ch4: number;
      inert: number;
    };

    const normalized = normalizePlanetsFromSave(broken);
    const normalizedAsimov = normalized.find(
      (planet) => planet.id === 'asimov'
    );

    expect(normalizedAsimov).toBeTruthy();
    expect(Number.isFinite(normalizedAsimov!.zones[0].hexQ)).toBe(true);
    expect(Number.isFinite(normalizedAsimov!.zones[0].hexR)).toBe(true);
    expect(Number.isFinite(normalizedAsimov!.zones[0].hexS)).toBe(true);
    expect(normalizedAsimov!.zones[0].insolationBand).toBeTruthy();
    expect(normalizedAsimov!.zones[0].atmosphericGases).toBeTruthy();
  });

  it('preserves player progression zone fields while normalizing structure', () => {
    const planets = generateTRAPPIST1System();
    const broken = structuredClone(planets);

    const asimov = broken.find((planet) => planet.id === 'asimov');
    if (!asimov) throw new Error('expected Asimov in generated planets');

    asimov.zones[0].state = 'harvesting';
    asimov.zones[0].progress = 72;
    asimov.zones[0].biomassAvailable = 4321;
    asimov.zones[0].hexQ = Number.NaN;

    const normalized = normalizePlanetsFromSave(broken);
    const zone = normalized.find((planet) => planet.id === 'asimov')!.zones[0];

    expect(zone.state).toBe('harvesting');
    expect(zone.progress).toBe(72);
    expect(zone.biomassAvailable).toBe(4321);
    expect(Number.isFinite(zone.hexQ)).toBe(true);
  });
});
