/**
 * Captain Bonus System
 *
 * Centralizes all captain command bonus calculations. The captain's skills
 * provide multiplicative bonuses to income, mining yield, and encounter
 * evasion on the ship they are aboard. Ships without the captain fall back
 * to an acting captain (highest commerce crew) who provides 25% of the bonus.
 *
 * Phase 1 — Command Multipliers:
 *   Commerce:  captain skill / 100  (e.g. skill 50 → +50%)
 *   Piloting:  captain skill / 200  (e.g. skill 50 → +25%)
 *   Mining:    captain skill / 100  (e.g. skill 50 → +50%)
 *   Acting captain: 25% of the equivalent captain bonus (commerce only)
 *
 * Phase 3 — Captain-Only Encounters:
 *   Negotiation gated behind captain presence.
 *   Rally defense bonus (+5) when captain is aboard.
 *
 * Phase 4 — Fleet Coordination Aura:
 *   +10% income and training speed for ships at the same location as the captain.
 *   +5% for ships one hop away (adjacent on the nav chart).
 *
 * Phase 5 — Training Speed Aura:
 *   Captain's ship gets 1.5× training speed for all crew aboard.
 */

import type { CrewMember, Ship, GameData, World } from './models';

/** Fraction of full bonus that an acting captain provides. */
const ACTING_CAPTAIN_FRACTION = 0.25;

// ── Phase 3: Captain-Only Encounters ────────────────────────────

/** Flat defense score bonus when captain is aboard (leadership under fire). */
export const RALLY_DEFENSE_BONUS = 5;

// ── Phase 4: Fleet Coordination Aura ────────────────────────────

/** Income/training multiplier for ships at the captain's location. */
export const FLEET_AURA_SAME_LOCATION = 0.1;

/** Income/training multiplier for ships one hop from the captain. */
export const FLEET_AURA_ADJACENT = 0.05;

// ── Phase 5: Training Speed Aura ────────────────────────────────

/** Training speed multiplier on the captain's own ship. */
export const CAPTAIN_TRAINING_MULTIPLIER = 1.5;

/**
 * Returns the player captain if they are aboard this ship.
 */
export function getCaptainOnShip(ship: Ship): CrewMember | undefined {
  return ship.crew.find((c) => c.isCaptain);
}

/**
 * Returns the acting captain — the crew member with the highest commerce
 * skill, excluding the real captain. Returns undefined if no eligible crew.
 */
export function getActingCaptain(ship: Ship): CrewMember | undefined {
  return ship.crew
    .filter((c) => !c.isCaptain)
    .reduce<
      CrewMember | undefined
    >((best, c) => (!best || c.skills.commerce > best.skills.commerce ? c : best), undefined);
}

/**
 * Commerce command bonus for a ship.
 * Captain aboard: commerce / 100 (continuous linear, skill 50 → +50%).
 * Acting captain: 25% of what the acting captain's skill would give.
 * No crew: 0.
 */
export function getCommandCommerceBonus(ship: Ship): number {
  const captain = getCaptainOnShip(ship);
  if (captain) {
    return captain.skills.commerce / 100;
  }
  const acting = getActingCaptain(ship);
  if (acting) {
    return (acting.skills.commerce / 100) * ACTING_CAPTAIN_FRACTION;
  }
  return 0;
}

/**
 * Piloting command bonus for a ship.
 * Captain aboard: piloting / 200 (skill 50 → +25%).
 * Acting captain: no piloting bonus.
 */
export function getCommandPilotingBonus(ship: Ship): number {
  const captain = getCaptainOnShip(ship);
  if (captain) {
    return captain.skills.piloting / 200;
  }
  return 0;
}

/**
 * Mining command bonus for a ship.
 * Captain aboard: mining / 100 (skill 50 → +50%).
 * Acting captain: no mining bonus.
 */
export function getCommandMiningBonus(ship: Ship): number {
  const captain = getCaptainOnShip(ship);
  if (captain) {
    return captain.skills.mining / 100;
  }
  return 0;
}

/**
 * Full breakdown of the command bonus for UI display.
 */
