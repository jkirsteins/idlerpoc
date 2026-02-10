import type { Ship, FlightState, WorldLocation } from './models';
import { getEngineDefinition, type EngineDefinition } from './engines';
import { getShipClass, type ShipClass } from './shipClasses';
import { getDistanceBetween } from './utils';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { isHelmManned } from './jobSlots';

/**
 * Flight Physics
 *
 * Burn-coast-burn flight profile with realistic Tsiolkovsky rocket equation.
 * Fuel has mass, ship mass changes as fuel burns, and range emerges from
 * the interaction of these systems.
 */

/**
 * Standard gravity constant for Isp calculations
 */
const G0 = 9.81; // m/s²

/**
 * Shared mass constants used across flight physics, quest generation,
 * and fleet analytics. Centralised here to avoid divergent copies.
 */
export const CREW_MASS_KG = 80; // ~80 kg per crew member
export const CARGO_ITEM_MASS_KG = 10; // ~10 kg per cargo item (will be refined later)

/**
 * Fraction of shared cargo volume allocated to fuel tanks.
 * Fuel and cargo compete for the same internal volume: 70% fuel, 30% cargo.
 */
export const FUEL_CARGO_SPLIT = 0.7;

/**
 * Calculate the dry mass of a ship — everything except fuel.
 * Includes hull, crew, and cargo.
 */
export function calculateDryMass(ship: Ship): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 200000; // fallback for unknown class
  return (
    shipClass.mass +
    ship.crew.length * CREW_MASS_KG +
    ship.cargo.reduce((sum) => sum + CARGO_ITEM_MASS_KG, 0)
  );
}

/**
 * Calculate fuel tank capacity based on ship class cargo capacity
 *
 * Design Decision (from fuel-cargo-tradeoff-design.md):
 * Fuel tanks and cargo holds compete for the same internal volume.
 * We use a 70/30 split: 70% for fuel, 30% for cargo.
 *
 * This creates strategic range pressure and progression gameplay:
 * - Wayfarer (40,000 kg capacity) → 28,000 kg fuel → can reach Gateway but NOT Meridian
 * - Forces refueling stops at intermediate stations
 * - Creates demand for larger ships with more capacity
 *
 * Note: The 3:1 reaction mass ratio from WORLDRULES.md describes fuel CONSUMPTION
 * during missions, not tank capacity. Tank size is constrained by ship design.
 */
export function calculateFuelTankCapacity(
  cargoCapacity: number,
  _engineDef: EngineDefinition
): number {
  return cargoCapacity * FUEL_CARGO_SPLIT;
}

/**
 * Calculate available cargo capacity after fuel allocation.
 * This is the maximum cargo a ship can carry on a single trip.
 *
 * cargoCapacity is a shared pool: 70% fuel, 30% available for cargo.
 * All cargo validation should use this function instead of raw cargoCapacity.
 */
export function calculateAvailableCargoCapacity(cargoCapacity: number): number {
  return cargoCapacity * (1 - FUEL_CARGO_SPLIT);
}

/**
 * Calculate current ship mass including fuel, cargo, and crew
 */
