export type LocationType =
  | 'planet'
  | 'space_station'
  | 'asteroid_belt'
  | 'planetoid'
  | 'moon'
  | 'orbital';

export type LocationService = 'refuel' | 'trade' | 'repair' | 'hire' | 'mine';

export interface LocationTypeTemplate {
  type: LocationType;
  name: string;
  icon: string;
  defaultServices: LocationService[];
  canDock: boolean;
  description: string;
}

export const LOCATION_TYPE_TEMPLATES: LocationTypeTemplate[] = [
  {
    type: 'planet',
    name: 'Planet',
    icon: '🌍',
    defaultServices: ['refuel', 'trade', 'repair', 'hire'],
    canDock: true,
    description: 'Major planetary body with full orbital infrastructure.',
  },
  {
    type: 'space_station',
    name: 'Space Station',
    icon: '🛰️',
    defaultServices: ['refuel', 'trade', 'repair', 'hire'],
    canDock: true,
    description: 'Orbital station with comprehensive services.',
  },
  {
    type: 'asteroid_belt',
    name: 'Asteroid Belt',
    icon: '☄️',
    defaultServices: ['mine'],
    canDock: false,
    description: 'Mineral-rich asteroid field. Mining operations only.',
  },
  {
    type: 'planetoid',
    name: 'Planetoid',
    icon: '🪨',
    defaultServices: ['refuel', 'trade'],
    canDock: true,
    description: 'Small planetary body with limited infrastructure.',
  },
  {
    type: 'moon',
    name: 'Moon',
    icon: '🌙',
    defaultServices: ['refuel', 'mine'],
    canDock: true,
    description: 'Natural satellite with mining and refueling capability.',
  },
  {
    type: 'orbital',
    name: 'Orbital Platform',
    icon: '🔧',
    defaultServices: ['repair', 'refuel'],
    canDock: true,
    description: 'Specialized orbital maintenance facility.',
  },
];

export function getLocationTypeTemplate(
  type: LocationType
): LocationTypeTemplate {
  const template = LOCATION_TYPE_TEMPLATES.find((t) => t.type === type);
  if (!template) {
    throw new Error(`Location type template not found: ${type}`);
  }
  return template;
}

export function getAllLocationTypeTemplates(): LocationTypeTemplate[] {
  return LOCATION_TYPE_TEMPLATES;
}
