export type CrewEquipmentId =
  | 'sidearm'
  | 'rifle'
  | 'toolkit'
  | 'medkit'
  | 'scanner'
  | 'rebreather'
  | 'wrist_terminal'
  | 'armored_vest'
  | 'g_seat'
  | 'basic_mining_laser'
  | 'improved_mining_laser'
  | 'heavy_mining_drill'
  | 'deep_core_extractor'
  | 'fusion_assisted_drill'
  | 'quantum_resonance_drill';

export type CrewEquipmentCategory =
  | 'weapon'
  | 'tool'
  | 'accessory'
  | 'armor'
  | 'mining';

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
  miningRate?: number; // multiplier for mining yield (mining equipment only)
  miningLevelRequired?: number; // minimum mining skill to use (mining equipment only)
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

  // Mining Equipment
  {
    id: 'basic_mining_laser',
    name: 'ML-1 Mining Laser',
    description:
      'Entry-level thermal cutting laser for surface ore extraction.',
    icon: '⛏️',
    category: 'mining',
    weight: 5.0,
    value: 500,
    storageUnits: 2,
    attackScore: 0,
    miningRate: 1.0,
    miningLevelRequired: 0,
  },
  {
    id: 'improved_mining_laser',
    name: 'ML-3 Improved Mining Laser',
    description: 'Higher-powered laser with tighter beam focus. Cuts deeper.',
    icon: '⛏️',
    category: 'mining',
    weight: 7.0,
    value: 1500,
    storageUnits: 2,
    attackScore: 0,
    miningRate: 1.5,
    miningLevelRequired: 15,
  },
  {
    id: 'heavy_mining_drill',
    name: 'HD-50 Heavy Mining Drill',
    description:
      'Mechanical rotary drill for dense ore deposits. Requires physical strength.',
    icon: '⛏️',
    category: 'mining',
    weight: 15.0,
    value: 4000,
    storageUnits: 4,
    attackScore: 0,
    miningRate: 2.0,
    miningLevelRequired: 30,
  },
  {
    id: 'deep_core_extractor',
    name: 'DCE-7 Deep Core Extractor',
    description:
      'Resonance-based extraction system for reaching deep mineral veins.',
    icon: '⛏️',
    category: 'mining',
    weight: 12.0,
    value: 10000,
    storageUnits: 3,
    attackScore: 0,
    miningRate: 2.5,
    miningLevelRequired: 50,
  },
  {
    id: 'fusion_assisted_drill',
    name: 'FAD-12 Fusion-Assisted Drill',
    description:
      'Micro-fusion torch head for cutting through the hardest materials.',
    icon: '⛏️',
    category: 'mining',
    weight: 18.0,
    value: 25000,
    storageUnits: 5,
    attackScore: 0,
    miningRate: 3.5,
    miningLevelRequired: 75,
  },
  {
    id: 'quantum_resonance_drill',
    name: 'QRD-X Quantum Resonance Drill',
    description:
      'Experimental extraction device using quantum tunneling to separate exotic matter.',
    icon: '⛏️',
    category: 'mining',
    weight: 10.0,
    value: 75000,
    storageUnits: 3,
    attackScore: 0,
    miningRate: 5.0,
    miningLevelRequired: 90,
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

/**
 * Get the best mining equipment a crew member has equipped.
 * Returns undefined if no mining equipment is equipped.
 */
export function getBestMiningEquipment(
  equippedIds: CrewEquipmentId[]
): CrewEquipmentDefinition | undefined {
  const miningGear = equippedIds
    .map((id) => CREW_EQUIPMENT_DEFINITIONS.find((e) => e.id === id))
    .filter(
      (e): e is CrewEquipmentDefinition =>
        e !== undefined && e.category === 'mining'
    );
  if (miningGear.length === 0) return undefined;
  return miningGear.reduce((best, current) =>
    (current.miningRate ?? 0) > (best.miningRate ?? 0) ? current : best
  );
}
