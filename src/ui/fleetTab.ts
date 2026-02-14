import type { GameData, Ship } from '../models';
import { getActiveShip } from '../models';
import { getShipClass, SHIP_CLASSES } from '../shipClasses';
import type { RoomType } from '../models';
import { getEngineDefinition } from '../engines';
import { formatTradeRouteName } from '../utils';
import { getRoomDefinition } from '../rooms';
import { getEquipmentDefinition } from '../equipment';
import { computeMaxRange } from '../flightPhysics';
import { calculateTripFuelKg } from '../questGen';
import { getDistanceBetween } from '../worldGen';
import { createFleetPanel } from './fleetPanel';
import {
  formatCredits,
  formatLargeNumber,
  getRangeLabel,
  formatMass,
} from '../formatting';
import { formatDualTime } from '../timeSystem';
import {
  getShipStatus,
  getShipHealthAlerts,
  getShipPerformance,
  getFuelContext,
  getMissingCrewRoles,
  type ShipStatus,
} from '../fleetAnalytics';
import { calculateDailyLedger } from '../dailyLedger';
import type { Component } from './component';
import {
  formatFuelMass,
  calculateFuelPercentage,
  getFuelColorHex,
} from './fuelFormatting';
import { generateShipName } from '../names';
import {
  formatResourceCost,
  checkResourceCost,
  canAffordResources,
} from '../resourceCost';

/**
 * Rooms that vary between ship classes and are worth highlighting in purchase cards.
 * Universal rooms (bridge, engine_room, cargo_hold) are on every ship so omitted.
 */
const DIFFERENTIATING_ROOMS: RoomType[] = [
  'mining_bay',
  'armory',
  'medbay',
  'reactor_room',
  'point_defense_station',
];

export interface FleetTabCallbacks {
  onSelectShip: (shipId: string) => void;
  onBuyShip: (classId: string, shipName: string) => void;
  onNavigateShip?: (shipId: string) => void;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status: ShipStatus): string {
  const badges = {
    critical:
      '<span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; font-weight: bold; background: #ff4444; color: white;">🔴 CRITICAL</span>',
    warning:
      '<span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; font-weight: bold; background: #fbbf24; color: #000;">🟡 WARNING</span>',
    earning:
      '<span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; font-weight: bold; background: #4ade80; color: #000;">🟢 EARNING</span>',
    idle: '<span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; font-weight: bold; background: #60a5fa; color: white;">🔵 IDLE</span>',
    maintenance:
      '<span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; font-weight: bold; background: #a78bfa; color: white;">🟣 MAINTENANCE</span>',
  };
  return badges[status];
}

export function createFleetTab(
  gameData: GameData,
  callbacks: FleetTabCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'fleet-tab';
  container.style.padding = '1rem';

  // --- Slot for fleet map (always visible, leaf helper swapped each tick) ---
  const fleetMapSlot = document.createElement('div');
  container.appendChild(fleetMapSlot);

  // --- Multi-ship section (toggled via display) ---
  const multiShipSection = document.createElement('div');
  container.appendChild(multiShipSection);

  // Fleet Panel — created once, updated in-place
  const panelSection = document.createElement('div');
  panelSection.style.marginBottom = '1.5rem';
  const panelTitle = document.createElement('h3');
  panelTitle.textContent = 'Your Fleet';
  panelTitle.style.marginBottom = '0.75rem';
  panelSection.appendChild(panelTitle);
  const fleetPanelComp = createFleetPanel(gameData, {
    onSelectShip: callbacks.onSelectShip,
  });
  panelSection.appendChild(fleetPanelComp.el);
  multiShipSection.appendChild(panelSection);

  // Slot for performance dashboard (leaf helper)
  const dashboardSlot = document.createElement('div');
  multiShipSection.appendChild(dashboardSlot);

  // Slot for needs-attention queue (leaf helper)
  const attentionSlot = document.createElement('div');
  multiShipSection.appendChild(attentionSlot);

  // Slot for ship comparison (leaf helper)
  const comparisonSlot = document.createElement('div');
  multiShipSection.appendChild(comparisonSlot);

  // --- Single-ship section (toggled via display) ---
  const singleShipSection = document.createElement('div');
  container.appendChild(singleShipSection);

  const welcomeSection = document.createElement('div');
  welcomeSection.style.marginBottom = '1.5rem';
  welcomeSection.style.padding = '1rem';
  welcomeSection.style.background = 'rgba(0, 0, 0, 0.3)';
  welcomeSection.style.border = '1px solid #444';
  welcomeSection.style.borderRadius = '4px';
  const welcomeTitle = document.createElement('h3');
  welcomeTitle.textContent = 'Fleet Management';
  welcomeTitle.style.marginBottom = '0.5rem';
  welcomeSection.appendChild(welcomeTitle);
  const welcomeMessage = document.createElement('p');
  welcomeMessage.style.color = '#aaa';
  welcomeMessage.style.fontSize = '0.9rem';
  welcomeMessage.style.lineHeight = '1.6';
  welcomeMessage.textContent =
    'Welcome to Fleet Management! Expand your operations by purchasing additional ships. Each ship can operate independently, running separate contracts and exploring different regions of space.';
  welcomeSection.appendChild(welcomeMessage);
  singleShipSection.appendChild(welcomeSection);

  // Slot for single ship card (leaf helper)
  const singleCardSlot = document.createElement('div');
  singleShipSection.appendChild(singleCardSlot);

  // Stable area: ship purchase inputs/buttons persist across ticks
  const purchaseComp = createShipPurchase(gameData, callbacks);
  container.appendChild(purchaseComp.el);

  const dockedHint = document.createElement('div');
  dockedHint.style.marginTop = '1.5rem';
  dockedHint.style.padding = '1rem';
  dockedHint.style.background = 'rgba(0, 0, 0, 0.3)';
  dockedHint.style.border = '1px solid #444';
  dockedHint.style.borderRadius = '4px';
  dockedHint.style.color = '#aaa';
  dockedHint.style.fontSize = '0.9rem';
  dockedHint.textContent = '💡 Dock at a station to purchase additional ships.';
  container.appendChild(dockedHint);

  /** Swap the single child of a slot div (leaf helper pattern). */
  function swapSlot(slot: HTMLElement, newChild: HTMLElement): void {
    if (slot.firstChild) slot.removeChild(slot.firstChild);
    slot.appendChild(newChild);
  }

  function update(gameData: GameData) {
    // Fleet map — always visible (leaf helper, swapped each tick)
    swapSlot(fleetMapSlot, renderFleetMap(gameData, callbacks));

    const isMultiShip = gameData.ships.length > 1;
    multiShipSection.style.display = isMultiShip ? '' : 'none';
    singleShipSection.style.display = isMultiShip ? 'none' : '';

    if (isMultiShip) {
      // Update fleet panel in-place (mount-once component)
      fleetPanelComp.update(gameData);

      // Leaf helper slots
      swapSlot(dashboardSlot, renderFleetPerformanceDashboard(gameData));

      const needsAttention = gameData.ships.filter((ship) => {
        const status = getShipStatus(ship);
        return status === 'critical' || status === 'warning';
      });
      if (needsAttention.length > 0) {
        swapSlot(attentionSlot, renderNeedsAttentionQueue(needsAttention));
      } else {
        swapSlot(attentionSlot, renderAllShipsOperational());
      }

      swapSlot(
        comparisonSlot,
        renderEnhancedShipComparison(gameData, callbacks)
      );
    } else if (gameData.ships.length === 1) {
      swapSlot(
        singleCardSlot,
        renderEnhancedShipCard(gameData, gameData.ships[0], callbacks)
      );
    }

    // Update stable purchase section in-place (toggle visibility)
    const activeShip = getActiveShip(gameData);
    const isDocked = activeShip.location.status === 'docked';
    purchaseComp.el.style.display = isDocked ? '' : 'none';
    dockedHint.style.display = isDocked ? 'none' : '';
    purchaseComp.update(gameData);
  }

  update(gameData);
  return { el: container, update };
}

