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

const POWER_PRIORITY_RULES: PowerPriorityRule[] = [
  // === CRITICAL (priority 0): never shed ===
  {
    equipmentId: 'life_support',
    description: 'Always powered — crew survival',
    evaluate: () => ({
      shouldPower: true,
      priority: 0,
      reason: 'life support critical',
    }),
  },
  {
    equipmentId: 'air_filters',
    description: 'Always powered — supplemental oxygen',
    evaluate: () => ({
      shouldPower: true,
      priority: 0,
      reason: 'air filtration critical',
    }),
  },

  // === HIGH (priority 1): engine-dependent protection ===
  {
    equipmentId: 'rad_shield_basic',
    description: 'Radiation protection when engine active',
    evaluate: (ship) => {
      const active = isEngineActive(ship);
      return {
        shouldPower: active,
        priority: active ? 1 : 3,
        reason: active ? 'engine radiation' : 'engine off',
      };
    },
  },
  {
    equipmentId: 'rad_shield_heavy',
    description: 'Heavy radiation protection when engine active',
    evaluate: (ship) => {
      const active = isEngineActive(ship);
      return {
        shouldPower: active,
        priority: active ? 1 : 3,
        reason: active ? 'engine radiation' : 'engine off',
      };
    },
  },
  {
    equipmentId: 'heat_radiator_basic',
    description: 'Heat dissipation when engine active',
    evaluate: (ship) => {
      const active = isEngineActive(ship);
      return {
        shouldPower: active,
        priority: active ? 1 : 3,
        reason: active ? 'engine heat' : 'engine off',
      };
    },
  },
  {
    equipmentId: 'heat_radiator_heavy',
    description: 'Active cooling when engine active',
    evaluate: (ship) => {
      const active = isEngineActive(ship);
      return {
        shouldPower: active,
        priority: active ? 1 : 3,
        reason: active ? 'engine heat' : 'engine off',
      };
    },
  },
  {
    equipmentId: 'mag_confinement',
    description: 'Fusion containment when engine active',
    evaluate: (ship) => {
      const active = isEngineActive(ship);
      return {
        shouldPower: active,
        priority: active ? 1 : 3,
        reason: active ? 'containment required' : 'engine off',
      };
    },
  },

  // === MEDIUM (priority 2): situational ===
  {
    equipmentId: 'point_defense',
    description: 'Automated defense during flight',
    evaluate: (ship) => {
      const inFlight = isInFlight(ship);
      return {
        shouldPower: inFlight,
        priority: inFlight ? 2 : 3,
        reason: inFlight ? 'in flight' : 'not in flight',
      };
    },
  },
  {
    equipmentId: 'deflector_shield',
    description: 'Debris deflection during flight',
    evaluate: (ship) => {
      const inFlight = isInFlight(ship);
      return {
        shouldPower: inFlight,
        priority: inFlight ? 2 : 3,
        reason: inFlight ? 'in flight' : 'not in flight',
      };
    },
  },
  {
    equipmentId: 'micro_deflector',
    description: 'Micro debris deflection during flight',
    evaluate: (ship) => {
      const inFlight = isInFlight(ship);
      return {
        shouldPower: inFlight,
        priority: inFlight ? 2 : 3,
        reason: inFlight ? 'in flight' : 'not in flight',
      };
    },
  },
  {
    equipmentId: 'point_defense_laser',
    description: 'Laser point defense during flight',
    evaluate: (ship) => {
      const inFlight = isInFlight(ship);
      return {
        shouldPower: inFlight,
        priority: inFlight ? 2 : 3,
        reason: inFlight ? 'in flight' : 'not in flight',
      };
    },
  },
  {
    equipmentId: 'nav_scanner',
    description: 'Hazard scanning during flight',
    evaluate: (ship) => {
      const inFlight = isInFlight(ship);
      return {
        shouldPower: inFlight,
        priority: inFlight ? 2 : 3,
        reason: inFlight ? 'in flight' : 'not in flight',
      };
    },
  },
  {
    equipmentId: 'accel_couches',
    description: 'G-force protection during flight',
    evaluate: (ship) => {
      const inFlight = isInFlight(ship);
      return {
        shouldPower: inFlight,
        priority: inFlight ? 2 : 3,
        reason: inFlight ? 'in flight' : 'not in flight',
      };
    },
  },
  {
    equipmentId: 'crash_couches',
    description: 'High-G protection during flight',
    evaluate: (ship) => {
      const inFlight = isInFlight(ship);
      return {
        shouldPower: inFlight,
        priority: inFlight ? 2 : 3,
        reason: inFlight ? 'in flight' : 'not in flight',
      };
    },
  },
  {
    equipmentId: 'centrifuge_pod',
    description: 'Spin gravity when in zero-g',
    evaluate: (ship) => {
      const needsGravity = !isDocked(ship);
      return {
        shouldPower: needsGravity,
        priority: needsGravity ? 2 : 3,
        reason: needsGravity ? 'zero-g environment' : 'station gravity',
      };
    },
  },
  {
    equipmentId: 'exercise_module',
    description: 'Zero-g degradation mitigation',
    evaluate: (ship) => {
      const needsExercise = !isDocked(ship);
      return {
        shouldPower: needsExercise,
        priority: needsExercise ? 2 : 3,
        reason: needsExercise ? 'zero-g environment' : 'station gravity',
      };
    },
  },
  {
    equipmentId: 'mining_laser',
    description: 'Powered during mining operations',
    evaluate: (ship) => {
      const mining = isActiveMining(ship);
      return {
        shouldPower: mining,
        priority: mining ? 2 : 3,
        reason: mining ? 'mining active' : 'not mining',
      };
    },
  },
  {
    equipmentId: 'mining_rig',
    description: 'Powered during mining operations',
    evaluate: (ship) => {
      const mining = isActiveMining(ship);
      return {
        shouldPower: mining,
        priority: mining ? 2 : 3,
        reason: mining ? 'mining active' : 'not mining',
      };
    },
  },
  {
    equipmentId: 'deep_core_mining',
    description: 'Powered during mining operations',
    evaluate: (ship) => {
      const mining = isActiveMining(ship);
      return {
        shouldPower: mining,
        priority: mining ? 2 : 3,
        reason: mining ? 'mining active' : 'not mining',
      };
    },
  },
  {
    equipmentId: 'quantum_mining',
    description: 'Powered during mining operations',
    evaluate: (ship) => {
      const mining = isActiveMining(ship);
      return {
        shouldPower: mining,
        priority: mining ? 2 : 3,
        reason: mining ? 'mining active' : 'not mining',
      };
    },
  },
];

let rulesByEquipmentId: Map<EquipmentId, PowerPriorityRule> | null = null;

function getRulesMap(): Map<EquipmentId, PowerPriorityRule> {
  if (!rulesByEquipmentId) {
    rulesByEquipmentId = new Map();
    for (const rule of POWER_PRIORITY_RULES) {
      rulesByEquipmentId.set(rule.equipmentId, rule);
    }
  }
  return rulesByEquipmentId;
}

/**
 * Get the power priority rule for a given equipment type.
 * Returns a default rule (shouldPower: true, priority: 2) for unknown equipment.
 */
export function getPowerPriorityRule(
  equipmentId: EquipmentId
): PowerPriorityRule {
  return (
    getRulesMap().get(equipmentId) ?? {
      equipmentId,
      description: 'Standard equipment',
      evaluate: () => ({
        shouldPower: true,
        priority: 2 as PriorityLevel,
        reason: 'default',
      }),
    }
  );
}

/**
 * Get the description for a given equipment's power rule.
 */
export function getPowerRuleDescription(equipmentId: EquipmentId): string {
  return getPowerPriorityRule(equipmentId).description;
}
