import type { Quest, Ship, WorldLocation, World } from './models';
import { getCommandCommerceBonus } from './captainBonus';
import { getShipClass } from './shipClasses';
import { getDistanceBetween, canShipAccessLocation } from './worldGen';
import {
  calculateAvailableCargoCapacity,
  calculateShipAvailableCargo,
  calculateDeltaV,
  calculateDryMass,
  calculateFuelMassRequired,
  calculateFuelTankCapacity,
  getSpecificImpulse,
} from './flightPhysics';
import { gameSecondsToTicks, GAME_SECONDS_PER_TICK } from './timeSystem';
import { getEngineDefinition } from './engines';
import { calculateShipSalaryPerTick } from './crewRoles';
import { calculatePositionDanger } from './encounterSystem';
import { getCrewForJobType, isHelmManned } from './jobSlots';
import { getFuelPricePerKg } from './ui/refuelDialog';
import { formatFuelMass } from './ui/fuelFormatting';
import { formatMass } from './formatting';
import { canAcceptRescueQuest } from './rescueSystem';
import { getProvisionsPerCrewPerTick } from './provisionsSystem';

// Fallback fuel price for payment calculations when no location is available
const FUEL_PRICE_PER_KG_FALLBACK = 2.0;

/**
 * Derive a stable 0–1 fraction from a string (e.g. quest ID).
 * Used to produce deterministic "random" values that are stable across
 * re-renders while still varying per quest.
 */
function stableHashFraction(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return ((hash & 0x7fffffff) % 10000) / 10000;
}

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
 *
 * When origin/destination are provided, fuel cost uses the average of both
 * endpoints' actual station prices instead of a flat constant.
 */
function calculatePayment(
  ship: Ship,
  distanceKm: number,
  cargoKg: number = 0,
  origin?: WorldLocation,
  destination?: WorldLocation,
  costFloorFactor?: number
): number {
  // 1. Estimate operating costs for round trip
  const tripTimeSecs = estimateTripTime(ship, distanceKm);
  const roundTripTicks = (tripTimeSecs * 2) / GAME_SECONDS_PER_TICK;

  const crewSalaryPerTick = calculateShipSalaryPerTick(ship);

  // Calculate fuel cost in credits using the canonical fuel calculator
  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  // Use location-based pricing when available, averaging origin and
  // destination prices (ship refuels at both endpoints on multi-leg routes).
  let fuelPricePerKg = FUEL_PRICE_PER_KG_FALLBACK;
  if (origin && destination) {
    const originPrice = getFuelPricePerKg(origin, ship);
    const destPrice = getFuelPricePerKg(destination, ship);
    fuelPricePerKg = (originPrice + destPrice) / 2;
  }

  const crewCost = crewSalaryPerTick * roundTripTicks;
  const fuelCost = fuelKgRequired * 2 * fuelPricePerKg; // Round trip
  const totalCost = crewCost + fuelCost;

  // 2. Cost floor: 130-200% of operating costs
  const costFloor = totalCost * (costFloorFactor ?? 1.3 + Math.random() * 0.7);

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

  // 6. Captain command bonus (continuous linear from captain/acting captain)
  const commerceBonus = getCommandCommerceBonus(ship);

  const payment = basePayment * (1 + crewBonus + commerceBonus);

  // Minimum payment floor — prevents zero-credit quests when a solo
  // captain (salary 0) does short hops (near-zero fuel cost).
  return Math.max(10, Math.round(payment));
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
  const specificImpulse = getSpecificImpulse(engineDef);

  // Use full-tank mass — same basis as calculateTripFuelKg so the two
  // halves of calculatePayment (crew cost from trip time, fuel cost from
  // fuel mass) are computed under identical assumptions.
  const dryMass = calculateDryMass(ship);
  const maxFuelKg = calculateFuelTankCapacity(
    shipClass.cargoCapacity,
    engineDef
  );
  const fullMass = dryMass + maxFuelKg;
  const thrust = engineDef.thrust;
  const acceleration = thrust / fullMass;

  // Match calculateTripFuelKg: cap at min(Tsiolkovsky delta-v, engine maxDeltaV)
  const availableDeltaV = calculateDeltaV(fullMass, dryMass, specificImpulse);
  const maxAllocatedDeltaV = Math.min(
    availableDeltaV * 0.5,
    0.5 * engineDef.maxDeltaV
  );
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
 * Generate a delivery quest template (ship-independent).
 * Cargo fraction and payment are resolved per-ship via resolveQuestForShip().
 */
function generateDeliveryQuest(
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const cargoType = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];
  const cargoFraction = 0.3 + Math.random() * 0.5; // 30-80% of available hold

  return {
    id: generateId(),
    type: 'delivery',
    title: `Deliver ${cargoType}`,
    description: `Deliver ${cargoType} to ${destination.name}`,
    origin: origin.id,
    destination: destination.id,
    cargoRequired: 0,
    totalCargoRequired: 0,
    tripsRequired: 1,
    paymentPerTrip: 0,
    paymentOnCompletion: 0,
    expiresAfterDays: 7,
    estimatedFuelPerTrip: 0,
    estimatedTripTicks: 0,
    cargoFraction,
    cargoTypeName: cargoType,
  };
}

