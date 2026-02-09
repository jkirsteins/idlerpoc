import type {
  CrewMember,
  Ship,
  SkillId,
  JobSlotType,
  LogEntry,
} from './models';
import { getLevelForXP } from './levelSystem';
import { deduceRoleFromSkills, getPrimarySkillForRole } from './crewRoles';
import { addLog } from './logSystem';
import { getCrewJobSlot, getJobSlotDefinition } from './jobSlots';

/**
 * Skill Progression System
 *
 * Crew members earn XP by working their job slots. Job slot assignment during
 * flight determines which skill they practice and how fast they improve.
 */

/** Skill matching bonus multiplier (crew's top skill matches job's skill) */
const SKILL_MATCH_MULTIPLIER = 1.5;

/**
 * Calculate XP earned per tick for a crew member based on job slot assignment.
 * Returns the skill being trained and XP amount, or null if no XP earned.
 */
export function calculateTickXP(
  crew: CrewMember,
  jobSlotType: JobSlotType | null
): { skill: SkillId; xp: number } | null {
  if (!jobSlotType) return null;

  const def = getJobSlotDefinition(jobSlotType);
  if (!def || !def.skill || def.xpPerTick <= 0) return null;

  const skill = def.skill;
  const baseXP = def.xpPerTick;

  // Skill matching bonus: if crew's highest skill matches the job's skill
  const primarySkill = getPrimarySkillForRole(crew.role);
  const matchesJob = primarySkill === skill;
  const xp = matchesJob ? baseXP * SKILL_MATCH_MULTIPLIER : baseXP;

  return { skill, xp };
}

/**
 * XP event types for event-based XP awards
 */
export type XPEvent =
  | { type: 'encounter_evaded' }
  | { type: 'encounter_negotiated'; negotiatorId: string }
  | { type: 'encounter_victory' }
  | { type: 'encounter_harassment' }
  | { type: 'encounter_boarding' }
  | { type: 'encounter_fled' }
  | { type: 'contract_completed'; tripsCompleted: number }
  | { type: 'first_arrival'; locationId: string };

/**
 * Result when a crew member levels up
 */
export interface LevelUpResult {
  crewId: string;
  crewName: string;
  oldLevel: number;
  newLevel: number;
}

/**
 * Apply XP to a crew member and check for level-up.
 * Returns a LevelUpResult if the crew member leveled up, null otherwise.
 */
export function applyXP(
  crew: CrewMember,
  xpAmount: number
): LevelUpResult | null {
  const oldLevel = crew.level;
  crew.xp += xpAmount;
  const newLevel = getLevelForXP(crew.xp);

  if (newLevel > oldLevel) {
    const levelsGained = newLevel - oldLevel;
    crew.level = newLevel;
    crew.unspentSkillPoints += levelsGained;

    return {
      crewId: crew.id,
      crewName: crew.name,
      oldLevel,
      newLevel,
    };
  }

  return null;
}

/**
 * Apply passive XP for all crew on a ship during one flight tick.
 * Returns any level-up results for logging.
 */
export function applyPassiveXP(ship: Ship): LevelUpResult[] {
  const levelUps: LevelUpResult[] = [];

  for (const crew of ship.crew) {
    const jobSlot = getCrewJobSlot(ship, crew.id);
    const jobSlotType = jobSlot?.type ?? null;

    const xpResult = calculateTickXP(crew, jobSlotType);
    if (xpResult) {
      const levelUp = applyXP(crew, xpResult.xp);
      if (levelUp) {
        levelUps.push(levelUp);
      }
    }
  }

  return levelUps;
}

/**
 * Award event XP to relevant crew members on a ship.
 * Uses job slot assignments to determine who earns what.
 * Returns any level-up results for logging.
 */
