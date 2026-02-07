import type { GameData } from './models';
import { getEngineDefinition } from './engines';
import { advanceFlight, isEngineBurning } from './flightPhysics';
import { completeLeg } from './contractExec';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { getShipClass } from './shipClasses';
import { getCrewRoleDefinition } from './crewRoles';

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

      // Crew salary deduction (only during flight)
      let totalSalary = 0;
      for (const crew of ship.crew) {
        const roleDef = getCrewRoleDefinition(crew.role);
        if (roleDef) {
          totalSalary += roleDef.salary;
        }
      }

      if (totalSalary > 0) {
        if (ship.credits >= totalSalary) {
          // Can afford full salaries
          ship.credits -= totalSalary;
        } else {
          // Cannot afford full salaries - mark crew as unpaid
          ship.credits = 0;

          // Sort crew by salary (most expensive first) to pay cheaper roles first
          const crewBySalary = [...ship.crew].sort((a, b) => {
            const salaryA = getCrewRoleDefinition(a.role)?.salary || 0;
            const salaryB = getCrewRoleDefinition(b.role)?.salary || 0;
            return salaryB - salaryA;
          });

          let remainingBudget = ship.credits;
          for (const crew of crewBySalary) {
            const salary = getCrewRoleDefinition(crew.role)?.salary || 0;
            if (salary > 0) {
              if (remainingBudget >= salary) {
                remainingBudget -= salary;
              } else {
                // This crew member goes unpaid
                crew.unpaidTicks++;
              }
            }
          }
        }
      }

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
