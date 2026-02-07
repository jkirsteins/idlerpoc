import type { Ship, FlightState, WorldLocation } from './models';
import { getEngineDefinition, type EngineDefinition } from './engines';
import { getShipClass, type ShipClass } from './shipClasses';
import { getDistanceBetween } from './worldGen';
import { GAME_SECONDS_PER_TICK } from './timeSystem';

/**
 * Flight Physics
 *
 * Burn-coast-burn flight profile for low-thrust ships
 */

/**
 * Constants for mission endurance calculations
 */
const CONSUMABLE_FRACTION = 0.3; // 30% of cargo capacity reserved for consumables
const KG_PER_CREW_PER_DAY = 30; // 30 kg per crew member per day (food, water, air reserves)

/**
 * Compute mission endurance based on consumable supplies and crew size
 * Returns endurance in game seconds
 */
export function computeMissionEndurance(shipClass: ShipClass): number {
  const consumablesKg = shipClass.cargoCapacity * CONSUMABLE_FRACTION;
  let ratePerCrew = KG_PER_CREW_PER_DAY;

  // Cook reduces waste by 20%
  if (shipClass.rooms.includes('cantina')) {
    ratePerCrew *= 0.8;
  }

  const enduranceDays = consumablesKg / (shipClass.maxCrew * ratePerCrew);
  return enduranceDays * 86400; // Convert to game seconds
}

/**
 * Compute maximum range derived from engine capability, ship mass, and mission endurance
 * Returns range in kilometers
 */
export function computeMaxRange(
  shipClass: ShipClass,
  engineDef: EngineDefinition
): number {
  const mass = shipClass.mass;
  const thrust = engineDef.thrust;
  const maxDeltaV = engineDef.maxDeltaV;
  const acceleration = thrust / mass;

  // 50% fuel allocation for one-way trip
  const allocatedDeltaV = 0.5 * maxDeltaV;
  const v_cruise = allocatedDeltaV / 2; // Half for accel, half for decel
  const burnTime = v_cruise / acceleration;
  const endurance = computeMissionEndurance(shipClass);

  let rangeMeters: number;

  if (endurance <= 2 * burnTime) {
    // Can't complete full burn-coast-burn cycle
    // Mini-brachistochrone constrained by endurance
    rangeMeters = 0.25 * acceleration * endurance * endurance;
  } else {
    // Full burn-coast-burn
    const coastTime = endurance - 2 * burnTime;
    const burnDist = acceleration * burnTime * burnTime;
    const coastDist = v_cruise * coastTime;
    rangeMeters = burnDist + coastDist;
  }

  return rangeMeters / 1000; // Convert to km
}

/**
 * Calculate fuel cost percentage for a one-way trip
 */
export function calculateFuelCost(
  distanceKm: number,
  maxRangeKm: number
): number {
  if (maxRangeKm === 0) return 0;
  return (distanceKm / maxRangeKm) * 50; // Max range trip costs 50% one-way
}

/**
 * Initialize a new flight from origin to destination
 */
