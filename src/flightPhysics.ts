import type { Ship, FlightState, WorldLocation, World, Vec2 } from './models';
import { getEngineDefinition, type EngineDefinition } from './engines';
import { getShipClass, type ShipClass } from './shipClasses';
import { getDistanceBetween } from './utils';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { isHelmManned } from './jobSlots';
import {
  PROVISIONS_KG_PER_CREW_PER_DAY,
  MAX_PROVISION_DAYS,
  getEffectiveConsumptionPerCrewPerDay,
} from './provisionsSystem';
import { getLocationPosition, solveIntercept } from './orbitalMechanics';
import { scanForGravityAssists } from './gravityAssistSystem';
import { getCrewEquipmentDefinition } from './crewEquipment';
import { getOreDefinition } from './oreTypes';

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

/**
 * Calculate the total weight of crew equipment items in the cargo hold,
 * using each item's actual weight from its definition.
 */
export function getCrewEquipmentCargoWeight(ship: Ship): number {
  let weight = 0;
  for (const item of ship.cargo) {
    const def = getCrewEquipmentDefinition(item.definitionId);
    weight += def.weight;
  }
  return weight;
}

/**
 * Calculate the current ore cargo weight on a ship.
 */
export function getOreCargoWeight(ship: Ship): number {
  let weight = 0;
  for (const item of ship.oreCargo) {
    const ore = getOreDefinition(item.oreId);
    weight += ore.weightPerUnit * item.quantity;
  }
  return weight;
}

/**
 * Calculate the total weight of everything in the cargo hold:
 * crew equipment + ore + provisions.
 *
 * This is the single source of truth for cargo hold usage.
 */
export function getCargoUsedKg(ship: Ship): number {
  return (
    getCrewEquipmentCargoWeight(ship) +
    getOreCargoWeight(ship) +
    (ship.provisionsKg || 0)
  );
}

/**
 * Calculate the dry mass of a ship — everything except fuel.
 * Includes hull, crew, and all cargo hold contents (equipment, ore, provisions).
 */
export function calculateDryMass(ship: Ship): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 200000; // fallback for unknown class
  return (
    shipClass.mass + ship.crew.length * CREW_MASS_KG + getCargoUsedKg(ship)
  );
}

/**
 * Calculate fuel tank capacity from the ship class's dedicated fuel tanks.
 *
 * Fuel tanks are sized independently of cargo — each ship class has a
 * fuelCapacity field tuned for its intended operating range (route-targeted).
 */
export function calculateFuelTankCapacity(shipClass: ShipClass): number {
  return shipClass.fuelCapacity;
}

/**
 * Calculate available cargo capacity for a specific ship, after subtracting
 * all current cargo hold contents (provisions, crew equipment, ore).
 * This is what's actually available for quest cargo.
 */
export function calculateShipAvailableCargo(ship: Ship): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 0;
  return Math.max(0, shipClass.cargoCapacity - getCargoUsedKg(ship));
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
 * Compute mission endurance based on consumable supplies, crew size,
 * and recycling equipment.
 *
 * When called with a Ship, uses actual provisions on board and equipment-aware
 * consumption rate. When called with a ShipClass, uses theoretical max
 * provisions at base rate (for UI displays where no specific ship exists).
 *
 * Returns endurance in game seconds.
 */
