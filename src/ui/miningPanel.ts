/**
 * Mining Status Panel Component
 *
 * Self-contained mount-once / update-on-tick component for the mining panel.
 * Includes ore material picker, cargo progress bar, auto-sell destination
 * picker with profitability estimates, and active mining feedback.
 */

import type { GameData, Ship, WorldLocation } from '../models';
import {
  formatDualTime,
  GAME_SECONDS_PER_HOUR,
  GAME_SECONDS_PER_TICK,
} from '../timeSystem';
import { calculateShipSalaryPerTick } from '../crewRoles';
import { calculateTripFuelKg } from '../questGen';
import { getFuelPricePerKg } from '../fuelPricing';
import {
  getOreDefinition,
  canMineOre,
  isOreAvailableAtLocation,
  getLocationOreYieldMultiplier,
} from '../oreTypes';
import { getCrewForJobType } from '../jobSlots';
import { getBestShipMiningEquipment } from '../equipment';
import {
  getOreCargoWeight,
  getRemainingOreCapacity,
  getMaxOreCargoCapacity,
  getMiningYieldPerHour,
  getTimeToFillCargo,
  getOreSellPrice,
} from '../miningSystem';
import { estimateTripTime } from '../questGen';
import { getDistanceBetween, canShipAccessLocation } from '../worldGen';
import { formatCredits, formatMass, formatDistance } from '../formatting';
export interface MiningPanelCallbacks {
  onStartMiningRoute: (sellLocationId: string, mineLocationId?: string) => void;
  onCancelMiningRoute: () => void;
  onSelectMiningOre: (oreId: string | null) => void;
}

// ─── Internal Refs ────────────────────────────────────────────
interface MiningStatusRefs {
  panel: HTMLDivElement;
  title: HTMLSpanElement;
  statusBadge: HTMLSpanElement;
  undockPrompt: HTMLDivElement;
  crewNudge: HTMLDivElement;
  equipInfo: HTMLDivElement;
  orePickerSection: HTMLDivElement;
  orePickerLabel: HTMLDivElement;
  orePickerContainer: HTMLDivElement;
  minersSection: HTMLDivElement;
  cargoBarContainer: HTMLDivElement;
  cargoBarLabel: HTMLDivElement;
  cargoBarTrack: HTMLDivElement;
  cargoBarFill: HTMLDivElement;
  cargoRateEl: HTMLDivElement;
  breakdownSection: HTMLDivElement;
  routeSection: HTMLDivElement;
  activeRouteContainer: HTMLDivElement;
  activeRouteLabel: HTMLSpanElement;
  activeRouteCancelBtn: HTMLButtonElement;
  activeRouteStats: HTMLDivElement;
  activeRouteInfoSpan: HTMLSpanElement;
  activeRouteProfitSpan: HTMLSpanElement;
  setupRouteContainer: HTMLDivElement;
  setupRouteLabel: HTMLDivElement;
  noTradeMsg: HTMLDivElement;
  destListContainer: HTMLDivElement;
  setupHint: HTMLDivElement;
}

/**
 * Create a mining panel component. Mount once; call update() each tick.
 */
