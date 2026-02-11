import type { Quest, Ship, WorldLocation, World } from './models';
import { getShipCommander } from './models';
import { getShipClass } from './shipClasses';
import { getDistanceBetween, canShipAccessLocation } from './worldGen';
import {
  calculateAvailableCargoCapacity,
  calculateDeltaV,
  calculateDryMass,
  calculateFuelMassRequired,
  calculateFuelTankCapacity,
  getCurrentShipMass,
  getSpecificImpulse,
} from './flightPhysics';
import { gameSecondsToTicks, GAME_SECONDS_PER_TICK } from './timeSystem';
import { getEngineDefinition } from './engines';
import { calculateShipSalaryPerTick } from './crewRoles';
import { calculatePositionDanger } from './encounterSystem';
import { getCrewForJobType, isHelmManned } from './jobSlots';
import { getCommercePaymentBonus } from './skillRanks';

// Fuel pricing constant for payment calculations (credits per kg)
// Matches base rate from refuelDialog.ts getFuelPricePerKg()
// Actual station prices range from 1.6 (Earth/LEO) to 5.0 (Outer System)
const FUEL_PRICE_PER_KG = 2.0;

/**
 * Helper: Calculate fuel mass required for a one-way trip in kg
 *
 * Uses the same flight profile logic as initializeFlight():
 * - If the ship has enough delta-v for brachistochrone (flip-and-burn), use that
 * - Otherwise use burn-coast-burn with the ship's allocated delta-v budget
 *
 * This prevents overestimating fuel for low-thrust ships that would coast
 * rather than burn continuously.
 *
 * @param burnFraction 0.1-1.0: fraction of delta-v budget to use (1.0 = max speed)
 */
export function calculateTripFuelKg(
  ship: Ship,
  distanceKm: number,
  burnFraction: number = 1.0
): number {
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  const clampedBurnFraction = Math.max(0.1, Math.min(1.0, burnFraction));
  const distanceMeters = distanceKm * 1000;
  const thrust = engineDef.thrust;
  const specificImpulse = getSpecificImpulse(engineDef);

  const dryMass = calculateDryMass(ship);

  // Wet mass at full fuel tank
  const maxFuelKg = shipClass
    ? calculateFuelTankCapacity(shipClass.cargoCapacity, engineDef)
    : 0;
  const fullMass = dryMass + maxFuelKg;

  // Acceleration at full fuel (worst case, heaviest)
  const acceleration = thrust / fullMass;

  // Brachistochrone delta-v: minimum-time trajectory (accel to midpoint, decel to destination)
  const brachistochroneDeltaV = 2 * Math.sqrt(distanceMeters * acceleration);

  // Available delta-v with full tank (matching initializeFlight logic)
  const availableDeltaV = calculateDeltaV(fullMass, dryMass, specificImpulse);

  // Allocate 50% for one leg (reserve 50% for return trip), scaled by burn fraction
  const maxAllocatedDeltaV = Math.min(
    availableDeltaV * 0.5,
    0.5 * engineDef.maxDeltaV
  );
  const allocatedDeltaV = maxAllocatedDeltaV * clampedBurnFraction;

  // Use brachistochrone if we have budget, otherwise burn-coast-burn
  const legDeltaV = Math.min(brachistochroneDeltaV, allocatedDeltaV);

  return calculateFuelMassRequired(dryMass, legDeltaV, specificImpulse);
}

/**
 * Quest Generation
 *
 * Generate quests based on location size and ship capabilities
 */

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

const CARGO_TYPES = [
  'medical supplies',
  'machinery',
  'food rations',
  'electronics',
  'industrial parts',
  'construction materials',
  'scientific equipment',
  'luxury goods',
];

const PASSENGER_NAMES = [
  'Dr. Sarah Chen',
  'Marcus Webb',
  'Commander Liu',
  'Ambassador Reeves',
  'Engineer Patel',
  'Professor Kim',
  'Captain Rodriguez',
  'Diplomat Morgan',
];

/**
 * Calculate payment using cost-based floor system.
 *
 * Payment = max(costFloor, distancePayment) * cargoPremium
 *
 * The cost floor guarantees 130-200% of actual operating costs (crew salaries + fuel),
 * ensuring every quest is profitable. The distance bonus rewards long-haul routes.
 * All values emerge from ship physics, crew composition, and fuel economy.
 */
