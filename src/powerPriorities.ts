import type { Ship, GameData, EquipmentId } from './models';

/**
 * Priority levels for power allocation. Lower = more important.
 * 0 = CRITICAL (never shed), 1 = HIGH, 2 = MEDIUM, 3 = LOW (shed first).
 */
export type PriorityLevel = 0 | 1 | 2 | 3;

export interface PowerEvaluation {
  shouldPower: boolean;
  priority: PriorityLevel;
  reason: string;
}

export interface PowerPriorityRule {
  equipmentId: EquipmentId;
  description: string;
  evaluate: (ship: Ship, gameData: GameData) => PowerEvaluation;
}

// ── Ship state helpers ──────────────────────────────────────────

function isEngineActive(ship: Ship): boolean {
  return ship.engine.state !== 'off';
}

function isInFlight(ship: Ship): boolean {
  return ship.location.status === 'in_flight';
}

function isDocked(ship: Ship): boolean {
  return ship.location.status === 'docked';
}

function isActiveMining(ship: Ship): boolean {
  return (
    ship.miningRoute?.status === 'mining' && ship.location.status === 'orbiting'
  );
}

// ── Category-based evaluate functions ───────────────────────────
// Shared across all equipment IDs that share the same contextual logic.

/** Life support: always critical (priority 0). */
function evalCritical(): PowerEvaluation {
  return { shouldPower: true, priority: 0, reason: 'life support critical' };
}

/** Shielding/thermal/structural: powered when engine active. */
function evalEngineDependent(
  ship: Ship,
  activeReason: string
): PowerEvaluation {
  const active = isEngineActive(ship);
  return {
    shouldPower: active,
    priority: active ? 1 : 3,
    reason: active ? activeReason : 'engine off',
  };
}

/** Defense/navigation/g-force: powered during flight. */
function evalFlightOnly(ship: Ship): PowerEvaluation {
  const inFlight = isInFlight(ship);
  return {
    shouldPower: inFlight,
    priority: inFlight ? 2 : 3,
    reason: inFlight ? 'in flight' : 'not in flight',
  };
}

/** Gravity: powered when not docked (zero-g environments). */
function evalZeroG(ship: Ship): PowerEvaluation {
  const needs = !isDocked(ship);
  return {
    shouldPower: needs,
    priority: needs ? 2 : 3,
    reason: needs ? 'zero-g environment' : 'station gravity',
  };
}

/** Mining: powered during active mining operations. */
function evalMining(ship: Ship): PowerEvaluation {
  const mining = isActiveMining(ship);
  return {
    shouldPower: mining,
    priority: mining ? 2 : 3,
    reason: mining ? 'mining active' : 'not mining',
  };
}

/** Medical: always powered when undocked, low priority when docked. */
function evalMedical(ship: Ship): PowerEvaluation {
  const docked = isDocked(ship);
  return {
    shouldPower: true,
    priority: docked ? 3 : 2,
    reason: docked ? 'docked — station medical' : 'crew medical support',
  };
}

// ── Exhaustive rule map ─────────────────────────────────────────
// Every EquipmentId must have an entry. TypeScript's Record<EquipmentId, ...>
// ensures a compile-time error if a new EquipmentId is added to models but
// not registered here.

interface RuleEntry {
  description: string;
  evaluate: (ship: Ship, gameData: GameData) => PowerEvaluation;
}

const RULE_MAP: Record<EquipmentId, RuleEntry> = {
  // Critical (priority 0)
  life_support: {
    description: 'Always powered — crew survival',
    evaluate: evalCritical,
  },
  air_filters: {
    description: 'Always powered — supplemental oxygen',
    evaluate: () => ({
      shouldPower: true,
      priority: 0,
      reason: 'air filtration critical',
    }),
  },

  // High (priority 1) — engine-dependent
  rad_shield_basic: {
    description: 'Radiation protection when engine active',
    evaluate: (ship) => evalEngineDependent(ship, 'engine radiation'),
  },
  rad_shield_heavy: {
    description: 'Heavy radiation protection when engine active',
    evaluate: (ship) => evalEngineDependent(ship, 'engine radiation'),
  },
  heat_radiator_basic: {
    description: 'Heat dissipation when engine active',
    evaluate: (ship) => evalEngineDependent(ship, 'engine heat'),
  },
  heat_radiator_heavy: {
    description: 'Active cooling when engine active',
    evaluate: (ship) => evalEngineDependent(ship, 'engine heat'),
  },
  mag_confinement: {
    description: 'Fusion containment when engine active',
    evaluate: (ship) => evalEngineDependent(ship, 'containment required'),
  },

  // Medium (priority 2) — flight-only
  point_defense: {
    description: 'Automated defense during flight',
    evaluate: (ship) => evalFlightOnly(ship),
  },
  deflector_shield: {
    description: 'Debris deflection during flight',
    evaluate: (ship) => evalFlightOnly(ship),
  },
  micro_deflector: {
    description: 'Micro debris deflection during flight',
    evaluate: (ship) => evalFlightOnly(ship),
  },
  point_defense_laser: {
    description: 'Laser point defense during flight',
    evaluate: (ship) => evalFlightOnly(ship),
  },
  nav_scanner: {
    description: 'Hazard scanning during flight',
    evaluate: (ship) => evalFlightOnly(ship),
  },
  accel_couches: {
    description: 'G-force protection during flight',
    evaluate: (ship) => evalFlightOnly(ship),
  },
  crash_couches: {
    description: 'High-G protection during flight',
    evaluate: (ship) => evalFlightOnly(ship),
  },

  // Medium (priority 2) — gravity
  centrifuge_pod: {
    description: 'Spin gravity when in zero-g',
    evaluate: (ship) => evalZeroG(ship),
  },
  exercise_module: {
    description: 'Zero-g degradation mitigation',
    evaluate: (ship) => evalZeroG(ship),
  },

  // Medium (priority 2) — mining
  mining_laser: {
    description: 'Powered during mining operations',
    evaluate: (ship) => evalMining(ship),
  },
  mining_rig: {
    description: 'Powered during mining operations',
    evaluate: (ship) => evalMining(ship),
  },
  deep_core_mining: {
    description: 'Powered during mining operations',
    evaluate: (ship) => evalMining(ship),
  },
  quantum_mining: {
    description: 'Powered during mining operations',
    evaluate: (ship) => evalMining(ship),
  },

  // Medium (priority 2/3) — medical
  medical_station: {
    description: 'Crew medical support',
    evaluate: (ship) => evalMedical(ship),
  },
};

/**
 * Get the power priority rule for a given equipment type.
 * All EquipmentId values have entries — no silent fallback.
 */
export function getPowerPriorityRule(
  equipmentId: EquipmentId
): PowerPriorityRule {
  const entry = RULE_MAP[equipmentId];
  return {
    equipmentId,
    description: entry.description,
    evaluate: entry.evaluate,
  };
}

/**
 * Get the description for a given equipment's power rule.
 */
export function getPowerRuleDescription(equipmentId: EquipmentId): string {
  return RULE_MAP[equipmentId].description;
}
