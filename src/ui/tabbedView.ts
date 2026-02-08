import type { GameData, CrewEquipmentId } from '../models';
import { getActiveShip } from '../models';
import type { PlayingTab } from './renderer';
import { getShipClass } from '../shipClasses';
import { renderShipTab } from './shipTab';
import { renderCrewTab } from './crewTab';
import { renderWorkTab } from './workTab';
import { renderFleetTab } from './fleetTab';
import { renderLogTab } from './logTab';
import { renderSettingsTab } from './settingsTab';
import { renderFleetPanel } from './fleetPanel';
import { renderNavigationView } from './navigationView';
import {
  formatGameDate,
  TICKS_PER_DAY,
  GAME_SECONDS_PER_DAY,
} from '../timeSystem';
import { getCrewRoleDefinition } from '../crewRoles';
import {
  getShipPositionKm,
  calculatePositionDanger,
  getThreatLevel,
} from '../encounterSystem';

// Track credits for delta display
let previousCredits: number | null = null;
let creditDeltaTimeout: number | null = null;

// Track last viewed log entry count for unread badge
let lastViewedLogCount = 0;

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
  onAssignRoute: (questId: string) => void;
  onUnassignRoute: () => void;
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
  container.appendChild(renderTabBar(gameData, activeTab, callbacks));

  // Update last viewed log count when on log tab
  if (activeTab === 'log') {
    lastViewedLogCount = gameData.log.length;
  }

  // Tab content
  if (activeTab === 'ship') {
    container.appendChild(
      renderShipTab(gameData, showNavigation, {
        onCrewAssign: callbacks.onCrewAssign,
        onCrewUnassign: callbacks.onCrewUnassign,
        onUndock: callbacks.onUndock,
        onDock: callbacks.onDock,
        onEngineOn: callbacks.onEngineOn,
        onEngineOff: callbacks.onEngineOff,
        onToggleNavigation: callbacks.onToggleNavigation,
        onBuyFuel: callbacks.onBuyFuel,
        onStartTrip: callbacks.onStartTrip,
        onBuyShip: callbacks.onBuyShip,
      })
    );
  } else if (activeTab === 'crew') {
    container.appendChild(renderCrewTab(gameData, selectedCrewId, callbacks));
  } else if (activeTab === 'work') {
    container.appendChild(
      renderWorkTab(gameData, {
        onAcceptQuest: callbacks.onAcceptQuest,
        onAssignRoute: callbacks.onAssignRoute,
        onUnassignRoute: callbacks.onUnassignRoute,
        onDockAtNearestPort: callbacks.onDockAtNearestPort,
        onResumeContract: callbacks.onResumeContract,
        onAbandonContract: callbacks.onAbandonContract,
      })
    );
  } else if (activeTab === 'nav') {
    container.appendChild(
      renderNavigationView(gameData, {
        onToggleNavigation: () => {}, // Not needed for tab
        onStartTrip: callbacks.onStartTrip,
      })
    );
  } else if (activeTab === 'fleet') {
    container.appendChild(
      renderFleetTab(gameData, {
        onSelectShip: callbacks.onSelectShip,
        onBuyShip: callbacks.onBuyShip,
        onNavigateShip: (shipId: string) => {
          // Switch to the selected ship
          callbacks.onSelectShip(shipId);
          // Switch to the Nav tab
          callbacks.onTabChange('nav');
        },
      })
    );
  } else if (activeTab === 'log') {
    container.appendChild(renderLogTab(gameData));
  } else {
    container.appendChild(renderSettingsTab(gameData, callbacks));
  }

  return container;
}

