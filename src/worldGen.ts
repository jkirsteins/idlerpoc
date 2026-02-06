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
      id: 'forge_station',
      name: 'Forge Station',
      type: 'space_station',
      factionId: 'terran_alliance',
      description:
        'Military shipyard in lunar orbit. Specializes in repairs and refitting.',
      distanceFromEarth: 384_400, // Moon orbital distance
      x: 55,
      y: 45,
      services: ['refuel', 'trade', 'repair'],
      reachable: true,
    },
    {
      id: 'freeport_station',
      name: 'Freeport Station',
      type: 'space_station',
      factionId: 'free_traders_guild',
      description:
        'Independent trading hub. No questions asked, neutral ground for all factions.',
      distanceFromEarth: 1_200_000, // Beyond lunar orbit
      x: 65,
      y: 55,
      services: ['refuel', 'trade', 'hire'],
      reachable: true,
    },
    {
      id: 'the_scatter',
      name: 'The Scatter',
      type: 'asteroid_belt',
      description:
        'Dense asteroid field rich in valuable minerals. Lawless and dangerous.',
      distanceFromEarth: 2_500_000, // Inner system belt
      x: 40,
      y: 60,
      services: ['mine'],
      reachable: true,
    },
    {
      id: 'vesta_minor',
      name: 'Vesta Minor',
      type: 'planetoid',
      factionId: 'free_traders_guild',
      description:
        'Small mining colony on a large asteroid. Rough frontier town atmosphere.',
      distanceFromEarth: 4_800_000, // Inner asteroid belt region
      x: 30,
      y: 50,
      services: ['refuel', 'trade', 'repair', 'hire'],
      reachable: true,
    },
    {
      id: 'mars',
      name: 'Mars',
      type: 'planet',
      factionId: 'terran_alliance',
      description:
        'Red planet with growing terraforming colonies. Major Terran Alliance military presence.',
      distanceFromEarth: 54_600_000, // Minimum Earth-Mars distance
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
      distanceFromEarth: 628_000_000, // Average Earth-Jupiter distance
      x: 85,
      y: 30,
      services: ['refuel', 'trade'],
      reachable: false,
    },
  ];

  return { locations };
}