export interface CommandBonusBreakdown {
  hasCaptain: boolean;
  captainName: string;
  commerceBonus: number;
  pilotingBonus: number;
  miningBonus: number;
  /** Can this ship negotiate during encounters? (captain only) */
  canNegotiate: boolean;
  /** Rally defense bonus (captain only) */
  rallyBonus: number;
  /** Training speed multiplier on this ship */
  trainingMultiplier: number;
  /** Fleet aura bonus this ship receives (0, 0.05, or 0.10) */
  fleetAura: number;
  actingCaptainName?: string;
  actingCommerceBonus?: number;
}

export function getCommandBonusBreakdown(
  ship: Ship,
  gameData?: GameData
): CommandBonusBreakdown {
  const captain = getCaptainOnShip(ship);
  const acting = getActingCaptain(ship);
  const aura = gameData ? getFleetAuraBonus(ship, gameData) : 0;

  if (captain) {
    return {
      hasCaptain: true,
      captainName: captain.name,
      commerceBonus: captain.skills.commerce / 100,
      pilotingBonus: captain.skills.piloting / 200,
      miningBonus: captain.skills.mining / 100,
      canNegotiate: true,
      rallyBonus: RALLY_DEFENSE_BONUS,
      trainingMultiplier: CAPTAIN_TRAINING_MULTIPLIER,
      fleetAura: aura,
      actingCaptainName: acting?.name,
      actingCommerceBonus: acting
        ? (acting.skills.commerce / 100) * ACTING_CAPTAIN_FRACTION
        : undefined,
    };
  }

  if (acting) {
    return {
      hasCaptain: false,
      captainName: '',
      commerceBonus: (acting.skills.commerce / 100) * ACTING_CAPTAIN_FRACTION,
      pilotingBonus: 0,
      miningBonus: 0,
      canNegotiate: false,
      rallyBonus: 0,
      trainingMultiplier: 1.0,
      fleetAura: aura,
      actingCaptainName: acting.name,
      actingCommerceBonus:
        (acting.skills.commerce / 100) * ACTING_CAPTAIN_FRACTION,
    };
  }

  return {
    hasCaptain: false,
    captainName: '',
    commerceBonus: 0,
    pilotingBonus: 0,
    miningBonus: 0,
    canNegotiate: false,
    rallyBonus: 0,
    trainingMultiplier: 1.0,
    fleetAura: aura,
  };
}

/**
 * Given a total payment (which already includes the command bonus) and the
 * ship, compute how many credits the command bonus accounts for.
 *
 * The payment formula applies the command bonus as a multiplicative factor
 * within (1 + crewBonus + commandBonus). We approximate the command bonus
 * portion as:
 *   bonusCredits = payment - payment / (1 + commandBonus)
 *
 * This slightly overstates the attribution when crewBonus > 0 but provides
 * a clear, understandable number for the player.
 */
export function getCommandBonusCreditAttribution(
  totalPayment: number,
  ship: Ship
): number {
  const commandBonus = getCommandCommerceBonus(ship);
  if (commandBonus <= 0) return 0;
  return Math.round(totalPayment - totalPayment / (1 + commandBonus));
}

/**
 * What would the real captain provide if transferred to this ship?
 * Looks up the captain from any ship in the fleet and computes their
 * commerce bonus as if they were aboard.
 *
 * Returns 0 if the captain is already on this ship or if no captain exists.
 */
