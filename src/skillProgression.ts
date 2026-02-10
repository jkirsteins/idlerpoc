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
import { checkRankCrossing } from './skillRanks';
import { getSpecializationMultiplier } from './skillRanks';

/**
 * Direct Skill Training System
 *
 * Crew members train skills directly by working job slots during flight.
 * No XP intermediary — job slot assignment determines which skill improves
 * and at what rate.
 *
 * Uses power-law diminishing returns (idle-game standard):
 *   gain/tick = RATE_SCALE × trainRate / (1 + skill/CURVE_K)^CURVE_P × match × spec
 *
 * Power-law falls off more gently than exponential at high skill levels,
 * keeping passive training visible on the progress bar throughout the game.
 * Tuned so captain at helm reaches skill 5 in ~5 min, skill 50 in ~5 days.
 *
 * Approximate passive-only timeline (captain at helm, no match/spec):
 *   Skill  5 (Green):      5 min       Skill 55 (Proficient): ~7 days
 *   Skill 12 (Novice):    ~49 min      Skill 70 (Skilled):   ~17 days
 *   Skill 20 (Apprentice): ~4 hours    Skill 83 (Expert):    ~34 days
 *   Skill 30 (Competent): ~17 hours    Skill 95 (Master):    ~58 days
 *   Skill 50:             ~5 days
 */

/** Maximum skill value */
export const SKILL_CAP = 100;

/** Threshold at which a skill rounds up to the cap (mastery) */
const MASTERY_THRESHOLD = 99.5;

/** Skill matching bonus multiplier (crew's role matches job's trained skill) */
const SKILL_MATCH_MULTIPLIER = 1.5;

/**
 * Power-law curve shaping: gain ∝ 1 / (1 + skill/K)^P
 *
 * K controls where diminishing returns become noticeable.
 * P controls steepness — higher P = sharper falloff.
 * K=5, P=3.2 satisfies the ~5-min-to-5 / ~5-days-to-50 ratio while keeping
 * passive training visible all the way to Master (~2 months).
 */
const CURVE_K = 5;
const CURVE_P = 3.2;

/**
 * Rate multiplier that scales per-slot trainRate values into the power-law
 * formula.  Derived so that RATE_SCALE × helm_trainRate (0.00004) yields
 * skill 5 in 300 ticks (5 real minutes) for a captain with no match bonus.
 */
const RATE_SCALE = 1724;

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

  // Power-law diminishing returns: gentler falloff keeps progress visible at high levels
  const diminishingFactor = Math.pow(1 + currentSkill / CURVE_K, -CURVE_P);

  // Skill matching bonus: crew's role primary skill matches job's trained skill
  const primarySkill = getPrimarySkillForRole(crew.role);
  const matchBonus = primarySkill === skill ? SKILL_MATCH_MULTIPLIER : 1.0;

  // Specialization multiplier: bonus for specialized skill, penalty for others
  const specMultiplier = getSpecializationMultiplier(
    skill,
    crew.specialization
  );

  const gain =
    RATE_SCALE * baseRate * diminishingFactor * matchBonus * specMultiplier;

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
  /** Non-null if this level-up crossed a named rank boundary */
  newRank?: string;
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
    const rankCross = checkRankCrossing(oldFloor, newFloor);
    return {
      crewId: crew.id,
      crewName: crew.name,
      skill,
      newLevel: newFloor,
      newRank: rankCross?.name,
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
      const bridgeCrew = crewInJobTypes(['helm', 'scanner', 'comms']);
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

      // Captain and first officer (highest loyalty non-captain) earn commerce from trade
      const commerceGain = 1.0 + 0.5 * event.tripsCompleted;
      const captain = ship.crew.find((c) => c.isCaptain);
      if (captain) {
        grantSkill(captain, 'commerce', commerceGain);
      }
      // First officer = non-captain crew with highest loyalty
      const firstOfficer = ship.crew
        .filter((c) => !c.isCaptain)
        .sort((a, b) => b.skills.loyalty - a.skills.loyalty)[0];
      if (firstOfficer) {
        grantSkill(firstOfficer, 'commerce', commerceGain * 0.5);
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
    if (su.newRank) {
      // Rank boundary crossed — prominent message
      addLog(
        log,
        gameTime,
        'crew_level_up',
        `${su.crewName} has become ${su.newRank} in ${skillName} (${su.newLevel})!`,
        shipName
      );
    } else {
      addLog(
        log,
        gameTime,
        'crew_level_up',
        `${su.crewName}'s ${skillName} has reached ${su.newLevel}`,
        shipName
      );
    }
  }
}