/**
 * Generate a passenger quest template (ship-independent).
 * Payment is resolved per-ship via resolveQuestForShip().
 */
function generatePassengerQuest(
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const passengerName =
    PASSENGER_NAMES[Math.floor(Math.random() * PASSENGER_NAMES.length)];

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
    paymentOnCompletion: 0,
    expiresAfterDays: 3,
    estimatedFuelPerTrip: 0,
    estimatedTripTicks: 0,
    cargoFraction: 0,
  };
}

/**
 * Generate a freight quest template (ship-independent).
 * Cargo fraction and payment are resolved per-ship via resolveQuestForShip().
 */
function generateFreightQuest(
  origin: WorldLocation,
  destination: WorldLocation
): Quest {
  const cargoType = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];
  const cargoFraction = 0.5 + Math.random() * 0.3; // 50-80% of available hold
  const trips = Math.floor(2 + Math.random() * 6); // 2-7 trips

  return {
    id: generateId(),
    type: 'freight',
    title: `Freight contract: ${trips} trips`,
    description: `Haul ${cargoType} from ${origin.name} to ${destination.name}, ${trips} trips total`,
    origin: origin.id,
    destination: destination.id,
    cargoRequired: 0,
    totalCargoRequired: 0,
    tripsRequired: trips,
    paymentPerTrip: 0,
    paymentOnCompletion: 0,
    expiresAfterDays: 14,
    estimatedFuelPerTrip: 0,
    estimatedTripTicks: 0,
    cargoFraction,
    cargoTypeName: cargoType,
  };
}

/**
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
export function calculateTradeRoutePayment(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation,
  world: World,
  cargoKg: number
): number {
  const distanceKm = getDistanceBetween(origin, destination);

  // 1. Operating cost floor (deterministic — fixed at 120% of costs)
  const tripTimeSecs = estimateTripTime(ship, distanceKm);
  const roundTripTicks = (tripTimeSecs * 2) / GAME_SECONDS_PER_TICK;

  const crewSalaryPerTick = calculateShipSalaryPerTick(ship);

  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  // Use actual station prices at both endpoints
  const originPrice = getFuelPricePerKg(origin, ship);
  const destPrice = getFuelPricePerKg(destination, ship);
  const avgFuelPrice = (originPrice + destPrice) / 2;

  const crewCost = crewSalaryPerTick * roundTripTicks;
  const fuelCost = fuelKgRequired * 2 * avgFuelPrice; // Round trip
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

  // 7. Captain command bonus (continuous linear from captain/acting captain)
  const commerceBonus = getCommandCommerceBonus(ship);

  const payment =
    (costFloor + distanceBonus) *
    cargoPremium *
    dangerPremium *
    locationFactor *
    (1 + crewBonus + commerceBonus);

  return Math.max(10, Math.round(payment));
}

/**
 * Calculate trade route cargo amount for a ship at a given origin location.
 * Cargo fills the ship's hold — bigger ships haul more per trip and earn more
 * through the cargo premium in payment calculations. Location economics are
 * reflected in payment scaling (locationFactor), not by restricting cargo volume.
 */
