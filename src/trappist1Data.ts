// TRAPPIST-1 Planet Data and Generation

import type {
  Planet,
  Zone,
  Moon,
  AtmosphereState,
  InsolationBand,
  ZoneAtmosphereGases,
  ZoneBiome,
} from './models/swarmTypes';
import { generateZoneName } from './models/swarmTypes';

// Planet definitions with real characteristics
// Zone View Design: Radial Sector Grid
// The zone view displays zones as sectors radiating from the center (queen position).
// Each zone is represented as a pie slice with the queen at the center vertex.
// This creates a natural "territory" visualization where:
// - Angular position represents different sectors/directions from the queen
// - Radial distance represents depth into the zone (inner = near queen, outer = far)
// - Workers appear as dots within their assigned zone sectors
// - Zone state is shown by sector color (unexplored=dark, harvesting=green, etc.)
// This design choice prioritizes clarity and fits the organic swarm theme.
export interface PlanetDefinition {
  id: string;
  name: string;
  trappistId: string;
  distanceAU: number;
  orbitalPeriod: number; // Earth days
  eccentricity: number; // Real orbital eccentricity
  description: string;
  baseBiomassRate: number;
  predatorBaseStrength: number;
  moonCount: number;
}

export const TRAPPIST1_PLANETS: PlanetDefinition[] = [
  {
    id: 'roche',
    name: 'Roche',
    trappistId: 'b',
    distanceAU: 0.011,
    orbitalPeriod: 1.51,
    eccentricity: 0.006,
    description:
      'Tidally locked hellscape. Dayside temperatures exceed 1000°C.',
    baseBiomassRate: 0.05,
    predatorBaseStrength: 900,
    moonCount: 0,
  },
  {
    id: 'pinter',
    name: 'Pinter',
    trappistId: 'c',
    distanceAU: 0.015,
    orbitalPeriod: 2.42,
    eccentricity: 0.007,
    description: 'Scorching heat with potential thin atmosphere.',
    baseBiomassRate: 0.1,
    predatorBaseStrength: 600,
    moonCount: 1,
  },
  {
    id: 'tarter',
    name: 'Tarter',
    trappistId: 'd',
    distanceAU: 0.021,
    orbitalPeriod: 4.05,
    eccentricity: 0.008,
    description: 'Warm edge of habitable zone.',
    baseBiomassRate: 0.3,
    predatorBaseStrength: 300,
    moonCount: 1,
  },
  {
    id: 'asimov',
    name: 'Asimov',
    trappistId: 'e',
    distanceAU: 0.028,
    orbitalPeriod: 6.1,
    eccentricity: 0.005,
    description:
      'Most Earth-like. Temperate conditions, liquid water possible.',
    baseBiomassRate: 0.5,
    predatorBaseStrength: 50,
    moonCount: 2,
  },
  {
    id: 'heinlein',
    name: 'Heinlein',
    trappistId: 'f',
    distanceAU: 0.037,
    orbitalPeriod: 9.21,
    eccentricity: 0.011,
    description: 'Cold world with potential water ice and frozen surface.',
    baseBiomassRate: 0.3,
    predatorBaseStrength: 200,
    moonCount: 2,
  },
  {
    id: 'clarke',
    name: 'Clarke',
    trappistId: 'g',
    distanceAU: 0.045,
    orbitalPeriod: 12.35,
    eccentricity: 0.002,
    description:
      'Icy world with thick ice shell and possible subsurface ocean.',
    baseBiomassRate: 0.2,
    predatorBaseStrength: 500,
    moonCount: 3,
  },
  {
    id: 'lewis',
    name: 'Lewis',
    trappistId: 'h',
    distanceAU: 0.063,
    orbitalPeriod: 18.77,
    eccentricity: 0.086,
    description: 'Frozen wasteland on outer edge of system.',
    baseBiomassRate: 0.1,
    predatorBaseStrength: 800,
    moonCount: 3,
  },
];

// Generate moon names
function generateMoons(planetId: string, count: number): Moon[] {
  const moons: Moon[] = [];
  const greekLetters = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

  for (let i = 0; i < count; i++) {
    moons.push({
      id: `${planetId}-moon-${i}`,
      name: `${greekLetters[i]}`,
      distance: 10000 + i * 5000, // Arbitrary distance units
    });
  }

  return moons;
}

// ============================================================================
// ZONE GENERATION CONFIGURATION
// ============================================================================

interface ZoneGridConfig {
  cols: number;
  rows: number;
  totalZones: number;
  hexSize: number;
}

const DEFAULT_ZONE_CONFIG: ZoneGridConfig = {
  cols: 24,
  rows: 16,
  totalZones: 384,
  hexSize: 20,
};

// Atmosphere thresholds (based on temperature)
const ATMOSPHERE_THRESHOLDS = {
  thick: 250, // Above this: thick atmosphere
  thin: 150, // Above this: thin atmosphere
  none: 150, // Below this: no atmosphere (cold trap)
};

// ============================================================================
// HEX GRID UTILITIES
// ============================================================================

