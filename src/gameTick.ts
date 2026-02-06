import type { GameData } from './models';
import { getEngineDefinition } from './engines';

export function applyTick(gameData: GameData): boolean {
  const { ship } = gameData;

  // Only apply tick when in flight
  if (ship.location.status !== 'in_flight') {
    return false;
  }

  let changed = false;
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  // Check if engine room is staffed and operational
  const engineRoom = ship.rooms.find((r) => r.type === 'engine_room');
  const engineRoomStaffed =
    engineRoom &&
    engineRoom.state === 'operational' &&
    engineRoom.assignedCrewIds.length > 0;

  // 1. Engine warmup progress
  if (ship.engine.state === 'warming_up') {
    ship.engine.warmupProgress = Math.min(
      100,
      ship.engine.warmupProgress + engineDef.warmupRate
    );
    // Transition to online when warmup complete
    if (ship.engine.warmupProgress >= 100) {
      ship.engine.state = 'online';
      ship.engine.warmupProgress = 100;
    }
    changed = true;
  }

  // 2. Fuel consumption (only if engine is online, staffed, and has fuel)
  if (ship.engine.state === 'online' && engineRoomStaffed && ship.fuel > 0) {
    ship.fuel = Math.max(0, ship.fuel - engineDef.fuelConsumptionRate);
    changed = true;
  }

  // 3. Air filter degradation
  for (const equipment of ship.equipment) {
    if (equipment.definitionId === 'air_filters') {
      if (equipment.degradation < 100) {
        equipment.degradation = Math.min(100, equipment.degradation + 0.05);
        changed = true;
      }
    }
  }

  return changed;
}
