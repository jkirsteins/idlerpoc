import type {
  GameData,
  EquipmentInstance,
  CrewMember,
  EngineInstance,
} from './models';
import { getShipClass } from './shipClasses';
import { generateWorld } from './worldGen';
import { generateStartingXP, getLevelForXP } from './levelSystem';

const STORAGE_KEY = 'spaceship_game_data';

// Legacy types for migrations
interface LegacyRoom {
  assignedCrewId?: string;
  assignedCrewIds?: string[];
}

interface LegacyCaptain {
  name: string;
  stats: {
    leadership: number;
    navigation: number;
    negotiation: number;
  };
}

interface LegacyGameData {
  captain?: LegacyCaptain;
}

interface LegacyCrewMember {
  skill?: number;
  skills?: { strength: number; loyalty: number; charisma: number };
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function saveGame(gameData: GameData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameData));
}

export function loadGame(): GameData | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    const gameData = JSON.parse(data) as GameData;

    // Migration: convert old assignedCrewId to assignedCrewIds array
    for (const room of gameData.ship.rooms) {
      const oldRoom = room as unknown as LegacyRoom;
      if (oldRoom.assignedCrewId !== undefined) {
        room.assignedCrewIds = oldRoom.assignedCrewId
          ? [oldRoom.assignedCrewId]
          : [];
        delete oldRoom.assignedCrewId;
      } else if (!room.assignedCrewIds) {
        room.assignedCrewIds = [];
      }
    }

    // Migration: add equipment if missing
    if (!gameData.ship.equipment) {
      const shipClass = getShipClass(gameData.ship.classId);
      if (shipClass) {
        gameData.ship.equipment = shipClass.defaultEquipment.map(
          (equipId): EquipmentInstance => ({
            id: generateId(),
            definitionId: equipId,
            degradation: 0,
          })
        );
      } else {
        gameData.ship.equipment = [];
      }
    }

    // Migration: clear cargo hold crew (maxCrew is now 0)
    const cargoHold = gameData.ship.rooms.find((r) => r.type === 'cargo_hold');
    if (cargoHold && cargoHold.assignedCrewIds.length > 0) {
      cargoHold.assignedCrewIds = [];
    }

    // Migration: add location if missing
    if (!gameData.ship.location) {
      gameData.ship.location = {
        status: 'docked',
        dockedAt: 'Earth',
      };
    }

    // Migration 1: Captain → crew
    const oldGameData = gameData as unknown as LegacyGameData;
    if (oldGameData.captain) {
      // Create captain crew member from old captain data
      const captainMember: CrewMember = {
        id: generateId(),
        name: oldGameData.captain.name,
        role: 'captain',
        morale: 85,
        health: 100,
        skills: {
          strength: oldGameData.captain.stats.leadership || 5,
          loyalty: oldGameData.captain.stats.navigation || 5,
          charisma: oldGameData.captain.stats.negotiation || 5,
        },
        xp: 120, // Level 4
        level: 4,
        isCaptain: true,
        equipment: [],
      };

      // Add captain to crew if not already there
      if (!gameData.ship.crew.some((c) => c.isCaptain)) {
        gameData.ship.crew.unshift(captainMember);

        // Assign captain to bridge
        const bridge = gameData.ship.rooms.find((r) => r.type === 'bridge');
        if (bridge && !bridge.assignedCrewIds.includes(captainMember.id)) {
          bridge.assignedCrewIds.unshift(captainMember.id);
        }
      }

      delete oldGameData.captain;
    }

    // Migration 2: skill → skills
    for (const crew of gameData.ship.crew) {
      const oldCrew = crew as unknown as LegacyCrewMember;
      if (oldCrew.skill !== undefined && !crew.skills) {
        crew.skills = {
          strength: oldCrew.skill || 5,
          loyalty: oldCrew.skill || 5,
          charisma: oldCrew.skill || 5,
        };
        delete oldCrew.skill;
      }
    }

    // Migration 3: Add XP/level if missing
    for (const crew of gameData.ship.crew) {
      if (crew.xp === undefined) {
        crew.xp = crew.isCaptain ? 120 : generateStartingXP();
      }
      if (crew.level === undefined) {
        crew.level = getLevelForXP(crew.xp);
      }
    }

    // Migration 4: Add isCaptain flag if missing
    for (const crew of gameData.ship.crew) {
      if (crew.isCaptain === undefined) {
        crew.isCaptain = crew.role === 'captain';
      }
    }

    // Migration 5: Add crew equipment array if missing
    for (const crew of gameData.ship.crew) {
      if (!crew.equipment) {
        crew.equipment = [];
      }
    }

    // Migration 6: Add engine instance if missing
    if (!gameData.ship.engine) {
      const shipClass = getShipClass(gameData.ship.classId);
      if (shipClass) {
        gameData.ship.engine = {
          id: generateId(),
          definitionId: shipClass.defaultEngineId,
          state: 'off',
          warmupProgress: 0,
        } as EngineInstance;
      }
    }

    // Migration 7: Add world if missing
    if (!gameData.world) {
      gameData.world = generateWorld();
    }

    return gameData;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}
