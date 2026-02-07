import type { Quest, Ship, WorldLocation, World } from './models';
import { getShipClass } from './shipClasses';
import { getDistanceBetween } from './worldGen';
import { calculateFuelCost, computeMaxRange } from './flightPhysics';
import { gameSecondsToTicks, GAME_SECONDS_PER_TICK } from './timeSystem';
import { getEngineDefinition } from './engines';
import { getCrewRoleDefinition } from './crewRoles';

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
  const maxRangeKm = shipClass ? computeMaxRange(shipClass, engineDef) : 1;
  const fuelCostPercent = calculateFuelCost(distanceKm, maxRangeKm);

  const crewCost = crewSalaryPerTick * roundTripTicks;
  const fuelCost = fuelCostPercent * 2 * 5; // Round trip, 5 cr per fuel %
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

  // Get max range and calculate fuel allocation
  const maxRangeKm = computeMaxRange(shipClass, engineDef);
  const fuelCostPercent = calculateFuelCost(distanceKm, maxRangeKm);
  const allocatedDeltaV = (fuelCostPercent / 100) * engineDef.maxDeltaV;

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
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return false;

  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = computeMaxRange(shipClass, engineDef);
  const distanceKm = getDistanceBetween(origin, destination);

  // Need enough range for round trip (fuel cost is 50% per one-way at max range)
  const fuelCostPercent = calculateFuelCost(distanceKm, maxRangeKm);
  const roundTripFuelCost = fuelCostPercent * 2;

  // Destination must be reachable with at least some fuel margin
  return roundTripFuelCost <= 100 && distanceKm > 0;
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
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = shipClass ? computeMaxRange(shipClass, engineDef) : 0;
  const fuelCost = calculateFuelCost(distanceKm, maxRangeKm);

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
    estimatedFuelPerTrip: fuelCost * 2, // Round trip
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
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = shipClass ? computeMaxRange(shipClass, engineDef) : 0;
  const fuelCost = calculateFuelCost(distanceKm, maxRangeKm);

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
    estimatedFuelPerTrip: fuelCost * 2,
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
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = shipClass ? computeMaxRange(shipClass, engineDef) : 0;
  const fuelCost = calculateFuelCost(distanceKm, maxRangeKm);

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
    estimatedFuelPerTrip: fuelCost * 2,
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
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = shipClass ? computeMaxRange(shipClass, engineDef) : 0;
  const fuelCost = calculateFuelCost(distanceKm, maxRangeKm);

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
    estimatedFuelPerTrip: fuelCost * 2,
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
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = shipClass ? computeMaxRange(shipClass, engineDef) : 0;
  const fuelCost = calculateFuelCost(distanceKm, maxRangeKm);

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
    estimatedFuelPerTrip: fuelCost * 2,
    estimatedTripTicks: gameSecondsToTicks(estimatedTime * 2),
  };
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
    allQuests[location.id] = generateQuestsForLocation(ship, location, world);
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
  if (quest.estimatedFuelPerTrip > ship.fuel) {
    return {
      canAccept: false,
      reason: `Insufficient fuel for trip (need ${Math.round(quest.estimatedFuelPerTrip)}%, have ${Math.round(ship.fuel)}%)`,
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
