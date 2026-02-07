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
} from './models';
import { getShipClass } from './shipClasses';
import { generateCrewName } from './names';
import { generateWorld } from './worldGen';
import { generateStartingXP, getLevelForXP } from './levelSystem';
import { generateSkillsForRole, deduceRoleFromSkills } from './crewRoles';
import { generateAllLocationQuests } from './questGen';

const HIRE_BASE_COST = 500;
const HIRE_LEVEL_MULTIPLIER = 200;

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

  // Create cargo with 1 sidearm per crew member
  const cargo: CrewEquipmentInstance[] = crew.map(() => ({
    id: generateId(),
    definitionId: 'sidearm',
  }));

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
      dockedAt: 'earth',
    },
    engine,
    cargo,
  };

  // Generate world
  const world = generateWorld();

  // Generate initial quests for all locations
  const availableQuests = generateAllLocationQuests(ship, world);
  const lastQuestRegenDay = 0; // Starting on day 0

  console.log(
    'GameFactory - Generated quests for all locations:',
    availableQuests
  );

  return {
    ship,
    world,
    createdAt: Date.now(),
    gameTime: 0,
    availableQuests,
    activeContract: null,
    log: [],
    lastTickTimestamp: Date.now(),
    lastQuestRegenDay,
    hireableCrew: generateHireableCrew(),
  };
}