/**
 * Render Fleet Map - Strategic overview of all ships' positions
 */
function renderFleetMap(
  gameData: GameData,
  callbacks: FleetTabCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'fleet-map-section';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.background = 'rgba(0, 0, 0, 0.3)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = 'Fleet Map';
  title.style.marginBottom = '0.75rem';
  section.appendChild(title);

  // Visual map showing all locations and ships
  const mapContainer = document.createElement('div');
  mapContainer.style.position = 'relative';
  mapContainer.style.height = '200px';
  mapContainer.style.background = 'rgba(0, 0, 0, 0.5)';
  mapContainer.style.borderRadius = '4px';
  mapContainer.style.border = '1px solid #666';
  mapContainer.style.marginBottom = '1rem';

  // Render location markers
  for (const location of gameData.world.locations) {
    const marker = document.createElement('div');
    marker.style.position = 'absolute';
    marker.style.left = `${location.x}%`;
    marker.style.top = `${location.y}%`;
    marker.style.transform = 'translate(-50%, -50%)';
    marker.style.display = 'flex';
    marker.style.flexDirection = 'column';
    marker.style.alignItems = 'center';
    marker.style.gap = '4px';

    // Location dot
    const dot = document.createElement('div');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.background = '#666';
    dot.style.border = '1px solid #888';
    marker.appendChild(dot);

    // Location name
    const name = document.createElement('div');
    name.style.fontSize = '0.7rem';
    name.style.color = '#888';
    name.style.whiteSpace = 'nowrap';
    name.textContent = location.name;
    marker.appendChild(name);

    mapContainer.appendChild(marker);
  }

  // Render ship markers on top of locations
  for (const ship of gameData.ships) {
    let shipX = 50;
    let shipY = 50;
    let locationName = '';

    if (ship.location.status === 'docked' && ship.location.dockedAt) {
      const location = gameData.world.locations.find(
        (l) => l.id === ship.location.dockedAt
      );
      if (location) {
        shipX = location.x;
        shipY = location.y;
        locationName = location.name;
      }
    } else if (
      ship.location.status === 'orbiting' &&
      ship.location.orbitingAt
    ) {
      const location = gameData.world.locations.find(
        (l) => l.id === ship.location.orbitingAt
      );
      if (location) {
        shipX = location.x;
        shipY = location.y;
        locationName = location.name;
      }
    } else if (ship.activeFlightPlan) {
      // Calculate position between origin and destination based on progress
      const origin = gameData.world.locations.find(
        (l) => l.id === ship.activeFlightPlan!.origin
      );
      const destination = gameData.world.locations.find(
        (l) => l.id === ship.activeFlightPlan!.destination
      );
      if (origin && destination) {
        const progress =
          ship.activeFlightPlan.distanceCovered /
          ship.activeFlightPlan.totalDistance;
        shipX = origin.x + (destination.x - origin.x) * progress;
        shipY = origin.y + (destination.y - origin.y) * progress;
        locationName = `→ ${destination.name}`;
      }
    }

    const shipMarker = document.createElement('div');
    shipMarker.style.position = 'absolute';
    shipMarker.style.left = `${shipX}%`;
    shipMarker.style.top = `${shipY}%`;
    shipMarker.style.transform = 'translate(-50%, -50%)';
    shipMarker.style.cursor = 'pointer';
    shipMarker.style.zIndex = '10';
    shipMarker.title = `${ship.name} - ${locationName || 'Unknown'}`;

    // Ship icon
    const shipIcon = document.createElement('div');
    shipIcon.style.fontSize = '1.2rem';
    shipIcon.textContent = '🚀';
    if (ship.id === gameData.activeShipId) {
      shipIcon.style.filter = 'drop-shadow(0 0 4px #4a9eff)';
    }

    shipMarker.appendChild(shipIcon);
    shipMarker.addEventListener('click', () => {
      callbacks.onSelectShip(ship.id);
    });

    mapContainer.appendChild(shipMarker);
  }

  section.appendChild(mapContainer);

  // Location capability comparison
  const capabilitySection = document.createElement('div');
  capabilitySection.style.fontSize = '0.85rem';

  const capabilityTitle = document.createElement('div');
  capabilityTitle.style.fontWeight = 'bold';
  capabilityTitle.style.marginBottom = '0.5rem';
  capabilityTitle.style.color = '#aaa';
  capabilityTitle.textContent = 'Reachability Matrix';
  capabilitySection.appendChild(capabilityTitle);

  // Create a grid showing which ships can reach which locations
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `120px repeat(${gameData.ships.length}, 1fr)`;
  grid.style.gap = '4px';
  grid.style.fontSize = '0.75rem';

  // Header row
  const headerCell = document.createElement('div');
  headerCell.style.padding = '4px';
  headerCell.style.fontWeight = 'bold';
  headerCell.style.color = '#888';
  headerCell.textContent = 'Location';
  grid.appendChild(headerCell);

  for (const ship of gameData.ships) {
    const shipHeader = document.createElement('div');
    shipHeader.style.padding = '4px';
    shipHeader.style.fontWeight = 'bold';
    shipHeader.style.color =
      ship.id === gameData.activeShipId ? '#4a9eff' : '#aaa';
    shipHeader.style.textAlign = 'center';
    shipHeader.style.whiteSpace = 'nowrap';
    shipHeader.style.overflow = 'hidden';
    shipHeader.style.textOverflow = 'ellipsis';
    shipHeader.textContent = ship.name;
    shipHeader.title = ship.name;
    grid.appendChild(shipHeader);
  }

  // Data rows
  for (const location of gameData.world.locations) {
    const locationCell = document.createElement('div');
    locationCell.style.padding = '4px';
    locationCell.style.color = '#aaa';
    locationCell.textContent = location.name;
    grid.appendChild(locationCell);

    for (const ship of gameData.ships) {
      const cell = document.createElement('div');
      cell.style.padding = '4px';
      cell.style.textAlign = 'center';

      // Current location is only where the ship physically is (docked or orbiting)
      const currentLocationId =
        ship.location.dockedAt || ship.location.orbitingAt || null;
      // Reference location for distance calculations (includes flight destination as fallback)
      const referenceLocationId =
        currentLocationId || ship.activeFlightPlan?.destination || 'earth';
      const currentLocation = gameData.world.locations.find(
        (l) => l.id === referenceLocationId
      );

      if (currentLocationId && location.id === currentLocationId) {
        cell.textContent = '📍';
        cell.title = 'Current location';
        cell.style.color = '#4ade80';
      } else if (currentLocation) {
        // Check if ship can reach this location
        const shipClass = getShipClass(ship.classId);
        if (shipClass) {
          const distanceKm = getDistanceBetween(currentLocation, location);
          const fuelCostKg = calculateTripFuelKg(ship, distanceKm);

          if (fuelCostKg <= ship.fuelKg) {
            cell.textContent = '✓';
            cell.title = `Can reach (${formatFuelMass(fuelCostKg)} fuel)`;
            cell.style.color = '#4ade80';
          } else {
            cell.textContent = '✗';
            cell.title = `Insufficient fuel (need ${formatFuelMass(fuelCostKg)}, have ${formatFuelMass(ship.fuelKg)})`;
            cell.style.color = '#ff4444';
          }
        }
      }

      grid.appendChild(cell);
    }
  }

  // Scrollable wrapper so the grid can overflow horizontally on mobile
  const gridScroll = document.createElement('div');
  gridScroll.className = 'fleet-reachability-scroll';
  gridScroll.appendChild(grid);
  capabilitySection.appendChild(gridScroll);
  section.appendChild(capabilitySection);

  return section;
}

