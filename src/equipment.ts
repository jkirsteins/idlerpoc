import type { EquipmentId } from './models';

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  description: string;
  icon: string;
  powerDraw: number;
  hasDegradation: boolean;
  radiationShielding?: number; // 0-100+ radiation blocked
  heatDissipation?: number; // kW-thermal dissipated
}

export const EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
  // Life Support (existing)
  {
    id: 'life_support',
    name: 'Life Support System',
    description: 'O2 generation, CO2 scrubbing, atmosphere management',
    icon: '🌬️',
    powerDraw: 12,
    hasDegradation: false,
  },
  {
    id: 'air_filters',
    name: 'Air Filtration Unit',
    description: 'Particulate filters; degrade over time',
    icon: '🔬',
    powerDraw: 5,
    hasDegradation: true,
  },
  // Shielding
  {
    id: 'rad_shield_basic',
    name: 'Type-I Radiation Barrier',
    description: 'Basic radiation shielding. Handles fission + low fusion.',
    icon: '🛡️',
    powerDraw: 8,
    hasDegradation: true,
    radiationShielding: 30,
  },
  {
    id: 'rad_shield_heavy',
    name: 'Type-III Radiation Vault',
    description: 'Heavy shielding required for mid/high fusion drives.',
    icon: '🛡️',
    powerDraw: 20,
    hasDegradation: true,
    radiationShielding: 70,
  },
  // Thermal
  {
    id: 'heat_radiator_basic',
    name: 'Fold-Out Radiator Array',
    description: 'Passive radiator panels for heat dissipation.',
    icon: '📡',
    powerDraw: 10,
    hasDegradation: true,
    heatDissipation: 100,
  },
  {
    id: 'heat_radiator_heavy',
    name: 'Active Coolant System',
    description: 'Active cooling loops. High capacity, high maintenance.',
    icon: '❄️',
    powerDraw: 25,
    hasDegradation: true,
    heatDissipation: 300,
  },
  // Defense & Navigation
  {
    id: 'point_defense',
    name: 'PD-40 Flak Turret',
    description: 'Automated point defense. Destroys debris in flight path.',
    icon: '🎯',
    powerDraw: 30,
    hasDegradation: true,
  },
  {
    id: 'deflector_shield',
    name: 'Magnetic Debris Deflector',
    description: 'Passive magnetic field deflects micro-debris.',
    icon: '🧲',
    powerDraw: 15,
    hasDegradation: false,
  },
  {
    id: 'nav_scanner',
    name: 'Deep-Space Hazard Scanner',
    description: 'Extends detection range. Improves route quality.',
    icon: '📊',
    powerDraw: 12,
    hasDegradation: false,
  },
  // Structural
  {
    id: 'mag_confinement',
    name: 'Fusion Containment Stabilizer',
    description:
      'Prevents reactor instability. Degradation = radiation spikes.',
    icon: '⚙️',
    powerDraw: 18,
    hasDegradation: true,
  },
  {
    id: 'accel_couches',
    name: 'G-Compensation Gel Couches',
    description: 'Comfortable acceleration up to ~0.08g.',
    icon: '🛏️',
    powerDraw: 5,
    hasDegradation: false,
  },
  {
    id: 'crash_couches',
    name: 'Full-Immersion Crash Pods',
    description: 'Class IV g-force protection. Safe threshold ~3g.',
    icon: '💺',
    powerDraw: 15,
    hasDegradation: false,
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
