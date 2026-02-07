import type { World, WorldLocation, Ship } from './models';
import { getShipClass } from './shipClasses';

/**
 * Parse max range string from ship class (e.g., "2,000 km (LEO/MEO)" -> 2000)
 */
function parseMaxRange(maxRangeStr: string): number {
  const match = maxRangeStr.match(/^([\d,]+)/);
  if (!match) return 0;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

/**
 * Get distance between two locations
 */
export function getDistanceBetween(
  locA: WorldLocation,
  locB: WorldLocation
): number {
  return Math.abs(locA.distanceFromEarth - locB.distanceFromEarth);
}

/**
 * Check if a location is reachable based on ship's range and current fuel
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

  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return false;

  // Get ship's maximum range in km
  const maxRange = parseMaxRange(shipClass.maxRange);

  // Calculate distance between locations
  const distance = getDistanceBetween(fromLocation, location);

  // Calculate effective range based on current fuel (fuel affects how far you can go)
  // At 100% fuel, you can go max range. At 50% fuel, you can go half max range.
  const effectiveRange = maxRange * (ship.fuel / 100);

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

  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 'Unknown ship class';

  // Get ship's maximum range in km
  const maxRange = parseMaxRange(shipClass.maxRange);

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
  const effectiveRange = maxRange * (ship.fuel / 100);

  // Check if we have enough fuel
  if (effectiveRange < requiredRange) {
    return 'Insufficient fuel';
  }

  return null;
}

/**
 * Generate the initial world with 8 locations
 */
export function generateWorld(): World {
  const locations: WorldLocation[] = [
    {
      id: 'earth',
      name: 'Earth',
      type: 'planet',
      factionId: 'terran_alliance',
      description:
        'Homeworld of humanity. The heart of the Terran Alliance with full orbital infrastructure.',
      distanceFromEarth: 0,
      x: 50, // center of map
      y: 50,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 5,
    },
    {
      id: 'leo_station',
      name: 'Gateway Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Low Earth orbit waystation. Busy transfer point for orbital operations.',
      distanceFromEarth: 400, // LEO - within Station Keeper range (2,000 km)
      x: 52,
      y: 48,
      services: ['refuel', 'trade'],
      size: 2,
    },
    {
      id: 'meo_depot',
      name: 'Meridian Depot',
      type: 'orbital',
      factionId: 'terran_alliance',
      description:
        'Medium Earth orbit supply depot. Supports satellite maintenance operations.',
      distanceFromEarth: 20_000, // MEO - requires ship upgrade
      x: 55,
      y: 52,
      services: ['refuel', 'repair'],
      size: 1,
    },
    {
      id: 'forge_station',
      name: 'Forge Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Military shipyard in lunar orbit. Specializes in repairs and refitting.',
      distanceFromEarth: 384_400, // Moon orbital distance - Class II+ required
      x: 60,
      y: 45,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 3,
    },
    {
      id: 'freeport_station',
      name: 'Freeport Station',
      type: 'space_station',
      factionId: 'free_traders_guild',
      description:
        'Independent trading hub beyond the Moon. No questions asked, neutral ground.',
      distanceFromEarth: 1_200_000, // Beyond lunar orbit - Class II+ required
      x: 68,
      y: 55,
      services: ['refuel', 'trade', 'hire'],
      size: 3,
    },
    {
      id: 'the_scatter',
      name: 'The Scatter',
      type: 'asteroid_belt',
      factionId: 'free_traders_guild',
      description:
        'Dense asteroid field in cislunar space. Lawless mining operations.',
      distanceFromEarth: 2_500_000, // Inner belt - Class II+ required
      x: 40,
      y: 60,
      services: ['mine', 'trade'],
      size: 2,
    },
    {
      id: 'mars',
      name: 'Mars',
      type: 'planet',
      factionId: 'terran_alliance',
      description:
        'Red planet with growing terraforming colonies. Major Terran Alliance presence.',
      distanceFromEarth: 54_600_000, // Minimum Earth-Mars distance - Class II+ required
      x: 75,
      y: 40,
      services: ['refuel', 'trade', 'repair', 'hire'],
      size: 3,
    },
    {
      id: 'jupiter_station',
      name: 'Jupiter Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Distant gas giant station. Helium-3 fuel depot for deep system operations.',
      distanceFromEarth: 628_000_000, // Average Earth-Jupiter distance - Class III+ required
      x: 85,
      y: 30,
      services: ['refuel', 'trade'],
      size: 2,
    },
  ];

  return { locations };
}
