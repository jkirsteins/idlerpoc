import type { GameData } from './models';
import { getEngineDefinition } from './engines';
import { advanceFlight, isEngineBurning } from './flightPhysics';
import { completeLeg } from './contractExec';
import { GAME_SECONDS_PER_TICK } from './timeSystem';

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

  // 2. Flight physics (if we have an active flight)
  if (ship.location.flight) {
    // Advance game time
    gameData.gameTime += GAME_SECONDS_PER_TICK;

    // Advance flight state
    const flightComplete = advanceFlight(ship.location.flight);

    // Fuel consumption (only during burn phases when engine is online and staffed)
    const engineBurning = isEngineBurning(ship.location.flight);
    if (
      engineBurning &&
      ship.engine.state === 'online' &&
      engineRoomStaffed &&
      ship.fuel > 0
    ) {
      ship.fuel = Math.max(0, ship.fuel - engineDef.fuelConsumptionRate);
    }

    changed = true;

    // Handle flight completion
    if (flightComplete) {
      completeLeg(gameData);
    }
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
