import type { EquipmentId, EquipmentSlotTag, EquipmentSlotDef } from './models';

export type EquipmentCategory =
  | 'life_support'
  | 'shielding'
  | 'thermal'
  | 'defense'
  | 'navigation'
  | 'structural'
  | 'gravity'
  | 'mining';

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
  miningRate?: number; // extraction rate multiplier (ship-mounted mining equipment)
  miningLevelRequired?: number; // min crew mining skill to operate
  value?: number; // purchase price in credits
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
  // Mining Equipment (ship-mounted, operated by crew from mining bay)
  {
    id: 'mining_laser',
    name: 'Mining Laser Array',
    description:
      'Ship-mounted thermal cutting lasers for surface ore extraction. Operated from the mining bay.',
    icon: '⛏️',
    category: 'mining',
    powerDraw: 8,
    hasDegradation: true,
    requiredTags: ['standard'],
    miningRate: 1.0,
    miningLevelRequired: 0,
    value: 2000,
  },
  {
    id: 'mining_rig',
    name: 'Industrial Mining Rig',
    description:
      'Heavy-duty mechanical drill array with automated ore collection. Higher extraction rate.',
    icon: '⛏️',
    category: 'mining',
    powerDraw: 15,
    hasDegradation: true,
    requiredTags: ['standard'],
    miningRate: 2.0,
    miningLevelRequired: 20,
    value: 8000,
  },
  {
    id: 'deep_core_mining',
    name: 'Deep Core Extraction System',
    description:
      'Resonance-based extraction array for reaching deep mineral veins in dense asteroids.',
    icon: '⛏️',
    category: 'mining',
    powerDraw: 25,
    hasDegradation: true,
    requiredTags: ['standard'],
    miningRate: 3.5,
    miningLevelRequired: 50,
    value: 30000,
  },
  {
    id: 'quantum_mining',
    name: 'Quantum Resonance Array',
    description:
      'Experimental extraction system using quantum tunneling to separate exotic matter from asteroid cores.',
    icon: '⛏️',
    category: 'mining',
    powerDraw: 40,
    hasDegradation: true,
    requiredTags: ['standard'],
    miningRate: 5.0,
    miningLevelRequired: 80,
    value: 80000,
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
    case 'mining':
      return 'MINING';
  }
}

/**
 * Get the best mining equipment installed on a ship.
 * Returns undefined if no mining equipment is installed.
 */
export function getBestShipMiningEquipment(
  ship: import('./models').Ship
): EquipmentDefinition | undefined {
  const miningGear = ship.equipment
    .map((eq) => getEquipmentDefinition(eq.definitionId))
    .filter(
      (def): def is EquipmentDefinition =>
        def !== undefined && def.category === 'mining'
    );
  if (miningGear.length === 0) return undefined;
  return miningGear.reduce((best, current) =>
    (current.miningRate ?? 0) > (best.miningRate ?? 0) ? current : best
  );
}

/**
 * Get all mining equipment definitions, sorted by tier (cheapest first).
 */
export function getMiningEquipmentDefinitions(): EquipmentDefinition[] {
  return EQUIPMENT_DEFINITIONS.filter((eq) => eq.category === 'mining').sort(
    (a, b) => (a.value ?? 0) - (b.value ?? 0)
  );
}

/**
 * Degradation divisor for radiation shielding and heat dissipation equipment.
 * At 100% degradation the equipment is at 50% effectiveness (1 - 100/200).
 *
 * Oxygen equipment uses a separate divisor of 100 (full loss at max degradation)
 * — that is intentional and handled in lifeSupportSystem.ts.
 */
const EQUIPMENT_EFFECTIVENESS_DIVISOR = 200;

/**
 * Calculate total effective radiation shielding on a ship,
 * accounting for equipment degradation.
 */
export function getEffectiveRadiationShielding(
  ship: import('./models').Ship
): number {
  let total = 0;
  for (const eq of ship.equipment) {
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (eqDef?.radiationShielding) {
      const effectiveness =
        1 - eq.degradation / EQUIPMENT_EFFECTIVENESS_DIVISOR;
      total += eqDef.radiationShielding * effectiveness;
    }
  }
  return total;
}

/**
 * Calculate total effective heat dissipation on a ship,
 * accounting for equipment degradation.
 */
export function getEffectiveHeatDissipation(
  ship: import('./models').Ship
): number {
  let total = 0;
  for (const eq of ship.equipment) {
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (eqDef?.heatDissipation) {
      const effectiveness =
        1 - eq.degradation / EQUIPMENT_EFFECTIVENESS_DIVISOR;
      total += eqDef.heatDissipation * effectiveness;
    }
  }
  return total;
}
