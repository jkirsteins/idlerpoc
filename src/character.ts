export type Background = 'street_vendor' | 'bus_driver';

export interface Skills {
  charisma: number;
  strength: number;
}

export interface Character {
  name: string;
  background: Background;
  skills: Skills;
  createdAt: number;
}

export const BACKGROUNDS: {
  id: Background;
  label: string;
  description: string;
}[] = [
  {
    id: 'street_vendor',
    label: 'Street Vendor',
    description: 'Quick-witted trader from the market districts',
  },
  {
    id: 'bus_driver',
    label: 'Bus Driver',
    description: 'Reliable worker who knows the city routes',
  },
];

export const SKILL_NAMES: (keyof Skills)[] = ['charisma', 'strength'];

export const TOTAL_SKILL_POINTS = 10;

export function createCharacter(
  name: string,
  background: Background,
  skills: Skills
): Character {
  return {
    name,
    background,
    skills,
    createdAt: Date.now(),
  };
}

export function getBackgroundLabel(background: Background): string {
  return BACKGROUNDS.find((b) => b.id === background)?.label ?? background;
}
