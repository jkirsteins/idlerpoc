import type {
  GameData,
  Ship,
  EncounterResult,
  Toast,
  JobSlotType,
} from './models';
import { getFinancials } from './models';
import { getEngineDefinition } from './engines';
import {
  advanceFlight,
  calculateBurnSecondsInTick,
  calculateFuelFlowRate,
  calculateOneLegFuelKg,
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
import { calculateRepairPoints, getBestCrewMember } from './crewRoles';
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
import {
  applyProvisionsTick,
  getCrewHealthEfficiency,
} from './provisionsSystem';
import {
  processCrewDeaths,
  recordCrewDamage,
  getLastDamageSource,
} from './crewDeath';
import { checkStrandedShips } from './strandedSystem';
import { applyMiningTick } from './miningSystem';
import {
  checkMiningRouteDeparture,
  checkMiningRouteProvisionsReturn,
  retryMiningRouteDeparture,
} from './miningRoute';
import { addLog } from './logSystem';
import { emit } from './gameEvents';
import { updateWorldPositions, lerpVec2 } from './orbitalMechanics';
import { resolveGravityAssist } from './gravityAssistSystem';
import { formatMass, formatCredits } from './formatting';
import {
  awardMasteryXp,
  getEquipmentRepairMasteryBonus,
  getRepairsPoolSpeedBonus,
  getRepairsPoolFilterReduction,
  getRepairsPoolBonusChance,
  gravityAssistMasteryKey,
  GRAVITY_ASSIST_MASTERY_XP_SUCCESS,
  GRAVITY_ASSIST_MASTERY_XP_FAILURE,
  getPilotingPoolWarmupBonus,
  getPilotingPoolFuelBonus,
  getCommercePoolSalaryReduction,
} from './masterySystem';
import { countPilotingMasteryItems } from './contractExec';
import { getAllEquipmentDefinitions } from './equipment';
import { getBestCrewPool } from './crewRoles';
import { detectArcs, shouldRunArcScan } from './arcDetector';
import { computePowerStatus } from './powerSystem';
import { applyPowerManagement } from './powerManagement';

/**
 * Determine which job slot types should NOT train passively given the
 * ship's current activity state.  Mining ops, for example, only trains
 * when orbiting a mine-enabled location.
 */
function getInactiveTrainingJobTypes(
  ship: Ship,
  gameData: GameData
): ReadonlySet<JobSlotType> {
  const inactive = new Set<JobSlotType>();

  const isAtMine =
    ship.location.status === 'orbiting' &&
    ship.location.orbitingAt != null &&
    gameData.world.locations.some(
      (l) => l.id === ship.location.orbitingAt && l.services.includes('mine')
    );
  if (!isAtMine) {
    inactive.add('mining_ops');
  }

  return inactive;
}

/**
 * Update a flight's ship position along its planned trajectory.
 *
 * The trajectory (originPos → interceptPos) is frozen at flight initialization
 * and represents the straight-line path the ship follows in heliocentric space.
 * This function interpolates the ship's current position along that fixed path
 * based on flight progress.
 *
 * We do NOT update originPos/interceptPos every tick — that would cause the
 * trajectory to constantly shift as bodies move, making the ship appear to
 * follow the wrong path. The ship commits to a ballistic trajectory at launch
 * and follows it to completion.
 */
function updateFlightPosition(fp: import('./models').FlightState): void {
  if (fp.totalDistance <= 0) return;

  // Use the planned trajectory endpoints stored at flight initialization
  if (!fp.originPos || !fp.interceptPos) return;

  const progress = Math.min(1, fp.distanceCovered / fp.totalDistance);

  // Interpolate ship position along the fixed trajectory
  fp.shipPos = lerpVec2(fp.originPos, fp.interceptPos, progress);
}

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
    }

    // Commerce pool 25% checkpoint: -5% salary costs
    const commercePool = getBestCrewPool(ship.crew, 'commerce');
    shipSalaryPerTick *= 1 - getCommercePoolSalaryReduction(commercePool);

    totalFleetSalaryPerTick += shipSalaryPerTick;
    shipSalaries.set(ship.id, shipSalaryPerTick);
  }

  if (totalFleetSalaryPerTick === 0) return;

  const totalSalary = totalFleetSalaryPerTick * numTicks;

  if (gameData.credits >= totalSalary) {
    gameData.credits -= totalSalary;
    getFinancials(gameData).expenseCrewSalaries += totalSalary;

    // Track per-ship crew costs and log salary payments
    for (const ship of gameData.ships) {
      const shipSalary = shipSalaries.get(ship.id) || 0;
      if (shipSalary > 0) {
        const totalPaid = shipSalary * numTicks;
        ship.metrics.crewCostsPaid += totalPaid;

        // Log salary payment
        const crewCount = ship.crew.filter(
          (c) => getCrewSalaryPerTick(c) > 0
        ).length;
        addLog(
          gameData.log,
          gameData.gameTime,
          'salary_paid',
          `Paid salaries to ${crewCount} crew on ${ship.name}: ${formatCredits(totalPaid)}`,
          ship.name
        );
      }
    }
  } else {
    const availableCredits = gameData.credits;
    gameData.credits = 0;

    const ticksWeCanPay = Math.floor(
      availableCredits / totalFleetSalaryPerTick
    );
    const ticksUnpaid = numTicks - ticksWeCanPay;

    // Track paid portion per ship and log partial payments
    for (const ship of gameData.ships) {
      const shipSalary = shipSalaries.get(ship.id) || 0;
      if (shipSalary > 0 && ticksWeCanPay > 0) {
        const totalPaid = shipSalary * ticksWeCanPay;
        ship.metrics.crewCostsPaid += totalPaid;

        // Log partial salary payment
        const crewCount = ship.crew.filter(
          (c) => getCrewSalaryPerTick(c) > 0
        ).length;
        addLog(
          gameData.log,
          gameData.gameTime,
          'salary_paid',
          `Partially paid salaries to ${crewCount} crew on ${ship.name}: ${formatCredits(totalPaid)} (insufficient credits)`,
          ship.name
        );
      }
    }

    if (ticksUnpaid > 0) {
      // All credits were exhausted during ticksWeCanPay — during the
      // remaining ticksUnpaid, every salaried crew member goes unpaid.
      for (const ship of gameData.ships) {
        for (const crew of ship.crew) {
          if (getCrewSalaryPerTick(crew) > 0) {
            crew.unpaidTicks += ticksUnpaid;
          }
        }
      }
    }
  }
}

