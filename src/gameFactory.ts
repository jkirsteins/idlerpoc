import type {
  GameData,
  Ship,
  CrewMember,
  Room,
  ShipClassId,
  CrewRole,
  EquipmentInstance,
  EquipmentId,
  EngineInstance,
  CrewEquipmentInstance,
  EquipmentSlotDef,
} from './models';
import { getShipClass } from './shipClasses';
import { CURRENT_SAVE_VERSION } from './storage';
import { generateCrewName } from './names';
import { generateWorld } from './worldGen';
import { getLevelForXP } from './levelSystem';
import {
  generateSkillsForRole,
  rollCrewQuality,
  calculateHireCost,
  calculateSalaryMultiplier,
} from './crewRoles';
import { createInitialMastery } from './masterySystem';
import { generateAllLocationQuests } from './questGen';
import { getEquipmentDefinition, canEquipInSlot } from './equipment';
import {
  PROVISIONS_KG_PER_CREW_PER_DAY,
  MAX_PROVISION_DAYS,
} from './provisionsSystem';
import { generateJobSlotsForShip, autoAssignCrewToJobs } from './jobSlots';
import { generateId } from './utils';

export { generateId } from './utils';

export const HIRE_BASE_COST = 500;

function createEquipmentInstance(definitionId: EquipmentId): EquipmentInstance {
  return {
    id: generateId(),
    definitionId,
    degradation: 0,
  };
}

function createCrewMember(
  name: string,
  targetRole: CrewRole,
  isCaptain: boolean = false,
  quality: number = 0
): CrewMember {
  const xp = 0;
  const level = getLevelForXP(xp);

  // Captain starts at zero; hired crew get archetype-weighted skills
  const skills = generateSkillsForRole(targetRole, quality);

  // Use target role directly (skills start at 0, can't deduce from them)
  const role = isCaptain ? 'captain' : targetRole;

  const hireCost = calculateHireCost(skills, HIRE_BASE_COST);
  // Hire-time baseline — salary is computed dynamically from current skills,
  // but we store the initial multiplier for reference / future UI comparisons.
  const salaryMultiplier = isCaptain ? 1.0 : calculateSalaryMultiplier(skills);

  return {
    id: generateId(),
    name,
    role,
    morale: isCaptain ? 85 : 75,
    health: 100,
    skills,
    xp,
    level,
    isCaptain,
    equipment: [],
    unpaidTicks: 0,
    hireCost,
    salaryMultiplier,
    zeroGExposure: 0,
    mastery: createInitialMastery(),
    hiredAt: 0, // Set to actual gameTime when hired; 0 = game epoch for captain
    boardedShipAt: 0, // Set to actual gameTime when assigned to a ship
  };
}

function createRoom(type: Room['type']): Room {
  return {
    id: generateId(),
    type,
    state: 'operational',
  };
}

