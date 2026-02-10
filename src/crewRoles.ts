import type { CrewRole, RoomType, CrewSkills, SkillId } from './models';

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
    role: 'navigator',
    name: 'Navigator',
    description: 'Plots routes, analyzes hazards, operates scanners.',
    preferredRoom: 'bridge',
    salary: 0.1,
  },
  {
    role: 'engineer',
    name: 'Engineer',
    description: 'Keeps the engines running smoothly.',
    preferredRoom: 'engine_room',
    salary: 0.15,
  },
  {
    role: 'cook',
    name: 'Cook',
    description: 'Prepares meals and boosts crew morale.',
    preferredRoom: 'cantina',
    salary: 0.05,
  },
  {
    role: 'medic',
    name: 'Medic',
    description: 'Treats injuries and illnesses.',
    preferredRoom: 'medbay',
    salary: 0.075,
  },
  {
    role: 'gunner',
    name: 'Gunner',
    description: 'Operates weapons systems.',
    preferredRoom: 'armory',
    salary: 0.075,
  },
  {
    role: 'mechanic',
    name: 'Mechanic',
    description: 'Repairs ship systems and equipment.',
    preferredRoom: 'engine_room',
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
 * Commerce is excluded — it doesn't determine role (trained by captains/first officers via trade).
 */
const SKILL_TO_ROLE: Partial<Record<SkillId, CrewRole>> = {
  piloting: 'pilot',
  astrogation: 'navigator',
  engineering: 'engineer',
  strength: 'gunner',
  charisma: 'cook', // Quartermaster/morale role (cook manages crew welfare)
  loyalty: 'medic', // First Officer/support role (medic cares for crew)
};

/**
 * Priority order for tie-breaking when multiple skills are equal
 */
const SKILL_PRIORITY: SkillId[] = [
  'piloting',
  'astrogation',
  'engineering',
  'strength',
  'charisma',
  'loyalty',
];

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
    astrogation: 0,
    engineering: 0,
    strength: 0,
    charisma: 0,
    loyalty: 0,
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
