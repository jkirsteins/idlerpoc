/**
 * Captain Bonus System
 *
 * Centralizes all captain command bonus calculations. The captain's skills
 * provide multiplicative bonuses to income, mining yield, and encounter
 * evasion on the ship they are aboard. Ships without the captain fall back
 * to an acting captain (highest commerce crew) who provides 25% of the bonus.
 *
 * Formulas (from captain-flagship-design.md):
 *   Commerce:  captain skill / 100  (e.g. skill 50 → +50%)
 *   Piloting:  captain skill / 200  (e.g. skill 50 → +25%)
 *   Mining:    captain skill / 100  (e.g. skill 50 → +50%)
 *   Acting captain: 25% of the equivalent captain bonus (commerce only)
 */

import type { CrewMember, Ship, GameData } from './models';

/** Fraction of full bonus that an acting captain provides. */
const ACTING_CAPTAIN_FRACTION = 0.25;

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
  actingCaptainName?: string;
  actingCommerceBonus?: number;
}

export function getCommandBonusBreakdown(ship: Ship): CommandBonusBreakdown {
  const captain = getCaptainOnShip(ship);
  const acting = getActingCaptain(ship);

  if (captain) {
    return {
      hasCaptain: true,
      captainName: captain.name,
      commerceBonus: captain.skills.commerce / 100,
      pilotingBonus: captain.skills.piloting / 200,
      miningBonus: captain.skills.mining / 100,
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
