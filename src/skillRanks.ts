import type { SkillId, ShipClassTier } from './models';

/**
 * Skill Rank System
 *
 * 10 named ranks distributed non-linearly: more labels at low levels
 * (where progression is fast due to diminishing returns, cheap dopamine)
 * and fewer labels at high levels (where each rank feels earned).
 *
 * Distribution:
 *   0-4:   Untrained   (5 levels)
 *   5-11:  Green       (7 levels)
 *   12-19: Novice      (8 levels)
 *   20-29: Apprentice  (10 levels)
 *   30-39: Competent   (10 levels)
 *   40-54: Able        (15 levels)
 *   55-69: Proficient  (15 levels)
 *   70-82: Skilled     (13 levels)
 *   83-94: Expert      (12 levels)
 *   95-100: Master     (6 levels)
 */

export interface SkillRank {
  name: string;
  minLevel: number;
  /** Index 0-9 for ordering / comparison */
  index: number;
}

export const SKILL_RANKS: SkillRank[] = [
  { name: 'Untrained', minLevel: 0, index: 0 },
  { name: 'Green', minLevel: 5, index: 1 },
  { name: 'Novice', minLevel: 12, index: 2 },
  { name: 'Apprentice', minLevel: 20, index: 3 },
  { name: 'Competent', minLevel: 30, index: 4 },
  { name: 'Able', minLevel: 40, index: 5 },
  { name: 'Proficient', minLevel: 55, index: 6 },
  { name: 'Skilled', minLevel: 70, index: 7 },
  { name: 'Expert', minLevel: 83, index: 8 },
  { name: 'Master', minLevel: 95, index: 9 },
];

/**
 * Get the rank for a given skill level (integer floor).
 */
export function getSkillRank(skillLevel: number): SkillRank {
  const level = Math.floor(skillLevel);
  for (let i = SKILL_RANKS.length - 1; i >= 0; i--) {
    if (level >= SKILL_RANKS[i].minLevel) {
      return SKILL_RANKS[i];
    }
  }
  return SKILL_RANKS[0];
}

/**
 * Get the next rank above the current level, or null if Master.
 */
export function getNextRank(skillLevel: number): SkillRank | null {
  const currentRank = getSkillRank(skillLevel);
  const nextIndex = currentRank.index + 1;
  if (nextIndex >= SKILL_RANKS.length) return null;
  return SKILL_RANKS[nextIndex];
}

/**
 * Get progress toward the next rank as 0-100%.
 * Returns 100 if at Master rank.
 */
export function getRankProgress(skillLevel: number): number {
  const currentRank = getSkillRank(skillLevel);
  const nextRank = getNextRank(skillLevel);
  if (!nextRank) return 100;

  const rangeStart = currentRank.minLevel;
  const rangeEnd = nextRank.minLevel;
  const progress = (skillLevel - rangeStart) / (rangeEnd - rangeStart);
  return Math.min(100, Math.max(0, progress * 100));
}

/**
 * Check if a skill level crossed a rank boundary.
 * Returns the new rank name if crossed, null otherwise.
 */
export function checkRankCrossing(
  oldLevel: number,
  newLevel: number
): SkillRank | null {
  const oldRank = getSkillRank(oldLevel);
  const newRank = getSkillRank(newLevel);
  if (newRank.index > oldRank.index) {
    return newRank;
  }
  return null;
}

// ─── Skill-Linked Gameplay Unlocks ────────────────────────────────

/**
 * Minimum piloting skill required to fly each ship class tier.
 * Class I is available to everyone (orbital ops, basic).
 */
export const PILOTING_TIER_REQUIREMENTS: Record<ShipClassTier, number> = {
  I: 0,
  II: 25,
  III: 50,
  IV: 75,
  V: 95,
};

/**
 * Check if a pilot skill level is sufficient for a ship class tier.
 */
export function canPilotTier(
  pilotingSkill: number,
  tier: ShipClassTier
): boolean {
  return Math.floor(pilotingSkill) >= PILOTING_TIER_REQUIREMENTS[tier];
}

/**
 * Get the highest ship tier a given piloting skill can fly.
 */
