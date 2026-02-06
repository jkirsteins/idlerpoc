import type { CrewRole, RoomType } from './models';

export interface CrewRoleDefinition {
  role: CrewRole;
  name: string;
  description: string;
  preferredRoom: RoomType;
}

export const CREW_ROLE_DEFINITIONS: CrewRoleDefinition[] = [
  {
    role: 'captain',
    name: 'Captain',
    description: 'Commands the ship and crew. Your character.',
    preferredRoom: 'bridge',
  },
  {
    role: 'pilot',
    name: 'Pilot',
    description: 'Navigates the ship through space.',
    preferredRoom: 'bridge',
  },
  {
    role: 'engineer',
    name: 'Engineer',
    description: 'Keeps the engines running smoothly.',
    preferredRoom: 'engine_room',
  },
  {
    role: 'cook',
    name: 'Cook',
    description: 'Prepares meals and boosts crew morale.',
    preferredRoom: 'cantina',
  },
  {
    role: 'medic',
    name: 'Medic',
    description: 'Treats injuries and illnesses.',
    preferredRoom: 'medbay',
  },
  {
    role: 'gunner',
    name: 'Gunner',
    description: 'Operates weapons systems.',
    preferredRoom: 'armory',
  },
  {
    role: 'mechanic',
    name: 'Mechanic',
    description: 'Repairs ship systems and equipment.',
    preferredRoom: 'engine_room',
  },
];

export function getCrewRoleDefinition(
  role: CrewRole
): CrewRoleDefinition | undefined {
  return CREW_ROLE_DEFINITIONS.find((r) => r.role === role);
}

export function getCrewRoleName(role: CrewRole): string {
  return getCrewRoleDefinition(role)?.name ?? role;
}
