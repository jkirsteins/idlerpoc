import type { OreId, LocationOre } from './models';

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
    baseValue: 8,
    miningLevelRequired: 0,
    weightPerUnit: 10,
  },
  {
    id: 'silicate',
    name: 'Silicate',
    description:
      'Silicon-rich mineral used in electronics and solar panel manufacturing.',
    icon: '💎',
    baseValue: 5,
    miningLevelRequired: 0,
    weightPerUnit: 8,
  },
  {
    id: 'copper_ore',
    name: 'Copper Ore',
    description:
      'Essential conductive material for wiring and electronics systems.',
    icon: '🟤',
    baseValue: 15,
    miningLevelRequired: 10,
    weightPerUnit: 12,
  },
  {
    id: 'water_ice',
    name: 'Water Ice',
    description:
      'Frozen water from regolith and subsurface deposits. Essential for hydrogen fuel production, life support, and radiation shielding.',
    icon: '🧊',
    baseValue: 12,
    miningLevelRequired: 5,
    weightPerUnit: 15,
  },
  {
    id: 'rare_earth',
    name: 'Rare Earth Elements',
    description:
      'Critical minerals for advanced magnets, sensors, and fusion components.',
    icon: '✨',
    baseValue: 35,
    miningLevelRequired: 10,
    weightPerUnit: 5,
  },
  {
    id: 'titanium_ore',
    name: 'Titanium Ore',
    description:
      'High-strength, low-mass alloy precursor. Premium shipbuilding material.',
    icon: '🔩',
    baseValue: 60,
    miningLevelRequired: 25,
    weightPerUnit: 15,
  },
  {
    id: 'platinum_ore',
    name: 'Platinum Ore',
    description:
      'Precious metal used in catalytic systems and high-end electronics.',
    icon: '🪙',
    baseValue: 120,
    miningLevelRequired: 40,
    weightPerUnit: 8,
  },
  {
    id: 'helium3',
    name: 'Helium-3',
    description:
      'Fusion fuel isotope extracted from regolith and gas giant atmospheres.',
    icon: '⚛️',
    baseValue: 250,
    miningLevelRequired: 60,
    weightPerUnit: 2,
  },
  {
    id: 'exotic_matter',
    name: 'Exotic Matter',
    description:
      'Anomalous material with negative energy density. Used in experimental gap drive research.',
    icon: '🌀',
    baseValue: 500,
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

// ─── LocationOre helpers ────────────────────────────────────────

/** Extract ore IDs from a location's availableOres array. */
export function getLocationOreIds(availableOres?: LocationOre[]): OreId[] {
  if (!availableOres) return [];
  return availableOres.map((o) => o.oreId);
}

/** Get the yield multiplier for a specific ore at a location (default 1.0). */
export function getLocationOreYieldMultiplier(
  availableOres: LocationOre[] | undefined,
  oreId: OreId
): number {
  if (!availableOres) return 1.0;
  const entry = availableOres.find((o) => o.oreId === oreId);
  return entry?.yieldMultiplier ?? 1.0;
}

/** Check if an ore is available at a location. */
export function isOreAvailableAtLocation(
  availableOres: LocationOre[] | undefined,
  oreId: OreId
): boolean {
  if (!availableOres) return false;
  return availableOres.some((o) => o.oreId === oreId);
}
