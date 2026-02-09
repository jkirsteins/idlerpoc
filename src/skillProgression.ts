import type {
  CrewMember,
  Ship,
  SkillId,
  JobSlotType,
  LogEntry,
} from './models';
import { getPrimarySkillForRole } from './crewRoles';
import { addLog } from './logSystem';
import { getCrewJobSlot, getJobSlotDefinition } from './jobSlots';

/**
 * Direct Skill Training System
 *
 * Crew members train skills directly by working job slots during flight.
 * No XP intermediary — job slot assignment determines which skill improves
 * and at what rate.
 *
 * Uses squared diminishing returns so early skills come fast (short-clock
 * reward) while mastery is a long idle-game tail.
 *
 * Formula: gain/tick = trainRate × TRAIN_SPEED × ((SKILL_CAP - current) / SKILL_CAP)² × match_bonus
 */

/** Maximum skill value */
export const SKILL_CAP = 100;

/** Threshold at which a skill rounds up to the cap (mastery) */
const MASTERY_THRESHOLD = 99.5;

/** Skill matching bonus multiplier (crew's role matches job's trained skill) */
const SKILL_MATCH_MULTIPLIER = 1.5;

/**
 * Global speed multiplier applied to all passive training.
 * Combined with the squared diminishing curve this gives:
 *   - Short clock  (~8 min):  first skill point
 *   - Medium clock  (~2 hr):  ~10 skill
 *   - Long clock   (~14 hr):  ~50 skill
 *   - Deep idle   (~months):  mastery (99-100)
 */
const TRAIN_SPEED = 50;

/** Exponent for the diminishing-returns curve (higher = steeper taper) */
const DIMINISH_EXPONENT = 2;

/**
 * Calculate direct skill training for a crew member based on job slot assignment.
 * Returns the skill being trained and the gain amount, or null if no training.
 */
export function calculateTickTraining(
  crew: CrewMember,
  jobSlotType: JobSlotType | null
): { skill: SkillId; gain: number } | null {
  if (!jobSlotType) return null;

  const def = getJobSlotDefinition(jobSlotType);
  if (!def || !def.skill || def.trainRate <= 0) return null;

  const skill = def.skill;
  const baseRate = def.trainRate;

  const currentSkill = crew.skills[skill];
  if (currentSkill >= SKILL_CAP) return null;

  // Squared diminishing returns: fast early, long tail to mastery
  const normalised = (SKILL_CAP - currentSkill) / SKILL_CAP;
  const diminishingFactor = Math.pow(normalised, DIMINISH_EXPONENT);

  // Skill matching bonus: crew's role primary skill matches job's trained skill
  const primarySkill = getPrimarySkillForRole(crew.role);
  const matchBonus = primarySkill === skill ? SKILL_MATCH_MULTIPLIER : 1.0;

  const gain = baseRate * TRAIN_SPEED * diminishingFactor * matchBonus;

  return { skill, gain };
}

/**
 * Result when a crew member crosses an integer skill boundary
 */
export interface SkillUpResult {
  crewId: string;
  crewName: string;
  skill: SkillId;
  newLevel: number;
}

/**
 * Apply direct skill training for a crew member.
 * Returns a SkillUpResult if the crew member crossed an integer boundary.
 */
export function applyTraining(
  crew: CrewMember,
  skill: SkillId,
  gain: number
): SkillUpResult | null {
  const oldFloor = Math.floor(crew.skills[skill]);
  crew.skills[skill] = Math.min(SKILL_CAP, crew.skills[skill] + gain);

  // Mastery threshold: round up to cap
  if (crew.skills[skill] >= MASTERY_THRESHOLD) {
    crew.skills[skill] = SKILL_CAP;
  }

  const newFloor = Math.floor(crew.skills[skill]);

  if (newFloor > oldFloor) {
    return {
      crewId: crew.id,
      crewName: crew.name,
      skill,
      newLevel: newFloor,
    };
  }

  return null;
}

/**
 * Apply direct skill training for all crew on a ship during one flight tick.
 * Returns any skill-up results for logging.
 */