function createEngineInstance(shipClassId: ShipClassId): EngineInstance {
  const shipClass = getShipClass(shipClassId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${shipClassId}`);
  }

  return {
    id: generateId(),
    definitionId: shipClass.defaultEngineId,
    state: 'off',
    warmupProgress: 0,
  };
}

/**
 * Generate hireable crew candidates for a location.
 *
 * Mirrors the quest system: location.size drives the candidate count.
 * A separate daily "empty market" roll adds a chance that nobody is
 * looking for work — the probability scales inversely with station
 * size so major hubs (Earth, size 5) are rarely empty (~10%) while
 * remote outposts (size 1) often have nobody (~50%).
 *
 * Each candidate has an archetype (pilot/miner/trader) that determines
 * their skill distribution. A quality roll — skewed toward low values —
 * sets their overall skill magnitude. Larger stations produce slightly
 * better candidates on average. Hire cost and salary scale with skills.
 */
export function generateHireableCrew(locationSize: number): CrewMember[] {
  // Daily availability roll — chance the hiring market is dry.
  // size 5: 10%, size 3: ~17%, size 2: 25%, size 1: 50%
  const emptyChance = 1 / (locationSize * 2);
  if (Math.random() < emptyChance) {
    return [];
  }

  // When crew are available, 1 to locationSize candidates
  const count = 1 + Math.floor(Math.random() * locationSize);
  const candidates: CrewMember[] = [];

  const availableRoles: CrewRole[] = ['pilot', 'miner', 'trader'];

  for (let i = 0; i < count; i++) {
    const role =
      availableRoles[Math.floor(Math.random() * availableRoles.length)];
    const name = generateCrewName();
    const quality = rollCrewQuality(locationSize);
    candidates.push(createCrewMember(name, role, false, quality));
  }

  return candidates;
}

/**
 * Generate hireable crew pools for all stations with 'hire' service.
 * Candidate count scales with location size — large hubs attract more
 * crew while remote outposts may have nobody looking for work.
 */
export function generateHireableCrewByLocation(
  world: GameData['world']
): Record<string, CrewMember[]> {
  const pools: Record<string, CrewMember[]> = {};
  for (const location of world.locations) {
    if (location.services.includes('hire')) {
      pools[location.id] = generateHireableCrew(location.size);
    }
  }
  return pools;
}

/**
 * Create equipment slots and default equipment for a ship class
 */
function createShipEquipment(shipClassId: ShipClassId): {
  equipmentSlots: EquipmentSlotDef[];
  equipment: EquipmentInstance[];
} {
  const shipClass = getShipClass(shipClassId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${shipClassId}`);
  }

  const equipmentSlots: EquipmentSlotDef[] = shipClass.equipmentSlotDefs.map(
    (slotDef) => ({
      id: generateId(),
      tags: slotDef.tags,
    })
  );

  const equipment: EquipmentInstance[] = shipClass.defaultEquipment.map(
    (equipId) => createEquipmentInstance(equipId)
  );

  // Assign default equipment to compatible slots
  for (const equipInstance of equipment) {
    const equipDef = getEquipmentDefinition(equipInstance.definitionId);
    if (!equipDef) continue;

    const compatibleSlot = equipmentSlots.find(
      (slot) => !slot.equippedId && canEquipInSlot(equipDef, slot)
    );

    if (compatibleSlot) {
      compatibleSlot.equippedId = equipInstance.id;
    }
  }

  return { equipmentSlots, equipment };
}

/**
 * Create a new ship with crew and equipment (used for starting game)
 */