function calculatePayment(
  ship: Ship,
  distanceKm: number,
  cargoKg: number = 0
): number {
  // 1. Estimate operating costs for round trip
  const tripTimeSecs = estimateTripTime(ship, distanceKm);
  const roundTripTicks = (tripTimeSecs * 2) / GAME_SECONDS_PER_TICK;

  const crewSalaryPerTick = calculateShipSalaryPerTick(ship);

  // Calculate fuel cost in credits using the canonical fuel calculator
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  const crewCost = crewSalaryPerTick * roundTripTicks;
  const fuelCost = fuelKgRequired * 2 * FUEL_PRICE_PER_KG; // Round trip
  const totalCost = crewCost + fuelCost;

  // 2. Cost floor: 130-200% of operating costs
  const costFloor = totalCost * (1.3 + Math.random() * 0.7);

  // 3. Cargo premium
  let cargoPremium = 1;
  if (cargoKg > 0) {
    cargoPremium = 1 + (cargoKg / 10000) * 0.5;
  }

  // 4. Distance bonus for long hauls (rewards seeking distant routes)
  let distanceBonus = 0;
  if (distanceKm > 500000) {
    distanceBonus = totalCost * (distanceKm / 1000000) * 0.5;
  }

  const basePayment = (costFloor + distanceBonus) * cargoPremium;

  // 5. Skill-based crew bonus (reputation from skilled crew)
  const crewBonus = calculateCrewSkillBonus(ship);

  // 6. Commerce bonus from captain's trading experience
  const commerceBonus = getShipCommerceBonus(ship);

  const payment = basePayment * (1 + crewBonus + commerceBonus);

  return Math.round(payment);
}

/**
 * Calculate payment bonus from skilled crew members in appropriate roles.
 *
 * - Scanner/helm crew: piloting bonus (evasion reputation)
 * - Drive ops crew: piloting bonus (efficiency)
 * - Mining crew with ore in cargo: mining bonus
 */
function calculateCrewSkillBonus(ship: Ship): number {
  let bonus = 0;

  // Scanner crew: piloting bonus
  for (const crew of getCrewForJobType(ship, 'scanner')) {
    const pointsAbove50 = Math.max(0, crew.skills.piloting - 50);
    bonus += pointsAbove50 * 0.002;
  }

  // Drive ops crew: piloting bonus
  for (const crew of getCrewForJobType(ship, 'drive_ops')) {
    const pointsAbove50 = Math.max(0, crew.skills.piloting - 50);
    bonus += pointsAbove50 * 0.001;
  }

  // Helm crew: piloting bonus
  for (const crew of getCrewForJobType(ship, 'helm')) {
    const pointsAbove50 = Math.max(0, crew.skills.piloting - 50);
    bonus += pointsAbove50 * 0.002;
  }

  return bonus;
}

/**
 * Get commerce payment bonus from the ship's captain (or highest-commerce crew).
 * Commerce is trained by completing trade routes and provides better pay.
 */
function getShipCommerceBonus(ship: Ship): number {
  const commander = getShipCommander(ship);
  const commerceSkill = commander?.skills.commerce ?? 0;
  return getCommercePaymentBonus(commerceSkill);
}

/**
 * Estimate trip time in game seconds using simplified burn-coast-burn physics.
 *
 * Uses the same mass basis and edge-case guards as initializeFlight() to
 * ensure quest-card estimates match actual flight duration.
 *
 * @param burnFraction 0.1-1.0: fraction of delta-v budget to use (1.0 = max speed)
 */
