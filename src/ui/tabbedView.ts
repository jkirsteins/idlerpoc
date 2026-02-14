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
import { formatGameDate, GAME_SECONDS_PER_DAY } from '../timeSystem';
import { formatCredits } from '../formatting';
import { calculateDailyLedger } from '../dailyLedger';
import {
  getShipPositionKm,
  calculatePositionDanger,
  getThreatLevel,
} from '../encounterSystem';
import { formatFuelMass, calculateFuelPercentage } from './fuelFormatting';
import { isHelmManned } from '../jobSlots';

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
  // Reset module-level state on (re-)mount to prevent stale data across game resets
  previousCredits = null;
  creditDeltaTimeout = null;
  lastViewedLogCount = 0;

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

  // ── Mount-once header elements ─────────────────────────────────────
  const headerEl = document.createElement('div');
  headerEl.className = 'ship-header';
  headerArea.appendChild(headerEl);

  // Date display with day progress bar
  const dateHeader = document.createElement('div');
  dateHeader.className = 'date-header-global';

  const dateText = document.createElement('span');
  dateHeader.appendChild(dateText);

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
  dayProgressFill.style.background = '#4a9eff';
  dayProgressFill.style.borderRadius = '2px';
  dayProgressBar.appendChild(dayProgressFill);

  dateHeader.appendChild(dayProgressBar);
  headerEl.appendChild(dateHeader);

  // Fleet panel slot (visible only when >1 ships)
  const fleetPanelSlot = document.createElement('div');
  headerEl.appendChild(fleetPanelSlot);
  let fleetPanelComponent: Component | null = null;

  // Ship name
  const shipNameEl = document.createElement('h2');
  shipNameEl.className = 'ship-name';
  headerEl.appendChild(shipNameEl);

  // Ship class label
  const shipClassEl = document.createElement('div');
  shipClassEl.className = 'ship-class-label';
  headerEl.appendChild(shipClassEl);

  // Captain label
  const captainEl = document.createElement('div');
  captainEl.className = 'captain-label';
  headerEl.appendChild(captainEl);

  // ── Mount-once global status bar ───────────────────────────────────
  const statusBar = document.createElement('div');
  statusBar.className = 'global-status-bar';
  headerEl.appendChild(statusBar);

  // Left side: Stats
  const statsDiv = document.createElement('div');
  statsDiv.className = 'global-status-stats';

  // Credits with delta display
  const creditsContainer = document.createElement('div');
  creditsContainer.style.position = 'relative';
  creditsContainer.style.display = 'inline-block';

  const creditsDiv = document.createElement('div');
  const creditsLabel = document.createElement('span');
  creditsLabel.style.color = '#888';
  creditsLabel.textContent = 'Credits:';
  const creditsValueSpan = document.createElement('span');
  creditsValueSpan.style.color = '#4a9eff';
  creditsValueSpan.style.fontWeight = 'bold';
  creditsDiv.appendChild(creditsLabel);
  creditsDiv.appendChild(document.createTextNode(' '));
  creditsDiv.appendChild(creditsValueSpan);
  creditsContainer.appendChild(creditsDiv);

  // Credit delta element (reused, shown/hidden via animation)
  const creditDeltaEl = document.createElement('div');
  creditDeltaEl.className = 'credit-delta';
  creditDeltaEl.style.position = 'absolute';
  creditDeltaEl.style.left = '100%';
  creditDeltaEl.style.top = '0';
  creditDeltaEl.style.marginLeft = '0.5rem';
  creditDeltaEl.style.fontSize = '0.9rem';
  creditDeltaEl.style.fontWeight = 'bold';
  creditDeltaEl.style.whiteSpace = 'nowrap';
  creditDeltaEl.style.display = 'none';
  creditsContainer.appendChild(creditDeltaEl);

  statsDiv.appendChild(creditsContainer);

  // Crew count
  const crewDiv = document.createElement('div');
  const crewLabel = document.createElement('span');
  crewLabel.style.color = '#888';
  crewLabel.textContent = 'Crew:';
  const crewValueSpan = document.createElement('span');
  crewValueSpan.style.fontWeight = 'bold';
  crewDiv.appendChild(crewLabel);
  crewDiv.appendChild(document.createTextNode(' '));
  crewDiv.appendChild(crewValueSpan);
  statsDiv.appendChild(crewDiv);

  // Net income per day
  const netDiv = document.createElement('div');
  const netLabel = document.createElement('span');
  netLabel.style.color = '#888';
  netLabel.textContent = 'Net:';
  const netValueSpan = document.createElement('span');
  netValueSpan.style.fontWeight = 'bold';
  netDiv.appendChild(netLabel);
  netDiv.appendChild(document.createTextNode(' '));
  netDiv.appendChild(netValueSpan);

  // Runway indicator (inline, after net)
  const runwaySpan = document.createElement('span');
  runwaySpan.style.color = '#888';
  runwaySpan.style.marginLeft = '8px';
  runwaySpan.style.fontSize = '0.85em';
  netDiv.appendChild(runwaySpan);

  statsDiv.appendChild(netDiv);

  // Ledger breakdown (collapsible — surfaces right sidebar info for tablet/mobile)
  const ledgerToggle = document.createElement('button');
  ledgerToggle.className = 'ledger-toggle small-button';
  ledgerToggle.textContent = '\u25B6';
  ledgerToggle.title = 'Show daily ledger breakdown';
  ledgerToggle.style.padding = '2px 6px';
  ledgerToggle.style.fontSize = '10px';
  ledgerToggle.style.verticalAlign = 'middle';
  ledgerToggle.style.marginLeft = '6px';
  netDiv.appendChild(ledgerToggle);

  const ledgerBreakdown = document.createElement('div');
  ledgerBreakdown.className = 'ledger-breakdown';
  ledgerBreakdown.style.display = 'none';

  const ledgerIncomeSpan = document.createElement('span');
  ledgerIncomeSpan.className = 'ledger-item';
  const ledgerCrewSpan = document.createElement('span');
  ledgerCrewSpan.className = 'ledger-item';
  const ledgerFuelSpan = document.createElement('span');
  ledgerFuelSpan.className = 'ledger-item';

  ledgerBreakdown.appendChild(ledgerIncomeSpan);
  ledgerBreakdown.appendChild(ledgerCrewSpan);
  ledgerBreakdown.appendChild(ledgerFuelSpan);

  let ledgerOpen = false;
  ledgerToggle.addEventListener('click', () => {
    ledgerOpen = !ledgerOpen;
    ledgerBreakdown.style.display = ledgerOpen ? '' : 'none';
    ledgerToggle.textContent = ledgerOpen ? '\u25BC' : '\u25B6';
    ledgerToggle.title = ledgerOpen
      ? 'Hide daily ledger breakdown'
      : 'Show daily ledger breakdown';
  });

  statusBar.appendChild(statsDiv);
  statusBar.appendChild(ledgerBreakdown);

  // Right side: Action buttons
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'global-status-actions';

  // Status text (complex: can contain text + threat badge + progress bar)
  const statusTextEl = document.createElement('span');
  statusTextEl.className = 'global-status-text';

  // Sub-elements for status text
  const statusPlainText = document.createTextNode('');
  statusTextEl.appendChild(statusPlainText);

  // In-flight container (threat badge + progress bar)
  const flightInfoContainer = document.createElement('span');
  flightInfoContainer.style.display = 'none';

  const flightDestText = document.createElement('span');
  flightInfoContainer.appendChild(flightDestText);

  const threatLabel = document.createElement('span');
  threatLabel.style.marginLeft = '8px';
  threatLabel.style.fontWeight = '700';
  threatLabel.style.fontSize = '11px';
  threatLabel.style.padding = '2px 6px';
  threatLabel.style.borderRadius = '3px';
  flightInfoContainer.appendChild(threatLabel);

  // Inline flight progress bar
  const flightProgressContainer = document.createElement('span');
  flightProgressContainer.className = 'header-flight-progress';
  flightProgressContainer.style.marginLeft = '12px';
  flightProgressContainer.style.display = 'inline-flex';
  flightProgressContainer.style.alignItems = 'center';
  flightProgressContainer.style.gap = '6px';

  const flightProgressBar = document.createElement('span');
  flightProgressBar.style.display = 'inline-block';
  flightProgressBar.style.width = '80px';
  flightProgressBar.style.height = '8px';
  flightProgressBar.style.background = 'rgba(255, 255, 255, 0.1)';
  flightProgressBar.style.borderRadius = '4px';
  flightProgressBar.style.overflow = 'hidden';

  const flightProgressFill = document.createElement('span');
  flightProgressFill.style.display = 'block';
  flightProgressFill.style.height = '100%';
  flightProgressFill.style.background = '#4a9eff';
  flightProgressFill.style.borderRadius = '4px';
  flightProgressBar.appendChild(flightProgressFill);

  const flightProgressLabel = document.createElement('span');
  flightProgressLabel.style.fontSize = '11px';
  flightProgressLabel.style.color = '#aaa';

  flightProgressContainer.appendChild(flightProgressBar);
  flightProgressContainer.appendChild(flightProgressLabel);
  flightInfoContainer.appendChild(flightProgressContainer);

  statusTextEl.appendChild(flightInfoContainer);

  actionsDiv.appendChild(statusTextEl);

  // Undock button (created once, toggled display)
  const undockBtn = document.createElement('button');
  undockBtn.className = 'global-status-btn';
  undockBtn.textContent = 'Undock';
  undockBtn.style.display = 'none';
  undockBtn.addEventListener('click', () => callbacks.onUndock());
  actionsDiv.appendChild(undockBtn);

  // Buy Fuel button (created once, toggled display)
  const refuelBtn = document.createElement('button');
  refuelBtn.className = 'global-status-btn';
  refuelBtn.style.display = 'none';
  refuelBtn.addEventListener('click', () => callbacks.onBuyFuel());
  actionsDiv.appendChild(refuelBtn);

  // Advance Day button (created once, toggled display)
  const advanceDayBtn = document.createElement('button');
  advanceDayBtn.textContent = '\u23ED Advance Day';
  advanceDayBtn.className = 'global-status-btn';
  advanceDayBtn.style.display = 'none';
  advanceDayBtn.addEventListener('click', () => callbacks.onAdvanceDay());
  actionsDiv.appendChild(advanceDayBtn);

  statusBar.appendChild(actionsDiv);

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
          onDockAtNearestPort: callbacks.onDockAtNearestPort,
          onCancelPause: callbacks.onCancelPause,
          onRequestAbandon: callbacks.onRequestAbandon,
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
          onCancelPause: callbacks.onCancelPause,
          onRequestAbandon: callbacks.onRequestAbandon,
          onResumeContract: callbacks.onResumeContract,
          onAbandonContract: callbacks.onAbandonContract,
          onFlightProfileChange: callbacks.onFlightProfileChange,
          onStartMiningRoute: callbacks.onStartMiningRoute,
          onCancelMiningRoute: callbacks.onCancelMiningRoute,
          onSelectMiningOre: callbacks.onSelectMiningOre,
        });
      case 'nav':
        return createNavigationView(gameData, {
          onToggleNavigation: () => callbacks.onTabChange('ship'),
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

  // ── Header update (patches in-place) ───────────────────────────────
  function updateHeader(gameData: GameData) {
    const ship = getActiveShip(gameData);

    // Date display
    const dateStr = formatGameDate(gameData.gameTime);
    if (dateText.textContent !== dateStr) {
      dateText.textContent = dateStr;
    }

    // Day progress bar
    const dayProgress =
      ((gameData.gameTime % GAME_SECONDS_PER_DAY) / GAME_SECONDS_PER_DAY) * 100;
    dayProgressFill.style.width = `${dayProgress}%`;

    // Fleet panel (always visible per UI discoverability rule)
    if (!fleetPanelComponent) {
      fleetPanelComponent = createFleetPanel(gameData, {
        onSelectShip: callbacks.onSelectShip,
      });
      fleetPanelSlot.appendChild(fleetPanelComponent.el);
    } else {
      fleetPanelComponent.update(gameData);
    }

    // Ship name
    if (shipNameEl.textContent !== ship.name) {
      shipNameEl.textContent = ship.name;
    }

    // Ship class
    const shipClass = getShipClass(ship.classId);
    const classText = `Class: ${shipClass?.name ?? ship.classId}`;
    if (shipClassEl.textContent !== classText) {
      shipClassEl.textContent = classText;
    }

    // Captain
    const captain = ship.crew.find((c) => c.isCaptain);
    if (captain) {
      const captainText = `Captain ${captain.name}`;
      if (captainEl.textContent !== captainText) {
        captainEl.textContent = captainText;
      }
      captainEl.style.opacity = '';
    } else {
      const noCaptainText = 'No Captain';
      if (captainEl.textContent !== noCaptainText) {
        captainEl.textContent = noCaptainText;
      }
      captainEl.style.opacity = '0.4';
    }

    // ── Global status bar update ───────────────────────────────────
    // Credits
    const currentCredits = Math.round(gameData.credits);
    creditsValueSpan.textContent = currentCredits.toLocaleString();

    // Credit delta animation
    if (previousCredits !== null && previousCredits !== currentCredits) {
      const delta = currentCredits - previousCredits;

      if (delta > 0) {
        creditDeltaEl.textContent = `+${delta.toLocaleString()}`;
        creditDeltaEl.style.color = '#4ade80';
      } else {
        creditDeltaEl.textContent = delta.toLocaleString();
        creditDeltaEl.style.color = '#ef4444';
      }

      // Reset animation by removing and re-adding
      creditDeltaEl.style.display = '';
      creditDeltaEl.style.animation = 'none';
      // Force reflow to restart animation
      void creditDeltaEl.offsetHeight;
      creditDeltaEl.style.animation = 'credit-delta-float 2s ease-out forwards';

      // Clear old timeout and set new one
      if (creditDeltaTimeout !== null) {
        clearTimeout(creditDeltaTimeout);
      }
      creditDeltaTimeout = window.setTimeout(() => {
        creditDeltaEl.style.display = 'none';
        creditDeltaTimeout = null;
      }, 2000);
    }
    previousCredits = currentCredits;

    // Crew count
    const maxCrew = shipClass?.maxCrew ?? '?';
    const crewText = `${ship.crew.length}/${maxCrew}`;
    if (crewValueSpan.textContent !== crewText) {
      crewValueSpan.textContent = crewText;
    }

    // Daily ledger: net income & runway
    const ledger = calculateDailyLedger(gameData);
    const netRounded = Math.round(ledger.netPerDay);
    const netSign = netRounded >= 0 ? '+' : '';
    const netText = `${netSign}${formatCredits(netRounded)}/day`;
    if (netValueSpan.textContent !== netText) {
      netValueSpan.textContent = netText;
      netValueSpan.style.color = netRounded >= 0 ? '#4ade80' : '#ff4444';
    }

    let runwayText = '';
    if (ledger.incomeDays === 0) {
      runwayText = '(collecting data\u2026)';
    } else if (ledger.runwayDays !== null) {
      runwayText = `Runway: ${ledger.runwayDays.toFixed(1)}d`;
    }
    if (runwaySpan.textContent !== runwayText) {
      runwaySpan.textContent = runwayText;
      runwaySpan.style.color =
        ledger.runwayDays !== null && ledger.runwayDays < 3
          ? '#ff4444'
          : '#888';
    }
    netDiv.style.opacity =
      ledger.totalExpensePerDay > 0 || ledger.incomePerDay > 0 ? '' : '0.4';

    // Ledger breakdown items (updated even when collapsed, cheap text updates)
    const incText = `Income: ${formatCredits(Math.round(ledger.incomePerDay))}/day`;
    if (ledgerIncomeSpan.textContent !== incText) {
      ledgerIncomeSpan.textContent = incText;
      ledgerIncomeSpan.style.color = '#4ade80';
    }
    const crewCostText = `Crew: -${formatCredits(Math.round(ledger.crewCostPerDay))}/day`;
    if (ledgerCrewSpan.textContent !== crewCostText) {
      ledgerCrewSpan.textContent = crewCostText;
      ledgerCrewSpan.style.color =
        ledger.crewCostPerDay > 0 ? '#ffa500' : '#888';
    }
    const fuelCostText = `Fuel: -${formatCredits(Math.round(ledger.fuelCostPerDay))}/day`;
    if (ledgerFuelSpan.textContent !== fuelCostText) {
      ledgerFuelSpan.textContent = fuelCostText;
      ledgerFuelSpan.style.color =
        ledger.fuelCostPerDay > 0 ? '#ffa500' : '#888';
    }

    // ── Status text ──────────────────────────────────────────────────
    if (ship.location.status === 'docked') {
      const dockedAt = ship.location.dockedAt;
      const location = gameData.world.locations.find((l) => l.id === dockedAt);
      const locationName = location?.name || dockedAt;
      const text = `Docked at ${locationName}`;
      if (statusPlainText.textContent !== text) {
        statusPlainText.textContent = text;
      }
      flightInfoContainer.style.display = 'none';
    } else if (ship.location.status === 'orbiting') {
      const orbitingAt = ship.location.orbitingAt;
      const location = gameData.world.locations.find(
        (l) => l.id === orbitingAt
      );
      const locationName = location?.name || orbitingAt;
      const text = `Orbiting ${locationName}`;
      if (statusPlainText.textContent !== text) {
        statusPlainText.textContent = text;
      }
      flightInfoContainer.style.display = 'none';
    } else {
      // In flight
      statusPlainText.textContent = '';
      if (ship.activeFlightPlan) {
        flightInfoContainer.style.display = '';

        const destId = ship.activeFlightPlan.destination;
        const destLocation = gameData.world.locations.find(
          (l) => l.id === destId
        );
        const destName = destLocation?.name || destId;
        const destText = `In flight to ${destName}`;
        if (flightDestText.textContent !== destText) {
          flightDestText.textContent = destText;
        }

        // Compute regional threat for in-flight status
        const currentKm = getShipPositionKm(ship, gameData.world);
        const positionDanger = calculatePositionDanger(
          currentKm,
          gameData.world
        );
        const dangerRisk =
          positionDanger > 3
            ? 0.35
            : positionDanger > 1.5
              ? 0.2
              : positionDanger > 0.5
                ? 0.08
                : 0.02;
        const threatLevelValue = getThreatLevel(dangerRisk);

        if (threatLevelValue !== 'clear') {
          threatLabel.style.display = '';
          const colors: Record<string, string> = {
            caution: '#ffc107',
            danger: '#e94560',
            critical: '#ff6b6b',
          };
          threatLabel.style.color = colors[threatLevelValue] || '#aaa';
          threatLabel.style.background = `${colors[threatLevelValue]}22`;
          const threatText = threatLevelValue.toUpperCase();
          if (threatLabel.textContent !== threatText) {
            threatLabel.textContent = threatText;
          }
        } else {
          threatLabel.style.display = 'none';
        }

        // Flight progress
        const progressPercent =
          (ship.activeFlightPlan.distanceCovered /
            ship.activeFlightPlan.totalDistance) *
          100;
        flightProgressFill.style.width = `${progressPercent}%`;
        flightProgressLabel.textContent = `${progressPercent.toFixed(0)}%`;
      } else {
        // In flight but no active flight plan
        flightInfoContainer.style.display = 'none';
        statusPlainText.textContent = 'In flight';
      }
    }

    // ── Action buttons (show/hide) ───────────────────────────────────
    // Undock button (only when docked, disabled when helm unmanned)
    const isDocked = ship.location.status === 'docked';
    undockBtn.style.display = isDocked ? '' : 'none';
    if (isDocked) {
      const helmOk = isHelmManned(ship);
      undockBtn.disabled = !helmOk;
      undockBtn.title = helmOk
        ? ''
        : 'Helm is unmanned — assign crew to the helm before undocking';
    }

    // Buy Fuel button (when docked at refuel station with fuel < 100%)
    let showRefuel = false;
    if (ship.location.status === 'docked') {
      const dockedAt = ship.location.dockedAt;
      const location = gameData.world.locations.find((l) => l.id === dockedAt);
      if (
        location?.services.includes('refuel') &&
        ship.fuelKg < ship.maxFuelKg
      ) {
        showRefuel = true;
        const fuelNeededKg = ship.maxFuelKg - ship.fuelKg;
        const fuelPercentage = calculateFuelPercentage(
          ship.fuelKg,
          ship.maxFuelKg
        );
        const percentNeeded = 100 - fuelPercentage;
        const cost = Math.round(percentNeeded * 5);
        refuelBtn.textContent = `Buy Fuel (${formatFuelMass(fuelNeededKg)} → ${cost} cr)`;
        refuelBtn.disabled = gameData.credits < cost;
      }
    }
    refuelBtn.style.display = showRefuel ? '' : 'none';

    // Advance Day button (only when docked or orbiting with no contract)
    const canAdvanceDay =
      (ship.location.status === 'docked' ||
        ship.location.status === 'orbiting') &&
      !ship.activeContract;
    advanceDayBtn.style.display = canAdvanceDay ? '' : 'none';
  }

  // ── Main update function ───────────────────────────────────────────
  function update(gameData: GameData) {
    updateHeader(gameData);
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

  // Initial render
  update(gameData);

  return {
    el: container,
    update(gameData: GameData) {
      update(gameData);
    },
    updateView(state: TabbedViewState) {
      currentTab = state.activeTab;
      currentShowNav = state.showNavigation;
      currentSelectedCrewId = state.selectedCrewId;
      update(state.gameData);
    },
    navigateGamepediaTo(articleId: string) {
      const component = tabComponents.get('guide') as
        | (Component & { navigateTo?: (id: string) => void })
        | undefined;
      if (component?.navigateTo) {
        component.navigateTo(articleId);
      }
    },
  };
}