export function calculateTradeRouteCargo(
  ship: Ship,
  _origin: WorldLocation
): number {
  const shipClass = getShipClass(ship.classId);
  return shipClass
    ? Math.floor(calculateAvailableCargoCapacity(shipClass.cargoCapacity) * 0.8)
    : 1000;
}

/**
 * Generate persistent trade route quest templates for a location.
 *
 * Creates one standing trade route to each valid trading partner.
 * Destinations include any partner accessible by ANY ship in the fleet.
 * Cargo/payment are resolved per-ship via resolveQuestForShip().
 *
 * Trade routes only exist between locations with 'trade' service.
 */
export function generatePersistentTradeRoutes(
  ships: Ship[],
  location: WorldLocation,
  world: World
): Quest[] {
  // Only locations with trade service offer trade routes
  if (!location.services.includes('trade')) {
    return [];
  }

  const routes: Quest[] = [];

  // Trade route to every accessible location with trade service.
  // Include destinations reachable by ANY ship in the fleet.
  const tradePartners = world.locations.filter(
    (l) =>
      l.id !== location.id &&
      l.services.includes('trade') &&
      ships.some((s) => canShipAccessLocation(s, l))
  );

  for (const partner of tradePartners) {
    const tradeGood = getTradeGood(location, partner);

    routes.push({
      id: `trade_${location.id}_${partner.id}`,
      type: 'trade_route',
      title: `Trade: ${location.name} ↔ ${partner.name}`,
      description: `Haul ${tradeGood} to ${partner.name}. Permanent trade route.`,
      origin: location.id,
      destination: partner.id,
      cargoRequired: 0,
      totalCargoRequired: 0,
      tripsRequired: -1, // Unlimited
      paymentPerTrip: 0,
      paymentOnCompletion: 0,
      expiresAfterDays: 0, // Never expires
      estimatedFuelPerTrip: 0,
      estimatedTripTicks: 0,
      cargoFraction: 0.8, // Trade routes fill 80% of available hold
      cargoTypeName: tradeGood,
    });
  }

  return routes;
}

/**
 * Generate quest templates for all locations in the world.
 * All non-trade-route quests are regenerated fresh each day.
 *
 * Quests are ship-independent templates — cargo, payment, fuel, and time
 * are resolved per-ship at display/acceptance time via resolveQuestForShip().
 * Destinations include any location reachable by ANY ship in the fleet.
 */
export function generateAllLocationQuests(
  ships: Ship[],
  world: World
): Record<string, Quest[]> {
  const allQuests: Record<string, Quest[]> = {};
  for (const location of world.locations) {
    const tradeRoutes = generatePersistentTradeRoutes(ships, location, world);
    const randomQuests = generateQuestsForLocation(ships, location, world);
    allQuests[location.id] = [...tradeRoutes, ...randomQuests];
  }
  return allQuests;
}

/**
 * Generate quest templates for a location (ship-independent).
 * Destinations include any location reachable by ANY ship in the fleet.
 */
export function generateQuestsForLocation(
  ships: Ship[],
  location: WorldLocation,
  world: World
): Quest[] {
  const quests: Quest[] = [];
  const count = location.size;

  // Include destinations reachable by ANY ship in the fleet.
  // canAcceptQuest validates per-ship reachability at acceptance time.
  const reachableDestinations = world.locations.filter(
    (dest) =>
      dest.id !== location.id &&
      ships.some((s) => isDestinationReachable(s, location, dest))
  );

  if (reachableDestinations.length === 0) {
    return [];
  }

  // Generate diverse quest types
  const questTypes = ['delivery', 'passenger', 'freight'];

  for (let i = 0; i < count; i++) {
    const destination =
      reachableDestinations[
        Math.floor(Math.random() * reachableDestinations.length)
      ];
    const questType = questTypes[i % questTypes.length];

    let quest: Quest;
    switch (questType) {
      case 'delivery':
        quest = generateDeliveryQuest(location, destination);
        break;
      case 'passenger':
        quest = generatePassengerQuest(location, destination);
        break;
      case 'freight':
        quest = generateFreightQuest(location, destination);
        break;
      default:
        quest = generateDeliveryQuest(location, destination);
    }

    quests.push(quest);
  }

  return quests;
}

