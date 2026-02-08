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
} from '../models';
import { generateWorld } from '../worldGen';

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
      piloting: 5,
      astrogation: 5,
      engineering: 3,
      strength: 3,
      charisma: 3,
      loyalty: 3,
    },
    xp: 0,
    level: 1,
    isCaptain: false,
    equipment: [],
    unspentSkillPoints: 0,
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
    assignedCrewIds: [],
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
    ...overrides,
  };
}

export function createTestShip(overrides: Partial<Ship> = {}): Ship {
  const bridgeCrew = createTestCrew({
    name: 'Navigator',
    role: 'navigator',
    skills: {
      piloting: 3,
      astrogation: 5,
      engineering: 2,
      strength: 2,
      charisma: 2,
      loyalty: 2,
    },
  });

  const bridge = createTestRoom({
    type: 'bridge',
    assignedCrewIds: [bridgeCrew.id],
  });

  const engineRoom = createTestRoom({
    type: 'engine_room',
    assignedCrewIds: [],
  });

  const captain = createTestCrew({
    name: 'Captain',
    role: 'captain',
    isCaptain: true,
  });

  const defaultShip = {
    id: uid(),
    name: 'Test Ship',
    classId: 'wayfarer' as ShipClassId,
    rooms: [bridge, engineRoom],
    crew: [captain, bridgeCrew],
    fuel: 80,
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
    ...overrides,
  };

  // If ship is not in_flight, clear activeFlightPlan unless explicitly provided
  if (
    defaultShip.location.status !== 'in_flight' &&
    !('activeFlightPlan' in overrides)
  ) {
    defaultShip.activeFlightPlan = undefined;
  }

  return defaultShip;
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
