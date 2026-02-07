import type { GameData, CrewEquipmentId } from '../models';
import { getActiveShip } from '../models';
import type { PlayingTab } from './renderer';
import { getShipClass } from '../shipClasses';
import { renderShipTab } from './shipTab';
import { renderCrewTab } from './crewTab';
import { renderWorkTab } from './workTab';
import { renderLogTab } from './logTab';
import { renderSettingsTab } from './settingsTab';
import { formatGameDate, TICKS_PER_DAY } from '../timeSystem';
import { getCrewRoleDefinition } from '../crewRoles';
import {
  getShipPositionKm,
  calculatePositionDanger,
  getThreatLevel,
} from '../encounterSystem';

export interface TabbedViewCallbacks {
  onReset: () => void;
  onTabChange: (tab: PlayingTab) => void;
  onCrewAssign: (crewId: string, roomId: string) => void;
  onCrewUnassign: (crewId: string, roomId: string) => void;
  onUndock: () => void;
  onDock: () => void;
  onEngineOn: () => void;
  onEngineOff: () => void;
  onToggleNavigation: () => void;
  onSelectCrew: (crewId: string) => void;
  onLevelUp: (crewId: string) => void;
  onAssignSkillPoint: (crewId: string, skillId: string) => void;
  onEquipItem: (crewId: string, itemId: string) => void;
  onUnequipItem: (crewId: string, itemId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onAdvanceDay: () => void;
  onDockAtNearestPort: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
  onBuyFuel: () => void;
  onStartTrip: (destinationId: string) => void;
  onHireCrew: (crewId: string) => void;
  onBuyEquipment: (equipmentId: CrewEquipmentId) => void;
  onSellEquipment: (itemId: string) => void;
  onSelectShip: (shipId: string) => void;
  onBuyShip: (classId: string, shipName: string) => void;
  onTransferCrew: (
    crewId: string,
    fromShipId: string,
    toShipId: string
  ) => void;
}

export function renderTabbedView(
  gameData: GameData,
  activeTab: PlayingTab,
  showNavigation: boolean,
  callbacks: TabbedViewCallbacks,
  selectedCrewId?: string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tabbed-view';

  // Ship header
  container.appendChild(renderShipHeader(gameData, callbacks));

  // Tab bar
  container.appendChild(renderTabBar(activeTab, callbacks));

  // Tab content
  if (activeTab === 'ship') {
    container.appendChild(renderShipTab(gameData, showNavigation, callbacks));
  } else if (activeTab === 'crew') {
    container.appendChild(renderCrewTab(gameData, selectedCrewId, callbacks));
  } else if (activeTab === 'work') {
    container.appendChild(
      renderWorkTab(gameData, {
        onAcceptQuest: callbacks.onAcceptQuest,
        onDockAtNearestPort: callbacks.onDockAtNearestPort,
        onResumeContract: callbacks.onResumeContract,
        onAbandonContract: callbacks.onAbandonContract,
      })
    );
  } else if (activeTab === 'log') {
    container.appendChild(renderLogTab(gameData));
  } else {
    container.appendChild(renderSettingsTab(callbacks));
  }

  return container;
}

function renderShipHeader(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const header = document.createElement('div');
  header.className = 'ship-header';

  // Date display with tick counter
  const dateHeader = document.createElement('div');
  dateHeader.className = 'date-header-global';

  const dateText = document.createElement('span');
  dateText.textContent = formatGameDate(gameData.gameTime);
  dateHeader.appendChild(dateText);

  header.appendChild(dateHeader);

  const ship = getActiveShip(gameData);

  // Ship selector bar (only when fleet has multiple ships)
  if (gameData.ships.length > 1) {
    const shipSelector = document.createElement('div');
    shipSelector.className = 'ship-selector-bar';
    shipSelector.style.display = 'flex';
    shipSelector.style.gap = '0.5rem';
    shipSelector.style.marginBottom = '0.5rem';
    shipSelector.style.flexWrap = 'wrap';

    for (const s of gameData.ships) {
      const chip = document.createElement('button');
      chip.className =
        s.id === gameData.activeShipId ? 'ship-chip active' : 'ship-chip';
      chip.textContent = s.name;
      chip.style.padding = '0.25rem 0.75rem';
      chip.style.borderRadius = '12px';
      chip.style.border =
        s.id === gameData.activeShipId ? '1px solid #4a9eff' : '1px solid #666';
      chip.style.background =
        s.id === gameData.activeShipId
          ? 'rgba(74, 158, 255, 0.2)'
          : 'rgba(0, 0, 0, 0.3)';
      chip.style.color = s.id === gameData.activeShipId ? '#4a9eff' : '#aaa';
      chip.style.cursor = 'pointer';
      chip.style.fontSize = '0.85rem';
      chip.addEventListener('click', () => callbacks.onSelectShip(s.id));
      shipSelector.appendChild(chip);
    }

    header.appendChild(shipSelector);
  }

  const shipName = document.createElement('h2');
  shipName.className = 'ship-name';
  shipName.textContent = ship.name;
  header.appendChild(shipName);

  const shipClass = getShipClass(ship.classId);
  const shipClassLabel = document.createElement('div');
  shipClassLabel.className = 'ship-class-label';
  shipClassLabel.textContent = `Class: ${shipClass?.name ?? ship.classId}`;
  header.appendChild(shipClassLabel);

  const captain = ship.crew.find((c) => c.isCaptain);
  if (captain) {
    const captainLabel = document.createElement('div');
    captainLabel.className = 'captain-label';
    captainLabel.textContent = `Captain ${captain.name}`;
    header.appendChild(captainLabel);
  }

  // Global status bar with credits, crew, and advance day
  header.appendChild(renderGlobalStatusBar(gameData, callbacks));

  return header;
}

function renderGlobalStatusBar(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const statusBar = document.createElement('div');
  statusBar.className = 'global-status-bar';
  statusBar.style.display = 'flex';
  statusBar.style.justifyContent = 'space-between';
  statusBar.style.alignItems = 'center';
  statusBar.style.marginTop = '1rem';
  statusBar.style.padding = '0.75rem';
  statusBar.style.background = 'rgba(0, 0, 0, 0.3)';
  statusBar.style.borderRadius = '4px';
  statusBar.style.border = '1px solid #444';

  const ship = getActiveShip(gameData);

  // Left side: Stats
  const statsDiv = document.createElement('div');
  statsDiv.style.display = 'flex';
  statsDiv.style.gap = '2rem';

  // Credits
  const creditsDiv = document.createElement('div');
  creditsDiv.innerHTML = `<span style="color: #888;">Credits:</span> <span style="color: #4a9eff; font-weight: bold;">${Math.round(gameData.credits).toLocaleString()}</span>`;
  statsDiv.appendChild(creditsDiv);

  // Crew count
  const shipClass = getShipClass(ship.classId);
  const maxCrew = shipClass?.maxCrew ?? '?';
  const crewDiv = document.createElement('div');
  crewDiv.innerHTML = `<span style="color: #888;">Crew:</span> <span style="font-weight: bold;">${ship.crew.length}/${maxCrew}</span>`;
  statsDiv.appendChild(crewDiv);

  // Crew cost per tick (fleet-wide)
  let totalCrewCost = 0;
  for (const s of gameData.ships) {
    for (const crew of s.crew) {
      const roleDef = getCrewRoleDefinition(crew.role);
      if (roleDef) {
        totalCrewCost += roleDef.salary;
      }
    }
  }

  if (totalCrewCost > 0) {
    const costDiv = document.createElement('div');
    costDiv.innerHTML = `<span style="color: #888;">Crew Cost:</span> <span style="color: #ffa500; font-weight: bold;">${(totalCrewCost * TICKS_PER_DAY).toFixed(0)} cr/day</span>`;
    statsDiv.appendChild(costDiv);
  }

  statusBar.appendChild(statsDiv);

  // Right side: Action buttons
  const actionsDiv = document.createElement('div');
  actionsDiv.style.display = 'flex';
  actionsDiv.style.gap = '0.5rem';
  actionsDiv.style.alignItems = 'center';

  // Status text
  const statusText = document.createElement('span');
  statusText.style.marginRight = '0.5rem';
  statusText.style.color = '#aaa';
  if (ship.location.status === 'docked') {
    const dockedAt = ship.location.dockedAt;
    const location = gameData.world.locations.find((l) => l.id === dockedAt);
    const locationName = location?.name || dockedAt;
    statusText.textContent = `Docked at ${locationName}`;
  } else {
    if (ship.location.flight) {
      const destId = ship.location.flight.destination;
      const destLocation = gameData.world.locations.find(
        (l) => l.id === destId
      );
      const destName = destLocation?.name || destId;

      // Compute regional threat for in-flight status
      const currentKm = getShipPositionKm(ship, gameData.world);
      const positionDanger = calculatePositionDanger(currentKm, gameData.world);
      const dangerRisk =
        positionDanger > 3
          ? 0.35
          : positionDanger > 1.5
            ? 0.2
            : positionDanger > 0.5
              ? 0.08
              : 0.02;
      const threatLevel = getThreatLevel(dangerRisk);

      statusText.textContent = `In flight to ${destName}`;
      if (threatLevel !== 'clear') {
        const threatLabel = document.createElement('span');
        threatLabel.style.marginLeft = '8px';
        threatLabel.style.fontWeight = '700';
        threatLabel.style.fontSize = '11px';
        threatLabel.style.padding = '2px 6px';
        threatLabel.style.borderRadius = '3px';
        const colors: Record<string, string> = {
          caution: '#ffc107',
          danger: '#e94560',
          critical: '#ff6b6b',
        };
        threatLabel.style.color = colors[threatLevel] || '#aaa';
        threatLabel.style.background = `${colors[threatLevel]}22`;
        threatLabel.textContent = threatLevel.toUpperCase();
        statusText.appendChild(threatLabel);
      }
    } else {
      statusText.textContent = 'In flight';
    }
  }
  actionsDiv.appendChild(statusText);

  // Undock/Dock button
  const dockBtn = document.createElement('button');
  dockBtn.style.padding = '0.5rem 1rem';
  if (ship.location.status === 'docked') {
    dockBtn.textContent = 'Undock';
    dockBtn.addEventListener('click', () => callbacks.onUndock());
  } else {
    dockBtn.textContent = 'Dock';
    dockBtn.addEventListener('click', () => callbacks.onDock());
  }
  actionsDiv.appendChild(dockBtn);

  // Buy Fuel button (when docked at refuel station with fuel < 100%)
  if (ship.location.status === 'docked') {
    const dockedAt = ship.location.dockedAt;
    const location = gameData.world.locations.find((l) => l.id === dockedAt);

    if (location?.services.includes('refuel') && ship.fuel < 100) {
      const fuelNeeded = 100 - ship.fuel;
      const cost = Math.round(fuelNeeded * 5);
      const refuelBtn = document.createElement('button');
      refuelBtn.textContent = `Buy Fuel (${Math.round(fuelNeeded)}% → ${cost} cr)`;
      refuelBtn.style.padding = '0.5rem 1rem';
      refuelBtn.disabled = gameData.credits < cost;
      refuelBtn.addEventListener('click', () => callbacks.onBuyFuel());
      actionsDiv.appendChild(refuelBtn);
    }
  }

  // Advance Day button (only when docked with no contract)
  const canAdvanceDay =
    ship.location.status === 'docked' && !ship.activeContract;

  if (canAdvanceDay) {
    const advanceDayBtn = document.createElement('button');
    advanceDayBtn.textContent = '⏭ Advance Day';
    advanceDayBtn.style.padding = '0.5rem 1rem';
    advanceDayBtn.addEventListener('click', () => callbacks.onAdvanceDay());
    actionsDiv.appendChild(advanceDayBtn);
  }

  statusBar.appendChild(actionsDiv);

  return statusBar;
}

function renderTabBar(
  activeTab: PlayingTab,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';

  const shipTab = document.createElement('button');
  shipTab.className = activeTab === 'ship' ? 'tab-button active' : 'tab-button';
  shipTab.textContent = 'Ship';
  shipTab.addEventListener('click', () => callbacks.onTabChange('ship'));
  tabBar.appendChild(shipTab);

  const crewTab = document.createElement('button');
  crewTab.className = activeTab === 'crew' ? 'tab-button active' : 'tab-button';
  crewTab.textContent = 'Crew';
  crewTab.addEventListener('click', () => callbacks.onTabChange('crew'));
  tabBar.appendChild(crewTab);

  const workTab = document.createElement('button');
  workTab.className = activeTab === 'work' ? 'tab-button active' : 'tab-button';
  workTab.textContent = 'Work';
  workTab.addEventListener('click', () => callbacks.onTabChange('work'));
  tabBar.appendChild(workTab);

  const logTab = document.createElement('button');
  logTab.className = activeTab === 'log' ? 'tab-button active' : 'tab-button';
  logTab.textContent = 'Log';
  logTab.addEventListener('click', () => callbacks.onTabChange('log'));
  tabBar.appendChild(logTab);

  const settingsTab = document.createElement('button');
  settingsTab.className =
    activeTab === 'settings' ? 'tab-button active' : 'tab-button';
  settingsTab.textContent = 'Settings';
  settingsTab.addEventListener('click', () =>
    callbacks.onTabChange('settings')
  );
  tabBar.appendChild(settingsTab);

  return tabBar;
}
