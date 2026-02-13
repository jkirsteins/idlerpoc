import type { Ship, World, Vec2 } from './models';
import type { GravityAssistOpportunity } from './models';
import {
  getLocationPosition,
  euclideanDistance,
  lerpVec2,
} from './orbitalMechanics';
import { getBestCrewSkill } from './crewRoles';

/**
 * Gravity Assist Corridors
 *
 * Detects when a ship's trajectory passes near a massive body during transit.
 * On success of a piloting skill check, the ship receives a fuel refund.
 * On failure, a small correction burn penalty is applied.
 *
 * Everything is emergent: body mass, orbital geometry, approach distance,
 * and crew skill all feed into the outcome.
 */

// ─── Gravity Body Definitions ───────────────────────────────────

/**
 * A celestial body with enough mass to offer a gravity assist.
 * Thresholds are gameplay-expanded beyond physical Hill spheres
 * for ~30-50% trigger rate on interplanetary flights.
 */
export interface GravityBody {
  locationId: string; // world location representing (or orbiting) this body
  bodyName: string; // display name for logs/UI
  massKg: number; // real physical mass
  thresholdKm: number; // max distance for assist detection (gameplay-tuned)
}

/**
 * Massive bodies eligible for gravity assists.
 * Mass values are physical; thresholds are gameplay-expanded.
 */
export const GRAVITY_BODIES: GravityBody[] = [
  {
    locationId: 'earth',
    bodyName: 'Earth',
    massKg: 5.972e24,
    thresholdKm: 3_000_000,
  },
  {
    locationId: 'tycho_colony',
    bodyName: 'Moon',
    massKg: 7.342e22,
    thresholdKm: 200_000,
  },
  {
    locationId: 'mars',
    bodyName: 'Mars',
    massKg: 6.417e23,
    thresholdKm: 3_000_000,
  },
  {
    locationId: 'ceres_station',
    bodyName: 'Ceres',
    massKg: 9.393e20,
    thresholdKm: 200_000,
  },
  {
    locationId: 'jupiter_station',
    bodyName: 'Jupiter',
    massKg: 1.898e27,
    thresholdKm: 75_000_000,
  },
];

// Number of sample points along the trajectory for proximity checks
const SAMPLE_COUNT = 20;

// Jupiter mass used as normalization anchor for mass scale
const JUPITER_MASS_KG = 1.898e27;

// ─── Detection ──────────────────────────────────────────────────

/**
 * Scan a planned trajectory for gravity assist opportunities.
 *
 * Samples SAMPLE_COUNT points along the straight-line path, checking
 * each massive body's position at the corresponding future game time.
 * Bodies matching the origin or destination are excluded.
 *
 * @returns Opportunities sorted by approachProgress (chronological)
 */
export function scanForGravityAssists(
  originPos: Vec2,
  interceptPos: Vec2,
  totalTimeSec: number,
  departureGameTime: number,
  world: World,
  originId: string,
  destinationId: string
): GravityAssistOpportunity[] {
  if (totalTimeSec <= 0) return [];

  const opportunities: GravityAssistOpportunity[] = [];

  for (const body of GRAVITY_BODIES) {
    // Exclude origin and destination bodies
    if (body.locationId === originId || body.locationId === destinationId) {
      continue;
    }

    const bodyLoc = world.locations.find((l) => l.id === body.locationId);
    if (!bodyLoc) continue;

    let minDistance = Infinity;
    let minProgress = 0;
    let minGameTime = departureGameTime;

    // Sample trajectory points
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT; // 0 to 1
      const sampleGameTime = departureGameTime + totalTimeSec * t;

      // Ship position along straight-line trajectory
      const shipPos = lerpVec2(originPos, interceptPos, t);

      // Body position at this future time
      const bodyPos = getLocationPosition(bodyLoc, sampleGameTime, world);

      const dist = euclideanDistance(shipPos, bodyPos);

      if (dist < minDistance) {
        minDistance = dist;
        minProgress = t;
        minGameTime = sampleGameTime;
      }
    }

    // Check if closest approach is within threshold
    if (minDistance < body.thresholdKm) {
      opportunities.push({
        bodyId: body.locationId,
        bodyName: body.bodyName,
        massKg: body.massKg,
        closestApproachKm: minDistance,
        thresholdKm: body.thresholdKm,
        approachProgress: minProgress,
        approachGameTime: minGameTime,
        checked: false,
        result: 'pending',
        fuelRefundKg: 0,
        fuelPenaltyKg: 0,
      });
    }
  }

  // Sort by progress (chronological order along the flight)
  opportunities.sort((a, b) => a.approachProgress - b.approachProgress);

  return opportunities;
}