export function estimateTripTime(
  ship: Ship,
  distanceKm: number,
  burnFraction: number = 1.0
): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 0;

  const clampedBurnFraction = Math.max(0.1, Math.min(1.0, burnFraction));
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const distanceMeters = distanceKm * 1000;
  // Use current ship mass (including fuel, cargo, crew) — same as initializeFlight
  const currentMass = getCurrentShipMass(ship);
  const thrust = engineDef.thrust;
  const acceleration = thrust / currentMass;

  // Use fixed cruise velocity (same as computeMaxRange and initializeFlight)
  // 50% fuel budget for one-way trip, scaled by burn fraction
  const maxAllocatedDeltaV = 0.5 * engineDef.maxDeltaV;
  const allocatedDeltaV = maxAllocatedDeltaV * clampedBurnFraction;

  // Edge case: zero thrust or zero fuel
  if (acceleration <= 0 || allocatedDeltaV <= 0) {
    return GAME_SECONDS_PER_TICK;
  }

  // Check if mini-brachistochrone (short trip)
  const dv_brachistochrone = 2 * Math.sqrt(distanceMeters * acceleration);

  let totalTime: number;
  if (dv_brachistochrone <= allocatedDeltaV) {
    // Short trip: constant acceleration/deceleration
    totalTime = 2 * Math.sqrt(distanceMeters / acceleration);
  } else {
    // Long trip: burn-coast-burn
    const v_cruise = allocatedDeltaV / 2;
    const burnTime = v_cruise / acceleration;
    const burnDistance = 0.5 * acceleration * burnTime * burnTime;
    const coastDistance = Math.max(0, distanceMeters - 2 * burnDistance);
    const coastTime = v_cruise > 0 ? coastDistance / v_cruise : 0;
    totalTime = 2 * burnTime + coastTime;
  }

  // Final sanity check — match initializeFlight's guard
  if (!Number.isFinite(totalTime) || totalTime <= 0) {
    return GAME_SECONDS_PER_TICK;
  }

  return totalTime;
}

/**
 * Check if destination is reachable from origin with current ship.
 * Checks both fuel range AND crew piloting skill vs destination requirement.
 */
function isDestinationReachable(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation
): boolean {
  // Crew must meet destination's piloting requirement
  if (!canShipAccessLocation(ship, destination)) {
    return false;
  }

  const distanceKm = getDistanceBetween(origin, destination);

  // Calculate fuel required for round trip
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm) * 2; // Round trip

  // Destination must be reachable with current fuel capacity
  return fuelKgRequired <= ship.maxFuelKg && distanceKm > 0;
}

/**
 * Generate a delivery quest
 */
function generateDeliveryQuest(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const distanceKm = getDistanceBetween(origin, destination);
  const cargoType = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];

  // Cargo between 1,000 - 10,000 kg, capped at 80% of available cargo space
  const shipClass = getShipClass(ship.classId);
  const maxCargo = shipClass
    ? Math.floor(calculateAvailableCargoCapacity(shipClass.cargoCapacity) * 0.8)
    : 1000;
  const cargoKg = Math.round(Math.min(1000 + Math.random() * 9000, maxCargo));

  const payment = Math.round(calculatePayment(ship, distanceKm, cargoKg) * 1.5); // Active premium: finite quest, 7d expiry
  const estimatedTime = estimateTripTime(ship, distanceKm);
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  return {
    id: generateId(),
    type: 'delivery',
    title: `Deliver ${cargoType}`,
    description: `Deliver ${cargoKg.toLocaleString()} kg of ${cargoType} to ${destination.name}`,
    origin: origin.id,
    destination: destination.id,
    cargoRequired: cargoKg,
    totalCargoRequired: 0,
    tripsRequired: 1,
    paymentPerTrip: 0,
    paymentOnCompletion: payment,
    expiresAfterDays: 7,
    estimatedFuelPerTrip: fuelKgRequired * 2, // Round trip in kg
    estimatedTripTicks: gameSecondsToTicks(estimatedTime * 2),
  };
}

/**
 * Generate a passenger quest
 */
function generatePassengerQuest(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const distanceKm = getDistanceBetween(origin, destination);
  const passengerName =
    PASSENGER_NAMES[Math.floor(Math.random() * PASSENGER_NAMES.length)];

  const payment = Math.round(calculatePayment(ship, distanceKm) * 2.0); // Highest active premium: tightest deadline (3d), quarters required
  const estimatedTime = estimateTripTime(ship, distanceKm);
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  return {
    id: generateId(),
    type: 'passenger',
    title: `Transport passenger`,
    description: `Transport ${passengerName} to ${destination.name}`,
    origin: origin.id,
    destination: destination.id,
    cargoRequired: 0,
    totalCargoRequired: 0,
    tripsRequired: 1,
    paymentPerTrip: 0,
    paymentOnCompletion: payment,
    expiresAfterDays: 3,
    estimatedFuelPerTrip: fuelKgRequired * 2, // Round trip in kg
    estimatedTripTicks: gameSecondsToTicks(estimatedTime * 2),
  };
}

