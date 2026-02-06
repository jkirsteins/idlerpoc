import type { ShipClassId, RoomType, EquipmentId, EngineId } from './models';

export type ShipClassTier = 'I' | 'II' | 'III' | 'IV';

export interface ShipClass {
  id: ShipClassId;
  name: string;
  description: string;
  tier: ShipClassTier;
  price: number;
  rooms: RoomType[];
  maxCrew: number;
  unlocked: boolean;
  maxRange: string;
  cargoCapacity: number;
  equipmentSlots: number;
  defaultEquipment: EquipmentId[];
  defaultEngineId: EngineId;
}

export const SHIP_CLASSES: ShipClass[] = [
  // Class I: Orbital Maintenance Vessels
  {
    id: 'station_keeper',
    name: 'Voidstar OW-440 "Station Keeper"',
    description:
      'Bare-bones orbital operations vessel. LEO/MEO only. Your first command.',
    tier: 'I',
    price: 250_000,
    rooms: ['bridge', 'engine_room', 'cargo_hold'],
    maxCrew: 4,
    unlocked: true,
    maxRange: '2,000 km (LEO/MEO)',
    cargoCapacity: 5000,
    equipmentSlots: 3,
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'chemical_bipropellant',
  },

  // Class II: Inner System Vessels
  {
    id: 'wayfarer',
    name: 'Voidstar VX-200 "Wayfarer"',
    description:
      'Entry-level independent trader. Inner system capability. Reliable and affordable.',
    tier: 'II',
    price: 8_500_000,
    rooms: ['bridge', 'engine_room', 'cantina', 'cargo_hold', 'quarters'],
    maxCrew: 6,
    unlocked: false,
    maxRange: '50,000 km (Inner System)',
    cargoCapacity: 40000,
    equipmentSlots: 4,
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_mk1',
  },
  {
    id: 'corsair',
    name: 'Voidstar AC-450 "Corsair"',
    description:
      'Combat-capable armed freighter with enhanced cargo and weapons systems.',
    tier: 'II',
    price: 25_000_000,
    rooms: [
      'bridge',
      'engine_room',
      'cantina',
      'medbay',
      'cargo_hold',
      'armory',
    ],
    maxCrew: 8,
    unlocked: false,
    maxRange: '60,000 km (Inner System)',
    cargoCapacity: 60000,
    equipmentSlots: 5,
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_mk2',
  },
  {
    id: 'dreadnought',
    name: 'Prometheus DHC-800 "Dreadnought"',
    description:
      'Military-surplus heavy cruiser. Maximum firepower and full crew amenities.',
    tier: 'II',
    price: 45_000_000,
    rooms: [
      'bridge',
      'engine_room',
      'cantina',
      'medbay',
      'cargo_hold',
      'armory',
      'quarters',
    ],
    maxCrew: 12,
    unlocked: false,
    maxRange: '80,000 km (Inner System)',
    cargoCapacity: 80000,
    equipmentSlots: 6,
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_heavy',
  },
  {
    id: 'phantom',
    name: 'Voidstar SX-300 "Phantom"',
    description:
      'Stealth courier with low heat signature. Built for covert operations.',
    tier: 'II',
    price: 35_000_000,
    rooms: [
      'bridge',
      'engine_room',
      'medbay',
      'cargo_hold',
      'armory',
      'quarters',
    ],
    maxCrew: 8,
    unlocked: false,
    maxRange: '55,000 km (Inner System)',
    cargoCapacity: 30000,
    equipmentSlots: 5,
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_stealth',
  },
];

export function getShipClass(id: ShipClassId): ShipClass | undefined {
  return SHIP_CLASSES.find((sc) => sc.id === id);
}

export function getUnlockedShipClasses(): ShipClass[] {
  return SHIP_CLASSES.filter((sc) => sc.unlocked);
}
