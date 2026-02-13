import type { World, WorldLocation, Ship, OrbitalParams } from './models';
import { getShipClass } from './shipClasses';
import { computeMaxRange } from './flightPhysics';
import { getEngineDefinition } from './engines';
import { getDistanceBetween } from './utils';
import { getBestCrewSkill } from './crewRoles';
import { calculateFuelPercentage } from './ui/fuelFormatting';
import { GAME_SECONDS_PER_DAY } from './timeSystem';
import { updateWorldPositions } from './orbitalMechanics';

export { getDistanceBetween } from './utils';

/**
 * Check if a location is reachable based on ship's range, fuel, and crew skill
 */
export function isLocationReachable(
  ship: Ship,
  location: WorldLocation,
  fromLocation: WorldLocation
): boolean {
  // Current location is always reachable
  if (location.id === fromLocation.id) {
    return true;
  }

  // Crew must meet destination's piloting requirement
  if (!canShipAccessLocation(ship, location)) {
    return false;
  }

  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return false;

  // Get ship's maximum range in km
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRange = computeMaxRange(shipClass, engineDef);

  // Calculate distance between locations
  const distance = getDistanceBetween(fromLocation, location);

  // Calculate effective range based on current fuel (fuel affects how far you can go)
  // At 100% fuel, you can go max range. At 50% fuel, you can go half max range.
  const fuelPercent = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  const effectiveRange = maxRange * (fuelPercent / 100);

  // Check if destination has refuel services
  const hasRefuel = location.services.includes('refuel');

  // If destination has refuel, we only need one-way fuel
  // If not, we need round-trip fuel (there and back)
  const requiredRange = hasRefuel ? distance : distance * 2;

  return effectiveRange >= requiredRange;
}

/**
 * Get the reason why a location is unreachable, or null if it's reachable
 */
export function getUnreachableReason(
  ship: Ship,
  location: WorldLocation,
  fromLocation: WorldLocation
): string | null {
  // Current location is always reachable
  if (location.id === fromLocation.id) {
    return null;
  }

  // Check piloting requirement
  if (!canShipAccessLocation(ship, location)) {
    return `Piloting ${location.pilotingRequirement} required`;
  }

  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 'Unknown ship class';

  // Get ship's maximum range in km
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRange = computeMaxRange(shipClass, engineDef);

  // Calculate distance between locations
  const distance = getDistanceBetween(fromLocation, location);

  // Check if destination has refuel services
  const hasRefuel = location.services.includes('refuel');

  // If destination has refuel, we only need one-way fuel
  // If not, we need round-trip fuel (there and back)
  const requiredRange = hasRefuel ? distance : distance * 2;

  // First check if ship class can reach it at all
  if (maxRange < requiredRange) {
    return 'Out of range';
  }

  // Calculate effective range based on current fuel
  const fuelPercent = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  const effectiveRange = maxRange * (fuelPercent / 100);

  // Check if we have enough fuel
  if (effectiveRange < requiredRange) {
    return 'Insufficient fuel';
  }

  return null;
}

/**
 * Check if a pilot meets the piloting requirement for a destination.
 */
export function meetsPilotingRequirement(
  pilotingSkill: number,
  location: WorldLocation
): boolean {
  return Math.floor(pilotingSkill) >= location.pilotingRequirement;
}

/**
 * Check if a ship's crew can access a location.
 * Central gate: uses the best piloting skill on the ship
 * vs the location's piloting requirement.
 */
export function canShipAccessLocation(
  ship: Ship,
  location: WorldLocation
): boolean {
  const bestPiloting = getBestCrewSkill(ship.crew, 'piloting');
  return meetsPilotingRequirement(bestPiloting, location);
}

/**
 * Helper: build OrbitalParams, converting period from days to game-seconds.
 */
function orbit(
  parentId: string | null,
  radiusKm: number,
  periodDays: number,
  initialAngleRad: number,
  eccentricity?: number
): OrbitalParams {
  return {
    parentId,
    orbitalRadiusKm: radiusKm,
    orbitalPeriodSec: periodDays * GAME_SECONDS_PER_DAY,
    initialAngleRad,
    ...(eccentricity ? { eccentricity } : {}),
  };
}