export function getCurrentShipMass(ship: Ship): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${ship.classId}`);
  }

  return calculateDryMass(ship) + ship.fuelKg;
}

/**
 * Tsiolkovsky rocket equation: Calculate delta-v from mass ratio and Isp
 *
 * Δv = Isp × g₀ × ln(m_wet / m_dry)
 *
 * Where:
 * - Isp = specific impulse (seconds)
 * - g₀ = standard gravity (9.81 m/s²)
 * - m_wet = initial mass (with fuel)
 * - m_dry = final mass (without fuel)
 */
export function calculateDeltaV(
  wetMass: number,
  dryMass: number,
  specificImpulse: number
): number {
  if (wetMass <= dryMass || dryMass <= 0) {
    return 0;
  }

  const massRatio = wetMass / dryMass;
  return specificImpulse * G0 * Math.log(massRatio);
}

/**
 * Calculate specific impulse from engine definition
 * Derived from maxDeltaV assuming full fuel load
 */
export function getSpecificImpulse(engineDef: EngineDefinition): number {
  // Approximate Isp values based on engine type
  // These match WORLDRULES.md specifications

  if (engineDef.type.includes('Chemical')) {
    return 450; // LOX/LH2 bipropellant
  } else if (engineDef.type.includes('Fission')) {
    return 900; // Nuclear thermal rocket (WORLDRULES line 124)
  } else if (engineDef.type.includes('Fusion (D-D)')) {
    return 50000; // D-D fusion
  } else if (engineDef.type.includes('Fusion (D-He3)')) {
    return 100000; // D-He3 fusion (more efficient)
  } else if (engineDef.type.includes('Military')) {
    return 200000; // Advanced military fusion
  }

  // Fallback: derive from maxDeltaV assuming 3:1 mass ratio
  // Δv = Isp × g₀ × ln(4), so Isp = Δv / (g₀ × ln(4))
  return engineDef.maxDeltaV / (G0 * Math.log(4));
}

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
 * Uses Tsiolkovsky rocket equation for realistic fuel consumption
 * Returns range in kilometers
 */
export function computeMaxRange(
  shipClass: ShipClass,
  engineDef: EngineDefinition
): number {
  const dryMass = shipClass.mass;
  const thrust = engineDef.thrust;
  const maxFuelKg = calculateFuelTankCapacity(
    shipClass.cargoCapacity,
    engineDef
  );
  const specificImpulse = getSpecificImpulse(engineDef);

  // Calculate maximum delta-v with full fuel tank
  const wetMass = dryMass + maxFuelKg;
  const maxDeltaV = calculateDeltaV(wetMass, dryMass, specificImpulse);

  // Use 50% of delta-v budget for one-way trip (need to decelerate at destination)
  const allocatedDeltaV = 0.5 * maxDeltaV;

  // Cruise velocity: half delta-v for accel, half for decel
  const v_cruise = allocatedDeltaV / 2;

  // Acceleration at start of journey (full fuel load)
  const initialAcceleration = thrust / wetMass;

  // Approximate burn time using initial acceleration
  // (In reality, acceleration increases as fuel burns, but we use average)
  const burnTime = v_cruise / initialAcceleration;

  const endurance = computeMissionEndurance(shipClass);

  let rangeMeters: number;

  if (endurance <= 2 * burnTime) {
    // Can't complete full burn-coast-burn cycle
    // Mini-brachistochrone constrained by endurance
    rangeMeters = 0.25 * initialAcceleration * endurance * endurance;
  } else {
    // Full burn-coast-burn
    const coastTime = endurance - 2 * burnTime;
    const burnDist = initialAcceleration * burnTime * burnTime;
    const coastDist = v_cruise * coastTime;
    rangeMeters = burnDist + coastDist;
  }

  return rangeMeters / 1000; // Convert to km
}

/**
 * Calculate fuel mass required for a trip using Tsiolkovsky rocket equation
 *
 * Given a required delta-v, calculate how much fuel mass is needed:
 * Δv = Isp × g₀ × ln(m_wet / m_dry)
 * => m_wet / m_dry = exp(Δv / (Isp × g₀))
 * => m_fuel = m_dry × (exp(Δv / (Isp × g₀)) - 1)
 *
 * Returns fuel mass in kilograms
 */
export function calculateFuelMassRequired(
  dryMass: number,
  requiredDeltaV: number,
  specificImpulse: number
): number {
  if (requiredDeltaV <= 0 || specificImpulse <= 0) {
    return 0;
  }

  const massRatio = Math.exp(requiredDeltaV / (specificImpulse * G0));
  const fuelMass = dryMass * (massRatio - 1);

  return fuelMass;
}

/**
 * Calculate one-way fuel for a ship+distance, accounting for burn-coast-burn.
 *
 * Uses the same flight-profile logic as initializeFlight():
 * caps the required delta-v at the ship's per-leg budget so that
 * low-thrust ships that coast aren't overcharged.
 *
 * Shared by questGen (estimation) and contractExec (leg checks).
 *
 * @param burnFraction 0.1-1.0: fraction of delta-v budget to use (1.0 = max speed)
 */
export function calculateOneLegFuelKg(
  ship: Ship,
  distanceKm: number,
  burnFraction: number = 1.0
): number {
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  if (!shipClass) return 0;

  const clampedBurnFraction = Math.max(0.1, Math.min(1.0, burnFraction));
  const distanceMeters = distanceKm * 1000;
  const thrust = engineDef.thrust;
  const specificImpulse = getSpecificImpulse(engineDef);

  const dryMass = calculateDryMass(ship);
  const currentMass = getCurrentShipMass(ship);

  // Acceleration (using current mass for consistency with initializeFlight)
  const acceleration = thrust / currentMass;

  // Brachistochrone delta-v
  const brachistochroneDeltaV = 2 * Math.sqrt(distanceMeters * acceleration);

  // Available delta-v with current fuel, scaled by burn fraction
  const availableDeltaV = calculateDeltaV(
    currentMass,
    dryMass,
    specificImpulse
  );
  const maxAllocatedDeltaV = Math.min(
    availableDeltaV * 0.5,
    0.5 * engineDef.maxDeltaV
  );
  const allocatedDeltaV = maxAllocatedDeltaV * clampedBurnFraction;

  // Use brachistochrone if budget allows, otherwise burn-coast-burn
  const legDeltaV = Math.min(brachistochroneDeltaV, allocatedDeltaV);

  return calculateFuelMassRequired(dryMass, legDeltaV, specificImpulse);
}

/**
 * Initialize a new flight from origin to destination
 * Uses current ship mass (including fuel) for acceleration calculations
 *
 * @param burnFraction 0.1-1.0: fraction of allocated delta-v budget to use.
 *   1.0 = max speed (use full budget, shortest trip, most fuel).
 *   Lower values coast more, saving fuel at the cost of longer trips.
 */
export function initializeFlight(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation,
  dockOnArrival: boolean = false,
  burnFraction: number = 1.0
): FlightState {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${ship.classId}`);
  }

  // Clamp burn fraction to valid range
  const clampedBurnFraction = Math.max(0.1, Math.min(1.0, burnFraction));

  // Calculate distance in meters
  const distanceKm = getDistanceBetween(origin, destination);
  let distanceMeters = distanceKm * 1000;

  // Get current ship mass (including fuel, cargo, crew)
  const currentMass = getCurrentShipMass(ship);
  const thrust = engineDef.thrust;
  const specificImpulse = getSpecificImpulse(engineDef);

  // Calculate available delta-v with current fuel
  const dryMass = calculateDryMass(ship);
  const wetMass = currentMass;
  const availableDeltaV = calculateDeltaV(wetMass, dryMass, specificImpulse);

  // Use 50% of available delta-v for this trip (need margin for deceleration)
  // Then scale by burnFraction: lower fraction = less delta-v used = more coasting
  const maxAllocatedDeltaV = Math.min(
    availableDeltaV * 0.5,
    0.5 * engineDef.maxDeltaV
  );
  const allocatedDeltaV = maxAllocatedDeltaV * clampedBurnFraction;

  // Calculate cruise velocity (half delta-v for accel, half for decel)
  const v_cruise = allocatedDeltaV / 2;

  // Initial acceleration (will change as fuel burns, but use for planning)
  let initialAcceleration = thrust / currentMass;

  // Check if this is a short trip (mini-brachistochrone)
  const dv_brachistochrone =
    2 * Math.sqrt(distanceMeters * initialAcceleration);

  let burnTime: number;
  let coastTime: number;
  let totalTime: number;

  if (initialAcceleration <= 0 || allocatedDeltaV <= 0) {
    // Edge case: zero thrust or zero fuel. Use a minimal 1-tick flight
    // so the ship doesn't get stuck in an infinite flight state.
    burnTime = 0;
    coastTime = 0;
    totalTime = GAME_SECONDS_PER_TICK;
  } else if (dv_brachistochrone <= allocatedDeltaV) {
    // Short trip: never reaches cruise velocity, no coast phase
    totalTime = 2 * Math.sqrt(distanceMeters / initialAcceleration);
    burnTime = totalTime / 2;
    coastTime = 0;
  } else {
    // Long trip: burn-coast-burn
    burnTime = v_cruise / initialAcceleration;
    const burnDistance = 0.5 * initialAcceleration * burnTime * burnTime;
    const coastDistance = Math.max(0, distanceMeters - 2 * burnDistance);
    coastTime = v_cruise > 0 ? coastDistance / v_cruise : 0;
    totalTime = 2 * burnTime + coastTime;
  }

  // Final sanity: ensure all numeric fields are finite. NaN or Infinity
  // would persist through JSON round-trips as null, permanently corrupting
  // the flight plan (null + number = NaN, which cascades through all physics).
  if (
    !Number.isFinite(totalTime) ||
    totalTime <= 0 ||
    !Number.isFinite(burnTime) ||
    !Number.isFinite(coastTime) ||
    !Number.isFinite(initialAcceleration) ||
    !Number.isFinite(distanceMeters)
  ) {
    totalTime = GAME_SECONDS_PER_TICK;
    burnTime = 0;
    coastTime = 0;
    initialAcceleration = 0;
    distanceMeters = 0;
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
    acceleration: initialAcceleration,
    dockOnArrival,
    burnFraction: clampedBurnFraction,
  };
}

