import type { Ship } from './models';
import { getEquipmentDefinition } from './equipment';
import { getShipClass } from './shipClasses';
import { computePowerStatus } from './powerSystem';

/** O2 consumed per tick per crew member */
export const O2_PER_CREW_PER_TICK = 1.0;

/**
 * Atmosphere capacity derived from ship mass (larger ships hold more air).
 * This determines how quickly oxygen percentage changes — bigger ships
 * have more buffer time when life support fails.
 */
export function getAtmosphereCapacity(ship: Ship): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 1000;
  return shipClass.mass / 50;
}

export interface OxygenStatus {
  totalGeneration: number; // O2/tick from powered equipment
  totalConsumption: number; // O2/tick from crew
  netChange: number; // generation - consumption (O2/tick)
  oxygenLevel: number; // current 0-100%
  atmosphereCapacity: number; // total O2 capacity (derived from ship mass)
  isDepressurizing: boolean; // consuming more than generating
  isPowered: boolean; // ship has power for life support
  generationItems: Array<{ name: string; output: number }>; // breakdown
}

/**
 * Compute oxygen status for a ship. Similar pattern to computePowerStatus.
 * Generation depends on powered life support equipment.
 * Consumption depends on crew count.
 */
export function computeOxygenStatus(ship: Ship): OxygenStatus {
  const powerStatus = computePowerStatus(ship);
  // Life support generates O2 only when the ship has power output.
  // No power during warmup or engine off = no O2 generation.
  const hasPower = powerStatus.totalOutput > 0;

  let totalGeneration = 0;
  const generationItems: Array<{ name: string; output: number }> = [];

  // Equipment O2 generation (only when ship has power and equipment is powered)
  if (hasPower) {
    for (const eq of ship.equipment) {
      if (!eq.powered) continue;
      const eqDef = getEquipmentDefinition(eq.definitionId);
      if (eqDef?.oxygenOutput && eqDef.oxygenOutput > 0) {
        // Degradation reduces effectiveness
        const effectiveness = eqDef.hasDegradation
          ? 1 - eq.degradation / 100
          : 1;
        const effectiveOutput = eqDef.oxygenOutput * effectiveness;
        totalGeneration += effectiveOutput;
        generationItems.push({
          name: eqDef.name,
          output: effectiveOutput,
        });
      }
    }
  }

  // Crew consumption
  const totalConsumption = ship.crew.length * O2_PER_CREW_PER_TICK;

  const netChange = totalGeneration - totalConsumption;
  const atmosphereCapacity = getAtmosphereCapacity(ship);

  return {
    totalGeneration,
    totalConsumption,
    netChange,
    oxygenLevel: ship.oxygenLevel,
    atmosphereCapacity,
    isDepressurizing: netChange < 0,
    isPowered: hasPower,
    generationItems,
  };
}

/**
 * Apply one tick of oxygen changes to a ship.
 * Returns true if oxygen level changed.
 */
export function applyOxygenTick(ship: Ship): boolean {
  // When docked, station maintains atmosphere
  if (ship.location.status === 'docked') {
    if (ship.oxygenLevel < 100) {
      ship.oxygenLevel = 100;
      return true;
    }
    return false;
  }

  const status = computeOxygenStatus(ship);

  if (status.netChange === 0 && ship.oxygenLevel >= 100) return false;

  // Convert net O2 change to percentage of atmosphere capacity
  const deltaPercent = (status.netChange / status.atmosphereCapacity) * 100;

  const oldLevel = ship.oxygenLevel;
  ship.oxygenLevel = Math.max(
    0,
    Math.min(100, ship.oxygenLevel + deltaPercent)
  );

  return ship.oxygenLevel !== oldLevel;
}

/**
 * Apply health damage from low oxygen levels.
 * Returns the damage per crew member applied this tick.
 */
export function getOxygenHealthDamage(oxygenLevel: number): number {
  if (oxygenLevel >= 50) return 0;
  if (oxygenLevel >= 25) return 0.5;
  if (oxygenLevel >= 10) return 2.0;
  return 5.0;
}
