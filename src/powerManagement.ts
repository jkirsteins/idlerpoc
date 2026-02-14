import type { Ship, GameData, EquipmentInstance } from './models';
import { getEquipmentDefinition } from './equipment';
import { getEngineDefinition } from './engines';
import { getRoomDefinition } from './rooms';
import { isRoomStaffed, getCrewForJobType } from './jobSlots';
import { getPowerPriorityRule } from './powerPriorities';
import { addLog } from './logSystem';

/** Per-equipment pilot power efficiency bonus per skill point (0.1% per point). */
const PILOTING_POWER_BONUS_PER_POINT = 0.001;

interface PowerCandidate {
  equipment: EquipmentInstance;
  powerDraw: number;
  effectivePriority: number; // -1 for force-on, 0-3 for auto
  reason: string;
  equipmentName: string;
}

/**
 * Compute the equipment power budget: total output minus room draw and engine self-draw.
 * Optionally applies the helm piloting bonus.
 */
function computeEquipmentPowerBudget(ship: Ship): number {
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const isDocked = ship.location.status === 'docked';

  // Total power output
  let totalOutput = 0;
  if (isDocked) {
    totalOutput = engineDef.powerOutput;
  } else if (ship.engine.state === 'online' && ship.fuelKg > 0) {
    totalOutput = engineDef.powerOutput;
  }
  // warming_up or off with no berth = 0 output

  // Room draw
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

  // Engine self-draw
  let engineSelfDraw = 0;
  if (ship.engine.state === 'online') {
    engineSelfDraw = engineDef.selfPowerDraw;
  }

  // Helm piloting bonus stretches effective output
  const helmCrew = getCrewForJobType(ship, 'helm');
  let bestPiloting = 0;
  for (const crew of helmCrew) {
    if (crew.skills.piloting > bestPiloting) {
      bestPiloting = crew.skills.piloting;
    }
  }
  const pilotingBonus = 1 + bestPiloting * PILOTING_POWER_BONUS_PER_POINT;

  return totalOutput * pilotingBonus - roomDraw - engineSelfDraw;
}

/**
 * Run power management for a ship. Evaluates priority rules and player
 * overrides to set equipment.powered on each equipment instance.
 * Logs power changes to the game log.
 */
export function applyPowerManagement(ship: Ship, gameData: GameData): void {
  const budget = computeEquipmentPowerBudget(ship);

  // Build candidate list
  const candidates: PowerCandidate[] = [];
  const forceOff: EquipmentInstance[] = [];

  for (const eq of ship.equipment) {
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (!eqDef) continue;

    if (eq.powerMode === 'off') {
      forceOff.push(eq);
      continue;
    }

    if (eq.powerMode === 'on') {
      candidates.push({
        equipment: eq,
        powerDraw: eqDef.powerDraw,
        effectivePriority: -1, // highest
        reason: 'manual override',
        equipmentName: eqDef.name,
      });
      continue;
    }

    // auto mode: evaluate rule
    const rule = getPowerPriorityRule(eq.definitionId);
    const evaluation = rule.evaluate(ship, gameData);

    if (!evaluation.shouldPower) {
      // AI says don't power this — treat like force-off but with reason
      forceOff.push(eq);
      continue;
    }

    candidates.push({
      equipment: eq,
      powerDraw: eqDef.powerDraw,
      effectivePriority: evaluation.priority,
      reason: evaluation.reason,
      equipmentName: eqDef.name,
    });
  }

  // Sort by priority: lower number = higher importance = powered first
  candidates.sort((a, b) => a.effectivePriority - b.effectivePriority);

  // Allocate power budget
  let remainingBudget = budget;
  const poweredOn: PowerCandidate[] = [];
  const poweredOff: PowerCandidate[] = [];

  for (const candidate of candidates) {
    // Priority 0 (CRITICAL) and force-on (-1) are always powered
    if (candidate.effectivePriority <= 0) {
      poweredOn.push(candidate);
      remainingBudget -= candidate.powerDraw;
      continue;
    }

    // Others: power if budget allows
    if (remainingBudget >= candidate.powerDraw) {
      poweredOn.push(candidate);
      remainingBudget -= candidate.powerDraw;
    } else {
      poweredOff.push(candidate);
    }
  }

  // Track changes for logging
  const turnedOn: string[] = [];
  const turnedOff: string[] = [];

  // Apply powered state to force-off equipment
  for (const eq of forceOff) {
    if (eq.powered) {
      const eqDef = getEquipmentDefinition(eq.definitionId);
      turnedOff.push(eqDef?.name ?? eq.definitionId);
    }
    eq.powered = false;
  }

  // Apply powered state to allocated equipment
  for (const candidate of poweredOn) {
    if (!candidate.equipment.powered) {
      turnedOn.push(candidate.equipmentName);
    }
    candidate.equipment.powered = true;
  }

  // Apply powered state to budget-exceeded equipment
  for (const candidate of poweredOff) {
    if (candidate.equipment.powered) {
      turnedOff.push(candidate.equipmentName);
    }
    candidate.equipment.powered = false;
  }

  // Log changes if any
  if (turnedOn.length > 0 || turnedOff.length > 0) {
    const parts: string[] = [];
    if (turnedOn.length > 0) {
      parts.push(`Powered on: ${turnedOn.join(', ')}`);
    }
    if (turnedOff.length > 0) {
      parts.push(`Powered off: ${turnedOff.join(', ')}`);
    }
    addLog(
      gameData.log,
      gameData.gameTime,
      'power_change',
      parts.join('. '),
      ship.name
    );
  }
}

/**
 * Check whether an equipment item can be set to 'on' mode without
 * exceeding the power budget (after all force-on + critical auto items).
 * Returns { allowed, reason }.
 */
export function canSetPowerModeOn(
  ship: Ship,
  gameData: GameData,
  equipmentId: string
): { allowed: boolean; reason?: string } {
  const budget = computeEquipmentPowerBudget(ship);

  // Sum draw of all equipment that would be powered regardless:
  // force-on items + critical auto items
  let committedDraw = 0;
  for (const eq of ship.equipment) {
    if (eq.id === equipmentId) continue; // skip the one we're toggling
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (!eqDef) continue;

    if (eq.powerMode === 'on') {
      committedDraw += eqDef.powerDraw;
    } else if (eq.powerMode === 'auto') {
      const rule = getPowerPriorityRule(eq.definitionId);
      const evaluation = rule.evaluate(ship, gameData);
      if (evaluation.shouldPower && evaluation.priority === 0) {
        committedDraw += eqDef.powerDraw;
      }
    }
  }

  // Check if adding the target equipment's draw fits
  const targetEq = ship.equipment.find((eq) => eq.id === equipmentId);
  if (!targetEq) return { allowed: false, reason: 'Equipment not found' };
  const targetDef = getEquipmentDefinition(targetEq.definitionId);
  if (!targetDef)
    return { allowed: false, reason: 'Equipment definition not found' };

  const remaining = budget - committedDraw;
  if (remaining >= targetDef.powerDraw) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Insufficient power: ${targetDef.name} requires ${targetDef.powerDraw} kW but only ${Math.max(0, Math.floor(remaining))} kW available`,
  };
}