/**
 * Central gate for all flight starts. Every code path that puts a ship
 * in flight MUST go through this function.
 *
 * Returns false (and does nothing) when helm is unmanned. The caller
 * is responsible for deciding what to do (pause contract, log, etc.).
 */
export function startShipFlight(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation,
  dockOnArrival: boolean = false,
  burnFraction: number = 1.0
): boolean {
  if (!isHelmManned(ship)) {
    return false;
  }

  ship.location.status = 'in_flight';
  delete ship.location.dockedAt;
  delete ship.location.orbitingAt;

  ship.activeFlightPlan = initializeFlight(
    ship,
    origin,
    destination,
    dockOnArrival,
    burnFraction
  );

  ship.engine.state = 'warming_up';
  ship.engine.warmupProgress = 0;

  return true;
}

/**
 * Calculate fuel consumption rate in kg/s during a burn phase
 *
 * Uses the rocket equation in differential form:
 * dm/dt = -F / (Isp × g₀)
 *
 * Where F is thrust, Isp is specific impulse
 */
export function calculateFuelFlowRate(
  thrust: number,
  specificImpulse: number
): number {
  return thrust / (specificImpulse * G0);
}

/**
 * Calculate how many seconds of a tick were spent in burn phases.
 *
 * Burn phases are [0, burnTime] (acceleration) and
 * [burnTime + coastTime, totalTime] (deceleration).
 * This allows pro-rated fuel consumption instead of full-tick charging.
 */
