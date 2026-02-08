import type { GameData, Ship, Quest } from './models';
import { getShipClass } from './shipClasses';
import { getEngineDefinition } from './engines';
import { computeMaxRange, calculateFuelCost } from './flightPhysics';
import { getCrewRoleDefinition } from './crewRoles';
import { getDistanceBetween } from './worldGen';
import { TICKS_PER_DAY } from './timeSystem';

/**
 * Fleet Analytics
 * Helper functions for fleet management UI
 */

// Ship Status Types
export type ShipStatus =
  | 'earning'
  | 'idle'
  | 'warning'
  | 'critical'
  | 'maintenance';

export interface ShipHealthAlert {
  severity: 'critical' | 'warning';
  message: string;
  action?: string;
}

export interface ShipPerformance {
  netProfit: number;
  creditsPerDay: number;
  uptime: number; // 0-100%
  efficiency: number; // credits per tick
}

/**
 * Determine ship's overall status
 */
export function getShipStatus(ship: Ship): ShipStatus {
  const alerts = getShipHealthAlerts(ship);

  // Critical issues take priority
  if (alerts.some((a) => a.severity === 'critical')) {
    return 'critical';
  }

  // Warnings second
  if (alerts.some((a) => a.severity === 'warning')) {
    return 'warning';
  }

  // Active contract = earning
  if (ship.activeContract && !ship.activeContract.paused) {
    return 'earning';
  }

  // Equipment degradation needs maintenance
  const needsMaintenance = ship.equipment.some((e) => e.degradation > 60);
  if (needsMaintenance) {
    return 'maintenance';
  }

  // Docked with crew but no contract = idle (wasting money)
  if (ship.location.status === 'docked' && ship.crew.length > 1) {
    return 'idle';
  }

  return 'idle';
}

/**
 * Get list of health alerts for a ship
 */
export function getShipHealthAlerts(ship: Ship): ShipHealthAlert[] {
  const alerts: ShipHealthAlert[] = [];

  // Critical: No fuel
  if (ship.fuel < 10) {
    alerts.push({
      severity: 'critical',
      message: `Fuel critically low: ${Math.round(ship.fuel)}%`,
      action: 'Refuel immediately',
    });
  }

  // Critical: Unpaid crew will leave
  const unpaidCrew = ship.crew.filter((c) => c.unpaidTicks > 0 && !c.isCaptain);
  if (unpaidCrew.length > 0) {
    const days = Math.ceil(unpaidCrew[0].unpaidTicks / TICKS_PER_DAY);
    alerts.push({
      severity: 'critical',
      message: `${unpaidCrew.length} crew unpaid (${days} days) - will leave at next dock`,
      action: 'Need credits to pay crew',
    });
  }

  // Warning: Low fuel (relative to range)
  if (ship.fuel >= 10 && ship.fuel < 30) {
    alerts.push({
      severity: 'warning',
      message: `Fuel low: ${Math.round(ship.fuel)}%`,
      action: 'Refuel soon',
    });
  }

  // Warning: Equipment degraded
  const degradedEquipment = ship.equipment.filter((e) => e.degradation > 60);
  if (degradedEquipment.length > 0) {
    alerts.push({
      severity: 'warning',
      message: `${degradedEquipment.length} equipment degraded (>60%)`,
      action: 'Repair needed',
    });
  }

  // Warning: Zero-G exposure
  const crewWithExposure = ship.crew.filter((c) => c.zeroGExposure >= 14);
  if (crewWithExposure.length > 0) {
    const maxExposure = Math.max(
      ...crewWithExposure.map((c) => c.zeroGExposure)
    );
    const days = Math.floor(maxExposure);
    let level = 'Minor';
    if (maxExposure >= 365) level = 'Critical';
    else if (maxExposure >= 180) level = 'Severe';
    else if (maxExposure >= 60) level = 'Moderate';

    alerts.push({
      severity: maxExposure >= 180 ? 'critical' : 'warning',
      message: `Crew zero-G exposure: ${days} days (${level} atrophy)`,
      action: 'Dock at planetary station or add gravity equipment',
    });
  }

  // Warning: Missing critical crew roles
  const hasPilot = ship.crew.some((c) => c.role === 'pilot');
  const hasEngineer = ship.crew.some((c) => c.role === 'engineer');
  const shipClass = getShipClass(ship.classId);

  if (!hasPilot && shipClass && shipClass.maxCrew > 1) {
    alerts.push({
      severity: 'warning',
      message: 'No Pilot assigned',
      action: 'Hire pilot for optimal operations',
    });
  }

  if (!hasEngineer && shipClass && shipClass.maxCrew > 2) {
    alerts.push({
      severity: 'warning',
      message: 'No Engineer assigned',
      action: 'Hire engineer for maintenance',
    });
  }

  return alerts;
}

