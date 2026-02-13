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
import {
  calculateFuelPercentage,
  getFuelColorHex,
  formatFuelMass,
} from './fuelFormatting';
import { getProvisionsColorHex } from './provisionsFormatting';
import {
  getMaxProvisionsKg,
  getProvisionsSurvivalDays,
} from '../provisionsSystem';
import { formatMass } from '../formatting';
import { formatGameDate } from '../timeSystem';
import { calculateDailyLedger } from '../dailyLedger';
import type { PlayingTab } from './types';

export type { PlayingTab } from './types';

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
  onCancelPause: () => void;
  onRequestAbandon: () => void;
  onFlightProfileChange: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
  onBuyFuel: () => void;
  onStartTrip: (destinationId: string) => void;
  onHireCrew: (crewId: string) => void;
  onBuyEquipment: (equipmentId: CrewEquipmentId) => void;
  onSellEquipment: (itemId: string) => void;
  onBuyShipEquipment: (equipmentId: import('../models').EquipmentId) => void;
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
  onSellOre: (oreId: import('../models').OreId, quantity: number) => void;
  onSellAllOre: () => void;
  onStartMiningRoute: (sellLocationId: string) => void;
  onCancelMiningRoute: () => void;
  onSelectMiningOre: (oreId: string | null) => void;
  onDismissCatchUp: () => void;
  onImportState?: (json: string) => void;
}

// ── Mounted playing layout ─────────────────────────────────────────
// Stable DOM + child component references kept between ticks so
// update() can patch in-place instead of wiping the page.

interface MountedPlayingLayout {
  container: HTMLElement;
  wrapper: HTMLElement;
  mobileHeaderBar: Component;
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
  catchUpProgressText?: HTMLElement;
  catchUpProgressFill?: HTMLElement;
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

  // Catch-up progress bar is showing — update it in-place to prevent flicker.
  // Only match when catchUpProgress is set (not catchUpReport), so that when
  // catch-up completes the report falls through to the slow-path rebuild.
  if (
    state.phase === 'playing' &&
    state.catchUpProgress &&
    mounted !== null &&
    mounted.hasCatchUpReport &&
    mounted.catchUpProgressText &&
    mounted.catchUpProgressFill &&
    container.contains(mounted.wrapper)
  ) {
    const pct = Math.round(
      (state.catchUpProgress.processed / state.catchUpProgress.total) * 100
    );
    mounted.catchUpProgressText.textContent = `Processing ${state.catchUpProgress.processed.toLocaleString()} / ${state.catchUpProgress.total.toLocaleString()} updates (${pct}%)`;
    mounted.catchUpProgressFill.style.width = `${pct}%`;
    return;
  }

