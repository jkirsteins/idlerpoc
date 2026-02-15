import type { GameData, Ship, WorldLocation } from '../models';
import { GAME_SECONDS_PER_TICK, GAME_SECONDS_PER_HOUR } from '../timeSystem';
import { calculateShipSalaryPerTick } from '../crewRoles';
import { formatCredits, formatMass, formatDistance } from '../formatting';
import { canShipAccessLocation } from '../worldGen';
import { getDistanceBetween } from '../utils';
import { getOreDefinition } from '../oreTypes';
import { calculateTripFuelKg, estimateTripTime } from '../questGen';
import {
  getMiningYieldPerHour,
  getOreSellPrice,
  getMaxOreCargoCapacity,
  getOreCargoWeight,
} from '../miningSystem';
import { getBestShipMiningEquipment } from '../equipment';
import { getFuelPricePerKg } from '../fuelPricing';

// ─── Mining Route Info Bar Refs ─────────────────────────────
export interface MiningRouteInfoBarRefs {
  bar: HTMLDivElement;
  label: HTMLSpanElement;
  status: HTMLDivElement;
  stats: HTMLDivElement;
}

// ─── Mining Route Setup Refs ────────────────────────────────
export interface MiningRouteSetupRefs {
  section: HTMLDivElement;
  container: HTMLDivElement;
  noMinesMsg: HTMLParagraphElement;
  lockedMsg: HTMLDivElement;
}

// ─── Mine Card Refs ─────────────────────────────────────────
export interface MineCardRefs {
  card: HTMLDivElement;
  nameEl: HTMLDivElement;
  oresEl: HTMLDivElement;
  fuelWarning: HTMLDivElement;
  destContainer: HTMLDivElement;
  destRows: Map<
    string,
    {
      row: HTMLDivElement;
      infoEl: HTMLDivElement;
      profitEl: HTMLSpanElement;
      selectBtn: HTMLButtonElement;
    }
  >;
}

// ─── Update: Mining Route Info Bar ──────────────────────────
export function updateMiningRouteInfoBar(
  refs: MiningRouteInfoBarRefs,
  gd: GameData,
  ship: Ship
): void {
  const route = ship.miningRoute;
  if (!route) {
    refs.bar.style.display = 'none';
    return;
  }

  // Don't show at mine locations — the mining panel handles that
  const currentLocId = ship.location.dockedAt || ship.location.orbitingAt;
  const currentLoc = currentLocId
    ? gd.world.locations.find((l) => l.id === currentLocId)
    : undefined;
  if (currentLoc?.services.includes('mine')) {
    refs.bar.style.display = 'none';
    return;
  }

  refs.bar.style.display = '';

  const mineLoc = gd.world.locations.find((l) => l.id === route.mineLocationId);
  const sellLoc = gd.world.locations.find((l) => l.id === route.sellLocationId);

  refs.label.textContent = `\u26CF Mining Route: ${mineLoc?.name ?? '?'} \u2192 ${sellLoc?.name ?? '?'}`;

  // Status
  const oreWeight = getOreCargoWeight(ship);
  const maxCargoKg = getMaxOreCargoCapacity(ship);
  const cargoPct =
    maxCargoKg > 0 ? Math.round((oreWeight / maxCargoKg) * 100) : 0;

  let statusText: string;
  if (route.status === 'mining') {
    statusText = `Mining at ${mineLoc?.name ?? '?'} (cargo ${cargoPct}% full)`;
  } else if (route.status === 'selling') {
    statusText = `In transit to ${sellLoc?.name ?? 'sell station'}`;
  } else {
    statusText = `Returning to ${mineLoc?.name ?? 'mine'}`;
  }
  refs.status.textContent = statusText;

  // Stats
  let statsText = `Trips: ${route.totalTrips} \u00B7 Revenue: ${formatCredits(route.totalCreditsEarned)}`;
  const routeAge = gd.gameTime - route.assignedAt;
  if (routeAge > 0 && route.totalCreditsEarned > 0) {
    const routeHours = routeAge / GAME_SECONDS_PER_HOUR;
    const crPerHr = Math.round(route.totalCreditsEarned / routeHours);
    statsText += ` \u00B7 ~${formatCredits(crPerHr)}/hr`;
  }
  refs.stats.textContent = statsText;
}

