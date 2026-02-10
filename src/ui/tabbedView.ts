import type { GameData } from '../models';
import { getActiveShip } from '../models';
import type { PlayingTab, TabbedViewCallbacks } from './types';
import type { Component } from './component';

export type { TabbedViewCallbacks } from './types';
import { getShipClass } from '../shipClasses';
import { createShipTab } from './shipTab';
import { createCrewTab } from './crewTab';
import { createWorkTab } from './workTab';
import { createFleetTab } from './fleetTab';
import { createLogTab } from './logTab';
import { createSettingsTab } from './settingsTab';
import { createGamepediaTab } from './gamepediaTab';
import { createStationTab } from './stationTab';
import { createFleetPanel } from './fleetPanel';
import { createNavigationView } from './navigationView';
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
import { formatFuelMass, calculateFuelPercentage } from './fuelFormatting';

// Track credits for delta display
let previousCredits: number | null = null;
let creditDeltaTimeout: number | null = null;

// Track last viewed log entry count for unread badge
let lastViewedLogCount = 0;

export interface TabbedViewState {
  gameData: GameData;
  activeTab: PlayingTab;
  showNavigation: boolean;
  selectedCrewId?: string;
}

export function createTabbedView(
  gameData: GameData,
  activeTab: PlayingTab,
  showNavigation: boolean,
  callbacks: TabbedViewCallbacks,
  selectedCrewId?: string
): Component & { updateView(state: TabbedViewState): void } {
  const container = document.createElement('div');
  container.className = 'tabbed-view';

  // Stable sub-areas so header/tabbar/content don't destroy each other
  const headerArea = document.createElement('div');
  const tabBarArea = document.createElement('div');
  const tabContentArea = document.createElement('div');
  container.append(headerArea, tabBarArea, tabContentArea);

  let currentTab = activeTab;
  let currentShowNav = showNavigation;
  let currentSelectedCrewId = selectedCrewId;

  // ── Keep-alive tab components ──────────────────────────────────────
  // Tab components are created lazily on first visit and kept alive
  // forever. Every tick, ALL alive tabs receive update() so they stay
  // current even when hidden. Switching tabs just toggles visibility.
  const tabComponents = new Map<PlayingTab, Component>();
  const tabWrappers = new Map<PlayingTab, HTMLElement>();

  // ── Stable tab bar (created once, updated in-place to preserve scroll) ──
  const tabBarEl = document.createElement('div');
  tabBarEl.className = 'tab-bar';

  const tabDefs: Array<{ label: string; tab: PlayingTab }> = [
    { label: 'Ship', tab: 'ship' },
    { label: 'Station', tab: 'station' },
    { label: 'Crew', tab: 'crew' },
    { label: 'Work', tab: 'work' },
    { label: 'Nav', tab: 'nav' },
    { label: 'Fleet', tab: 'fleet' },
    { label: 'Log', tab: 'log' },
    { label: 'Guide', tab: 'guide' },
    { label: 'Settings', tab: 'settings' },
  ];

  const tabButtonRefs: Array<{
    button: HTMLButtonElement;
    badge: HTMLSpanElement;
    tab: PlayingTab;
  }> = [];

  for (const def of tabDefs) {
    const button = document.createElement('button');
    button.className = 'tab-button';
    button.style.position = 'relative';

    const textSpan = document.createElement('span');
    textSpan.textContent = def.label;
    button.appendChild(textSpan);

    const badge = document.createElement('span');
    badge.className = 'tab-badge';
    badge.style.display = 'none';
    button.appendChild(badge);

    button.addEventListener('click', () => callbacks.onTabChange(def.tab));
    tabBarEl.appendChild(button);
    tabButtonRefs.push({ button, badge, tab: def.tab });
  }

  tabBarArea.appendChild(tabBarEl);

  function updateTabBar(gameData: GameData) {
    const unreadCount = Math.max(0, gameData.log.length - lastViewedLogCount);

    for (const ref of tabButtonRefs) {
      if (ref.tab === currentTab) {
        ref.button.classList.add('active');
      } else {
        ref.button.classList.remove('active');
      }

      let badgeCount = 0;
      if (ref.tab === 'log') badgeCount = unreadCount;

      if (badgeCount > 0) {
        ref.badge.textContent = badgeCount.toString();
        ref.badge.style.display = '';
      } else {
        ref.badge.textContent = '';
        ref.badge.style.display = 'none';
      }
    }
  }

  function makeTabComponent(tab: PlayingTab, gameData: GameData): Component {
    switch (tab) {
      case 'ship':
        return createShipTab(gameData, currentShowNav, {
          onJobAssign: callbacks.onJobAssign,
          onJobUnassign: callbacks.onJobUnassign,
          onAutoAssignCrew: callbacks.onAutoAssignCrew,
          onUndock: callbacks.onUndock,
          onDock: callbacks.onDock,
          onEngineOn: callbacks.onEngineOn,
          onEngineOff: callbacks.onEngineOff,
          onToggleNavigation: callbacks.onToggleNavigation,
          onBuyFuel: callbacks.onBuyFuel,
          onStartTrip: callbacks.onStartTrip,
          onBuyShip: callbacks.onBuyShip,
        });
      case 'station':
        return createStationTab(gameData, callbacks);
      case 'crew':
        return createCrewTab(gameData, currentSelectedCrewId, callbacks);
      case 'work':
        return createWorkTab(gameData, {
          onAcceptQuest: callbacks.onAcceptQuest,
          onAssignRoute: callbacks.onAssignRoute,
          onUnassignRoute: callbacks.onUnassignRoute,
          onDockAtNearestPort: callbacks.onDockAtNearestPort,
          onResumeContract: callbacks.onResumeContract,
          onAbandonContract: callbacks.onAbandonContract,
          onStartMiningRoute: callbacks.onStartMiningRoute,
          onCancelMiningRoute: callbacks.onCancelMiningRoute,
        });
      case 'nav':
        return createNavigationView(gameData, {
          onToggleNavigation: () => {},
          onStartTrip: callbacks.onStartTrip,
        });
      case 'fleet':
        return createFleetTab(gameData, {
          onSelectShip: callbacks.onSelectShip,
          onBuyShip: callbacks.onBuyShip,
          onNavigateShip: (shipId: string) => {
            callbacks.onSelectShip(shipId);
            callbacks.onTabChange('nav');
          },
        });
      case 'log':
        return createLogTab(gameData);
      case 'guide':
        return createGamepediaTab(gameData);
      case 'settings':
        return createSettingsTab(gameData, callbacks);
      default:
        return createSettingsTab(gameData, callbacks);
    }
  }

  /** Lazily create the component for `tab` and mount its wrapper div. */
  function ensureTab(tab: PlayingTab, gameData: GameData): void {
    if (tabComponents.has(tab)) return;
    const component = makeTabComponent(tab, gameData);
    const wrapper = document.createElement('div');
    wrapper.className = 'tab-content-wrapper';
    wrapper.style.display = 'none';
    wrapper.appendChild(component.el);
    tabContentArea.appendChild(wrapper);
    tabComponents.set(tab, component);
    tabWrappers.set(tab, wrapper);
  }

  function rebuild(gameData: GameData) {
    // Rebuild header and tab bar (always visible, cheap to recreate)
    headerArea.replaceChildren(renderShipHeader(gameData, callbacks));
    updateTabBar(gameData);

    if (currentTab === 'log') {
      lastViewedLogCount = gameData.log.length;
    }

    // Ensure the active tab exists (lazy creation on first visit)
    ensureTab(currentTab, gameData);

    // Show/hide: only the active tab wrapper is visible
    for (const [tab, wrapper] of tabWrappers) {
      wrapper.style.display = tab === currentTab ? '' : 'none';
    }

    // Pass extra per-tab state before updating
    const shipComp = tabComponents.get('ship') as
      | (Component & { setShowNavigation?: (v: boolean) => void })
      | undefined;
    if (shipComp?.setShowNavigation) {
      shipComp.setShowNavigation(currentShowNav);
    }

    const crewComp = tabComponents.get('crew') as
      | (Component & { setSelectedCrewId?: (id: string | undefined) => void })
      | undefined;
    if (crewComp?.setSelectedCrewId) {
      crewComp.setSelectedCrewId(currentSelectedCrewId);
    }

    // Update ALL alive tab components so every view stays live
    for (const [, component] of tabComponents) {
      component.update(gameData);
    }
  }

  rebuild(gameData);

  return {
    el: container,
    update(gameData: GameData) {
      rebuild(gameData);
    },
    updateView(state: TabbedViewState) {
      currentTab = state.activeTab;
      currentShowNav = state.showNavigation;
      currentSelectedCrewId = state.selectedCrewId;
      rebuild(state.gameData);
    },
  };
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
      createFleetPanel(gameData, { onSelectShip: callbacks.onSelectShip }).el
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

  const ship = getActiveShip(gameData);

  // Left side: Stats
  const statsDiv = document.createElement('div');
  statsDiv.className = 'global-status-stats';

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
  actionsDiv.className = 'global-status-actions';

  // Status text
  const statusText = document.createElement('span');
  statusText.className = 'global-status-text';
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
    undockBtn.className = 'global-status-btn';
    undockBtn.textContent = 'Undock';
    undockBtn.addEventListener('click', () => callbacks.onUndock());
    actionsDiv.appendChild(undockBtn);
  }

  // Buy Fuel button (when docked at refuel station with fuel < 100%)
  if (ship.location.status === 'docked') {
    const dockedAt = ship.location.dockedAt;
    const location = gameData.world.locations.find((l) => l.id === dockedAt);

    if (location?.services.includes('refuel') && ship.fuelKg < ship.maxFuelKg) {
      const fuelNeededKg = ship.maxFuelKg - ship.fuelKg;
      // TODO: This should use proper per-kg pricing from location (task #6)
      // For now, keeping legacy percentage-based pricing converted to kg
      const fuelPercentage = calculateFuelPercentage(
        ship.fuelKg,
        ship.maxFuelKg
      );
      const percentNeeded = 100 - fuelPercentage;
      const cost = Math.round(percentNeeded * 5);
      const refuelBtn = document.createElement('button');
      refuelBtn.textContent = `Buy Fuel (${formatFuelMass(fuelNeededKg)} → ${cost} cr)`;
      refuelBtn.className = 'global-status-btn';
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
    advanceDayBtn.textContent = '\u23ED Advance Day';
    advanceDayBtn.className = 'global-status-btn';
    advanceDayBtn.addEventListener('click', () => callbacks.onAdvanceDay());
    actionsDiv.appendChild(advanceDayBtn);
  }

  statusBar.appendChild(actionsDiv);

  return statusBar;
}
