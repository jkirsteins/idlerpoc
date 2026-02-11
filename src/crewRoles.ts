import type {
  CrewRole,
  CrewMember,
  RoomType,
  CrewSkills,
  SkillId,
  Ship,
} from './models';

export interface CrewRoleDefinition {
  role: CrewRole;
  name: string;
  description: string;
  preferredRoom: RoomType;
  salary: number; // Credits per tick (scaled for 180 gs/tick)
}

export const CREW_ROLE_DEFINITIONS: CrewRoleDefinition[] = [
  {
    role: 'captain',
    name: 'Captain',
    description: 'Commands the ship and crew. Your character.',
    preferredRoom: 'bridge',
    salary: 0, // Owner-operator
  },
  {
    role: 'pilot',
    name: 'Pilot',
    description: 'Handles ship operations and helm control during flight.',
    preferredRoom: 'bridge',
    salary: 0.1,
  },
  {
    role: 'miner',
    name: 'Miner',
    description: 'Extracts ores and resources from asteroids and planets.',
    preferredRoom: 'cargo_hold',
    salary: 0.1,
  },
  {
    role: 'trader',
    name: 'Trader',
    description: 'Manages commerce, negotiations, and trade operations.',
    preferredRoom: 'bridge',
    salary: 0.1,
  },
];

export function getCrewRoleDefinition(
  role: CrewRole
): CrewRoleDefinition | undefined {
  return CREW_ROLE_DEFINITIONS.find((r) => r.role === role);
}

export function getCrewRoleName(role: CrewRole): string {
  return getCrewRoleDefinition(role)?.name ?? role;
}

/**
 * Mapping of skills to their corresponding roles.
 * Commerce determines the trader role.
 */
const SKILL_TO_ROLE: Partial<Record<SkillId, CrewRole>> = {
  piloting: 'pilot',
  mining: 'miner',
  commerce: 'trader',
};

/**
 * Priority order for tie-breaking when multiple skills are equal
 */
const SKILL_PRIORITY: SkillId[] = ['piloting', 'mining', 'commerce'];

/**
 * Deduce a crew member's role based on their highest skill.
 * Captain is a special case and must be set manually.
 *
 * @param skills The crew member's skill set
 * @returns The role corresponding to their highest skill
 */
export function deduceRoleFromSkills(skills: CrewSkills): CrewRole {
  let highestSkill: SkillId = 'piloting';
  let highestValue = skills.piloting;

  // Find highest skill, using priority order for ties
  for (const skillId of SKILL_PRIORITY) {
    if (skills[skillId] > highestValue) {
      highestValue = skills[skillId];
      highestSkill = skillId;
    }
  }

  return SKILL_TO_ROLE[highestSkill] ?? 'pilot';
}

// ─── Archetype Skill Generation ────────────────────────────────────

/**
 * Skill distribution per archetype.
 * Each role has a primary, secondary, and tertiary skill.
 * - Pilot: primary piloting, some commerce (route awareness), little mining
 * - Miner: primary mining, some piloting (ship ops), little commerce
 * - Trader: primary commerce, some piloting (ship ops), little mining
 */
const ARCHETYPE_SKILLS: Partial<
  Record<CrewRole, { primary: SkillId; secondary: SkillId; tertiary: SkillId }>
> = {
  pilot: { primary: 'piloting', secondary: 'commerce', tertiary: 'mining' },
  miner: { primary: 'mining', secondary: 'piloting', tertiary: 'commerce' },
  trader: { primary: 'commerce', secondary: 'piloting', tertiary: 'mining' },
};

/** Maximum primary skill a candidate can spawn with */
const MAX_STARTING_PRIMARY_SKILL = 35;

/** Secondary skill as a fraction of primary (randomized within range) */
const SECONDARY_SKILL_MIN_RATIO = 0.15;
const SECONDARY_SKILL_MAX_RATIO = 0.5;

/** Tertiary skill as a fraction of primary (0 to this ratio) */
const TERTIARY_SKILL_MAX_RATIO = 0.1;

/**
 * Roll a quality value for a hire candidate. Uses a squared random
 * distribution so most candidates are low-quality (cheap training projects)
 * while occasionally producing skilled veterans.
 *
 * Distribution (approximate):
 *   50% → quality 0-0.25  (primary skill  0-9, "Green")
 *   21% → quality 0.25-0.5 (primary skill 9-18, "Seasoned")
 *   16% → quality 0.5-0.75 (primary skill 18-26, "Veteran")
 *   13% → quality 0.75-1.0 (primary skill 26-35, "Elite")
 *
 * Larger stations attract slightly better candidates via a small additive
 * quality bonus scaled by location size.
 *
 * @param locationSize Station size (1-5). Default 3.
 */