/**
 * Heal all crew using medical equipment (when powered).
 * Medical equipment provides automatic health regeneration to all crew members.
 */
function applyMedbayHealing(ship: Ship): boolean {
  const powerStatus = computePowerStatus(ship);
  const hasPower = powerStatus.totalOutput > 0;

  if (!hasPower) return false;

  let totalHealthRegen = 0;

  // Sum up health regen from all medical equipment
  for (const eq of ship.equipment) {
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (eqDef?.healthRegenPerTick && eqDef.healthRegenPerTick > 0) {
      // Degradation reduces effectiveness
      const effectiveness = eqDef.hasDegradation ? 1 - eq.degradation / 100 : 1;
      totalHealthRegen += eqDef.healthRegenPerTick * effectiveness;
    }
  }

  if (totalHealthRegen <= 0) return false;

  // Apply healing to all crew members
  let healed = false;
  for (const crew of ship.crew) {
    if (crew.health < 100) {
      crew.health = Math.min(100, crew.health + totalHealthRegen);
      healed = true;
    }
  }

  return healed;
}

/**
 * Apply one tick of game logic for a single ship
 */
/**
 * Check and resolve gravity assist opportunities when the ship reaches
 * the approach point. Returns true if any assists were resolved.
 */
function checkGravityAssists(ship: Ship, gameData: GameData): boolean {
  const flight = ship.activeFlightPlan;
  if (!flight || !flight.gravityAssists) return false;

  const progress = flight.distanceCovered / flight.totalDistance;
  let resolved = false;

  // Compute trip fuel cost once for all assists (avoids re-importing flightPhysics in gravityAssistSystem)
  const tripDistanceKm = flight.totalDistance / 1000;
  const tripFuelKg = calculateOneLegFuelKg(
    ship,
    tripDistanceKm,
    flight.burnFraction
  );

  // NOTE: The catch-up report builder (catchUpReportBuilder.ts) parses these
  // gravity_assist log messages to aggregate stats. Update both if changing format.
  const bestPilot = getBestCrewMember(ship.crew, 'piloting');
  const pilotName = bestPilot?.name;
  const pilotSuffix = pilotName ? ` (${pilotName} piloting)` : '';
  const totalPilotingItems = countPilotingMasteryItems(gameData);

  for (const assist of flight.gravityAssists) {
    if (!assist.checked && progress >= assist.approachProgress) {
      // Look up body mastery level for the best pilot
      const bodyMasteryKey = gravityAssistMasteryKey(assist.bodyId);
      const bodyMasteryLevel =
        bestPilot?.mastery.piloting.itemMasteries[bodyMasteryKey]?.level ?? 0;

      resolveGravityAssist(assist, ship, tripFuelKg, bodyMasteryLevel);
      if (assist.result === 'success') {
        ship.fuelKg = Math.min(
          ship.maxFuelKg,
          ship.fuelKg + assist.fuelRefundKg
        );
        addLog(
          gameData.log,
          gameData.gameTime,
          'gravity_assist',
          `${ship.name}: Gravity assist off ${assist.bodyName} — saved ${formatMass(assist.fuelRefundKg)} fuel${pilotSuffix}`,
          ship.name
        );

        emit(gameData, {
          type: 'gravity_assist',
          ship,
          pilotName: pilotName ?? 'unknown',
          pilotId: bestPilot?.id ?? '',
          bodyName: assist.bodyName,
          fuelSaved: assist.fuelRefundKg,
          success: true,
        });
      } else {
        ship.fuelKg = Math.max(0, ship.fuelKg - assist.fuelPenaltyKg);
        addLog(
          gameData.log,
          gameData.gameTime,
          'gravity_assist',
          `${ship.name}: Gravity assist at ${assist.bodyName} failed — correction burn cost ${formatMass(assist.fuelPenaltyKg)} fuel${pilotSuffix}`,
          ship.name
        );

        emit(gameData, {
          type: 'gravity_assist',
          ship,
          pilotName: pilotName ?? 'unknown',
          pilotId: bestPilot?.id ?? '',
          bodyName: assist.bodyName,
          fuelSaved: assist.fuelPenaltyKg,
          success: false,
        });
      }

      // Award gravity assist body mastery XP to the best pilot
      if (bestPilot) {
        const masteryXp =
          assist.result === 'success'
            ? GRAVITY_ASSIST_MASTERY_XP_SUCCESS
            : GRAVITY_ASSIST_MASTERY_XP_FAILURE;
        const masteryResult = awardMasteryXp(
          bestPilot.mastery.piloting,
          bodyMasteryKey,
          masteryXp,
          Math.floor(bestPilot.skills.piloting),
          totalPilotingItems
        );
        if (masteryResult.leveledUp) {
          addLog(
            gameData.log,
            gameData.gameTime,
            'crew_level_up',
            `${bestPilot.name}'s ${assist.bodyName} mastery reached level ${masteryResult.newLevel}`,
            ship.name
          );
        }
      }

      resolved = true;
    }
  }

  return resolved;
}

