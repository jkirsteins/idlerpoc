export type CrewEquipmentId =
  | 'sidearm'
  | 'rifle'
  | 'toolkit'
  | 'medkit'
  | 'scanner'
  | 'rebreather'
  | 'wrist_terminal'
  | 'armored_vest'
  | 'g_seat';

export type CrewEquipmentCategory = 'weapon' | 'tool' | 'accessory' | 'armor';

export interface CrewEquipmentDefinition {
  id: CrewEquipmentId;
  name: string;
  description: string;
  icon: string;
  category: CrewEquipmentCategory;
  weight: number; // kg
  value: number; // credits
  storageUnits: number;
  attackScore: number;
}

export const CREW_EQUIPMENT_DEFINITIONS: CrewEquipmentDefinition[] = [
  // Weapons
  {
    id: 'sidearm',
    name: 'VP-7 Sidearm',
    description:
      'Standard issue personal defense weapon. Compact and reliable.',
    icon: '🔫',
    category: 'weapon',
    weight: 1.2,
    value: 800,
    storageUnits: 1,
    attackScore: 3,
  },
  {
    id: 'rifle',
    name: 'KR-15 Assault Rifle',
    description:
      'Military-grade combat rifle. High stopping power for boarding actions.',
    icon: '🔫',
    category: 'weapon',
    weight: 4.5,
    value: 3500,
    storageUnits: 3,
    attackScore: 7,
  },

  // Tools
  {
    id: 'toolkit',
    name: 'Engineer Toolkit',
    description:
      'Comprehensive repair kit with diagnostic tools and spare components.',
    icon: '🔧',
    category: 'tool',
    weight: 3.0,
    value: 1200,
    storageUnits: 2,
    attackScore: 0,
  },
  {
    id: 'medkit',
    name: 'Field Medical Kit',
    description:
      'Emergency medical supplies for treating injuries in the field.',
    icon: '💉',
    category: 'tool',
    weight: 2.5,
    value: 1500,
    storageUnits: 2,
    attackScore: 0,
  },
  {
    id: 'scanner',
    name: 'Handheld Scanner',
    description:
      'Multi-purpose scanner for detecting life signs, energy signatures, and anomalies.',
    icon: '📡',
    category: 'tool',
    weight: 0.8,
    value: 2000,
    storageUnits: 1,
    attackScore: 0,
  },

  // Accessories
  {
    id: 'rebreather',
    name: 'Emergency Rebreather',
    description:
      'Personal life support unit providing 4 hours of breathable air.',
    icon: '😷',
    category: 'accessory',
    weight: 1.5,
    value: 600,
    storageUnits: 1,
    attackScore: 0,
  },
  {
    id: 'wrist_terminal',
    name: 'Wrist Terminal',
    description:
      'Personal computer and communicator. Essential for ship operations.',
    icon: '⌚',
    category: 'accessory',
    weight: 0.3,
    value: 450,
    storageUnits: 1,
    attackScore: 0,
  },

  // Armor
  {
    id: 'armored_vest',
    name: 'Ballistic Vest',
    description:
      'Lightweight armor providing protection against small arms fire.',
    icon: '🦺',
    category: 'armor',
    weight: 3.5,
    value: 2200,
    storageUnits: 2,
    attackScore: 0,
  },
  {
    id: 'g_seat',
    name: 'G-Seat Harness',
    description:
      'Compression harness simulating gravitational load. Reduces zero-g exposure rate by 30%.',
    icon: '💺',
    category: 'accessory',
    weight: 8.0,
    value: 3500,
    storageUnits: 3,
    attackScore: 0,
  },
];

export function getCrewEquipmentDefinition(
  id: CrewEquipmentId
): CrewEquipmentDefinition {
  const equipment = CREW_EQUIPMENT_DEFINITIONS.find((e) => e.id === id);
  if (!equipment) {
    throw new Error(`Crew equipment definition not found: ${id}`);
  }
  return equipment;
}

export function getAllCrewEquipmentDefinitions(): CrewEquipmentDefinition[] {
  return CREW_EQUIPMENT_DEFINITIONS;
}

export function getCrewEquipmentByCategory(
  category: CrewEquipmentCategory
): CrewEquipmentDefinition[] {
  return CREW_EQUIPMENT_DEFINITIONS.filter((e) => e.category === category);
}
