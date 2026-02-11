import type { GameData, Ship, EncounterResult, Toast } from './models';
import { getEngineDefinition } from './engines';
import {
  advanceFlight,
  calculateBurnSecondsInTick,
  calculateFuelFlowRate,
  getSpecificImpulse,
} from './flightPhysics';
import { completeLeg } from './contractExec';
import { GAME_SECONDS_PER_TICK } from './timeSystem';
import { getCrewSalaryPerTick } from './crewRoles';
import {
  getEquipmentDefinition,
  getEffectiveRadiationShielding,
  getEffectiveHeatDissipation,
} from './equipment';
import { calculateRepairPoints } from './crewRoles';
import {
  applyGravityTick,
  applyGravityRecovery,
  checkThresholdCrossing,
  getDegradationDescription,
  getDegradationLevelName,
} from './gravitySystem';
import { calculateEncounterChance } from './encounterSystem';
import { applyPassiveTraining, logSkillUps } from './skillProgression';
import { getCommandTrainingMultiplier } from './captainBonus';
import { getCrewForJobType, isRoomStaffed, getCrewJobSlot } from './jobSlots';
import { applyOxygenTick, getOxygenHealthDamage } from './lifeSupportSystem';
import { applyMiningTick } from './miningSystem';
import { checkMiningRouteDeparture } from './miningRoute';
import { addLog } from './logSystem';

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
 * Tracks whether a radiation spike log has been emitted for a ship this tick batch.
 * Prevents log spam — only logs once when containment first crosses 30%.
 */
const _radiationSpikeLoggedShips: Record<string, boolean> = {};

/** Accumulated radiation spike toasts from the last tick batch. */
let _radiationToasts: Toast[] = [];

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
 * Get and clear accumulated radiation toasts from the last tick batch.
 */