export function getMaxPilotableTier(pilotingSkill: number): ShipClassTier {
  const level = Math.floor(pilotingSkill);
  const tiers: ShipClassTier[] = ['V', 'IV', 'III', 'II', 'I'];
  for (const tier of tiers) {
    if (level >= PILOTING_TIER_REQUIREMENTS[tier]) return tier;
  }
  return 'I';
}

/**
 * Skill-linked gameplay thresholds.
 *
 * Each skill has defined gameplay effects at certain rank boundaries:
 *
 * PILOTING:
 *   - 25 (Competent): Can pilot Class II ships
 *   - 50 (Able): Can pilot Class III torch ships
 *   - 75 (Skilled): Can pilot Class IV deep system cruisers
 *   - 95 (Master): Can pilot Class V gap-capable vessels
 *
 * [UNIMPLEMENTED — design-only, not in the current 3-skill system:]
 * ASTROGATION:
 *   - 25: Encounter avoidance bonus kicks in (skill factor active)
 *   - 50: Quest payment bonus from scanner crew
 *   - 75: Encounter detection range doubled (early warning)
 * ENGINEERING:
 *   - 25: Repair points start flowing from repair job slots
 *   - 50: Quest payment bonus from drive ops crew
 *   - 75: Repair efficiency doubled (2x points per tick)
 * STRENGTH:
 *   - 25: Boarding defense contributes to ship defense score
 *   - 50: Can operate heavy weapons (point defense turrets)
 *   - 75: Combat victory bounties increased 50%
 * CHARISMA:
 *   - 25: Negotiation attempts become available
 *   - 50: Quest payment bonus from galley/comms crew
 *   - 75: Negotiation auto-succeeds against low-threat pirates
 * LOYALTY:
 *   - 25: Crew morale decay reduced
 *   - 50: Crew salary reduced 10% (loyalty discount)
 *   - 75: Crew stays 50% longer before departing when unpaid
 *
 * COMMERCE (captain/first officer only — IMPLEMENTED):
 *   - 25: 5% better quest payment
 *   - 50: 10% fuel discount at stations
 *   - 75: 15% better quest payment + 15% fuel discount
 *   - 95: 20% better quest payment + 20% fuel discount
 */

/** Commerce bonus multiplier for quest payments (additive). */
export function getCommercePaymentBonus(commerceSkill: number): number {
  const level = Math.floor(commerceSkill);
  if (level >= 95) return 0.2;
  if (level >= 75) return 0.15;
  if (level >= 50) return 0.1;
  if (level >= 25) return 0.05;
  return 0;
}

/** Commerce fuel discount multiplier (subtractive from price). */
export function getCommerceFuelDiscount(commerceSkill: number): number {
  const level = Math.floor(commerceSkill);
  if (level >= 95) return 0.2;
  if (level >= 75) return 0.15;
  if (level >= 50) return 0.1;
  if (level >= 25) return 0.05;
  return 0;
}

// ─── Specialization System ────────────────────────────────────────

export interface SkillSpecialization {
  skillId: SkillId;
  /** The rank at which specialization was locked in */
  rankAtSpecialization: string;
  /** Game time when specialization was chosen */
  specializedAt: number;
}

/** Minimum skill level to specialize */
export const SPECIALIZATION_THRESHOLD = 50;

/** Training speed bonus for specialized skill */
export const SPECIALIZATION_BONUS = 0.5; // +50% training speed

/** Training speed penalty for non-specialized skills */
export const SPECIALIZATION_PENALTY = 0.25; // -25% training speed

/**
 * Check if a crew member can specialize in a skill.
 * Requirements: skill >= SPECIALIZATION_THRESHOLD, not already specialized.
 */
export function canSpecialize(
  skillLevel: number,
  existingSpecialization: SkillSpecialization | undefined
): boolean {
  return (
    Math.floor(skillLevel) >= SPECIALIZATION_THRESHOLD &&
    existingSpecialization === undefined
  );
}

/**
 * Get the training rate multiplier for a skill given specialization.
 * Returns 1.0 if no specialization, bonus for specialized skill,
 * penalty for non-specialized skills.
 */
export function getSpecializationMultiplier(
  skillId: SkillId,
  specialization: SkillSpecialization | undefined
): number {
  if (!specialization) return 1.0;
  if (specialization.skillId === skillId) return 1.0 + SPECIALIZATION_BONUS;
  return 1.0 - SPECIALIZATION_PENALTY;
}
