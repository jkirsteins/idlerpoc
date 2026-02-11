/**
 * Daily Ledger — fleet-wide income/expense projections and trailing averages.
 *
 * Income uses a 7-day rolling average of actual earnings (smooths lumpy
 * contract/mining payouts). Expenses are projected deterministically from
 * current fleet state (crew salaries + estimated fuel burn for active routes).
 */

import type { GameData, Ship } from './models';
import { calculateShipSalaryPerTick } from './crewRoles';
import {
  TICKS_PER_DAY,
  getDaysSinceEpoch,
  GAME_SECONDS_PER_TICK,
} from './timeSystem';
import { calculateOneLegFuelKg } from './flightPhysics';
import { estimateTripTime } from './questGen';
import { getFuelPricePerKg } from './ui/refuelDialog';
import { getDistanceBetween } from './utils';

/** Maximum number of daily snapshots to retain (7-day window). */
const MAX_SNAPSHOTS = 7;

// ─── Snapshot management ────────────────────────────────────────────

/**
 * Record a snapshot at the end of the current game day.
 * Called once per day boundary crossing. Prunes to MAX_SNAPSHOTS.
 */
export function recordDailySnapshot(gameData: GameData): void {
  const currentDay = getDaysSinceEpoch(gameData.gameTime);

  // Avoid duplicate snapshots for the same day
  const existing = gameData.dailyLedgerSnapshots;
  if (
    existing.length > 0 &&
    existing[existing.length - 1].gameDay === currentDay
  ) {
    // Update the existing snapshot for today
    existing[existing.length - 1].lifetimeCreditsEarned =
      gameData.lifetimeCreditsEarned;
    return;
  }

  existing.push({
    gameDay: currentDay,
    lifetimeCreditsEarned: gameData.lifetimeCreditsEarned,
  });

  // Keep only the most recent entries
  while (existing.length > MAX_SNAPSHOTS) {
    existing.shift();
  }
}

// ─── Ledger calculations ────────────────────────────────────────────

export interface DailyLedgerData {
  /** Average income per game day over the trailing window (0 if no data). */
  incomePerDay: number;
  /** Number of days of data the income average is based on. */
  incomeDays: number;
  /** Projected crew salary expenses per game day (deterministic). */
  crewCostPerDay: number;
  /** Projected fuel expenses per game day (estimated from active routes). */
  fuelCostPerDay: number;
  /** Total projected expenses per game day. */
  totalExpensePerDay: number;
  /** Net = income - expenses. Positive means growing, negative means shrinking. */
  netPerDay: number;
  /**
   * Days of runway remaining if net is negative (credits / |netPerDay|).
   * null if net >= 0 (sustainable) or expenses are zero.
   */
  runwayDays: number | null;
}

/**
 * Compute the daily ledger summary for the entire fleet.
 */
export function calculateDailyLedger(gameData: GameData): DailyLedgerData {
  const incomeResult = calculateTrailingIncome(gameData);
  const crewCostPerDay = calculateFleetCrewCostPerDay(gameData);
  const fuelCostPerDay = calculateFleetFuelCostPerDay(gameData);
  const totalExpensePerDay = crewCostPerDay + fuelCostPerDay;
  const netPerDay = incomeResult.incomePerDay - totalExpensePerDay;

  let runwayDays: number | null = null;
  if (netPerDay < 0 && gameData.credits > 0) {
    runwayDays = gameData.credits / Math.abs(netPerDay);
  }

  return {
    incomePerDay: incomeResult.incomePerDay,
    incomeDays: incomeResult.days,
    crewCostPerDay,
    fuelCostPerDay,
    totalExpensePerDay,
    netPerDay,
    runwayDays,
  };
}

// ─── Income averaging ───────────────────────────────────────────────

