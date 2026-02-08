import type { Quest, Ship, WorldLocation, World } from './models';
import { getShipClass } from './shipClasses';
import { getDistanceBetween } from './worldGen';
import {
  calculateFuelMassRequired,
  getCurrentShipMass,
  getSpecificImpulse,
} from './flightPhysics';
import { gameSecondsToTicks, GAME_SECONDS_PER_TICK } from './timeSystem';
import { getEngineDefinition } from './engines';
import { getCrewRoleDefinition } from './crewRoles';
import { calculatePositionDanger } from './encounterSystem';

// Fuel pricing constant (credits per kg)
const FUEL_PRICE_PER_KG = 0.5; // Will be configurable per station in future

/**
 * Helper: Calculate fuel mass required for a trip in kg
 */
function calculateTripFuelKg(ship: Ship, distanceKm: number): number {
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  const distanceMeters = distanceKm * 1000;
  const currentMass = getCurrentShipMass(ship);
  const thrust = engineDef.thrust;
  const acceleration = thrust / currentMass;
  const requiredDeltaV = 2 * Math.sqrt(distanceMeters * acceleration);
  const dryMass = shipClass ? shipClass.mass + ship.crew.length * 80 : 200000;
  const specificImpulse = getSpecificImpulse(engineDef);

  return calculateFuelMassRequired(dryMass, requiredDeltaV, specificImpulse);
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

  const crewSalaryPerTick = ship.crew.reduce((sum, c) => {
    const roleDef = getCrewRoleDefinition(c.role);
    return sum + (roleDef?.salary ?? 0);
  }, 0);

  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  // Calculate fuel cost in credits
  const distanceMeters = distanceKm * 1000;
  const currentMass = getCurrentShipMass(ship);
  const thrust = engineDef.thrust;
  const acceleration = thrust / currentMass;
  const requiredDeltaV = 2 * Math.sqrt(distanceMeters * acceleration);
  const dryMass = shipClass ? shipClass.mass + ship.crew.length * 80 : 200000;
  const specificImpulse = getSpecificImpulse(engineDef);
  const fuelKgRequired = calculateFuelMassRequired(
    dryMass,
    requiredDeltaV,
    specificImpulse
  );

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
  const payment = basePayment * (1 + crewBonus);

  return Math.round(payment);
}

/**
 * Calculate payment bonus from skilled crew members in appropriate rooms.
 *
 * - Navigator on bridge: +2% per astrogation point above 5
 * - Engineer in engine room: +1% per engineering point above 5
 * - Cook in cantina: +3% per charisma point above 5
 */
function calculateCrewSkillBonus(ship: Ship): number {
  let bonus = 0;

  for (const room of ship.rooms) {
    for (const crewId of room.assignedCrewIds) {
      const crew = ship.crew.find((c) => c.id === crewId);
      if (!crew) continue;

      if (room.type === 'bridge' && crew.role === 'navigator') {
        const pointsAbove5 = Math.max(0, crew.skills.astrogation - 5);
        bonus += pointsAbove5 * 0.02;
      } else if (room.type === 'engine_room' && crew.role === 'engineer') {
        const pointsAbove5 = Math.max(0, crew.skills.engineering - 5);
        bonus += pointsAbove5 * 0.01;
      } else if (room.type === 'cantina' && crew.role === 'cook') {
        const pointsAbove5 = Math.max(0, crew.skills.charisma - 5);
        bonus += pointsAbove5 * 0.03;
      }
    }
  }

  return bonus;
}

/**
 * Estimate trip time in game seconds using simplified burn-coast-burn physics
 */
function estimateTripTime(ship: Ship, distanceKm: number): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 0;

  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const distanceMeters = distanceKm * 1000;
  const mass = shipClass.mass;
  const thrust = engineDef.thrust;
  const acceleration = thrust / mass;

  // Use fixed cruise velocity (same as computeMaxRange and initializeFlight)
  // 50% fuel budget for one-way trip
  const allocatedDeltaV = 0.5 * engineDef.maxDeltaV;

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
    const coastDistance = distanceMeters - 2 * burnDistance;
    const coastTime = coastDistance / v_cruise;
    totalTime = 2 * burnTime + coastTime;
  }

  return totalTime;
}