export function rollCrewQuality(locationSize: number = 3): number {
  const base = Math.random() ** 2; // right-skewed: most values near 0
  const sizeBonus = (locationSize - 1) * 0.03; // 0 for size 1, 0.12 for size 5
  return Math.min(1, base + sizeBonus * Math.random());
}

/**
 * Generate starting skills for a crew member based on their target role
 * and a quality value (0 = untrained, 1 = best possible starting skills).
 *
 * Captain and quality-0 crew start with all zeros.
 * Hired crew get archetype-weighted skills: strong primary, moderate
 * secondary, minimal tertiary.
 */
export function generateSkillsForRole(
  targetRole: CrewRole,
  quality: number = 0
): CrewSkills {
  if (quality <= 0 || targetRole === 'captain') {
    return { piloting: 0, mining: 0, commerce: 0 };
  }

  const archetype = ARCHETYPE_SKILLS[targetRole];
  if (!archetype) {
    return { piloting: 0, mining: 0, commerce: 0 };
  }

  const primaryValue = quality * MAX_STARTING_PRIMARY_SKILL;
  const secondaryRatio =
    SECONDARY_SKILL_MIN_RATIO +
    Math.random() * (SECONDARY_SKILL_MAX_RATIO - SECONDARY_SKILL_MIN_RATIO);
  const secondaryValue = primaryValue * secondaryRatio;
  const tertiaryValue = primaryValue * Math.random() * TERTIARY_SKILL_MAX_RATIO;

  const skills: CrewSkills = { piloting: 0, mining: 0, commerce: 0 };
  skills[archetype.primary] = Math.round(primaryValue * 10) / 10;
  skills[archetype.secondary] = Math.round(secondaryValue * 10) / 10;
  skills[archetype.tertiary] = Math.round(tertiaryValue * 10) / 10;

  return skills;
}

// ─── Hire Cost Calculation ─────────────────────────────────────────

/** Per-skill-point addition to hire cost */
const SKILL_COST_PER_POINT = 50;

/** Per-skill-point salary multiplier increase */
const SALARY_SCALE_PER_POINT = 0.015;

/**
 * Calculate hire cost from a candidate's skills.
 * More skilled crew demand higher signing bonuses.
 */
export function calculateHireCost(
  skills: CrewSkills,
  baseCost: number
): number {
  const totalSkill = skills.piloting + skills.mining + skills.commerce;
  return baseCost + Math.round(totalSkill * SKILL_COST_PER_POINT);
}

/**
 * Calculate salary multiplier from a candidate's starting skills.
 * Skilled hires demand higher ongoing wages.
 * Returns 1.0 for untrained crew, scaling up with total skill.
 */
export function calculateSalaryMultiplier(skills: CrewSkills): number {
  const totalSkill = skills.piloting + skills.mining + skills.commerce;
  return 1.0 + totalSkill * SALARY_SCALE_PER_POINT;
}

/**
 * Get the primary skill for a given role
 */
export function getPrimarySkillForRole(role: CrewRole): SkillId | null {
  const entry = Object.entries(SKILL_TO_ROLE).find(([_, r]) => r === role);
  return entry ? (entry[0] as SkillId) : null;
}

/**
 * Get salary per tick for a single crew member.
 * Applies the individual salary multiplier (skilled hires cost more).
 * Captain always returns 0 (owner-operator).
 */
export function getCrewSalaryPerTick(crew: CrewMember): number {
  const roleDef = getCrewRoleDefinition(crew.role);
  if (!roleDef) return 0;
  return roleDef.salary * (crew.salaryMultiplier ?? 1.0);
}

/**
 * Calculate total crew salary cost per tick for a ship.
 * Centralised to avoid duplicating this loop in 6+ locations.
 */
export function calculateShipSalaryPerTick(ship: Ship): number {
  let total = 0;
  for (const crew of ship.crew) {
    total += getCrewSalaryPerTick(crew);
  }
  return total;
}

/**
 * Find the highest value of a specific skill among a set of crew members.
 * Centralised to avoid duplicating the "find best skill" loop.
 */
export function getBestCrewSkill(crew: CrewMember[], skillId: SkillId): number {
  let best = 0;
  for (const member of crew) {
    if (member.skills[skillId] > best) {
      best = member.skills[skillId];
    }
  }
  return best;
}

/**
 * Calculate repair points per tick for a single crew member.
 * Used by both game logic (gameTick) and UI (shipTab).
 */
export const REPAIR_SKILL_FACTOR = 0.05;
export function calculateRepairPoints(crew: CrewMember): number {
  return crew.skills.piloting * REPAIR_SKILL_FACTOR;
}