/**
 * Resolve a quest template into concrete values for a specific ship.
 *
 * Quests are generated as ship-independent templates (cargoFraction instead
 * of absolute kg, no payment/fuel/time). This function computes all
 * ship-dependent values so the quest can be displayed or accepted.
 *
 * For legacy quests without cargoFraction (e.g. frozen ActiveContract
 * snapshots from old saves), returns the quest unchanged.
 */
export function resolveQuestForShip(
  quest: Quest,
  ship: Ship,
  world: World
): Quest {
  // Legacy fallback: quests without cargoFraction have pre-baked values
  if (quest.cargoFraction == null) return quest;

  const shipClass = getShipClass(ship.classId);
  const availableCargo = shipClass
    ? calculateAvailableCargoCapacity(shipClass.cargoCapacity)
    : 1000;
  const maxCargo = Math.floor(availableCargo * 0.8);
  const cargoRequired =
    quest.cargoFraction > 0
      ? Math.round(Math.max(1000, maxCargo * quest.cargoFraction))
      : 0;

  const originLoc = world.locations.find((l) => l.id === quest.origin);
  const destLoc = world.locations.find((l) => l.id === quest.destination);
  if (!originLoc || !destLoc) return quest;

  const distanceKm = getDistanceBetween(originLoc, destLoc);

  // Stable cost floor factor derived from quest ID (deterministic per quest)
  const costFloorFactor = 1.3 + stableHashFraction(quest.id) * 0.7;

  // Rescue quests have fixed cargo (fuel payload), not resolved per-ship
  if (quest.type === 'rescue') {
    const rescueBurnFraction = ship.flightProfileBurnFraction;
    const rescueFuelKg = calculateTripFuelKg(
      ship,
      distanceKm,
      rescueBurnFraction
    );
    const rescueTripTime = estimateTripTime(
      ship,
      distanceKm,
      rescueBurnFraction
    );
    return {
      ...quest,
      origin:
        ship.location.dockedAt || ship.location.orbitingAt || quest.origin,
      cargoRequired: quest.rescueFuelKg || 0,
      estimatedFuelPerTrip: rescueFuelKg * 2,
      estimatedTripTicks: gameSecondsToTicks(rescueTripTime * 2),
    };
  }

  // Compute payment based on quest type
  let paymentOnCompletion = 0;
  let paymentPerTrip = 0;
  switch (quest.type) {
    case 'delivery':
      paymentOnCompletion = Math.round(
        calculatePayment(
          ship,
          distanceKm,
          cargoRequired,
          originLoc,
          destLoc,
          costFloorFactor
        ) * 1.5
      );
      break;
    case 'passenger':
      paymentOnCompletion = Math.round(
        calculatePayment(
          ship,
          distanceKm,
          0,
          originLoc,
          destLoc,
          costFloorFactor
        ) * 2.0
      );
      break;
    case 'freight':
      paymentPerTrip = Math.round(
        calculatePayment(
          ship,
          distanceKm,
          cargoRequired,
          originLoc,
          destLoc,
          costFloorFactor
        ) * 1.25
      );
      break;
    case 'trade_route':
      paymentPerTrip = calculateTradeRoutePayment(
        ship,
        originLoc,
        destLoc,
        world,
        cargoRequired
      );
      break;
  }

  // Compute fuel and time using ship's flight profile
  const burnFraction = ship.flightProfileBurnFraction;
  const fuelKg = calculateTripFuelKg(ship, distanceKm, burnFraction);
  const tripTime = estimateTripTime(ship, distanceKm, burnFraction);

  // Generate description with resolved cargo amount
  let description = quest.description;
  if (quest.cargoTypeName && cargoRequired > 0) {
    switch (quest.type) {
      case 'delivery':
        description = `Deliver ${formatMass(cargoRequired)} of ${quest.cargoTypeName} to ${destLoc.name}`;
        break;
      case 'freight':
        description = `Haul ${formatMass(cargoRequired)} of ${quest.cargoTypeName} from ${originLoc.name} to ${destLoc.name}, ${quest.tripsRequired} trips total`;
        break;
      case 'trade_route':
        description = `Haul ${formatMass(cargoRequired)} of ${quest.cargoTypeName} to ${destLoc.name}. Permanent trade route.`;
        break;
      case 'passenger':
        // Passengers have cargoFraction 0 so cargoRequired is 0;
        // this case is unreachable but required for exhaustiveness.
        break;
    }
  }

  return {
    ...quest,
    cargoRequired,
    paymentOnCompletion,
    paymentPerTrip,
    description,
    estimatedFuelPerTrip: fuelKg * 2,
    estimatedTripTicks: gameSecondsToTicks(tripTime * 2),
  };
}

