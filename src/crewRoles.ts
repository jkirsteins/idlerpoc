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
  salary: number; // Credits per tick during flight (scaled for 180 gs/tick)
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

/**
 * Generate starting skills for a crew member.
 * All skills start at zero — progression comes entirely from job training
 * and event-based gains during gameplay.
 *
 * @param _targetRole The desired role (unused — all crew start at zero skills)
 * @returns A CrewSkills object with all zeros
 */
export function generateSkillsForRole(_targetRole: CrewRole): CrewSkills {
  return {
    piloting: 0,
    mining: 0,
    commerce: 0,
  };
}

/**
 * Get the primary skill for a given role
 */
export function getPrimarySkillForRole(role: CrewRole): SkillId | null {
  const entry = Object.entries(SKILL_TO_ROLE).find(([_, r]) => r === role);
  return entry ? (entry[0] as SkillId) : null;
}

/**
 * Calculate total crew salary cost per tick for a ship.
 * Centralised to avoid duplicating this loop in 6+ locations.
 */
export function calculateShipSalaryPerTick(ship: Ship): number {
  let total = 0;
  for (const crew of ship.crew) {
    const roleDef = getCrewRoleDefinition(crew.role);
    if (roleDef) {
      total += roleDef.salary;
    }
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
