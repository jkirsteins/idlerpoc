// TRAPPIST-1 Planet Data and Generation

import type { Planet, Zone, Moon } from './models/swarmTypes';
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

// Temperature ranges in Kelvin for each zone (reference for tweaking)
const TEMP_RANGES = {
  hot: { min: 350, max: 500 }, // Day side
  warm: { min: 280, max: 350 }, // Near terminator
  temperate: { min: 250, max: 280 }, // Terminator line
  cold: { min: 150, max: 250 }, // Night side
  frozen: { min: 50, max: 150 }, // Polar night / cold trap
};
void TEMP_RANGES; // Reference for future tweaking

// Atmosphere thresholds (based on temperature)
const ATMOSPHERE_THRESHOLDS = {
  thick: 250, // Above this: thick atmosphere
  thin: 150, // Above this: thin atmosphere
  none: 150, // Below this: no atmosphere (cold trap)
};

// Terrain generation weights
const TERRAIN_WEIGHTS = {
  soil: 0.7,
  liquid: 0.15,
  ice: 0.15,
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

// ============================================================================
// ZONE GENERATION
// ============================================================================

function calculateTemperature(
  q: number,
  cols: number,
  planetDef: PlanetDefinition,
  rng: () => number
): {
  temperatureZone: 'hot' | 'warm' | 'temperate' | 'cold' | 'frozen';
  tempKelvin: number;
} {
  // Calculate position relative to star-facing side (assumed q=0 is facing star)
  // On tidally locked planet, position determines temperature

  // Normalize q to -1 to 1 (star-facing to anti-star-facing)
  const normalizedQ = (q - cols / 2) / (cols / 2);

  // Base temperature from stellar irradiation (closer planets are hotter)
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

  // Apply position-based temperature variation
  let tempKelvin: number;

  if (normalizedQ < -0.6) {
    // Day side (facing star)
    tempKelvin = baseTemp + rng() * 50;
    return { temperatureZone: 'hot', tempKelvin };
  } else if (normalizedQ < -0.2) {
    // Warm region
    tempKelvin = baseTemp - 50 + rng() * 40;
    return { temperatureZone: 'warm', tempKelvin };
  } else if (normalizedQ < 0.2) {
    // Temperate (terminator line - day/night boundary)
    tempKelvin = baseTemp - 100 + rng() * 30;
    return { temperatureZone: 'temperate', tempKelvin };
  } else if (normalizedQ < 0.6) {
    // Cold (night side)
    tempKelvin = Math.max(50, baseTemp - 150 + rng() * 50);
    return { temperatureZone: 'cold', tempKelvin };
  } else {
    // Frozen (anti-star side / polar night)
    tempKelvin = 50 + rng() * 80;
    return { temperatureZone: 'frozen', tempKelvin };
  }
}

function deriveAtmosphere(
  temperatureKelvin: number
): 'thick' | 'thin' | 'none' {
  if (temperatureKelvin >= ATMOSPHERE_THRESHOLDS.thick) return 'thick';
  if (temperatureKelvin >= ATMOSPHERE_THRESHOLDS.thin) return 'thin';
  return 'none';
}

function selectTerrain(
  temperatureZone: 'hot' | 'warm' | 'temperate' | 'cold' | 'frozen',
  atmosphere: 'thick' | 'thin' | 'none',
  rng: () => number
): 'soil' | 'liquid' | 'ice' {
  const roll = rng();

  if (temperatureZone === 'frozen' || temperatureZone === 'cold') {
    // High chance of ice
    if (roll < 0.4) return 'ice';
    if (roll < 0.8) return 'soil';
    return 'liquid';
  }

  if (temperatureZone === 'hot' && atmosphere === 'none') {
    // Hot + no atmosphere = all liquid boiled off
    if (roll < 0.9) return 'soil';
    return 'ice';
  }

  if (temperatureZone === 'temperate' || temperatureZone === 'warm') {
    // Temperate zones can have liquid water
    if (atmosphere === 'thick' && roll < 0.25) return 'liquid';
    if (roll < 0.8) return 'soil';
    return 'ice';
  }

  // Default: mostly soil
  if (roll < TERRAIN_WEIGHTS.soil) return 'soil';
  if (roll < TERRAIN_WEIGHTS.soil + TERRAIN_WEIGHTS.liquid) return 'liquid';
  return 'ice';
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

  const { cols } = config;

  // Generate hex grid positions - circular layout
  const hexPositions: Array<{ q: number; r: number; s: number }> = [];

  // Use radius based on roughly maintaining zone count (~300-400)
  const radius = 10;

  // Create hex grid in a circle using axial distance
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (dist <= radius) {
        hexPositions.push({ q, r, s });
      }
    }
  }

  // Shuffle hex positions for more organic distribution
  for (let i = hexPositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [hexPositions[i], hexPositions[j]] = [hexPositions[j], hexPositions[i]];
  }

  // Create zone for each hex position
  for (const hex of hexPositions) {
    // Calculate temperature based on position relative to star-facing side
    const { temperatureZone, tempKelvin } = calculateTemperature(
      hex.q,
      cols,
      planetDef,
      rng
    );

    const atmosphere = deriveAtmosphere(tempKelvin);
    const terrainType = selectTerrain(temperatureZone, atmosphere, rng);

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
  for (const zone of zones) {
    zoneMap.set(zone.id, zone);
  }

  for (const zone of zones) {
    const neighbors = getHexNeighbors(zone.hexQ, zone.hexR);
    for (const n of neighbors) {
      // Find zone at this hex position
      const neighbor = zones.find((z) => z.hexQ === n.q && z.hexR === n.r);
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
    biomassRate: finiteOr(loadedZone.biomassRate, templateZone.biomassRate),
    biomassAvailable: finiteOr(
      loadedZone.biomassAvailable,
      templateZone.biomassAvailable
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