/**
 * Generate the initial world with locations and 2D orbital parameters.
 *
 * Bodies follow circular orbits. Earth satellites orbit Earth (hierarchical);
 * everything else orbits the Sun. Distances are computed dynamically via
 * updateWorldPositions() each tick.
 *
 * Initial angles are randomised per location for visual variety.
 */
export function generateWorld(): World {
  // Random initial angles for variety each playthrough
  const rng = () => Math.random() * 2 * Math.PI;

  const locations: WorldLocation[] = [
    // ─── Earth & LEO ─────────────────────────────────────────────
    {
      id: 'earth',
      name: 'Earth',
      type: 'planet',
      factionId: 'terran_alliance',
      description:
        'Homeworld of humanity. The heart of the Terran Alliance with full orbital infrastructure.',
      distanceFromEarth: 0,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 5,
      pilotingRequirement: 0,
      orbital: orbit(null, 149_597_870, 365.25, rng(), 0.0167),
    },
    {
      id: 'leo_station',
      name: 'Gateway Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Low Earth orbit waystation. Busy transfer point for orbital operations.',
      distanceFromEarth: 400,
      x: 0,
      y: 0,
      services: ['refuel', 'trade'],
      size: 2,
      pilotingRequirement: 0,
      orbital: orbit('earth', 400, 0.064, rng()), // LEO ~1.5h period
    },

    // ─── Near-Earth / Cislunar ───────────────────────────────────
    {
      // Geostationary orbit
      id: 'geo_depot',
      name: 'Meridian Depot',
      type: 'orbital',
      factionId: 'terran_alliance',
      description:
        'Geostationary orbit supply depot. Supports satellite servicing and communications relay operations.',
      distanceFromEarth: 35_786,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'repair'],
      size: 2,
      pilotingRequirement: 10,
      orbital: orbit('earth', 35_786, 1.0, rng()), // GEO = 1 sidereal day
    },
    {
      // Earth-Moon L1 Lagrange point
      id: 'forge_station',
      name: 'Forge Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Shipyard at the Earth-Moon L1 point. Gateway to cislunar space, specializing in repairs and refitting.',
      distanceFromEarth: 326_000,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 3,
      pilotingRequirement: 20,
      orbital: orbit('earth', 326_000, 18.5, rng()),
    },
    {
      // Earth-Moon L4 leading Trojan point
      id: 'graveyard_drift',
      name: 'Graveyard Drift',
      type: 'asteroid_belt',
      factionId: 'free_traders_guild',
      description:
        "Decommissioned hulls and debris accumulated at the Moon's leading Trojan point. Salvage crews strip iron, silicates from solar panels, and copper wiring from old station modules.",
      distanceFromEarth: 384_400,
      x: 0,
      y: 0,
      services: ['mine'],
      size: 1,
      pilotingRequirement: 15,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'silicate' },
        { oreId: 'copper_ore' },
      ],
      orbital: orbit('earth', 384_400, 27.3, rng()),
    },
    {
      // Lunar surface — Tycho crater
      id: 'tycho_colony',
      name: 'Tycho Colony',
      type: 'moon',
      factionId: 'terran_alliance',
      description:
        'Lunar surface settlement at Tycho crater. Ilmenite deposits yield titanium, KREEP basalt provides rare earths, and polar craters hold water ice. Trace helium-3 in the regolith.',
      distanceFromEarth: 384_400,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'mine'],
      size: 2,
      pilotingRequirement: 30,
      availableOres: [
        { oreId: 'titanium_ore' },
        { oreId: 'rare_earth' },
        { oreId: 'water_ice' },
        { oreId: 'helium3', yieldMultiplier: 0.1 },
      ],
      orbital: orbit('earth', 384_400, 27.3, rng()),
    },
    {
      // Sun-Earth L2 Lagrange point — slightly outside Earth's orbit
      id: 'freeport_station',
      name: 'Freeport Station',
      type: 'space_station',
      factionId: 'free_traders_guild',
      description:
        'Independent trading hub at the Sun-Earth L2 point. No questions asked, neutral ground beyond Alliance jurisdiction.',
      distanceFromEarth: 1_500_000,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'hire'],
      size: 3,
      pilotingRequirement: 40,
      orbital: orbit(null, 151_100_000, 366, rng()), // Just outside 1 AU
    },
    {
      // Captured minimoons in Earth's Hill sphere
      id: 'the_scatter',
      name: 'The Scatter',
      type: 'asteroid_belt',
      factionId: 'free_traders_guild',
      description:
        "Cluster of captured minimoons — small S-type and C-type asteroids temporarily trapped in Earth's Hill sphere. Iron-nickel bodies with titanium deposits and rare earth minerals.",
      distanceFromEarth: 1_800_000,
      x: 0,
      y: 0,
      services: ['refuel', 'mine', 'trade'],
      size: 2,
      pilotingRequirement: 45,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'titanium_ore' },
        { oreId: 'rare_earth' },
      ],
      orbital: orbit(null, 150_900_000, 367, rng()), // Near-Earth but slightly different period
    },

    // ─── Outer System ────────────────────────────────────────────
    {
      // Mars
      id: 'mars',
      name: 'Mars',
      type: 'planet',
      factionId: 'terran_alliance',
      description:
        'Red planet with growing settlement colonies. Iron oxide surface, volcanic rare earth deposits, and subsurface water ice at the poles.',
      distanceFromEarth: 55_000_000,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'repair', 'hire', 'mine'],
      size: 3,
      pilotingRequirement: 55,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'rare_earth' },
        { oreId: 'water_ice' },
      ],
      orbital: orbit(null, 227_939_200, 687, rng(), 0.0934),
    },
    {
      // 4 Vesta orbit (~2.36 AU)
      id: 'vesta_station',
      name: 'Vesta Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Orbital station above 4 Vesta, a differentiated rocky body in the inner asteroid belt. Basaltic crust yields iron and titanium; Dawn-confirmed hydrated minerals provide water ice.',
      distanceFromEarth: 110_000_000,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'mine'],
      size: 2,
      pilotingRequirement: 60,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'titanium_ore' },
        { oreId: 'water_ice' },
      ],
      orbital: orbit(null, 353_000_000, 1325, rng(), 0.0536),
    },
    {
      // Dense metallic asteroid swarm in the mid-belt (~2.9 AU)
      id: 'the_crucible',
      name: 'The Crucible',
      type: 'asteroid_belt',
      factionId: 'free_traders_guild',
      description:
        'Dense cluster of metallic asteroids — exposed iron-nickel cores from ancient protoplanetary collisions. The richest source of platinum group metals in the Belt.',
      distanceFromEarth: 155_000_000,
      x: 0,
      y: 0,
      services: ['refuel', 'mine'],
      size: 2,
      pilotingRequirement: 68,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'platinum_ore' },
        { oreId: 'rare_earth' },
      ],
      orbital: orbit(null, 434_000_000, 1804, rng(), 0.0785),
    },
    {
      // Ceres — dwarf planet (~2.77 AU)
      id: 'ceres_station',
      name: 'Ceres Station',
      type: 'planetoid',
      factionId: 'free_traders_guild',
      description:
        'Settlement on Ceres, the Belt capital. Twenty-five percent water ice crust over a chondritic core. Hub for deep-belt mining operations and Free Traders Guild commerce.',
      distanceFromEarth: 265_000_000,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'mine'],
      size: 3,
      pilotingRequirement: 75,
      availableOres: [
        { oreId: 'water_ice' },
        { oreId: 'iron_ore' },
        { oreId: 'platinum_ore' },
        { oreId: 'rare_earth' },
      ],
      orbital: orbit(null, 414_000_000, 1682, rng(), 0.0758),
    },
    {
      // Jupiter (~5.2 AU)
      id: 'jupiter_station',
      name: 'Jupiter Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        "Orbital station in Jupiter's system. Atmospheric scooping operations extract helium-3 at industrial scale. Magnetosphere anomalies yield exotic matter for gap drive research.",
      distanceFromEarth: 588_000_000,
      x: 0,
      y: 0,
      services: ['refuel', 'trade', 'mine'],
      size: 2,
      pilotingRequirement: 85,
      availableOres: [{ oreId: 'helium3' }, { oreId: 'exotic_matter' }],
      orbital: orbit(null, 778_570_000, 4333, rng(), 0.0489),
    },
  ];

  const world: World = { locations };

  // Compute initial positions at gameTime=0
  updateWorldPositions(world, 0);

  return world;
}
