// Foraging System - Skill progression and mastery

import type { Worker } from './models/swarmTypes';
import { SWARM_CONSTANTS } from './models/swarmTypes';

// ============================================================================
// SKILL PROGRESSION
// ============================================================================

// Direct training (no XP intermediary) - power law diminishing returns
// Based on activity, not time

const SKILL_RATE_SCALE = 1724;
const SKILL_CURVE_K = 5;
const SKILL_CURVE_P = 3.2;

export function calculateSkillGainRate(currentSkill: number): number {
  return (
    SKILL_RATE_SCALE / Math.pow(1 + currentSkill / SKILL_CURVE_K, SKILL_CURVE_P)
  );
}

export function gainForagingSkill(worker: Worker, foodGathered: number): void {
  // Gain based on activity (food gathered), not time
  const baseGain = calculateSkillGainRate(worker.skills.foraging);
  const activityMultiplier = foodGathered * 10; // Scale by activity

  const gain = (baseGain * activityMultiplier) / 1000000; // Scale down

  worker.skills.foraging = Math.min(100, worker.skills.foraging + gain);
}

// ============================================================================
// MASTERY PROGRESSION (RuneScape-style XP curve)
// ============================================================================

// XP for level L: XP = (L-1) + 300 * 2^((L-1)/7)
// Simplified: Use cumulative XP curve

function generateMasteryXpTable(): number[] {
  const table: number[] = [];
  let cumulativeXp = 0;

  for (let level = 1; level <= 99; level++) {
    const xpForLevel = level - 1 + 300 * Math.pow(2, (level - 1) / 7);
    cumulativeXp += xpForLevel;
    table[level] = cumulativeXp;
  }

  return table;
}

// eslint-disable-next-line top/no-top-level-side-effects
const MASTERY_XP_TABLE: number[] = generateMasteryXpTable();

// Total XP for level 99: ~13M
export const MASTERY_99_XP = 13034431;

export function getMasteryLevel(xp: number): number {
  for (let level = 99; level >= 1; level--) {
    if (xp >= MASTERY_XP_TABLE[level]) {
      return level;
    }
  }
  return 0;
}

export function getMasteryXpForLevel(level: number): number {
  return MASTERY_XP_TABLE[level] || 0;
}

// ============================================================================
// MASTERY XP GAIN
// ============================================================================

export function gainMasteryXp(
  worker: Worker,
  _foodType: 'surface_lichen',
  foodGathered: number
): void {
  // XP per food unit gathered
  const xpPerUnit = 10;
  const xpGained = foodGathered * xpPerUnit;

  worker.skills.mastery.surfaceLichen += xpGained;

  // Check for level up (visual feedback handled elsewhere)
  void getMasteryLevel(worker.skills.mastery.surfaceLichen);
  // Could emit event here for level-up notification
}

// ============================================================================
// GATHERING RATE CALCULATION
// ============================================================================

export interface GatherRateModifiers {
  skillBonus: number;
  masteryBonus: number;
  zoneEfficiency: number;
  neuralEfficiency: number;
}

export function calculateGatherRate(
  worker: Worker,
  zoneBiomassRate: number,
  neuralEfficiency: number
): { rate: number; modifiers: GatherRateModifiers } {
  const baseRate = SWARM_CONSTANTS.BASE_GATHER_RATE;

  // Skill modifier: 0 skill = 1x, 100 skill = 2x
  const skillBonus = 1 + worker.skills.foraging / 100;

  // Mastery modifier: 0 mastery = 1x, 99 mastery = 2x
  const masteryBonus = 1 + worker.skills.mastery.surfaceLichen / 200;

  // Zone efficiency: available biomass / base rate
  const zoneEfficiency = Math.min(
    1,
    zoneBiomassRate / SWARM_CONSTANTS.BASE_GATHER_RATE
  );

  // Apply neural efficiency (coordination penalty)
  const rate =
    baseRate * skillBonus * masteryBonus * zoneEfficiency * neuralEfficiency;

  return {
    rate,
    modifiers: {
      skillBonus,
      masteryBonus,
      zoneEfficiency,
      neuralEfficiency,
    },
  };
}

// ============================================================================
// SKILL RANKS (for display)
// ============================================================================

export const FORAGING_RANKS = [
  {
    min: 0,
    max: 5,
    name: 'Untrained',
    description: 'Learning basic extraction',
  },
  { min: 5, max: 12, name: 'Green', description: 'Novice forager' },
  {
    min: 12,
    max: 20,
    name: 'Novice',
    description: 'Competent at basic gathering',
  },
  { min: 20, max: 30, name: 'Apprentice', description: 'Developing technique' },
  { min: 30, max: 40, name: 'Competent', description: 'Reliable gatherer' },
  { min: 40, max: 55, name: 'Able', description: 'Skilled extraction' },
  { min: 55, max: 70, name: 'Proficient', description: 'Efficient forager' },
  { min: 70, max: 83, name: 'Skilled', description: 'Expert gatherer' },
  {
    min: 83,
    max: 95,
    name: 'Expert',
    description: 'Master of biomass extraction',
  },
  {
    min: 95,
    max: 100,
    name: 'Master',
    description: 'Perfected the art of foraging',
  },
];

export function getForagingRank(skill: number): string {
  const rank = FORAGING_RANKS.find((r) => skill >= r.min && skill < r.max);
  return rank?.name || 'Unknown';
}

export function getForagingRankDescription(skill: number): string {
  const rank = FORAGING_RANKS.find((r) => skill >= r.min && skill < r.max);
  return rank?.description || '';
}

// ============================================================================
// MASTERY BONUSES
// ============================================================================

export function getMasteryEnergyBonus(masteryLevel: number): number {
  // Bonus to energy yield from gathered food
  if (masteryLevel >= 99) return 1.0; // +100%
  if (masteryLevel >= 75) return 0.5; // +50%
  if (masteryLevel >= 50) return 0.25; // +25%
  if (masteryLevel >= 25) return 0.1; // +10%
  return 0;
}

export function getMasteryDisplayBonuses(masteryLevel: number): string[] {
  const bonuses: string[] = [];

  if (masteryLevel >= 99) {
    bonuses.push('+100% energy yield');
    bonuses.push('Perfect extraction');
  } else if (masteryLevel >= 75) {
    bonuses.push('+50% energy yield');
    bonuses.push('Next: +100% at level 99');
  } else if (masteryLevel >= 50) {
    bonuses.push('+25% energy yield');
    bonuses.push('Next: +50% at level 75');
  } else if (masteryLevel >= 25) {
    bonuses.push('+10% energy yield');
    bonuses.push('Next: +25% at level 50');
  } else {
    bonuses.push('Next: +10% at level 25');
  }

  return bonuses;
}