export function createMiningPanel(callbacks: MiningPanelCallbacks): {
  readonly el: HTMLElement;
  update: (gd: GameData, ship: Ship, location: WorldLocation) => void;
} {
  // Reconciliation maps
  const orePickerRowMap = new Map<
    string,
    {
      row: HTMLLabelElement;
      radio: HTMLInputElement;
      nameEl: HTMLSpanElement;
      infoEl: HTMLSpanElement;
    }
  >();
  const minerLineMap = new Map<string, HTMLDivElement>();
  const oreCargoLineMap = new Map<string, HTMLDivElement>();
  const destRowMap = new Map<
    string,
    {
      row: HTMLDivElement;
      infoEl: HTMLDivElement;
      profitEl: HTMLDivElement;
      revenueSpan: HTMLSpanElement;
      costSpan: HTMLSpanElement;
      netSpan: HTMLSpanElement;
      selectBtn: HTMLButtonElement;
    }
  >();

  const refs = buildPanel(callbacks);

  return {
    el: refs.panel,
    update(gd: GameData, ship: Ship, location: WorldLocation) {
      updateMiningStatus(gd, ship, location, refs, callbacks);
    },
  };

  // ── DOM Construction ─────────────────────────────────────────

  function buildPanel(cb: MiningPanelCallbacks): MiningStatusRefs {
    const panel = document.createElement('div');
    panel.className = 'mining-status-panel';
    panel.style.cssText = `
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: rgba(255, 165, 0, 0.08);
      border: 1px solid #b87333;
      border-radius: 4px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';
    const title = document.createElement('span');
    title.style.cssText = 'font-weight: bold; font-size: 1rem; color: #ffa500;';
    header.appendChild(title);

    const statusBadge = document.createElement('span');
    statusBadge.style.cssText =
      'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px;';
    header.appendChild(statusBadge);
    panel.appendChild(header);

    // Undock prompt
    const undockPrompt = document.createElement('div');
    undockPrompt.style.cssText =
      'padding: 0.5rem; margin-bottom: 0.5rem; background: rgba(74,158,255,0.1); border: 1px solid #4a9eff; border-radius: 4px; font-size: 0.85rem; color: #4a9eff;';
    undockPrompt.textContent =
      'Undock to enter orbit and begin mining operations. Mining equipment operates while orbiting.';
    undockPrompt.style.display = 'none';
    panel.appendChild(undockPrompt);

    // Crew nudge
    const crewNudge = document.createElement('div');
    crewNudge.style.cssText =
      'padding: 0.4rem 0.5rem; margin-bottom: 0.5rem; background: rgba(255,165,0,0.1); border: 1px solid #b87333; border-radius: 4px; font-size: 0.82rem; color: #ffa500;';
    crewNudge.style.display = 'none';
    panel.appendChild(crewNudge);

    // Equipment info
    const equipInfo = document.createElement('div');
    equipInfo.style.cssText =
      'margin-bottom: 0.5rem; font-size: 0.8rem; color: #6c6;';
    equipInfo.style.display = 'none';
    panel.appendChild(equipInfo);

    // Ore picker section
    const orePickerSection = document.createElement('div');
    orePickerSection.style.cssText = 'margin-bottom: 0.5rem;';
    const orePickerLabel = document.createElement('div');
    orePickerLabel.style.cssText =
      'font-size: 0.85rem; color: #aaa; margin-bottom: 0.25rem;';
    orePickerLabel.textContent = 'Select Ore to Mine:';
    orePickerSection.appendChild(orePickerLabel);

    const orePickerContainer = document.createElement('div');
    orePickerContainer.style.cssText =
      'display: flex; flex-direction: column; gap: 2px;';
    orePickerSection.appendChild(orePickerContainer);
    panel.appendChild(orePickerSection);

    // Miners section
    const minersSection = document.createElement('div');
    minersSection.style.cssText = 'margin-bottom: 0.5rem; font-size: 0.85rem;';
    panel.appendChild(minersSection);

    // Cargo progress bar
    const cargoBarContainer = document.createElement('div');
    cargoBarContainer.style.cssText = 'margin-bottom: 0.5rem;';

    const cargoBarLabel = document.createElement('div');
    cargoBarLabel.style.cssText =
      'font-size: 0.85rem; color: #aaa; margin-bottom: 0.2rem; display: flex; justify-content: space-between;';
    cargoBarContainer.appendChild(cargoBarLabel);

    const cargoBarTrack = document.createElement('div');
    cargoBarTrack.style.cssText =
      'height: 8px; background: #222; border-radius: 4px; overflow: hidden;';
    const cargoBarFill = document.createElement('div');
    cargoBarFill.style.cssText =
      'height: 100%; border-radius: 4px; transition: width 0.3s, background-color 0.3s;';
    cargoBarTrack.appendChild(cargoBarFill);
    cargoBarContainer.appendChild(cargoBarTrack);

    const cargoRateEl = document.createElement('div');
    cargoRateEl.style.cssText =
      'font-size: 0.8rem; color: #888; margin-top: 0.2rem;';
    cargoBarContainer.appendChild(cargoRateEl);
    panel.appendChild(cargoBarContainer);

    // Ore cargo breakdown
    const breakdownSection = document.createElement('div');
    breakdownSection.style.cssText =
      'margin-bottom: 0.5rem; font-size: 0.8rem; color: #888;';
    panel.appendChild(breakdownSection);

    // Route controls
    const routeSection = document.createElement('div');
    routeSection.style.cssText =
      'margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #444;';

    // Active route
    const activeRouteContainer = document.createElement('div');
    activeRouteContainer.style.display = 'none';

    const activeRouteHeader = document.createElement('div');
    activeRouteHeader.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;';

    const activeRouteLabel = document.createElement('span');
    activeRouteLabel.style.cssText = 'font-size: 0.85rem; color: #4caf50;';
    activeRouteHeader.appendChild(activeRouteLabel);

    const activeRouteCancelBtn = document.createElement('button');
    activeRouteCancelBtn.textContent = 'Cancel Route';
    activeRouteCancelBtn.style.cssText =
      'font-size: 0.75rem; padding: 2px 8px;';
    activeRouteCancelBtn.addEventListener('click', () =>
      cb.onCancelMiningRoute()
    );
    activeRouteHeader.appendChild(activeRouteCancelBtn);
    activeRouteContainer.appendChild(activeRouteHeader);

    const activeRouteStats = document.createElement('div');
    activeRouteStats.style.cssText =
      'font-size: 0.8rem; color: #888; display: flex; flex-wrap: wrap; gap: 0 8px;';

    const activeRouteInfoSpan = document.createElement('span');
    activeRouteStats.appendChild(activeRouteInfoSpan);

    const activeRouteProfitSpan = document.createElement('span');
    activeRouteProfitSpan.style.fontWeight = 'bold';
    activeRouteStats.appendChild(activeRouteProfitSpan);

    activeRouteContainer.appendChild(activeRouteStats);
    routeSection.appendChild(activeRouteContainer);

    // Setup route
    const setupRouteContainer = document.createElement('div');
    setupRouteContainer.style.display = 'none';

    const setupRouteLabel = document.createElement('div');
    setupRouteLabel.style.cssText =
      'font-size: 0.85rem; color: #aaa; margin-bottom: 0.35rem;';
    setupRouteLabel.textContent = '\u{1F504} Auto-Sell Route (idle mining)';
    setupRouteContainer.appendChild(setupRouteLabel);

    const noTradeMsg = document.createElement('div');
    noTradeMsg.style.cssText = 'font-size: 0.8rem; color: #888;';
    noTradeMsg.textContent =
      'No reachable trade stations available for auto-sell.';
    noTradeMsg.style.display = 'none';
    setupRouteContainer.appendChild(noTradeMsg);

    const destListContainer = document.createElement('div');
    destListContainer.style.cssText =
      'display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto;';
    setupRouteContainer.appendChild(destListContainer);

    const setupHint = document.createElement('div');
    setupHint.style.cssText =
      'font-size: 0.75rem; color: #666; margin-top: 0.25rem;';
    setupHint.textContent =
      'When cargo fills, ship auto-flies to sell ore, refuels, then returns to mine.';
    setupRouteContainer.appendChild(setupHint);
    routeSection.appendChild(setupRouteContainer);

    panel.appendChild(routeSection);

    return {
      panel,
      title,
      statusBadge,
      undockPrompt,
      crewNudge,
      equipInfo,
      orePickerSection,
      orePickerLabel,
      orePickerContainer,
      minersSection,
      cargoBarContainer,
      cargoBarLabel,
      cargoBarTrack,
      cargoBarFill,
      cargoRateEl,
      breakdownSection,
      routeSection,
      activeRouteContainer,
      activeRouteLabel,
      activeRouteCancelBtn,
      activeRouteStats,
      activeRouteInfoSpan,
      activeRouteProfitSpan,
      setupRouteContainer,
      setupRouteLabel,
      noTradeMsg,
      destListContainer,
      setupHint,
    };
  }

  // ── Tick Update ──────────────────────────────────────────────

  function updateMiningStatus(
    gd: GameData,
    ship: Ship,
    location: WorldLocation,
    r: MiningStatusRefs,
    cb: MiningPanelCallbacks
  ): void {
    const isDocked = ship.location.status === 'docked';
    const miners = getCrewForJobType(ship, 'mining_ops');
    const shipMiningEquip = getBestShipMiningEquipment(ship);
    const hasEquipment = shipMiningEquip !== undefined;
    const hasCrewMiner = hasEquipment && miners.length > 0;
    const canMineAtAll = hasEquipment;
    const remainingKg = getRemainingOreCapacity(ship);
    const availableOres = location.availableOres ?? [];
    const selectedOreId = ship.selectedMiningOreId;
    const isInTransit =
      ship.miningRoute &&
      (ship.miningRoute.status === 'selling' ||
        ship.miningRoute.status === 'returning');

    // ── Header title with pulse ──
    r.title.textContent = `\u26CF\uFE0F Mining at ${location.name}`;
    const isMiningActive =
      !isDocked && canMineAtAll && remainingKg > 0 && !isInTransit;
    r.title.style.animation = isMiningActive
      ? 'mining-pulse 1.5s ease-in-out infinite'
      : '';

    // ── Status badge ──
    const badgeBase =
      'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px;';
    if (isDocked) {
      r.statusBadge.style.cssText = `${badgeBase} background: rgba(74,158,255,0.15); color: #4a9eff; border: 1px solid #4a9eff;`;
      r.statusBadge.textContent = 'DOCKED';
    } else if (isInTransit) {
      r.statusBadge.style.cssText = `${badgeBase} background: rgba(74,158,255,0.15); color: #4a9eff; border: 1px solid #4a9eff;`;
      r.statusBadge.textContent = 'IN TRANSIT';
    } else if (canMineAtAll && remainingKg <= 0) {
      r.statusBadge.style.cssText = `${badgeBase} background: rgba(233,69,96,0.2); color: #e94560; border: 1px solid #e94560;`;
      r.statusBadge.textContent = 'CARGO FULL';
    } else if (isMiningActive) {
      r.statusBadge.style.cssText = `${badgeBase} background: rgba(76,175,80,0.2); color: #4caf50; border: 1px solid #4caf50;`;
      r.statusBadge.textContent = hasCrewMiner ? 'MINING' : 'MINING (BASE)';
    } else {
      r.statusBadge.style.cssText = `${badgeBase} background: rgba(255,165,0,0.15); color: #ffa500; border: 1px solid #b87333;`;
      r.statusBadge.textContent = 'IDLE';
    }

    // ── Undock prompt ──
    r.undockPrompt.style.display = isDocked ? '' : 'none';

    // ── Crew nudge ──
    if (!hasEquipment) {
      const hasMiningBay = ship.rooms.some((r) => r.type === 'mining_bay');
      r.crewNudge.style.display = '';
      if (hasMiningBay) {
        r.crewNudge.style.color = '#e94560';
        r.crewNudge.style.borderColor = '#e94560';
        r.crewNudge.style.background = 'rgba(233,69,96,0.1)';
        r.crewNudge.textContent =
          'No mining equipment installed. Purchase at a station store.';
      } else {
        r.crewNudge.style.color = '#888';
        r.crewNudge.style.borderColor = '#555';
        r.crewNudge.style.background = 'rgba(136,136,136,0.1)';
        r.crewNudge.textContent =
          'This ship has no mining bay. Upgrade to a Class II vessel to begin mining operations.';
      }
    } else if (miners.length === 0) {
      r.crewNudge.style.display = '';
      r.crewNudge.style.color = '#ffa500';
      r.crewNudge.style.borderColor = '#b87333';
      r.crewNudge.style.background = 'rgba(255,165,0,0.1)';
      r.crewNudge.textContent =
        '\u26A0\uFE0F No crew assigned \u2014 mining at base rate. Assign skilled crew to mine faster and unlock rare ores.';
    } else {
      r.crewNudge.style.display = 'none';
    }

    // ── Equipment info ──
    if (hasEquipment) {
      r.equipInfo.style.display = '';
      let equipText = `Ship Equipment: ${shipMiningEquip.name} (${shipMiningEquip.miningRate}x)`;
      if (
        shipMiningEquip.miningLevelRequired &&
        shipMiningEquip.miningLevelRequired > 0
      ) {
        equipText += ` \u00B7 Requires Mining ${shipMiningEquip.miningLevelRequired}`;
      }
      r.equipInfo.textContent = equipText;
    } else {
      r.equipInfo.style.display = 'none';
    }

    // ── Ore picker ──
    const sellLocation = ship.miningRoute
      ? gd.world.locations.find(
          (l) => l.id === ship.miningRoute!.sellLocationId
        )
      : undefined;

    const bestMinerSkill =
      miners.length > 0
        ? Math.max(...miners.map((m) => Math.floor(m.skills.mining)))
        : 0;

    const currentPickerIds = new Set<string>();
    currentPickerIds.add('__auto__');
    let autoEntry = orePickerRowMap.get('__auto__');
    if (!autoEntry) {
      autoEntry = createOrePickerRow('__auto__', 'mining-ore-picker', cb);
      orePickerRowMap.set('__auto__', autoEntry);
      r.orePickerContainer.appendChild(autoEntry.row);
    }
    autoEntry.radio.checked = !selectedOreId;
    autoEntry.nameEl.textContent = '\u2728 Auto (highest value)';
    autoEntry.infoEl.textContent = '';
    autoEntry.row.style.opacity = '1';
    autoEntry.radio.disabled = false;

    for (const oreEntry of availableOres) {
      const oreId = oreEntry.oreId;
      currentPickerIds.add(oreId);
      const ore = getOreDefinition(oreId);
      const canAccess =
        miners.some((m) => canMineOre(m.skills.mining, oreId)) ||
        (miners.length === 0 && ore.miningLevelRequired === 0);

      let entry = orePickerRowMap.get(oreId);
      if (!entry) {
        entry = createOrePickerRow(oreId, 'mining-ore-picker', cb);
        orePickerRowMap.set(oreId, entry);
        r.orePickerContainer.appendChild(entry.row);
      }

      entry.radio.checked = selectedOreId === oreId;
      entry.radio.disabled = !canAccess;
      entry.row.style.opacity = canAccess ? '1' : '0.45';

      const yieldMult = oreEntry.yieldMultiplier ?? 1.0;
      const yieldSuffix = yieldMult < 1.0 ? ` (${yieldMult}x yield)` : '';

      if (canAccess) {
        entry.nameEl.textContent = `${ore.icon} ${ore.name}${yieldSuffix}`;
      } else {
        entry.nameEl.textContent = `\uD83D\uDD12 ${ore.icon} ${ore.name}${yieldSuffix} (Need Mining ${ore.miningLevelRequired})`;
      }

      if (canAccess && hasEquipment) {
        const yieldPerHr = getMiningYieldPerHour(ship, location, ore);
        const sellPrice = sellLocation
          ? getOreSellPrice(ore, sellLocation, ship)
          : ore.baseValue;
        const grossCrPerHr = sellPrice * yieldPerHr;
        const salaryCrPerHr = getSalaryCrPerHour(ship);
        const profitPerHr = grossCrPerHr - salaryCrPerHr;
        const profitLabel =
          profitPerHr >= 0
            ? `+${formatCredits(Math.round(profitPerHr))}`
            : formatCredits(Math.round(profitPerHr));
        entry.infoEl.textContent = `${formatCredits(sellPrice)}/unit \u00B7 ~${yieldPerHr.toFixed(1)} units/hr \u00B7 ~${profitLabel}/hr profit`;
        entry.infoEl.style.color = profitPerHr >= 0 ? '#4caf50' : '#ff6b6b';
      } else {
        entry.infoEl.textContent = canAccess
          ? ''
          : `${formatCredits(ore.baseValue)}/unit`;
        entry.infoEl.style.color = '#888';
      }
    }

    for (const [id, entry] of orePickerRowMap) {
      if (!currentPickerIds.has(id)) {
        entry.row.remove();
        orePickerRowMap.delete(id);
      }
    }

    // ── Miners section ──
    r.minersSection.textContent = '';
    minerLineMap.clear();

    if (miners.length > 0 && hasEquipment) {
      for (const miner of miners) {
        const minerLine = document.createElement('div');
        minerLine.style.cssText = 'margin-bottom: 2px; color: #ccc;';
        const miningSkill = Math.floor(miner.skills.mining);

        if (miningSkill < (shipMiningEquip.miningLevelRequired ?? 0)) {
          minerLine.style.color = '#ffa500';
          minerLine.textContent = `${miner.name} (Mining ${miningSkill}) \u2014 Skill too low to operate equipment`;
        } else {
          const targetOreId = selectedOreId || undefined;
          const targetOre = targetOreId
            ? canMineOre(miner.skills.mining, targetOreId)
              ? getOreDefinition(targetOreId)
              : null
            : (availableOres
                .map((entry) => getOreDefinition(entry.oreId))
                .filter((o) => miningSkill >= o.miningLevelRequired)
                .sort((a, b) => {
                  const aEff =
                    a.baseValue *
                    getLocationOreYieldMultiplier(location.availableOres, a.id);
                  const bEff =
                    b.baseValue *
                    getLocationOreYieldMultiplier(location.availableOres, b.id);
                  return bEff - aEff;
                })[0] ?? null);

          minerLine.textContent = `${miner.name} (Mining ${miningSkill})`;
          if (targetOre) {
            minerLine.textContent += ` \u2192 ${targetOre.icon} ${targetOre.name}`;
          } else if (targetOreId) {
            minerLine.style.color = '#888';
            minerLine.textContent += ' \u2014 cannot mine selected ore';
          }
        }
        r.minersSection.appendChild(minerLine);
        minerLineMap.set(miner.id, minerLine);
      }
    }

    // ── Cargo progress bar ──
    const oreWeight = getOreCargoWeight(ship);
    const maxCargoKg = getMaxOreCargoCapacity(ship);
    const cargoPct = maxCargoKg > 0 ? (oreWeight / maxCargoKg) * 100 : 0;
    const totalOreUnits = ship.oreCargo.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const labelLeft = document.createElement('span');
    labelLeft.textContent = `Ore Cargo: ${totalOreUnits} units`;
    const labelRight = document.createElement('span');
    if (remainingKg <= 0) {
      labelRight.textContent = `${formatMass(oreWeight)} / ${formatMass(maxCargoKg)} \u2014 FULL`;
      labelRight.style.color = '#e94560';
    } else {
      labelRight.textContent = `${formatMass(oreWeight)} / ${formatMass(maxCargoKg)}`;
      labelRight.style.color = '';
    }
    r.cargoBarLabel.textContent = '';
    r.cargoBarLabel.appendChild(labelLeft);
    r.cargoBarLabel.appendChild(labelRight);

    const fillColor =
      cargoPct >= 90 ? '#e94560' : cargoPct >= 70 ? '#ffa500' : '#4caf50';
    r.cargoBarFill.style.width = `${Math.min(100, cargoPct)}%`;
    r.cargoBarFill.style.backgroundColor = fillColor;

    // Rate ore
    const rateOre = selectedOreId
      ? isOreAvailableAtLocation(location.availableOres, selectedOreId)
        ? getOreDefinition(selectedOreId)
        : null
      : (availableOres
          .map((entry) => getOreDefinition(entry.oreId))
          .filter((o) => bestMinerSkill >= o.miningLevelRequired)
          .sort((a, b) => {
            const aEff =
              a.baseValue *
              getLocationOreYieldMultiplier(location.availableOres, a.id);
            const bEff =
              b.baseValue *
              getLocationOreYieldMultiplier(location.availableOres, b.id);
            return bEff - aEff;
          })[0] ?? null);

    if (rateOre && hasEquipment && !isDocked) {
      const yieldPerHr = getMiningYieldPerHour(ship, location, rateOre);
      const kgPerHr = yieldPerHr * rateOre.weightPerUnit;
      let rateText = `~${yieldPerHr.toFixed(1)} units/hr (~${formatMass(Math.round(kgPerHr))}/hr)`;

      if (remainingKg > 0 && yieldPerHr > 0) {
        const fillSec = getTimeToFillCargo(ship, location, rateOre);
        if (fillSec < Infinity) {
          const fillLabel = ship.miningRoute
            ? `Next sell trip in ~${formatDualTime(fillSec)}`
            : `Fill in ~${formatDualTime(fillSec)}`;
          rateText += ` \u00B7 ${fillLabel}`;
        }
      }
      r.cargoRateEl.textContent = rateText;
      r.cargoRateEl.style.display = '';
    } else {
      r.cargoRateEl.style.display = 'none';
    }

    // ── Ore cargo breakdown ──
    r.breakdownSection.textContent = '';
    oreCargoLineMap.clear();

    if (ship.oreCargo.length > 0) {
      r.breakdownSection.style.display = '';
      for (const item of ship.oreCargo) {
        const ore = getOreDefinition(item.oreId);
        const line = document.createElement('div');
        line.textContent = `  ${ore.icon} ${ore.name}: ${item.quantity} units`;
        r.breakdownSection.appendChild(line);
        oreCargoLineMap.set(item.oreId, line);
      }
    } else {
      r.breakdownSection.style.display = 'none';
    }

    // ── Mining route controls ──
    if (ship.miningRoute) {
      r.activeRouteContainer.style.display = '';
      r.setupRouteContainer.style.display = 'none';

      const route = ship.miningRoute;
      const sellLoc = gd.world.locations.find(
        (l) => l.id === route.sellLocationId
      );

      r.activeRouteLabel.textContent = `\u{1F504} Auto-sell route \u2192 ${sellLoc?.name ?? 'Unknown'}`;

      let statusLabel: string = route.status;
      if (route.status === 'mining') {
        statusLabel = `Mining (${Math.round(cargoPct)}% full)`;
      } else if (route.status === 'selling') {
        statusLabel = `In transit to ${sellLoc?.name ?? 'sell station'}`;
      } else if (route.status === 'returning') {
        statusLabel = `Returning to ${location.name}`;
      }

      const infoText = `Trips: ${route.totalTrips} \u00B7 Revenue: ${formatCredits(route.totalCreditsEarned)} \u00B7 ${statusLabel}`;
      r.activeRouteInfoSpan.textContent = infoText;

      const routeAge = gd.gameTime - route.assignedAt;
      if (routeAge > 0 && route.totalCreditsEarned > 0) {
        const routeHours = routeAge / GAME_SECONDS_PER_HOUR;

        // Estimate costs over route lifetime
        const salaryCrPerHr = getSalaryCrPerHour(ship);
        const salaryTotalEst = salaryCrPerHr * routeHours;

        let fuelTotalEst = 0;
        if (sellLoc && route.totalTrips > 0) {
          const dist = getDistanceBetween(location, sellLoc);
          const roundTripFuelKg =
            2 * calculateTripFuelKg(ship, dist, ship.flightProfileBurnFraction);
          const fuelPrice = getFuelPricePerKg(location, ship);
          fuelTotalEst = roundTripFuelKg * fuelPrice * route.totalTrips;
        }

        const estProfit =
          route.totalCreditsEarned - salaryTotalEst - fuelTotalEst;
        const profitPerHr = Math.round(estProfit / routeHours);
        const profitLabel =
          profitPerHr >= 0
            ? `+${formatCredits(profitPerHr)}`
            : formatCredits(profitPerHr);
        r.activeRouteProfitSpan.textContent = `~${profitLabel}/hr profit`;
        r.activeRouteProfitSpan.style.color =
          profitPerHr >= 0 ? '#4caf50' : '#ff6b6b';
        r.activeRouteProfitSpan.style.display = '';
      } else {
        r.activeRouteProfitSpan.style.display = 'none';
      }
    } else {
      r.activeRouteContainer.style.display = 'none';
      r.setupRouteContainer.style.display = '';

      const tradeLocations = gd.world.locations.filter(
        (l) =>
          l.id !== location.id &&
          l.services.includes('trade') &&
          canShipAccessLocation(ship, l)
      );

      if (tradeLocations.length === 0) {
        r.noTradeMsg.style.display = '';
        r.destListContainer.style.display = 'none';
        r.setupHint.style.display = 'none';
      } else {
        r.noTradeMsg.style.display = 'none';
        r.destListContainer.style.display = 'flex';
        r.setupHint.style.display = '';

        const salaryCrPerHr = getSalaryCrPerHour(ship);

        const destData = tradeLocations.map((loc) => {
          const dist = getDistanceBetween(location, loc);
          const distKm = dist;

          const estOre = rateOre;
          let crPerHr = 0;
          let sellPrice = 0;
          let roundTripSec = 0;
          let profitCrPerHr = 0;
          let costCrPerHr = 0;

          if (estOre && hasEquipment) {
            sellPrice = getOreSellPrice(estOre, loc, ship);
            const yieldPerHr = getMiningYieldPerHour(ship, location, estOre);
            const cargoUnits = Math.floor(maxCargoKg / estOre.weightPerUnit);
            const fillSec =
              yieldPerHr > 0
                ? (cargoUnits / yieldPerHr) * GAME_SECONDS_PER_HOUR
                : Infinity;
            roundTripSec =
              2 *
              estimateTripTime(ship, distKm, ship.flightProfileBurnFraction);
            const cycleSec = fillSec + roundTripSec;

            if (cycleSec > 0 && cycleSec < Infinity) {
              const cycleHours = cycleSec / GAME_SECONDS_PER_HOUR;
              const revenuePerCycle = sellPrice * cargoUnits;
              crPerHr = revenuePerCycle / cycleHours;

              // Costs: crew salary over full cycle + fuel for round trip
              const salaryCostPerCycle = salaryCrPerHr * cycleHours;
              const roundTripFuelKg =
                2 *
                calculateTripFuelKg(
                  ship,
                  distKm,
                  ship.flightProfileBurnFraction
                );
              const fuelPrice = getFuelPricePerKg(location, ship);
              const fuelCostPerCycle = roundTripFuelKg * fuelPrice;

              costCrPerHr =
                (salaryCostPerCycle + fuelCostPerCycle) / cycleHours;
              profitCrPerHr = crPerHr - costCrPerHr;
            }
          }

          return {
            loc,
            dist,
            sellPrice,
            roundTripSec,
            crPerHr,
            profitCrPerHr,
            costCrPerHr,
          };
        });

        destData.sort((a, b) => b.profitCrPerHr - a.profitCrPerHr);

        const currentLocIds = new Set<string>();
        for (const {
          loc,
          dist,
          sellPrice,
          roundTripSec,
          profitCrPerHr,
          costCrPerHr,
        } of destData) {
          currentLocIds.add(loc.id);

          const distLabel = formatDistance(dist);

          let entry = destRowMap.get(loc.id);
          if (!entry) {
            entry = createDestRow(loc.id, cb);
            destRowMap.set(loc.id, entry);
            r.destListContainer.appendChild(entry.row);
          }

          entry.infoEl.textContent = `${loc.name} \u00B7 ${distLabel}`;
          if (roundTripSec > 0) {
            entry.infoEl.textContent += ` \u00B7 RT ~${formatDualTime(roundTripSec)}`;
          }

          if (rateOre && sellPrice > 0) {
            entry.revenueSpan.textContent = `${rateOre.icon} ${formatCredits(sellPrice)}/unit`;

            const roundedCost = Math.round(costCrPerHr);
            if (roundedCost > 0) {
              entry.costSpan.textContent = `Costs: ~${formatCredits(roundedCost)}/hr`;
              entry.costSpan.style.display = '';
            } else {
              entry.costSpan.style.display = 'none';
            }

            const profitLabel =
              profitCrPerHr >= 0
                ? `+${formatCredits(Math.round(profitCrPerHr))}`
                : formatCredits(Math.round(profitCrPerHr));
            entry.netSpan.textContent = `Profit: ~${profitLabel}/hr`;
            entry.netSpan.style.color =
              profitCrPerHr >= 0 ? '#4caf50' : '#ff6b6b';
            entry.netSpan.style.display = '';

            entry.profitEl.style.display = '';
          } else {
            entry.profitEl.style.display = 'none';
          }
        }

        for (const [id, entry] of destRowMap) {
          if (!currentLocIds.has(id)) {
            entry.row.remove();
            destRowMap.delete(id);
          }
        }

        for (const { loc } of destData) {
          const entry = destRowMap.get(loc.id);
          if (entry) {
            r.destListContainer.appendChild(entry.row);
          }
        }
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  /** Convert ship salary (per-tick) to credits per game hour. */
  function getSalaryCrPerHour(ship: Ship): number {
    const salaryPerTick = calculateShipSalaryPerTick(ship);
    const ticksPerHour = GAME_SECONDS_PER_HOUR / GAME_SECONDS_PER_TICK;
    return salaryPerTick * ticksPerHour;
  }

  function createOrePickerRow(
    id: string,
    groupName: string,
    cb: MiningPanelCallbacks
  ): {
    row: HTMLLabelElement;
    radio: HTMLInputElement;
    nameEl: HTMLSpanElement;
    infoEl: HTMLSpanElement;
  } {
    const row = document.createElement('label');
    row.style.cssText = `
      display: flex; align-items: center; gap: 6px; padding: 3px 6px;
      border-radius: 3px; font-size: 0.82rem; cursor: pointer;
      background: rgba(255,165,0,0.06); border: 1px solid transparent;
    `;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = id;
    radio.style.cssText = 'margin: 0; accent-color: #ffa500;';
    radio.addEventListener('change', () => {
      if (radio.checked) {
        cb.onSelectMiningOre(id === '__auto__' ? null : id);
      }
    });
    row.appendChild(radio);

    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'color: #ddd; white-space: nowrap;';
    row.appendChild(nameEl);

    const infoEl = document.createElement('span');
    infoEl.style.cssText =
      'color: #888; font-size: 0.78rem; margin-left: auto; white-space: nowrap;';
    row.appendChild(infoEl);

    return { row, radio, nameEl, infoEl };
  }

  function createDestRow(
    locId: string,
    cb: MiningPanelCallbacks
  ): {
    row: HTMLDivElement;
    infoEl: HTMLDivElement;
    profitEl: HTMLDivElement;
    revenueSpan: HTMLSpanElement;
    costSpan: HTMLSpanElement;
    netSpan: HTMLSpanElement;
    selectBtn: HTMLButtonElement;
  } {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex; align-items: center; gap: 6px; padding: 5px 8px;
      border-radius: 3px; font-size: 0.82rem;
      background: rgba(255,255,255,0.03); border: 1px solid #333;
    `;

    const textCol = document.createElement('div');
    textCol.style.cssText = 'flex: 1; min-width: 0;';

    const infoEl = document.createElement('div');
    infoEl.style.cssText =
      'color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    textCol.appendChild(infoEl);

    const profitEl = document.createElement('div');
    profitEl.style.cssText =
      'font-size: 0.78rem; display: flex; flex-wrap: wrap; gap: 0 6px;';
    textCol.appendChild(profitEl);

    const revenueSpan = document.createElement('span');
    revenueSpan.style.color = '#888';
    profitEl.appendChild(revenueSpan);

    const costSpan = document.createElement('span');
    costSpan.style.color = '#ffa500';
    profitEl.appendChild(costSpan);

    const netSpan = document.createElement('span');
    netSpan.style.fontWeight = 'bold';
    profitEl.appendChild(netSpan);

    row.appendChild(textCol);

    const selectBtn = document.createElement('button');
    selectBtn.textContent = 'Select';
    selectBtn.style.cssText =
      'font-size: 0.75rem; padding: 2px 10px; white-space: nowrap;';
    selectBtn.addEventListener('click', () => cb.onStartMiningRoute(locId));
    row.appendChild(selectBtn);

    return { row, infoEl, profitEl, revenueSpan, costSpan, netSpan, selectBtn };
  }
}
