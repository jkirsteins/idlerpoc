import type { GameData } from '../models';
import type { Component } from './component';
import { getFinancials } from '../models';
import {
  calculateAssetBreakdown,
  type AssetBreakdown,
} from '../assetValuation';
import { calculateDailyLedger } from '../dailyLedger';
import { formatCredits } from '../formatting';

interface FinancesSnapshot {
  // Summary banner
  netWorth: number;
  dailyNet: number;
  runway: number | null; // days until broke, null if stable

  // Assets
  assets: AssetBreakdown;

  // Daily cash flow
  dailyIncome: number;
  dailyExpenseSalaries: number;
  dailyExpenseFuel: number;
  dailyNet2: number; // Redundant with dailyNet but kept for clarity

  // Lifetime financials
  incomeContracts: number;
  incomeOreSales: number;
  incomeBounties: number;
  incomeEquipmentSales: number;
  totalIncome: number;

  expenseCrewSalaries: number;
  expenseFuel: number;
  expenseProvisions: number;
  expenseCrewHiring: number;
  expenseEquipment: number;
  expenseShipEquipment: number;
  expenseShipPurchases: number;
  expenseCombatLosses: number;
  totalExpenses: number;

  lifetimeNet: number;
}

function snapshotFinances(gameData: GameData): FinancesSnapshot {
  const financials = getFinancials(gameData);
  const assets = calculateAssetBreakdown(gameData);
  const dailyLedger = calculateDailyLedger(gameData);

  const dailyNet = dailyLedger.netPerDay;

  // Runway calculation: days until broke (if losing money)
  let runway: number | null = null;
  if (dailyNet < 0) {
    runway = Math.floor(assets.cash / Math.abs(dailyNet));
  }

  const totalIncome =
    financials.incomeContracts +
    financials.incomeOreSales +
    financials.incomeBounties +
    financials.incomeEquipmentSales;

  const totalExpenses =
    financials.expenseCrewSalaries +
    financials.expenseFuel +
    financials.expenseProvisions +
    financials.expenseCrewHiring +
    financials.expenseEquipment +
    financials.expenseShipEquipment +
    financials.expenseShipPurchases +
    financials.expenseCombatLosses;

  return {
    netWorth: assets.totalAssets,
    dailyNet,
    runway,
    assets,
    dailyIncome: dailyLedger.incomePerDay,
    dailyExpenseSalaries: dailyLedger.crewCostPerDay,
    dailyExpenseFuel: dailyLedger.fuelCostPerDay,
    dailyNet2: dailyNet,
    incomeContracts: financials.incomeContracts,
    incomeOreSales: financials.incomeOreSales,
    incomeBounties: financials.incomeBounties,
    incomeEquipmentSales: financials.incomeEquipmentSales,
    totalIncome,
    expenseCrewSalaries: financials.expenseCrewSalaries,
    expenseFuel: financials.expenseFuel,
    expenseProvisions: financials.expenseProvisions,
    expenseCrewHiring: financials.expenseCrewHiring,
    expenseEquipment: financials.expenseEquipment,
    expenseShipEquipment: financials.expenseShipEquipment,
    expenseShipPurchases: financials.expenseShipPurchases,
    expenseCombatLosses: financials.expenseCombatLosses,
    totalExpenses,
    lifetimeNet: totalIncome - totalExpenses,
  };
}

function shallowEqual(a: FinancesSnapshot, b: FinancesSnapshot): boolean {
  return (
    a.netWorth === b.netWorth &&
    a.dailyNet === b.dailyNet &&
    a.runway === b.runway &&
    a.assets.cash === b.assets.cash &&
    a.assets.ships === b.assets.ships &&
    a.assets.shipEquipment === b.assets.shipEquipment &&
    a.assets.crewEquipment === b.assets.crewEquipment &&
    a.assets.fuel === b.assets.fuel &&
    a.assets.provisions === b.assets.provisions &&
    a.assets.ore === b.assets.ore &&
    a.dailyIncome === b.dailyIncome &&
    a.dailyExpenseSalaries === b.dailyExpenseSalaries &&
    a.dailyExpenseFuel === b.dailyExpenseFuel &&
    a.incomeContracts === b.incomeContracts &&
    a.incomeOreSales === b.incomeOreSales &&
    a.incomeBounties === b.incomeBounties &&
    a.incomeEquipmentSales === b.incomeEquipmentSales &&
    a.totalIncome === b.totalIncome &&
    a.expenseCrewSalaries === b.expenseCrewSalaries &&
    a.expenseFuel === b.expenseFuel &&
    a.expenseProvisions === b.expenseProvisions &&
    a.expenseCrewHiring === b.expenseCrewHiring &&
    a.expenseEquipment === b.expenseEquipment &&
    a.expenseShipEquipment === b.expenseShipEquipment &&
    a.expenseShipPurchases === b.expenseShipPurchases &&
    a.expenseCombatLosses === b.expenseCombatLosses &&
    a.totalExpenses === b.totalExpenses &&
    a.lifetimeNet === b.lifetimeNet
  );
}

