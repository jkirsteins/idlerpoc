import type {
  Ship,
  GameData,
  World,
  WorldLocation,
  FlightPhase,
  ThreatLevel,
} from './models';
import { getEngineDefinition, type EngineDefinition } from './engines';
import { getShipClass } from './shipClasses';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { getCrewForJobType } from './jobSlots';

/**
 * Encounter Detection System
 *
 * Per-tick probability calculation for pirate encounters.
 * All inputs derive from existing game data — nothing hardcoded.
 *
 * Formula: encounterChance = BASE_RATE × positionDanger × heatSignature × crewSkillFactor
 */

/** Tuning constants — collected in one place for balance adjustments */
export const ENCOUNTER_CONSTANTS = {
  /** Per-tick base probability (0.0005%) — scaled for 180 gs/tick */
  BASE_RATE: 0.000005,
  /** Minimum game-seconds between encounters per ship */
  COOLDOWN_SECONDS: 500 * GAME_SECONDS_PER_TICK,
  /** km divisor for alliance distance → danger scaling */
  ALLIANCE_DISTANCE_DIVISOR: 5_000_000,
  /** Minimum position danger (near Alliance locations) */
  DANGER_MIN: 0.1,
  /** Maximum position danger (deep space) */
  DANGER_MAX: 5.0,
  /** km radius of danger around lawless locations */
  LAWLESS_RADIUS: 1_000_000,
  /** Max danger multiplier per lawless zone */
  LAWLESS_MULTIPLIER: 2.0,
  /** kW divisor for heat → signature scaling */
  HEAT_DIVISOR: 200,
  /** Heat signature multiplier during coast phase */
  COAST_HEAT_FACTOR: 0.1,
  /** Piloting skill → detection reduction scaling */
  PILOTING_FACTOR: 0.008,
};

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Interpolate ship's 1D position in km-from-Earth along its route.
 * Returns the approximate distance from Earth at the ship's current position.
 */
export function getShipPositionKm(ship: Ship, world: World): number {
  if (ship.location.status !== 'in_flight' || !ship.activeFlightPlan) {
    return 0;
  }

  const flight = ship.activeFlightPlan;
  const origin = world.locations.find((l) => l.id === flight.origin);
  const dest = world.locations.find((l) => l.id === flight.destination);

  if (!origin || !dest) return 0;

  const progress =
    flight.totalDistance > 0
      ? flight.distanceCovered / flight.totalDistance
      : 0;

  return (
    origin.distanceFromEarth +
    (dest.distanceFromEarth - origin.distanceFromEarth) * progress
  );
}

/**
 * Calculate position danger multiplier from world geography.
 *
 * Danger increases with distance from Terran Alliance locations
 * and proximity to Free Traders Guild (lawless) zones.
 *
 * All location data read dynamically from world — no hardcoded positions.
 */
export function calculatePositionDanger(
  currentKm: number,
  world: World
): number {
  // Step A: Distance to nearest Terran Alliance location
  const allianceLocations = world.locations.filter(
    (l) => l.factionId === 'terran_alliance'
  );

  let allianceDistance = Infinity;
  for (const loc of allianceLocations) {
    const dist = Math.abs(currentKm - loc.distanceFromEarth);
    if (dist < allianceDistance) {
      allianceDistance = dist;
    }
  }

  const dangerFromAlliance = clamp(
    allianceDistance / ENCOUNTER_CONSTANTS.ALLIANCE_DISTANCE_DIVISOR,
    ENCOUNTER_CONSTANTS.DANGER_MIN,
    ENCOUNTER_CONSTANTS.DANGER_MAX
  );

  // Step B: Proximity to Free Traders Guild (lawless) locations
  const lawlessLocations = world.locations.filter(
    (l) => l.factionId === 'free_traders_guild'
  );

  let lawlessBonus = 1;
  for (const loc of lawlessLocations) {
    const proximity = Math.max(
      0,
      1 -
        Math.abs(currentKm - loc.distanceFromEarth) /
          ENCOUNTER_CONSTANTS.LAWLESS_RADIUS
    );
    lawlessBonus += proximity * ENCOUNTER_CONSTANTS.LAWLESS_MULTIPLIER;
  }

  return dangerFromAlliance * lawlessBonus;
}

/**
 * Calculate heat signature multiplier from engine waste heat and flight phase.
 *
 * Torch ships emit massive heat during burns, making them visible.
 * During coast phase, heat drops to near-baseline.
 */
export function calculateHeatSignature(
  engineDef: EngineDefinition,
  flightPhase: FlightPhase
): number {
  const wasteHeat = engineDef.wasteHeatOutput;
  const phaseMultiplier =
    flightPhase === 'coasting' ? ENCOUNTER_CONSTANTS.COAST_HEAT_FACTOR : 1.0;
  return 1 + (wasteHeat * phaseMultiplier) / ENCOUNTER_CONSTANTS.HEAT_DIVISOR;
}