/**
 * Render Fleet Performance Dashboard
 */
function renderFleetPerformanceDashboard(gameData: GameData): HTMLElement {
  const section = document.createElement('div');
  section.className = 'fleet-performance-dashboard';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.background = 'rgba(0, 0, 0, 0.3)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '0.5rem';
  titleRow.style.marginBottom = '0.75rem';

  const title = document.createElement('h3');
  title.textContent = 'Fleet Performance Dashboard';
  title.style.margin = '0';
  titleRow.appendChild(title);

  const fleetBadge = document.createElement('span');
  fleetBadge.textContent = 'FLEET-WIDE';
  fleetBadge.style.fontSize = '0.65rem';
  fleetBadge.style.fontWeight = 'bold';
  fleetBadge.style.padding = '2px 6px';
  fleetBadge.style.borderRadius = '3px';
  fleetBadge.style.background = 'rgba(74, 158, 255, 0.2)';
  fleetBadge.style.border = '1px solid rgba(74, 158, 255, 0.4)';
  fleetBadge.style.color = '#4a9eff';
  titleRow.appendChild(fleetBadge);

  section.appendChild(titleRow);

  // Calculate fleet-wide metrics
  let totalEarned = 0;
  let totalCosts = 0;
  let totalContractsCompleted = 0;
  let activeShips = 0;
  let idleShips = 0;

  const shipPerformances = gameData.ships.map((ship) => {
    const perf = getShipPerformance(ship);
    totalEarned += ship.metrics.creditsEarned;
    totalCosts +=
      ship.metrics.crewCostsPaid +
      ship.metrics.fuelCostsPaid +
      ship.metrics.repairCostsPaid;
    totalContractsCompleted += ship.metrics.contractsCompleted;

    if (ship.activeContract && !ship.activeContract.paused) {
      activeShips++;
    } else if (
      ship.location.status === 'docked' ||
      ship.location.status === 'orbiting'
    ) {
      idleShips++;
    }

    return { ship, perf };
  });

  // Sort by net profit
  shipPerformances.sort((a, b) => b.perf.netProfit - a.perf.netProfit);

  const netProfit = totalEarned - totalCosts;
  const profitMargin = totalEarned > 0 ? (netProfit / totalEarned) * 100 : 0;

  const dashboardContent = document.createElement('div');
  dashboardContent.style.display = 'flex';
  dashboardContent.style.flexDirection = 'column';
  dashboardContent.style.gap = '1rem';

  // Financial Summary
  const ledger = calculateDailyLedger(gameData);
  const dailyNet = Math.round(ledger.netPerDay);
  const dailyNetSign = dailyNet >= 0 ? '+' : '';
  const dailyNetColor = dailyNet >= 0 ? '#4ade80' : '#ff4444';
  const incomeText =
    ledger.incomeDays > 0
      ? `+${formatCredits(Math.round(ledger.incomePerDay))}/day`
      : 'collecting data\u2026';
  const incomeNote =
    ledger.incomeDays > 0
      ? `<span style="color: #666; font-size: 0.8rem;">(${ledger.incomeDays}d avg)</span>`
      : '';
  const expensesText =
    ledger.expenseDays > 0
      ? `-${formatCredits(Math.round(ledger.totalExpensePerDay))}/day`
      : 'collecting data\u2026';
  const expensesBreakdown =
    ledger.expenseDays > 0
      ? `<span style="color: #666; font-size: 0.8rem;">(crew: ${Math.round(ledger.crewCostPerDay).toLocaleString()}, fuel: ${Math.round(ledger.fuelCostPerDay).toLocaleString()})</span>`
      : '';
  const runwayText =
    ledger.incomeDays === 0 || ledger.expenseDays === 0
      ? '<span style="color: #666;">collecting data\u2026</span>'
      : ledger.runwayDays !== null
        ? `<span style="color: ${ledger.runwayDays < 3 ? '#ff4444' : '#ffa500'};">${ledger.runwayDays.toFixed(1)} days</span>`
        : '<span style="color: #4ade80;">Stable</span>';

  const financialRow = document.createElement('div');
  financialRow.innerHTML = `
    <div style="padding: 0.75rem; background: rgba(0, 0, 0, 0.4); border-radius: 4px;">
      <div style="font-size: 0.85rem; color: #888; margin-bottom: 0.5rem;">FINANCIAL SUMMARY</div>
      <div style="display: flex; gap: 2rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
        <div><span style="color: #aaa;">Total Earned:</span> <span style="color: #4ade80; font-weight: bold;">${formatCredits(totalEarned)}</span></div>
        <div><span style="color: #aaa;">Operating Costs:</span> <span style="color: #ffa500;">${formatCredits(totalCosts)}</span></div>
        <div><span style="color: #aaa;">Net Profit:</span> <span style="color: ${netProfit >= 0 ? '#4ade80' : '#ff4444'}; font-weight: bold;">${netProfit >= 0 ? '+' : ''}${formatCredits(netProfit)}</span> <span style="color: #888; font-size: 0.85rem;">(${profitMargin >= 0 ? '+' : ''}${profitMargin.toFixed(0)}% margin)</span></div>
      </div>
      <div style="border-top: 1px solid #333; padding-top: 0.5rem; display: flex; gap: 2rem; flex-wrap: wrap;">
        <div><span style="color: #aaa;">Income:</span> <span style="color: #4ade80;">${incomeText}</span> ${incomeNote}</div>
        <div><span style="color: #aaa;">Expenses:</span> <span style="color: ${ledger.expenseDays > 0 ? '#ffa500' : '#666'};">${expensesText}</span> ${expensesBreakdown}</div>
        <div><span style="color: #aaa;">Net Rate:</span> <span style="color: ${dailyNetColor}; font-weight: bold;">${dailyNetSign}${formatCredits(dailyNet)}/day</span></div>
        <div><span style="color: #aaa;">Runway:</span> ${runwayText}</div>
      </div>
    </div>
  `;
  dashboardContent.appendChild(financialRow);

  // Top Performers
  if (shipPerformances.length > 0) {
    const performersRow = document.createElement('div');
    performersRow.innerHTML = `
      <div style="padding: 0.75rem; background: rgba(0, 0, 0, 0.4); border-radius: 4px;">
        <div style="font-size: 0.85rem; color: #888; margin-bottom: 0.5rem;">📊 TOP PERFORMERS <span style="color: #666; font-size: 0.7rem;">(per-ship profitability)</span></div>
        ${shipPerformances
          .slice(0, 3)
          .map((sp, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
            const color = sp.perf.netProfit >= 0 ? '#4ade80' : '#ff4444';
            return `
            <div style="margin-bottom: 0.25rem;">
              ${medal} <span style="font-weight: bold;">${sp.ship.name}:</span>
              <span style="color: ${color};">${sp.perf.netProfit >= 0 ? '+' : ''}${formatCredits(sp.perf.netProfit)}</span>
              <span style="color: #888; font-size: 0.85rem;">(${sp.perf.creditsPerDay.toFixed(0)} cr/day, ${sp.perf.uptime.toFixed(0)}% uptime, ${sp.ship.metrics.contractsCompleted} contracts)</span>
              ${sp.perf.netProfit < 0 ? '<span style="color: #ffa500; margin-left: 8px;">⚠️ UNDERPERFORMING</span>' : ''}
            </div>
          `;
          })
          .join('')}
      </div>
    `;
    dashboardContent.appendChild(performersRow);
  }

  // Fleet Utilization
  const utilizationRow = document.createElement('div');
  const utilizationPercent =
    gameData.ships.length > 0
      ? ((activeShips / gameData.ships.length) * 100).toFixed(0)
      : 0;

  utilizationRow.innerHTML = `
    <div style="padding: 0.75rem; background: rgba(0, 0, 0, 0.4); border-radius: 4px;">
      <div style="font-size: 0.85rem; color: #888; margin-bottom: 0.5rem;">🎯 FLEET UTILIZATION</div>
      <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
        <div><span style="color: #aaa;">Active:</span> <span style="color: #4ade80; font-weight: bold;">${activeShips} ships</span> <span style="color: #888;">(${utilizationPercent}%)</span></div>
        <div><span style="color: #aaa;">Idle:</span> <span style="color: ${idleShips > 0 ? '#ffa500' : '#aaa'};">${idleShips} ships</span></div>
        <div><span style="color: #aaa;">Total Contracts:</span> <span style="font-weight: bold;">${totalContractsCompleted}</span></div>
      </div>
    </div>
  `;
  dashboardContent.appendChild(utilizationRow);

  section.appendChild(dashboardContent);
  return section;
}

