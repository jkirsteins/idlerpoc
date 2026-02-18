import type { Ship } from './models';
import { getRoomDefinition } from './rooms';
import { getEquipmentDefinition } from './equipment';
import { getEngineDefinition } from './engines';
import { isRoomStaffed } from './jobSlots';

export type PowerSource = 'berth' | 'drives' | 'warming_up' | 'none';

/**
 * Base power figures shared by computePowerStatus and computeEquipmentPowerBudget.
 * Extracted to a single source of truth so room/engine/output logic isn't duplicated.
 */
export interface PowerBase {
  totalOutput: number;
  roomDraw: number;
  engineSelfDraw: number;
  powerSource: PowerSource;
  warmupProgress: number;
}

/**
 * Compute the base power figures for a ship: total output, room draw,
 * engine self-draw, and power source. Does NOT include equipment draw —
 * callers add that themselves based on their needs.
 */
export function computePowerBase(ship: Ship): PowerBase {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const isDocked = ship.location.status === 'docked';

  let totalOutput = 0;
  let powerSource: PowerSource = 'none';
  let warmupProgress = 0;

  if (isDocked) {
    totalOutput = engineDef.powerOutput;
    powerSource = 'berth';
  } else if (ship.engine.state === 'online' && ship.fuelKg > 0) {
    totalOutput = engineDef.powerOutput;
    powerSource = 'drives';
  } else if (ship.engine.state === 'warming_up') {
    totalOutput = 0;
    powerSource = 'warming_up';
    warmupProgress = ship.engine.warmupProgress;
  } else {
    totalOutput = 0;
    powerSource = 'none';
  }

  let roomDraw = 0;
  for (const room of ship.rooms) {
    const roomDef = getRoomDefinition(room.type);
    if (!roomDef) continue;
    const isActive =
      roomDef.alwaysPowered ||
      (isRoomStaffed(ship, room.id) && room.state === 'operational');
    if (isActive) {
      roomDraw += roomDef.powerDraw;
    }
  }

  let engineSelfDraw = 0;
  if (ship.engine.state === 'online') {
    engineSelfDraw = engineDef.selfPowerDraw;
  }

  return { totalOutput, roomDraw, engineSelfDraw, powerSource, warmupProgress };
}

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
  const base = computePowerBase(ship);

  // Total draw = rooms + engine self-draw + powered equipment
  let totalDraw = base.roomDraw + base.engineSelfDraw;

  for (const equipment of ship.equipment) {
    if (!equipment.powered) continue;
    const equipDef = getEquipmentDefinition(equipment.definitionId);
    if (equipDef) {
      totalDraw += equipDef.powerDraw;
    }
  }

  const percentage =
    base.totalOutput > 0 ? (totalDraw / base.totalOutput) * 100 : 0;
  const isOverloaded = totalDraw > base.totalOutput;

  return {
    totalOutput: base.totalOutput,
    totalDraw,
    percentage,
    isOverloaded,
    engineOnline: ship.engine.state === 'online',
    powerSource: base.powerSource,
    warmupProgress: base.warmupProgress,
  };
}
