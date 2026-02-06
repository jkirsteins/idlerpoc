import type { EquipmentId } from './models';

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  description: string;
  icon: string;
  powerDraw: number;
  hasDegradation: boolean;
}

export const EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
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
];

export function getEquipmentDefinition(
  id: EquipmentId
): EquipmentDefinition | undefined {
  return EQUIPMENT_DEFINITIONS.find((eq) => eq.id === id);
}

export function getAllEquipmentDefinitions(): EquipmentDefinition[] {
  return EQUIPMENT_DEFINITIONS;
}