/**
 * Calculate crew skill factor from best piloting skill on the bridge.
 *
 * Skilled pilots reduce encounter probability by plotting evasive routes.
 */
export function calculateCrewSkillFactor(ship: Ship): number {
  // Scanner and helm crew contribute piloting skill to route evasion
  const scannerCrew = getCrewForJobType(ship, 'scanner');
  const helmCrew = getCrewForJobType(ship, 'helm');
  const relevantCrew = [...scannerCrew, ...helmCrew];

  if (relevantCrew.length === 0) {
    return 1.0; // No pilot = no reduction
  }

  let bestPiloting = 0;
  for (const crew of relevantCrew) {
    if (crew.skills.piloting > bestPiloting) {
      bestPiloting = crew.skills.piloting;
    }
  }

  return 1 / (1 + bestPiloting * ENCOUNTER_CONSTANTS.PILOTING_FACTOR);
}

/**
 * Check if a ship is still in encounter cooldown.
 */
export function isOnCooldown(ship: Ship, gameTime: number): boolean {
  if (ship.lastEncounterTime == null) return false;
  return (
    gameTime - ship.lastEncounterTime < ENCOUNTER_CONSTANTS.COOLDOWN_SECONDS
  );
}

/**
 * Calculate per-tick encounter probability for an in-flight ship.
 * Returns 0 if ship is not in flight, on cooldown, or has no flight state.
 */
export function calculateEncounterChance(
  ship: Ship,
  gameData: GameData
): number {
  if (ship.location.status !== 'in_flight' || !ship.activeFlightPlan) {
    return 0;
  }

  if (isOnCooldown(ship, gameData.gameTime)) {
    return 0;
  }

  const flight = ship.activeFlightPlan;
  const currentKm = getShipPositionKm(ship, gameData.world);
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  const positionDanger = calculatePositionDanger(currentKm, gameData.world);
  const heatSignature = calculateHeatSignature(engineDef, flight.phase);
  const crewSkillFactor = calculateCrewSkillFactor(ship);

  return (
    ENCOUNTER_CONSTANTS.BASE_RATE *
    positionDanger *
    heatSignature *
    crewSkillFactor
  );
}

/**
 * Estimate cumulative route risk for a trip between two locations.
 * Samples multiple points along the route and computes P(at least one encounter).
 *
 * Used by UI for threat level badges on quest cards and navigation view.
 */
export function estimateRouteRisk(
  origin: WorldLocation,
  destination: WorldLocation,
  ship: Ship,
  world: World
): number {
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  // Estimate flight ticks from the quest's estimated time
  // Use a simple distance-based approximation from flight physics
  const distanceKm = Math.abs(
    origin.distanceFromEarth - destination.distanceFromEarth
  );
  const distanceMeters = distanceKm * 1000;

  // Rough flight time estimation using ship's acceleration
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 0;

  const acceleration = engineDef.thrust / shipClass.mass;
  // Mini-brachistochrone time estimation
  const flightTimeSeconds = 2 * Math.sqrt(distanceMeters / acceleration);
  const flightTicks = Math.max(
    1,
    Math.ceil(flightTimeSeconds / GAME_SECONDS_PER_TICK)
  );

  // Sample 20 points along the route
  const SAMPLES = 20;
  let totalRate = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const progress = (i + 0.5) / SAMPLES;
    const sampleKm =
      origin.distanceFromEarth +
      (destination.distanceFromEarth - origin.distanceFromEarth) * progress;

    const positionDanger = calculatePositionDanger(sampleKm, world);

    // Average heat signature: assume roughly 60% burn, 40% coast for longer trips
    const burnFraction = flightTicks > 10 ? 0.6 : 1.0;
    const avgHeat =
      burnFraction * calculateHeatSignature(engineDef, 'accelerating') +
      (1 - burnFraction) * calculateHeatSignature(engineDef, 'coasting');

    const crewSkill = calculateCrewSkillFactor(ship);

    totalRate +=
      ENCOUNTER_CONSTANTS.BASE_RATE * positionDanger * avgHeat * crewSkill;
  }

  const avgRate = totalRate / SAMPLES;

  // P(at least one encounter) = 1 - (1 - avgRate)^ticks
  return 1 - Math.pow(1 - avgRate, flightTicks);
}

/**
 * Classify cumulative risk into threat level.
 */
export function getThreatLevel(cumulativeRisk: number): ThreatLevel {
  if (cumulativeRisk < 0.05) return 'clear';
  if (cumulativeRisk < 0.15) return 'caution';
  if (cumulativeRisk < 0.3) return 'danger';
  return 'critical';
}

/**
 * Get narrative text for a threat level.
 */
export function getThreatNarrative(level: ThreatLevel): string {
  switch (level) {
    case 'clear':
      return 'Patrolled space';
    case 'caution':
      return 'Contested territory';
    case 'danger':
      return 'Lawless region';
    case 'critical':
      return 'Pirate hunting grounds';
  }
}