function renderShipHeader(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const header = document.createElement('div');
  header.className = 'ship-header';

  // Date display with day progress bar
  const dateHeader = document.createElement('div');
  dateHeader.className = 'date-header-global';

  const dateText = document.createElement('span');
  dateText.textContent = formatGameDate(gameData.gameTime);
  dateHeader.appendChild(dateText);

  // Day progress bar
  const dayProgress =
    ((gameData.gameTime % GAME_SECONDS_PER_DAY) / GAME_SECONDS_PER_DAY) * 100;
  const dayProgressBar = document.createElement('div');
  dayProgressBar.className = 'day-progress-bar';
  dayProgressBar.style.width = '100%';
  dayProgressBar.style.height = '4px';
  dayProgressBar.style.background = 'rgba(255, 255, 255, 0.1)';
  dayProgressBar.style.borderRadius = '2px';
  dayProgressBar.style.marginTop = '4px';
  dayProgressBar.style.overflow = 'hidden';

  const dayProgressFill = document.createElement('div');
  dayProgressFill.className = 'day-progress-fill';
  dayProgressFill.style.height = '100%';
  dayProgressFill.style.width = `${dayProgress}%`;
  dayProgressFill.style.background = '#4a9eff';
  dayProgressFill.style.borderRadius = '2px';
  dayProgressBar.appendChild(dayProgressFill);

  dateHeader.appendChild(dayProgressBar);

  header.appendChild(dateHeader);

  const ship = getActiveShip(gameData);

  // Fleet status panel (only when fleet has multiple ships)
  if (gameData.ships.length > 1) {
    header.appendChild(
      renderFleetPanel(gameData, { onSelectShip: callbacks.onSelectShip })
    );
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

  // Credits with delta display
  const creditsContainer = document.createElement('div');
  creditsContainer.style.position = 'relative';
  creditsContainer.style.display = 'inline-block';

  const creditsDiv = document.createElement('div');
  creditsDiv.innerHTML = `<span style="color: #888;">Credits:</span> <span style="color: #4a9eff; font-weight: bold;">${Math.round(gameData.credits).toLocaleString()}</span>`;
  creditsContainer.appendChild(creditsDiv);

  // Show credit delta if credits changed
  const currentCredits = Math.round(gameData.credits);
  if (previousCredits !== null && previousCredits !== currentCredits) {
    const delta = currentCredits - previousCredits;
    const deltaEl = document.createElement('div');
    deltaEl.className = 'credit-delta';
    deltaEl.style.position = 'absolute';
    deltaEl.style.left = '100%';
    deltaEl.style.top = '0';
    deltaEl.style.marginLeft = '0.5rem';
    deltaEl.style.fontSize = '0.9rem';
    deltaEl.style.fontWeight = 'bold';
    deltaEl.style.whiteSpace = 'nowrap';
    deltaEl.style.animation = 'credit-delta-float 2s ease-out forwards';

    if (delta > 0) {
      deltaEl.textContent = `+${delta.toLocaleString()}`;
      deltaEl.style.color = '#4ade80';
    } else {
      deltaEl.textContent = delta.toLocaleString();
      deltaEl.style.color = '#ef4444';
    }

    creditsContainer.appendChild(deltaEl);

    // Clear old timeout and set new one
    if (creditDeltaTimeout !== null) {
      clearTimeout(creditDeltaTimeout);
    }
    creditDeltaTimeout = window.setTimeout(() => {
      creditDeltaTimeout = null;
    }, 2000);
  }
  previousCredits = currentCredits;

  statsDiv.appendChild(creditsContainer);

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
  } else if (ship.location.status === 'orbiting') {
    const orbitingAt = ship.location.orbitingAt;
    const location = gameData.world.locations.find((l) => l.id === orbitingAt);
    const locationName = location?.name || orbitingAt;
    statusText.textContent = `Orbiting ${locationName}`;
  } else {
    if (ship.activeFlightPlan) {
      const destId = ship.activeFlightPlan.destination;
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

      // Build status text with flight progress
      const textSpan = document.createElement('span');
      textSpan.textContent = `In flight to ${destName}`;
      statusText.appendChild(textSpan);

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

      // Add inline progress bar
      const progressPercent =
        (ship.activeFlightPlan.distanceCovered /
          ship.activeFlightPlan.totalDistance) *
        100;
      const progressContainer = document.createElement('span');
      progressContainer.className = 'header-flight-progress';
      progressContainer.style.marginLeft = '12px';
      progressContainer.style.display = 'inline-flex';
      progressContainer.style.alignItems = 'center';
      progressContainer.style.gap = '6px';

      const progressBar = document.createElement('span');
      progressBar.style.display = 'inline-block';
      progressBar.style.width = '80px';
      progressBar.style.height = '8px';
      progressBar.style.background = 'rgba(255, 255, 255, 0.1)';
      progressBar.style.borderRadius = '4px';
      progressBar.style.overflow = 'hidden';

      const progressFill = document.createElement('span');
      progressFill.style.display = 'block';
      progressFill.style.height = '100%';
      progressFill.style.width = `${progressPercent}%`;
      progressFill.style.background = '#4a9eff';
      progressFill.style.borderRadius = '4px';
      progressBar.appendChild(progressFill);

      const progressLabel = document.createElement('span');
      progressLabel.style.fontSize = '11px';
      progressLabel.style.color = '#aaa';
      progressLabel.textContent = `${progressPercent.toFixed(0)}%`;

      progressContainer.appendChild(progressBar);
      progressContainer.appendChild(progressLabel);
      statusText.appendChild(progressContainer);
    } else {
      statusText.textContent = 'In flight';
    }
  }
  actionsDiv.appendChild(statusText);

  // Undock button (only show when docked)
  if (ship.location.status === 'docked') {
    const undockBtn = document.createElement('button');
    undockBtn.style.padding = '0.5rem 1rem';
    undockBtn.textContent = 'Undock';
    undockBtn.addEventListener('click', () => callbacks.onUndock());
    actionsDiv.appendChild(undockBtn);
  }

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

  // Advance Day button (only when docked or orbiting with no contract)
  const canAdvanceDay =
    (ship.location.status === 'docked' ||
      ship.location.status === 'orbiting') &&
    !ship.activeContract;

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
  gameData: GameData,
  activeTab: PlayingTab,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';

  // Helper to create tab with optional badge
  function createTab(
    label: string,
    tab: PlayingTab,
    badgeCount?: number
  ): HTMLElement {
    const button = document.createElement('button');
    button.className = activeTab === tab ? 'tab-button active' : 'tab-button';
    button.style.position = 'relative';

    const textSpan = document.createElement('span');
    textSpan.textContent = label;
    button.appendChild(textSpan);

    if (badgeCount && badgeCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = badgeCount.toString();
      button.appendChild(badge);
    }

    button.addEventListener('click', () => callbacks.onTabChange(tab));
    return button;
  }

  // Ship tab
  tabBar.appendChild(createTab('Ship', 'ship'));

  // Crew tab with skill points badge
  const activeShip = getActiveShip(gameData);
  const unspentSkillPoints = activeShip.crew.reduce(
    (sum, c) => sum + c.unspentSkillPoints,
    0
  );
  tabBar.appendChild(createTab('Crew', 'crew', unspentSkillPoints));

  // Work tab
  tabBar.appendChild(createTab('Work', 'work'));

  // Nav tab
  tabBar.appendChild(createTab('Nav', 'nav'));

  // Fleet tab
  tabBar.appendChild(createTab('Fleet', 'fleet'));

  // Log tab with unread badge
  const unreadCount = Math.max(0, gameData.log.length - lastViewedLogCount);
  tabBar.appendChild(createTab('Log', 'log', unreadCount));

  // Settings tab
  tabBar.appendChild(createTab('Settings', 'settings'));

  return tabBar;
}
