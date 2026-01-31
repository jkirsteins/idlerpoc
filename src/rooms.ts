import type { RoomType } from './models';

export interface RoomDefinition {
  type: RoomType;
  name: string;
  description: string;
  icon: string;
}

export const ROOM_DEFINITIONS: RoomDefinition[] = [
  {
    type: 'bridge',
    name: 'Bridge',
    description: 'The command center of the ship.',
    icon: '\u{1F39B}\uFE0F', // control knobs
  },
  {
    type: 'cantina',
    name: 'Cantina',
    description: 'Where the crew eats and relaxes.',
    icon: '\u{1F37A}', // beer mug
  },
  {
    type: 'engine_room',
    name: 'Engine Room',
    description: 'The heart of the ship that keeps it running.',
    icon: '\u2699\uFE0F', // gear
  },
  {
    type: 'medbay',
    name: 'Medbay',
    description: 'Medical facilities for treating injuries.',
    icon: '\u{1FA7A}', // stethoscope
  },
  {
    type: 'cargo_hold',
    name: 'Cargo Hold',
    description: 'Storage for goods and equipment.',
    icon: '\u{1F4E6}', // package
  },
  {
    type: 'armory',
    name: 'Armory',
    description: 'Weapons storage and maintenance.',
    icon: '\u{1F52B}', // pistol
  },
  {
    type: 'quarters',
    name: 'Quarters',
    description: 'Crew sleeping quarters.',
    icon: '\u{1F6CF}\uFE0F', // bed
  },
];

export function getRoomDefinition(type: RoomType): RoomDefinition | undefined {
  return ROOM_DEFINITIONS.find((r) => r.type === type);
}
