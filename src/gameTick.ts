import type { GameData } from './models';
import { getEngineDefinition } from './engines';
import { advanceFlight, isEngineBurning } from './flightPhysics';
import { completeLeg } from './contractExec';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { getShipClass } from './shipClasses';

export function applyTick(gameData: GameData): boolean {
  const { ship } = gameData;
  let changed = false;

  // IN-FLIGHT TICKS
  if (ship.location.status === 'in_flight') {
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

      // Fuel consumption based on flight progress during burn phases
      const engineBurning = isEngineBurning(ship.location.flight);
      if (
        engineBurning &&
        ship.engine.state === 'online' &&
        engineRoomStaffed
      ) {
        // Calculate fuel cost for this entire leg
        const flight = ship.location.flight;
        const origin = gameData.world.locations.find(
          (l) => l.id === flight.origin
        );
        const destination = gameData.world.locations.find(
          (l) => l.id === flight.destination
        );

        if (origin && destination) {
          const distanceKm = Math.abs(
            origin.distanceFromEarth - destination.distanceFromEarth
          );
          const shipClass = getShipClass(ship.classId);
          if (shipClass) {
            const maxRangeKm = parseInt(
              shipClass.maxRange.match(/^([\d,]+)/)?.[1].replace(/,/g, '') ||
                '0',
              10
            );
            const totalFuelCostPercent = (distanceKm / maxRangeKm) * 50; // One-way fuel cost

            // Consume fuel proportionally to burn time
            // Fuel is only consumed during burn phases, not coast
            const totalBurnTime = flight.burnTime * 2; // Accel + decel
            const fuelPerSecondOfBurn = totalFuelCostPercent / totalBurnTime;
            const fuelThisTick = fuelPerSecondOfBurn * GAME_SECONDS_PER_TICK;

            ship.fuel = Math.max(0, ship.fuel - fuelThisTick);
          }
        }
      }

      changed = true;

      // Handle flight completion
      if (flightComplete) {
        completeLeg(gameData);
      }
    }
  }

  // 3. Air filter degradation (always happens)
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