/**
 * Generate a freight quest
 */
function generateFreightQuest(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const distanceKm = getDistanceBetween(origin, destination);
  const cargoType = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];

  const shipClassFreight = getShipClass(ship.classId);
  const maxCargoFreight = shipClassFreight
    ? Math.floor(
        calculateAvailableCargoCapacity(shipClassFreight.cargoCapacity) * 0.8
      )
    : 1000;
  const cargoKg = Math.round(
    Math.min(1000 + Math.random() * 9000, maxCargoFreight)
  );
  const trips = Math.floor(2 + Math.random() * 4); // 2-5 trips

  const paymentPerTrip = Math.round(
    calculatePayment(ship, distanceKm, cargoKg) * 1.2
  ); // Semi-active premium: multi-trip with 14d expiry
  const estimatedTime = estimateTripTime(ship, distanceKm);
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  return {
    id: generateId(),
    type: 'freight',
    title: `Freight contract: ${trips} trips`,
    description: `Haul ${cargoKg.toLocaleString()} kg of ${cargoType} from ${origin.name} to ${destination.name}, ${trips} trips total`,
    origin: origin.id,
    destination: destination.id,
    cargoRequired: cargoKg,
    totalCargoRequired: 0,
    tripsRequired: trips,
    paymentPerTrip,
    paymentOnCompletion: 0,
    expiresAfterDays: 14,
    estimatedFuelPerTrip: fuelKgRequired * 2, // Round trip in kg
    estimatedTripTicks: gameSecondsToTicks(estimatedTime * 2),
  };
}

/**
 * Generate a supply quest
 */
function generateSupplyQuest(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const distanceKm = getDistanceBetween(origin, destination);
  const cargoType = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];

  // Total cargo between 20,000 - 50,000 kg
  const totalCargoKg = Math.round(20000 + Math.random() * 30000);
  const shipClass = getShipClass(ship.classId);
  const availableCargoSupply = shipClass
    ? calculateAvailableCargoCapacity(shipClass.cargoCapacity)
    : 1500;
  const cargoPerTrip = Math.min(availableCargoSupply * 0.8, 10000); // Use 80% of available cargo

  const payment = Math.round(
    calculatePayment(ship, distanceKm, totalCargoKg) * 2.5
  ); // High commitment premium: large bulk contract, 30d expiry, lump sum
  const estimatedTime = estimateTripTime(ship, distanceKm);
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  return {
    id: generateId(),
    type: 'supply',
    title: `Supply contract: ${totalCargoKg.toLocaleString()} kg`,
    description: `Deliver total of ${totalCargoKg.toLocaleString()} kg of ${cargoType} to ${destination.name} (multiple trips required)`,
    origin: origin.id,
    destination: destination.id,
    cargoRequired: Math.round(cargoPerTrip),
    totalCargoRequired: totalCargoKg,
    tripsRequired: Math.ceil(totalCargoKg / cargoPerTrip),
    paymentPerTrip: 0,
    paymentOnCompletion: payment,
    expiresAfterDays: 30,
    estimatedFuelPerTrip: fuelKgRequired * 2, // Round trip in kg
    estimatedTripTicks: gameSecondsToTicks(estimatedTime * 2),
  };
}

/**
 * Generate a standing freight quest
 */
