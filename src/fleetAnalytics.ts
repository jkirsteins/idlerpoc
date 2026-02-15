import type { GameData, Ship, Quest } from './models';
import { getShipClass } from './shipClasses';
import {
  calculateShipAvailableCargo,
  calculateOneLegFuelKg,
} from './flightPhysics';
import { calculateShipSalaryPerTick } from './crewRoles';
import { getDistanceBetween } from './worldGen';
import { TICKS_PER_DAY, GAME_SECONDS_PER_DAY } from './timeSystem';
import { formatExposureDays } from './gravitySystem';
import { formatFuelMass, calculateFuelPercentage } from './ui/fuelFormatting';
import { resolveQuestForShip } from './questGen';

// Average fuel price for profit estimates (matches questGen.ts FUEL_PRICE_PER_KG).
// Actual station prices vary by location (1.6–5.0 cr/kg via getFuelPricePerKg).
const FUEL_PRICE_PER_KG = 2.0;

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

  // Docked or orbiting with crew but no contract = idle (wasting money)
  if (
    (ship.location.status === 'docked' ||
      ship.location.status === 'orbiting') &&
    ship.crew.length > 1
  ) {
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
  const fuelPercent = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  if (fuelPercent < 10) {
    alerts.push({
      severity: 'critical',
      message: `Fuel critically low: ${Math.round(fuelPercent)}% (${formatFuelMass(ship.fuelKg)})`,
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
  if (fuelPercent >= 10 && fuelPercent < 30) {
    alerts.push({
      severity: 'warning',
      message: `Fuel low: ${Math.round(fuelPercent)}% (${formatFuelMass(ship.fuelKg)})`,
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

  // Warning: Zero-G exposure (zeroGExposure is stored in game-seconds)
  const crewWithExposure = ship.crew.filter(
    (c) => c.zeroGExposure >= 14 * GAME_SECONDS_PER_DAY
  );
  if (crewWithExposure.length > 0) {
    const maxExposure = Math.max(
      ...crewWithExposure.map((c) => c.zeroGExposure)
    );
    const days = formatExposureDays(maxExposure);
    let level = 'Minor';
    if (maxExposure >= 365 * GAME_SECONDS_PER_DAY) level = 'Critical';
    else if (maxExposure >= 180 * GAME_SECONDS_PER_DAY) level = 'Severe';
    else if (maxExposure >= 60 * GAME_SECONDS_PER_DAY) level = 'Moderate';

    alerts.push({
      severity:
        maxExposure >= 180 * GAME_SECONDS_PER_DAY ? 'critical' : 'warning',
      message: `Crew zero-G exposure: ${days} days (${level} atrophy)`,
      action: 'Dock at planetary station or add gravity equipment',
    });
  }

  // Warning: Missing critical crew roles
  const hasPilot = ship.crew.some((c) => c.role === 'pilot');
  const hasMiner = ship.crew.some((c) => c.role === 'miner');
  const shipClass = getShipClass(ship.classId);

  if (!hasPilot && shipClass && shipClass.maxCrew > 1) {
    alerts.push({
      severity: 'warning',
      message: 'No Pilot assigned',
      action: 'Hire pilot for optimal operations',
    });
  }

  if (!hasMiner && shipClass && shipClass.maxCrew > 2) {
    alerts.push({
      severity: 'warning',
      message: 'No Miner assigned',
      action: 'Hire miner for resource extraction',
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
    ship.metrics.totalFlightTicks > 0
      ? (ship.metrics.creditsEarned / ship.metrics.totalFlightTicks) *
        TICKS_PER_DAY
      : 0;

  const efficiency =
    ship.metrics.totalFlightTicks > 0
      ? ship.metrics.creditsEarned / ship.metrics.totalFlightTicks
      : 0;

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
  const fuelPercent = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);

  // Find nearest location for reference
  let nearestDist = Infinity;
  let nearestName = '';

  for (const loc of gameData.world.locations) {
    const currentLocationId =
      ship.location.dockedAt || ship.location.orbitingAt;
    if (currentLocationId === loc.id) continue;

    const currentLoc = gameData.world.locations.find(
      (l) => l.id === currentLocationId
    );
    if (!currentLoc) continue;

    const dist = getDistanceBetween(currentLoc, loc);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestName = loc.name;
    }
  }

  if (nearestName && nearestDist < Infinity) {
    const fuelNeededKg = calculateOneLegFuelKg(ship, nearestDist);
    const trips = fuelNeededKg > 0 ? ship.fuelKg / fuelNeededKg : Infinity;
    return `${Math.round(fuelPercent)}% (${formatFuelMass(ship.fuelKg)}, ${trips.toFixed(1)} trips to ${nearestName})`;
  }

  return `${Math.round(fuelPercent)}% (${formatFuelMass(ship.fuelKg)})`;
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

  // Resolve quest template for this ship so scoring uses per-ship values
  quest = resolveQuestForShip(quest, ship, gameData.world);

  // Check if ship is at origin
  const currentLocationId = ship.location.dockedAt || ship.location.orbitingAt;
  const atOrigin = currentLocationId === quest.origin;
  if (atOrigin) {
    score += 1;
    reasons.push('✅ At origin (no travel needed)');
  } else {
    score -= 0.5;
    const origin = gameData.world.locations.find((l) => l.id === quest.origin);
    reasons.push(`⚠️ Must travel to ${origin?.name || quest.origin} first`);
  }

  // Check range sufficiency
  const origin = gameData.world.locations.find((l) => l.id === quest.origin);
  const dest = gameData.world.locations.find((l) => l.id === quest.destination);

  if (origin && dest) {
    const dist = getDistanceBetween(origin, dest);
    const fuelNeededKg = calculateOneLegFuelKg(ship, dist);

    if (ship.fuelKg < fuelNeededKg * 1.2) {
      score -= 1;
      reasons.push('❌ Insufficient fuel for trip');
    } else if (fuelNeededKg > ship.maxFuelKg * 0.9) {
      score -= 0.5;
      reasons.push('⚠️ Trip uses 90%+ of tank capacity');
    } else {
      score += 0.5;
      reasons.push('✅ Range sufficient');
    }
  }

  // Check cargo capacity (available space after all current hold contents)
  if (quest.cargoRequired > 0) {
    const availableCargo = calculateShipAvailableCargo(ship);
    if (quest.cargoRequired > availableCargo) {
      score = 1;
      reasons.push(
        `❌ Cargo: ${quest.cargoRequired} kg (ship max: ${Math.floor(availableCargo)} kg)`
      );
    } else if (quest.cargoRequired > availableCargo * 0.8) {
      score -= 0.5;
      reasons.push(
        `⚠️ Cargo tight: ${quest.cargoRequired} kg (${Math.round((quest.cargoRequired / availableCargo) * 100)}% capacity)`
      );
    } else {
      score += 0.5;
      reasons.push(
        `✅ Cargo: ${quest.cargoRequired} kg (${Math.round((quest.cargoRequired / availableCargo) * 100)}% capacity)`
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
    const fuelPerLegKg = calculateOneLegFuelKg(ship, dist);

    const fuelCreditCost = fuelPerLegKg * FUEL_PRICE_PER_KG;
    const trips = quest.tripsRequired === -1 ? 5 : quest.tripsRequired || 1;
    estimatedProfit -= fuelCreditCost * trips * 2; // Round trip
  }

  // Subtract estimated crew costs
  const salaryPerTick = calculateShipSalaryPerTick(ship);
  const crewCostPerTrip = salaryPerTick * (quest.estimatedTripTicks || 10) * 2; // Round trip
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
  const hasMiner = ship.crew.some((c) => c.role === 'miner');
  const hasTrader = ship.crew.some((c) => c.role === 'trader');

  if (!hasPilot && shipClass.maxCrew > 1) {
    missing.push('Pilot');
  }

  if (!hasMiner && shipClass.maxCrew > 2) {
    missing.push('Miner');
  }

  if (!hasTrader && shipClass.maxCrew > 3) {
    missing.push('Trader');
  }

  return missing;
}
