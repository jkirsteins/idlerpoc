import type { World, WorldLocation, Ship } from './models';
import { getShipClass } from './shipClasses';
import { computeMaxRange } from './flightPhysics';
import { getEngineDefinition } from './engines';
import { getDistanceBetween } from './utils';
import { getBestCrewSkill } from './crewRoles';
import { calculateFuelPercentage } from './ui/fuelFormatting';

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
 * Generate the initial world with locations including mining destinations.
 *
 * All distances are Earth-centric scalars in km. Orbital basis notes explain
 * *why* a location sits at that distance (Lagrange points, real bodies, etc.)
 * but travel remains 1-D via getDistanceBetween() = |distA - distB|.
 */
export function generateWorld(): World {
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
      x: 50,
      y: 50,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 5,
      pilotingRequirement: 0,
    },
    {
      id: 'leo_station',
      name: 'Gateway Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Low Earth orbit waystation. Busy transfer point for orbital operations.',
      distanceFromEarth: 400,
      x: 52,
      y: 48,
      services: ['refuel', 'trade'],
      size: 2,
      pilotingRequirement: 0,
    },

    // ─── Near-Earth / Cislunar ───────────────────────────────────
    {
      // Geostationary orbit — real-world logistics/communications altitude
      id: 'geo_depot',
      name: 'Meridian Depot',
      type: 'orbital',
      factionId: 'terran_alliance',
      description:
        'Geostationary orbit supply depot. Supports satellite servicing and communications relay operations.',
      distanceFromEarth: 35_786,
      x: 55,
      y: 52,
      services: ['refuel', 'trade', 'repair'],
      size: 2,
      pilotingRequirement: 10,
    },
    {
      // Earth-Moon L1 Lagrange point — gravitational saddle between Earth and Moon
      id: 'forge_station',
      name: 'Forge Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Shipyard at the Earth-Moon L1 point. Gateway to cislunar space, specializing in repairs and refitting.',
      distanceFromEarth: 326_000,
      x: 58,
      y: 47,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 3,
      pilotingRequirement: 20,
    },
    {
      // Earth-Moon L4 leading Trojan point — gravitational debris trap
      id: 'graveyard_drift',
      name: 'Graveyard Drift',
      type: 'asteroid_belt',
      factionId: 'free_traders_guild',
      description:
        "Decommissioned hulls and debris accumulated at the Moon's leading Trojan point. Salvage crews strip iron, silicates from solar panels, and copper wiring from old station modules.",
      distanceFromEarth: 384_400,
      x: 48,
      y: 44,
      services: ['mine'],
      size: 1,
      pilotingRequirement: 15,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'silicate' },
        { oreId: 'copper_ore' },
      ],
    },
    {
      // Lunar surface — Tycho crater, near South Pole KREEP basalt deposits
      id: 'tycho_colony',
      name: 'Tycho Colony',
      type: 'moon',
      factionId: 'terran_alliance',
      description:
        'Lunar surface settlement at Tycho crater. Ilmenite deposits yield titanium, KREEP basalt provides rare earths, and polar craters hold water ice. Trace helium-3 in the regolith.',
      distanceFromEarth: 384_400,
      x: 62,
      y: 48,
      services: ['refuel', 'trade', 'mine'],
      size: 2,
      pilotingRequirement: 30,
      availableOres: [
        { oreId: 'titanium_ore' },
        { oreId: 'rare_earth' },
        { oreId: 'water_ice' },
        { oreId: 'helium3', yieldMultiplier: 0.1 },
      ],
    },
    {
      // Sun-Earth L2 Lagrange point — beyond Earth's shadow
      id: 'freeport_station',
      name: 'Freeport Station',
      type: 'space_station',
      factionId: 'free_traders_guild',
      description:
        'Independent trading hub at the Sun-Earth L2 point. No questions asked, neutral ground beyond Alliance jurisdiction.',
      distanceFromEarth: 1_500_000,
      x: 68,
      y: 55,
      services: ['refuel', 'trade', 'hire'],
      size: 3,
      pilotingRequirement: 40,
    },
    {
      // Captured near-Earth asteroid cluster (minimoons) orbiting 1-3M km from Earth
      id: 'the_scatter',
      name: 'The Scatter',
      type: 'asteroid_belt',
      factionId: 'free_traders_guild',
      description:
        "Cluster of captured minimoons — small S-type and C-type asteroids temporarily trapped in Earth's Hill sphere. Iron-nickel bodies with titanium deposits and rare earth minerals.",
      distanceFromEarth: 1_800_000,
      x: 38,
      y: 62,
      services: ['refuel', 'mine', 'trade'],
      size: 2,
      pilotingRequirement: 45,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'titanium_ore' },
        { oreId: 'rare_earth' },
      ],
    },

    // ─── Outer System ────────────────────────────────────────────
    {
      // Mars — near closest Earth approach (~55M km)
      id: 'mars',
      name: 'Mars',
      type: 'planet',
      factionId: 'terran_alliance',
      description:
        'Red planet with growing settlement colonies. Iron oxide surface, volcanic rare earth deposits, and subsurface water ice at the poles.',
      distanceFromEarth: 55_000_000,
      x: 78,
      y: 38,
      services: ['refuel', 'trade', 'repair', 'hire', 'mine'],
      size: 3,
      pilotingRequirement: 55,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'rare_earth' },
        { oreId: 'water_ice' },
      ],
    },
    {
      // 4 Vesta orbit (~2.36 AU) — second-largest asteroid belt body
      id: 'vesta_station',
      name: 'Vesta Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Orbital station above 4 Vesta, a differentiated rocky body in the inner asteroid belt. Basaltic crust yields iron and titanium; Dawn-confirmed hydrated minerals provide water ice.',
      distanceFromEarth: 110_000_000,
      x: 82,
      y: 42,
      services: ['refuel', 'trade', 'mine'],
      size: 2,
      pilotingRequirement: 60,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'titanium_ore' },
        { oreId: 'water_ice' },
      ],
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
      x: 84,
      y: 46,
      services: ['refuel', 'mine'],
      size: 2,
      pilotingRequirement: 68,
      availableOres: [
        { oreId: 'iron_ore' },
        { oreId: 'platinum_ore' },
        { oreId: 'rare_earth' },
      ],
    },
    {
      // Ceres — dwarf planet (~2.77 AU), near closest Earth approach
      id: 'ceres_station',
      name: 'Ceres Station',
      type: 'planetoid',
      factionId: 'free_traders_guild',
      description:
        'Settlement on Ceres, the Belt capital. Twenty-five percent water ice crust over a chondritic core. Hub for deep-belt mining operations and Free Traders Guild commerce.',
      distanceFromEarth: 265_000_000,
      x: 87,
      y: 50,
      services: ['refuel', 'trade', 'mine'],
      size: 3,
      pilotingRequirement: 75,
      availableOres: [
        { oreId: 'water_ice' },
        { oreId: 'iron_ore' },
        { oreId: 'platinum_ore' },
        { oreId: 'rare_earth' },
      ],
    },
    {
      // Jupiter — near closest Earth approach (~588M km, ~3.93 AU)
      id: 'jupiter_station',
      name: 'Jupiter Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        "Orbital station in Jupiter's system. Atmospheric scooping operations extract helium-3 at industrial scale. Magnetosphere anomalies yield exotic matter for gap drive research.",
      distanceFromEarth: 588_000_000,
      x: 92,
      y: 32,
      services: ['refuel', 'trade', 'mine'],
      size: 2,
      pilotingRequirement: 85,
      availableOres: [{ oreId: 'helium3' }, { oreId: 'exotic_matter' }],
    },
  ];

  return { locations };
}