function generateStandingFreightQuest(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const distanceKm = getDistanceBetween(origin, destination);
  const cargoType = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];

  const shipClassSF = getShipClass(ship.classId);
  const maxCargoSF = shipClassSF
    ? Math.floor(
        calculateAvailableCargoCapacity(shipClassSF.cargoCapacity) * 0.8
      )
    : 1000;
  const cargoKg = Math.round(Math.min(1000 + Math.random() * 9000, maxCargoSF));
  const paymentPerTrip = Math.round(
    calculatePayment(ship, distanceKm, cargoKg) * 0.6
  ); // Passive discount: infinite trips, automatable — modest but always profitable
  const estimatedTime = estimateTripTime(ship, distanceKm);
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  return {
    id: generateId(),
    type: 'standing_freight',
    title: `Standing freight: ${origin.name} → ${destination.name}`,
    description: `Ongoing freight runs: ${cargoKg.toLocaleString()} kg of ${cargoType} per trip, no trip limit`,
    origin: origin.id,
    destination: destination.id,
    cargoRequired: cargoKg,
    totalCargoRequired: 0,
    tripsRequired: -1, // Indefinite
    paymentPerTrip,
    paymentOnCompletion: 0,
    expiresAfterDays: 0, // Never expires
    estimatedFuelPerTrip: fuelKgRequired * 2, // Round trip in kg
    estimatedTripTicks: gameSecondsToTicks(estimatedTime * 2),
  };
}

/**
 * Trade goods exported by each location type.
 * Derived from location type — what each type naturally produces/exports.
 */
const LOCATION_TRADE_GOODS: Record<string, string[]> = {
  planet: [
    'manufactured goods',
    'food rations',
    'consumer goods',
    'electronics',
  ],
  space_station: [
    'processed materials',
    'technical components',
    'medical supplies',
    'fuel cells',
  ],
  asteroid_belt: ['raw ore', 'rare metals', 'unrefined minerals'],
  planetoid: ['ice', 'water', 'raw materials'],
  moon: ['refined minerals', 'helium-3', 'regolith compounds'],
  orbital: ['salvage', 'repair parts', 'recycled materials'],
};

/**
 * Pick a deterministic trade good based on origin type and destination ID.
 * The good exported depends on what the origin produces and a stable hash of the pair.
 */
function getTradeGood(
  origin: WorldLocation,
  destination: WorldLocation
): string {
  const goods = LOCATION_TRADE_GOODS[origin.type] || ['general cargo'];
  const hash = destination.id
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return goods[hash % goods.length];
}

/**
 * Calculate average route danger between two locations.
 * Samples position danger along the route.
 * Returns a value typically between 0.1 (safe) and 5.0+ (very dangerous).
 */
function calculateRouteDanger(
  origin: WorldLocation,
  destination: WorldLocation,
  world: World
): number {
  const SAMPLES = 10;
  let totalDanger = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const progress = (i + 0.5) / SAMPLES;
    const sampleKm =
      origin.distanceFromEarth +
      (destination.distanceFromEarth - origin.distanceFromEarth) * progress;
    totalDanger += calculatePositionDanger(sampleKm, world);
  }

  return totalDanger / SAMPLES;
}

/**
 * Calculate payment for a persistent trade route.
 *
 * Unlike random quests, trade route payment is deterministic (no randomness).
 * Payment emerges from operating costs and scales with:
 * - Distance (longer routes pay more via distance bonus)
 * - Route danger (riskier routes pay a premium)
 * - Location economic power (bigger hubs offer better rates via size)
 * - Crew skill bonuses (same as regular quests)
 */
function calculateTradeRoutePayment(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation,
  world: World,
  cargoKg: number
): number {
  const distanceKm = getDistanceBetween(origin, destination);

  // 1. Operating cost floor (deterministic — fixed at 150% of costs)
  const tripTimeSecs = estimateTripTime(ship, distanceKm);
  const roundTripTicks = (tripTimeSecs * 2) / GAME_SECONDS_PER_TICK;

  const crewSalaryPerTick = calculateShipSalaryPerTick(ship);

  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  const crewCost = crewSalaryPerTick * roundTripTicks;
  const fuelCost = fuelKgRequired * 2 * FUEL_PRICE_PER_KG; // Round trip in kg
  const totalCost = crewCost + fuelCost;

  // Fixed at 120% of operating costs (no randomness unlike regular quests)
  // Trade routes are the baseline passive income — always profitable but modest
  const costFloor = totalCost * 1.2;

  // 2. Distance bonus for long hauls
  let distanceBonus = 0;
  if (distanceKm > 500000) {
    distanceBonus = totalCost * (distanceKm / 1000000) * 0.5;
  }

  // 3. Cargo premium
  let cargoPremium = 1;
  if (cargoKg > 0) {
    cargoPremium = 1 + (cargoKg / 10000) * 0.5;
  }

  // 4. Danger premium — riskier routes pay more to compensate
  const avgDanger = calculateRouteDanger(origin, destination, world);
  const dangerPremium = 1 + (Math.min(avgDanger, 3) / 3) * 0.5; // 1.0x safe → 1.5x critical

  // 5. Location economic power (hub size → better rates)
  const locationFactor = 0.9 + origin.size / 10; // 0.9x (size 0) → 1.4x (size 5)

  // 6. Crew skill bonus (same system as regular quests)
  const crewBonus = calculateCrewSkillBonus(ship);

  // 7. Commerce bonus from captain's trading experience
  const commerceBonus = getShipCommerceBonus(ship);

  const payment =
    (costFloor + distanceBonus) *
    cargoPremium *
    dangerPremium *
    locationFactor *
    (1 + crewBonus + commerceBonus);

  return Math.round(payment);
}