/**
 * Calculate ship performance metrics
 */
export function getShipPerformance(ship: Ship): ShipPerformance {
  const totalTicks =
    ship.metrics.totalFlightTicks + ship.metrics.totalIdleTicks;
  const totalCosts =
    ship.metrics.crewCostsPaid +
    ship.metrics.fuelCostsPaid +
    ship.metrics.repairCostsPaid;
  const netProfit = ship.metrics.creditsEarned - totalCosts;

  const uptime =
    totalTicks > 0 ? (ship.metrics.totalFlightTicks / totalTicks) * 100 : 0;

  const creditsPerDay =
    totalTicks > 0
      ? (ship.metrics.creditsEarned / totalTicks) * TICKS_PER_DAY
      : 0;

  const efficiency =
    totalTicks > 0 ? ship.metrics.creditsEarned / totalTicks : 0;

  return {
    netProfit,
    creditsPerDay,
    uptime,
    efficiency,
  };
}

/**
 * Get contextual fuel information
 */
export function getFuelContext(ship: Ship, gameData: GameData): string {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return `${Math.round(ship.fuel)}%`;

  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = computeMaxRange(shipClass, engineDef);

  // Find nearest location for reference
  let nearestDist = Infinity;
  let nearestName = '';

  for (const loc of gameData.world.locations) {
    if (ship.location.dockedAt === loc.id) continue;

    const currentLoc = gameData.world.locations.find(
      (l) => l.id === ship.location.dockedAt
    );
    if (!currentLoc) continue;

    const dist = getDistanceBetween(currentLoc, loc);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestName = loc.name;
    }
  }

  if (nearestName && nearestDist < Infinity) {
    const fuelCost = calculateFuelCost(nearestDist, maxRangeKm);
    const trips = ship.fuel / fuelCost;
    return `${Math.round(ship.fuel)}% (${trips.toFixed(1)} trips to ${nearestName})`;
  }

  return `${Math.round(ship.fuel)}%`;
}

/**
 * Calculate ship-contract suitability score (1-5 stars)
 */
export interface ContractMatch {
  score: number; // 1-5
  reasons: string[];
  estimatedProfit: number;
}