function calculateTrailingIncome(gameData: GameData): {
  incomePerDay: number;
  days: number;
} {
  const snapshots = gameData.dailyLedgerSnapshots;
  if (snapshots.length < 2) {
    return { incomePerDay: 0, days: 0 };
  }

  const oldest = snapshots[0];
  const newest = snapshots[snapshots.length - 1];
  const daySpan = newest.gameDay - oldest.gameDay;

  if (daySpan <= 0) {
    return { incomePerDay: 0, days: 0 };
  }

  const creditsEarnedInWindow =
    newest.lifetimeCreditsEarned - oldest.lifetimeCreditsEarned;
  return {
    incomePerDay: Math.max(0, creditsEarnedInWindow / daySpan),
    days: daySpan,
  };
}

// ─── Expense projection ─────────────────────────────────────────────

function calculateFleetCrewCostPerDay(gameData: GameData): number {
  let totalPerTick = 0;
  for (const ship of gameData.ships) {
    totalPerTick += calculateShipSalaryPerTick(ship);
  }
  return totalPerTick * TICKS_PER_DAY;
}

/**
 * Estimate fleet-wide daily fuel cost from active routes.
 * For each ship with a route/contract, calculates fuel consumed per round trip
 * and divides by estimated trip time to get a daily rate.
 */
function calculateFleetFuelCostPerDay(gameData: GameData): number {
  let totalFuelCostPerDay = 0;

  for (const ship of gameData.ships) {
    totalFuelCostPerDay += estimateShipFuelCostPerDay(ship, gameData);
  }

  return totalFuelCostPerDay;
}

function estimateShipFuelCostPerDay(ship: Ship, gameData: GameData): number {
  // Determine route origin/destination from active route or contract
  const route = getShipRouteInfo(ship, gameData);
  if (!route) return 0;

  const { originLoc, destLoc } = route;
  const distanceKm = getDistanceBetween(originLoc, destLoc);
  if (distanceKm <= 0) return 0;

  // Fuel cost per one-way leg (in kg)
  const fuelPerLegKg = calculateOneLegFuelKg(
    ship,
    distanceKm,
    ship.flightProfileBurnFraction
  );
  const fuelPerRoundTripKg = fuelPerLegKg * 2;

  // Use origin station fuel price as representative cost
  const pricePerKg = getFuelPricePerKg(originLoc, ship);
  const fuelCostPerRoundTrip = fuelPerRoundTripKg * pricePerKg;

  // Estimate round trip time in ticks
  const tripTimeSecs = estimateTripTime(
    ship,
    distanceKm,
    ship.flightProfileBurnFraction
  );
  const roundTripTicks = (tripTimeSecs * 2) / GAME_SECONDS_PER_TICK;

  if (roundTripTicks <= 0) return 0;

  const tripsPerDay = TICKS_PER_DAY / roundTripTicks;
  return fuelCostPerRoundTrip * tripsPerDay;
}

/**
 * Extract current route info from a ship's active assignment.
 * Returns null if the ship has no active route.
 */
function getShipRouteInfo(
  ship: Ship,
  gameData: GameData
): {
  originLoc: import('./models').WorldLocation;
  destLoc: import('./models').WorldLocation;
} | null {
  const locations = gameData.world.locations;

  // Trade route assignment
  if (ship.routeAssignment) {
    const originLoc = locations.find(
      (l) => l.id === ship.routeAssignment!.originId
    );
    const destLoc = locations.find(
      (l) => l.id === ship.routeAssignment!.destinationId
    );
    if (originLoc && destLoc) return { originLoc, destLoc };
  }

  // Mining route
  if (ship.miningRoute) {
    const originLoc = locations.find(
      (l) => l.id === ship.miningRoute!.mineLocationId
    );
    const destLoc = locations.find(
      (l) => l.id === ship.miningRoute!.sellLocationId
    );
    if (originLoc && destLoc) return { originLoc, destLoc };
  }

  // Active contract (non-paused)
  if (ship.activeContract && !ship.activeContract.paused) {
    const quest = ship.activeContract.quest;
    const originLoc = locations.find((l) => l.id === quest.origin);
    const destLoc = locations.find((l) => l.id === quest.destination);
    if (originLoc && destLoc) return { originLoc, destLoc };
  }

  return null;
}
