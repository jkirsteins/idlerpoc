import type { OreId } from './models';

export interface OreDefinition {
  id: OreId;
  name: string;
  description: string;
  icon: string;
  baseValue: number; // credits per unit
  miningLevelRequired: number; // minimum mining skill
  weightPerUnit: number; // kg per unit
}

export const ORE_DEFINITIONS: OreDefinition[] = [
  {
    id: 'iron_ore',
    name: 'Iron Ore',
    description:
      'Common ferrous mineral. Primary structural material for station construction.',
    icon: '⛏️',
    baseValue: 5,
    miningLevelRequired: 0,
    weightPerUnit: 10,
  },
  {
    id: 'silicate',
    name: 'Silicate',
    description:
      'Silicon-rich mineral used in electronics and solar panel manufacturing.',
    icon: '💎',
    baseValue: 3,
    miningLevelRequired: 0,
    weightPerUnit: 8,
  },
  {
    id: 'copper_ore',
    name: 'Copper Ore',
    description:
      'Essential conductive material for wiring and electronics systems.',
    icon: '🟤',
    baseValue: 8,
    miningLevelRequired: 10,
    weightPerUnit: 12,
  },
  {
    id: 'rare_earth',
    name: 'Rare Earth Elements',
    description:
      'Critical minerals for advanced magnets, sensors, and fusion components.',
    icon: '✨',
    baseValue: 15,
    miningLevelRequired: 10,
    weightPerUnit: 5,
  },
  {
    id: 'titanium_ore',
    name: 'Titanium Ore',
    description:
      'High-strength, low-mass alloy precursor. Premium shipbuilding material.',
    icon: '🔩',
    baseValue: 25,
    miningLevelRequired: 25,
    weightPerUnit: 15,
  },
  {
    id: 'platinum_ore',
    name: 'Platinum Ore',
    description:
      'Precious metal used in catalytic systems and high-end electronics.',
    icon: '🪙',
    baseValue: 50,
    miningLevelRequired: 40,
    weightPerUnit: 8,
  },
  {
    id: 'helium3',
    name: 'Helium-3',
    description:
      'Fusion fuel isotope extracted from regolith and gas giant atmospheres.',
    icon: '⚛️',
    baseValue: 80,
    miningLevelRequired: 60,
    weightPerUnit: 2,
  },
  {
    id: 'exotic_matter',
    name: 'Exotic Matter',
    description:
      'Anomalous material with negative energy density. Used in experimental gap drive research.',
    icon: '🌀',
    baseValue: 200,
    miningLevelRequired: 90,
    weightPerUnit: 1,
  },
];

export function getOreDefinition(id: OreId): OreDefinition {
  const ore = ORE_DEFINITIONS.find((o) => o.id === id);
  if (!ore) {
    throw new Error(`Ore definition not found: ${id}`);
  }
  return ore;
}

export function getAllOreDefinitions(): OreDefinition[] {
  return ORE_DEFINITIONS;
}

/**
 * Check if a crew member's mining skill is sufficient to mine an ore.
 */
export function canMineOre(miningSkill: number, oreId: OreId): boolean {
  const ore = getOreDefinition(oreId);
  return Math.floor(miningSkill) >= ore.miningLevelRequired;
}

/**
 * Get all ores a crew member can mine at their current level.
 */
export function getMinableOres(miningSkill: number): OreDefinition[] {
  return ORE_DEFINITIONS.filter(
    (ore) => Math.floor(miningSkill) >= ore.miningLevelRequired
  );
}