export function createFinancesTab(_gameData: GameData): Component {
  const container = document.createElement('div');
  container.className = 'finances-container';
  container.style.cssText = `
    padding: 1rem;
    overflow-y: auto;
    max-height: calc(100vh - 160px);
  `;

  // ─── Section 1: Summary Banner ─────────────────────────────────

  const summaryBanner = document.createElement('div');
  summaryBanner.style.cssText = `
    display: flex;
    gap: 2rem;
    align-items: center;
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  `;

  const netWorthBox = document.createElement('div');
  netWorthBox.innerHTML = `
    <div style="font-size: 0.875rem; color: rgba(255,255,255,0.6); margin-bottom: 0.25rem;">Net Worth</div>
    <div style="font-size: 1.5rem; font-weight: bold; white-space: nowrap;" data-value="netWorth"></div>
  `;

  const dailyNetBox = document.createElement('div');
  dailyNetBox.innerHTML = `
    <div style="font-size: 0.875rem; color: rgba(255,255,255,0.6); margin-bottom: 0.25rem;">Daily Net</div>
    <div style="font-size: 1.25rem; font-weight: bold; white-space: nowrap;" data-value="dailyNet"></div>
  `;

  const runwayBox = document.createElement('div');
  runwayBox.innerHTML = `
    <div style="font-size: 0.875rem; color: rgba(255,255,255,0.6); margin-bottom: 0.25rem;">Runway</div>
    <div style="font-size: 1.25rem; font-weight: bold; white-space: nowrap;" data-value="runway"></div>
  `;

  summaryBanner.appendChild(netWorthBox);
  summaryBanner.appendChild(dailyNetBox);
  summaryBanner.appendChild(runwayBox);
  container.appendChild(summaryBanner);

  // ─── Section 2: Assets Table ──────────────────────────────────

  const assetsSection = document.createElement('section');
  assetsSection.style.cssText = `margin-bottom: 2rem;`;
  assetsSection.innerHTML = `
    <h2 style="color: #e94560; margin-bottom: 1rem; font-size: 1.25rem;">Assets</h2>
  `;

  const assetsTable = document.createElement('table');
  assetsTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
  `;
  assetsTable.innerHTML = `
    <tbody>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4a9eff; white-space: nowrap;">Cash</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="assetsCash"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4a9eff; white-space: nowrap;">Ships</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="assetsShips"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4a9eff; white-space: nowrap;">Ship Equipment</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="assetsShipEquipment"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4a9eff; white-space: nowrap;">Crew Equipment</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="assetsCrewEquipment"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4a9eff; white-space: nowrap;">Fuel</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="assetsFuel"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4a9eff; white-space: nowrap;">Provisions</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="assetsProvisions"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4a9eff; white-space: nowrap;">Ore Cargo</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="assetsOre"></td>
      </tr>
      <tr style="border-top: 2px solid rgba(255,255,255,0.12);">
        <td style="padding: 0.75rem; padding-left: 0; font-weight: bold; white-space: nowrap;">Total Assets</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; font-weight: bold; white-space: nowrap;" data-value="assetsTotalAssets"></td>
      </tr>
    </tbody>
  `;
  assetsSection.appendChild(assetsTable);
  container.appendChild(assetsSection);

  // ─── Section 3: Daily Cash Flow ───────────────────────────────

  const dailySection = document.createElement('section');
  dailySection.style.cssText = `margin-bottom: 2rem;`;
  dailySection.innerHTML = `
    <h2 style="color: #e94560; margin-bottom: 1rem; font-size: 1.25rem;">Daily Cash Flow</h2>
  `;

  const dailyTable = document.createElement('table');
  dailyTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
  `;
  dailyTable.innerHTML = `
    <tbody>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4caf50; white-space: nowrap;">Income (7-day avg)</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="dailyIncome"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Crew Salaries</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="dailyExpenseSalaries"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Fuel (projected)</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="dailyExpenseFuel"></td>
      </tr>
      <tr style="border-top: 2px solid rgba(255,255,255,0.12);">
        <td style="padding: 0.75rem; padding-left: 0; font-weight: bold; white-space: nowrap;">Net Per Day</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; font-weight: bold; white-space: nowrap;" data-value="dailyNetRow"></td>
      </tr>
    </tbody>
  `;
  dailySection.appendChild(dailyTable);
  container.appendChild(dailySection);

  // ─── Section 4: Lifetime Income & Expenses ────────────────────

  const lifetimeSection = document.createElement('section');
  lifetimeSection.style.cssText = `margin-bottom: 2rem;`;
  lifetimeSection.innerHTML = `
    <h2 style="color: #e94560; margin-bottom: 1rem; font-size: 1.25rem;">Lifetime Finances</h2>
  `;

  const lifetimeIncomeHeading = document.createElement('h3');
  lifetimeIncomeHeading.style.cssText = `
    font-size: 1rem;
    color: #4caf50;
    margin-bottom: 0.5rem;
    margin-top: 0;
  `;
  lifetimeIncomeHeading.textContent = 'Income';
  lifetimeSection.appendChild(lifetimeIncomeHeading);

  const incomeTable = document.createElement('table');
  incomeTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5rem;
  `;
  incomeTable.innerHTML = `
    <tbody>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4caf50; white-space: nowrap;">Contracts</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="incomeContracts"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4caf50; white-space: nowrap;">Ore Sales</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="incomeOreSales"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4caf50; white-space: nowrap;">Bounties</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="incomeBounties"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #4caf50; white-space: nowrap;">Equipment Sales</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="incomeEquipmentSales"></td>
      </tr>
      <tr style="border-top: 2px solid rgba(255,255,255,0.12);">
        <td style="padding: 0.75rem; padding-left: 0; font-weight: bold; white-space: nowrap;">Total Income</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; font-weight: bold; white-space: nowrap;" data-value="totalIncome"></td>
      </tr>
    </tbody>
  `;
  lifetimeSection.appendChild(incomeTable);

  const lifetimeExpenseHeading = document.createElement('h3');
  lifetimeExpenseHeading.style.cssText = `
    font-size: 1rem;
    color: #ffa500;
    margin-bottom: 0.5rem;
    margin-top: 0;
  `;
  lifetimeExpenseHeading.textContent = 'Expenses';
  lifetimeSection.appendChild(lifetimeExpenseHeading);

  const expenseTable = document.createElement('table');
  expenseTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5rem;
  `;
  expenseTable.innerHTML = `
    <tbody>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Crew Salaries</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseCrewSalaries"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Fuel</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseFuel"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Provisions</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseProvisions"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Crew Hiring</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseCrewHiring"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Crew Equipment</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseEquipment"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Ship Equipment</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseShipEquipment"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Ship Purchases</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseShipPurchases"></td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.75rem; padding-left: 0; border-left: 3px solid #ffa500; white-space: nowrap;">Combat Losses</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; white-space: nowrap;" data-value="expenseCombatLosses"></td>
      </tr>
      <tr style="border-top: 2px solid rgba(255,255,255,0.12);">
        <td style="padding: 0.75rem; padding-left: 0; font-weight: bold; white-space: nowrap;">Total Expenses</td>
        <td style="padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; font-weight: bold; white-space: nowrap;" data-value="totalExpenses"></td>
      </tr>
    </tbody>
  `;
  lifetimeSection.appendChild(expenseTable);

  const lifetimeNetRow = document.createElement('div');
  lifetimeNetRow.style.cssText = `
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 0;
    border-top: 2px solid rgba(255,255,255,0.12);
    font-weight: bold;
  `;
  lifetimeNetRow.innerHTML = `
    <span style="white-space: nowrap;">Lifetime Net</span>
    <span style="font-family: monospace; white-space: nowrap;" data-value="lifetimeNet"></span>
  `;
  lifetimeSection.appendChild(lifetimeNetRow);
  container.appendChild(lifetimeSection);

  // ─── Update Logic ──────────────────────────────────────────────

  let prev: FinancesSnapshot | null = null;

  function update(gameData: GameData): void {
    const next = snapshotFinances(gameData);
    if (prev && shallowEqual(prev, next)) return;
    prev = next;

    // Summary banner
    const netWorthEl = summaryBanner.querySelector('[data-value="netWorth"]');
    if (netWorthEl) netWorthEl.textContent = formatCredits(next.netWorth);

    const dailyNetEl = summaryBanner.querySelector('[data-value="dailyNet"]');
    if (dailyNetEl) {
      const sign = next.dailyNet >= 0 ? '+' : '';
      dailyNetEl.textContent = `${sign}${formatCredits(next.dailyNet)}/day`;
      dailyNetEl.setAttribute(
        'style',
        `font-size: 1.25rem; font-weight: bold; white-space: nowrap; color: ${next.dailyNet >= 0 ? '#4caf50' : '#ff6b6b'};`
      );
    }

    const runwayEl = summaryBanner.querySelector('[data-value="runway"]');
    if (runwayEl) {
      runwayEl.textContent =
        next.runway !== null ? `${next.runway} days` : 'Stable';
      const color =
        next.runway === null
          ? '#4caf50'
          : next.runway > 30
            ? '#ffa500'
            : '#ff6b6b';
      runwayEl.setAttribute(
        'style',
        `font-size: 1.25rem; font-weight: bold; white-space: nowrap; color: ${color};`
      );
    }

    // Assets
    const updateCell = (selector: string, value: number) => {
      const el = container.querySelector(`[data-value="${selector}"]`);
      if (el) el.textContent = formatCredits(value);
    };

    updateCell('assetsCash', next.assets.cash);
    updateCell('assetsShips', next.assets.ships);
    updateCell('assetsShipEquipment', next.assets.shipEquipment);
    updateCell('assetsCrewEquipment', next.assets.crewEquipment);
    updateCell('assetsFuel', next.assets.fuel);
    updateCell('assetsProvisions', next.assets.provisions);
    updateCell('assetsOre', next.assets.ore);
    updateCell('assetsTotalAssets', next.assets.totalAssets);

    // Daily cash flow
    updateCell('dailyIncome', next.dailyIncome);
    updateCell('dailyExpenseSalaries', next.dailyExpenseSalaries);
    updateCell('dailyExpenseFuel', next.dailyExpenseFuel);

    const dailyNetRowEl = container.querySelector('[data-value="dailyNetRow"]');
    if (dailyNetRowEl) {
      const sign = next.dailyNet2 >= 0 ? '+' : '';
      dailyNetRowEl.textContent = `${sign}${formatCredits(next.dailyNet2)}/day`;
      dailyNetRowEl.setAttribute(
        'style',
        `padding: 0.75rem; padding-right: 0; text-align: right; font-family: monospace; font-weight: bold; white-space: nowrap; color: ${next.dailyNet2 >= 0 ? '#4caf50' : '#ff6b6b'};`
      );
    }

    // Lifetime income
    updateCell('incomeContracts', next.incomeContracts);
    updateCell('incomeOreSales', next.incomeOreSales);
    updateCell('incomeBounties', next.incomeBounties);
    updateCell('incomeEquipmentSales', next.incomeEquipmentSales);
    updateCell('totalIncome', next.totalIncome);

    // Lifetime expenses
    updateCell('expenseCrewSalaries', next.expenseCrewSalaries);
    updateCell('expenseFuel', next.expenseFuel);
    updateCell('expenseProvisions', next.expenseProvisions);
    updateCell('expenseCrewHiring', next.expenseCrewHiring);
    updateCell('expenseEquipment', next.expenseEquipment);
    updateCell('expenseShipEquipment', next.expenseShipEquipment);
    updateCell('expenseShipPurchases', next.expenseShipPurchases);
    updateCell('expenseCombatLosses', next.expenseCombatLosses);
    updateCell('totalExpenses', next.totalExpenses);

    const lifetimeNetEl = container.querySelector('[data-value="lifetimeNet"]');
    if (lifetimeNetEl) {
      const sign = next.lifetimeNet >= 0 ? '+' : '';
      lifetimeNetEl.textContent = `${sign}${formatCredits(next.lifetimeNet)}`;
      const color = next.lifetimeNet >= 0 ? '#4caf50' : '#ff6b6b';
      lifetimeNetEl.setAttribute(
        'style',
        `font-family: monospace; white-space: nowrap; color: ${color};`
      );
    }
  }

  return { el: container, update };
}