export function awardEventXP(ship: Ship, event: XPEvent): LevelUpResult[] {
  const levelUps: LevelUpResult[] = [];

  function grantXP(crew: CrewMember, skill: SkillId, amount: number): void {
    void skill; // unified XP system — skill param is informational
    const levelUp = applyXP(crew, amount);
    if (levelUp) {
      levelUps.push(levelUp);
    }
  }

  // Helper: get crew assigned to specific job types
  function crewInJobTypes(types: JobSlotType[]): CrewMember[] {
    const crewIds = ship.jobSlots
      .filter((s) => types.includes(s.type) && s.assignedCrewId !== null)
      .map((s) => s.assignedCrewId!);
    return crewIds
      .map((id) => ship.crew.find((c) => c.id === id))
      .filter((c): c is CrewMember => c !== undefined);
  }

  switch (event.type) {
    case 'encounter_evaded': {
      // Bridge crew earn astrogation XP
      const bridgeCrew = crewInJobTypes(['helm', 'scanner', 'comms']);
      for (const crew of bridgeCrew) {
        grantXP(crew, 'astrogation', 10);
      }
      break;
    }

    case 'encounter_negotiated': {
      const negotiator = ship.crew.find((c) => c.id === event.negotiatorId);
      if (negotiator) grantXP(negotiator, 'charisma', 15);
      break;
    }

    case 'encounter_victory': {
      // Combat job crew earn strength XP
      const combatCrew = crewInJobTypes([
        'arms_maint',
        'fire_control',
        'targeting',
      ]);
      for (const crew of combatCrew) {
        grantXP(crew, 'strength', 20);
      }
      break;
    }

    case 'encounter_harassment': {
      for (const crew of ship.crew) {
        grantXP(crew, 'loyalty', 5);
      }
      break;
    }

    case 'encounter_boarding': {
      for (const crew of ship.crew) {
        grantXP(crew, 'loyalty', 10);
        grantXP(crew, 'strength', 10);
      }
      break;
    }

    case 'encounter_fled': {
      // Bridge crew earn piloting XP (evasive maneuvers under fire)
      const bridge = ship.rooms.find((r) => r.type === 'bridge');
      if (bridge) {
        const bridgeSlots = ship.jobSlots.filter(
          (s) => s.sourceRoomId === bridge.id && s.assignedCrewId !== null
        );
        for (const slot of bridgeSlots) {
          const crew = ship.crew.find((c) => c.id === slot.assignedCrewId);
          if (crew) grantXP(crew, 'piloting', 8);
        }
      }
      break;
    }

    case 'contract_completed': {
      const xpPerCrew = 5 * event.tripsCompleted;
      for (const crew of ship.crew) {
        const primarySkill = getPrimarySkillForRole(crew.role);
        grantXP(crew, primarySkill ?? 'piloting', xpPerCrew);
      }
      break;
    }

    case 'first_arrival': {
      for (const crew of ship.crew) {
        grantXP(crew, 'astrogation', 15);
      }
      break;
    }
  }

  return levelUps;
}

/**
 * Spend a skill point to increase a skill by 1.
 * Returns true if successful, false if skill is at cap or no points available.
 */
export function spendSkillPoint(crew: CrewMember, skill: SkillId): boolean {
  if (crew.unspentSkillPoints <= 0) return false;
  if (crew.skills[skill] >= 10) return false;

  crew.skills[skill] += 1;
  crew.unspentSkillPoints -= 1;

  // Recalculate role (unless captain)
  if (!crew.isCaptain) {
    const newRole = deduceRoleFromSkills(crew.skills);
    if (newRole !== crew.role) {
      crew.role = newRole;
      return true; // caller should check for role change
    }
  }

  return true;
}

/**
 * Log level-up events for a ship's crew.
 */
export function logLevelUps(
  log: LogEntry[],
  gameTime: number,
  shipName: string,
  levelUps: LevelUpResult[]
): void {
  for (const lu of levelUps) {
    addLog(
      log,
      gameTime,
      'crew_level_up',
      `${lu.crewName} has reached level ${lu.newLevel}! (1 skill point available)`,
      shipName
    );
  }
}