export function drainRadiationToasts(): Toast[] {
  const toasts = _radiationToasts;
  _radiationToasts = [];
  return toasts;
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
      const crewSalary = getCrewSalaryPerTick(crew);
      shipSalaryPerTick += crewSalary;
      totalFleetSalaryPerTick += crewSalary;
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
          const salary = getCrewSalaryPerTick(crew);
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

  // Engine warmup progress (independent of ship location)
  if (ship.engine.state === 'warming_up') {
    const warmupEngineDef = getEngineDefinition(ship.engine.definitionId);
    ship.engine.warmupProgress = Math.min(
      100,
      ship.engine.warmupProgress + warmupEngineDef.warmupRate
    );
    if (ship.engine.warmupProgress >= 100) {
      ship.engine.state = 'online';
      ship.engine.warmupProgress = 100;
    }
    changed = true;
  }

  if (ship.location.status === 'in_flight') {
    const engineDef = getEngineDefinition(ship.engine.definitionId);

    // Flight physics (only advance when engine is online)
    if (ship.activeFlightPlan && ship.engine.state === 'online') {
      const flightComplete = advanceFlight(ship.activeFlightPlan);

      // Fuel consumption during burn phases (mass-based, pro-rated)
      // Burns are pro-rated to the actual seconds spent accelerating/decelerating
      // within this tick, so phase transitions mid-tick don't over- or under-charge.
      if (ship.engine.state === 'online') {
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
        const totalShielding = getEffectiveRadiationShielding(ship);
        const netRadiation = Math.max(0, engineRadiation - totalShielding);

        if (netRadiation > 0) {
          // Log once when radiation first starts damaging crew
          const radLogKey = `${ship.id}-rad-exposure`;
          if (!_radiationSpikeLoggedShips[radLogKey]) {
            _radiationSpikeLoggedShips[radLogKey] = true;
            addLog(
              gameData.log,
              gameData.gameTime,
              'radiation_warning',
              `${ship.name}: Shielding insufficient — crew taking ${netRadiation.toFixed(0)} rad/cycle radiation exposure.`,
              ship.name
            );
          }

          const radiationDamagePerTick = netRadiation / 100;

          for (const crew of ship.crew) {
            // Check if crew is a patient in medbay (via job slot)
            const crewJob = getCrewJobSlot(ship, crew.id);
            const isPatient = crewJob?.type === 'patient';
            const medbay = ship.rooms.find((r) => r.type === 'medbay');

            let damage = radiationDamagePerTick;

            if (isPatient && medbay?.state === 'operational') {
              damage *= 0.5;
            }

            crew.health = Math.max(0, crew.health - damage);
            changed = true;
          }
        } else {
          // Clear exposure log flag when shielding catches up
          delete _radiationSpikeLoggedShips[`${ship.id}-rad-exposure`];
        }

        // === WASTE HEAT MANAGEMENT ===
        const engineHeat = engineDef.wasteHeatOutput || 0;
        const totalHeatDissipation = getEffectiveHeatDissipation(ship);
        const excessHeat = Math.max(0, engineHeat - totalHeatDissipation);

        if (excessHeat > 0) {
          const heatDegradationMultiplier = 1 + excessHeat / 100;

          for (const eq of ship.equipment) {
            const eqDef = getEquipmentDefinition(eq.definitionId);
            if (eqDef?.hasDegradation && eq.degradation < 100) {
              const baseDegradation = 0.005;
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
          isRoomStaffed(ship, reactorRoom.id);

        const confinementEq = ship.equipment.find(
          (eq) => eq.definitionId === 'mag_confinement'
        );

        if (confinementEq && engineDef.containmentComplexity > 0) {
          const prevDegradation = confinementEq.degradation;
          let confinementDegradationRate = 0.01;

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

            // Log warnings at containment degradation thresholds
            const thresholds = [30, 50, 70] as const;
            for (const threshold of thresholds) {
              if (
                confinementEq.degradation > threshold &&
                prevDegradation <= threshold
              ) {
                const spikeKey = `${ship.id}-${threshold}`;
                if (!_radiationSpikeLoggedShips[spikeKey]) {
                  _radiationSpikeLoggedShips[spikeKey] = true;

                  const severity =
                    threshold >= 70
                      ? 'Critical'
                      : threshold >= 50
                        ? 'Warning'
                        : 'Caution';
                  const message =
                    threshold >= 70
                      ? `${severity}: ${ship.name} containment integrity critical (${(100 - confinementEq.degradation).toFixed(0)}%)! Severe radiation spikes damaging crew.`
                      : threshold >= 50
                        ? `${severity}: ${ship.name} containment degrading (${(100 - confinementEq.degradation).toFixed(0)}% integrity). Radiation spikes intensifying.`
                        : `${severity}: ${ship.name} containment breach detected (${(100 - confinementEq.degradation).toFixed(0)}% integrity). Radiation spikes beginning.`;

                  addLog(
                    gameData.log,
                    gameData.gameTime,
                    'radiation_warning',
                    message,
                    ship.name
                  );

                  if (!_isCatchUp) {
                    _radiationToasts.push({
                      id: `rad-spike-${Date.now()}-${ship.id}-${threshold}`,
                      type: 'radiation_spike',
                      message:
                        threshold >= 70
                          ? `${ship.name}: Containment critical! Radiation spikes severe.`
                          : threshold >= 50
                            ? `${ship.name}: Containment failing. Radiation spikes increasing.`
                            : `${ship.name}: Containment breach! Radiation spikes detected.`,
                      expiresAt: Date.now() + 5000,
                    });
                  }
                }
              }
            }
          } else {
            // Clear spike log flags when containment recovers below 30%
            for (const threshold of [30, 50, 70]) {
              delete _radiationSpikeLoggedShips[`${ship.id}-${threshold}`];
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
        equipment.degradation = Math.min(100, equipment.degradation + 0.005);
        changed = true;
      }
    }
  }

  // Oxygen system (life support)
  if (applyOxygenTick(ship)) {
    changed = true;
  }

  // Oxygen health effects
  const o2Damage = getOxygenHealthDamage(ship.oxygenLevel);
  if (o2Damage > 0) {
    for (const crew of ship.crew) {
      crew.health = Math.max(0, crew.health - o2Damage);
    }
    changed = true;

    // Log warnings at critical thresholds
    if (ship.oxygenLevel < 10 && ship.oxygenLevel + 0.5 >= 10) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'gravity_warning',
        `Critical: ${ship.name} oxygen levels critical! Crew health deteriorating rapidly.`,
        ship.name
      );
    } else if (ship.oxygenLevel < 25 && ship.oxygenLevel + 0.5 >= 25) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'gravity_warning',
        `Warning: ${ship.name} oxygen levels dangerously low. Crew suffering hypoxia.`,
        ship.name
      );
    } else if (ship.oxygenLevel < 50 && ship.oxygenLevel + 0.5 >= 50) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'gravity_warning',
        `${ship.name} oxygen levels declining. Life support struggling.`,
        ship.name
      );
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

        addLog(
          gameData.log,
          gameData.gameTime,
          'gravity_warning',
          message,
          ship.name
        );
      }
    }

    // Passive skill training (during flight)
    // Captain's ship trains 1.5×; ships near captain get aura training bonus
    const trainingMultiplier = getCommandTrainingMultiplier(ship, gameData);
    const skillUps = applyPassiveTraining(ship, trainingMultiplier);
    if (skillUps.length > 0) {
      logSkillUps(gameData.log, gameData.gameTime, ship.name, skillUps);
    }

    // === PASSIVE JOB SLOT EFFECTS ===

    // Patient: health regeneration (2 HP/tick when in operational medbay)
    for (const slot of ship.jobSlots) {
      if (slot.type === 'patient' && slot.assignedCrewId) {
        const medbay = slot.sourceRoomId
          ? ship.rooms.find((r) => r.id === slot.sourceRoomId)
          : null;
        if (medbay?.state === 'operational') {
          const crew = ship.crew.find((c) => c.id === slot.assignedCrewId);
          if (crew && crew.health < 100) {
            crew.health = Math.min(100, crew.health + 2);
          }
        }
      }
    }

    // Repair: crew in repair slots generates repair points distributed to degraded equipment
    const repairCrew = getCrewForJobType(ship, 'repair');
    if (repairCrew.length > 0) {
      let totalRepairPoints = 0;
      for (const eng of repairCrew) {
        totalRepairPoints += calculateRepairPoints(eng);
      }

      // Distribute repair points equally across degraded equipment
      const degradedEquipment = ship.equipment.filter(
        (eq) => eq.degradation > 0
      );
      if (degradedEquipment.length > 0 && totalRepairPoints > 0) {
        const pointsPerEquipment = totalRepairPoints / degradedEquipment.length;
        for (const eq of degradedEquipment) {
          eq.degradation = Math.max(0, eq.degradation - pointsPerEquipment);
        }
      }
    }

    // === MINING ===
    // Extract ore when orbiting a mine-enabled location
    if (ship.location.status === 'orbiting' && ship.location.orbitingAt) {
      const mineLocation = gameData.world.locations.find(
        (l) => l.id === ship.location.orbitingAt
      );
      if (mineLocation) {
        const miningResult = applyMiningTick(ship, mineLocation);
        if (miningResult) {
          // Log ore extraction (batch: only log when units are actually extracted)
          for (const [oreId, qty] of Object.entries(
            miningResult.oreExtracted
          )) {
            if (qty > 0) {
              addLog(
                gameData.log,
                gameData.gameTime,
                'ore_mined',
                `${ship.name} extracted ${qty} ${oreId.replace(/_/g, ' ')}`,
                ship.name
              );
            }
          }

          // Log mastery level-ups
          for (const lu of miningResult.masteryLevelUps) {
            addLog(
              gameData.log,
              gameData.gameTime,
              'crew_level_up',
              `${lu.crewName}'s ${lu.oreName} mastery reached level ${lu.newLevel}`,
              ship.name
            );
          }

          // Log cargo full warning (once per full-empty cycle)
          if (miningResult.cargoFull) {
            const wasLogging = ship.miningAccumulator?._cargoFullLogged;
            if (!wasLogging) {
              addLog(
                gameData.log,
                gameData.gameTime,
                'cargo_full',
                `${ship.name} cargo hold is full. Mining paused.`,
                ship.name
              );
              if (!ship.miningAccumulator) ship.miningAccumulator = {};
              ship.miningAccumulator['_cargoFullLogged'] = 1;
            }

            // Mining route: auto-depart to sell station when cargo full
            checkMiningRouteDeparture(gameData, ship);
          } else {
            // Clear the flag when cargo has space again
            if (ship.miningAccumulator?._cargoFullLogged) {
              delete ship.miningAccumulator['_cargoFullLogged'];
            }
          }
        }
      }
    }

    changed = true;
  }

  // Gravity recovery (while docked)
  if (ship.location.status === 'docked') {
    const previousExposures = new Map<string, number>();
    for (const crew of ship.crew) {
      previousExposures.set(crew.id, crew.zeroGExposure);
    }

    applyGravityRecovery(ship, GAME_SECONDS_PER_TICK);

    for (const crew of ship.crew) {
      const previousExposure = previousExposures.get(crew.id) || 0;
      const newLevel = checkThresholdCrossing(crew, previousExposure);

      if (newLevel !== null && previousExposure > crew.zeroGExposure) {
        const message =
          newLevel === 'none'
            ? `${crew.name} has fully recovered from zero-g atrophy.`
            : `${crew.name} has recovered to ${getDegradationLevelName(newLevel)} zero-g atrophy.`;

        addLog(
          gameData.log,
          gameData.gameTime,
          'gravity_warning',
          message,
          ship.name
        );
        changed = true;
      }
    }

    if (ship.crew.some((c) => c.zeroGExposure > 0)) {
      changed = true;
    }
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