/**
 * Generate persistent trade route quests for a location.
 *
 * Creates one standing trade route to each valid trading partner.
 * These are always available and represent the location's permanent
 * economic activity and trade connections.
 *
 * Trade routes only exist between locations with 'trade' service.
 * Cargo amount scales with origin location's economic power (size).
 */
export function generatePersistentTradeRoutes(
  ship: Ship,
  location: WorldLocation,
  world: World
): Quest[] {
  // Only locations with trade service offer trade routes
  if (!location.services.includes('trade')) {
    return [];
  }

  const routes: Quest[] = [];

  // Trade route to every other accessible location with trade service
  const tradePartners = world.locations.filter(
    (l) =>
      l.id !== location.id &&
      l.services.includes('trade') &&
      canShipAccessLocation(ship, l)
  );

  for (const partner of tradePartners) {
    const distanceKm = getDistanceBetween(location, partner);
    const tradeGood = getTradeGood(location, partner);

    // Cargo scales with origin's economic power, capped by ship's available cargo capacity
    const shipClassTR = getShipClass(ship.classId);
    const maxCargoTR = shipClassTR
      ? Math.floor(
          calculateAvailableCargoCapacity(shipClassTR.cargoCapacity) * 0.8
        )
      : 1000;
    const cargoKg = Math.min(1000 + location.size * 500, maxCargoTR);

    const paymentPerTrip = calculateTradeRoutePayment(
      ship,
      location,
      partner,
      world,
      cargoKg
    );

    const estimatedTime = estimateTripTime(ship, distanceKm);
    const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

    routes.push({
      id: `trade_${location.id}_${partner.id}`,
      type: 'trade_route',
      title: `Trade: ${location.name} → ${partner.name}`,
      description: `Haul ${cargoKg.toLocaleString()} kg of ${tradeGood} to ${partner.name}. Permanent trade route.`,
      origin: location.id,
      destination: partner.id,
      cargoRequired: cargoKg,
      totalCargoRequired: 0,
      tripsRequired: -1, // Unlimited
      paymentPerTrip,
      paymentOnCompletion: 0,
      expiresAfterDays: 0, // Never expires
      estimatedFuelPerTrip: fuelKgRequired * 2, // Round trip in kg
      estimatedTripTicks: gameSecondsToTicks(estimatedTime * 2),
    });
  }

  return routes;
}

/**
 * Generate quests for all locations in the world.
 * Each quest is stamped with generatedOnDay for expiry tracking.
 */
export function generateAllLocationQuests(
  ship: Ship,
  world: World,
  currentDay: number = 0
): Record<string, Quest[]> {
  const allQuests: Record<string, Quest[]> = {};
  for (const location of world.locations) {
    const tradeRoutes = generatePersistentTradeRoutes(ship, location, world);
    const randomQuests = generateQuestsForLocation(
      ship,
      location,
      world,
      location.size,
      currentDay
    );
    allQuests[location.id] = [...tradeRoutes, ...randomQuests];
  }
  return allQuests;
}

/**
 * Refresh quests across all locations: remove expired quests, keep valid ones,
 * generate new quests to fill empty slots. Trade routes are always preserved.
 */
