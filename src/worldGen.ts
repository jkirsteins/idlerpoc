import type { World, WorldLocation, Ship } from './models';
import { getShipClass } from './shipClasses';
import { computeMaxRange } from './flightPhysics';
import { getEngineDefinition } from './engines';
import { getDistanceBetween } from './utils';

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
  const fuelPercent = (ship.fuelKg / ship.maxFuelKg) * 100;
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
  const fuelPercent = (ship.fuelKg / ship.maxFuelKg) * 100;
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
  let bestPiloting = 0;
  for (const crew of ship.crew) {
    if (crew.skills.piloting > bestPiloting) {
      bestPiloting = crew.skills.piloting;
    }
  }
  return meetsPilotingRequirement(bestPiloting, location);
}

/**
 * Generate the initial world with locations including mining destinations
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

    // ─── Near-Earth Mining Destinations (Station Keeper range) ───
    {
      id: 'debris_field_alpha',
      name: 'Debris Field Alpha',
      type: 'asteroid_belt',
      factionId: 'terran_alliance',
      description:
        'Dense cluster of orbital debris and micro-asteroids. Rich in iron and silicate deposits from old station breakups.',
      distanceFromEarth: 300,
      x: 48,
      y: 46,
      services: ['mine'],
      size: 1,
      pilotingRequirement: 10,
      availableOres: ['iron_ore', 'silicate'],
    },
    {
      id: 'scrapyard_ring',
      name: 'Scrapyard Ring',
      type: 'orbital',
      factionId: 'free_traders_guild',
      description:
        'Salvage operators have turned this decommissioned station graveyard into an unofficial mining hub. Good copper veins in the old hull plating.',
      distanceFromEarth: 800,
      x: 54,
      y: 53,
      services: ['mine', 'trade'],
      size: 1,
      pilotingRequirement: 10,
      availableOres: ['iron_ore', 'copper_ore'],
    },
    {
      id: 'nea_2247',
      name: 'Near-Earth Asteroid 2247',
      type: 'asteroid_belt',
      factionId: 'terran_alliance',
      description:
        'A captured near-Earth asteroid rich in titanium and rare earth elements. Terran Alliance mining concession.',
      distanceFromEarth: 1500,
      x: 46,
      y: 44,
      services: ['mine'],
      size: 1,
      pilotingRequirement: 25,
      availableOres: ['iron_ore', 'rare_earth', 'titanium_ore'],
    },

    // ─── Inner System ────────────────────────────────────────────
    {
      id: 'meo_depot',
      name: 'Meridian Depot',
      type: 'orbital',
      factionId: 'terran_alliance',
      description:
        'Medium Earth orbit supply depot. Supports satellite maintenance operations.',
      distanceFromEarth: 20_000,
      x: 55,
      y: 52,
      services: ['refuel', 'repair'],
      size: 1,
      pilotingRequirement: 20,
    },
    {
      id: 'forge_station',
      name: 'Forge Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Military shipyard in lunar orbit. Specializes in repairs and refitting.',
      distanceFromEarth: 384_400,
      x: 60,
      y: 45,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 3,
      pilotingRequirement: 35,
    },
    {
      id: 'freeport_station',
      name: 'Freeport Station',
      type: 'space_station',
      factionId: 'free_traders_guild',
      description:
        'Independent trading hub beyond the Moon. No questions asked, neutral ground.',
      distanceFromEarth: 1_200_000,
      x: 68,
      y: 55,
      services: ['refuel', 'trade', 'hire'],
      size: 3,
      pilotingRequirement: 45,
    },
    {
      id: 'the_scatter',
      name: 'The Scatter',
      type: 'asteroid_belt',
      factionId: 'free_traders_guild',
      description:
        'Dense asteroid field in cislunar space. Lawless mining operations with platinum and titanium veins.',
      distanceFromEarth: 2_500_000,
      x: 40,
      y: 60,
      services: ['mine', 'trade'],
      size: 2,
      pilotingRequirement: 45,
      availableOres: ['titanium_ore', 'platinum_ore', 'rare_earth'],
    },

    // ─── Outer System ────────────────────────────────────────────
    {
      id: 'mars',
      name: 'Mars',
      type: 'planet',
      factionId: 'terran_alliance',
      description:
        'Red planet with growing terraforming colonies. Helium-3 extraction from regolith.',
      distanceFromEarth: 54_600_000,
      x: 75,
      y: 40,
      services: ['refuel', 'trade', 'repair', 'hire', 'mine'],
      size: 3,
      pilotingRequirement: 60,
      availableOres: ['iron_ore', 'rare_earth', 'helium3'],
    },
    {
      id: 'jupiter_station',
      name: 'Jupiter Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Distant gas giant station. Helium-3 fuel depot and exotic matter research facility.',
      distanceFromEarth: 628_000_000,
      x: 85,
      y: 30,
      services: ['refuel', 'trade', 'mine'],
      size: 2,
      pilotingRequirement: 75,
      availableOres: ['helium3', 'exotic_matter'],
    },
  ];

  return { locations };
}
