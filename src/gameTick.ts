import type { GameData, Ship, EncounterResult } from './models';
import { getEngineDefinition } from './engines';
import {
  advanceFlight,
  calculateBurnSecondsInTick,
  calculateFuelFlowRate,
  getSpecificImpulse,
} from './flightPhysics';
import { completeLeg } from './contractExec';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { getCrewRoleDefinition } from './crewRoles';
import { getEquipmentDefinition } from './equipment';
import {
  applyGravityTick,
  checkThresholdCrossing,
  getDegradationDescription,
} from './gravitySystem';
import { calculateEncounterChance } from './encounterSystem';
import { applyPassiveXP, logLevelUps } from './skillProgression';

/**
 * Encounter system hook.
 * The combat system (Task #6) registers its resolver here.
 * This avoids circular dependencies between gameTick and combatSystem.
 */
export type EncounterResolver = (
  ship: Ship,
  gameData: GameData,
  isCatchUp: boolean
) => EncounterResult | null;

let _encounterResolver: EncounterResolver | null = null;
let _isCatchUp = false;
let _encounterResults: EncounterResult[] = [];

/**
 * Register the combat system's encounter resolver.
 * Called once at startup by the combat system module.
 */
export function setEncounterResolver(resolver: EncounterResolver): void {
  _encounterResolver = resolver;
}

/**
 * Get and clear accumulated encounter results from the last tick batch.
 * Used by fast-forward to build catch-up reports.
 */
export function drainEncounterResults(): EncounterResult[] {
  const results = _encounterResults;
  _encounterResults = [];
  return results;
}

/**
 * Deduct crew salaries for all ships from the shared wallet.
 * Marks crew as unpaid if insufficient credits.
 * Tracks per-ship crew costs in ship metrics.
 */
export function deductFleetSalaries(
  gameData: GameData,
  numTicks: number
): void {
  // Calculate total fleet salary per tick and per-ship costs
  let totalFleetSalaryPerTick = 0;
  const shipSalaries = new Map<string, number>();

  for (const ship of gameData.ships) {
    let shipSalaryPerTick = 0;
    for (const crew of ship.crew) {
      const roleDef = getCrewRoleDefinition(crew.role);
      if (roleDef) {
        shipSalaryPerTick += roleDef.salary;
        totalFleetSalaryPerTick += roleDef.salary;
      }
    }
    shipSalaries.set(ship.id, shipSalaryPerTick);
  }

  if (totalFleetSalaryPerTick === 0) return;

  const totalSalary = totalFleetSalaryPerTick * numTicks;

  if (gameData.credits >= totalSalary) {
    gameData.credits -= totalSalary;

    // Track per-ship crew costs
    for (const ship of gameData.ships) {
      const shipSalary = shipSalaries.get(ship.id) || 0;
      ship.metrics.crewCostsPaid += shipSalary * numTicks;
    }
  } else {
    const availableCredits = gameData.credits;
    gameData.credits = 0;

    const ticksWeCanPay = Math.floor(
      availableCredits / totalFleetSalaryPerTick
    );
    const ticksUnpaid = numTicks - ticksWeCanPay;

    // Track paid portion per ship
    for (const ship of gameData.ships) {
      const shipSalary = shipSalaries.get(ship.id) || 0;
      ship.metrics.crewCostsPaid += shipSalary * ticksWeCanPay;
    }

    if (ticksUnpaid > 0) {
      // Mark crew as unpaid across all ships (most expensive first)
      const allCrew: { crew: import('./models').CrewMember; salary: number }[] =
        [];
      for (const ship of gameData.ships) {
        for (const crew of ship.crew) {
          const salary = getCrewRoleDefinition(crew.role)?.salary || 0;
          if (salary > 0) {
            allCrew.push({ crew, salary });
          }
        }
      }

      allCrew.sort((a, b) => b.salary - a.salary);

      const budgetPerTick = availableCredits / Math.max(1, ticksWeCanPay);

      for (const { crew, salary } of allCrew) {
        if (salary > budgetPerTick || ticksWeCanPay === 0) {
          crew.unpaidTicks += ticksUnpaid;
        }
      }
    }
  }
}

/**
 * Apply one tick of game logic for a single ship
 */
