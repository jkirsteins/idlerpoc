import type {
  CrewMember,
  Room,
  Ship,
  SkillId,
  RoomType,
  LogEntry,
} from './models';
import { getLevelForXP } from './levelSystem';
import { deduceRoleFromSkills, getPrimarySkillForRole } from './crewRoles';
import { addLog } from './logSystem';

/**
 * Skill Progression System
 *
 * Crew members earn XP by doing their jobs. Room assignment during flight
 * determines which skill they practice and how fast they improve.
 */

/**
 * XP rates per tick by room type
 */
const ROOM_XP_RATES: Partial<Record<RoomType, number>> = {
  bridge: 0.05,
  engine_room: 0.05,
  reactor_room: 0.075,
  point_defense_station: 0.05,
  armory: 0.025,
  cantina: 0.025,
  medbay: 0.025,
};

/**
 * Which skill a room trains, mapped from the room's role archetype.
 */
const ROOM_TRAINED_SKILL: Partial<Record<RoomType, SkillId>> = {
  bridge: 'piloting', // default; navigators override to astrogation
  engine_room: 'engineering',
  reactor_room: 'engineering',
  point_defense_station: 'strength',
  armory: 'strength',
  cantina: 'charisma',
  medbay: 'loyalty',
};

/** Skill matching bonus multiplier (crew's top skill matches room's trained skill) */
const SKILL_MATCH_MULTIPLIER = 1.5;

/**
 * Calculate XP earned per tick for a crew member based on room assignment.
 * Returns the skill being trained and XP amount, or null if no XP earned.
 */
export function calculateTickXP(
  crew: CrewMember,
  room: Room | null
): { skill: SkillId; xp: number } | null {
  if (!room) return null;

  const baseXP = ROOM_XP_RATES[room.type];
  if (!baseXP) return null;

  // Determine which skill this room trains
  let skill = ROOM_TRAINED_SKILL[room.type];
  if (!skill) return null;

  // Bridge special case: navigators train astrogation instead of piloting
  if (room.type === 'bridge' && crew.role === 'navigator') {
    skill = 'astrogation';
  }

  // Skill matching bonus: if crew's highest skill matches the room's trained skill
  const primarySkill = getPrimarySkillForRole(crew.role);
  const matchesRoom = primarySkill === skill;
  const xp = matchesRoom ? baseXP * SKILL_MATCH_MULTIPLIER : baseXP;

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
    // Find which room this crew member is assigned to
    const room = ship.rooms.find((r) => r.assignedCrewIds.includes(crew.id));

    const xpResult = calculateTickXP(crew, room ?? null);
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
 * Returns any level-up results for logging.
 */
export function awardEventXP(ship: Ship, event: XPEvent): LevelUpResult[] {
  const levelUps: LevelUpResult[] = [];

  function grantXP(crew: CrewMember, skill: SkillId, amount: number): void {
    // XP goes to the crew member's total XP (not per-skill)
    // The skill parameter documents what they learned, but XP is unified
    void skill; // unified XP system — skill param is informational
    const levelUp = applyXP(crew, amount);
    if (levelUp) {
      levelUps.push(levelUp);
    }
  }

  switch (event.type) {
    case 'encounter_evaded': {
      // Bridge crew earn astrogation XP
      const bridge = ship.rooms.find((r) => r.type === 'bridge');
      if (bridge) {
        for (const crewId of bridge.assignedCrewIds) {
          const crew = ship.crew.find((c) => c.id === crewId);
          if (crew) grantXP(crew, 'astrogation', 10);
        }
      }
      break;
    }

    case 'encounter_negotiated': {
      // Negotiator (by ID) earns charisma XP
      const negotiator = ship.crew.find((c) => c.id === event.negotiatorId);
      if (negotiator) grantXP(negotiator, 'charisma', 15);
      break;
    }

    case 'encounter_victory': {
      // Armory + PD station crew earn strength XP
      const combatRooms = ship.rooms.filter(
        (r) => r.type === 'armory' || r.type === 'point_defense_station'
      );
      for (const room of combatRooms) {
        for (const crewId of room.assignedCrewIds) {
          const crew = ship.crew.find((c) => c.id === crewId);
          if (crew) grantXP(crew, 'strength', 20);
        }
      }
      break;
    }

    case 'encounter_harassment': {
      // All crew earn loyalty XP (survived together)
      for (const crew of ship.crew) {
        grantXP(crew, 'loyalty', 5);
      }
      break;
    }

    case 'encounter_boarding': {
      // All crew earn loyalty + strength XP
      for (const crew of ship.crew) {
        grantXP(crew, 'loyalty', 10);
        grantXP(crew, 'strength', 10);
      }
      break;
    }

    case 'contract_completed': {
      // All crew earn XP based on trips completed
      const xpPerCrew = 5 * event.tripsCompleted;
      for (const crew of ship.crew) {
        const primarySkill = getPrimarySkillForRole(crew.role);
        grantXP(crew, primarySkill ?? 'piloting', xpPerCrew);
      }
      break;
    }

    case 'first_arrival': {
      // All crew earn astrogation XP
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
