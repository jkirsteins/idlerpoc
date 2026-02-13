import type { CrewMember, CrewPersonality, PersonalityTrait } from './models';

/**
 * Personality System
 *
 * Generates deterministic personality traits for crew members based on their ID.
 * Traits provide light mechanical effects (±5-10%) and color narrative text.
 *
 * See docs/emergent-storytelling.md for full trait effect table.
 */

const ALL_TRAITS: PersonalityTrait[] = [
  'stoic',
  'reckless',
  'cautious',
  'gregarious',
  'meticulous',
  'pragmatic',
  'idealistic',
  'sardonic',
  'loyal',
  'ambitious',
];

/**
 * Simple deterministic hash of a string to a number.
 * Uses DJB2 algorithm variant for stable, well-distributed output.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Generate a deterministic personality from a crew member's ID.
 * Always returns the same personality for the same ID.
 */
export function generatePersonality(crewId: string): CrewPersonality {
  const hash1 = hashString(crewId);
  const hash2 = hashString(crewId + '_trait2');

  const idx1 = hash1 % ALL_TRAITS.length;
  let idx2 = hash2 % ALL_TRAITS.length;

  // Ensure traits are different
  if (idx2 === idx1) {
    idx2 = (idx2 + 1) % ALL_TRAITS.length;
  }

  return {
    trait1: ALL_TRAITS[idx1],
    trait2: ALL_TRAITS[idx2],
  };
}

/**
 * Categories of mechanical effects that personality traits can modify.
 */
export type TraitEffect =
  | 'training_speed'
  | 'combat_attack'
  | 'evasion'
  | 'repair_speed'
  | 'negotiation'
  | 'mining_yield'
  | 'trade_income'
  | 'encounter_rate'
  | 'morale_recovery'
  | 'departure_resistance'
  | 'salary_expectation';

/**
 * Map of trait → effect → modifier (additive, e.g. +0.10 = +10%).
 * Positive values are bonuses, negative are penalties.
 */
const TRAIT_EFFECTS: Record<
  PersonalityTrait,
  Partial<Record<TraitEffect, number>>
> = {
  stoic: {
    morale_recovery: 0.1,
    training_speed: -0.05,
  },
  reckless: {
    combat_attack: 0.1,
    encounter_rate: 0.05,
  },
  cautious: {
    evasion: 0.05,
    mining_yield: -0.05,
  },
  gregarious: {
    negotiation: 0.1,
    // Solo task penalty omitted — no clear single mechanic to map to
  },
  meticulous: {
    repair_speed: 0.1,
    combat_attack: -0.05,
  },
  pragmatic: {
    trade_income: 0.05,
    // Gravity assist penalty would require plumbing; deferred
  },
  idealistic: {
    morale_recovery: 0.1,
    departure_resistance: -0.1, // Less tolerant of unpaid salary
  },
  sardonic: {
    morale_recovery: 0.05, // Entertainment value for shipmates
    negotiation: -0.05,
  },
  loyal: {
    departure_resistance: 0.25,
    trade_income: -0.05,
  },
  ambitious: {
    training_speed: 0.1,
    salary_expectation: 0.1,
  },
};

/**
 * Get the combined modifier for a specific effect from a crew member's
 * personality traits. Returns a multiplier (e.g. 1.10 for +10%).
 *
 * If the crew member has no personality, returns 1.0 (neutral).
 * Both traits stack additively: trait1 gives +10%, trait2 gives -5% → 1.05.
 */
export function getTraitModifier(
  crew: CrewMember,
  effect: TraitEffect
): number {
  if (!crew.personality) return 1.0;

  const mod1 = TRAIT_EFFECTS[crew.personality.trait1][effect] ?? 0;
  const mod2 = TRAIT_EFFECTS[crew.personality.trait2][effect] ?? 0;

  return 1.0 + mod1 + mod2;
}

/**
 * Get a human-readable display name for a personality trait.
 */
export function getTraitDisplayName(trait: PersonalityTrait): string {
  return trait.charAt(0).toUpperCase() + trait.slice(1);
}

/**
 * Get a short description of what a personality trait does.
 */
export function getTraitDescription(trait: PersonalityTrait): string {
  switch (trait) {
    case 'stoic':
      return 'Resilient under stress, but slower to learn';
    case 'reckless':
      return 'Fierce in combat, but attracts trouble';
    case 'cautious':
      return 'Sharp-eyed in evasion, but cautious when mining';
    case 'gregarious':
      return 'Natural negotiator, but less focused alone';
    case 'meticulous':
      return 'Excellent at repairs, but overthinks in combat';
    case 'pragmatic':
      return 'Good business sense, plays it safe';
    case 'idealistic':
      return 'Boosts morale, but demands fair pay';
    case 'sardonic':
      return 'Entertaining shipmate, but abrasive in negotiations';
    case 'loyal':
      return 'Sticks around through hardship, but not profit-driven';
    case 'ambitious':
      return 'Fast learner, but expects higher wages';
  }
}