/**
 * Render "All ships operational" neutral state for the attention slot.
 */
function renderAllShipsOperational(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'needs-attention-queue';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.background = 'rgba(74, 158, 255, 0.05)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';
  section.style.opacity = '0.6';

  const title = document.createElement('h3');
  title.textContent = 'Fleet Status: All Ships Operational';
  title.style.color = '#aaa';
  title.style.fontSize = '0.9rem';
  section.appendChild(title);

  return section;
}

/**
 * Render Needs Attention Queue
 */
function renderNeedsAttentionQueue(ships: Ship[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'needs-attention-queue';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.background = 'rgba(255, 68, 68, 0.1)';
  section.style.border = '2px solid #ff4444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = `⚠️ Needs Attention (${ships.length} ${ships.length === 1 ? 'Ship' : 'Ships'})`;
  title.style.marginBottom = '0.75rem';
  title.style.color = '#ff4444';
  section.appendChild(title);

  const alertsList = document.createElement('div');
  alertsList.style.display = 'flex';
  alertsList.style.flexDirection = 'column';
  alertsList.style.gap = '0.5rem';

  for (const ship of ships) {
    const alerts = getShipHealthAlerts(ship);
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
    const warningAlerts = alerts.filter((a) => a.severity === 'warning');

    const shipAlert = document.createElement('div');
    shipAlert.style.padding = '0.75rem';
    shipAlert.style.background = 'rgba(0, 0, 0, 0.4)';
    shipAlert.style.borderRadius = '4px';
    shipAlert.style.borderLeft =
      '4px solid ' + (criticalAlerts.length > 0 ? '#ff4444' : '#fbbf24');

    shipAlert.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 0.5rem; color: ${criticalAlerts.length > 0 ? '#ff4444' : '#fbbf24'};">
        ${ship.name}
      </div>
      ${[...criticalAlerts, ...warningAlerts]
        .map(
          (alert) => `
        <div style="font-size: 0.85rem; margin-bottom: 0.25rem; color: ${alert.severity === 'critical' ? '#ff4444' : '#fbbf24'};">
          ${alert.severity === 'critical' ? '🔴' : '🟡'} ${alert.message}
          ${alert.action ? `<span style="color: #aaa; margin-left: 8px;">→ ${alert.action}</span>` : ''}
        </div>
      `
        )
        .join('')}
    `;

    alertsList.appendChild(shipAlert);
  }

  section.appendChild(alertsList);
  return section;
}

/**
 * Render Enhanced Ship Comparison
 */
function renderEnhancedShipComparison(
  gameData: GameData,
  callbacks: FleetTabCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'ship-comparison-section';
  section.style.marginBottom = '1.5rem';

  const title = document.createElement('h3');
  title.textContent = 'Ship Comparison';
  title.style.marginBottom = '0.75rem';
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'fleet-comparison-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(350px, 1fr))';
  grid.style.gap = '1rem';

  for (const ship of gameData.ships) {
    grid.appendChild(renderEnhancedShipCard(gameData, ship, callbacks));
  }

  section.appendChild(grid);

  return section;
}

/**
 * Render Enhanced Ship Card with all new metrics
 */
function renderEnhancedShipCard(
  gameData: GameData,
  ship: Ship,
  callbacks: FleetTabCallbacks
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'ship-card-enhanced';
  card.style.padding = '1rem';
  card.style.background = 'rgba(0, 0, 0, 0.3)';
  card.style.border = '1px solid #444';
  card.style.borderRadius = '4px';
  card.style.cursor = 'pointer';

  if (ship.id === gameData.activeShipId) {
    card.style.borderColor = '#4a9eff';
    card.style.boxShadow = '0 0 10px rgba(74, 158, 255, 0.3)';
  }

  card.addEventListener('click', () => callbacks.onSelectShip(ship.id));

  const status = getShipStatus(ship);
  const performance = getShipPerformance(ship);
  const shipClass = getShipClass(ship.classId);

  // Header: Ship name + tier + status badge
  const header = document.createElement('div');
  header.style.marginBottom = '0.75rem';

  const nameRow = document.createElement('div');
  nameRow.style.display = 'flex';
  nameRow.style.justifyContent = 'space-between';
  nameRow.style.alignItems = 'center';
  nameRow.style.marginBottom = '0.5rem';

  const nameDiv = document.createElement('div');
  nameDiv.style.fontWeight = 'bold';
  nameDiv.style.fontSize = '1.1rem';
  nameDiv.style.color = ship.id === gameData.activeShipId ? '#4a9eff' : '#fff';
  nameDiv.textContent = ship.name;
  nameRow.appendChild(nameDiv);

  if (shipClass) {
    const tierBadge = document.createElement('span');
    tierBadge.textContent = `Tier ${shipClass.tier}`;
    tierBadge.style.fontSize = '0.75rem';
    tierBadge.style.fontWeight = 'bold';
    tierBadge.style.padding = '2px 6px';
    tierBadge.style.borderRadius = '3px';
    tierBadge.style.background = `${getTierColor(shipClass.tier)}33`;
    tierBadge.style.color = getTierColor(shipClass.tier);
    nameRow.appendChild(tierBadge);
  }

  header.appendChild(nameRow);

  const statusBadge = document.createElement('div');
  statusBadge.innerHTML = getStatusBadge(status);
  header.appendChild(statusBadge);

  card.appendChild(header);

  // Ship class
  const classDiv = document.createElement('div');
  classDiv.style.fontSize = '0.9rem';
  classDiv.style.color = '#aaa';
  classDiv.style.marginBottom = '0.75rem';
  classDiv.textContent = shipClass?.name || ship.classId;
  card.appendChild(classDiv);

  // Contract Details (if active)
  if (ship.activeContract) {
    const contractDiv = document.createElement('div');
    contractDiv.style.padding = '0.75rem';
    contractDiv.style.background = 'rgba(74, 158, 255, 0.1)';
    contractDiv.style.borderRadius = '4px';
    contractDiv.style.marginBottom = '0.75rem';
    contractDiv.style.border = '1px solid #4a9eff';

    const quest = ship.activeContract.quest;
    const origin = gameData.world.locations.find((l) => l.id === quest.origin);
    const dest = gameData.world.locations.find(
      (l) => l.id === quest.destination
    );

    contractDiv.innerHTML = `
      <div style="font-size: 0.85rem; font-weight: bold; color: #4a9eff; margin-bottom: 0.5rem;">
        📋 ACTIVE CONTRACT ${ship.activeContract.paused ? '<span style="color: #ffa500;">(PAUSED)</span>' : ''}
      </div>
      <div style="font-size: 0.85rem; margin-bottom: 0.25rem;">
        <span style="color: #aaa;">Type:</span> ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)}
      </div>
      <div style="font-size: 0.85rem; margin-bottom: 0.25rem;">
        <span style="color: #aaa;">Route:</span> ${quest.type === 'trade_route' || quest.type === 'freight' ? formatTradeRouteName(origin?.name || quest.origin, dest?.name || quest.destination) : `${origin?.name || quest.origin} \u2192 ${dest?.name || quest.destination}`}
      </div>
      ${
        quest.tripsRequired > 1 || quest.tripsRequired === -1
          ? `
        <div style="font-size: 0.85rem; margin-bottom: 0.25rem;">
          <span style="color: #aaa;">Progress:</span> ${ship.activeContract.tripsCompleted}/${quest.tripsRequired === -1 ? '∞' : quest.tripsRequired} trips
          <span style="color: #888;">(${quest.tripsRequired > 0 ? Math.round((ship.activeContract.tripsCompleted / quest.tripsRequired) * 100) : 0}%)</span>
        </div>
      `
          : ''
      }
      <div style="font-size: 0.85rem; margin-bottom: 0.25rem;">
        <span style="color: #aaa;">Earned:</span> <span style="color: #4ade80; font-weight: bold;">${formatCredits(ship.activeContract.creditsEarned)}</span>
        ${quest.paymentOnCompletion > 0 ? `<span style="color: #888;"> / ${formatCredits(quest.paymentOnCompletion)} total</span>` : ''}
      </div>
    `;

    card.appendChild(contractDiv);
  }

  // Location
  const locationDiv = document.createElement('div');
  locationDiv.style.fontSize = '0.85rem';
  locationDiv.style.color = '#888';
  locationDiv.style.marginBottom = '0.75rem';
  if (ship.location.status === 'docked') {
    const dockedAt = ship.location.dockedAt;
    const location = gameData.world.locations.find((l) => l.id === dockedAt);
    locationDiv.innerHTML = `<span style="color: #4ade80;">●</span> Docked at ${location?.name || dockedAt}`;
  } else if (ship.location.status === 'orbiting') {
    const orbitingAt = ship.location.orbitingAt;
    const location = gameData.world.locations.find((l) => l.id === orbitingAt);
    locationDiv.innerHTML = `<span style="color: #60a5fa;">●</span> Orbiting ${location?.name || orbitingAt}`;
  } else if (ship.activeFlightPlan) {
    const destId = ship.activeFlightPlan.destination;
    const destination = gameData.world.locations.find((l) => l.id === destId);
    const remainingTime =
      ship.activeFlightPlan.totalTime - ship.activeFlightPlan.elapsedTime;
    const timeLabel = formatDualTime(remainingTime);
    const progressPercent =
      (ship.activeFlightPlan.distanceCovered /
        ship.activeFlightPlan.totalDistance) *
      100;
    locationDiv.innerHTML = `<span style="color: #fbbf24;">●</span> In flight to ${destination?.name || destId}<br><span style="color: #aaa; font-size: 0.8rem;">Progress: ${progressPercent.toFixed(0)}% - ${timeLabel} remaining</span>`;
  }
  card.appendChild(locationDiv);

  // Performance Metrics
  const perfDiv = document.createElement('div');
  perfDiv.style.padding = '0.75rem';
  perfDiv.style.background = 'rgba(0, 0, 0, 0.4)';
  perfDiv.style.borderRadius = '4px';
  perfDiv.style.marginBottom = '0.75rem';
  perfDiv.style.fontSize = '0.85rem';

  const profitColor = performance.netProfit >= 0 ? '#4ade80' : '#ff4444';
  const profitMargin =
    ship.metrics.creditsEarned > 0
      ? (performance.netProfit / ship.metrics.creditsEarned) * 100
      : 0;
  perfDiv.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 0.5rem; color: #aaa;">📊 PERFORMANCE</div>
    <div style="margin-bottom: 0.25rem;">
      <span style="color: #888;">Lifetime Earned:</span> <span style="color: #4ade80; font-weight: bold;">${formatCredits(ship.metrics.creditsEarned)}</span>
    </div>
    <div style="margin-bottom: 0.25rem;">
      <span style="color: #888;">Operating Costs:</span> <span style="color: #ffa500;">${formatCredits(ship.metrics.crewCostsPaid + ship.metrics.fuelCostsPaid + ship.metrics.repairCostsPaid)}</span>
    </div>
    <div style="margin-bottom: 0.25rem;">
      <span style="color: #888;">Net Profit:</span> <span style="color: ${profitColor}; font-weight: bold;">${performance.netProfit >= 0 ? '+' : ''}${formatCredits(performance.netProfit)}</span> <span style="color: #666;">(${performance.netProfit >= 0 ? '+' : ''}${profitMargin.toFixed(1)}%)</span>
    </div>
    <div style="margin-bottom: 0.25rem;">
      <span style="color: #888;">Efficiency:</span> ${performance.creditsPerDay.toFixed(0)} cr/day | ${performance.uptime.toFixed(0)}% uptime
    </div>
    <div>
      <span style="color: #888;">Contracts:</span> ${ship.metrics.contractsCompleted} completed
    </div>
  `;
  card.appendChild(perfDiv);

  // Stats (fuel, crew, equipment, range)
  const statsDiv = document.createElement('div');
  statsDiv.style.fontSize = '0.85rem';
  statsDiv.style.color = '#aaa';
  statsDiv.style.display = 'flex';
  statsDiv.style.flexDirection = 'column';
  statsDiv.style.gap = '0.25rem';

  // Fuel with context
  const fuelContext = getFuelContext(ship, gameData);
  const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  const fuelColor = getFuelColorHex(fuelPercentage);
  const fuelLine = document.createElement('div');
  fuelLine.innerHTML = `<span style="color: #888;">Fuel:</span> <span style="color: ${fuelColor};">${fuelContext}</span>`;
  statsDiv.appendChild(fuelLine);

  // Crew with missing roles
  const missingRoles = getMissingCrewRoles(ship);
  const crewLine = document.createElement('div');
  crewLine.innerHTML = `<span style="color: #888;">Crew:</span> ${ship.crew.length}/${shipClass?.maxCrew ?? '?'}${missingRoles.length > 0 ? ` <span style="color: #ffa500;">⚠️ Missing: ${missingRoles.join(', ')}</span>` : ''}`;
  statsDiv.appendChild(crewLine);

  // Equipment
  const equipLine = document.createElement('div');
  const maxSlots = shipClass?.equipmentSlotDefs.length ?? 0;
  equipLine.innerHTML = `<span style="color: #888;">Equipment:</span> ${ship.equipment.length}/${maxSlots} slots`;
  statsDiv.appendChild(equipLine);

  // Range
  if (shipClass) {
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    const maxRangeKm = computeMaxRange(shipClass, engineDef);
    const rangeLabel = formatLargeNumber(maxRangeKm);
    const rangeLine = document.createElement('div');
    rangeLine.innerHTML = `<span style="color: #888;">Range:</span> ${rangeLabel} km`;
    rangeLine.title = `Max range: ${maxRangeKm.toLocaleString()} km`;
    statsDiv.appendChild(rangeLine);
  }

  card.appendChild(statsDiv);

  // Navigation action button
  if (callbacks.onNavigateShip) {
    const navButton = document.createElement('button');
    navButton.style.marginTop = '0.75rem';
    navButton.style.width = '100%';
    navButton.style.padding = '0.5rem';
    navButton.style.background = '#4a9eff';
    navButton.style.border = 'none';
    navButton.style.borderRadius = '4px';
    navButton.style.color = 'white';
    navButton.style.fontWeight = 'bold';
    navButton.style.cursor = 'pointer';
    navButton.textContent = '🧭 Navigate This Ship';

    // Disable if ship is in flight or has active contract
    const canNavigate =
      (ship.location.status === 'docked' ||
        ship.location.status === 'orbiting') &&
      !ship.activeContract;

    if (!canNavigate) {
      navButton.disabled = true;
      navButton.style.opacity = '0.5';
      navButton.style.cursor = 'not-allowed';
      if (ship.activeContract) {
        navButton.title = 'Complete or abandon contract to navigate freely';
      } else {
        navButton.title = 'Ship must be docked or orbiting to plan routes';
      }
    } else {
      navButton.title = 'Switch to this ship and open Navigation Chart';
      navButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        callbacks.onNavigateShip!(ship.id);
      });
    }

    card.appendChild(navButton);
  }

  return card;
}