// Convert hex axial coords to pixel coords (for rendering)
function hexToPixel(
  q: number,
  r: number,
  size: number
): { x: number; y: number } {
  const x = size * (3 / 2) * q;
  const y = size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3)) * r;
  return { x, y };
}
void hexToPixel; // Reserved for future planet map rendering

function getHexNeighbors(
  q: number,
  r: number
): Array<{ q: number; r: number }> {
  const directions = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  return directions.map((d) => ({ q: q + d.q, r: r + d.r }));
}

// Calculate hex grid distance (for pathfinding)
function getHexDistance(
  a: { q: number; r: number },
  b: { q: number; r: number }
): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}
void getHexDistance; // Reserved for future pathfinding

function toCoordKey(q: number, r: number): string {
  return `${q},${r}`;
}

function fromCoordKey(key: string): { q: number; r: number } {
  const [qStr, rStr] = key.split(',');
  return { q: Number(qStr), r: Number(rStr) };
}

function coordinateNoise(q: number, r: number, seed: number): number {
  let hash = (q * 374761393 + r * 668265263 + seed * 362437) | 0;
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function smoothField(
  positions: Array<{ q: number; r: number }>,
  valueByKey: Map<string, number>,
  passes: number
): Map<string, number> {
  let current = valueByKey;

  for (let pass = 0; pass < passes; pass++) {
    const next = new Map<string, number>();

    for (const position of positions) {
      const key = toCoordKey(position.q, position.r);
      let total = current.get(key) ?? 0;
      let count = 1;

      for (const neighbor of getHexNeighbors(position.q, position.r)) {
        const neighborKey = toCoordKey(neighbor.q, neighbor.r);
        const neighborValue = current.get(neighborKey);
        if (neighborValue === undefined) continue;
        total += neighborValue;
        count++;
      }

      next.set(key, total / count);
    }

    current = next;
  }

  return current;
}

// ============================================================================
// ZONE GENERATION
// ============================================================================

function getInsolationBand(normalizedQ: number): InsolationBand {
  if (normalizedQ <= -0.33) return 'light';
  if (normalizedQ >= 0.33) return 'dark';
  return 'terminator';
}

function calculateTemperature(
  insolationBand: InsolationBand,
  latitudeNormalized: number,
  planetDef: PlanetDefinition,
  rng: () => number
): {
  temperatureZone: Zone['temperatureZone'];
  tempKelvin: number;
} {
  const baseTempByDistance: Record<string, number> = {
    b: 450,
    c: 380,
    d: 320,
    e: 280,
    f: 240,
    g: 200,
    h: 160,
  };
  const baseTemp = baseTempByDistance[planetDef.trappistId] ?? 250;

  const latitudeCooling = 1 - Math.min(1, Math.abs(latitudeNormalized));
  let tempKelvin = baseTemp;

  if (insolationBand === 'light') {
    tempKelvin += 65;
  } else if (insolationBand === 'terminator') {
    tempKelvin -= 15;
  } else {
    tempKelvin -= 95;
  }

  tempKelvin += latitudeCooling * 30;
  tempKelvin += (rng() - 0.5) * 25;

  if (tempKelvin >= 340) return { temperatureZone: 'hot', tempKelvin };
  if (tempKelvin >= 285) return { temperatureZone: 'warm', tempKelvin };
  if (tempKelvin >= 240) return { temperatureZone: 'temperate', tempKelvin };
  if (tempKelvin >= 160) return { temperatureZone: 'cold', tempKelvin };
  return { temperatureZone: 'frozen', tempKelvin };
}

function deriveAtmosphere(temperatureKelvin: number): AtmosphereState {
  if (temperatureKelvin >= ATMOSPHERE_THRESHOLDS.thick) return 'thick';
  if (temperatureKelvin >= ATMOSPHERE_THRESHOLDS.thin) return 'thin';
  return 'none';
}

function chooseBiome(
  insolationBand: InsolationBand,
  temperatureZone: Zone['temperatureZone'],
  moisture: number,
  mineral: number
): ZoneBiome {
  if (mineral > 0.77) return 'mineral-ridge';
  if (insolationBand === 'light' && temperatureZone === 'hot') {
    return 'sunscorch';
  }
  if (
    insolationBand === 'dark' &&
    (temperatureZone === 'cold' || temperatureZone === 'frozen')
  ) {
    return 'night-ice';
  }
  if (moisture > 0.62 && insolationBand !== 'light') return 'twilight-marsh';
  if (moisture > 0.5) return 'temperate-basin';
  return 'barren-plain';
}

function selectTerrain(
  biome: ZoneBiome,
  temperatureZone: Zone['temperatureZone'],
  moisture: number,
  rng: () => number
): Zone['terrainType'] {
  const roll = rng();

  if (biome === 'night-ice') return roll < 0.82 ? 'ice' : 'soil';
  if (biome === 'sunscorch') return roll < 0.9 ? 'soil' : 'ice';
  if (biome === 'twilight-marsh') {
    if (roll < 0.52) return 'liquid';
    if (roll < 0.9) return 'soil';
    return 'ice';
  }
  if (biome === 'temperate-basin') {
    if (roll < 0.32) return 'liquid';
    if (roll < 0.88) return 'soil';
    return 'ice';
  }

  if (temperatureZone === 'frozen') return 'ice';
  if (moisture > 0.7 && roll < 0.35) return 'liquid';
  return roll < 0.82 ? 'soil' : 'ice';
}

function normalizeGasFractions(
  gases: ZoneAtmosphereGases
): ZoneAtmosphereGases {
  const raw = {
    n2: Math.max(0, gases.n2),
    co2: Math.max(0, gases.co2),
    o2: Math.max(0, gases.o2),
    ch4: Math.max(0, gases.ch4),
    inert: Math.max(0, gases.inert),
  };

  const total = raw.n2 + raw.co2 + raw.o2 + raw.ch4 + raw.inert;
  if (total <= 0) {
    return { n2: 1, co2: 0, o2: 0, ch4: 0, inert: 0 };
  }

  return {
    n2: raw.n2 / total,
    co2: raw.co2 / total,
    o2: raw.o2 / total,
    ch4: raw.ch4 / total,
    inert: raw.inert / total,
  };
}

function createAtmosphericGases(
  planetDef: PlanetDefinition,
  insolationBand: InsolationBand,
  terrainType: Zone['terrainType'],
  biome: ZoneBiome,
  rng: () => number
): ZoneAtmosphereGases {
  const planetProfiles: Record<string, ZoneAtmosphereGases> = {
    b: { n2: 0.62, co2: 0.28, o2: 0.02, ch4: 0.02, inert: 0.06 },
    c: { n2: 0.66, co2: 0.2, o2: 0.03, ch4: 0.04, inert: 0.07 },
    d: { n2: 0.71, co2: 0.16, o2: 0.04, ch4: 0.03, inert: 0.06 },
    e: { n2: 0.74, co2: 0.1, o2: 0.07, ch4: 0.03, inert: 0.06 },
    f: { n2: 0.72, co2: 0.13, o2: 0.05, ch4: 0.03, inert: 0.07 },
    g: { n2: 0.7, co2: 0.15, o2: 0.04, ch4: 0.03, inert: 0.08 },
    h: { n2: 0.67, co2: 0.17, o2: 0.03, ch4: 0.05, inert: 0.08 },
  };

  const profile = planetProfiles[planetDef.trappistId] ?? {
    n2: 0.72,
    co2: 0.13,
    o2: 0.05,
    ch4: 0.03,
    inert: 0.07,
  };

  const gases: ZoneAtmosphereGases = { ...profile };

  if (insolationBand === 'light') {
    gases.co2 += 0.02;
    gases.ch4 -= 0.015;
    gases.o2 += 0.01;
  } else if (insolationBand === 'dark') {
    gases.ch4 += 0.03;
    gases.o2 -= 0.015;
  }

  if (terrainType === 'liquid') gases.o2 += 0.01;
  if (biome === 'mineral-ridge') gases.inert += 0.02;
  if (biome === 'night-ice') gases.co2 += 0.01;

  gases.co2 += (rng() - 0.5) * 0.01;
  gases.ch4 += (rng() - 0.5) * 0.008;
  gases.o2 += (rng() - 0.5) * 0.006;

  return normalizeGasFractions(gases);
}

function estimateAtmosphericMass(
  planetDef: PlanetDefinition,
  temperatureKelvin: number,
  atmosphere: AtmosphereState,
  insolationBand: InsolationBand,
  terrainType: Zone['terrainType'],
  rng: () => number
): number {
  const baseByPlanet: Record<string, number> = {
    b: 0.7,
    c: 0.85,
    d: 1,
    e: 1.2,
    f: 1.1,
    g: 0.95,
    h: 0.8,
  };
  let mass = baseByPlanet[planetDef.trappistId] ?? 1;

  if (atmosphere === 'thick') mass *= 1.1;
  else if (atmosphere === 'thin') mass *= 0.85;
  else mass *= 0.3;

  if (insolationBand === 'light') mass *= 0.95;
  if (insolationBand === 'dark') mass *= 1.05;
  if (terrainType === 'liquid') mass *= 1.08;
  if (temperatureKelvin < 130) mass *= 0.75;

  mass *= 0.9 + rng() * 0.2;
  return Math.max(0.05, mass);
}

function connectedComponentFrom(
  startKey: string,
  selected: Set<string>
): Set<string> {
  const visited = new Set<string>();
  const stack = [startKey];

  while (stack.length > 0) {
    const key = stack.pop();
    if (!key || visited.has(key) || !selected.has(key)) continue;
    visited.add(key);

    const { q, r } = fromCoordKey(key);
    for (const neighbor of getHexNeighbors(q, r)) {
      const neighborKey = toCoordKey(neighbor.q, neighbor.r);
      if (!visited.has(neighborKey) && selected.has(neighborKey)) {
        stack.push(neighborKey);
      }
    }
  }

  return visited;
}

function largestConnectedComponent(selected: Set<string>): Set<string> {
  const unvisited = new Set(selected);
  let largest = new Set<string>();

  for (const key of selected) {
    if (!unvisited.has(key)) continue;

    const component = connectedComponentFrom(key, selected);
    for (const entry of component) unvisited.delete(entry);

    if (component.size > largest.size) {
      largest = component;
    }
  }

  return largest;
}

function countSelectedNeighbors(key: string, selected: Set<string>): number {
  const { q, r } = fromCoordKey(key);
  let count = 0;
  for (const neighbor of getHexNeighbors(q, r)) {
    if (selected.has(toCoordKey(neighbor.q, neighbor.r))) count++;
  }
  return count;
}

function canRemoveWithoutDisconnect(
  key: string,
  selected: Set<string>
): boolean {
  if (!selected.has(key)) return false;
  if (selected.size <= 1) return false;

  const copy = new Set(selected);
  copy.delete(key);
  const remaining = copy.values().next().value;
  if (typeof remaining !== 'string') return false;

  const component = connectedComponentFrom(remaining, copy);
  return component.size === copy.size;
}

function generateOrganicHexBlob(
  targetCount: number,
  rng: () => number
): Array<{ q: number; r: number; s: number }> {
  const canvasRadius = Math.max(18, Math.ceil(Math.sqrt(targetCount) * 1.9));

  const lobeCenters = Array.from({ length: 4 }, () => {
    const angle = rng() * Math.PI * 2;
    const dist = canvasRadius * (0.25 + rng() * 0.55);
    return {
      q: Math.cos(angle) * dist,
      r: Math.sin(angle) * dist,
      sigma: canvasRadius * (0.28 + rng() * 0.18),
      weight: 0.75 + rng() * 0.5,
    };
  });

  const scoreByKey = new Map<string, number>();
  const candidates: string[] = [];

  for (let q = -canvasRadius; q <= canvasRadius; q++) {
    for (let r = -canvasRadius; r <= canvasRadius; r++) {
      const s = -q - r;
      const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (dist > canvasRadius) continue;

      const warpQ =
        (coordinateNoise(q, r, 907) - 0.5) * 6 +
        (coordinateNoise(q * 2, r * 2, 941) - 0.5) * 2.5;
      const warpR =
        (coordinateNoise(q, r, 1031) - 0.5) * 6 +
        (coordinateNoise(q * 2, r * 2, 1117) - 0.5) * 2.5;

      const low = coordinateNoise(
        Math.floor((q + warpQ) * 0.32),
        Math.floor((r + warpR) * 0.32),
        1301
      );
      const mid = coordinateNoise(
        Math.floor((q + warpQ) * 0.75),
        Math.floor((r + warpR) * 0.75),
        1459
      );
      const ridge = 1 - Math.abs(mid * 2 - 1);
      const jag = coordinateNoise(q * 3, r * 3, 1597);

      let lobeInfluence = 0;
      for (const lobe of lobeCenters) {
        const dq = q - lobe.q;
        const dr = r - lobe.r;
        const d2 = dq * dq + dr * dr;
        const influence = Math.exp(-d2 / (2 * lobe.sigma * lobe.sigma));
        lobeInfluence = Math.max(lobeInfluence, influence * lobe.weight);
      }

      const distNorm = dist / canvasRadius;
      const radialPenalty = Math.pow(distNorm, 1.6) * 0.72;

      const score =
        low * 0.62 +
        ridge * 0.2 +
        lobeInfluence * 0.46 +
        jag * 0.08 -
        radialPenalty;

      const key = toCoordKey(q, r);
      scoreByKey.set(key, score);
      candidates.push(key);
    }
  }

  candidates.sort(
    (a, b) => (scoreByKey.get(b) ?? 0) - (scoreByKey.get(a) ?? 0)
  );

  const preselectCount = Math.min(
    candidates.length,
    Math.max(targetCount + 80, Math.floor(targetCount * 1.5))
  );
  let selected = new Set(candidates.slice(0, preselectCount));
  selected = largestConnectedComponent(selected);

  for (let pass = 0; pass < 3; pass++) {
    const removable = [...selected].filter(
      (key) => countSelectedNeighbors(key, selected) <= 3
    );
    removable.sort(
      (a, b) => (scoreByKey.get(a) ?? 0) - (scoreByKey.get(b) ?? 0)
    );

    const removals = Math.min(
      Math.floor(targetCount * 0.08),
      Math.max(0, selected.size - targetCount)
    );
    let removed = 0;

    for (const key of removable) {
      if (removed >= removals) break;
      if (!canRemoveWithoutDisconnect(key, selected)) continue;
      selected.delete(key);
      removed++;
    }
  }

  while (selected.size < targetCount) {
    const frontier = new Map<string, number>();

    for (const key of selected) {
      const { q, r } = fromCoordKey(key);
      for (const neighbor of getHexNeighbors(q, r)) {
        const neighborKey = toCoordKey(neighbor.q, neighbor.r);
        if (selected.has(neighborKey) || !scoreByKey.has(neighborKey)) continue;
        const neighborCount = countSelectedNeighbors(neighborKey, selected);
        const edgeBias = 0.35 - Math.abs(neighborCount - 2) * 0.16;
        const candidateScore = (scoreByKey.get(neighborKey) ?? 0) + edgeBias;
        const existing = frontier.get(neighborKey);
        if (existing === undefined || candidateScore > existing) {
          frontier.set(neighborKey, candidateScore);
        }
      }
    }

    const options = [...frontier.entries()].sort((a, b) => b[1] - a[1]);
    if (options.length === 0) break;

    const topSlice = options.slice(0, Math.min(8, options.length));
    const weightedTotal = topSlice.reduce(
      (sum, [, weight]) => sum + Math.max(0.0001, weight + 1),
      0
    );
    let roll = rng() * weightedTotal;
    let selectedKey = topSlice[0][0];
    for (const [key, weight] of topSlice) {
      roll -= Math.max(0.0001, weight + 1);
      if (roll <= 0) {
        selectedKey = key;
        break;
      }
    }

    selected.add(selectedKey);
  }

  if (selected.size > targetCount) {
    const removable = [...selected]
      .filter((key) => countSelectedNeighbors(key, selected) <= 4)
      .sort((a, b) => (scoreByKey.get(a) ?? 0) - (scoreByKey.get(b) ?? 0));

    for (const key of removable) {
      if (selected.size <= targetCount) break;
      if (!canRemoveWithoutDisconnect(key, selected)) continue;
      selected.delete(key);
    }
  }

  return [...selected].map((key) => {
    const { q, r } = fromCoordKey(key);
    return { q, r, s: -q - r };
  });
}

// Simple seeded random number generator
function createRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function generateZones(planetDef: PlanetDefinition): Zone[] {
  const config = DEFAULT_ZONE_CONFIG;
  const zones: Zone[] = [];
  const rng = createRng(
    planetDef.id.charCodeAt(0) * 1000 + planetDef.id.length
  );

  const hexPositions = generateOrganicHexBlob(config.totalZones, rng);
  const minQ = Math.min(...hexPositions.map((hex) => hex.q));
  const maxQ = Math.max(...hexPositions.map((hex) => hex.q));
  const minR = Math.min(...hexPositions.map((hex) => hex.r));
  const maxR = Math.max(...hexPositions.map((hex) => hex.r));
  const midQ = (minQ + maxQ) / 2;
  const spanQ = Math.max(1, (maxQ - minQ) / 2);
  const midR = (minR + maxR) / 2;
  const spanR = Math.max(1, (maxR - minR) / 2);

  const fieldPositions = hexPositions.map((hex) => ({ q: hex.q, r: hex.r }));
  const moistureRaw = new Map<string, number>();
  const mineralRaw = new Map<string, number>();

  for (const hex of hexPositions) {
    const key = toCoordKey(hex.q, hex.r);
    const moisture =
      0.65 * coordinateNoise(hex.q, hex.r, 11 + planetDef.id.length) +
      0.35 *
        coordinateNoise(
          Math.floor(hex.q * 0.5),
          Math.floor(hex.r * 0.5),
          29 + planetDef.id.charCodeAt(0)
        );
    const mineralBase =
      0.5 * coordinateNoise(hex.q, hex.r, 73 + planetDef.id.length) +
      0.5 *
        coordinateNoise(
          Math.floor(hex.q * 0.35),
          Math.floor(hex.r * 0.35),
          131 + planetDef.id.charCodeAt(0)
        );
    const mineralRidged = 1 - Math.abs(mineralBase * 2 - 1);

    moistureRaw.set(key, moisture);
    mineralRaw.set(key, mineralRidged);
  }

  const moistureField = smoothField(fieldPositions, moistureRaw, 2);
  const mineralField = smoothField(fieldPositions, mineralRaw, 2);

  // Create zone for each hex position
  for (const hex of hexPositions) {
    const normalizedQ = (hex.q - midQ) / spanQ;
    const latitudeNormalized = (hex.r - midR) / spanR;
    const insolationSignal =
      normalizedQ +
      latitudeNormalized * 0.08 +
      (coordinateNoise(hex.q, hex.r, 1709 + planetDef.id.charCodeAt(0)) - 0.5) *
        0.22;
    const insolationBand = getInsolationBand(insolationSignal);
    const { temperatureZone, tempKelvin } = calculateTemperature(
      insolationBand,
      latitudeNormalized,
      planetDef,
      rng
    );

    const moisture = moistureField.get(toCoordKey(hex.q, hex.r)) ?? 0.5;
    const mineral = mineralField.get(toCoordKey(hex.q, hex.r)) ?? 0.5;
    const biome = chooseBiome(
      insolationBand,
      temperatureZone,
      moisture,
      mineral
    );

    const atmosphere = deriveAtmosphere(tempKelvin);
    const terrainType = selectTerrain(biome, temperatureZone, moisture, rng);
    const atmosphericMass = estimateAtmosphericMass(
      planetDef,
      tempKelvin,
      atmosphere,
      insolationBand,
      terrainType,
      rng
    );
    const atmosphericGases = createAtmosphericGases(
      planetDef,
      insolationBand,
      terrainType,
      biome,
      rng
    );
    const hasMineralVein = mineral > 0.72;

    // Calculate biomass rate based on environment
    let biomassRate = planetDef.baseBiomassRate;

    // Temperature bonus/penalty
    if (temperatureZone === 'temperate') biomassRate *= 1.2;
    else if (temperatureZone === 'hot') biomassRate *= 0.8;
    else if (temperatureZone === 'cold') biomassRate *= 0.6;
    else if (temperatureZone === 'frozen') biomassRate *= 0.2;

    // Terrain bonus
    if (terrainType === 'liquid') biomassRate *= 1.3;
    else if (terrainType === 'ice') biomassRate *= 0.5;

    if (biome === 'twilight-marsh') biomassRate *= 1.2;
    if (biome === 'sunscorch') biomassRate *= 0.75;
    if (biome === 'night-ice') biomassRate *= 0.6;
    if (biome === 'mineral-ridge') biomassRate *= 0.9;

    // Atmosphere bonus
    if (atmosphere === 'thick') biomassRate *= 1.2;
    else if (atmosphere === 'thin') biomassRate *= 0.8;
    else if (atmosphere === 'none') biomassRate *= 0.4;

    // Add some randomness
    biomassRate *= 0.8 + rng() * 0.4;

    // Predator strength varies by environment
    let predatorStrength = planetDef.predatorBaseStrength;
    if (temperatureZone === 'hot') predatorStrength *= 1.3;
    else if (temperatureZone === 'frozen') predatorStrength *= 0.7;
    if (terrainType === 'liquid') predatorStrength *= 1.2;
    if (hasMineralVein) predatorStrength *= 1.1;
    predatorStrength = Math.floor(predatorStrength * (0.8 + rng() * 0.4));

    const zoneId = zones.length;
    const seed = zoneId;

    zones.push({
      id: `${planetDef.id}-zone-${zoneId}`,
      name: generateZoneName(seed),
      planetId: planetDef.id,
      continentId: `${planetDef.id}-continent-${Math.floor(zoneId / 64)}`,
      regionId: `${planetDef.id}-region-${Math.floor((zoneId % 64) / 8)}`,
      state: 'unexplored',
      progress: 0,
      ownedBySwarm: false,
      biomassRate,
      biomassAvailable: Math.floor(biomassRate * 1000),
      predators: {
        strength: predatorStrength,
        defeated: false,
      },
      assignedWorkers: [],

      // Hex grid coordinates
      hexQ: hex.q,
      hexR: hex.r,
      hexS: hex.s,

      // Environment
      terrainType,
      temperatureZone,
      temperatureKelvin: Math.round(tempKelvin),
      atmosphere,
      insolationBand,
      biome,
      hasMineralVein,
      atmosphericMass,
      atmosphericGases,

      // Neighbors (filled after all zones created)
      neighborIds: [],

      // Legacy indices
      continentIndex: Math.floor(zoneId / 64),
      regionIndex: Math.floor((zoneId % 64) / 8),
      zoneIndex: zoneId % 8,
    });
  }

  // Fill in neighbor connections
  const zoneMap = new Map<string, Zone>();
  const zoneByCoord = new Map<string, Zone>();
  for (const zone of zones) {
    zoneMap.set(zone.id, zone);
    zoneByCoord.set(toCoordKey(zone.hexQ, zone.hexR), zone);
  }
  void zoneMap;

  for (const zone of zones) {
    const neighbors = getHexNeighbors(zone.hexQ, zone.hexR);
    for (const n of neighbors) {
      const neighbor = zoneByCoord.get(toCoordKey(n.q, n.r));
      if (neighbor) {
        zone.neighborIds.push(neighbor.id);
      }
    }
  }

  return zones;
}

// Export config for tweaking
export const ZONE_CONFIG = DEFAULT_ZONE_CONFIG;

// Convert AU to kilometers
const AU_IN_KM = 149_597_870.7;

// Generate complete TRAPPIST-1 system
export function generateTRAPPIST1System(): Planet[] {
  const planets: Planet[] = [];

  for (const planetDef of TRAPPIST1_PLANETS) {
    // Calculate initial orbital angle (distribute evenly for visual variety)
    const initialAngleRad =
      (planets.length / TRAPPIST1_PLANETS.length) * Math.PI * 2;
    const semiMajorAxisKm = planetDef.distanceAU * AU_IN_KM;

    // Calculate initial position using orbital mechanics
    const e = planetDef.eccentricity;
    const r =
      e === 0
        ? semiMajorAxisKm
        : (semiMajorAxisKm * (1 - e * e)) / (1 + e * Math.cos(initialAngleRad));

    // Calculate day length in ticks
    // TRAPPIST-1 planets are tidally locked (rotation = orbital period)
    // Scale orbital period to game ticks: divide by ~6 to make e/Asimov ~= 24 hours
    // Orbital period (days) * 24 hours/day / 6 = hours per game-day
    // Then convert to ticks: hours * (480 ticks/day) / 24 hours
    const orbitalPeriodHours = planetDef.orbitalPeriod * 24;
    const dayLengthTicks = Math.round((orbitalPeriodHours / 6) * 20); // ~20 ticks per hour of day length

    planets.push({
      id: planetDef.id,
      name: `${planetDef.name} (${planetDef.trappistId})`,
      trappistId: planetDef.trappistId,
      distanceAU: planetDef.distanceAU,
      orbitalPeriod: planetDef.orbitalPeriod,
      eccentricity: planetDef.eccentricity,
      initialAngleRad,
      dayLengthTicks,
      discovered: true, // All visible from start
      accessible: planetDef.id === 'asimov', // Only Asimov initially accessible
      zones: generateZones(planetDef),
      moons: generateMoons(planetDef.id, planetDef.moonCount),
      x: r * Math.cos(initialAngleRad),
      y: r * Math.sin(initialAngleRad),
    });
  }

  return planets;
}

// Get starting zone (first zone of Asimov, auto-conquered)
export function getStartingZone(planets: Planet[]): Zone {
  const asimov = planets.find((p) => p.id === 'asimov');
  if (!asimov) throw new Error('Asimov not found');

  const startingZone = asimov.zones[0];

  // Auto-conquer starting zone
  startingZone.state = 'harvesting';
  startingZone.progress = 100;
  startingZone.ownedBySwarm = true;
  startingZone.predators = {
    strength: 0,
    defeated: true,
  };

  return startingZone;
}

// Get planet by ID
export function getPlanet(
  planets: Planet[],
  planetId: string
): Planet | undefined {
  return planets.find((p) => p.id === planetId);
}

// Get zone by ID
export function getZone(planets: Planet[], zoneId: string): Zone | undefined {
  for (const planet of planets) {
    const zone = planet.zones.find((z) => z.id === zoneId);
    if (zone) return zone;
  }
  return undefined;
}

const TWO_PI = 2 * Math.PI;
const GAME_SECONDS_PER_DAY = 480; // Each tick is 1 game-second (480 ticks = 1 day)

/**
 * Solve Kepler's equation M = E - e·sin(E) for eccentric anomaly E.
 * Uses Newton-Raphson iteration. For e < 0.1, converges in 2-3 iterations.
 */
function solveKepler(meanAnomaly: number, eccentricity: number): number {
  if (eccentricity === 0) return meanAnomaly;
  let E = meanAnomaly; // initial guess
  for (let i = 0; i < 6; i++) {
    const dE =
      (meanAnomaly - E + eccentricity * Math.sin(E)) /
      (1 - eccentricity * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Convert eccentric anomaly E to true anomaly θ.
 */
function eccentricToTrueAnomaly(E: number, eccentricity: number): number {
  if (eccentricity === 0) return E;
  return (
    2 *
    Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
    )
  );
}

/**
 * Calculate true anomaly (radians) at a given gameTime.
 * For circular orbits (e=0), this equals the mean anomaly.
 * For elliptical orbits, solves Kepler's equation.
 */
function getOrbitalAngle(
  initialAngleRad: number,
  orbitalPeriodDays: number,
  eccentricity: number,
  gameTime: number
): number {
  const orbitalPeriodSec = orbitalPeriodDays * GAME_SECONDS_PER_DAY;
  if (orbitalPeriodSec <= 0) return initialAngleRad;

  // Mean anomaly advances linearly with time
  const meanAnomaly = initialAngleRad + (TWO_PI * gameTime) / orbitalPeriodSec;

  if (eccentricity === 0) {
    // Circular orbit — true anomaly equals mean anomaly
    return meanAnomaly % TWO_PI;
  }

  // Solve Kepler's equation for eccentric anomaly, then convert to true anomaly
  const M = meanAnomaly % TWO_PI;
  const E = solveKepler(M, eccentricity);
  return eccentricToTrueAnomaly(E, eccentricity);
}

/**
 * Compute the orbital radius at a given true anomaly for an elliptical orbit.
 * r = a(1 - e²) / (1 + e·cos(θ))
 * For circular orbits (e=0), r = a.
 */
function orbitalRadius(
  semiMajorAxis: number,
  eccentricity: number,
  trueAnomaly: number
): number {
  if (eccentricity === 0) return semiMajorAxis;
  return (
    (semiMajorAxis * (1 - eccentricity * eccentricity)) /
    (1 + eccentricity * Math.cos(trueAnomaly))
  );
}

// Update planet orbital positions using Kepler orbital mechanics
export function updatePlanetPositions(
  planets: Planet[],
  gameTime: number
): void {
  for (const planet of planets) {
    const semiMajorAxisKm = planet.distanceAU * AU_IN_KM;
    const trueAnomaly = getOrbitalAngle(
      planet.initialAngleRad,
      planet.orbitalPeriod,
      planet.eccentricity,
      gameTime
    );

    const r = orbitalRadius(semiMajorAxisKm, planet.eccentricity, trueAnomaly);

    planet.x = r * Math.cos(trueAnomaly);
    planet.y = r * Math.sin(trueAnomaly);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const filtered = value.filter(
    (entry): entry is string => typeof entry === 'string'
  );
  return filtered.length > 0 ? filtered : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function insolationBandOr(
  value: unknown,
  fallback: InsolationBand
): InsolationBand {
  return value === 'light' || value === 'terminator' || value === 'dark'
    ? value
    : fallback;
}

function biomeOr(value: unknown, fallback: ZoneBiome): ZoneBiome {
  return value === 'sunscorch' ||
    value === 'temperate-basin' ||
    value === 'twilight-marsh' ||
    value === 'night-ice' ||
    value === 'mineral-ridge' ||
    value === 'barren-plain'
    ? value
    : fallback;
}

function gasFractionsOr(
  value: unknown,
  fallback: ZoneAtmosphereGases
): ZoneAtmosphereGases {
  if (!value || typeof value !== 'object') return fallback;
  const maybe = value as Partial<ZoneAtmosphereGases>;
  if (
    !isFiniteNumber(maybe.n2) ||
    !isFiniteNumber(maybe.co2) ||
    !isFiniteNumber(maybe.o2) ||
    !isFiniteNumber(maybe.ch4) ||
    !isFiniteNumber(maybe.inert)
  ) {
    return fallback;
  }
  return normalizeGasFractions({
    n2: maybe.n2,
    co2: maybe.co2,
    o2: maybe.o2,
    ch4: maybe.ch4,
    inert: maybe.inert,
  });
}

function normalizeZoneFromTemplate(
  loadedZone: Zone | undefined,
  templateZone: Zone
): Zone {
  if (!loadedZone) {
    return templateZone;
  }

  const merged: Zone = {
    ...templateZone,
    ...loadedZone,
    hexQ: finiteOr(loadedZone.hexQ, templateZone.hexQ),
    hexR: finiteOr(loadedZone.hexR, templateZone.hexR),
    hexS: finiteOr(loadedZone.hexS, templateZone.hexS),
    temperatureKelvin: finiteOr(
      loadedZone.temperatureKelvin,
      templateZone.temperatureKelvin
    ),
    progress: finiteOr(loadedZone.progress, templateZone.progress),
    ownedBySwarm: booleanOr(
      loadedZone.ownedBySwarm,
      loadedZone.state !== 'unexplored' ? true : templateZone.ownedBySwarm
    ),
    biomassRate: finiteOr(loadedZone.biomassRate, templateZone.biomassRate),
    biomassAvailable: finiteOr(
      loadedZone.biomassAvailable,
      templateZone.biomassAvailable
    ),
    atmosphericMass: finiteOr(
      loadedZone.atmosphericMass,
      templateZone.atmosphericMass
    ),
    insolationBand: insolationBandOr(
      loadedZone.insolationBand,
      templateZone.insolationBand
    ),
    biome: biomeOr(loadedZone.biome, templateZone.biome),
    hasMineralVein:
      typeof loadedZone.hasMineralVein === 'boolean'
        ? loadedZone.hasMineralVein
        : templateZone.hasMineralVein,
    atmosphericGases: gasFractionsOr(
      loadedZone.atmosphericGases,
      templateZone.atmosphericGases
    ),
    neighborIds: stringArrayOr(
      loadedZone.neighborIds,
      templateZone.neighborIds
    ),
  };

  return merged;
}

function normalizePlanetFromTemplate(
  loadedPlanet: Planet | undefined,
  templatePlanet: Planet
): Planet {
  if (!loadedPlanet) {
    return templatePlanet;
  }

  const loadedZones = Array.isArray(loadedPlanet.zones)
    ? loadedPlanet.zones
    : [];
  const loadedZoneById = new Map(loadedZones.map((zone) => [zone.id, zone]));
  const zones = templatePlanet.zones.map((templateZone) =>
    normalizeZoneFromTemplate(loadedZoneById.get(templateZone.id), templateZone)
  );

  const moons = Array.isArray(loadedPlanet.moons)
    ? loadedPlanet.moons.map((moon, index) => {
        const templateMoon = templatePlanet.moons[index];
        return {
          id:
            typeof moon?.id === 'string'
              ? moon.id
              : (templateMoon?.id ?? `moon-${index}`),
          name:
            typeof moon?.name === 'string'
              ? moon.name
              : (templateMoon?.name ?? `Moon ${index + 1}`),
          distance: finiteOr(moon?.distance, templateMoon?.distance ?? 10_000),
        };
      })
    : templatePlanet.moons;

  return {
    ...templatePlanet,
    ...loadedPlanet,
    distanceAU: finiteOr(loadedPlanet.distanceAU, templatePlanet.distanceAU),
    orbitalPeriod: finiteOr(
      loadedPlanet.orbitalPeriod,
      templatePlanet.orbitalPeriod
    ),
    eccentricity: finiteOr(
      loadedPlanet.eccentricity,
      templatePlanet.eccentricity
    ),
    initialAngleRad: finiteOr(
      loadedPlanet.initialAngleRad,
      templatePlanet.initialAngleRad
    ),
    dayLengthTicks: Math.max(
      1,
      Math.round(
        finiteOr(loadedPlanet.dayLengthTicks, templatePlanet.dayLengthTicks)
      )
    ),
    x: finiteOr(loadedPlanet.x, templatePlanet.x),
    y: finiteOr(loadedPlanet.y, templatePlanet.y),
    zones,
    moons,
  };
}

/**
 * Normalize loaded TRAPPIST-1 planet data against canonical generated planets.
 *
 * This preserves player progression fields from save data while backfilling
 * missing structural fields (especially zone hex coordinates) needed by map
 * rendering and simulation systems.
 */
export function normalizePlanetsFromSave(loadedPlanets: Planet[]): Planet[] {
  const canonicalPlanets = generateTRAPPIST1System();
  const loadedById = new Map(
    loadedPlanets.map((planet) => [planet.id, planet])
  );

  return canonicalPlanets.map((templatePlanet) =>
    normalizePlanetFromTemplate(
      loadedById.get(templatePlanet.id),
      templatePlanet
    )
  );
}