export function calculateBurnSecondsInTick(
  flight: FlightState,
  dt: number
): number {
  const tEnd = flight.elapsedTime;
  const tStart = tEnd - dt;

  if (flight.coastTime === 0) {
    // Brachistochrone: burning the entire flight
    const effectiveStart = Math.max(tStart, 0);
    const effectiveEnd = Math.min(tEnd, flight.totalTime);
    return Math.max(0, effectiveEnd - effectiveStart);
  }

  let burnSeconds = 0;

  // Acceleration phase: [0, burnTime]
  const accelStart = Math.max(tStart, 0);
  const accelEnd = Math.min(tEnd, flight.burnTime);
  if (accelEnd > accelStart) {
    burnSeconds += accelEnd - accelStart;
  }

  // Deceleration phase: [burnTime + coastTime, totalTime]
  const decelPhaseStart = flight.burnTime + flight.coastTime;
  const decelStart = Math.max(tStart, decelPhaseStart);
  const decelEnd = Math.min(tEnd, flight.totalTime);
  if (decelEnd > decelStart) {
    burnSeconds += decelEnd - decelStart;
  }

  return burnSeconds;
}

/**
 * Advance flight state by one tick (1,800 game seconds)
 * Returns true if flight is complete
 *
 * Note: Acceleration is fixed based on initial mass for this flight.
 * Future enhancement: dynamically recalculate as fuel burns within flight.
 */
export function advanceFlight(flight: FlightState): boolean {
  // Guard against corrupted flight state (e.g. NaN from bad JSON round-trip).
  // Force-complete the flight so the ship doesn't get permanently stuck.
  if (
    !Number.isFinite(flight.totalTime) ||
    !Number.isFinite(flight.acceleration) ||
    !Number.isFinite(flight.elapsedTime) ||
    !Number.isFinite(flight.distanceCovered)
  ) {
    flight.distanceCovered = flight.totalDistance || 0;
    flight.currentVelocity = 0;
    flight.phase = 'decelerating';
    return true;
  }

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
