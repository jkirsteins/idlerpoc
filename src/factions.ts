export type FactionId =
  | 'terran_alliance'
  | 'free_traders_guild'
  | 'kreth_collective';

export interface FactionDefinition {
  id: FactionId;
  name: string;
  isAlien: boolean;
  homeworld: string;
  description: string;
}

export const FACTION_DEFINITIONS: FactionDefinition[] = [
  {
    id: 'terran_alliance',
    name: 'Terran Alliance',
    isAlien: false,
    homeworld: 'Earth',
    description:
      'The primary human interplanetary government. Controls Earth, Luna, and major inner system installations.',
  },
  {
    id: 'free_traders_guild',
    name: 'Free Traders Guild',
    isAlien: false,
    homeworld: 'Ceres Station',
    description:
      'Independent merchant consortium operating throughout the Belt. Values freedom and profit above all.',
  },
  {
    id: 'kreth_collective',
    name: 'Kreth Collective',
    isAlien: true,
    homeworld: 'Kreth Prime',
    description:
      'Alien civilization from beyond the solar system. Maintains limited trade relations with humanity.',
  },
];

export function getFactionDefinition(id: FactionId): FactionDefinition {
  const faction = FACTION_DEFINITIONS.find((f) => f.id === id);
  if (!faction) {
    throw new Error(`Faction definition not found: ${id}`);
  }
  return faction;
}

export function getAllFactionDefinitions(): FactionDefinition[] {
  return FACTION_DEFINITIONS;
}