export function initializeFlight(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation,
  dockOnArrival: boolean = false
): FlightState {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${ship.classId}`);
  }

  // Calculate distance in meters
  const distanceKm = getDistanceBetween(origin, destination);
  const distanceMeters = distanceKm * 1000;

  // Get ship parameters
  const maxRangeKm = computeMaxRange(shipClass, engineDef);
  const mass = shipClass.mass;
  const thrust = engineDef.thrust;
  const maxDeltaV = engineDef.maxDeltaV;
  const acceleration = thrust / mass;

  // Calculate fuel allocation for this trip
  const fuelCostPercent = calculateFuelCost(distanceKm, maxRangeKm);
  const allocatedDeltaV = (fuelCostPercent / 100) * maxDeltaV;

  // Calculate cruise velocity (half delta-v for accel, half for decel)
  const v_cruise = allocatedDeltaV / 2;

  // Check if this is a short trip (mini-brachistochrone)
  const dv_brachistochrone = 2 * Math.sqrt(distanceMeters * acceleration);

  let burnTime: number;
  let coastTime: number;
  let totalTime: number;

  if (dv_brachistochrone <= allocatedDeltaV) {
    // Short trip: never reaches cruise velocity, no coast phase
    totalTime = 2 * Math.sqrt(distanceMeters / acceleration);
    burnTime = totalTime / 2;
    coastTime = 0;
  } else {
    // Long trip: burn-coast-burn
    burnTime = v_cruise / acceleration;
    const burnDistance = 0.5 * acceleration * burnTime * burnTime;
    const coastDistance = distanceMeters - 2 * burnDistance;
    coastTime = coastDistance / v_cruise;
    totalTime = 2 * burnTime + coastTime;
  }

  return {
    origin: origin.id,
    destination: destination.id,
    totalDistance: distanceMeters,
    distanceCovered: 0,
    currentVelocity: 0,
    phase: 'accelerating',
    burnTime,
    coastTime,
    elapsedTime: 0,
    totalTime,
    acceleration,
    dockOnArrival,
  };
}

/**
 * Advance flight state by one tick (1,800 game seconds)
 * Returns true if flight is complete
 */
export function advanceFlight(flight: FlightState): boolean {
  const dt = GAME_SECONDS_PER_TICK;
  flight.elapsedTime += dt;

  // Check if we've reached destination
  if (flight.elapsedTime >= flight.totalTime) {
    flight.distanceCovered = flight.totalDistance;
    flight.currentVelocity = 0;
    flight.phase = 'decelerating'; // Final phase
    return true; // Flight complete
  }

  // Determine current phase and update state
  if (flight.coastTime === 0) {
    // Mini-brachistochrone: no coast phase
    const midpoint = flight.totalTime / 2;
    if (flight.elapsedTime < midpoint) {
      // Accelerating
      flight.phase = 'accelerating';
      flight.currentVelocity = flight.acceleration * flight.elapsedTime;
      flight.distanceCovered =
        0.5 * flight.acceleration * flight.elapsedTime * flight.elapsedTime;
    } else {
      // Decelerating
      flight.phase = 'decelerating';
      const timeIntoDecel = flight.elapsedTime - midpoint;
      const maxVelocity = flight.acceleration * midpoint;
      flight.currentVelocity =
        maxVelocity - flight.acceleration * timeIntoDecel;
      const accelDistance = 0.5 * flight.acceleration * midpoint * midpoint;
      const decelDistance =
        maxVelocity * timeIntoDecel -
        0.5 * flight.acceleration * timeIntoDecel * timeIntoDecel;
      flight.distanceCovered = accelDistance + decelDistance;
    }
  } else {
    // Burn-coast-burn
    if (flight.elapsedTime < flight.burnTime) {
      // Accelerating
      flight.phase = 'accelerating';
      flight.currentVelocity = flight.acceleration * flight.elapsedTime;
      flight.distanceCovered =
        0.5 * flight.acceleration * flight.elapsedTime * flight.elapsedTime;
    } else if (flight.elapsedTime < flight.burnTime + flight.coastTime) {
      // Coasting
      flight.phase = 'coasting';
      const maxVelocity = flight.acceleration * flight.burnTime;
      flight.currentVelocity = maxVelocity;
      const timeIntoCoast = flight.elapsedTime - flight.burnTime;
      const accelDistance =
        0.5 * flight.acceleration * flight.burnTime * flight.burnTime;
      flight.distanceCovered = accelDistance + maxVelocity * timeIntoCoast;
    } else {
      // Decelerating
      flight.phase = 'decelerating';
      const timeIntoDecel =
        flight.elapsedTime - flight.burnTime - flight.coastTime;
      const maxVelocity = flight.acceleration * flight.burnTime;
      flight.currentVelocity =
        maxVelocity - flight.acceleration * timeIntoDecel;
      const accelDistance =
        0.5 * flight.acceleration * flight.burnTime * flight.burnTime;
      const coastDistance = maxVelocity * flight.coastTime;
      const decelDistance =
        maxVelocity * timeIntoDecel -
        0.5 * flight.acceleration * timeIntoDecel * timeIntoDecel;
      flight.distanceCovered = accelDistance + coastDistance + decelDistance;
    }
  }

  return false;
}

/**
 * Get G-force during current flight phase
 * Returns 0 for coasting, acceleration/9.81 for burns
 */
export function getGForce(flight: FlightState): number {
  if (flight.phase === 'coasting') {
    return 0;
  }
  return flight.acceleration / 9.81;
}

/**
 * Check if engine is burning during current phase
 */
export function isEngineBurning(flight: FlightState): boolean {
  return flight.phase === 'accelerating' || flight.phase === 'decelerating';
}
