import type { Ship, CrewMember } from './models';
import { getShipClass } from './shipClasses';
import { getEquipmentDefinition } from './equipment';
import { getEngineDefinition } from './engines';
import { getCrewEquipmentDefinition } from './crewEquipment';
import { GAME_SECONDS_PER_TICK } from './timeSystem';

// Thresholds in game-seconds
const SAFE_THRESHOLD = 14 * 24 * 60 * 60; // 14 days
const MINOR_THRESHOLD = 60 * 24 * 60 * 60; // 60 days
const MODERATE_THRESHOLD = 180 * 24 * 60 * 60; // 180 days
const SEVERE_THRESHOLD = 365 * 24 * 60 * 60; // 365 days

export type GravityDegradationLevel =
  | 'none'
  | 'minor'
  | 'moderate'
  | 'severe'
  | 'critical';

export type GravitySourceType =
  | 'rotating_habitat'
  | 'centrifuge'
  | 'thrust'
  | 'none';

export interface GravitySource {
  type: GravitySourceType;
  thrustG?: number; // g-force during thrust (only for type='thrust')
}

/**
 * Get the degradation level based on cumulative zero-g exposure
 */
export function getGravityDegradationLevel(
  zeroGExposure: number
): GravityDegradationLevel {
  if (zeroGExposure < SAFE_THRESHOLD) return 'none';
  if (zeroGExposure < MINOR_THRESHOLD) return 'minor';
  if (zeroGExposure < MODERATE_THRESHOLD) return 'moderate';
  if (zeroGExposure < SEVERE_THRESHOLD) return 'severe';
  return 'critical';
}

/**
 * Get strength multiplier based on degradation level
 */
export function getStrengthMultiplier(level: GravityDegradationLevel): number {
  switch (level) {
    case 'none':
      return 1.0;
    case 'minor':
      return 0.925; // -7.5%
    case 'moderate':
      return 0.825; // -17.5%
    case 'severe':
      return 0.65; // -35%
    case 'critical':
      return 0.4; // -60%
  }
}

/**
 * Get the gravity source for a ship
 */
export function getGravitySource(ship: Ship): GravitySource {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return { type: 'none' };

  // Check for rotating habitat feature
  if (shipClass.features.includes('rotating_habitat')) {
    return { type: 'rotating_habitat' };
  }

  // Check for centrifuge_pod equipment
  const hasCentrifuge = ship.equipment.some((eq) => {
    const def = getEquipmentDefinition(eq.definitionId);
    return def?.id === 'centrifuge_pod';
  });

  if (hasCentrifuge) {
    return { type: 'centrifuge' };
  }

  // Check thrust gravity (only during burns)
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  if (engineDef && ship.engine.state === 'online' && ship.location.flight) {
    const phase = ship.location.flight.phase;
    if (phase === 'accelerating' || phase === 'decelerating') {
      // maxThrust is in milli-g, convert to g
      const thrustG = engineDef.maxThrust / 1000;
      return { type: 'thrust', thrustG };
    }
  }

  return { type: 'none' };
}

/**
 * Check if ship has any gravity source (excluding thrust)
 */
export function shipHasGravity(ship: Ship): boolean {
  const source = getGravitySource(ship);
  return source.type === 'rotating_habitat' || source.type === 'centrifuge';
}

/**
 * Apply gravity tick accumulation during flight and orbiting
 */
export function applyGravityTick(ship: Ship): void {
  // Only accumulate during flight and orbiting
  if (
    ship.location.status !== 'in_flight' &&
    ship.location.status !== 'orbiting'
  )
    return;

  const gravitySource = getGravitySource(ship);

  // If ship has permanent gravity, no accumulation
  if (
    gravitySource.type === 'rotating_habitat' ||
    gravitySource.type === 'centrifuge'
  ) {
    return;
  }

  // Compute base exposure rate
  let exposureRate = 1.0;

  // Apply thrust gravity reduction during burns
  if (gravitySource.type === 'thrust' && gravitySource.thrustG !== undefined) {
    // Reduce exposure rate based on thrust g-force
    // 0.1g = 10% reduction, 1g = 100% reduction (capped)
    const reduction = Math.min(1.0, gravitySource.thrustG);
    exposureRate *= Math.max(0, 1 - reduction);
  }

  // Check for exercise module (50% reduction)
  const hasExerciseModule = ship.equipment.some((eq) => {
    const def = getEquipmentDefinition(eq.definitionId);
    return def?.id === 'exercise_module';
  });

  if (hasExerciseModule) {
    exposureRate *= 0.5;
  }

  // Apply per-crew g_seat modifier
  for (const crew of ship.crew) {
    let crewRate = exposureRate;

    // Check if crew has g_seat equipped
    const hasGSeat = crew.equipment.some((eq) => {
      const def = getCrewEquipmentDefinition(eq.definitionId);
      return def?.id === 'g_seat';
    });

    if (hasGSeat) {
      crewRate *= 0.7; // 30% reduction
    }

    // Accumulate exposure
    crew.zeroGExposure += GAME_SECONDS_PER_TICK * crewRate;
  }
}