// ─── Update: Mining Route Setup (non-mine stations) ─────────
export function updateMiningRouteSetup(
  refs: MiningRouteSetupRefs,
  mineCardMap: Map<string, MineCardRefs>,
  onStartMiningRoute: (sellLocationId: string, mineLocationId?: string) => void,
  gd: GameData,
  ship: Ship,
  currentLocation: WorldLocation
): void {
  const reachableMines = gd.world.locations.filter(
    (l) => l.services.includes('mine') && canShipAccessLocation(ship, l)
  );

  if (reachableMines.length === 0) {
    refs.section.style.display = 'none';
    return;
  }

  refs.section.style.display = '';
  refs.noMinesMsg.style.display = 'none';

  const hasMiningBay = ship.rooms.some((r) => r.type === 'mining_bay');
  const shipMiningEquip = getBestShipMiningEquipment(ship);
  const hasEquipment = shipMiningEquip !== undefined;
  const maxCargoKg = getMaxOreCargoCapacity(ship);

  // Capability gate: show locked message and dim cards if ship can't mine
  if (!hasMiningBay) {
    refs.lockedMsg.textContent =
      'Mining routes require a Class II ship with a mining bay.';
    refs.lockedMsg.style.display = '';
    refs.container.style.opacity = '0.3';
    refs.container.style.pointerEvents = 'none';
  } else if (!hasEquipment) {
    refs.lockedMsg.textContent =
      'Install mining equipment at a station store to start mining routes.';
    refs.lockedMsg.style.display = '';
    refs.container.style.opacity = '';
    refs.container.style.pointerEvents = '';
  } else {
    refs.lockedMsg.style.display = 'none';
    refs.container.style.opacity = '';
    refs.container.style.pointerEvents = '';
  }
  const salaryCrPerHr = (() => {
    const salaryPerTick = calculateShipSalaryPerTick(ship);
    const ticksPerHour = GAME_SECONDS_PER_HOUR / GAME_SECONDS_PER_TICK;
    return salaryPerTick * ticksPerHour;
  })();

  // Sort mines by distance
  const sortedMines = [...reachableMines].sort((a, b) => {
    const distA = getDistanceBetween(currentLocation, a);
    const distB = getDistanceBetween(currentLocation, b);
    return distA - distB;
  });

  const currentMineIds = new Set<string>();

  for (const mine of sortedMines) {
    currentMineIds.add(mine.id);
    const distToMine = getDistanceBetween(currentLocation, mine);
    const ores = mine.availableOres ?? [];
    const oreNames = ores
      .slice(0, 3)
      .map((o) => getOreDefinition(o.oreId).name);
    const oreSummary =
      ores.length > 3
        ? `${oreNames.join(', ')}, +${ores.length - 3} more`
        : oreNames.join(', ');

    // Fuel check for initial trip
    const initialFuelKg = calculateTripFuelKg(
      ship,
      distToMine,
      ship.flightProfileBurnFraction
    );
    const lowFuel = initialFuelKg > ship.fuelKg;

    let cardRefs = mineCardMap.get(mine.id);
    if (!cardRefs) {
      cardRefs = createMineCard();
      mineCardMap.set(mine.id, cardRefs);
      refs.container.appendChild(cardRefs.card);
    }

    // Update mine card content
    cardRefs.nameEl.textContent = `\u26CF ${mine.name} \u00B7 ${formatDistance(distToMine)}`;
    cardRefs.oresEl.textContent = oreSummary || 'No ores';

    if (lowFuel) {
      cardRefs.fuelWarning.style.display = '';
      cardRefs.fuelWarning.textContent = `\u26A0 Low fuel for initial trip (need ~${formatMass(Math.round(initialFuelKg))}, have ${formatMass(Math.round(ship.fuelKg))})`;
    } else {
      cardRefs.fuelWarning.style.display = 'none';
    }

    // Build sell destination list for this mine
    const tradeLocations = gd.world.locations.filter(
      (l) => l.services.includes('trade') && canShipAccessLocation(ship, l)
    );

    // Find best ore at this mine for profitability estimate
    const bestMinerSkill = (() => {
      const miners = ship.crew.filter((c) =>
        ship.jobSlots.some(
          (s) => s.type === 'mining_ops' && s.assignedCrewId === c.id
        )
      );
      return miners.length > 0
        ? Math.max(...miners.map((m) => Math.floor(m.skills.mining)))
        : 0;
    })();

    const bestOre =
      ores
        .map((entry) => getOreDefinition(entry.oreId))
        .filter(
          (o) =>
            bestMinerSkill >= o.miningLevelRequired ||
            o.miningLevelRequired === 0
        )
        .sort((a, b) => b.baseValue - a.baseValue)[0] ?? null;

    const destData = tradeLocations.map((tradeLoc) => {
      const mineSellDist = getDistanceBetween(mine, tradeLoc);
      let profitCrPerHr = 0;
      let roundTripSec = 0;

      if (bestOre && hasEquipment) {
        const sellPrice = getOreSellPrice(bestOre, tradeLoc, ship);
        const yieldPerHr = getMiningYieldPerHour(ship, mine, bestOre);
        const cargoUnits = Math.floor(maxCargoKg / bestOre.weightPerUnit);
        const fillSec =
          yieldPerHr > 0
            ? (cargoUnits / yieldPerHr) * GAME_SECONDS_PER_HOUR
            : Infinity;
        roundTripSec =
          2 *
          estimateTripTime(ship, mineSellDist, ship.flightProfileBurnFraction);
        const cycleSec = fillSec + roundTripSec;

        if (cycleSec > 0 && cycleSec < Infinity) {
          const cycleHours = cycleSec / GAME_SECONDS_PER_HOUR;
          const revenuePerCycle = sellPrice * cargoUnits;
          const salaryCostPerCycle = salaryCrPerHr * cycleHours;
          const roundTripFuelKg =
            2 *
            calculateTripFuelKg(
              ship,
              mineSellDist,
              ship.flightProfileBurnFraction
            );
          const fuelPrice = getFuelPricePerKg(mine, ship);
          const fuelCostPerCycle = roundTripFuelKg * fuelPrice;
          profitCrPerHr =
            (revenuePerCycle - salaryCostPerCycle - fuelCostPerCycle) /
            cycleHours;
        }
      }

      return { tradeLoc, mineSellDist, profitCrPerHr, roundTripSec };
    });

    destData.sort((a, b) => b.profitCrPerHr - a.profitCrPerHr);

    const currentDestIds = new Set<string>();
    for (const {
      tradeLoc,
      mineSellDist,
      profitCrPerHr,
      roundTripSec,
    } of destData) {
      currentDestIds.add(tradeLoc.id);
      let destRefs = cardRefs.destRows.get(tradeLoc.id);
      if (!destRefs) {
        destRefs = createSellDestRow(tradeLoc.id, mine.id, onStartMiningRoute);
        cardRefs.destRows.set(tradeLoc.id, destRefs);
        cardRefs.destContainer.appendChild(destRefs.row);
      }

      destRefs.infoEl.textContent = `${tradeLoc.name} \u00B7 ${formatDistance(mineSellDist)}`;
      if (roundTripSec > 0) {
        destRefs.infoEl.textContent += ` RT`;
      }

      if (bestOre && hasEquipment) {
        const profitLabel =
          profitCrPerHr >= 0
            ? `+${formatCredits(Math.round(profitCrPerHr))}`
            : formatCredits(Math.round(profitCrPerHr));
        destRefs.profitEl.textContent = `~${profitLabel}/hr`;
        destRefs.profitEl.style.color =
          profitCrPerHr >= 0 ? '#4caf50' : '#ff6b6b';
        destRefs.profitEl.style.display = '';
      } else {
        destRefs.profitEl.style.display = 'none';
      }
    }

    // Remove stale dest rows
    for (const [id, destRefs] of cardRefs.destRows) {
      if (!currentDestIds.has(id)) {
        destRefs.row.remove();
        cardRefs.destRows.delete(id);
      }
    }

    // Ensure correct order
    for (const { tradeLoc } of destData) {
      const destRefs = cardRefs.destRows.get(tradeLoc.id);
      if (destRefs) cardRefs.destContainer.appendChild(destRefs.row);
    }
  }

  // Remove stale mine cards
  for (const [id, cardRefs] of mineCardMap) {
    if (!currentMineIds.has(id)) {
      cardRefs.card.remove();
      mineCardMap.delete(id);
    }
  }

  // Ensure correct order
  for (const mine of sortedMines) {
    const cardRefs = mineCardMap.get(mine.id);
    if (cardRefs) refs.container.appendChild(cardRefs.card);
  }
}

