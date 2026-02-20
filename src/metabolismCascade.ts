// Metabolism Cascade - Universal lifecycle processing for all swarm organisms
// See WORLDRULES.md § Alien Metabolism (Universal Model)
//
// This function is the ONLY place the energy→health cascade is implemented.
// Every organism type calls this. Never inline the cascade logic elsewhere.

import type { Organism } from './models/swarmTypes';

// ============================================================================
// CASCADE RESULT
// ============================================================================

export interface MetabolismCascadeResult {
  /** Whether the organism died (health reached 0) */
  died: boolean;
  /** Whether the organism took starvation damage this tick (energy was 0) */
  starvationDamage: boolean;
  /** Amount of biomass consumed from buffer to refuel energy */
  biomassConsumed: number;
}

// ============================================================================
// SHARED CASCADE — called by every organism type, never reimplemented
// ============================================================================

/**
 * Process one tick of the universal metabolism cascade.
 *
 * 1. energy -= metabolismPerTick          (always)
 * 2. refuel energy from biomassBuffer     (up to energy deficit)
 * 3. if energy == 0: health -= hpDecayPerTickAtZeroEnergy
 * 4. if health == 0: organism dies
 *
 * Biomass intake (how the buffer gets filled) is NOT part of this function.
 * Workers replenish buffer from cargo. Queens receive buffer from deliveries.
 * Those are organism-specific pre-cascade steps.
 */
export function processMetabolismCascade(
  organism: Organism
): MetabolismCascadeResult {
  const result: MetabolismCascadeResult = {
    died: false,
    starvationDamage: false,
    biomassConsumed: 0,
  };

  // Step 1: Energy depletes by metabolism (always)
  organism.energy.current = Math.max(
    0,
    organism.energy.current - organism.metabolismPerTick
  );

  // Step 2: Refuel energy from biomass buffer (up to energy deficit)
  if (
    organism.energy.current < organism.energy.max &&
    organism.biomassBuffer.current > 0
  ) {
    const deficit = organism.energy.max - organism.energy.current;
    const consumed = Math.min(deficit, organism.biomassBuffer.current);
    organism.energy.current = Math.min(
      organism.energy.current + consumed,
      organism.energy.max
    );
    organism.biomassBuffer.current -= consumed;
    result.biomassConsumed = consumed;
  }

  // Step 3: If energy depleted, health drains
  if (organism.energy.current <= 0) {
    organism.health.current = Math.max(
      0,
      organism.health.current - organism.hpDecayPerTickAtZeroEnergy
    );
    result.starvationDamage = true;

    // Step 4: If health depleted, organism dies
    if (organism.health.current <= 0) {
      result.died = true;
    }
  }

  return result;
}
