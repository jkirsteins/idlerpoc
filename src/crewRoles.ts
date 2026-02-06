import type { CrewRole, RoomType, CrewSkills, SkillId } from './models';

export interface CrewRoleDefinition {
  role: CrewRole;
  name: string;
  description: string;
  preferredRoom: RoomType;
}

export const CREW_ROLE_DEFINITIONS: CrewRoleDefinition[] = [
  {
    role: 'captain',
    name: 'Captain',
    description: 'Commands the ship and crew. Your character.',
    preferredRoom: 'bridge',
  },
  {
    role: 'pilot',
    name: 'Pilot',
    description: 'Navigates the ship through space.',
    preferredRoom: 'bridge',
  },
  {
    role: 'engineer',
    name: 'Engineer',
    description: 'Keeps the engines running smoothly.',
    preferredRoom: 'engine_room',
  },
  {
    role: 'cook',
    name: 'Cook',
    description: 'Prepares meals and boosts crew morale.',
    preferredRoom: 'cantina',
  },
  {
    role: 'medic',
    name: 'Medic',
    description: 'Treats injuries and illnesses.',
    preferredRoom: 'medbay',
  },
  {
    role: 'gunner',
    name: 'Gunner',
    description: 'Operates weapons systems.',
    preferredRoom: 'armory',
  },
  {
    role: 'mechanic',
    name: 'Mechanic',
    description: 'Repairs ship systems and equipment.',
    preferredRoom: 'engine_room',
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
 * Mapping of skills to their corresponding roles
 */
const SKILL_TO_ROLE: Record<SkillId, CrewRole> = {
  piloting: 'pilot',
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

  return SKILL_TO_ROLE[highestSkill];
}

/**
 * Generate skills weighted toward a specific role.
 * Primary skill gets 6-9, secondary skills get 3-5.
 *
 * @param targetRole The desired role for this crew member
 * @returns A CrewSkills object weighted toward that role
 */
export function generateSkillsForRole(targetRole: CrewRole): CrewSkills {
  // Find the skill that maps to this role
  const primarySkill = Object.entries(SKILL_TO_ROLE).find(
    ([_, role]) => role === targetRole
  )?.[0] as SkillId | undefined;

  // Generate base skills (3-5 for all)
  const skills: CrewSkills = {
    piloting: Math.floor(Math.random() * 3) + 3, // 3-5
    engineering: Math.floor(Math.random() * 3) + 3, // 3-5
    strength: Math.floor(Math.random() * 3) + 3, // 3-5
    charisma: Math.floor(Math.random() * 3) + 3, // 3-5
    loyalty: Math.floor(Math.random() * 3) + 3, // 3-5
  };

  // Boost primary skill to 6-9
  if (primarySkill) {
    skills[primarySkill] = Math.floor(Math.random() * 4) + 6; // 6-9
  }

  return skills;
}

/**
 * Get the primary skill for a given role
 */
export function getPrimarySkillForRole(role: CrewRole): SkillId | null {
  const entry = Object.entries(SKILL_TO_ROLE).find(([_, r]) => r === role);
  return entry ? (entry[0] as SkillId) : null;
}
