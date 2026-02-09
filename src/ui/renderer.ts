import type {
  GameData,
  ShipClassId,
  CrewEquipmentId,
  CatchUpReport,
  Toast,
} from '../models';
import { getActiveShip } from '../models';
import {
  renderWizard,
  type WizardStep,
  type WizardDraft,
  type WizardCallbacks,
} from './wizard';
import type { Component } from './component';
import { createTabbedView, type TabbedViewState } from './tabbedView';
import { renderCatchUpReport } from './catchUpReport';
import { renderToasts } from './toastSystem';
import { createLeftSidebar, createRightSidebar } from './sidebars';
import { calculateFuelPercentage, getFuelColorHex } from './fuelFormatting';

export type PlayingTab =
  | 'ship'
  | 'crew'
  | 'work'
  | 'nav'
  | 'fleet'
  | 'log'
  | 'settings';

// Persists across re-renders
let mobileDrawerOpen = false;

export type GameState =
  | { phase: 'no_game' }
  | { phase: 'creating'; step: WizardStep; draft: WizardDraft }
  | {
      phase: 'playing';
      gameData: GameData;
      activeTab: PlayingTab;
      showNavigation?: boolean;
      selectedCrewId?: string;
      catchUpReport?: CatchUpReport;
      catchUpProgress?: { processed: number; total: number };
      toasts?: Toast[];
    };