function applyShipTick(gameData: GameData, ship: Ship): boolean {
  let changed = false;

  // Snapshot crew health for near-death detection (before any damage sources)
  const healthSnapshot = new Map<string, number>();
  for (const crew of ship.crew) {
    healthSnapshot.set(crew.id, crew.health);
  }

  // Track flight vs idle time
  if (ship.location.status === 'in_flight') {
    ship.metrics.totalFlightTicks++;
  } else if (
    ship.location.status === 'docked' ||
    ship.location.status === 'orbiting'
  ) {
    ship.metrics.totalIdleTicks++;
  }

  // Cache helm crew for warmup + fuel bonus lookups
  const helmCrew = getCrewForJobType(ship, 'helm');

  // Power management: decide which equipment is powered this tick
  applyPowerManagement(ship, gameData);

  // Engine warmup progress (independent of ship location)
  // Piloting pool 25% checkpoint: +5% warmup speed
  if (ship.engine.state === 'warming_up') {
    const warmupEngineDef = getEngineDefinition(ship.engine.definitionId);
    const pilotPool = getBestCrewPool(helmCrew, 'piloting');
    const warmupRate =
      warmupEngineDef.warmupRate * (1 + getPilotingPoolWarmupBonus(pilotPool));

    ship.engine.warmupProgress = Math.min(
      100,
      ship.engine.warmupProgress + warmupRate
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

      // Update 2D positions (originPos, interceptPos, shipPos) from
      // current-time body positions. Runs every tick so shipPos is always
      // accurate — no stale arrival-time snapshots.
      // Skip on completion — completeLeg docks the ship and discards positions.
      if (!flightComplete) {
        updateFlightPosition(ship.activeFlightPlan);
      }

      // === GRAVITY ASSIST CHECK ===
      if (!flightComplete && checkGravityAssists(ship, gameData)) {
        changed = true;
      }

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
          // Piloting pool 50% checkpoint: +5% fuel efficiency
          const fuelPool = getBestCrewPool(helmCrew, 'piloting');
          const fuelConsumedKg =
            fuelFlowRateKgPerSec *
            burnSeconds *
            (1 - getPilotingPoolFuelBonus(fuelPool));

          ship.fuelKg = Math.max(0, ship.fuelKg - fuelConsumedKg);

          // Engine shuts down when fuel is exhausted — ship can no longer
          // accelerate or decelerate, halting flight progression.
          if (ship.fuelKg <= 0) {
            ship.engine.state = 'off';
            addLog(
              gameData.log,
              gameData.gameTime,
              'fuel_depleted',
              `${ship.name}: Fuel exhausted mid-flight — engine shutdown. Ship is adrift.`,
              ship.name
            );
            if (gameData.autoPauseSettings.onCriticalAlert) {
              gameData.isPaused = true;
            }
          }
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
            recordCrewDamage(crew.id, 'radiation');
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
            if (!eq.powered) continue; // unpowered equipment doesn't generate heat
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
            const spikeRadiation =
              (engineRadiation * (spikeMultiplier - 1)) / 10;

            for (const crew of ship.crew) {
              crew.health = Math.max(0, crew.health - spikeRadiation);
              recordCrewDamage(crew.id, 'radiation');
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
  // Repairs pool 50% checkpoint reduces filter degradation by 10%
  const filterPool = getBestCrewPool(
    getCrewForJobType(ship, 'repair'),
    'repairs'
  );
  const filterDegradationRate =
    0.005 * (1 - getRepairsPoolFilterReduction(filterPool));
  for (const equipment of ship.equipment) {
    if (equipment.definitionId === 'air_filters') {
      if (equipment.degradation < 100) {
        equipment.degradation = Math.min(
          100,
          equipment.degradation + filterDegradationRate
        );
        changed = true;
      }
    }
  }

  // Oxygen system (life support)
  const prevOxygenLevel = ship.oxygenLevel;
  if (applyOxygenTick(ship)) {
    changed = true;
  }

  // Oxygen health effects
  const o2Damage = getOxygenHealthDamage(ship.oxygenLevel);
  if (o2Damage > 0) {
    for (const crew of ship.crew) {
      crew.health = Math.max(0, crew.health - o2Damage);
      recordCrewDamage(crew.id, 'suffocation');
    }
    changed = true;

    // Log warnings at critical thresholds (compare against actual previous level)
    if (ship.oxygenLevel < 10 && prevOxygenLevel >= 10) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'gravity_warning',
        `Critical: ${ship.name} oxygen levels critical! Crew health deteriorating rapidly.`,
        ship.name
      );
    } else if (ship.oxygenLevel < 25 && prevOxygenLevel >= 25) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'gravity_warning',
        `Warning: ${ship.name} oxygen levels dangerously low. Crew suffering hypoxia.`,
        ship.name
      );
    } else if (ship.oxygenLevel < 50 && prevOxygenLevel >= 50) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'gravity_warning',
        `${ship.name} oxygen levels declining. Life support struggling.`,
        ship.name
      );
    }
  }

  // Provisions: auto-resupply + skip consumption at trade stations; consume normally elsewhere
  if (applyProvisionsTick(ship, gameData)) {
    changed = true;
  }

  // Patient: health regeneration (2 HP/tick when in operational medbay)
  // Runs in all ship states — patients heal whether docked, orbiting, or in flight
  if (applyMedbayHealing(ship)) {
    changed = true;
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

    // Passive skill training (during flight and orbiting)
    // Captain's ship trains 1.5×; ships near captain get aura training bonus
    // Activity-gated: mining_ops only trains when orbiting a mine location
    const trainingMultiplier = getCommandTrainingMultiplier(ship, gameData);
    const inactiveJobs = getInactiveTrainingJobTypes(ship, gameData);
    const skillUps = applyPassiveTraining(
      ship,
      trainingMultiplier,
      inactiveJobs
    );
    if (skillUps.length > 0) {
      logSkillUps(
        gameData.log,
        gameData.gameTime,
        ship.name,
        skillUps,
        gameData,
        ship
      );
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
                ship.name,
                { oreQty: qty, oreType: oreId.replace(/_/g, ' ') }
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

          handleMiningDepartureChecks(gameData, ship, miningResult.cargoFull);
        } else if (ship.miningRoute?.status === 'mining') {
          handleMiningDepartureChecks(gameData, ship, false);
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

  // Retry stalled mining route departures (e.g. helm was unmanned on previous tick)
  if (ship.miningRoute && ship.location.status !== 'in_flight') {
    retryMiningRouteDeparture(gameData, ship);
  }

  // Repair: crew in repair slots generates repair points distributed to degraded equipment.
  if (applyRepairTick(ship)) {
    changed = true;
  }

  emitNearDeathEvents(gameData, ship, healthSnapshot);

  // Crew death check — runs after all health modifications (radiation, oxygen,
  // starvation, combat). Captain health floors at 1 (player avatar).
  if (processCrewDeaths(ship, gameData)) {
    changed = true;
  }

  return changed;
}

/**
 * Emit near-death events for crew who dropped below 15 HP but are still alive.
 * Extracted from applyShipTick to reduce cyclomatic complexity.
 */
function emitNearDeathEvents(
  gameData: GameData,
  ship: Ship,
  healthSnapshot: Map<string, number>
): void {
  for (const crew of ship.crew) {
    if (crew.isCaptain) continue; // Captain can't die
    const prevHealth = healthSnapshot.get(crew.id) ?? 100;
    if (prevHealth >= 15 && crew.health < 15 && crew.health > 0) {
      const cause = getLastDamageSource(crew.id) ?? 'combat';

      emit(gameData, {
        type: 'crew_near_death',
        crew,
        ship,
        healthRemaining: crew.health,
        prevHealth,
        cause,
      });
    }
  }
}

/**
 * Handle mining route departure decisions: provisions-based early return
 * or cargo-full departure to sell station.
 */
function handleMiningDepartureChecks(
  gameData: GameData,
  ship: Ship,
  cargoFull: boolean
): void {
  // Provisions check takes priority over cargo-full check
  if (
    ship.miningRoute?.status === 'mining' &&
    !cargoFull &&
    checkMiningRouteProvisionsReturn(gameData, ship)
  ) {
    return; // Provisions departure initiated
  }

  if (cargoFull) {
    // Log cargo full warning (once per full-empty cycle)
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

/**
 * Apply one tick of crew repair activity.
 * Works in all ship states (docked, in_flight, orbiting).
 * Repair mastery: each equipment type repaired gains mastery XP for the repairer.
 */
function applyRepairTick(ship: Ship): boolean {
  const repairCrew = getCrewForJobType(ship, 'repair');
  if (repairCrew.length === 0) return false;

  // Find best repairer for pool bonuses
  const bestRepairer = repairCrew.reduce((best, c) =>
    c.skills.repairs > best.skills.repairs ? c : best
  );
  const repairsPool = bestRepairer.mastery?.repairs?.pool ?? {
    xp: 0,
    maxXp: 0,
  };
  const poolSpeedBonus = getRepairsPoolSpeedBonus(repairsPool);
  const bonusPointChance = getRepairsPoolBonusChance(repairsPool);

  let totalRepairPoints = 0;
  for (const eng of repairCrew) {
    let points = calculateRepairPoints(eng);
    // Health efficiency — injured/starving crew repair slower
    points *= getCrewHealthEfficiency(eng.health);
    // Pool bonus: +5% repair speed at 25%
    points *= 1 + poolSpeedBonus;
    // Pool bonus: +10% chance for bonus repair points at 95%
    if (bonusPointChance > 0 && Math.random() < bonusPointChance) {
      points *= 1.5;
    }
    totalRepairPoints += points;
  }

  // Distribute repair points across degraded equipment with per-item mastery bonuses
  const degradedEquipment = ship.equipment.filter((eq) => eq.degradation > 0);
  if (degradedEquipment.length === 0 || totalRepairPoints <= 0) return false;

  const basePointsPerEquipment = totalRepairPoints / degradedEquipment.length;
  const totalEquipmentCount = getAllEquipmentDefinitions().filter(
    (d) => d.hasDegradation
  ).length;

  for (const eq of degradedEquipment) {
    // Per-equipment mastery bonus: repairing mastered equipment is faster
    const masteryState = bestRepairer.mastery?.repairs;
    const itemMastery = masteryState?.itemMasteries[eq.definitionId];
    const masteryLevel = itemMastery?.level ?? 0;
    const masteryBonus = getEquipmentRepairMasteryBonus(masteryLevel);
    const effectivePoints = basePointsPerEquipment * (1 + masteryBonus);

    eq.degradation = Math.max(0, eq.degradation - effectivePoints);

    // Award repair mastery XP to the best repairer for this equipment type
    if (masteryState) {
      awardMasteryXp(
        masteryState,
        eq.definitionId,
        5, // base mastery XP per tick of repair
        Math.floor(bestRepairer.skills.repairs),
        totalEquipmentCount
      );
    }
  }
  return true;
}

export function applyTick(
  gameData: GameData,
  isCatchUp: boolean = false
): boolean {
  _isCatchUp = isCatchUp;
  let changed = false;

  // Advance game time once per tick (global time system)
  gameData.gameTime += GAME_SECONDS_PER_TICK;

  // Update orbital positions for all world locations
  updateWorldPositions(gameData.world, gameData.gameTime);

  // Apply per-ship tick logic
  for (const ship of gameData.ships) {
    if (applyShipTick(gameData, ship)) {
      changed = true;
    }
  }

  // Fleet-wide salary deduction (global time system)
  deductFleetSalaries(gameData, 1);

  // Check for stranded ships (log warnings, auto-pause)
  checkStrandedShips(gameData);

  // Periodic arc detection (~every game day)
  if (shouldRunArcScan(gameData)) {
    detectArcs(gameData);
  }

  return changed;
}