/**
 * Check if quest can be accepted with current ship.
 *
 * Resolves the quest template for the current ship when world is provided,
 * so cargo and fuel checks use per-ship values. Also checks destination
 * accessibility (piloting skill) since quest generation includes destinations
 * reachable by ANY fleet ship.
 */
export function canAcceptQuest(
  ship: Ship,
  quest: Quest,
  world?: World
): { canAccept: boolean; reason?: string; warnings?: string[] } {
  // Rescue quests have special acceptance validation
  if (quest.type === 'rescue' && world) {
    const rescueResult = canAcceptRescueQuest(ship, quest, world);
    if (!rescueResult.canAccept) {
      return rescueResult;
    }
  }

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

  // Check destination accessibility (piloting skill requirement).
  // Quest generation includes destinations reachable by ANY fleet ship,
  // so this ship might not be able to access all quest destinations.
  if (world) {
    const destLoc = world.locations.find((l) => l.id === quest.destination);
    if (destLoc && !canShipAccessLocation(ship, destLoc)) {
      return {
        canAccept: false,
        reason: `Crew lacks piloting skill to access ${destLoc.name}`,
      };
    }
  }

  // Resolve quest for this ship to get per-ship cargo/fuel values
  const resolved = world ? resolveQuestForShip(quest, ship, world) : quest;

  // Check cargo capacity (available space after fuel allocation and provisions)
  const availableCargo = calculateShipAvailableCargo(ship);
  if (resolved.cargoRequired > availableCargo) {
    return {
      canAccept: false,
      reason: `Insufficient cargo capacity (need ${formatMass(resolved.cargoRequired)}, have ${formatMass(Math.floor(availableCargo))})`,
    };
  }

  // Check fuel for at least one round trip (resolved values are per-ship)
  if (resolved.estimatedFuelPerTrip > ship.fuelKg) {
    return {
      canAccept: false,
      reason: `Insufficient fuel for trip (need ${formatFuelMass(resolved.estimatedFuelPerTrip)}, have ${formatFuelMass(ship.fuelKg)})`,
    };
  }

  // For passenger quests, check crew capacity
  if (quest.type === 'passenger') {
    const quartersRoom = ship.rooms.find((r) => r.type === 'quarters');
    if (!quartersRoom) {
      return {
        canAccept: false,
        reason: 'No passenger quarters available',
      };
    }
  }

  // ── Soft warnings (don't block acceptance) ──────────────────────
  const warnings: string[] = [];

  if (world) {
    const destLoc = world.locations.find((l) => l.id === quest.destination);

    // Warn if destination has no refueling
    if (destLoc && !destLoc.services.includes('refuel')) {
      warnings.push(
        `${destLoc.name} has no refueling service — ensure you have enough fuel for the return trip.`
      );
    }

    // Warn if fuel is tight for round trip (< 20% margin)
    if (resolved.estimatedFuelPerTrip > ship.fuelKg * 0.8) {
      warnings.push(
        `Fuel margin is thin — estimated round-trip fuel is close to current supply.`
      );
    }

    // Warn if provisions won't last the round trip
    if (ship.crew.length > 0 && resolved.estimatedTripTicks > 0) {
      const provisionsNeeded =
        ship.crew.length *
        getProvisionsPerCrewPerTick() *
        resolved.estimatedTripTicks;
      if (provisionsNeeded > ship.provisionsKg) {
        warnings.push(
          `Insufficient provisions for this trip — crew may starve before returning.`
        );
      } else if (provisionsNeeded > ship.provisionsKg * 0.8) {
        warnings.push(
          `Provisions margin is thin — trip will consume most of the ship's food supply.`
        );
      }
    }
  }

  return {
    canAccept: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