export interface RendererCallbacks {
  onStartCreate: () => void;
  onWizardComplete: (
    captainName: string,
    shipName: string,
    shipClassId: ShipClassId
  ) => void;
  onWizardCancel: () => void;
  onReset: () => void;
  onTabChange: (tab: PlayingTab) => void;
  onJobAssign: (crewId: string, jobSlotId: string) => void;
  onJobUnassign: (crewId: string) => void;
  onAutoAssignCrew: () => void;
  onUndock: () => void;
  onDock: () => void;
  onEngineOn: () => void;
  onEngineOff: () => void;
  onToggleNavigation: () => void;
  onSelectCrew: (crewId: string) => void;
  onLevelUp: (crewId: string) => void;
  onEquipItem: (crewId: string, itemId: string) => void;
  onUnequipItem: (crewId: string, itemId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onAssignRoute: (questId: string) => void;
  onUnassignRoute: () => void;
  onAdvanceDay: () => void;
  onTogglePause?: () => void;
  onSetSpeed?: (speed: 1 | 2 | 5) => void;
  onAutoPauseSettingChange?: (
    setting: keyof GameData['autoPauseSettings'],
    value: boolean
  ) => void;
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
  onSpecializeCrew?: (
    crewId: string,
    skillId: import('../models').SkillId
  ) => void;
  onDismissCatchUp: () => void;
}

// ── Mounted playing layout ─────────────────────────────────────────
// Stable DOM + child component references kept between ticks so
// update() can patch in-place instead of wiping the page.

interface MountedPlayingLayout {
  container: HTMLElement;
  wrapper: HTMLElement;
  mobileHeaderBar: HTMLElement;
  drawerOverlay: HTMLElement;
  mobileDrawer: HTMLElement;
  drawerSidebar: Component;
  contentGrid: HTMLElement;
  leftSidebar: Component;
  mainContent: HTMLElement;
  tabbedView: ReturnType<typeof createTabbedView>;
  toastArea: HTMLElement;
  rightSidebar: Component;
  hasCatchUpReport: boolean;
}

let mounted: MountedPlayingLayout | null = null;

// ── Public entry point ─────────────────────────────────────────────

export function render(
  container: HTMLElement,
  state: GameState,
  callbacks: RendererCallbacks
): void {
  // Fast path: in-place update during normal playing (no catch-up modal)
  const canUpdate =
    state.phase === 'playing' &&
    !state.catchUpReport &&
    !state.catchUpProgress &&
    mounted !== null &&
    mounted.container === container &&
    !mounted.hasCatchUpReport &&
    container.contains(mounted.wrapper);

  if (canUpdate) {
    updatePlayingLayout(mounted!, state, callbacks);
    return;
  }

  // Slow path: full rebuild (phase change, first mount, catch-up modal)
  container.innerHTML = '';
  mounted = null;

  const wrapper = document.createElement('div');
  wrapper.className = 'game-container';

  // Main title header
  const titleHeader = document.createElement('div');
  titleHeader.className = 'game-header';
  const title = document.createElement('h1');
  title.textContent = 'Starship Commander';
  titleHeader.appendChild(title);
  wrapper.appendChild(titleHeader);

  switch (state.phase) {
    case 'no_game': {
      const noGameContent = document.createElement('div');
      noGameContent.className = 'main-content';
      noGameContent.style.gridColumn = '1 / -1';
      noGameContent.appendChild(renderNoGame(callbacks));
      wrapper.appendChild(noGameContent);
      break;
    }
    case 'creating': {
      const creatingContent = document.createElement('div');
      creatingContent.className = 'main-content';
      creatingContent.style.gridColumn = '1 / -1';
      creatingContent.appendChild(
        renderCreating(state.step, state.draft, callbacks)
      );
      wrapper.appendChild(creatingContent);
      break;
    }
    case 'playing': {
      if (state.catchUpReport) {
        const modalContent = document.createElement('div');
        modalContent.appendChild(
          renderCatchUpReport(state.catchUpReport, callbacks.onDismissCatchUp)
        );
        wrapper.appendChild(modalContent);
        // Track so next render after dismiss does a full rebuild
        mounted = makePlaceholderMounted(container, wrapper);
      } else if (state.catchUpProgress) {
        const progressContent = document.createElement('div');
        progressContent.appendChild(
          renderCatchUpProgressModal(state.catchUpProgress)
        );
        wrapper.appendChild(progressContent);
        mounted = makePlaceholderMounted(container, wrapper);
      } else {
        mounted = mountPlayingLayout(container, wrapper, state, callbacks);
      }
      break;
    }
  }

  container.appendChild(wrapper);

  // Version badge
  const versionBadge = document.createElement('div');
  versionBadge.className = 'version-badge';
  versionBadge.textContent = `v${__GIT_COMMIT_SHA__.substring(0, 7)}`;
  versionBadge.title = `Git commit: ${__GIT_COMMIT_SHA__}`;
  container.appendChild(versionBadge);
}

// ── Mount: build stable DOM for the playing phase ──────────────────

function mountPlayingLayout(
  container: HTMLElement,
  wrapper: HTMLElement,
  state: GameState & { phase: 'playing' },
  callbacks: RendererCallbacks
): MountedPlayingLayout {
  const sidebarCallbacks = {
    onBuyFuel: callbacks.onBuyFuel,
    onToggleNavigation: callbacks.onToggleNavigation,
    onUndock: callbacks.onUndock,
    onDock: callbacks.onDockAtNearestPort,
    onAdvanceDay: callbacks.onAdvanceDay,
    onTogglePause: callbacks.onTogglePause,
    onSetSpeed: callbacks.onSetSpeed,
    onTabChange: callbacks.onTabChange,
  };

  // Mobile header bar
  const mobileHeaderBar = buildMobileHeaderBar(state.gameData, callbacks);
  wrapper.appendChild(mobileHeaderBar);

  // Mobile drawer overlay
  const drawerOverlay = document.createElement('div');
  drawerOverlay.className =
    'mobile-drawer-overlay' + (mobileDrawerOpen ? ' open' : '');
  drawerOverlay.addEventListener('click', () => {
    mobileDrawerOpen = false;
    drawerOverlay.classList.remove('open');
    const drawer = drawerOverlay.parentElement?.querySelector('.mobile-drawer');
    if (drawer) drawer.classList.remove('open');
  });
  wrapper.appendChild(drawerOverlay);

  // Mobile drawer with its own sidebar component
  const mobileDrawer = document.createElement('div');
  mobileDrawer.className = 'mobile-drawer' + (mobileDrawerOpen ? ' open' : '');

  const drawerClose = document.createElement('button');
  drawerClose.className = 'mobile-drawer-close';
  drawerClose.textContent = '\u2715';
  drawerClose.addEventListener('click', () => {
    mobileDrawerOpen = false;
    mobileDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  });
  mobileDrawer.appendChild(drawerClose);

  const drawerSidebar = createLeftSidebar(state.gameData, {
    ...sidebarCallbacks,
    onToggleNavigation: () => {
      mobileDrawerOpen = false;
      callbacks.onToggleNavigation();
    },
    onUndock: () => {
      mobileDrawerOpen = false;
      callbacks.onUndock();
    },
    onDock: () => {
      mobileDrawerOpen = false;
      callbacks.onDockAtNearestPort();
    },
    onTabChange: (tab: PlayingTab) => {
      mobileDrawerOpen = false;
      callbacks.onTabChange(tab);
    },
  });
  mobileDrawer.appendChild(drawerSidebar.el);
  wrapper.appendChild(mobileDrawer);

  // Content grid (3-column: left sidebar | main | right sidebar)
  const contentGrid = document.createElement('div');
  contentGrid.className = 'game-content-grid';

  const leftSidebar = createLeftSidebar(state.gameData, sidebarCallbacks);
  contentGrid.appendChild(leftSidebar.el);

  // Main content area
  const mainContent = document.createElement('div');
  mainContent.className = 'main-content';
  mainContent.style.position = 'relative';

  const tabbedView = createTabbedView(
    state.gameData,
    state.activeTab,
    state.showNavigation || false,
    {
      onReset: callbacks.onReset,
      onTabChange: callbacks.onTabChange,
      onJobAssign: callbacks.onJobAssign,
      onJobUnassign: callbacks.onJobUnassign,
      onAutoAssignCrew: callbacks.onAutoAssignCrew,
      onUndock: callbacks.onUndock,
      onDock: callbacks.onDock,
      onEngineOn: callbacks.onEngineOn,
      onEngineOff: callbacks.onEngineOff,
      onToggleNavigation: callbacks.onToggleNavigation,
      onSelectCrew: callbacks.onSelectCrew,
      onLevelUp: callbacks.onLevelUp,
      onEquipItem: callbacks.onEquipItem,
      onUnequipItem: callbacks.onUnequipItem,
      onAcceptQuest: callbacks.onAcceptQuest,
      onAssignRoute: callbacks.onAssignRoute,
      onUnassignRoute: callbacks.onUnassignRoute,
      onAdvanceDay: callbacks.onAdvanceDay,
      onDockAtNearestPort: callbacks.onDockAtNearestPort,
      onResumeContract: callbacks.onResumeContract,
      onAbandonContract: callbacks.onAbandonContract,
      onBuyFuel: callbacks.onBuyFuel,
      onStartTrip: callbacks.onStartTrip,
      onHireCrew: callbacks.onHireCrew,
      onBuyEquipment: callbacks.onBuyEquipment,
      onSellEquipment: callbacks.onSellEquipment,
      onSelectShip: callbacks.onSelectShip,
      onBuyShip: callbacks.onBuyShip,
      onTransferCrew: callbacks.onTransferCrew,
    },
    state.selectedCrewId
  );
  mainContent.appendChild(tabbedView.el);

  // Toast area (stable container, content replaced each tick)
  const toastArea = document.createElement('div');
  if (state.toasts && state.toasts.length > 0) {
    toastArea.appendChild(renderToasts(state.toasts));
  }
  mainContent.appendChild(toastArea);

  contentGrid.appendChild(mainContent);

  const rightSidebar = createRightSidebar(state.gameData);
  contentGrid.appendChild(rightSidebar.el);

  wrapper.appendChild(contentGrid);

  return {
    container,
    wrapper,
    mobileHeaderBar,
    drawerOverlay,
    mobileDrawer,
    drawerSidebar,
    contentGrid,
    leftSidebar,
    mainContent,
    tabbedView,
    toastArea,
    rightSidebar,
    hasCatchUpReport: false,
  };
}

// ── Update: patch existing DOM in-place ────────────────────────────

function updatePlayingLayout(
  layout: MountedPlayingLayout,
  state: GameState & { phase: 'playing' },
  callbacks: RendererCallbacks
): void {
  // Mobile header bar: cheap, just rebuild content
  layout.mobileHeaderBar.replaceChildren(
    ...buildMobileHeaderBarChildren(state.gameData, callbacks)
  );

  // Drawer sidebar
  layout.drawerSidebar.update(state.gameData);

  // Desktop left sidebar
  layout.leftSidebar.update(state.gameData);

  // Tabbed view (passes tab/nav/crew state so it can switch tabs)
  layout.tabbedView.updateView({
    gameData: state.gameData,
    activeTab: state.activeTab,
    showNavigation: state.showNavigation || false,
    selectedCrewId: state.selectedCrewId,
  });

  // Toasts
  layout.toastArea.replaceChildren();
  if (state.toasts && state.toasts.length > 0) {
    layout.toastArea.appendChild(renderToasts(state.toasts));
  }

  // Right sidebar
  layout.rightSidebar.update(state.gameData);
}

// ── Helpers ────────────────────────────────────────────────────────

function makePlaceholderMounted(
  container: HTMLElement,
  wrapper: HTMLElement
): MountedPlayingLayout {
  // Dummy layout so we can track hasCatchUpReport = true. The next
  // render after dismiss won't match canUpdate and will do a full rebuild.
  const dummy = document.createElement('div');
  const dummyComp: Component = { el: dummy, update() {} };
  const dummyTabbed = Object.assign(dummyComp, {
    updateView(_s: TabbedViewState) {},
  });
  return {
    container,
    wrapper,
    mobileHeaderBar: dummy,
    drawerOverlay: dummy,
    mobileDrawer: dummy,
    drawerSidebar: dummyComp,
    contentGrid: dummy,
    leftSidebar: dummyComp,
    mainContent: dummy,
    tabbedView: dummyTabbed,
    toastArea: dummy,
    rightSidebar: dummyComp,
    hasCatchUpReport: true,
  };
}

function buildMobileHeaderBar(
  gameData: GameData,
  callbacks: RendererCallbacks
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'mobile-header-bar';
  bar.append(...buildMobileHeaderBarChildren(gameData, callbacks));
  return bar;
}

function buildMobileHeaderBarChildren(
  gameData: GameData,
  callbacks: RendererCallbacks
): HTMLElement[] {
  const ship = getActiveShip(gameData);

  const hamburger = document.createElement('button');
  hamburger.className = 'mobile-hamburger';
  hamburger.innerHTML = '\u2630';
  hamburger.addEventListener('click', () => {
    mobileDrawerOpen = !mobileDrawerOpen;
    const drawer = hamburger
      .closest('.game-container')
      ?.querySelector('.mobile-drawer');
    const overlay = hamburger
      .closest('.game-container')
      ?.querySelector('.mobile-drawer-overlay');
    if (drawer) drawer.classList.toggle('open', mobileDrawerOpen);
    if (overlay) overlay.classList.toggle('open', mobileDrawerOpen);
  });

  const credits = document.createElement('div');
  credits.className = 'mobile-header-stat';
  credits.innerHTML = `<span class="mobile-header-label">CR</span> <span class="mobile-header-value">${Math.round(gameData.credits).toLocaleString()}</span>`;

  const fuel = document.createElement('div');
  fuel.className = 'mobile-header-stat';
  const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  const fuelColor = getFuelColorHex(fuelPercentage);
  fuel.innerHTML = `<span class="mobile-header-label">FUEL</span> <span class="mobile-header-value" style="color:${fuelColor}">${Math.round(ship.fuelKg).toLocaleString()} kg</span>`;

  const playPause = document.createElement('button');
  playPause.className = 'mobile-header-playpause';
  playPause.textContent = gameData.isPaused ? '\u25B6' : '\u23F8';
  playPause.addEventListener('click', () => {
    if (callbacks.onTogglePause) callbacks.onTogglePause();
  });

  return [hamburger, credits, fuel, playPause];
}

function renderNoGame(callbacks: RendererCallbacks): HTMLElement {
  const div = document.createElement('div');
  div.className = 'no-game';

  const message = document.createElement('p');
  message.textContent = 'No ship found. Begin your journey across the stars!';
  div.appendChild(message);

  const btn = document.createElement('button');
  btn.textContent = 'New Game';
  btn.addEventListener('click', callbacks.onStartCreate);
  div.appendChild(btn);

  return div;
}

function renderCatchUpProgressModal(progress: {
  processed: number;
  total: number;
}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'catchup-report';

  const header = document.createElement('div');
  header.className = 'catchup-header';

  const title = document.createElement('h3');
  title.textContent = 'Catching up...';
  header.appendChild(title);

  const pct = Math.round((progress.processed / progress.total) * 100);
  const subtitle = document.createElement('div');
  subtitle.className = 'catchup-duration';
  subtitle.textContent = `Processing ${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} updates (${pct}%)`;
  header.appendChild(subtitle);

  container.appendChild(header);

  // Progress bar
  const barContainer = document.createElement('div');
  barContainer.className = 'catchup-progress-bar';
  const barFill = document.createElement('div');
  barFill.className = 'catchup-progress-bar-fill';
  barFill.style.width = `${pct}%`;
  barContainer.appendChild(barFill);
  container.appendChild(barContainer);

  return container;
}

function renderCreating(
  step: WizardStep,
  draft: WizardDraft,
  callbacks: RendererCallbacks
): HTMLElement {
  const wizardCallbacks: WizardCallbacks = {
    onComplete: callbacks.onWizardComplete,
    onCancel: callbacks.onWizardCancel,
  };
  return renderWizard(step, draft, wizardCallbacks);
}