/**
 * Check if destination is reachable from origin with current ship
 */
function isDestinationReachable(
  ship: Ship,
  origin: WorldLocation,
  destination: WorldLocation
): boolean {
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

  // Cargo between 1,000 - 10,000 kg
  const cargoKg = Math.round(1000 + Math.random() * 9000);

  const payment = calculatePayment(ship, distanceKm, cargoKg);
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

  const payment = calculatePayment(ship, distanceKm);
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

  const cargoKg = Math.round(1000 + Math.random() * 9000);
  const trips = Math.floor(2 + Math.random() * 4); // 2-5 trips

  const paymentPerTrip = Math.round(
    calculatePayment(ship, distanceKm, cargoKg) * 0.8
  ); // 80% of one-off rate
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
  const cargoCapacity = shipClass ? shipClass.cargoCapacity : 5000;
  const cargoPerTrip = Math.min(cargoCapacity * 0.8, 10000); // Use 80% of capacity

  const payment = Math.round(
    calculatePayment(ship, distanceKm, totalCargoKg) * 1.5
  ); // 150% bonus for bulk
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

  const cargoKg = Math.round(1000 + Math.random() * 9000);
  const paymentPerTrip = Math.round(
    calculatePayment(ship, distanceKm, cargoKg) * 0.7
  ); // 70% of one-off rate
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

  const crewSalaryPerTick = ship.crew.reduce((sum, c) => {
    const roleDef = getCrewRoleDefinition(c.role);
    return sum + (roleDef?.salary ?? 0);
  }, 0);

  const fuelKgRequired = calculateTripFuelKg(ship, distanceKm);

  const crewCost = crewSalaryPerTick * roundTripTicks;
  const fuelCost = fuelKgRequired * 2 * FUEL_PRICE_PER_KG; // Round trip in kg
  const totalCost = crewCost + fuelCost;

  // Fixed at 150% of operating costs (no randomness unlike regular quests)
  const costFloor = totalCost * 1.5;

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

  const payment =
    (costFloor + distanceBonus) *
    cargoPremium *
    dangerPremium *
    locationFactor *
    (1 + crewBonus);

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

  // Trade route to every other location with trade service
  const tradePartners = world.locations.filter(
    (l) => l.id !== location.id && l.services.includes('trade')
  );

  for (const partner of tradePartners) {
    const distanceKm = getDistanceBetween(location, partner);
    const tradeGood = getTradeGood(location, partner);

    // Cargo scales with origin's economic power
    const cargoKg = 1000 + location.size * 500;

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
 * Generate quests for all locations in the world
 */
export function generateAllLocationQuests(
  ship: Ship,
  world: World
): Record<string, Quest[]> {
  const allQuests: Record<string, Quest[]> = {};
  for (const location of world.locations) {
    const tradeRoutes = generatePersistentTradeRoutes(ship, location, world);
    const randomQuests = generateQuestsForLocation(ship, location, world);
    allQuests[location.id] = [...tradeRoutes, ...randomQuests];
  }
  return allQuests;
}

/**
 * Generate quests for a location
 */
export function generateQuestsForLocation(
  ship: Ship,
  location: WorldLocation,
  world: World
): Quest[] {
  const quests: Quest[] = [];
  const count = location.size;

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
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) {
    return { canAccept: false, reason: 'Unknown ship class' };
  }

  // Check cargo capacity
  if (quest.cargoRequired > shipClass.cargoCapacity) {
    return {
      canAccept: false,
      reason: `Insufficient cargo capacity (need ${quest.cargoRequired.toLocaleString()} kg, have ${shipClass.cargoCapacity.toLocaleString()} kg)`,
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