export function computeMissionEndurance(
  shipClassOrShip: ShipClass | Ship
): number {
  if ('classId' in shipClassOrShip) {
    // Ship path — use actual provisions and equipment-aware rate
    const ship = shipClassOrShip;
    const shipClass = getShipClass(ship.classId);
    if (!shipClass) return 86400; // 1-day fallback
    const consumablesKg =
      ship.provisionsKg ||
      ship.crew.length * PROVISIONS_KG_PER_CREW_PER_DAY * MAX_PROVISION_DAYS;
    const ratePerCrew = getEffectiveConsumptionPerCrewPerDay(ship);
    const crewCount = ship.crew.length || 1;
    const enduranceDays = consumablesKg / (crewCount * ratePerCrew);
    return enduranceDays * 86400;
  }
  // ShipClass path — theoretical max provisions at base rate (no recycling)
  const shipClass = shipClassOrShip;
  const consumablesKg =
    shipClass.maxCrew * PROVISIONS_KG_PER_CREW_PER_DAY * MAX_PROVISION_DAYS;
  const enduranceDays =
    consumablesKg / (shipClass.maxCrew * PROVISIONS_KG_PER_CREW_PER_DAY);
  return enduranceDays * 86400;
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
  const maxFuelKg = shipClass.fuelCapacity;
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
 * Compute burn-coast-burn timing for a given distance, acceleration,
 * and allocated delta-v. Shared by initializeFlight and the intercept solver.
 */
function computeFlightTiming(
  distanceMeters: number,
  initialAcceleration: number,
  allocatedDeltaV: number
): { burnTime: number; coastTime: number; totalTime: number } {
  const v_cruise = allocatedDeltaV / 2;
  const dv_brachistochrone =
    2 * Math.sqrt(distanceMeters * initialAcceleration);

  if (initialAcceleration <= 0 || allocatedDeltaV <= 0) {
    return { burnTime: 0, coastTime: 0, totalTime: GAME_SECONDS_PER_TICK };
  } else if (dv_brachistochrone <= allocatedDeltaV) {
    const totalTime = 2 * Math.sqrt(distanceMeters / initialAcceleration);
    return { burnTime: totalTime / 2, coastTime: 0, totalTime };
  } else {
    const burnTime = v_cruise / initialAcceleration;
    const burnDistance = 0.5 * initialAcceleration * burnTime * burnTime;
    const coastDistance = Math.max(0, distanceMeters - 2 * burnDistance);
    const coastTime = v_cruise > 0 ? coastDistance / v_cruise : 0;
    return { burnTime, coastTime, totalTime: 2 * burnTime + coastTime };
  }
}

/** Options for 2D orbital intercept trajectory solving. */
export interface OrbitalFlightOptions {
  gameTime: number;
  world: World;
  /** Override origin position (for mid-flight redirects). */
  originPos?: Vec2;
}

/**
 * Estimate flight duration in ticks for a given ship and distance,
 * without starting a flight. Uses the same burn-coast-burn physics as
 * initializeFlight() and includes engine warmup time.
 *
 * Used by mining route provisions checks to determine if there's enough
 * food for the return trip.
 */
export function estimateFlightDurationTicks(
  ship: Ship,
  distanceKm: number,
  burnFraction: number = 1.0
): number {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return Infinity;

  const clampedBurnFraction = Math.max(0.1, Math.min(1.0, burnFraction));
  const currentMass = getCurrentShipMass(ship);
  const dryMass = calculateDryMass(ship);
  const thrust = engineDef.thrust;
  const specificImpulse = getSpecificImpulse(engineDef);

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

  const initialAcceleration = thrust / currentMass;
  const distanceMeters = distanceKm * 1000;

  const { totalTime } = computeFlightTiming(
    distanceMeters,
    initialAcceleration,
    allocatedDeltaV
  );

  // Convert flight time to ticks and add engine warmup
  const flightTicks = Math.ceil(totalTime / GAME_SECONDS_PER_TICK);
  const warmupTicks = Math.ceil(100 / engineDef.warmupRate);

  return flightTicks + warmupTicks;
}

/**
 * Initialize a new flight from origin to destination.
 * Uses current ship mass (including fuel) for acceleration calculations.
 *
 * When `orbital` is provided, solves an intercept trajectory
 * to the destination's future orbital position. Otherwise uses the current
 * static distance (backward compatible for tests).
 *
 * @param burnFraction 0.1-1.0: fraction of allocated delta-v budget to use.
 *   1.0 = max speed (use full budget, shortest trip, most fuel).
 *   Lower values coast more, saving fuel at the cost of longer trips.
 * @param orbital 2D orbital intercept options (gameTime, world, originPos)
 */
export function initializeFlight(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation,
  dockOnArrival: boolean = false,
  burnFraction: number = 1.0,
  orbital?: OrbitalFlightOptions
): FlightState {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${ship.classId}`);
  }

  // Clamp burn fraction to valid range
  const clampedBurnFraction = Math.max(0.1, Math.min(1.0, burnFraction));

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

  // Initial acceleration (will change as fuel burns, but use for planning)
  let initialAcceleration = thrust / currentMass;

  // ── 2D intercept trajectory (when orbital data available) ──
  let distanceKm: number;
  let flightOriginPos: Vec2 | undefined;
  let flightInterceptPos: Vec2 | undefined;
  let estimatedArrivalGameTime: number | undefined;

  if (orbital) {
    // Compute origin position at launch time (initial guess)
    flightOriginPos =
      orbital.originPos ??
      getLocationPosition(origin, orbital.gameTime, orbital.world);

    // For non-redirect flights, pass origin location so the solver
    // computes both positions at the same future time. This cancels out
    // common orbital motion for co-orbiting bodies (e.g. LEO station → Earth).
    const originForSolver = orbital.originPos ? undefined : origin;
    const isRedirect = !!orbital.originPos;

    // Engine warmup delay: the ship doesn't start flying until warmup completes.
    // On the tick that warmup finishes, the first advanceFlight also runs,
    // so the effective delay is (warmupTicks - 1) ticks.
    // Redirects skip warmup (engine already online).
    const warmupDelaySeconds = isRedirect
      ? 0
      : Math.max(0, Math.ceil(100 / engineDef.warmupRate) - 1) *
        GAME_SECONDS_PER_TICK;

    // Solve intercept: where will the destination be when we arrive?
    // Include warmup delay so the solver targets the correct future position.
    const interceptResult = solveIntercept(
      flightOriginPos,
      destination,
      (dKm: number) => {
        const dMeters = dKm * 1000;
        const timing = computeFlightTiming(
          dMeters,
          initialAcceleration,
          allocatedDeltaV
        );
        return warmupDelaySeconds + timing.totalTime;
      },
      orbital.gameTime,
      orbital.world,
      10,
      originForSolver
    );

    distanceKm = interceptResult.travelDistanceKm;
    flightInterceptPos = interceptResult.interceptPos;
    // Keep originPos at launch time (not arrival time). The origin is where
    // the ship actually departs from. The intercept solver also returns
    // originPosAtArrival for co-moving reference, but using that places
    // the origin on the wrong side of the parent body after fast orbits.
    estimatedArrivalGameTime = interceptResult.arrivalGameTime;
  } else {
    // Legacy: use static distance
    distanceKm = getDistanceBetween(origin, destination);
  }

  let distanceMeters = distanceKm * 1000;

  const { burnTime, coastTime, totalTime } = computeFlightTiming(
    distanceMeters,
    initialAcceleration,
    allocatedDeltaV
  );
  let finalBurnTime = burnTime;
  let finalCoastTime = coastTime;
  let finalTotalTime = totalTime;

  // Final sanity: ensure all numeric fields are finite. NaN or Infinity
  // would persist through JSON round-trips as null, permanently corrupting
  // the flight plan (null + number = NaN, which cascades through all physics).
  if (
    !Number.isFinite(finalTotalTime) ||
    finalTotalTime <= 0 ||
    !Number.isFinite(finalBurnTime) ||
    !Number.isFinite(finalCoastTime) ||
    !Number.isFinite(initialAcceleration) ||
    !Number.isFinite(distanceMeters)
  ) {
    finalTotalTime = GAME_SECONDS_PER_TICK;
    finalBurnTime = 0;
    finalCoastTime = 0;
    initialAcceleration = 0;
    distanceMeters = 0;
  }

  // Scan for gravity assist opportunities along the planned trajectory
  let gravityAssists: import('./models').GravityAssistOpportunity[] | undefined;
  if (orbital && flightOriginPos && flightInterceptPos && finalTotalTime > 0) {
    const assists = scanForGravityAssists(
      flightOriginPos,
      flightInterceptPos,
      finalTotalTime,
      orbital.gameTime,
      orbital.world,
      origin.id,
      destination.id
    );
    if (assists.length > 0) {
      gravityAssists = assists;
    }
  }

  return {
    origin: origin.id,
    destination: destination.id,
    originKm: origin.distanceFromEarth,
    totalDistance: distanceMeters,
    distanceCovered: 0,
    currentVelocity: 0,
    phase: 'accelerating',
    burnTime: finalBurnTime,
    coastTime: finalCoastTime,
    elapsedTime: 0,
    totalTime: finalTotalTime,
    acceleration: initialAcceleration,
    dockOnArrival,
    burnFraction: clampedBurnFraction,
    originPos: flightOriginPos,
    interceptPos: flightInterceptPos,
    shipPos: flightOriginPos ? { ...flightOriginPos } : undefined,
    estimatedArrivalGameTime,
    departureGameTime: orbital?.gameTime,
    gravityAssists,
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
  burnFraction: number = 1.0,
  gameTime?: number,
  world?: World
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
    burnFraction,
    gameTime !== undefined && world ? { gameTime, world } : undefined
  );

  ship.engine.state = 'warming_up';
  ship.engine.warmupProgress = 0;

  return true;
}

/**
 * Redirect a ship that is already in flight to a new destination.
 * Replaces the current flight plan with a new one starting from the
 * ship's current interpolated position. Engine stays online (no warmup).
 *
 * Returns false (and does nothing) when helm is unmanned.
 */
export function redirectShipFlight(
  ship: Ship,
  currentKm: number,
  destination: WorldLocation,
  dockOnArrival: boolean = false,
  burnFraction: number = 1.0,
  gameTime?: number,
  world?: World
): boolean {
  if (!isHelmManned(ship)) {
    return false;
  }

  // Build a virtual origin at the ship's current position
  const virtualOrigin = {
    distanceFromEarth: currentKm,
    id: ship.activeFlightPlan?.origin ?? '',
  } as WorldLocation;

  // shipPos is always in current-time coordinates (updated every tick by
  // updateFlightPosition in gameTick.ts), so we can use it directly.
  const currentShipPos = ship.activeFlightPlan?.shipPos;

  ship.activeFlightPlan = initializeFlight(
    ship,
    virtualOrigin,
    destination,
    dockOnArrival,
    burnFraction,
    gameTime !== undefined && world
      ? { gameTime, world, originPos: currentShipPos }
      : undefined
  );

  // Override originKm to the exact interpolated position
  ship.activeFlightPlan.originKm = currentKm;

  // Engine is already running — no warmup needed
  if (ship.engine.state !== 'online') {
    ship.engine.state = 'online';
    ship.engine.warmupProgress = 100;
  }

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

  // 2D ship position (shipPos) is updated externally by updateFlightPosition()
  // in gameTick.ts, which always uses current-time body positions. This keeps
  // advanceFlight as pure physics (distance, velocity, phase).

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