function applyShipTick(gameData: GameData, ship: Ship): boolean {
  let changed = false;

  // Track flight vs idle time
  if (ship.location.status === 'in_flight') {
    ship.metrics.totalFlightTicks++;
  } else if (
    ship.location.status === 'docked' ||
    ship.location.status === 'orbiting'
  ) {
    ship.metrics.totalIdleTicks++;
  }

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
      if (ship.engine.warmupProgress >= 100) {
        ship.engine.state = 'online';
        ship.engine.warmupProgress = 100;
      }
      changed = true;
    }

    // 2. Flight physics (only advance when engine is online)
    if (ship.activeFlightPlan && ship.engine.state === 'online') {
      const flightComplete = advanceFlight(ship.activeFlightPlan);

      // Fuel consumption during burn phases (mass-based, pro-rated)
      // Burns are pro-rated to the actual seconds spent accelerating/decelerating
      // within this tick, so phase transitions mid-tick don't over- or under-charge.
      if (ship.engine.state === 'online' && engineRoomStaffed) {
        const burnSeconds = calculateBurnSecondsInTick(
          ship.activeFlightPlan,
          GAME_SECONDS_PER_TICK
        );
        if (burnSeconds > 0) {
          const specificImpulse = getSpecificImpulse(engineDef);
          const fuelFlowRateKgPerSec = calculateFuelFlowRate(
            engineDef.thrust,
            specificImpulse
          );
          const fuelConsumedKg = fuelFlowRateKgPerSec * burnSeconds;
          ship.fuelKg = Math.max(0, ship.fuelKg - fuelConsumedKg);
        }
      }

      changed = true;

      // === ENCOUNTER CHECK ===
      // Runs after flight physics (position/velocity are current)
      // and before torch mechanics (boarding damage affects equipment cascade)
      if (!flightComplete) {
        const encounterChance = calculateEncounterChance(ship, gameData);
        if (encounterChance > 0 && Math.random() < encounterChance) {
          // Encounter triggered — resolve via combat system
          // The resolveEncounter function is injected via the optional callback
          // to avoid circular dependency. If no resolver is set, the encounter
          // is detected but not resolved (Task #6 will wire this up).
          if (_encounterResolver) {
            const result = _encounterResolver(ship, gameData, _isCatchUp);
            if (result) {
              _encounterResults.push(result);
            }
          }
          changed = true;
        }
      }

      // TORCH SHIP MECHANICS
      if (ship.engine.state === 'online') {
        // === RADIATION EXPOSURE ===
        const engineRadiation = engineDef.radiationOutput || 0;

        let totalShielding = 0;
        for (const eq of ship.equipment) {
          const eqDef = getEquipmentDefinition(eq.definitionId);
          if (eqDef?.radiationShielding) {
            const effectiveness = 1 - eq.degradation / 200;
            totalShielding += eqDef.radiationShielding * effectiveness;
          }
        }

        const netRadiation = Math.max(0, engineRadiation - totalShielding);

        if (netRadiation > 0) {
          const radiationDamagePerTick = netRadiation / 10;

          for (const crew of ship.crew) {
            const medbay = ship.rooms.find((r) => r.type === 'medbay');
            const isInMedbay = medbay?.assignedCrewIds.includes(crew.id);

            let damage = radiationDamagePerTick;

            if (isInMedbay && medbay?.state === 'operational') {
              damage *= 0.5;
            }

            crew.health = Math.max(0, crew.health - damage);
            changed = true;
          }
        }

        // === WASTE HEAT MANAGEMENT ===
        const engineHeat = engineDef.wasteHeatOutput || 0;

        let totalHeatDissipation = 0;
        for (const eq of ship.equipment) {
          const eqDef = getEquipmentDefinition(eq.definitionId);
          if (eqDef?.heatDissipation) {
            const effectiveness = 1 - eq.degradation / 200;
            totalHeatDissipation += eqDef.heatDissipation * effectiveness;
          }
        }

        const excessHeat = Math.max(0, engineHeat - totalHeatDissipation);

        if (excessHeat > 0) {
          const heatDegradationMultiplier = 1 + excessHeat / 100;

          for (const eq of ship.equipment) {
            const eqDef = getEquipmentDefinition(eq.definitionId);
            if (eqDef?.hasDegradation && eq.degradation < 100) {
              const baseDegradation = 0.05;
              const heatDegradation =
                baseDegradation * heatDegradationMultiplier;
              eq.degradation = Math.min(100, eq.degradation + heatDegradation);
              changed = true;
            }
          }
        }

        // === CONTAINMENT STABILITY ===
        const reactorRoom = ship.rooms.find((r) => r.type === 'reactor_room');
        const reactorRoomStaffed =
          reactorRoom &&
          reactorRoom.state === 'operational' &&
          reactorRoom.assignedCrewIds.length > 0;

        const confinementEq = ship.equipment.find(
          (eq) => eq.definitionId === 'mag_confinement'
        );

        if (confinementEq && engineDef.containmentComplexity > 0) {
          let confinementDegradationRate = 0.1;

          if (!reactorRoomStaffed) {
            confinementDegradationRate *= 3;
          }

          confinementEq.degradation = Math.min(
            100,
            confinementEq.degradation + confinementDegradationRate
          );
          changed = true;

          if (confinementEq.degradation > 30) {
            const spikeMultiplier = 1 + confinementEq.degradation / 50;
            const spikeRadiation = (netRadiation * (spikeMultiplier - 1)) / 10;

            for (const crew of ship.crew) {
              crew.health = Math.max(0, crew.health - spikeRadiation);
              changed = true;
            }
          }
        }
      }

      // Handle flight completion
      if (flightComplete) {
        completeLeg(gameData, ship);
      }
    }
  }

  // Air filter degradation (always happens)
  for (const equipment of ship.equipment) {
    if (equipment.definitionId === 'air_filters') {
      if (equipment.degradation < 100) {
        equipment.degradation = Math.min(100, equipment.degradation + 0.05);
        changed = true;
      }
    }
  }

  // Gravity exposure (during flight and orbiting)
  if (
    ship.location.status === 'in_flight' ||
    ship.location.status === 'orbiting'
  ) {
    const previousExposures = new Map<string, number>();
    for (const crew of ship.crew) {
      previousExposures.set(crew.id, crew.zeroGExposure);
    }

    applyGravityTick(ship);

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
          shipName: ship.name,
        });
      }
    }

    // Passive skill XP (during flight)
    const levelUps = applyPassiveXP(ship);
    if (levelUps.length > 0) {
      logLevelUps(gameData.log, gameData.gameTime, ship.name, levelUps);
    }

    changed = true;
  }

  return changed;
}

export function applyTick(
  gameData: GameData,
  isCatchUp: boolean = false
): boolean {
  _isCatchUp = isCatchUp;
  let changed = false;

  // Advance game time once per tick (global time system)
  gameData.gameTime += GAME_SECONDS_PER_TICK;

  // Apply per-ship tick logic
  for (const ship of gameData.ships) {
    if (applyShipTick(gameData, ship)) {
      changed = true;
    }
  }

  // Fleet-wide salary deduction (global time system)
  deductFleetSalaries(gameData, 1);

  return changed;
}
