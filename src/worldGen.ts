import type { World, WorldLocation } from './models';

/**
 * Generate the initial world with 7 locations
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
      reachable: true,
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
      reachable: true,
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
      reachable: false,
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
      reachable: false,
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
      reachable: false,
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
      reachable: false,
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
      reachable: false,
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
      reachable: false,
    },
  ];

  return { locations };
}
