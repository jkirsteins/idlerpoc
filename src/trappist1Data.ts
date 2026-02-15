// TRAPPIST-1 Planet Data and Generation

import type { Planet, Zone, Moon } from './models/swarmTypes';
import { generateZoneName } from './models/swarmTypes';

// Planet definitions with real characteristics
export interface PlanetDefinition {
  id: string;
  name: string;
  trappistId: string;
  distanceAU: number;
  orbitalPeriod: number; // Earth days
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

// Generate zones for a planet
function generateZones(planetDef: PlanetDefinition): Zone[] {
  const zones: Zone[] = [];
  let zoneId = 0;

  // 6 continents
  // Continent names available for future use: Alpha, Beta, Gamma, Delta, Epsilon, Zeta

  for (let c = 0; c < 6; c++) {
    // 8 regions per continent
    for (let r = 0; r < 8; r++) {
      // 8 zones per region
      for (let z = 0; z < 8; z++) {
        const seed = c * 64 + r * 8 + z;

        // Vary biomass rate by zone
        const variance = 0.5 + Math.random(); // 0.5x to 1.5x
        const biomassRate = planetDef.baseBiomassRate * variance;

        // Vary predator strength
        const predatorVariance = 0.8 + Math.random() * 0.4; // 0.8x to 1.2x
        const predatorStrength = Math.floor(
          planetDef.predatorBaseStrength * predatorVariance
        );

        zones.push({
          id: `${planetDef.id}-zone-${zoneId}`,
          name: generateZoneName(seed),
          planetId: planetDef.id,
          continentId: `${planetDef.id}-continent-${c}`,
          regionId: `${planetDef.id}-region-${c}-${r}`,
          state: 'unexplored',
          progress: 0,
          biomassRate,
          biomassAvailable: biomassRate * 1000, // Initial pool
          predators: {
            strength: predatorStrength,
            defeated: false,
          },
          assignedWorkers: [],
          continentIndex: c,
          regionIndex: r,
          zoneIndex: z,
        });

        zoneId++;
      }
    }
  }

  return zones;
}

// Generate complete TRAPPIST-1 system
export function generateTRAPPIST1System(): Planet[] {
  const planets: Planet[] = [];

  for (const planetDef of TRAPPIST1_PLANETS) {
    // Calculate initial orbital angle (distribute evenly for visual variety)
    const angle = (planets.length / TRAPPIST1_PLANETS.length) * Math.PI * 2;

    planets.push({
      id: planetDef.id,
      name: planetDef.name,
      trappistId: planetDef.trappistId,
      distanceAU: planetDef.distanceAU,
      orbitalPeriod: planetDef.orbitalPeriod,
      discovered: true, // All visible from start
      accessible: planetDef.id === 'asimov', // Only Asimov initially accessible
      zones: generateZones(planetDef),
      moons: generateMoons(planetDef.id, planetDef.moonCount),
      angle,
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

// Update planet orbital positions (simplified for v1 - static)
export function updatePlanetPositions(
  _planets: Planet[],
  _gameTime: number
): void {
  // For v1, planets remain at fixed angles
  // Future: Calculate orbital motion based on gameTime
  // angle = initialAngle + (gameTime / orbitalPeriod) * 2 * PI
  void _planets;
}
