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
import { generateCrewName } from './names';
import { generateWorld } from './worldGen';
import { generateStartingXP, getLevelForXP } from './levelSystem';
import { generateSkillsForRole, deduceRoleFromSkills } from './crewRoles';
import { generateAllLocationQuests } from './questGen';
import { getEquipmentDefinition, canEquipInSlot } from './equipment';

const HIRE_BASE_COST = 500;
const HIRE_LEVEL_MULTIPLIER = 200;

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

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
  isCaptain: boolean = false
): CrewMember {
  const xp = isCaptain ? 120 : generateStartingXP(); // Captain starts at level 4
  const level = getLevelForXP(xp);

  // Generate skills weighted toward the target role
  const skills = generateSkillsForRole(targetRole);

  // Deduce actual role from skills (unless captain)
  const role = isCaptain ? 'captain' : deduceRoleFromSkills(skills);

  const hireCost = HIRE_BASE_COST + level * HIRE_LEVEL_MULTIPLIER;

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
    unspentSkillPoints: 0,
    unpaidTicks: 0,
    hireCost,
    zeroGExposure: 0,
  };
}

function createRoom(type: Room['type']): Room {
  return {
    id: generateId(),
    type,
    state: 'operational',
    assignedCrewIds: [],
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
 * Generate hireable crew candidates (2-3 random crew)
 */
export function generateHireableCrew(): CrewMember[] {
  const count = 2 + Math.floor(Math.random() * 2); // 2-3 candidates
  const candidates: CrewMember[] = [];

  const availableRoles: CrewRole[] = [
    'pilot',
    'navigator',
    'engineer',
    'cook',
    'medic',
    'gunner',
    'mechanic',
  ];

  for (let i = 0; i < count; i++) {
    const role =
      availableRoles[Math.floor(Math.random() * availableRoles.length)];
    const name = generateCrewName();
    candidates.push(createCrewMember(name, role, false));
  }

  return candidates;
}

/**
 * Generate hireable crew pools for all stations with 'hire' service
 * Only generates for stations that have at least one docked ship
 */
export function generateHireableCrewByLocation(
  world: GameData['world'],
  dockedLocationIds: string[]
): Record<string, CrewMember[]> {
  const pools: Record<string, CrewMember[]> = {};
  for (const location of world.locations) {
    if (
      location.services.includes('hire') &&
      dockedLocationIds.includes(location.id)
    ) {
      pools[location.id] = generateHireableCrew();
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

  // Create initial crew
  const crew: CrewMember[] = [];
  const captain = createCrewMember(captainName, 'captain', true);
  crew.push(captain);

  const pilot = createCrewMember(generateCrewName(), 'pilot');
  const engineer = createCrewMember(generateCrewName(), 'engineer');
  crew.push(pilot, engineer);

  const hasCantina = shipClass.rooms.includes('cantina');
  if (hasCantina) {
    crew.push(createCrewMember(generateCrewName(), 'cook'));
  }

  // Assign crew to rooms
  const bridgeRoom = rooms.find((r) => r.type === 'bridge');
  const engineRoom = rooms.find((r) => r.type === 'engine_room');
  const cantinaRoom = rooms.find((r) => r.type === 'cantina');

  if (bridgeRoom) {
    bridgeRoom.assignedCrewIds.push(captain.id, pilot.id);
  }
  if (engineRoom) {
    engineRoom.assignedCrewIds.push(engineer.id);
  }
  if (cantinaRoom) {
    const cook = crew.find((c) => c.role === 'cook');
    if (cook) {
      cantinaRoom.assignedCrewIds.push(cook.id);
    }
  }

  const { equipmentSlots, equipment } = createShipEquipment(shipClassId);
  const engine = createEngineInstance(shipClassId);

  // Create cargo with 1 sidearm per crew member
  const cargo: CrewEquipmentInstance[] = crew.map(() => ({
    id: generateId(),
    definitionId: 'sidearm',
  }));

  return {
    id: generateId(),
    name: shipName,
    classId: shipClassId,
    rooms,
    crew,
    fuel: 100,
    equipment,
    equipmentSlots,
    location: {
      status: 'docked',
      dockedAt: 'earth',
    },
    engine,
    cargo,
    activeContract: null,
    routeAssignment: null,
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
  };
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

  return {
    id: generateId(),
    name: shipName,
    classId: shipClassId,
    rooms,
    crew: [],
    fuel: 100,
    equipment,
    equipmentSlots,
    location: {
      status: 'docked',
      dockedAt: stationId,
    },
    engine,
    cargo: [],
    activeContract: null,
    routeAssignment: null,
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
  };
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
  const availableQuests = generateAllLocationQuests(ship, world);
  const lastQuestRegenDay = 0;

  // Generate hireable crew for starting location
  const hireableCrewByLocation = generateHireableCrewByLocation(world, [
    'earth',
  ]);

  return {
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
    visitedLocations: ['earth'], // Player starts docked at Earth
    // Time system state
    isPaused: false,
    timeSpeed: 1,
    autoPauseSettings: {
      onArrival: true,
      onContractComplete: true,
      onCriticalAlert: true,
      onLowFuel: true,
    },
  };
}