// ─── Skill Check & Resolution ───────────────────────────────────

/**
 * Resolve a gravity assist opportunity when the ship reaches the approach point.
 *
 * Performs a piloting skill check. On success, calculates a fuel refund.
 * On failure, calculates a small correction burn penalty.
 *
 * Mutates the opportunity in-place (sets checked, result, fuelRefundKg/fuelPenaltyKg).
 *
 * @param tripFuelKg Estimated one-leg fuel cost for this trip (caller computes
 *   via calculateOneLegFuelKg to avoid circular imports with flightPhysics).
 */
export function resolveGravityAssist(
  opportunity: GravityAssistOpportunity,
  ship: Ship,
  tripFuelKg: number
): void {
  opportunity.checked = true;

  // Best piloting skill among all crew
  const bestPiloting = getBestCrewSkill(ship.crew, 'piloting');

  // Base success chance: 10% at skill 0, 90% at skill 100
  const baseChance = 0.1 + (bestPiloting / 100) * 0.8;

  // Difficulty modifier: closer approach is harder
  // approachFraction: 0 = right on top, 1 = barely in range
  const approachFraction =
    opportunity.closestApproachKm / opportunity.thresholdKm;
  const difficultyModifier = 0.5 + 0.5 * approachFraction;

  const adjustedChance = baseChance * difficultyModifier;

  if (Math.random() < adjustedChance) {
    // Success — calculate fuel refund
    opportunity.result = 'success';
    opportunity.fuelRefundKg = calculateAssistFuelRefund(
      opportunity,
      bestPiloting,
      tripFuelKg
    );
  } else {
    // Failure — calculate correction burn penalty
    opportunity.result = 'failure';
    opportunity.fuelPenaltyKg = calculateAssistFuelPenalty(
      opportunity,
      tripFuelKg
    );
  }
}

// ─── Fuel Calculations ──────────────────────────────────────────

/**
 * Calculate fuel refund on a successful gravity assist.
 *
 * Refund is emergent from: body mass, approach distance, and pilot skill.
 * Typical range: ~2-10% of trip fuel cost.
 */
function calculateAssistFuelRefund(
  opportunity: GravityAssistOpportunity,
  pilotingSkill: number,
  tripFuelKg: number
): number {
  // Mass scale: normalized to Jupiter = 1.0 (log scale)
  const massScale =
    Math.log10(opportunity.massKg) / Math.log10(JUPITER_MASS_KG);

  // Approach bonus: closer = more delta-v gain
  // 1.0 at threshold edge, 2.0 at point-blank
  const approachBonus =
    1 + (1 - opportunity.closestApproachKm / opportunity.thresholdKm);

  // Skill quality: better pilot executes more efficiently
  // 0.5 at skill 0, 1.0 at skill 100
  const skillQuality = 0.5 + (pilotingSkill / 100) * 0.5;

  // Base refund: 5% of trip fuel cost
  const baseRefundPercent = 0.05;

  const refundPercent =
    baseRefundPercent * massScale * approachBonus * skillQuality;

  const refundKg = tripFuelKg * refundPercent;

  // Sanity guard
  if (!Number.isFinite(refundKg) || refundKg < 0) return 0;

  return refundKg;
}

/**
 * Calculate fuel penalty on a failed gravity assist.
 *
 * Penalty is a small correction burn: ~1-2% of trip fuel cost.
 * Closer approach = larger correction needed.
 */
function calculateAssistFuelPenalty(
  opportunity: GravityAssistOpportunity,
  tripFuelKg: number
): number {
  // Mass scale: normalized to Jupiter = 1.0 (log scale)
  const massScale =
    Math.log10(opportunity.massKg) / Math.log10(JUPITER_MASS_KG);

  // Approach bonus: closer = larger correction needed
  const approachBonus =
    1 + (1 - opportunity.closestApproachKm / opportunity.thresholdKm);

  // Base penalty: 1% of trip fuel cost
  const basePenaltyPercent = 0.01;

  const penaltyPercent = basePenaltyPercent * massScale * approachBonus;

  const penaltyKg = tripFuelKg * penaltyPercent;

  // Sanity guard
  if (!Number.isFinite(penaltyKg) || penaltyKg < 0) return 0;

  return penaltyKg;
}