export function refreshExpiredQuests(
  ship: Ship,
  world: World,
  existingQuests: Record<string, Quest[]>,
  currentDay: number
): Record<string, Quest[]> {
  const refreshed: Record<string, Quest[]> = {};

  for (const location of world.locations) {
    const existing = existingQuests[location.id] || [];

    // Trade routes are always preserved (regenerated fresh to pick up new partners)
    const tradeRoutes = generatePersistentTradeRoutes(ship, location, world);

    // Keep non-trade quests that haven't expired
    const survivingQuests = existing.filter((q) => {
      if (q.type === 'trade_route') return false; // replaced by fresh trade routes
      if (q.expiresAfterDays === 0) return true; // never expires (standing freight)
      const age = currentDay - (q.generatedOnDay ?? 0);
      return age < q.expiresAfterDays;
    });

    // Generate new quests to fill back to location.size
    const slotsToFill = Math.max(0, location.size - survivingQuests.length);
    const newQuests = generateQuestsForLocation(
      ship,
      location,
      world,
      slotsToFill,
      currentDay
    );

    refreshed[location.id] = [...tradeRoutes, ...survivingQuests, ...newQuests];
  }

  return refreshed;
}

/**
 * Generate quests for a location
 */
export function generateQuestsForLocation(
  ship: Ship,
  location: WorldLocation,
  world: World,
  count: number = location.size,
  currentDay: number = 0
): Quest[] {
  const quests: Quest[] = [];

  if (count <= 0) {
    return [];
  }

  // Get all reachable destinations from this location
  const reachableDestinations = world.locations.filter(
    (dest) =>
      dest.id !== location.id && isDestinationReachable(ship, location, dest)
  );

  if (reachableDestinations.length === 0) {
    return [];
  }

  // Generate diverse quest types
  const questTypes = [
    'delivery',
    'passenger',
    'freight',
    'supply',
    'standing_freight',
  ];

  for (let i = 0; i < count; i++) {
    const destination =
      reachableDestinations[
        Math.floor(Math.random() * reachableDestinations.length)
      ];
    const questType = questTypes[i % questTypes.length];

    let quest: Quest;
    switch (questType) {
      case 'delivery':
        quest = generateDeliveryQuest(ship, location, destination);
        break;
      case 'passenger':
        quest = generatePassengerQuest(ship, location, destination);
        break;
      case 'freight':
        quest = generateFreightQuest(ship, location, destination);
        break;
      case 'supply':
        quest = generateSupplyQuest(ship, location, destination);
        break;
      case 'standing_freight':
        quest = generateStandingFreightQuest(ship, location, destination);
        break;
      default:
        quest = generateDeliveryQuest(ship, location, destination);
    }

    quest.generatedOnDay = currentDay;
    quests.push(quest);
  }

  return quests;
}

/**
 * Check if quest can be accepted with current ship
 */
export function canAcceptQuest(
  ship: Ship,
  quest: Quest
): { canAccept: boolean; reason?: string } {
  // Helm must be manned to depart on a contract
  if (!isHelmManned(ship)) {
    return {
      canAccept: false,
      reason:
        'Helm is unmanned — assign crew to the helm before accepting contracts',
    };
  }

  const shipClass = getShipClass(ship.classId);
  if (!shipClass) {
    return { canAccept: false, reason: 'Unknown ship class' };
  }

  // Check cargo capacity (available space after fuel allocation)
  const availableCargo = calculateAvailableCargoCapacity(
    shipClass.cargoCapacity
  );
  if (quest.cargoRequired > availableCargo) {
    return {
      canAccept: false,
      reason: `Insufficient cargo capacity (need ${quest.cargoRequired.toLocaleString()} kg, have ${Math.floor(availableCargo).toLocaleString()} kg)`,
    };
  }

  // Check fuel for at least one round trip
  if (quest.estimatedFuelPerTrip > ship.fuelKg) {
    return {
      canAccept: false,
      reason: `Insufficient fuel for trip (need ${Math.round(quest.estimatedFuelPerTrip).toLocaleString()} kg, have ${Math.round(ship.fuelKg).toLocaleString()} kg)`,
    };
  }

  // For passenger quests, check crew capacity
  if (quest.type === 'passenger') {
    // Check if there's a quarters room with available space
    const quartersRoom = ship.rooms.find((r) => r.type === 'quarters');
    if (!quartersRoom) {
      return {
        canAccept: false,
        reason: 'No passenger quarters available',
      };
    }
  }

  return { canAccept: true };
}