function createStartingShip(
  captainName: string,
  shipName: string,
  shipClassId: ShipClassId
): Ship {
  const shipClass = getShipClass(shipClassId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${shipClassId}`);
  }

  const rooms: Room[] = shipClass.rooms.map((roomType) => createRoom(roomType));

  // Create initial crew — just the captain, solo on the helm
  const crew: CrewMember[] = [];
  const captain = createCrewMember(captainName, 'captain', true);
  crew.push(captain);

  const { equipmentSlots, equipment } = createShipEquipment(shipClassId);
  const engine = createEngineInstance(shipClassId);

  // Create cargo with 1 sidearm per crew member
  const cargo: CrewEquipmentInstance[] = crew.map(() => ({
    id: generateId(),
    definitionId: 'sidearm',
  }));

  // Fuel tank capacity from dedicated ship class fuel tanks
  const maxFuelKg = shipClass.fuelCapacity;

  const ship: Ship = {
    id: generateId(),
    name: shipName,
    classId: shipClassId,
    rooms,
    crew,
    jobSlots: [],
    fuelKg: maxFuelKg, // Start with full tank
    maxFuelKg,
    provisionsKg:
      crew.length * PROVISIONS_KG_PER_CREW_PER_DAY * MAX_PROVISION_DAYS,
    oxygenLevel: 100, // Start with full atmosphere
    equipment,
    equipmentSlots,
    location: {
      status: 'docked',
      dockedAt: 'earth',
    },
    engine,
    cargo,
    oreCargo: [],
    miningAccumulator: {},
    activeContract: null,
    routeAssignment: null,
    miningRoute: null,
    activeFlightPlan: undefined,
    metrics: {
      creditsEarned: 0,
      fuelCostsPaid: 0,
      crewCostsPaid: 0,
      repairCostsPaid: 0,
      contractsCompleted: 0,
      totalFlightTicks: 0,
      totalIdleTicks: 0,
      lastActivityTime: 0,
    },
    role: undefined,
    flightProfileBurnFraction: 1.0,
  };

  // Generate job slots from rooms + equipment, then auto-assign crew
  ship.jobSlots = generateJobSlotsForShip(ship);
  autoAssignCrewToJobs(ship);

  return ship;
}

/**
 * Create an additional ship (purchased at a station) — spawns with NO crew
 */
export function createAdditionalShip(
  shipName: string,
  shipClassId: ShipClassId,
  stationId: string
): Ship {
  const shipClass = getShipClass(shipClassId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${shipClassId}`);
  }

  const rooms: Room[] = shipClass.rooms.map((roomType) => createRoom(roomType));
  const { equipmentSlots, equipment } = createShipEquipment(shipClassId);
  const engine = createEngineInstance(shipClassId);

  // Fuel tank capacity from dedicated ship class fuel tanks
  const maxFuelKg = shipClass.fuelCapacity;

  const ship: Ship = {
    id: generateId(),
    name: shipName,
    classId: shipClassId,
    rooms,
    crew: [],
    jobSlots: [],
    fuelKg: maxFuelKg, // Start with full tank
    maxFuelKg,
    provisionsKg: 0, // No crew = no provisions; auto-resupplied when crew boards
    oxygenLevel: 100, // Start with full atmosphere
    equipment,
    equipmentSlots,
    location: {
      status: 'docked',
      dockedAt: stationId,
    },
    engine,
    cargo: [],
    oreCargo: [],
    miningAccumulator: {},
    activeContract: null,
    routeAssignment: null,
    miningRoute: null,
    activeFlightPlan: undefined,
    metrics: {
      creditsEarned: 0,
      fuelCostsPaid: 0,
      crewCostsPaid: 0,
      repairCostsPaid: 0,
      contractsCompleted: 0,
      totalFlightTicks: 0,
      totalIdleTicks: 0,
      lastActivityTime: 0,
    },
    role: undefined,
    flightProfileBurnFraction: 1.0,
  };

  // Generate job slots from rooms + equipment (no crew to assign yet)
  ship.jobSlots = generateJobSlotsForShip(ship);

  return ship;
}

export function createNewGame(
  captainName: string,
  shipName: string,
  shipClassId: ShipClassId
): GameData {
  const ship = createStartingShip(captainName, shipName, shipClassId);

  // Generate world
  const world = generateWorld();

  // Generate initial quests for all locations
  const availableQuests = generateAllLocationQuests([ship], world);
  const lastQuestRegenDay = 0;

  // Generate hireable crew for all stations with hire service
  const hireableCrewByLocation = generateHireableCrewByLocation(world);

  return {
    saveVersion: CURRENT_SAVE_VERSION,
    ships: [ship],
    activeShipId: ship.id,
    credits: 5000,
    lifetimeCreditsEarned: 0,
    world,
    createdAt: Date.now(),
    gameTime: 0,
    availableQuests,
    log: [],
    lastTickTimestamp: Date.now(),
    lastQuestRegenDay,
    hireableCrewByLocation,
    dailyLedgerSnapshots: [],
    visitedLocations: ['earth'], // Player starts docked at Earth
    // Time system state
    isPaused: false,
    timeSpeed: 1,
    autoPauseSettings: {
      onArrival: false,
      onContractComplete: false,
      onCriticalAlert: false,
      onLowFuel: false,
    },
  };
}
