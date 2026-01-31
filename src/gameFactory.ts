import type {
  GameData,
  Captain,
  Ship,
  CrewMember,
  Room,
  ShipClassId,
  CrewRole,
} from './models';
import { getShipClass } from './shipClasses';
import { generateCrewName } from './names';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function createCaptain(name: string): Captain {
  return {
    name,
    stats: {
      leadership: 5,
      navigation: 5,
      negotiation: 5,
    },
  };
}

function createCrewMember(name: string, role: CrewRole): CrewMember {
  return {
    id: generateId(),
    name,
    role,
    morale: 75,
    health: 100,
    skill: Math.floor(Math.random() * 5) + 3, // 3-7
  };
}

function createRoom(type: Room['type']): Room {
  return {
    id: generateId(),
    type,
    state: 'operational',
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

  // Create initial crew
  const crew: CrewMember[] = [
    createCrewMember(generateCrewName(), 'pilot'),
    createCrewMember(generateCrewName(), 'engineer'),
    createCrewMember(generateCrewName(), 'cook'),
  ];

  // Assign crew to rooms
  const bridgeRoom = rooms.find((r) => r.type === 'bridge');
  const engineRoom = rooms.find((r) => r.type === 'engine_room');
  const cantinaRoom = rooms.find((r) => r.type === 'cantina');

  const pilot = crew.find((c) => c.role === 'pilot');
  const engineer = crew.find((c) => c.role === 'engineer');
  const cook = crew.find((c) => c.role === 'cook');

  if (bridgeRoom && pilot) {
    bridgeRoom.assignedCrewId = pilot.id;
  }
  if (engineRoom && engineer) {
    engineRoom.assignedCrewId = engineer.id;
  }
  if (cantinaRoom && cook) {
    cantinaRoom.assignedCrewId = cook.id;
  }

  const ship: Ship = {
    name: shipName,
    classId: shipClassId,
    rooms,
    crew,
    fuel: 100,
    credits: 1000,
  };

  return {
    captain: createCaptain(captainName),
    ship,
    createdAt: Date.now(),
  };
}
