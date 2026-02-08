import type { Ship } from './models';
import { getRoomDefinition } from './rooms';
import { getEquipmentDefinition } from './equipment';
import { getEngineDefinition } from './engines';

export type PowerSource = 'berth' | 'drives' | 'warming_up' | 'none';

export interface PowerStatus {
  totalOutput: number;
  totalDraw: number;
  percentage: number;
  isOverloaded: boolean;
  engineOnline: boolean;
  powerSource: PowerSource;
  warmupProgress: number;
}

export function computePowerStatus(ship: Ship): PowerStatus {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const isDocked = ship.location.status === 'docked';

  // Check if engine room is staffed and operational
  const engineRoom = ship.rooms.find((r) => r.type === 'engine_room');
  const engineRoomStaffed =
    engineRoom &&
    engineRoom.state === 'operational' &&
    engineRoom.assignedCrewIds.length > 0;

  let totalOutput = 0;
  let powerSource: PowerSource = 'none';
  let warmupProgress = 0;

  // Determine power source and output
  if (isDocked) {
    // Docked: get power from berth regardless of engine state
    totalOutput = engineDef.powerOutput;
    powerSource = 'berth';
  } else if (
    ship.engine.state === 'online' &&
    engineRoomStaffed &&
    ship.fuelKg > 0
  ) {
    // Undocked + engine online + staffed + has fuel
    totalOutput = engineDef.powerOutput;
    powerSource = 'drives';
  } else if (ship.engine.state === 'warming_up') {
    // Undocked + warming up
    totalOutput = 0;
    powerSource = 'warming_up';
    warmupProgress = ship.engine.warmupProgress;
  } else {
    // Undocked + engine off or unstaffed or no fuel
    totalOutput = 0;
    powerSource = 'none';
  }

  // Calculate total draw from rooms
  let totalDraw = 0;

  for (const room of ship.rooms) {
    const roomDef = getRoomDefinition(room.type);
    if (!roomDef) continue;

    // Room is active if it's always powered OR has crew assigned and is operational
    const isActive =
      roomDef.alwaysPowered ||
      (room.assignedCrewIds.length > 0 && room.state === 'operational');

    if (isActive) {
      totalDraw += roomDef.powerDraw;
    }
  }

  // Add equipment power draw
  for (const equipment of ship.equipment) {
    const equipDef = getEquipmentDefinition(equipment.definitionId);
    if (equipDef) {
      totalDraw += equipDef.powerDraw;
    }
  }

  // Add engine self-draw if engine is online
  if (ship.engine.state === 'online') {
    totalDraw += engineDef.selfPowerDraw;
  }

  const percentage = totalOutput > 0 ? (totalDraw / totalOutput) * 100 : 0;
  const isOverloaded = totalDraw > totalOutput;

  return {
    totalOutput,
    totalDraw,
    percentage,
    isOverloaded,
    engineOnline: ship.engine.state === 'online',
    powerSource,
    warmupProgress,
  };
}
