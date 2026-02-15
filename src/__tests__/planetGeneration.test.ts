import { describe, expect, it } from 'vitest';

import { derivePlanetAtmosphere } from '../planetAtmosphere';
import { generateTRAPPIST1System } from '../trappist1Data';

function zoneGasTotal(zone: {
  atmosphericGases: {
    n2: number;
    co2: number;
    o2: number;
    ch4: number;
    inert: number;
  };
}): number {
  return (
    zone.atmosphericGases.n2 +
    zone.atmosphericGases.co2 +
    zone.atmosphericGases.o2 +
    zone.atmosphericGases.ch4 +
    zone.atmosphericGases.inert
  );
}

describe('planet generation', () => {
  it('is deterministic for seeded planets', () => {
    const first = generateTRAPPIST1System();
    const second = generateTRAPPIST1System();

    const firstAsimov = first.find((planet) => planet.id === 'asimov');
    const secondAsimov = second.find((planet) => planet.id === 'asimov');

    expect(firstAsimov).toBeTruthy();
    expect(secondAsimov).toBeTruthy();

    const firstSignature = firstAsimov!.zones
      .map(
        (zone) =>
          `${zone.id}|${zone.hexQ},${zone.hexR}|${zone.biome}|${zone.insolationBand}|${zone.terrainType}|${zone.atmosphericMass.toFixed(4)}`
      )
      .join('\n');
    const secondSignature = secondAsimov!.zones
      .map(
        (zone) =>
          `${zone.id}|${zone.hexQ},${zone.hexR}|${zone.biome}|${zone.insolationBand}|${zone.terrainType}|${zone.atmosphericMass.toFixed(4)}`
      )
      .join('\n');

    expect(firstSignature).toBe(secondSignature);
  });

  it('produces contiguous zone blobs', () => {
    const planets = generateTRAPPIST1System();
    const asimov = planets.find((planet) => planet.id === 'asimov');
    expect(asimov).toBeTruthy();

    const startZone = asimov!.zones[0];
    const zoneById = new Map(asimov!.zones.map((zone) => [zone.id, zone]));
    const visited = new Set<string>();
    const stack = [startZone.id];

    while (stack.length > 0) {
      const zoneId = stack.pop();
      if (!zoneId || visited.has(zoneId)) continue;
      visited.add(zoneId);
      const zone = zoneById.get(zoneId);
      if (!zone) continue;
      for (const neighborId of zone.neighborIds) {
        if (!visited.has(neighborId)) stack.push(neighborId);
      }
    }

    expect(visited.size).toBe(asimov!.zones.length);
  });

  it('creates clustered biomes and all insolation bands', () => {
    const planets = generateTRAPPIST1System();
    const asimov = planets.find((planet) => planet.id === 'asimov');
    expect(asimov).toBeTruthy();

    const zoneById = new Map(asimov!.zones.map((zone) => [zone.id, zone]));

    const bands = new Set(asimov!.zones.map((zone) => zone.insolationBand));
    expect(bands.has('light')).toBe(true);
    expect(bands.has('terminator')).toBe(true);
    expect(bands.has('dark')).toBe(true);

    let sameBiomeNeighborEdges = 0;
    let totalNeighborEdges = 0;

    for (const zone of asimov!.zones) {
      for (const neighborId of zone.neighborIds) {
        if (zone.id > neighborId) continue;
        const neighbor = zoneById.get(neighborId);
        if (!neighbor) continue;
        totalNeighborEdges++;
        if (neighbor.biome === zone.biome) {
          sameBiomeNeighborEdges++;
        }
      }
    }

    const clusteredRatio =
      totalNeighborEdges > 0 ? sameBiomeNeighborEdges / totalNeighborEdges : 0;
    expect(clusteredRatio).toBeGreaterThan(0.35);
  });

  it('generates dramatic irregular silhouettes instead of compact hex disks', () => {
    const planets = generateTRAPPIST1System();
    const asimov = planets.find((planet) => planet.id === 'asimov');
    expect(asimov).toBeTruthy();

    const centerQ =
      asimov!.zones.reduce((sum, zone) => sum + zone.hexQ, 0) /
      asimov!.zones.length;
    const centerR =
      asimov!.zones.reduce((sum, zone) => sum + zone.hexR, 0) /
      asimov!.zones.length;

    const radii = asimov!.zones.map((zone) =>
      Math.sqrt(
        (zone.hexQ - centerQ) * (zone.hexQ - centerQ) +
          (zone.hexR - centerR) * (zone.hexR - centerR)
      )
    );
    const meanRadius =
      radii.reduce((sum, value) => sum + value, 0) / radii.length;
    const variance =
      radii.reduce((sum, value) => {
        const diff = value - meanRadius;
        return sum + diff * diff;
      }, 0) / radii.length;
    const radiusStdDev = Math.sqrt(variance);
    const roughness = meanRadius > 0 ? radiusStdDev / meanRadius : 0;

    expect(roughness).toBeGreaterThan(0.2);
  });

  it('keeps zone and planet atmosphere values normalized', () => {
    const planets = generateTRAPPIST1System();
    const asimov = planets.find((planet) => planet.id === 'asimov');
    expect(asimov).toBeTruthy();

    for (const zone of asimov!.zones) {
      expect(zone.atmosphericMass).toBeGreaterThan(0);
      expect(zoneGasTotal(zone)).toBeCloseTo(1, 6);
    }

    const summary = derivePlanetAtmosphere(asimov!);
    const compositionTotal =
      summary.composition.n2 +
      summary.composition.co2 +
      summary.composition.o2 +
      summary.composition.ch4 +
      summary.composition.inert;

    expect(summary.totalMass).toBeGreaterThan(0);
    expect(summary.pressureIndex).toBeGreaterThan(0);
    expect(compositionTotal).toBeCloseTo(1, 6);
  });
});