/** Create a mine card for the route setup section. */
export function createMineCard(): MineCardRefs {
  const card = document.createElement('div');
  card.style.cssText = `
    padding: 0.6rem 0.75rem; border-radius: 4px;
    background: rgba(255, 165, 0, 0.06); border: 1px solid #444;
  `;

  const nameEl = document.createElement('div');
  nameEl.style.cssText =
    'font-size: 0.9rem; font-weight: bold; color: #ffa500; margin-bottom: 0.2rem;';
  card.appendChild(nameEl);

  const oresEl = document.createElement('div');
  oresEl.style.cssText =
    'font-size: 0.8rem; color: #999; margin-bottom: 0.4rem;';
  card.appendChild(oresEl);

  const fuelWarning = document.createElement('div');
  fuelWarning.style.cssText =
    'font-size: 0.8rem; color: #ffa500; margin-bottom: 0.4rem; display: none;';
  card.appendChild(fuelWarning);

  const destLabel = document.createElement('div');
  destLabel.style.cssText =
    'font-size: 0.78rem; color: #777; margin-bottom: 0.2rem;';
  destLabel.textContent = 'Sell destinations:';
  card.appendChild(destLabel);

  const destContainer = document.createElement('div');
  destContainer.style.cssText =
    'display: flex; flex-direction: column; gap: 3px; max-height: 150px; overflow-y: auto;';
  card.appendChild(destContainer);

  return {
    card,
    nameEl,
    oresEl,
    fuelWarning,
    destContainer,
    destRows: new Map(),
  };
}