export function matchShipToContract(
  ship: Ship,
  quest: Quest,
  gameData: GameData
): ContractMatch {
  let score = 3; // Start at neutral
  const reasons: string[] = [];

  const shipClass = getShipClass(ship.classId);
  if (!shipClass) {
    return { score: 1, reasons: ['Unknown ship class'], estimatedProfit: 0 };
  }

  // Check if ship is at origin
  const atOrigin = ship.location.dockedAt === quest.origin;
  if (atOrigin) {
    score += 1;
    reasons.push('✅ At origin (no travel needed)');
  } else {
    score -= 0.5;
    const origin = gameData.world.locations.find((l) => l.id === quest.origin);
    reasons.push(`⚠️ Must travel to ${origin?.name || quest.origin} first`);
  }

  // Check range sufficiency
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const maxRangeKm = computeMaxRange(shipClass, engineDef);
  const origin = gameData.world.locations.find((l) => l.id === quest.origin);
  const dest = gameData.world.locations.find((l) => l.id === quest.destination);

  if (origin && dest) {
    const dist = getDistanceBetween(origin, dest);
    const fuelCost = calculateFuelCost(dist, maxRangeKm);

    if (ship.fuel < fuelCost * 1.2) {
      score -= 1;
      reasons.push('❌ Insufficient fuel for trip');
    } else if (dist > maxRangeKm * 0.9) {
      score -= 0.5;
      reasons.push('⚠️ Trip uses 90%+ of max range');
    } else {
      score += 0.5;
      reasons.push('✅ Range sufficient');
    }
  }

  // Check cargo capacity
  if (quest.cargoRequired > 0) {
    if (quest.cargoRequired > shipClass.cargoCapacity) {
      score = 1;
      reasons.push(
        `❌ Cargo: ${quest.cargoRequired} kg (ship max: ${shipClass.cargoCapacity} kg)`
      );
    } else if (quest.cargoRequired > shipClass.cargoCapacity * 0.8) {
      score -= 0.5;
      reasons.push(
        `⚠️ Cargo tight: ${quest.cargoRequired} kg (${Math.round((quest.cargoRequired / shipClass.cargoCapacity) * 100)}% capacity)`
      );
    } else {
      score += 0.5;
      reasons.push(
        `✅ Cargo: ${quest.cargoRequired} kg (${Math.round((quest.cargoRequired / shipClass.cargoCapacity) * 100)}% capacity)`
      );
    }
  }

  // Check crew readiness
  if (ship.crew.length === 0) {
    score -= 1;
    reasons.push('⚠️ No crew aboard');
  }

  // Check if ship is available
  if (ship.activeContract && !ship.activeContract.paused) {
    score = 1;
    reasons.push('❌ Ship busy with active contract');
  }

  if (ship.location.status === 'in_flight') {
    score -= 1;
    reasons.push('⚠️ Ship currently in flight');
  }

  // Estimate profit
  let estimatedProfit =
    quest.paymentOnCompletion ||
    quest.paymentPerTrip * (quest.tripsRequired || 1);

  // Subtract estimated fuel costs
  if (origin && dest) {
    const dist = getDistanceBetween(origin, dest);
    const fuelCost = calculateFuelCost(dist, maxRangeKm);
    const fuelCreditCost = fuelCost * 5; // 5 credits per fuel %
    const trips = quest.tripsRequired === -1 ? 5 : quest.tripsRequired || 1;
    estimatedProfit -= fuelCreditCost * trips * 2; // Round trip
  }

  // Subtract estimated crew costs
  let crewCostPerTrip = 0;
  for (const crew of ship.crew) {
    const roleDef = getCrewRoleDefinition(crew.role);
    if (roleDef) {
      crewCostPerTrip += roleDef.salary * (quest.estimatedTripTicks || 10) * 2; // Round trip
    }
  }
  estimatedProfit -= crewCostPerTrip * (quest.tripsRequired || 1);

  // Clamp score to 1-5
  score = Math.max(1, Math.min(5, Math.round(score)));

  return {
    score,
    reasons,
    estimatedProfit,
  };
}

/**
 * Get missing critical crew roles
 */
export function getMissingCrewRoles(ship: Ship): string[] {
  const missing: string[] = [];
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return missing;

  const hasPilot = ship.crew.some((c) => c.role === 'pilot');
  const hasNavigator = ship.crew.some((c) => c.role === 'navigator');
  const hasEngineer = ship.crew.some((c) => c.role === 'engineer');

  if (!hasPilot && shipClass.maxCrew > 1) {
    missing.push('Pilot');
  }

  if (!hasNavigator && shipClass.maxCrew > 2) {
    missing.push('Navigator');
  }

  if (!hasEngineer && shipClass.maxCrew > 2) {
    missing.push('Engineer');
  }

  return missing;
}
