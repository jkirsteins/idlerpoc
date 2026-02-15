import type {
  AtmosphereState,
  InsolationBand,
  Planet,
  ZoneAtmosphereGases,
} from './models/swarmTypes';

export interface InsolationBandSummary {
  band: InsolationBand;
  zones: number;
  totalMass: number;
  massShare: number;
  averageMass: number;
  dominantAtmosphere: AtmosphereState;
}

export interface ZoneAtmosphereContribution {
  zoneId: string;
  zoneName: string;
  band: InsolationBand;
  biome: string;
  mass: number;
  massShare: number;
}

export interface PlanetAtmosphereSummary {
  totalMass: number;
  pressureIndex: number;
  composition: ZoneAtmosphereGases;
  compositionMass: ZoneAtmosphereGases;
  bandSummaries: InsolationBandSummary[];
  topContributors: ZoneAtmosphereContribution[];
}

const BANDS: InsolationBand[] = ['light', 'terminator', 'dark'];
const ATMOSPHERE_ORDER: AtmosphereState[] = ['thick', 'thin', 'none'];

function normalizeComposition(
  values: ZoneAtmosphereGases
): ZoneAtmosphereGases {
  const total = values.n2 + values.co2 + values.o2 + values.ch4 + values.inert;
  if (total <= 0) {
    return { n2: 1, co2: 0, o2: 0, ch4: 0, inert: 0 };
  }

  return {
    n2: values.n2 / total,
    co2: values.co2 / total,
    o2: values.o2 / total,
    ch4: values.ch4 / total,
    inert: values.inert / total,
  };
}

function dominantAtmosphere(states: AtmosphereState[]): AtmosphereState {
  const counts = new Map<AtmosphereState, number>();
  for (const state of states) {
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }

  let dominant: AtmosphereState = 'none';
  let maxCount = -1;

  for (const state of ATMOSPHERE_ORDER) {
    const count = counts.get(state) ?? 0;
    if (count > maxCount) {
      maxCount = count;
      dominant = state;
    }
  }

  return dominant;
}

export function derivePlanetAtmosphere(
  planet: Planet
): PlanetAtmosphereSummary {
  const totalMass = planet.zones.reduce(
    (sum, zone) => sum + Math.max(0, zone.atmosphericMass),
    0
  );

  const compositionMass: ZoneAtmosphereGases = {
    n2: 0,
    co2: 0,
    o2: 0,
    ch4: 0,
    inert: 0,
  };

  for (const zone of planet.zones) {
    const zoneMass = Math.max(0, zone.atmosphericMass);
    compositionMass.n2 += zoneMass * zone.atmosphericGases.n2;
    compositionMass.co2 += zoneMass * zone.atmosphericGases.co2;
    compositionMass.o2 += zoneMass * zone.atmosphericGases.o2;
    compositionMass.ch4 += zoneMass * zone.atmosphericGases.ch4;
    compositionMass.inert += zoneMass * zone.atmosphericGases.inert;
  }

  const pressureIndex =
    planet.zones.length > 0 ? totalMass / planet.zones.length : 0;

  const bandSummaries = BANDS.map((band) => {
    const zones = planet.zones.filter((zone) => zone.insolationBand === band);
    const massTotal = zones.reduce(
      (sum, zone) => sum + zone.atmosphericMass,
      0
    );

    return {
      band,
      zones: zones.length,
      totalMass: massTotal,
      massShare: totalMass > 0 ? massTotal / totalMass : 0,
      averageMass: zones.length > 0 ? massTotal / zones.length : 0,
      dominantAtmosphere: dominantAtmosphere(
        zones.map((zone) => zone.atmosphere)
      ),
    };
  });

  const topContributors = [...planet.zones]
    .sort((a, b) => b.atmosphericMass - a.atmosphericMass)
    .slice(0, 8)
    .map((zone) => ({
      zoneId: zone.id,
      zoneName: zone.name,
      band: zone.insolationBand,
      biome: zone.biome,
      mass: zone.atmosphericMass,
      massShare: totalMass > 0 ? zone.atmosphericMass / totalMass : 0,
    }));

  return {
    totalMass,
    pressureIndex,
    composition: normalizeComposition(compositionMass),
    compositionMass,
    bandSummaries,
    topContributors,
  };
}
