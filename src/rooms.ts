import type { RoomType, CrewRole } from './models';

export interface RoomDefinition {
  type: RoomType;
  name: string;
  description: string;
  icon: string;
  preferredRole?: CrewRole;
  minCrew: number;
  maxCrew: number;
  powerDraw: number;
  alwaysPowered: boolean;
}

export const ROOM_DEFINITIONS: RoomDefinition[] = [
  {
    type: 'bridge',
    name: 'Bridge',
    description: 'The command center of the ship.',
    icon: '\u{1F39B}\uFE0F', // control knobs
    preferredRole: 'pilot',
    minCrew: 1,
    maxCrew: 3,
    powerDraw: 8,
    alwaysPowered: false,
  },
  {
    type: 'cantina',
    name: 'Cantina',
    description: 'Where the crew eats and relaxes.',
    icon: '\u{1F37A}', // beer mug
    preferredRole: 'cook',
    minCrew: 1,
    maxCrew: 2,
    powerDraw: 3,
    alwaysPowered: false,
  },
  {
    type: 'engine_room',
    name: 'Engine Room',
    description: 'The heart of the ship that keeps it running.',
    icon: '\u2699\uFE0F', // gear
    preferredRole: 'engineer',
    minCrew: 1,
    maxCrew: 4,
    powerDraw: 5,
    alwaysPowered: false,
  },
  {
    type: 'medbay',
    name: 'Medbay',
    description: 'Medical facilities for treating injuries.',
    icon: '\u{1FA7A}', // stethoscope
    preferredRole: 'medic',
    minCrew: 1,
    maxCrew: 2,
    powerDraw: 4,
    alwaysPowered: false,
  },
  {
    type: 'cargo_hold',
    name: 'Cargo Hold',
    description: 'Storage for goods and equipment.',
    icon: '\u{1F4E6}', // package
    minCrew: 0,
    maxCrew: 0,
    powerDraw: 2,
    alwaysPowered: true,
  },
  {
    type: 'armory',
    name: 'Armory',
    description: 'Weapons storage and maintenance.',
    icon: '\u{1F52B}', // pistol
    preferredRole: 'gunner',
    minCrew: 1,
    maxCrew: 3,
    powerDraw: 3,
    alwaysPowered: false,
  },
  {
    type: 'quarters',
    name: 'Quarters',
    description: 'Crew sleeping quarters.',
    icon: '\u{1F6CF}\uFE0F', // bed
    minCrew: 0,
    maxCrew: 2,
    powerDraw: 2,
    alwaysPowered: true,
  },
];

export function getRoomDefinition(type: RoomType): RoomDefinition | undefined {
  return ROOM_DEFINITIONS.find((r) => r.type === type);
}
