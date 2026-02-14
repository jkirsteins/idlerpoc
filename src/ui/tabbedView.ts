import type { GameData } from '../models';
import type { PlayingTab, TabbedViewCallbacks } from './types';
import type { Component } from './component';

export type { TabbedViewCallbacks } from './types';
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
): Component & {
  updateView(state: TabbedViewState): void;
  navigateGamepediaTo(articleId: string): void;
} {
  // Reset module-level state on (re-)mount to prevent stale data across game resets
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
  let previousTab: PlayingTab = activeTab !== 'guide' ? activeTab : 'ship';

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
        return createGamepediaTab(gameData, undefined, () => {
          callbacks.onTabChange(previousTab);
        });
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
      // Track previous tab before switching to guide
      if (state.activeTab === 'guide' && currentTab !== 'guide') {
        previousTab = currentTab;
      }
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
