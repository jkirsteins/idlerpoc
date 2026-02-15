import type { RoomType } from './models';

export interface RoomDefinition {
  type: RoomType;
  name: string;
  description: string;
  icon: string;
  powerDraw: number;
  alwaysPowered: boolean;
}

export const ROOM_DEFINITIONS: RoomDefinition[] = [
  {
    type: 'bridge',
    name: 'Bridge',
    description: 'The command center of the ship.',
    icon: '\u{1F39B}\uFE0F', // control knobs
    powerDraw: 8,
    alwaysPowered: false,
  },
  {
    type: 'engine_room',
    name: 'Engine Room',
    description: 'The heart of the ship that keeps it running.',
    icon: '\u2699\uFE0F', // gear
    powerDraw: 5,
    alwaysPowered: false,
  },
  {
    type: 'medbay',
    name: 'Medbay',
    description: 'Medical facilities for treating injuries.',
    icon: '\u{1FA7A}', // stethoscope
    powerDraw: 4,
    alwaysPowered: false,
  },
  {
    type: 'cargo_hold',
    name: 'Cargo Hold',
    description: 'Storage for goods and equipment.',
    icon: '\u{1F4E6}', // package
    powerDraw: 2,
    alwaysPowered: true,
  },
  {
    type: 'armory',
    name: 'Armory',
    description: 'Weapons storage and maintenance.',
    icon: '\u{1F52B}', // pistol
    powerDraw: 3,
    alwaysPowered: false,
  },
  {
    type: 'reactor_room',
    name: 'Reactor Room',
    description:
      'Fusion containment management. Separate from engine thrust control.',
    icon: '⚛️', // atom symbol
    powerDraw: 6,
    alwaysPowered: false,
  },
  {
    type: 'point_defense_station',
    name: 'Point Defense Station',
    description: 'Fire control for PD systems. Gunner-operated.',
    icon: '🎯', // target
    powerDraw: 8,
    alwaysPowered: false,
  },
  {
    type: 'mining_bay',
    name: 'Mining Bay',
    description:
      'Ship-mounted mining operations center. Required for asteroid mining.',
    icon: '⛏️', // pick
    powerDraw: 4,
    alwaysPowered: false,
  },
];

export function getRoomDefinition(type: RoomType): RoomDefinition | undefined {
  return ROOM_DEFINITIONS.find((r) => r.type === type);
}
