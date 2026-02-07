import type { GameData, Ship } from './models';
import { getEngineDefinition } from './engines';
import { advanceFlight, isEngineBurning } from './flightPhysics';
import { completeLeg } from './contractExec';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { getShipClass } from './shipClasses';
import { getCrewRoleDefinition } from './crewRoles';
import { getEquipmentDefinition } from './equipment';
import {
  applyGravityTick,
  checkThresholdCrossing,
  getDegradationDescription,
} from './gravitySystem';

/**
 * Deduct crew salaries for a given number of ticks.
 * Marks crew as unpaid if insufficient credits.
 */
export function deductCrewSalaries(ship: Ship, numTicks: number): void {
  // Calculate total salary per tick
  let totalSalaryPerTick = 0;
  for (const crew of ship.crew) {
    const roleDef = getCrewRoleDefinition(crew.role);
    if (roleDef) {
      totalSalaryPerTick += roleDef.salary;
    }
  }

  if (totalSalaryPerTick === 0) return;

  const totalSalary = totalSalaryPerTick * numTicks;

  if (ship.credits >= totalSalary) {
    // Can afford full salaries
    ship.credits -= totalSalary;
  } else {
    // Cannot afford full salaries - mark crew as unpaid
    const availableCredits = ship.credits;
    ship.credits = 0;

    // Calculate how many ticks we can afford to pay
    const ticksWeCanPay = Math.floor(availableCredits / totalSalaryPerTick);
    const ticksUnpaid = numTicks - ticksWeCanPay;

    if (ticksUnpaid > 0) {
      // Sort crew by salary (most expensive first) to pay cheaper roles first
      const crewBySalary = [...ship.crew].sort((a, b) => {
        const salaryA = getCrewRoleDefinition(a.role)?.salary || 0;
        const salaryB = getCrewRoleDefinition(b.role)?.salary || 0;
        return salaryB - salaryA;
      });

      // For the unpaid ticks, determine which crew goes unpaid
      const budgetPerTick = availableCredits / Math.max(1, ticksWeCanPay);

      for (const crew of crewBySalary) {
        const salary = getCrewRoleDefinition(crew.role)?.salary || 0;
        if (salary > 0) {
          // If this crew's salary exceeds our per-tick budget, they go unpaid for unpaid ticks
          if (salary > budgetPerTick || ticksWeCanPay === 0) {
            crew.unpaidTicks += ticksUnpaid;
          }
        }
      }
    }
  }
}

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

      // TORCH SHIP MECHANICS (Class III+)
      if (ship.engine.state === 'online') {
        // === RADIATION EXPOSURE ===
        const engineRadiation = engineDef.radiationOutput || 0;

        // Calculate total shielding from equipment
        let totalShielding = 0;
        for (const eq of ship.equipment) {
          const eqDef = getEquipmentDefinition(eq.definitionId);
          if (eqDef?.radiationShielding) {
            // Degraded equipment provides less shielding
            const effectiveness = 1 - eq.degradation / 200; // 0% degradation = 1.0, 100% = 0.5
            totalShielding += eqDef.radiationShielding * effectiveness;
          }
        }

        const netRadiation = Math.max(0, engineRadiation - totalShielding);

        // Apply radiation damage to crew (if net radiation > 0)
        if (netRadiation > 0) {
          const radiationDamagePerTick = netRadiation / 10;

          for (const crew of ship.crew) {
            // Check if crew is in medbay (medics can reduce radiation effects)
            const medbay = ship.rooms.find((r) => r.type === 'medbay');
            const isInMedbay = medbay?.assignedCrewIds.includes(crew.id);

            let damage = radiationDamagePerTick;

            // Medbay reduces radiation damage by 50%
            if (isInMedbay && medbay?.state === 'operational') {
              damage *= 0.5;
            }

            crew.health = Math.max(0, crew.health - damage);
            changed = true;
          }
        }

        // === WASTE HEAT MANAGEMENT ===
        const engineHeat = engineDef.wasteHeatOutput || 0;

        // Calculate total heat dissipation from equipment
        let totalHeatDissipation = 0;
        for (const eq of ship.equipment) {
          const eqDef = getEquipmentDefinition(eq.definitionId);
          if (eqDef?.heatDissipation) {
            // Degraded equipment provides less cooling
            const effectiveness = 1 - eq.degradation / 200;
            totalHeatDissipation += eqDef.heatDissipation * effectiveness;
          }
        }

        const excessHeat = Math.max(0, engineHeat - totalHeatDissipation);

        // Excess heat accelerates ALL equipment degradation
        if (excessHeat > 0) {
          const heatDegradationMultiplier = 1 + excessHeat / 100; // +1% per kW excess heat

          for (const eq of ship.equipment) {
            const eqDef = getEquipmentDefinition(eq.definitionId);
            if (eqDef?.hasDegradation && eq.degradation < 100) {
              const baseDegradation = 0.05; // Base rate
              const heatDegradation =
                baseDegradation * heatDegradationMultiplier;
              eq.degradation = Math.min(100, eq.degradation + heatDegradation);
              changed = true;
            }
          }
        }

        // === CONTAINMENT STABILITY ===
        // Check if reactor room is staffed (for fusion engines)
        const reactorRoom = ship.rooms.find((r) => r.type === 'reactor_room');
        const reactorRoomStaffed =
          reactorRoom &&
          reactorRoom.state === 'operational' &&
          reactorRoom.assignedCrewIds.length > 0;

        // Check if mag_confinement equipment exists
        const confinementEq = ship.equipment.find(
          (eq) => eq.definitionId === 'mag_confinement'
        );

        if (confinementEq && engineDef.containmentComplexity > 0) {
          // Confinement degrades faster if reactor room unstaffed
          let confinementDegradationRate = 0.1; // Base rate

          if (!reactorRoomStaffed) {
            confinementDegradationRate *= 3; // 3x degradation if unstaffed
          }

          confinementEq.degradation = Math.min(
            100,
            confinementEq.degradation + confinementDegradationRate
          );
          changed = true;

          // If confinement is degraded, radiation spikes
          if (confinementEq.degradation > 30) {
            const spikeMultiplier = 1 + confinementEq.degradation / 50; // Up to 3x at 100% degradation
            const spikeRadiation = (netRadiation * (spikeMultiplier - 1)) / 10;

            // Additional radiation damage to all crew
            for (const crew of ship.crew) {
              crew.health = Math.max(0, crew.health - spikeRadiation);
              changed = true;
            }
          }
        }
      }

      // Crew salary deduction (only during flight)
      deductCrewSalaries(ship, 1);

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

  // 4. Gravity exposure (during flight)
  if (ship.location.status === 'in_flight') {
    // Store previous exposure values to detect threshold crossings
    const previousExposures = new Map<string, number>();
    for (const crew of ship.crew) {
      previousExposures.set(crew.id, crew.zeroGExposure);
    }

    // Apply gravity tick
    applyGravityTick(gameData);

    // Check for threshold crossings and generate log entries
    for (const crew of ship.crew) {
      const previousExposure = previousExposures.get(crew.id) || 0;
      const newLevel = checkThresholdCrossing(crew, previousExposure);

      if (newLevel && newLevel !== 'none') {
        const description = getDegradationDescription(newLevel);

        let message = '';
        if (newLevel === 'minor') {
          message = `${crew.name} showing signs of zero-g atrophy. ${description}.`;
        } else if (newLevel === 'moderate') {
          message = `Warning: ${crew.name} entering moderate zero-g degradation. ${description}.`;
        } else if (newLevel === 'severe') {
          message = `Alert: ${crew.name} suffering severe zero-g atrophy. ${description}.`;
        } else if (newLevel === 'critical') {
          message = `Critical: ${crew.name} in critical zero-g atrophy. ${description}.`;
        }

        gameData.log.push({
          gameTime: gameData.gameTime,
          type: 'gravity_warning',
          message,
        });
      }
    }

    changed = true;
  }

  return changed;
}
