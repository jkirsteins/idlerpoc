import type {
  Ship,
  GameData,
  FlightState,
  World,
  CrewMember,
  Room,
  EquipmentInstance,
  EngineInstance,
  ShipClassId,
  EngineId,
  FlightPhase,
  JobSlotType,
} from '../models';
import { generateWorld } from '../worldGen';
import { generateJobSlotsForShip } from '../jobSlots';

/**
 * Test helper factory functions.
 * Create valid game objects with sensible defaults that can be overridden.
 */

let nextId = 1;
function uid(): string {
  return `test-${nextId++}`;
}

export function createTestCrew(
  overrides: Partial<CrewMember> = {}
): CrewMember {
  return {
    id: uid(),
    name: 'Test Crew',
    role: 'pilot',
    morale: 80,
    health: 100,
    skills: {
      piloting: 30,
      astrogation: 30,
      engineering: 15,
      strength: 15,
      charisma: 15,
      loyalty: 15,
      commerce: 0,
    },
    xp: 0,
    level: 1,
    isCaptain: false,
    equipment: [],
    unpaidTicks: 0,
    hireCost: 500,
    zeroGExposure: 0,
    ...overrides,
  };
}

export function createTestRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: uid(),
    type: 'bridge',
    state: 'operational',
    ...overrides,
  };
}

export function createTestEquipment(
  overrides: Partial<EquipmentInstance> = {}
): EquipmentInstance {
  return {
    id: uid(),
    definitionId: 'life_support',
    degradation: 0,
    ...overrides,
  };
}

export function createTestEngine(
  overrides: Partial<EngineInstance> = {}
): EngineInstance {
  return {
    id: uid(),
    definitionId: 'ntr_mk1',
    state: 'online',
    warmupProgress: 100,
    ...overrides,
  };
}

export function createTestFlight(
  overrides: Partial<FlightState> = {}
): FlightState {
  return {
    origin: 'earth',
    destination: 'mars',
    totalDistance: 54_600_000_000, // 54.6M km in meters
    distanceCovered: 27_300_000_000, // halfway
    currentVelocity: 10_000, // m/s
    phase: 'coasting' as FlightPhase,
    burnTime: 500_000,
    coastTime: 1_000_000,
    elapsedTime: 1_000_000,
    totalTime: 2_000_000,
    acceleration: 0.02,
    dockOnArrival: false,
    burnFraction: 1.0,
    ...overrides,
  };
}

export function createTestShip(overrides: Partial<Ship> = {}): Ship {
  const bridgeCrew = createTestCrew({
    name: 'Navigator',
    role: 'navigator',
    skills: {
      piloting: 15,
      astrogation: 30,
      engineering: 10,
      strength: 10,
      charisma: 10,
      loyalty: 10,
      commerce: 0,
    },
  });

  const bridge = createTestRoom({
    type: 'bridge',
  });

  const engineRoom = createTestRoom({
    type: 'engine_room',
  });

  const captain = createTestCrew({
    name: 'Captain',
    role: 'captain',
    isCaptain: true,
  });

  const defaultShip: Ship = {
    id: uid(),
    name: 'Test Ship',
    classId: 'wayfarer' as ShipClassId,
    rooms: [bridge, engineRoom],
    crew: [captain, bridgeCrew],
    jobSlots: [],
    fuelKg: 22400, // 80% of 28,000 kg max fuel (Wayfarer)
    maxFuelKg: 28000, // 70% of 40,000 kg cargo capacity
    oxygenLevel: 100,
    equipment: [
      createTestEquipment({ definitionId: 'life_support' }),
      createTestEquipment({ definitionId: 'air_filters' }),
    ],
    equipmentSlots: [
      { id: uid(), tags: ['standard'] },
      { id: uid(), tags: ['standard'] },
      { id: uid(), tags: ['standard'] },
      { id: uid(), tags: ['standard'] },
    ],
    location: {
      status: 'in_flight',
    },
    engine: createTestEngine({ definitionId: 'ntr_mk1' as EngineId }),
    cargo: [],
    activeContract: null,
    routeAssignment: null,
    activeFlightPlan: createTestFlight(),
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
    ...overrides,
  };

  // Generate job slots from rooms/equipment if not explicitly provided
  if (!('jobSlots' in overrides)) {
    defaultShip.jobSlots = generateJobSlotsForShip(defaultShip);
    // Auto-assign navigator to helm
    const helmSlot = defaultShip.jobSlots.find((s) => s.type === 'helm');
    if (helmSlot) {
      helmSlot.assignedCrewId = bridgeCrew.id;
    }
  }

  // If ship is not in_flight, clear activeFlightPlan unless explicitly provided
  if (
    defaultShip.location.status !== 'in_flight' &&
    !('activeFlightPlan' in overrides)
  ) {
    defaultShip.activeFlightPlan = undefined;
  }

  return defaultShip;
}

/**
 * Test helper: assign a crew member to a job slot of the given type.
 * If no slot of that type exists, creates one.
 */
export function assignCrewToJob(
  ship: Ship,
  crewId: string,
  jobType: JobSlotType,
  sourceRoomId?: string
): void {
  // Find an empty slot of the right type
  let slot = ship.jobSlots.find(
    (s) => s.type === jobType && s.assignedCrewId === null
  );
  if (!slot) {
    // Create a slot on-the-fly for test convenience
    slot = {
      id: `test-slot-${nextId++}`,
      type: jobType,
      assignedCrewId: null,
      sourceRoomId,
    };
    ship.jobSlots.push(slot);
  }
  slot.assignedCrewId = crewId;
}

/**
 * Test helper: clear all crew assignments from slots of the given type.
 */
export function clearJobSlots(ship: Ship, jobType: JobSlotType): void {
  for (const slot of ship.jobSlots) {
    if (slot.type === jobType) {
      slot.assignedCrewId = null;
    }
  }
}

export function createTestWorld(): World {
  return generateWorld();
}

export function createTestGameData(
  overrides: Partial<GameData> = {}
): GameData {
  const world = createTestWorld();
  const ship = createTestShip();

  return {
    saveVersion: 1,
    ships: [ship],
    activeShipId: ship.id,
    credits: 10_000,
    lifetimeCreditsEarned: 50_000,
    world,
    createdAt: Date.now(),
    gameTime: 1_000_000, // some time into the game
    availableQuests: {},
    log: [],
    lastTickTimestamp: Date.now(),
    lastQuestRegenDay: 0,
    hireableCrewByLocation: {},
    visitedLocations: ['earth'],
    isPaused: false,
    timeSpeed: 1,
    autoPauseSettings: {
      onArrival: true,
      onContractComplete: true,
      onCriticalAlert: true,
      onLowFuel: true,
    },
    ...overrides,
  };
}