export function applyPassiveTraining(ship: Ship): SkillUpResult[] {
  const skillUps: SkillUpResult[] = [];

  for (const crew of ship.crew) {
    const jobSlot = getCrewJobSlot(ship, crew.id);
    const jobSlotType = jobSlot?.type ?? null;

    const training = calculateTickTraining(crew, jobSlotType);
    if (training) {
      const skillUp = applyTraining(crew, training.skill, training.gain);
      if (skillUp) {
        skillUps.push(skillUp);
      }
    }
  }

  return skillUps;
}

/**
 * Event types that award direct skill gains
 */
export type SkillEvent =
  | { type: 'encounter_evaded' }
  | { type: 'encounter_negotiated'; negotiatorId: string }
  | { type: 'encounter_victory' }
  | { type: 'encounter_harassment' }
  | { type: 'encounter_boarding' }
  | { type: 'encounter_fled' }
  | { type: 'contract_completed'; tripsCompleted: number }
  | { type: 'first_arrival'; locationId: string };

/**
 * Award event-based skill gains to relevant crew members on a ship.
 * Event gains are flat (not diminished by current level), making them
 * increasingly valuable at higher skill levels.
 *
 * Returns any skill-up results for logging.
 */
export function awardEventSkillGains(
  ship: Ship,
  event: SkillEvent
): SkillUpResult[] {
  const skillUps: SkillUpResult[] = [];

  function grantSkill(crew: CrewMember, skill: SkillId, amount: number): void {
    const result = applyTraining(crew, skill, amount);
    if (result) {
      skillUps.push(result);
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
      // Bridge crew earn astrogation
      const bridgeCrew = crewInJobTypes(['helm', 'scanner', 'comms']);
      for (const crew of bridgeCrew) {
        grantSkill(crew, 'astrogation', 2.0);
      }
      break;
    }

    case 'encounter_negotiated': {
      // Negotiator earns charisma
      const negotiator = ship.crew.find((c) => c.id === event.negotiatorId);
      if (negotiator) grantSkill(negotiator, 'charisma', 2.5);
      break;
    }

    case 'encounter_victory': {
      // Combat job crew earn strength
      const combatCrew = crewInJobTypes([
        'arms_maint',
        'fire_control',
        'targeting',
      ]);
      for (const crew of combatCrew) {
        grantSkill(crew, 'strength', 3.0);
      }
      break;
    }

    case 'encounter_harassment': {
      // All crew earn loyalty (survived together)
      for (const crew of ship.crew) {
        grantSkill(crew, 'loyalty', 1.0);
      }
      break;
    }

    case 'encounter_boarding': {
      // All crew earn loyalty + strength
      for (const crew of ship.crew) {
        grantSkill(crew, 'loyalty', 1.5);
        grantSkill(crew, 'strength', 1.5);
      }
      break;
    }

    case 'encounter_fled': {
      // Bridge crew earn piloting (evasive maneuvers under fire)
      const bridgeCrew = crewInJobTypes(['helm', 'comms']);
      for (const crew of bridgeCrew) {
        grantSkill(crew, 'piloting', 1.5);
      }
      break;
    }

    case 'contract_completed': {
      // All crew earn their primary skill
      const gain = 0.8 * event.tripsCompleted;
      for (const crew of ship.crew) {
        const primarySkill = getPrimarySkillForRole(crew.role);
        grantSkill(crew, primarySkill ?? 'piloting', gain);
      }
      break;
    }

    case 'first_arrival': {
      // All crew earn astrogation
      for (const crew of ship.crew) {
        grantSkill(crew, 'astrogation', 2.0);
      }
      break;
    }
  }

  return skillUps;
}

/**
 * Log skill-up events for a ship's crew.
 */
export function logSkillUps(
  log: LogEntry[],
  gameTime: number,
  shipName: string,
  skillUps: SkillUpResult[]
): void {
  for (const su of skillUps) {
    const skillName = su.skill.charAt(0).toUpperCase() + su.skill.slice(1);
    addLog(
      log,
      gameTime,
      'crew_level_up',
      `${su.crewName}'s ${skillName} has reached ${su.newLevel}!`,
      shipName
    );
  }
}
