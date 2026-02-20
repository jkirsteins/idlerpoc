import type {
  CrewMember,
  CrewPersonality,
  CrewDynamic,
  ChemistryType,
  PersonalityTrait,
} from './models';
import { hashString } from './utils';
import { TICKS_PER_DAY } from './timeSystem';

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
  },
  meticulous: {
    repair_speed: 0.1,
    combat_attack: -0.05,
  },
  pragmatic: {
    trade_income: 0.05,
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

// ─── Trait Chemistry System ─────────────────────────────────────
//
// Defines friction / synergy relationships between personality traits.
// Used to generate interpersonal narrative between crew on the same ship.

/** Canonical key for a trait pair (sorted alphabetically for dedup). */
function chemistryKey(a: PersonalityTrait, b: PersonalityTrait): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

interface ChemistryDef {
  type: ChemistryType;
  label: string; // short description of the dynamic
}

/**
 * Lookup table of trait-pair chemistry.
 * Keyed by sorted pair string. Only non-neutral pairs need entries.
 * Lazy-initialized to avoid top-level side effects.
 */
let _traitChemistry: Map<string, ChemistryDef> | null = null;
function getTraitChemistryMap(): Map<string, ChemistryDef> {
  if (!_traitChemistry) {
    _traitChemistry = new Map<string, ChemistryDef>([
      // ── Friction pairs ──
      [
        chemistryKey('reckless', 'cautious'),
        { type: 'friction', label: 'risk tolerance clash' },
      ],
      [
        chemistryKey('ambitious', 'loyal'),
        { type: 'friction', label: 'competing priorities' },
      ],
      [
        chemistryKey('idealistic', 'pragmatic'),
        { type: 'friction', label: 'values clash' },
      ],
      [
        chemistryKey('gregarious', 'stoic'),
        { type: 'friction', label: 'social tension' },
      ],
      [
        chemistryKey('meticulous', 'reckless'),
        { type: 'friction', label: 'process conflict' },
      ],
      [
        chemistryKey('ambitious', 'sardonic'),
        { type: 'friction', label: 'sincerity gap' },
      ],
      // ── Synergy pairs ──
      [
        chemistryKey('cautious', 'meticulous'),
        { type: 'synergy', label: 'shared rigor' },
      ],
      [
        chemistryKey('ambitious', 'pragmatic'),
        { type: 'synergy', label: 'mutual drive' },
      ],
      [
        chemistryKey('idealistic', 'loyal'),
        { type: 'synergy', label: 'shared conviction' },
      ],
    ]);
  }
  return _traitChemistry;
}

/**
 * Same-trait synergy: two crew sharing a trait creates resonance.
 * We only define the dramatically interesting same-trait pairings.
 */
const SAME_TRAIT_SYNERGY: Record<string, string> = {
  reckless: 'shared appetite for chaos',
  sardonic: 'shared dark humor',
  loyal: 'deep mutual commitment',
  cautious: 'overcautious standoff',
  ambitious: 'competitive drive',
};

/**
 * Get the chemistry between two individual traits.
 */
export function getTraitChemistry(
  traitA: PersonalityTrait,
  traitB: PersonalityTrait
): ChemistryType {
  // Same-trait check
  if (traitA === traitB) {
    return traitA in SAME_TRAIT_SYNERGY ? 'synergy' : 'neutral';
  }
  const def = getTraitChemistryMap().get(chemistryKey(traitA, traitB));
  return def?.type ?? 'neutral';
}

/**
 * Get a human-readable label for the chemistry between two traits.
 * Returns null for neutral pairings.
 */
export function getChemistryLabel(
  traitA: PersonalityTrait,
  traitB: PersonalityTrait
): string | null {
  if (traitA === traitB) {
    return SAME_TRAIT_SYNERGY[traitA] ?? null;
  }
  const def = getTraitChemistryMap().get(chemistryKey(traitA, traitB));
  return def?.label ?? null;
}

/**
 * Evaluate the interpersonal dynamic between two crew members.
 * Checks all 4 cross-trait pairings (A.t1↔B.t1, A.t1↔B.t2, A.t2↔B.t1, A.t2↔B.t2).
 * Returns the dominant chemistry with strength (fraction of pairings that matched).
 */
export function getCrewDynamic(
  crewA: CrewMember,
  crewB: CrewMember
): CrewDynamic {
  const result: CrewDynamic = {
    type: 'neutral',
    strength: 0,
    frictionPairs: [],
    synergyPairs: [],
  };

  if (!crewA.personality || !crewB.personality) return result;

  const pairs: Array<[PersonalityTrait, PersonalityTrait]> = [
    [crewA.personality.trait1, crewB.personality.trait1],
    [crewA.personality.trait1, crewB.personality.trait2],
    [crewA.personality.trait2, crewB.personality.trait1],
    [crewA.personality.trait2, crewB.personality.trait2],
  ];

  // Deduplicate (a sorted pair that appears twice due to cross-products)
  const seen = new Set<string>();

  for (const [tA, tB] of pairs) {
    const key = chemistryKey(tA, tB);
    if (seen.has(key)) continue;
    seen.add(key);

    const chem = getTraitChemistry(tA, tB);
    if (chem === 'friction') {
      result.frictionPairs.push([tA, tB]);
    } else if (chem === 'synergy') {
      result.synergyPairs.push([tA, tB]);
    }
  }

  const totalMatches = result.frictionPairs.length + result.synergyPairs.length;
  if (totalMatches === 0) return result;

  // Dominant type is whichever has more matches; friction wins ties
  if (result.frictionPairs.length >= result.synergyPairs.length) {
    result.type = 'friction';
  } else {
    result.type = 'synergy';
  }
  result.strength = totalMatches / seen.size;

  return result;
}

// ─── Ship Affinity (Crew-Ship Bond) ──────────────────────────────

/** Ticks to reach maximum affinity bonus (30 game days). */
const MAX_AFFINITY_TICKS = TICKS_PER_DAY * 30;

/** Maximum repair speed bonus from ship familiarity (+5%). */
const MAX_AFFINITY_BONUS = 0.05;

/**
 * Get a repair speed multiplier from a crew member's familiarity with their ship.
 * Returns 1.0 + bonus (e.g. 1.05 for max +5%). The bonus is emergent —
 * it derives from actual ticks spent on the ship, not a flat value.
 * Caps at +5% after 30 game days aboard.
 */
export function getShipAffinityModifier(crew: CrewMember): number {
  const affinity = crew.shipAffinity ?? 0;
  const fraction = Math.min(affinity / MAX_AFFINITY_TICKS, 1);
  return 1.0 + fraction * MAX_AFFINITY_BONUS;
}

/**
 * Get a personality-colored description of the crew's bond with their ship.
 * Returns null if affinity is too low (< 7 days) or no personality is set.
 */
export function getShipBondDescription(
  crew: CrewMember,
  shipName: string
): string | null {
  const affinity = crew.shipAffinity ?? 0;
  if (affinity < TICKS_PER_DAY * 7) return null; // Too early for a bond narrative
  if (!crew.personality) return null;

  const trait = crew.personality.trait1;
  const dayCount = Math.floor(affinity / TICKS_PER_DAY);

  const descriptions: Partial<Record<PersonalityTrait, string>> = {
    stoic: `${crew.name} knows every creak and groan of the ${shipName}. ${dayCount} days of quiet attention.`,
    reckless: `${crew.name} has pushed ${shipName} to her limits and back. ${dayCount} days of testing boundaries.`,
    cautious: `${crew.name} has memorized every system readout on ${shipName}. ${dayCount} days of careful observation.`,
    meticulous: `${crew.name} keeps personal maintenance notes on ${shipName}. ${dayCount} days of documented care.`,
    loyal: `${crew.name} would fight anyone who badmouthed ${shipName}. ${dayCount} days of growing attachment.`,
    ambitious: `${crew.name} sees ${shipName} as a stepping stone. ${dayCount} days — and itching for something bigger.`,
    gregarious: `${crew.name} has named half the equipment on ${shipName}. ${dayCount} days of one-sided conversations with the engine.`,
    sardonic: `${crew.name} calls ${shipName} "the old girl." ${dayCount} days of affectionate insults.`,
    pragmatic: `${crew.name} knows exactly what ${shipName} can and can't do. ${dayCount} days of practical familiarity.`,
    idealistic: `${crew.name} believes in ${shipName} the way some people believe in causes. ${dayCount} days of devotion.`,
  };

  return descriptions[trait] ?? null;
}