/**
 * Apply gravity recovery when docked at a planet/moon
 */
export function applyGravityRecovery(
  ship: Ship,
  gameSecondsElapsed: number
): void {
  // Only recover when docked
  if (ship.location.status !== 'docked') return;

  // Recovery rate: 0.5x the accumulation rate (slower than accumulation)
  const recoveryRate = 0.5;

  for (const crew of ship.crew) {
    // Reduce exposure
    const recovery = gameSecondsElapsed * recoveryRate;
    crew.zeroGExposure = Math.max(0, crew.zeroGExposure - recovery);
  }
}

/**
 * Check if crew crossed a threshold and return the new level
 */
export function checkThresholdCrossing(
  crew: CrewMember,
  previousExposure: number
): GravityDegradationLevel | null {
  const previousLevel = getGravityDegradationLevel(previousExposure);
  const currentLevel = getGravityDegradationLevel(crew.zeroGExposure);

  if (previousLevel !== currentLevel) {
    return currentLevel;
  }

  return null;
}

/**
 * Get next threshold information for display
 */
export function getNextThreshold(zeroGExposure: number): {
  threshold: number;
  level: GravityDegradationLevel;
} | null {
  if (zeroGExposure < SAFE_THRESHOLD) {
    return { threshold: SAFE_THRESHOLD, level: 'minor' };
  }
  if (zeroGExposure < MINOR_THRESHOLD) {
    return { threshold: MINOR_THRESHOLD, level: 'moderate' };
  }
  if (zeroGExposure < MODERATE_THRESHOLD) {
    return { threshold: MODERATE_THRESHOLD, level: 'severe' };
  }
  if (zeroGExposure < SEVERE_THRESHOLD) {
    return { threshold: SEVERE_THRESHOLD, level: 'critical' };
  }
  return null; // Already at critical
}

/**
 * Estimate gravity impact for a trip
 */
export function estimateTripGravityImpact(
  ship: Ship,
  tripDurationSeconds: number
): {
  crewAtRisk: CrewMember[];
  newLevels: Map<string, GravityDegradationLevel>;
} {
  const crewAtRisk: CrewMember[] = [];
  const newLevels = new Map<string, GravityDegradationLevel>();

  // Simple estimate: assume 100% exposure (worst case, no gravity/thrust/equipment)
  // This is conservative for warning purposes
  for (const crew of ship.crew) {
    const estimatedExposure = crew.zeroGExposure + tripDurationSeconds;
    const currentLevel = getGravityDegradationLevel(crew.zeroGExposure);
    const newLevel = getGravityDegradationLevel(estimatedExposure);

    if (currentLevel !== newLevel) {
      crewAtRisk.push(crew);
      newLevels.set(crew.id, newLevel);
    }
  }

  return { crewAtRisk, newLevels };
}

/**
 * Format exposure time in days for UI
 */
export function formatExposureDays(gameSeconds: number): number {
  return Math.floor(gameSeconds / (24 * 60 * 60));
}

/**
 * Get degradation level display name
 */
export function getDegradationLevelName(
  level: GravityDegradationLevel
): string {
  switch (level) {
    case 'none':
      return 'Normal';
    case 'minor':
      return 'Minor atrophy';
    case 'moderate':
      return 'Moderate atrophy';
    case 'severe':
      return 'Severe atrophy';
    case 'critical':
      return 'Critical atrophy';
  }
}

/**
 * Get status description for degradation level
 */
export function getDegradationDescription(
  level: GravityDegradationLevel
): string {
  switch (level) {
    case 'none':
      return 'No effects';
    case 'minor':
      return 'Strength -7.5%';
    case 'moderate':
      return 'Strength -17.5%';
    case 'severe':
      return 'Strength -35%';
    case 'critical':
      return 'Strength -60%';
  }
}