  // Catch-up report is already displayed — it's static content, no update needed.
  // Detected by hasCatchUpReport being set but progress refs absent (progress bar
  // sets them; report does not). Without this, every tick falls through to the
  // slow path and recreates the report modal from scratch.
  if (
    state.phase === 'playing' &&
    state.catchUpReport &&
    mounted !== null &&
    mounted.hasCatchUpReport &&
    !mounted.catchUpProgressText &&
    container.contains(mounted.wrapper)
  ) {
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
        const progressModal = renderCatchUpProgressModal(state.catchUpProgress);
        progressContent.appendChild(progressModal.el);
        wrapper.appendChild(progressContent);
        mounted = makePlaceholderMounted(container, wrapper);
        mounted.catchUpProgressText = progressModal.textEl;
        mounted.catchUpProgressFill = progressModal.fillEl;
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

  // Mobile header bar (mount-once component)
  const mobileHeaderBar = createMobileHeaderBar(state.gameData, callbacks);
  wrapper.appendChild(mobileHeaderBar.el);

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
      onCancelPause: callbacks.onCancelPause,
      onRequestAbandon: callbacks.onRequestAbandon,
      onFlightProfileChange: callbacks.onFlightProfileChange,
      onResumeContract: callbacks.onResumeContract,
      onAbandonContract: callbacks.onAbandonContract,
      onBuyFuel: callbacks.onBuyFuel,
      onStartTrip: callbacks.onStartTrip,
      onHireCrew: callbacks.onHireCrew,
      onBuyEquipment: callbacks.onBuyEquipment,
      onSellEquipment: callbacks.onSellEquipment,
      onBuyShipEquipment: callbacks.onBuyShipEquipment,
      onSelectShip: callbacks.onSelectShip,
      onBuyShip: callbacks.onBuyShip,
      onTransferCrew: callbacks.onTransferCrew,
      onSellOre: callbacks.onSellOre,
      onSellAllOre: callbacks.onSellAllOre,
      onStartMiningRoute: callbacks.onStartMiningRoute,
      onCancelMiningRoute: callbacks.onCancelMiningRoute,
      onSelectMiningOre: callbacks.onSelectMiningOre,
      onImportState: callbacks.onImportState,
      onSpecializeCrew: callbacks.onSpecializeCrew,
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
  _callbacks: RendererCallbacks
): void {
  // Mobile header bar: patch in-place
  layout.mobileHeaderBar.update(state.gameData);

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

  // Toasts — clear children without replaceChildren() to preserve touch state
  while (layout.toastArea.firstChild) {
    layout.toastArea.removeChild(layout.toastArea.firstChild);
  }
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
    mobileHeaderBar: dummyComp,
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

function createMobileHeaderBar(
  gameData: GameData,
  callbacks: RendererCallbacks
): Component {
  const bar = document.createElement('div');
  bar.className = 'mobile-header-bar';

  // ── Row 1: hamburger | stats | play/pause ──────────────────────

  const hamburger = document.createElement('button');
  hamburger.className = 'mobile-hamburger';
  hamburger.textContent = '\u2630';
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
  bar.appendChild(hamburger);

  // Credits stat
  const creditsStat = document.createElement('div');
  creditsStat.className = 'mobile-header-stat';
  const creditsLabel = document.createElement('span');
  creditsLabel.className = 'mobile-header-label';
  creditsLabel.textContent = 'CR';
  const creditsValueSpan = document.createElement('span');
  creditsValueSpan.className = 'mobile-header-value';
  const creditsRateSpan = document.createElement('span');
  creditsRateSpan.className = 'mobile-header-rate';
  creditsStat.appendChild(creditsLabel);
  creditsStat.appendChild(document.createTextNode(' '));
  creditsStat.appendChild(creditsValueSpan);
  creditsStat.appendChild(creditsRateSpan);
  bar.appendChild(creditsStat);

  // Fuel stat
  const fuelStat = document.createElement('div');
  fuelStat.className = 'mobile-header-stat';
  const fuelLabel = document.createElement('span');
  fuelLabel.className = 'mobile-header-label';
  fuelLabel.textContent = 'FUEL';
  const fuelValueSpan = document.createElement('span');
  fuelValueSpan.className = 'mobile-header-value';
  const fuelStatusSpan = document.createElement('span');
  fuelStatusSpan.className = 'mobile-header-fuel-status';
  fuelStat.appendChild(fuelLabel);
  fuelStat.appendChild(document.createTextNode(' '));
  fuelStat.appendChild(fuelValueSpan);
  fuelStat.appendChild(fuelStatusSpan);
  bar.appendChild(fuelStat);

  // Provisions stat
  const provStat = document.createElement('div');
  provStat.className = 'mobile-header-stat';
  const provLabel = document.createElement('span');
  provLabel.className = 'mobile-header-label';
  provLabel.textContent = 'PROV';
  const provValueSpan = document.createElement('span');
  provValueSpan.className = 'mobile-header-value';
  provStat.appendChild(provLabel);
  provStat.appendChild(document.createTextNode(' '));
  provStat.appendChild(provValueSpan);
  bar.appendChild(provStat);

  // Play/pause button
  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'mobile-header-playpause';
  playPauseBtn.addEventListener('click', () => {
    if (callbacks.onTogglePause) callbacks.onTogglePause();
  });
  bar.appendChild(playPauseBtn);

  // ── Row 2: date | location | speed controls ────────────────────

  const infoRow = document.createElement('div');
  infoRow.className = 'mobile-header-info-row';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'mobile-header-date';
  infoRow.appendChild(dateSpan);

  const locationSpan = document.createElement('span');
  locationSpan.className = 'mobile-header-location';
  infoRow.appendChild(locationSpan);

  const speedGroup = document.createElement('div');
  speedGroup.className = 'mobile-header-speed';
  const speedBtns: Array<{ btn: HTMLButtonElement; speed: 1 | 2 | 5 }> = [];
  for (const s of [1, 2, 5] as const) {
    const btn = document.createElement('button');
    btn.className = 'mobile-speed-btn';
    btn.textContent = `${s}x`;
    btn.addEventListener('click', () => {
      if (callbacks.onSetSpeed) callbacks.onSetSpeed(s);
    });
    speedGroup.appendChild(btn);
    speedBtns.push({ btn, speed: s });
  }
  infoRow.appendChild(speedGroup);

  bar.appendChild(infoRow);

  // ── Update: patch in-place ─────────────────────────────────────

  function update(gd: GameData): void {
    const ship = getActiveShip(gd);

    // Credits
    creditsValueSpan.textContent = Math.round(gd.credits).toLocaleString();

    // Net rate indicator
    const ledger = calculateDailyLedger(gd);
    if (ledger.netPerDay !== 0) {
      const sign = ledger.netPerDay > 0 ? '+' : '';
      creditsRateSpan.textContent = ` ${sign}${Math.round(ledger.netPerDay)}/d`;
      creditsRateSpan.style.color =
        ledger.netPerDay > 0 ? '#4caf50' : '#ff6b6b';
      creditsRateSpan.style.display = '';
    } else {
      creditsRateSpan.style.display = 'none';
    }

    // Fuel
    const fuelPct = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
    const fuelColor = getFuelColorHex(fuelPct);
    fuelValueSpan.textContent = formatFuelMass(ship.fuelKg);
    fuelValueSpan.style.color = fuelColor;

    // Fuel status text (color is not the sole indicator per UX guidelines)
    if (fuelPct < 15) {
      fuelStatusSpan.textContent = ' CRITICAL';
      fuelStatusSpan.style.color = '#e94560';
      fuelStatusSpan.style.display = '';
    } else if (fuelPct < 25) {
      fuelStatusSpan.textContent = ' LOW';
      fuelStatusSpan.style.color = '#ffc107';
      fuelStatusSpan.style.display = '';
    } else {
      fuelStatusSpan.style.display = 'none';
    }

    // Provisions
    const maxProv = getMaxProvisionsKg(ship);
    const provPct =
      maxProv > 0 ? Math.min(100, (ship.provisionsKg / maxProv) * 100) : 0;
    const provColor =
      ship.crew.length === 0 ? '#555' : getProvisionsColorHex(provPct);
    const provDays = getProvisionsSurvivalDays(ship);
    provValueSpan.textContent =
      ship.crew.length > 0 && provDays < Infinity
        ? `${Math.ceil(provDays)}d`
        : formatMass(Math.round(ship.provisionsKg));
    provValueSpan.style.color = provColor;

    // Play/pause
    playPauseBtn.textContent = gd.isPaused ? '\u25B6' : '\u23F8';

    // Date
    dateSpan.textContent = formatGameDate(gd.gameTime);

    // Location
    if (ship.location.status === 'in_flight' && ship.activeFlightPlan) {
      const origin = gd.world.locations.find(
        (l) => l.id === ship.activeFlightPlan!.origin
      );
      const dest = gd.world.locations.find(
        (l) => l.id === ship.activeFlightPlan!.destination
      );
      locationSpan.textContent = `${origin?.name || '?'} \u2192 ${dest?.name || '?'}`;
    } else if (
      ship.location.status === 'orbiting' &&
      ship.location.orbitingAt
    ) {
      const loc = gd.world.locations.find(
        (l) => l.id === ship.location.orbitingAt
      );
      locationSpan.textContent = `Orbiting ${loc?.name || 'Unknown'}`;
    } else if (ship.location.dockedAt) {
      const loc = gd.world.locations.find(
        (l) => l.id === ship.location.dockedAt
      );
      locationSpan.textContent = loc?.name || 'Unknown';
    } else {
      locationSpan.textContent = 'In Space';
    }

    // Speed buttons
    for (const { btn, speed } of speedBtns) {
      btn.classList.toggle('active', gd.timeSpeed === speed);
    }
  }

  // Initial render
  update(gameData);

  return { el: bar, update };
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
}): { el: HTMLElement; textEl: HTMLElement; fillEl: HTMLElement } {
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

  return { el: container, textEl: subtitle, fillEl: barFill };
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
