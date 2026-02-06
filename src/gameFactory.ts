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
  CrewSkills,
} from './models';
import { getShipClass } from './shipClasses';
import { generateCrewName } from './names';
import { generateWorld } from './worldGen';
import { generateStartingXP, getLevelForXP } from './levelSystem';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function createEquipmentInstance(definitionId: EquipmentId): EquipmentInstance {
  return {
    id: generateId(),
    definitionId,
    degradation: 0,
  };
}

function generateCrewSkills(): CrewSkills {
  return {
    strength: Math.floor(Math.random() * 5) + 3, // 3-7
    loyalty: Math.floor(Math.random() * 5) + 3, // 3-7
    charisma: Math.floor(Math.random() * 5) + 3, // 3-7
  };
}

function createCrewMember(
  name: string,
  role: CrewRole,
  isCaptain: boolean = false
): CrewMember {
  const xp = isCaptain ? 120 : generateStartingXP(); // Captain starts at level 4
  const level = getLevelForXP(xp);

  return {
    id: generateId(),
    name,
    role,
    morale: isCaptain ? 85 : 75,
    health: 100,
    skills: generateCrewSkills(),
    xp,
    level,
    isCaptain,
    equipment: [],
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

export function createNewGame(
  captainName: string,
  shipName: string,
  shipClassId: ShipClassId
): GameData {
  const shipClass = getShipClass(shipClassId);
  if (!shipClass) {
    throw new Error(`Unknown ship class: ${shipClassId}`);
  }

  // Create rooms based on ship class
  const rooms: Room[] = shipClass.rooms.map((roomType) => createRoom(roomType));

  // Create initial crew based on available rooms
  const crew: CrewMember[] = [];

  // Create captain
  const captain = createCrewMember(captainName, 'captain', true);
  crew.push(captain);

  // Always have pilot and engineer
  const pilot = createCrewMember(generateCrewName(), 'pilot');
  const engineer = createCrewMember(generateCrewName(), 'engineer');
  crew.push(pilot, engineer);

  // Add cook only if ship has cantina
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

  // Create default equipment
  const equipment: EquipmentInstance[] = shipClass.defaultEquipment.map(
    (equipId) => createEquipmentInstance(equipId)
  );

  // Create engine instance
  const engine = createEngineInstance(shipClassId);

  const ship: Ship = {
    name: shipName,
    classId: shipClassId,
    rooms,
    crew,
    fuel: 100,
    credits: 5000, // Starting credits for initial operations
    equipment,
    location: {
      status: 'docked',
      dockedAt: 'Earth',
    },
    engine,
  };

  // Generate world
  const world = generateWorld();

  return {
    ship,
    world,
    createdAt: Date.now(),
  };
}