/** Create a sell destination row within a mine card. */
export function createSellDestRow(
  sellLocId: string,
  mineLocId: string,
  onStartMiningRoute: (sellLocationId: string, mineLocationId?: string) => void
): {
  row: HTMLDivElement;
  infoEl: HTMLDivElement;
  profitEl: HTMLSpanElement;
  selectBtn: HTMLButtonElement;
} {
  const row = document.createElement('div');
  row.style.cssText = `
    display: flex; align-items: center; gap: 6px; padding: 3px 6px;
    border-radius: 3px; font-size: 0.8rem;
    background: rgba(255,255,255,0.03); border: 1px solid #333;
  `;

  const infoEl = document.createElement('div');
  infoEl.style.cssText =
    'flex: 1; min-width: 0; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
  row.appendChild(infoEl);

  const profitEl = document.createElement('span');
  profitEl.style.cssText =
    'font-size: 0.78rem; font-weight: bold; white-space: nowrap;';
  row.appendChild(profitEl);

  const selectBtn = document.createElement('button');
  selectBtn.textContent = 'Select';
  selectBtn.style.cssText =
    'font-size: 0.72rem; padding: 2px 8px; white-space: nowrap;';
  selectBtn.addEventListener('click', () =>
    onStartMiningRoute(sellLocId, mineLocId)
  );
  row.appendChild(selectBtn);

  return { row, infoEl, profitEl, selectBtn };
}
