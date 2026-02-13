import type {
  Ship,
  GameData,
  EncounterResult,
  EncounterOutcome,
  LogEntryType,
} from './models';
import { getShipClass } from './shipClasses';
import { getCrewEquipmentDefinition } from './crewEquipment';
import { getShipPositionKm } from './encounterSystem';
import { addLog } from './logSystem';
import { setEncounterResolver } from './gameTick';
import {
  awardEventSkillGains,
  logSkillUps,
  type SkillEvent,
} from './skillProgression';
import { getCrewForJobType } from './jobSlots';
import { getBestCrewSkill, getBestCrewPool } from './crewRoles';
import {
  getCommandPilotingBonus,
  getCommandRallyBonus,
  canNegotiate,
} from './captainBonus';
import { recordCrewDamage } from './crewDeath';
import { getPilotingPoolEvasionBonus } from './masterySystem';

/**
 * Combat System
 *
 * Auto-resolve pipeline: Threat → Evade → Negotiate → Combat → Outcome
 * All encounters resolve in a single tick. No player input required.
 */

/** Combat tuning constants */
export const COMBAT_CONSTANTS = {
  /** km divisor for position → base threat level */
  THREAT_POSITION_DIVISOR: 10_000_000,
  /** kg divisor for cargo weight → threat bonus */
  THREAT_CARGO_DIVISOR: 5_000,
  /** m/s velocity for maximum evasion contribution */
  EVASION_VELOCITY_DIVISOR: 50_000,
  /** Maximum evasion chance from velocity */
  EVASION_VELOCITY_CAP: 0.3,
  /** Evasion bonus from nav_scanner equipment */
  EVASION_SCANNER_BONUS: 0.15,
  /** Evasion per point of astrogation skill (1-100 scale) */
  EVASION_SKILL_FACTOR: 0.002,
  /** Commerce skill divisor for negotiation chance (1-100 scale) */
  NEGOTIATION_DIVISOR: 200,
  /** Minimum ransom cost (pirates won't bother for less) */
  NEGOTIATION_MIN_RANSOM: 50,
  /** Base point defense combat score */
  PD_BASE_SCORE: 20,
  /** PD station staffing base bonus (50%) */
  PD_STAFFING_BASE_BONUS: 0.5,
  /** PD bonus per gunner skill point (1-100 scale) */
  PD_SKILL_BONUS: 0.005,
  /** Passive defense from deflector shield */
  DEFLECTOR_BONUS: 10,
  /** Passive defense from micro deflector */
  MICRO_DEFLECTOR_BONUS: 5,
  /** Base point defense laser combat score */
  PD_LASER_BASE_SCORE: 8,
  /** kg divisor for ship mass → defense bonus */
  MASS_DIVISOR: 100_000,
  /** Threat level → pirate attack score multiplier */
  PIRATE_ATTACK_MULTIPLIER: 5,
  /** Defense/attack ratio threshold for victory */
  VICTORY_THRESHOLD: 1.5,
  /** Defense/attack ratio threshold for harassment (below = boarding) */
  HARASSMENT_THRESHOLD: 0.75,
  /** PD degradation on victory */
  VICTORY_PD_DEGRADATION: 2,
  /** Credits per threat level bounty */
  VICTORY_BOUNTY_PER_THREAT: 50,
  /** PD degradation on harassment */
  HARASSMENT_PD_DEGRADATION: 5,
  /** Min crew health loss from harassment */
  HARASSMENT_HEALTH_MIN: 5,
  /** Max crew health loss from harassment */
  HARASSMENT_HEALTH_MAX: 10,
  /** Flight time delay multiplier from harassment */
  HARASSMENT_FLIGHT_DELAY: 0.05,
  /** Min crew health loss from boarding */
  BOARDING_HEALTH_MIN: 15,
  /** Max crew health loss from boarding */
  BOARDING_HEALTH_MAX: 25,
  /** Armored vest damage reduction */
  BOARDING_ARMOR_REDUCTION: 0.5,
  /** Min percentage of credits stolen in boarding */
  BOARDING_CREDIT_MIN: 0.1,
  /** Max percentage of credits stolen in boarding */
  BOARDING_CREDIT_MAX: 0.25,
  /** Equipment degradation from boarding (all equipment) */
  BOARDING_EQUIPMENT_DEGRADATION: 10,
  /** Pirate attack random variance (±30%) */
  PIRATE_ATTACK_VARIANCE: 0.3,
  /** Defense score random variance (±15%) */
  DEFENSE_VARIANCE: 0.15,
  /** Defense/pirate ratio below which crew attempts emergency flee */
  FLEE_THRESHOLD: 0.25,
  /** Base flee success chance (modified by velocity) */
  FLEE_BASE_CHANCE: 0.4,
  /** Velocity contribution cap for flee attempts */
  FLEE_VELOCITY_CAP: 0.25,
  /** Divisor for velocity → flee bonus */
  FLEE_VELOCITY_DIVISOR: 50_000,
  /** Crew health cost from a flee (minor damage from pursuit) */
  FLEE_HEALTH_MIN: 3,
  FLEE_HEALTH_MAX: 8,
  /** Flight delay from fleeing (fraction of remaining time) */
  FLEE_FLIGHT_DELAY: 0.08,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate pirate threat level (1-10) from position and cargo.
 */
export function generateThreatLevel(currentKm: number, ship: Ship): number {
  const baseThreat = clamp(
    Math.floor(currentKm / COMBAT_CONSTANTS.THREAT_POSITION_DIVISOR),
    1,
    8
  );

  // Cargo weight from crew equipment in cargo
  let cargoWeight = 0;
  for (const item of ship.cargo) {
    const def = getCrewEquipmentDefinition(item.definitionId);
    cargoWeight += def.weight;
  }
  const cargoBonus = Math.floor(
    cargoWeight / COMBAT_CONSTANTS.THREAT_CARGO_DIVISOR
  );

  return clamp(baseThreat + cargoBonus, 1, 10);
}

/**
 * Attempt to evade the encounter.
 * Returns evasion chance and whether it succeeded.
 */
export function attemptEvasion(ship: Ship): {
  success: boolean;
  chance: number;
} {
  const flight = ship.activeFlightPlan;
  if (!flight) return { success: false, chance: 0 };

  // Velocity factor: fast ships are hard to intercept
  const velocityFactor = clamp(
    flight.currentVelocity / COMBAT_CONSTANTS.EVASION_VELOCITY_DIVISOR,
    0,
    COMBAT_CONSTANTS.EVASION_VELOCITY_CAP
  );

  // Nav scanner bonus
  const navScanner = ship.equipment.find(
    (eq) => eq.definitionId === 'nav_scanner'
  );
  const scannerBonus = navScanner ? COMBAT_CONSTANTS.EVASION_SCANNER_BONUS : 0;

  // Best piloting skill from scanner/helm crew
  const scannerCrew = getCrewForJobType(ship, 'scanner');
  const helmCrew = getCrewForJobType(ship, 'helm');
  const bridgeCrew = [...scannerCrew, ...helmCrew];
  const bestPiloting = getBestCrewSkill(bridgeCrew, 'piloting');
  const pilotingBonus = bestPiloting * COMBAT_CONSTANTS.EVASION_SKILL_FACTOR;

  // Captain command bonus: captain's piloting adds extra evasion
  const commandEvasionBonus = getCommandPilotingBonus(ship) * 0.15;

  // Piloting pool 95% checkpoint: +10% evasion on all routes
  const poolEvasionBonus = getPilotingPoolEvasionBonus(
    getBestCrewPool(bridgeCrew, 'piloting')
  );

  const chance =
    velocityFactor +
    scannerBonus +
    pilotingBonus +
    commandEvasionBonus +
    poolEvasionBonus;
  const success = Math.random() < chance;

  return { success, chance };
}

/**
 * Attempt to negotiate safe passage.
 * Returns negotiation chance, success, and negotiator details.
 */
export function attemptNegotiation(ship: Ship): {
  success: boolean;
  chance: number;
  negotiatorName: string;
  negotiatorId: string;
} {
  let bestCommerce = 0;
  let negotiatorName = '';
  let negotiatorId = '';

  for (const crew of ship.crew) {
    if (crew.skills.commerce > bestCommerce) {
      bestCommerce = crew.skills.commerce;
      negotiatorName = crew.name;
      negotiatorId = crew.id;
    }
  }

  const chance = bestCommerce / COMBAT_CONSTANTS.NEGOTIATION_DIVISOR;
  const success = Math.random() < chance;

  return { success, chance, negotiatorName, negotiatorId };
}

/**
 * Calculate the ship's total defense score from equipment, crew, and mass.
 * All inputs from existing game systems.
 */
export function calculateDefenseScore(ship: Ship): number {
  let defenseScore = 0;

  // 1. Point Defense equipment
  const pdEquipment = ship.equipment.find(
    (eq) => eq.definitionId === 'point_defense'
  );
  if (pdEquipment) {
    const pdEffectiveness = 1 - pdEquipment.degradation / 200;
    let pdScore = COMBAT_CONSTANTS.PD_BASE_SCORE * pdEffectiveness;

    // PD station staffing bonus from fire_control + targeting job slots
    const pdCrew = [
      ...getCrewForJobType(ship, 'fire_control'),
      ...getCrewForJobType(ship, 'targeting'),
    ];
    if (pdCrew.length > 0) {
      const bestGunnerSkill = Math.max(
        0,
        ...pdCrew.map((c) => c.skills.piloting)
      );
      const staffingBonus =
        COMBAT_CONSTANTS.PD_STAFFING_BASE_BONUS +
        bestGunnerSkill * COMBAT_CONSTANTS.PD_SKILL_BONUS;
      pdScore *= 1 + staffingBonus;
    }

    defenseScore += pdScore;
  }

  // 2. Crew in arms_maint job slots with weapons
  const armoryCrew = getCrewForJobType(ship, 'arms_maint');
  for (const crew of armoryCrew) {
    let crewCombat = crew.skills.piloting / 10;

    // Weapon attack scores
    for (const eq of crew.equipment) {
      const eqDef = getCrewEquipmentDefinition(eq.definitionId);
      crewCombat += eqDef.attackScore;
    }

    // Health modifier
    crewCombat *= crew.health / 100;

    defenseScore += crewCombat;
  }

  // 3. Point Defense Laser (lightweight PD without station bonus)
  const pdLaser = ship.equipment.find(
    (eq) => eq.definitionId === 'point_defense_laser'
  );
  if (pdLaser) {
    const laserEffectiveness = 1 - pdLaser.degradation / 200;
    defenseScore += COMBAT_CONSTANTS.PD_LASER_BASE_SCORE * laserEffectiveness;
  }

  // 4. Deflector Shield passive defense
  const deflector = ship.equipment.find(
    (eq) => eq.definitionId === 'deflector_shield'
  );
  if (deflector) {
    defenseScore += COMBAT_CONSTANTS.DEFLECTOR_BONUS;
  }

  // 5. Micro Deflector passive defense
  const microDeflector = ship.equipment.find(
    (eq) => eq.definitionId === 'micro_deflector'
  );
  if (microDeflector) {
    defenseScore += COMBAT_CONSTANTS.MICRO_DEFLECTOR_BONUS;
  }

  // 6. Ship mass bonus
  const shipClass = getShipClass(ship.classId);
  if (shipClass) {
    defenseScore += shipClass.mass / COMBAT_CONSTANTS.MASS_DIVISOR;
  }

  // 7. Captain rally bonus (leadership under fire)
  defenseScore += getCommandRallyBonus(ship);

  return defenseScore;
}

/**
 * Determine combat outcome from defense vs pirate attack comparison.
 * During catch-up, boarding is downgraded to harassment.
 */
export function determineCombatOutcome(
  defenseScore: number,
  pirateAttack: number,
  isCatchUp: boolean
): EncounterOutcome {
  if (defenseScore >= pirateAttack * COMBAT_CONSTANTS.VICTORY_THRESHOLD) {
    return 'victory';
  }

  if (defenseScore >= pirateAttack * COMBAT_CONSTANTS.HARASSMENT_THRESHOLD) {
    return 'harassment';
  }

  // Boarding — downgrade if catch-up
  if (isCatchUp) {
    return 'harassment';
  }
  return 'boarding';
}

/**
 * Apply encounter outcome effects to ship and game state.
 * This is the only function that mutates game data.
 */
export function applyEncounterOutcome(
  result: EncounterResult,
  ship: Ship,
  gameData: GameData
): void {
  // Set cooldown
  ship.lastEncounterTime = gameData.gameTime;

  // Initialize encounter stats if needed
  if (!gameData.encounterStats) {
    gameData.encounterStats = {
      totalEncounters: 0,
      evaded: 0,
      negotiated: 0,
      victories: 0,
      harassments: 0,
      boardings: 0,
      fled: 0,
    };
  }
  gameData.encounterStats.totalEncounters++;

  switch (result.type) {
    case 'evaded':
      gameData.encounterStats.evaded++;
      break;

    case 'negotiated':
      gameData.encounterStats.negotiated++;
      if (result.creditsLost && result.creditsLost > 0) {
        gameData.credits = Math.max(0, gameData.credits - result.creditsLost);
      }
      break;

    case 'victory':
      gameData.encounterStats.victories++;
      // PD degradation (both PD types)
      {
        for (const pdId of ['point_defense', 'point_defense_laser'] as const) {
          const pd = ship.equipment.find((eq) => eq.definitionId === pdId);
          if (pd) {
            pd.degradation = Math.min(
              100,
              pd.degradation + COMBAT_CONSTANTS.VICTORY_PD_DEGRADATION
            );
          }
        }
      }
      // Bounty
      if (result.creditsGained && result.creditsGained > 0) {
        gameData.credits += result.creditsGained;
        gameData.lifetimeCreditsEarned += result.creditsGained;
      }
      break;

    case 'harassment':
      gameData.encounterStats.harassments++;
      // PD degradation (both PD types)
      {
        for (const pdId of ['point_defense', 'point_defense_laser'] as const) {
          const pd = ship.equipment.find((eq) => eq.definitionId === pdId);
          if (pd) {
            pd.degradation = Math.min(
              100,
              pd.degradation + COMBAT_CONSTANTS.HARASSMENT_PD_DEGRADATION
            );
          }
        }
      }
      // Crew health loss
      if (result.healthLost) {
        for (const crew of ship.crew) {
          const loss = result.healthLost[crew.id];
          if (loss != null) {
            crew.health = Math.max(0, crew.health - loss);
            recordCrewDamage(crew.id, 'combat');
          }
        }
      }
      // Flight delay
      if (result.flightDelayAdded && ship.activeFlightPlan) {
        ship.activeFlightPlan.totalTime += result.flightDelayAdded;
      }
      break;

    case 'boarding':
      gameData.encounterStats.boardings++;
      // Crew health loss (armored vest reduces)
      if (result.healthLost) {
        for (const crew of ship.crew) {
          const loss = result.healthLost[crew.id];
          if (loss != null) {
            crew.health = Math.max(0, crew.health - loss);
            recordCrewDamage(crew.id, 'combat');
          }
        }
      }
      // Credits stolen
      if (result.creditsLost && result.creditsLost > 0) {
        gameData.credits = Math.max(0, gameData.credits - result.creditsLost);
      }
      // Equipment degradation on ALL ship equipment
      if (result.equipmentDegraded) {
        for (const eq of ship.equipment) {
          const degradation = result.equipmentDegraded[eq.id];
          if (degradation != null) {
            eq.degradation = Math.min(100, eq.degradation + degradation);
          }
        }
      }
      break;

    case 'fled':
      gameData.encounterStats.fled++;
      // Crew health loss from pursuit
      if (result.healthLost) {
        for (const crew of ship.crew) {
          const loss = result.healthLost[crew.id];
          if (loss != null) {
            crew.health = Math.max(0, crew.health - loss);
            recordCrewDamage(crew.id, 'combat');
          }
        }
      }
      // Flight delay from evasive maneuvers
      if (result.flightDelayAdded && ship.activeFlightPlan) {
        ship.activeFlightPlan.totalTime += result.flightDelayAdded;
      }
      break;
  }

  // Log the encounter
  const narrative = getEncounterNarrative(result, ship);
  const logType = getEncounterLogType(result.type);
  addLog(gameData.log, gameData.gameTime, logType, narrative, ship.name);

  // Award event XP for encounter outcomes
  const skillEvent = encounterToSkillEvent(result);
  if (skillEvent) {
    const skillUps = awardEventSkillGains(ship, skillEvent);
    if (skillUps.length > 0) {
      logSkillUps(gameData.log, gameData.gameTime, ship.name, skillUps);
    }
  }
}

/**
 * Convert encounter result to skill event for skill progression.
 */
function encounterToSkillEvent(result: EncounterResult): SkillEvent | null {
  switch (result.type) {
    case 'evaded':
      return { type: 'encounter_evaded' };
    case 'negotiated':
      return {
        type: 'encounter_negotiated',
        negotiatorId: result.negotiatorId || '',
      };
    case 'victory':
      return { type: 'encounter_victory' };
    case 'harassment':
      return { type: 'encounter_harassment' };
    case 'boarding':
      return { type: 'encounter_boarding' };
    case 'fled':
      return { type: 'encounter_fled' };
    default:
      return null;
  }
}

/**
 * Map encounter outcome to log entry type.
 */
function getEncounterLogType(outcome: EncounterOutcome): LogEntryType {
  switch (outcome) {
    case 'evaded':
      return 'encounter_evaded';
    case 'negotiated':
      return 'encounter_negotiated';
    case 'victory':
      return 'encounter_victory';
    case 'harassment':
      return 'encounter_harassment';
    case 'boarding':
      return 'encounter_boarding';
    case 'fled':
      return 'encounter_fled';
  }
}

/** Narrative templates for encounter outcomes */
const EVASION_NARRATIVES = [
  'Long-range sensor contact detected. Navigator plotted evasive course — contact lost.',
  'Unidentified vessel on intercept course. Too fast to catch — contact faded.',
  'Hazard scanner flagged incoming signature. Evasive burn executed successfully.',
];

const NEGOTIATION_NARRATIVES = [
  '{crewName} negotiated safe passage for {cost} credits.',
  'Pirate hail received. {crewName} talked them down to {cost} credits.',
  'Armed vessel demanded tribute. {crewName} brokered a deal: {cost} credits for passage.',
];

const VICTORY_NARRATIVES = [
  'Pirate raider engaged. Point defense repelled the attack. Bounty: {bounty} credits.',
  'Hostile vessel opened fire. Crew fought back — attacker retreated. Bounty: {bounty} credits.',
  'Pirates attempted intercept. Ship defenses held. {bounty} credit bounty claimed.',
];

const HARASSMENT_NARRATIVES = [
  'Pirate skirmish in contested space. Minor damage sustained.',
  'Hit-and-run attack by raiders. Hull scarring and minor injuries.',
  'Pirates harassed the ship through the region. Some equipment damage taken.',
];

const BOARDING_NARRATIVES = [
  'Ship boarded by pirates. {credits} credits stolen, crew injured.',
  'Pirates overwhelmed defenses and boarded. Cargo raided, {credits} credits seized.',
  'Hostile boarding action. Crew injured, {credits} credits lost. Equipment damaged.',
];

const FLED_NARRATIVES = [
  'Outgunned and outmatched. Emergency burn executed — escaped with minor damage.',
  'Crew recognized impossible odds. Hard burn to escape — pursuit fire grazed the hull.',
  'Hostile force too strong to engage. Full power to engines — barely escaped.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a narrative log message for an encounter result.
 */
export function getEncounterNarrative(
  result: EncounterResult,
  _ship: Ship
): string {
  switch (result.type) {
    case 'evaded':
      return pickRandom(EVASION_NARRATIVES);

    case 'negotiated': {
      const template = pickRandom(NEGOTIATION_NARRATIVES);
      return template
        .replace('{crewName}', result.negotiatorName || 'Crew member')
        .replace('{cost}', String(result.creditsLost || 0));
    }

    case 'victory': {
      const template = pickRandom(VICTORY_NARRATIVES);
      return template.replace('{bounty}', String(result.creditsGained || 0));
    }

    case 'harassment':
      return pickRandom(HARASSMENT_NARRATIVES);

    case 'boarding': {
      const template = pickRandom(BOARDING_NARRATIVES);
      return template.replace('{credits}', String(result.creditsLost || 0));
    }

    case 'fled':
      return pickRandom(FLED_NARRATIVES);
  }
}

/**
 * Attempt emergency flee when heavily outmatched.
 * Crew recognizes certain defeat and tries to run rather than fight.
 * Returns flee chance and whether it succeeded.
 */
export function attemptFlee(
  ship: Ship,
  defenseScore: number,
  pirateAttack: number
): { shouldFlee: boolean; success: boolean; chance: number } {
  // Only flee when severely outmatched
  if (
    pirateAttack === 0 ||
    defenseScore / pirateAttack >= COMBAT_CONSTANTS.FLEE_THRESHOLD
  ) {
    return { shouldFlee: false, success: false, chance: 0 };
  }

  // Flee chance: base + velocity bonus
  let chance = COMBAT_CONSTANTS.FLEE_BASE_CHANCE;

  const flight = ship.activeFlightPlan;
  if (flight) {
    const velocityBonus = clamp(
      flight.currentVelocity / COMBAT_CONSTANTS.FLEE_VELOCITY_DIVISOR,
      0,
      COMBAT_CONSTANTS.FLEE_VELOCITY_CAP
    );
    chance += velocityBonus;
  }

  const success = Math.random() < chance;
  return { shouldFlee: true, success, chance };
}

/**
 * Full encounter resolution pipeline.
 * Detect → Evade → Negotiate → Flee (if outmatched) → Combat → Outcome
 *
 * Returns an EncounterResult describing what happened.
 * Call applyEncounterOutcome() to mutate game state.
 */
export function resolveEncounter(
  ship: Ship,
  gameData: GameData,
  isCatchUp: boolean
): EncounterResult {
  const currentKm = getShipPositionKm(ship, gameData.world);
  const threatLevel = generateThreatLevel(currentKm, ship);

  // Step 1: Attempt evasion
  const evasion = attemptEvasion(ship);
  if (evasion.success) {
    const result: EncounterResult = {
      type: 'evaded',
      shipId: ship.id,
      threatLevel,
      positionKm: currentKm,
    };
    applyEncounterOutcome(result, ship, gameData);
    return result;
  }

  // Step 2: Attempt negotiation (captain only — acting captains lack authority)
  const negotiation = canNegotiate(ship)
    ? attemptNegotiation(ship)
    : { success: false, chance: 0, negotiatorName: '', negotiatorId: '' };
  if (negotiation.success) {
    const ransomRate = 0.05 + Math.random() * 0.1; // 5-15% of credits
    const scaledRate = ransomRate * (threatLevel / 10);
    const ransom = Math.max(
      COMBAT_CONSTANTS.NEGOTIATION_MIN_RANSOM,
      Math.floor(gameData.credits * scaledRate)
    );

    const result: EncounterResult = {
      type: 'negotiated',
      shipId: ship.id,
      threatLevel,
      positionKm: currentKm,
      creditsLost: ransom,
      negotiatorName: negotiation.negotiatorName,
      negotiatorId: negotiation.negotiatorId,
    };
    applyEncounterOutcome(result, ship, gameData);
    return result;
  }

  // Step 3: Assess combat odds with variance
  const baseDefense = calculateDefenseScore(ship);
  const basePirateAttack =
    threatLevel * COMBAT_CONSTANTS.PIRATE_ATTACK_MULTIPLIER;

  // Apply random variance to both sides
  const defenseVariance = randomBetween(
    1 - COMBAT_CONSTANTS.DEFENSE_VARIANCE,
    1 + COMBAT_CONSTANTS.DEFENSE_VARIANCE
  );
  const attackVariance = randomBetween(
    1 - COMBAT_CONSTANTS.PIRATE_ATTACK_VARIANCE,
    1 + COMBAT_CONSTANTS.PIRATE_ATTACK_VARIANCE
  );
  const defenseScore = baseDefense * defenseVariance;
  const pirateAttack = basePirateAttack * attackVariance;

  // Step 3b: Emergency flee if heavily outmatched
  const flee = attemptFlee(ship, defenseScore, pirateAttack);
  if (flee.shouldFlee && flee.success) {
    const result: EncounterResult = {
      type: 'fled',
      shipId: ship.id,
      threatLevel,
      positionKm: currentKm,
      defenseScore,
      pirateAttack,
    };

    // Minor damage from the pursuit
    const healthLost: Record<string, number> = {};
    for (const crew of ship.crew) {
      healthLost[crew.id] = randomBetween(
        COMBAT_CONSTANTS.FLEE_HEALTH_MIN,
        COMBAT_CONSTANTS.FLEE_HEALTH_MAX
      );
    }
    result.healthLost = healthLost;

    // Flight delay from evasive maneuvers
    if (ship.activeFlightPlan) {
      const remainingTime =
        ship.activeFlightPlan.totalTime - ship.activeFlightPlan.elapsedTime;
      result.flightDelayAdded = Math.round(
        remainingTime * COMBAT_CONSTANTS.FLEE_FLIGHT_DELAY
      );
    }

    applyEncounterOutcome(result, ship, gameData);
    return result;
  }

  // Step 4: Combat resolution
  const outcome = determineCombatOutcome(defenseScore, pirateAttack, isCatchUp);

  const result: EncounterResult = {
    type: outcome,
    shipId: ship.id,
    threatLevel,
    positionKm: currentKm,
    defenseScore,
    pirateAttack,
  };

  // Calculate outcome-specific effects
  switch (outcome) {
    case 'evaded':
    case 'negotiated':
    case 'fled':
      // No additional effects — already handled upstream
      break;

    case 'victory':
      result.creditsGained =
        threatLevel * COMBAT_CONSTANTS.VICTORY_BOUNTY_PER_THREAT;
      break;

    case 'harassment': {
      // Crew health loss
      const healthLost: Record<string, number> = {};
      for (const crew of ship.crew) {
        healthLost[crew.id] = randomBetween(
          COMBAT_CONSTANTS.HARASSMENT_HEALTH_MIN,
          COMBAT_CONSTANTS.HARASSMENT_HEALTH_MAX
        );
      }
      result.healthLost = healthLost;

      // Flight delay
      if (ship.activeFlightPlan) {
        const remainingTime =
          ship.activeFlightPlan.totalTime - ship.activeFlightPlan.elapsedTime;
        result.flightDelayAdded = Math.round(
          remainingTime * COMBAT_CONSTANTS.HARASSMENT_FLIGHT_DELAY
        );
      }
      break;
    }

    case 'boarding': {
      // Crew health loss (armored vest reduces)
      const healthLost: Record<string, number> = {};
      for (const crew of ship.crew) {
        let damage = randomBetween(
          COMBAT_CONSTANTS.BOARDING_HEALTH_MIN,
          COMBAT_CONSTANTS.BOARDING_HEALTH_MAX
        );

        // Check for armored vest
        const hasArmor = crew.equipment.some(
          (eq) => eq.definitionId === 'armored_vest'
        );
        if (hasArmor) {
          damage *= 1 - COMBAT_CONSTANTS.BOARDING_ARMOR_REDUCTION;
        }

        healthLost[crew.id] = damage;
      }
      result.healthLost = healthLost;

      // Credits stolen
      const stealRate = randomBetween(
        COMBAT_CONSTANTS.BOARDING_CREDIT_MIN,
        COMBAT_CONSTANTS.BOARDING_CREDIT_MAX
      );
      result.creditsLost = Math.floor(gameData.credits * stealRate);

      // Equipment degradation on ALL ship equipment
      const equipmentDegraded: Record<string, number> = {};
      for (const eq of ship.equipment) {
        equipmentDegraded[eq.id] =
          COMBAT_CONSTANTS.BOARDING_EQUIPMENT_DEGRADATION;
      }
      result.equipmentDegraded = equipmentDegraded;
      break;
    }
  }

  applyEncounterOutcome(result, ship, gameData);
  return result;
}

/**
 * Register the combat system's encounter resolver with the game tick system.
 * Call this once at application startup.
 */
export function initCombatSystem(): void {
  setEncounterResolver(resolveEncounter);
}
