import type { EquipmentId, EquipmentSlotTag, EquipmentSlotDef } from './models';

export type EquipmentCategory =
  | 'life_support'
  | 'shielding'
  | 'thermal'
  | 'defense'
  | 'navigation'
  | 'structural'
  | 'gravity';

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  description: string;
  icon: string;
  category: EquipmentCategory;
  powerDraw: number;
  hasDegradation: boolean;
  requiredTags: EquipmentSlotTag[];
  radiationShielding?: number; // 0-100+ radiation blocked
  heatDissipation?: number; // kW-thermal dissipated
  oxygenOutput?: number; // O2 units generated per tick when powered
}

export const EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
  // Life Support
  {
    id: 'life_support',
    name: 'Life Support System',
    description: 'O2 generation, CO2 scrubbing, atmosphere management',
    icon: '🌬️',
    category: 'life_support',
    powerDraw: 12,
    hasDegradation: false,
    requiredTags: ['standard'],
    oxygenOutput: 12,
  },
  {
    id: 'air_filters',
    name: 'Air Filtration Unit',
    description: 'CO2 scrubbing and O2 recycling; degrades over time',
    icon: '🔬',
    category: 'life_support',
    powerDraw: 5,
    hasDegradation: true,
    requiredTags: ['standard'],
    oxygenOutput: 6,
  },
  // Shielding
  {
    id: 'rad_shield_basic',
    name: 'Type-I Radiation Barrier',
    description: 'Basic radiation shielding. Handles fission + low fusion.',
    icon: '🛡️',
    category: 'shielding',
    powerDraw: 8,
    hasDegradation: true,
    requiredTags: ['standard'],
    radiationShielding: 30,
  },
  {
    id: 'rad_shield_heavy',
    name: 'Type-III Radiation Vault',
    description: 'Heavy shielding required for mid/high fusion drives.',
    icon: '🛡️',
    category: 'shielding',
    powerDraw: 20,
    hasDegradation: true,
    requiredTags: ['standard'],
    radiationShielding: 70,
  },
  // Thermal
  {
    id: 'heat_radiator_basic',
    name: 'Fold-Out Radiator Array',
    description: 'Passive radiator panels for heat dissipation.',
    icon: '📡',
    category: 'thermal',
    powerDraw: 10,
    hasDegradation: true,
    requiredTags: ['standard'],
    heatDissipation: 100,
  },
  {
    id: 'heat_radiator_heavy',
    name: 'Active Coolant System',
    description: 'Active cooling loops. High capacity, high maintenance.',
    icon: '❄️',
    category: 'thermal',
    powerDraw: 25,
    hasDegradation: true,
    requiredTags: ['standard'],
    heatDissipation: 300,
  },
  // Defense & Navigation
  {
    id: 'point_defense',
    name: 'PD-40 Flak Turret',
    description: 'Automated point defense. Destroys debris in flight path.',
    icon: '🎯',
    category: 'defense',
    powerDraw: 30,
    hasDegradation: true,
    requiredTags: ['standard'],
  },
  {
    id: 'deflector_shield',
    name: 'Magnetic Debris Deflector',
    description: 'Passive magnetic field deflects micro-debris.',
    icon: '🧲',
    category: 'defense',
    powerDraw: 15,
    hasDegradation: false,
    requiredTags: ['standard'],
  },
  {
    id: 'nav_scanner',
    name: 'Deep-Space Hazard Scanner',
    description: 'Extends detection range. Improves route quality.',
    icon: '📊',
    category: 'navigation',
    powerDraw: 12,
    hasDegradation: false,
    requiredTags: ['standard'],
  },
  // Structural
  {
    id: 'mag_confinement',
    name: 'Fusion Containment Stabilizer',
    description:
      'Prevents reactor instability. Degradation = radiation spikes.',
    icon: '⚙️',
    category: 'structural',
    powerDraw: 18,
    hasDegradation: true,
    requiredTags: ['standard'],
  },
  {
    id: 'accel_couches',
    name: 'G-Compensation Gel Couches',
    description: 'Comfortable acceleration up to ~0.08g.',
    icon: '🛏️',
    category: 'gravity',
    powerDraw: 5,
    hasDegradation: false,
    requiredTags: ['standard'],
  },
  {
    id: 'crash_couches',
    name: 'Full-Immersion Crash Pods',
    description: 'Class IV g-force protection. Safe threshold ~3g.',
    icon: '💺',
    category: 'gravity',
    powerDraw: 15,
    hasDegradation: false,
    requiredTags: ['standard'],
  },
  // Basic Defense & Attack (Class I tier)
  {
    id: 'micro_deflector',
    name: 'EM-1 Micro Deflector',
    description:
      'Lightweight electromagnetic field generator. Deflects micro-debris and light projectiles.',
    icon: '🧲',
    category: 'defense',
    powerDraw: 6,
    hasDegradation: false,
    requiredTags: ['standard'],
  },
  {
    id: 'point_defense_laser',
    name: 'PD-10 Point Defense Laser',
    description:
      'Compact automated laser turret. Low power but effective against small threats.',
    icon: '🔫',
    category: 'defense',
    powerDraw: 10,
    hasDegradation: true,
    requiredTags: ['standard'],
  },
  // Gravity Systems
  {
    id: 'centrifuge_pod',
    name: 'Rotating Gravity Module',
    description: 'Rotating gravity module. Provides ~0.3g spin gravity.',
    icon: '🔄',
    category: 'gravity',
    powerDraw: 25,
    hasDegradation: false,
    requiredTags: ['structural'],
  },
  {
    id: 'exercise_module',
    name: 'Resistance Training Equipment',
    description:
      'Resistance training equipment. Slows zero-g degradation by 50%.',
    icon: '💪',
    category: 'gravity',
    powerDraw: 8,
    hasDegradation: false,
    requiredTags: ['standard'],
  },
];

export function getEquipmentDefinition(
  id: EquipmentId
): EquipmentDefinition | undefined {
  return EQUIPMENT_DEFINITIONS.find((eq) => eq.id === id);
}

export function getAllEquipmentDefinitions(): EquipmentDefinition[] {
  return EQUIPMENT_DEFINITIONS;
}

export function canEquipInSlot(
  equipDef: EquipmentDefinition,
  slot: EquipmentSlotDef
): boolean {
  return equipDef.requiredTags.some((tag) => slot.tags.includes(tag));
}

export function getCategoryLabel(category: EquipmentCategory): string {
  switch (category) {
    case 'life_support':
      return 'LIFE SUPPORT';
    case 'shielding':
      return 'SHIELDING';
    case 'thermal':
      return 'THERMAL';
    case 'defense':
      return 'DEFENSE';
    case 'navigation':
      return 'NAVIGATION';
    case 'structural':
      return 'STRUCTURAL';
    case 'gravity':
      return 'GRAVITY';
  }
}