/**
 * Ship purchase section — mount-once / update-on-tick Component.
 *
 * All cards and their three mutually-exclusive state elements (locked,
 * insufficient funds, buy form) are created once. update() toggles
 * visibility and patches text in-place, so inputs and buttons survive
 * across ticks.
 */
interface PurchaseCardRefs {
  classId: string;
  card: HTMLElement;
  mysteryContainer: HTMLElement;
  mysteryProgressFill: HTMLElement;
  mysteryProgressLabel: HTMLElement;
  detailContainer: HTMLElement;
  affordMsg: HTMLElement;
  resourceMsg: HTMLElement;
  buyContainer: HTMLElement;
  nameInput: HTMLInputElement;
}

function createShipPurchase(
  gameData: GameData,
  callbacks: FleetTabCallbacks
): Component {
  const section = document.createElement('div');
  section.className = 'ship-purchase-section';
  section.style.marginTop = '1.5rem';
  section.style.padding = '1rem';
  section.style.background = 'rgba(0, 0, 0, 0.3)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = 'Purchase Ships';
  title.style.marginBottom = '0.5rem';
  section.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent =
    'Expand your fleet by purchasing additional ships. Each ship operates independently and can run separate contracts.';
  intro.style.marginBottom = '1rem';
  intro.style.color = '#aaa';
  intro.style.fontSize = '0.9rem';
  section.appendChild(intro);

  const shipList = document.createElement('div');
  shipList.style.display = 'flex';
  shipList.style.flexDirection = 'column';
  shipList.style.gap = '0.75rem';

  const cardRefs: PurchaseCardRefs[] = [];

  for (const shipClass of SHIP_CLASSES) {
    const card = document.createElement('div');
    card.style.padding = '0.75rem';
    card.style.background = 'rgba(0, 0, 0, 0.4)';
    card.style.border = '1px solid #555';
    card.style.borderRadius = '4px';

    // ── Mystery container (shown when locked) ──
    const mysteryContainer = document.createElement('div');
    mysteryContainer.style.textAlign = 'center';
    mysteryContainer.style.padding = '0.75rem 0.5rem';

    const mysteryTierBadge = document.createElement('span');
    mysteryTierBadge.style.fontSize = '0.75rem';
    mysteryTierBadge.style.fontWeight = 'bold';
    mysteryTierBadge.style.padding = '2px 6px';
    mysteryTierBadge.style.borderRadius = '3px';
    const tierColor = getTierColor(shipClass.tier);
    mysteryTierBadge.style.background = `${tierColor}33`;
    mysteryTierBadge.style.color = tierColor;
    mysteryTierBadge.textContent = `Class ${shipClass.tier}`;
    mysteryContainer.appendChild(mysteryTierBadge);

    const mysteryIcon = document.createElement('div');
    mysteryIcon.textContent = '???';
    mysteryIcon.style.fontSize = '2rem';
    mysteryIcon.style.fontWeight = 'bold';
    mysteryIcon.style.color = '#555';
    mysteryIcon.style.margin = '0.75rem 0 0.5rem';
    mysteryContainer.appendChild(mysteryIcon);

    const mysteryTitle = document.createElement('div');
    const tierClassName: Record<string, string> = {
      I: 'Orbital Maintenance Vessel',
      II: 'Inner System Vessel',
      III: 'Interplanetary Vessel',
    };
    mysteryTitle.textContent =
      tierClassName[shipClass.tier] ?? 'Unknown Vessel';
    mysteryTitle.style.fontWeight = 'bold';
    mysteryTitle.style.color = '#888';
    mysteryTitle.style.marginBottom = '0.25rem';
    mysteryContainer.appendChild(mysteryTitle);

    const mysterySub = document.createElement('div');
    mysterySub.textContent = `Range: ${shipClass.rangeLabel}`;
    mysterySub.style.fontSize = '0.8rem';
    mysterySub.style.color = '#666';
    mysterySub.style.marginBottom = '0.5rem';
    mysteryContainer.appendChild(mysterySub);

    // Dimmed facility badges for differentiating rooms this ship has
    const mysteryFacilities = document.createElement('div');
    mysteryFacilities.style.display = 'flex';
    mysteryFacilities.style.flexWrap = 'wrap';
    mysteryFacilities.style.gap = '4px';
    mysteryFacilities.style.justifyContent = 'center';
    mysteryFacilities.style.marginBottom = '0.75rem';
    for (const roomType of DIFFERENTIATING_ROOMS) {
      if (!shipClass.rooms.includes(roomType)) continue;
      const roomDef = getRoomDefinition(roomType);
      const badge = document.createElement('span');
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '2px';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '3px';
      badge.style.fontSize = '0.75rem';
      badge.style.whiteSpace = 'nowrap';
      badge.style.opacity = '0.6';
      badge.style.background = 'rgba(255, 255, 255, 0.03)';
      badge.style.border = '1px solid rgba(255, 255, 255, 0.08)';
      badge.style.color = '#888';
      badge.textContent = `${roomDef?.icon ?? '?'} ${roomDef?.name ?? roomType}`;
      badge.title = roomDef?.description ?? roomType;
      mysteryFacilities.appendChild(badge);
    }
    if (mysteryFacilities.childElementCount > 0) {
      mysteryContainer.appendChild(mysteryFacilities);
    }

    const mysteryProgressBar = document.createElement('div');
    mysteryProgressBar.style.width = '100%';
    mysteryProgressBar.style.height = '6px';
    mysteryProgressBar.style.background = 'rgba(255, 255, 255, 0.1)';
    mysteryProgressBar.style.borderRadius = '3px';
    mysteryProgressBar.style.overflow = 'hidden';
    mysteryProgressBar.style.marginBottom = '0.25rem';

    const mysteryProgressFill = document.createElement('div');
    mysteryProgressFill.style.height = '100%';
    mysteryProgressFill.style.background = tierColor;
    mysteryProgressFill.style.transition = 'width 0.3s ease';
    mysteryProgressFill.style.borderRadius = '3px';
    mysteryProgressBar.appendChild(mysteryProgressFill);
    mysteryContainer.appendChild(mysteryProgressBar);

    const mysteryProgressLabel = document.createElement('div');
    mysteryProgressLabel.style.fontSize = '0.75rem';
    mysteryProgressLabel.style.color = '#666';
    mysteryContainer.appendChild(mysteryProgressLabel);

    card.appendChild(mysteryContainer);

    // ── Detail container (shown when unlocked) ──
    const detailContainer = document.createElement('div');

    // Static header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '0.5rem';

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.textContent = shipClass.name;
    header.appendChild(nameDiv);

    const priceDiv = document.createElement('div');
    priceDiv.style.color = '#4a9eff';
    priceDiv.style.fontWeight = 'bold';
    priceDiv.textContent = formatCredits(shipClass.price);
    header.appendChild(priceDiv);

    detailContainer.appendChild(header);

    // Static description
    const desc = document.createElement('div');
    desc.style.fontSize = '0.85rem';
    desc.style.color = '#aaa';
    desc.style.marginBottom = '0.5rem';
    desc.textContent = shipClass.description;
    detailContainer.appendChild(desc);

    // Static specs
    const specs = document.createElement('div');
    specs.style.fontSize = '0.8rem';
    specs.style.color = '#888';
    specs.style.marginBottom = '0.5rem';

    const defaultEngine = getEngineDefinition(shipClass.defaultEngineId);
    const maxRangeKm = computeMaxRange(shipClass, defaultEngine);
    const rangeLabel = getRangeLabel(maxRangeKm);
    const rangeFormatted = formatLargeNumber(maxRangeKm);

    const availableCargoKg = Math.floor(shipClass.cargoCapacity);

    // #3: Slot breakdown — standard vs structural-capable
    const structuralSlots = shipClass.equipmentSlotDefs.filter((s) =>
      s.tags.includes('structural')
    ).length;
    const standardOnlySlots =
      shipClass.equipmentSlotDefs.length - structuralSlots;
    const slotLabel =
      structuralSlots > 0
        ? `${standardOnlySlots} standard + ${structuralSlots} structural`
        : `${shipClass.equipmentSlotDefs.length} slots`;

    specs.innerHTML = `Crew: ${shipClass.maxCrew} | Cargo: ${formatMass(availableCargoKg)} | Equip: ${slotLabel}<br>Range: <span style="color: #4ade80; font-weight: bold;">${rangeFormatted} km</span> <span style="color: #aaa;">(${rangeLabel})</span>`;
    specs.title = `Max range with default engine: ${maxRangeKm.toLocaleString()} km`;
    detailContainer.appendChild(specs);

    // #4: Default engine line
    const engineLine = document.createElement('div');
    engineLine.style.fontSize = '0.8rem';
    engineLine.style.color = '#888';
    engineLine.style.marginBottom = '0.5rem';
    engineLine.innerHTML = `Engine: ${defaultEngine.icon} <span style="color: #aaa;">${defaultEngine.name}</span> <span style="color: #666;">(${defaultEngine.type})</span>`;
    detailContainer.appendChild(engineLine);

    // #1: Facilities — room/feature icon badges
    const facilitiesRow = document.createElement('div');
    facilitiesRow.style.display = 'flex';
    facilitiesRow.style.flexWrap = 'wrap';
    facilitiesRow.style.gap = '4px';
    facilitiesRow.style.marginBottom = '0.5rem';

    for (const roomType of DIFFERENTIATING_ROOMS) {
      const hasRoom = shipClass.rooms.includes(roomType);
      const roomDef = getRoomDefinition(roomType);
      const badge = document.createElement('span');
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '2px';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '3px';
      badge.style.fontSize = '0.75rem';
      badge.style.whiteSpace = 'nowrap';
      if (hasRoom) {
        badge.style.background = 'rgba(74, 222, 128, 0.15)';
        badge.style.border = '1px solid rgba(74, 222, 128, 0.3)';
        badge.style.color = '#4ade80';
      } else {
        badge.style.background = 'rgba(255, 255, 255, 0.03)';
        badge.style.border = '1px solid rgba(255, 255, 255, 0.08)';
        badge.style.color = '#555';
      }
      badge.textContent = `${roomDef?.icon ?? '?'} ${roomDef?.name ?? roomType}`;
      badge.title = hasRoom
        ? `${roomDef?.name ?? roomType}: ${roomDef?.description ?? ''}`
        : `This ship does not have a ${roomDef?.name ?? roomType}`;
      facilitiesRow.appendChild(badge);
    }

    // Features (e.g. rotating_habitat)
    if (shipClass.features.includes('rotating_habitat')) {
      const badge = document.createElement('span');
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '2px';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '3px';
      badge.style.fontSize = '0.75rem';
      badge.style.whiteSpace = 'nowrap';
      badge.style.background = 'rgba(162, 155, 254, 0.15)';
      badge.style.border = '1px solid rgba(162, 155, 254, 0.3)';
      badge.style.color = '#a29bfe';
      badge.textContent = '🔄 Rotating Habitat';
      badge.title = 'Provides spin gravity to reduce zero-g health effects';
      facilitiesRow.appendChild(badge);
    }

    detailContainer.appendChild(facilitiesRow);

    // #2: Included equipment
    const equipSection = document.createElement('div');
    equipSection.style.fontSize = '0.75rem';
    equipSection.style.color = '#888';
    equipSection.style.marginBottom = '0.5rem';

    const equipLabel = document.createElement('span');
    equipLabel.style.color = '#666';
    equipLabel.textContent = 'Included: ';
    equipSection.appendChild(equipLabel);

    const equipNames = shipClass.defaultEquipment
      .map((eqId) => {
        const def = getEquipmentDefinition(eqId);
        return def ? `${def.icon} ${def.name}` : eqId;
      })
      .join(', ');
    const equipList = document.createElement('span');
    equipList.style.color = '#aaa';
    equipList.textContent = equipNames;
    equipSection.appendChild(equipList);

    detailContainer.appendChild(equipSection);

    // Resource cost display (static — only shown for ships with resource costs)
    const resCosts = formatResourceCost(shipClass);
    if (resCosts.length > 0) {
      const resCostDiv = document.createElement('div');
      resCostDiv.style.fontSize = '0.8rem';
      resCostDiv.style.marginBottom = '0.5rem';
      resCostDiv.style.padding = '4px 8px';
      resCostDiv.style.background = 'rgba(255, 165, 0, 0.08)';
      resCostDiv.style.border = '1px solid rgba(255, 165, 0, 0.2)';
      resCostDiv.style.borderRadius = '3px';

      const resLabel = document.createElement('span');
      resLabel.style.color = '#ffa500';
      resLabel.textContent = 'Resources: ';
      resCostDiv.appendChild(resLabel);

      const resValues = document.createElement('span');
      resValues.style.color = '#ddd';
      resValues.textContent = resCosts
        .map((c) => `${c.icon} ${c.amount} ${c.name}`)
        .join(', ');
      resCostDiv.appendChild(resValues);

      detailContainer.appendChild(resCostDiv);
    }

    // Insufficient funds message (toggled via display)
    const affordMsg = document.createElement('div');
    affordMsg.style.fontSize = '0.85rem';
    affordMsg.style.color = '#ffa500';
    detailContainer.appendChild(affordMsg);

    // Insufficient resources message (toggled via display)
    const resourceMsg = document.createElement('div');
    resourceMsg.style.fontSize = '0.85rem';
    resourceMsg.style.color = '#ff8800';
    detailContainer.appendChild(resourceMsg);

    // Buy form (toggled via display)
    const buyContainer = document.createElement('div');
    buyContainer.style.display = 'flex';
    buyContainer.style.flexWrap = 'wrap';
    buyContainer.style.gap = '0.5rem';
    buyContainer.style.alignItems = 'center';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Ship name';
    nameLabel.style.cssText =
      'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);';
    buyContainer.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Ship name...';
    nameInput.id = 'fleet-ship-name-input';
    nameLabel.htmlFor = nameInput.id;
    nameInput.style.flex = '1';
    nameInput.style.minWidth = '0';
    nameInput.style.padding = '0.5rem';
    nameInput.style.background = 'rgba(0, 0, 0, 0.5)';
    nameInput.style.border = '1px solid #666';
    nameInput.style.borderRadius = '4px';
    nameInput.style.color = '#fff';
    buyContainer.appendChild(nameInput);

    const randomBtn = document.createElement('button');
    randomBtn.type = 'button';
    randomBtn.className = 'secondary';
    randomBtn.textContent = 'Randomize';
    randomBtn.style.whiteSpace = 'nowrap';
    randomBtn.style.flexShrink = '0';
    randomBtn.addEventListener('click', () => {
      nameInput.value = generateShipName();
    });
    buyContainer.appendChild(randomBtn);

    const buyBtn = document.createElement('button');
    buyBtn.textContent = 'Buy Ship';
    buyBtn.style.padding = '0.5rem 1rem';
    buyBtn.style.whiteSpace = 'nowrap';
    buyBtn.style.flexShrink = '0';
    buyBtn.addEventListener('click', () => {
      const shipName = nameInput.value.trim() || shipClass.name;
      nameInput.value = '';
      callbacks.onBuyShip(shipClass.id, shipName);
    });
    buyContainer.appendChild(buyBtn);

    detailContainer.appendChild(buyContainer);

    card.appendChild(detailContainer);

    cardRefs.push({
      classId: shipClass.id,
      card,
      mysteryContainer,
      mysteryProgressFill,
      mysteryProgressLabel,
      detailContainer,
      affordMsg,
      resourceMsg,
      buyContainer,
      nameInput,
    });

    shipList.appendChild(card);
  }

  section.appendChild(shipList);

  function update(gameData: GameData) {
    for (const refs of cardRefs) {
      const sc = SHIP_CLASSES.find((c) => c.id === refs.classId);
      if (!sc) continue;

      const isUnlocked = gameData.lifetimeCreditsEarned >= sc.unlockThreshold;

      // Toggle mystery vs detail containers
      refs.mysteryContainer.style.display = isUnlocked ? 'none' : '';
      refs.detailContainer.style.display = isUnlocked ? '' : 'none';
      refs.card.style.borderStyle = isUnlocked ? 'solid' : 'dashed';
      refs.card.style.borderColor = isUnlocked ? '#555' : '#333';

      if (!isUnlocked) {
        // Update mystery progress bar
        const progress =
          sc.unlockThreshold > 0
            ? (gameData.lifetimeCreditsEarned / sc.unlockThreshold) * 100
            : 100;
        refs.mysteryProgressFill.style.width = `${Math.min(100, progress)}%`;
        refs.mysteryProgressLabel.textContent = `${formatCredits(gameData.lifetimeCreditsEarned)} / ${formatCredits(sc.unlockThreshold)} (${Math.floor(progress)}%)`;
      } else {
        // Existing affordability/resource logic
        const canAffordCredits = gameData.credits >= sc.price;
        const hasResources = canAffordResources(gameData.ships, sc);
        const shortfalls = canAffordCredits
          ? checkResourceCost(gameData.ships, sc)
          : [];

        if (!canAffordCredits) {
          refs.affordMsg.textContent = `Insufficient funds (need ${(sc.price - gameData.credits).toLocaleString()} more credits)`;
          refs.affordMsg.style.display = '';
          refs.resourceMsg.style.display = 'none';
          refs.buyContainer.style.display = 'none';
        } else if (!hasResources) {
          refs.affordMsg.style.display = 'none';
          const missing = shortfalls
            .map((s) => `${s.name}: ${s.available}/${s.required}`)
            .join(', ');
          refs.resourceMsg.textContent = `Insufficient resources (${missing})`;
          refs.resourceMsg.style.display = '';
          refs.buyContainer.style.display = 'none';
        } else {
          refs.affordMsg.style.display = 'none';
          refs.resourceMsg.style.display = 'none';
          refs.buyContainer.style.display = '';
        }
      }
    }
  }

  update(gameData);
  return { el: section, update };
}

// Helper functions

function getTierColor(tier: string): string {
  switch (tier) {
    case 'I':
      return '#888';
    case 'II':
      return '#4a9eff';
    case 'III':
      return '#ff9f43';
    case 'IV':
      return '#ff6b6b';
    case 'V':
      return '#a29bfe';
    default:
      return '#fff';
  }
}
