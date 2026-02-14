/**
 * Daily Ledger — fleet-wide income/expense tracking with trailing averages.
 *
 * Both income and expenses use 7-day rolling averages of actual spending.
 * Snapshots are recorded at each day boundary to track lifetime totals.
 */

import type { GameData } from './models';
import { calculateShipSalaryPerTick } from './crewRoles';
import { TICKS_PER_DAY, getDaysSinceEpoch } from './timeSystem';
import { getFinancials } from './models';

/** Maximum number of daily snapshots to retain (7-day window). */
const MAX_SNAPSHOTS = 7;

// ─── Snapshot management ────────────────────────────────────────────

/**
 * Record a snapshot at the end of the current game day.
 * Called once per day boundary crossing. Prunes to MAX_SNAPSHOTS.
 */
export function recordDailySnapshot(gameData: GameData): void {
  const currentDay = getDaysSinceEpoch(gameData.gameTime);
  const financials = getFinancials(gameData);

  // Avoid duplicate snapshots for the same day
  const existing = gameData.dailyLedgerSnapshots;
  if (
    existing.length > 0 &&
    existing[existing.length - 1].gameDay === currentDay
  ) {
    // Update the existing snapshot for today
    const snapshot = existing[existing.length - 1];
    snapshot.lifetimeCreditsEarned = gameData.lifetimeCreditsEarned;
    snapshot.lifetimeExpenseFuel = financials.expenseFuel;
    snapshot.lifetimeExpenseCrewSalaries = financials.expenseCrewSalaries;
    return;
  }

  existing.push({
    gameDay: currentDay,
    lifetimeCreditsEarned: gameData.lifetimeCreditsEarned,
    lifetimeExpenseFuel: financials.expenseFuel,
    lifetimeExpenseCrewSalaries: financials.expenseCrewSalaries,
  });

  // Keep only the most recent entries
  while (existing.length > MAX_SNAPSHOTS) {
    existing.shift();
  }
}

// ─── Ledger calculations ────────────────────────────────────────────

export interface DailyLedgerData {
  /** Credits earned today (since last day boundary). */
  todayIncome: number;
  /** Credits spent today (fuel + crew, since last day boundary). */
  todayExpenses: number;
  /** Net credits today (income - expenses). */
  todayNet: number;

  /** Average income per game day over the trailing window (0 if no data). */
  incomePerDay: number;
  /** Number of days of data the income average is based on. */
  incomeDays: number;
  /** Average crew salary expenses per game day (0 if no data). */
  crewCostPerDay: number;
  /** Average fuel expenses per game day (0 if no data). */
  fuelCostPerDay: number;
  /** Total average expenses per game day. */
  totalExpensePerDay: number;
  /** Net = income - expenses. Positive means growing, negative means shrinking. */
  netPerDay: number;
  /** Number of days of expense data the averages are based on. */
  expenseDays: number;
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
  const todayActuals = calculateTodayActuals(gameData);
  const incomeResult = calculateTrailingIncome(gameData);
  const expenseResult = calculateTrailingExpenses(gameData);

  const totalExpensePerDay =
    expenseResult.crewCostPerDay + expenseResult.fuelCostPerDay;
  const netPerDay = incomeResult.incomePerDay - totalExpensePerDay;

  let runwayDays: number | null = null;
  if (netPerDay < 0 && gameData.credits > 0) {
    runwayDays = gameData.credits / Math.abs(netPerDay);
  }

  return {
    todayIncome: todayActuals.todayIncome,
    todayExpenses: todayActuals.todayExpenses,
    todayNet: todayActuals.todayNet,
    incomePerDay: incomeResult.incomePerDay,
    incomeDays: incomeResult.days,
    crewCostPerDay: expenseResult.crewCostPerDay,
    fuelCostPerDay: expenseResult.fuelCostPerDay,
    totalExpensePerDay,
    netPerDay,
    expenseDays: expenseResult.days,
    runwayDays,
  };
}

// ─── Today's actuals ────────────────────────────────────────────

/**
 * Calculate actual income/expenses since the last day boundary.
 * Compares current lifetime totals against the most recent snapshot.
 */
function calculateTodayActuals(gameData: GameData): {
  todayIncome: number;
  todayExpenses: number;
  todayNet: number;
} {
  const snapshots = gameData.dailyLedgerSnapshots;
  if (snapshots.length === 0) {
    return { todayIncome: 0, todayExpenses: 0, todayNet: 0 };
  }

  const lastSnapshot = snapshots[snapshots.length - 1];
  const financials = getFinancials(gameData);

  const todayIncome =
    gameData.lifetimeCreditsEarned - lastSnapshot.lifetimeCreditsEarned;

  // Calculate today's expenses (fuel + crew)
  const todayFuel =
    (lastSnapshot.lifetimeExpenseFuel ?? 0) > 0
      ? financials.expenseFuel - (lastSnapshot.lifetimeExpenseFuel ?? 0)
      : 0;

  const todayCrew =
    (lastSnapshot.lifetimeExpenseCrewSalaries ?? 0) > 0
      ? financials.expenseCrewSalaries -
        (lastSnapshot.lifetimeExpenseCrewSalaries ?? 0)
      : 0;

  const todayExpenses = todayFuel + todayCrew;
  const todayNet = todayIncome - todayExpenses;

  return {
    todayIncome: Math.max(0, todayIncome),
    todayExpenses: Math.max(0, todayExpenses),
    todayNet,
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

// ─── Expense averaging ──────────────────────────────────────────────

/**
 * Calculate trailing average expenses from actual spending snapshots.
 * Uses the same delta/daySpan pattern as income averaging.
 * Falls back to deterministic crew salary projection when no expense data exists.
 */
function calculateTrailingExpenses(gameData: GameData): {
  crewCostPerDay: number;
  fuelCostPerDay: number;
  days: number;
} {
  const snapshots = gameData.dailyLedgerSnapshots;

  // Filter for snapshots that have expense data
  const expenseSnapshots = snapshots.filter(
    (s) =>
      s.lifetimeExpenseFuel !== undefined &&
      s.lifetimeExpenseCrewSalaries !== undefined
  );

  if (expenseSnapshots.length < 2) {
    // Fallback: deterministic crew salary projection, zero for fuel
    let crewPerTick = 0;
    for (const ship of gameData.ships) {
      crewPerTick += calculateShipSalaryPerTick(ship);
    }
    return {
      crewCostPerDay: crewPerTick * TICKS_PER_DAY,
      fuelCostPerDay: 0,
      days: 0,
    };
  }

  const oldest = expenseSnapshots[0];
  const newest = expenseSnapshots[expenseSnapshots.length - 1];
  const daySpan = newest.gameDay - oldest.gameDay;

  if (daySpan <= 0) {
    // Fallback: deterministic crew salary projection, zero for fuel
    let crewPerTick = 0;
    for (const ship of gameData.ships) {
      crewPerTick += calculateShipSalaryPerTick(ship);
    }
    return {
      crewCostPerDay: crewPerTick * TICKS_PER_DAY,
      fuelCostPerDay: 0,
      days: 0,
    };
  }

  const fuelSpentInWindow =
    newest.lifetimeExpenseFuel! - oldest.lifetimeExpenseFuel!;
  const crewSpentInWindow =
    newest.lifetimeExpenseCrewSalaries! - oldest.lifetimeExpenseCrewSalaries!;

  return {
    crewCostPerDay: Math.max(0, crewSpentInWindow / daySpan),
    fuelCostPerDay: Math.max(0, fuelSpentInWindow / daySpan),
    days: daySpan,
  };
}
