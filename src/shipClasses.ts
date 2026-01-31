import type { ShipClassId, RoomType } from './models';

export interface ShipClass {
  id: ShipClassId;
  name: string;
  description: string;
  rooms: RoomType[];
  maxCrew: number;
  unlocked: boolean;
}

export const SHIP_CLASSES: ShipClass[] = [
  {
    id: 'rustbucket',
    name: 'Rustbucket',
    description:
      'A battered but reliable freighter. Perfect for getting started.',
    rooms: ['bridge', 'cantina', 'engine_room'],
    maxCrew: 6,
    unlocked: true,
  },
  {
    id: 'corsair',
    name: 'Corsair',
    description: 'A fast raider with expanded cargo and weapons capabilities.',
    rooms: ['bridge', 'cantina', 'engine_room', 'cargo_hold', 'armory'],
    maxCrew: 8,
    unlocked: false,
  },
  {
    id: 'dreadnought',
    name: 'Dreadnought',
    description: 'A massive warship with full crew amenities.',
    rooms: [
      'bridge',
      'cantina',
      'engine_room',
      'cargo_hold',
      'armory',
      'medbay',
      'quarters',
    ],
    maxCrew: 12,
    unlocked: false,
  },
  {
    id: 'phantom',
    name: 'Phantom',
    description: 'A sleek stealth vessel for covert operations.',
    rooms: ['bridge', 'engine_room', 'cargo_hold'],
    maxCrew: 4,
    unlocked: false,
  },
];

export function getShipClass(id: ShipClassId): ShipClass | undefined {
  return SHIP_CLASSES.find((sc) => sc.id === id);
}

export function getUnlockedShipClasses(): ShipClass[] {
  return SHIP_CLASSES.filter((sc) => sc.unlocked);
}
