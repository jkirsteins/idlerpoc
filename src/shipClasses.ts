import type {
  ShipClassId,
  RoomType,
  EquipmentId,
  EngineId,
  EquipmentSlotTag,
  ShipFeatureId,
} from './models';

export type ShipClassTier = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface ShipClass {
  id: ShipClassId;
  name: string;
  description: string;
  tier: ShipClassTier;
  price: number;
  rooms: RoomType[];
  maxCrew: number;
  unlockThreshold: number; // Lifetime credits earned to unlock (0 = always available)
  rangeLabel: string; // Display flavor text (e.g., 'LEO/MEO', 'Inner System', 'Jupiter+')
  cargoCapacity: number;
  equipmentSlots: number; // deprecated, use equipmentSlotDefs
  equipmentSlotDefs: { tags: EquipmentSlotTag[] }[];
  features: ShipFeatureId[];
  defaultEquipment: EquipmentId[];
  defaultEngineId: EngineId;
  mass: number; // kg
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
    unlockThreshold: 0,
    rangeLabel: 'LEO/MEO',
    cargoCapacity: 5000,
    equipmentSlots: 4,
    equipmentSlotDefs: [
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
    ],
    features: [],
    defaultEquipment: [
      'life_support',
      'air_filters',
      'micro_deflector',
      'point_defense_laser',
    ],
    defaultEngineId: 'chemical_bipropellant',
    mass: 50000, // kg
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
    unlockThreshold: 1_000_000,
    rangeLabel: 'Inner System',
    cargoCapacity: 40000,
    equipmentSlots: 4,
    equipmentSlotDefs: [
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
    ],
    features: [],
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_mk1',
    mass: 200000, // kg
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
    unlockThreshold: 1_000_000,
    rangeLabel: 'Inner System+',
    cargoCapacity: 60000,
    equipmentSlots: 5,
    equipmentSlotDefs: [
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard', 'structural'] },
    ],
    features: [],
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_mk2',
    mass: 350000, // kg
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
    unlockThreshold: 1_000_000,
    rangeLabel: 'Earth-Mars',
    cargoCapacity: 80000,
    equipmentSlots: 6,
    equipmentSlotDefs: [
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard', 'structural'] },
    ],
    features: ['rotating_habitat'],
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_heavy',
    mass: 500000, // kg
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
    unlockThreshold: 1_000_000,
    rangeLabel: 'Inner System',
    cargoCapacity: 30000,
    equipmentSlots: 5,
    equipmentSlotDefs: [
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard', 'structural'] },
    ],
    features: [],
    defaultEquipment: ['life_support', 'air_filters'],
    defaultEngineId: 'ntr_stealth',
    mass: 250000, // kg
  },

  // Class III: Interplanetary Vessels (Torch Ships)
  {
    id: 'firebrand',
    name: 'Prometheus FDR-I "Firebrand"',
    description:
      'Entry-level torch ship. Continuous fusion burn capability. Can reach Mars but not Jupiter. Bootstrap into interplanetary space.',
    tier: 'III',
    price: 120_000_000,
    rooms: [
      'bridge',
      'engine_room',
      'reactor_room',
      'cantina',
      'medbay',
      'cargo_hold',
      'quarters',
    ],
    maxCrew: 10,
    unlockThreshold: 50_000_000,
    rangeLabel: 'Mars',
    cargoCapacity: 100000,
    equipmentSlots: 8,
    equipmentSlotDefs: [
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard', 'structural'] },
    ],
    features: [],
    defaultEquipment: [
      'life_support',
      'air_filters',
      'rad_shield_basic',
      'heat_radiator_basic',
      'mag_confinement',
    ],
    defaultEngineId: 'fdr_sunfire',
    mass: 800000, // kg
  },
  {
    id: 'leviathan',
    name: 'Prometheus FDR-III "Leviathan"',
    description:
      'Deep system hauler. Full torch capability with point defense. Can reach Jupiter and beyond. Expensive to own, expensive to run.',
    tier: 'III',
    price: 350_000_000,
    rooms: [
      'bridge',
      'engine_room',
      'reactor_room',
      'cantina',
      'medbay',
      'cargo_hold',
      'armory',
      'quarters',
      'point_defense_station',
    ],
    maxCrew: 16,
    unlockThreshold: 50_000_000,
    rangeLabel: 'Jupiter+',
    cargoCapacity: 200000,
    equipmentSlots: 10,
    equipmentSlotDefs: [
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard'] },
      { tags: ['standard', 'structural'] },
      { tags: ['standard', 'structural'] },
    ],
    features: ['rotating_habitat'],
    defaultEquipment: [
      'life_support',
      'air_filters',
      'rad_shield_heavy',
      'heat_radiator_heavy',
      'mag_confinement',
      'point_defense',
      'accel_couches',
    ],
    defaultEngineId: 'fdr_hellion',
    mass: 1200000, // kg
  },
];

export function getShipClass(id: ShipClassId): ShipClass | undefined {
  return SHIP_CLASSES.find((sc) => sc.id === id);
}

export function getUnlockedShipClasses(
  lifetimeCreditsEarned: number = 0
): ShipClass[] {
  return SHIP_CLASSES.filter(
    (sc) => sc.unlockThreshold <= lifetimeCreditsEarned
  );
}