export function getHypotheticalCaptainBonus(
  ship: Ship,
  gameData: GameData
): number {
  // If captain is already here, no hypothetical needed
  if (ship.crew.some((c) => c.isCaptain)) return 0;

  // Find the captain across all ships
  for (const otherShip of gameData.ships) {
    const captain = otherShip.crew.find((c) => c.isCaptain);
    if (captain) {
      return captain.skills.commerce / 100;
    }
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3: Captain-Only Encounter Outcomes
// ═══════════════════════════════════════════════════════════════════

/**
 * Whether a ship can attempt negotiation during an encounter.
 * Only the captain's ship can negotiate — acting captains lack the
 * authority to broker deals with pirates.
 */
export function canNegotiate(ship: Ship): boolean {
  return getCaptainOnShip(ship) !== undefined;
}

/**
 * Rally defense bonus from captain's leadership under fire.
 * Returns RALLY_DEFENSE_BONUS when captain is aboard, 0 otherwise.
 */
export function getCommandRallyBonus(ship: Ship): number {
  return getCaptainOnShip(ship) ? RALLY_DEFENSE_BONUS : 0;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 4: Fleet Coordination Aura
// ═══════════════════════════════════════════════════════════════════

/**
 * Get a ship's docked or orbiting location ID.
 * Returns null if the ship is in flight (in-flight ships don't
 * participate in the fleet aura — they're between locations).
 */
export function getShipLocationId(ship: Ship): string | null {
  if (ship.location.status === 'docked' && ship.location.dockedAt) {
    return ship.location.dockedAt;
  }
  if (ship.location.status === 'orbiting' && ship.location.orbitingAt) {
    return ship.location.orbitingAt;
  }
  return null;
}

/**
 * Find the captain's current location (docked/orbiting).
 * Returns null if the captain is in flight or doesn't exist.
 */
export function getCaptainLocationId(gameData: GameData): string | null {
  for (const ship of gameData.ships) {
    if (ship.crew.some((c) => c.isCaptain)) {
      return getShipLocationId(ship);
    }
  }
  return null;
}

/**
 * Are two locations adjacent? Adjacency is derived from the world layout:
 * locations sorted by distance from Earth are adjacent if they are
 * consecutive in the sorted order (no other location between them).
 *
 * This is emergent from the 1D distance model — the nav chart's natural
 * topology defines what "one hop away" means.
 */
export function areLocationsAdjacent(
  locIdA: string,
  locIdB: string,
  world: World
): boolean {
  const sorted = [...world.locations].sort(
    (a, b) => a.distanceFromEarth - b.distanceFromEarth
  );
  const indexA = sorted.findIndex((l) => l.id === locIdA);
  const indexB = sorted.findIndex((l) => l.id === locIdB);
  if (indexA < 0 || indexB < 0) return false;
  return Math.abs(indexA - indexB) === 1;
}

/**
 * Fleet coordination aura bonus for a ship.
 *
 * Returns the fractional bonus (0.10, 0.05, or 0) based on proximity
 * to the captain's ship. The captain's own ship returns 0 — it receives
 * direct command bonuses instead, which are stronger.
 *
 * Only applies to ships that are docked or orbiting (not in flight).
 */
export function getFleetAuraBonus(ship: Ship, gameData: GameData): number {
  // Captain's own ship gets direct command bonuses, not aura
  if (getCaptainOnShip(ship)) return 0;

  const captainLoc = getCaptainLocationId(gameData);
  if (!captainLoc) return 0;

  const shipLoc = getShipLocationId(ship);
  if (!shipLoc) return 0;

  if (shipLoc === captainLoc) return FLEET_AURA_SAME_LOCATION;

  if (areLocationsAdjacent(shipLoc, captainLoc, gameData.world)) {
    return FLEET_AURA_ADJACENT;
  }

  return 0;
}

/**
 * Income multiplier from the fleet coordination aura.
 * Returns 1.0 + aura bonus (e.g. 1.10 at same location, 1.05 adjacent).
 * Convenience wrapper for applying to payment amounts.
 */
export function getFleetAuraIncomeMultiplier(
  ship: Ship,
  gameData: GameData
): number {
  return 1.0 + getFleetAuraBonus(ship, gameData);
}

// ═══════════════════════════════════════════════════════════════════
// Phase 5: Training Speed Aura
// ═══════════════════════════════════════════════════════════════════

/**
 * Training speed multiplier for a ship.
 *
 * Captain's ship: 1.5× training speed for all crew aboard.
 * Other ships: base from fleet aura (1.0 + aura bonus).
 *
 * This makes the captain's ship the natural training ground — recruit
 * new crew, train on the flagship, then deploy to fleet ships.
 */
export function getCommandTrainingMultiplier(
  ship: Ship,
  gameData: GameData
): number {
  if (getCaptainOnShip(ship)) {
    return CAPTAIN_TRAINING_MULTIPLIER;
  }
  return 1.0 + getFleetAuraBonus(ship, gameData);
}
