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
import { renderTabbedView } from './tabbedView';
import { renderCatchUpReport } from './catchUpReport';
import { renderToasts } from './toastSystem';
import { renderLeftSidebar, renderRightSidebar } from './sidebars';

export type PlayingTab =
  | 'ship'
  | 'crew'
  | 'work'
  | 'nav'
  | 'fleet'
  | 'log'
  | 'settings';

// Persists across re-renders (UI re-renders every tick)
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
  onDismissCatchUp: () => void;
}

export function render(
  container: HTMLElement,
  state: GameState,
  callbacks: RendererCallbacks
): void {
  container.innerHTML = '';

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
      // For non-playing states, add content to main-content area
      const noGameContent = document.createElement('div');
      noGameContent.className = 'main-content';
      noGameContent.style.gridColumn = '1 / -1'; // Span all columns
      noGameContent.appendChild(renderNoGame(callbacks));
      wrapper.appendChild(noGameContent);
      break;
    }
    case 'creating': {
      const creatingContent = document.createElement('div');
      creatingContent.className = 'main-content';
      creatingContent.style.gridColumn = '1 / -1'; // Span all columns
      creatingContent.appendChild(
        renderCreating(state.step, state.draft, callbacks)
      );
      wrapper.appendChild(creatingContent);
      break;
    }
    case 'playing':
      renderPlayingLayout(wrapper, state, callbacks);
      break;
  }

  container.appendChild(wrapper);

  // Add version badge
  const versionBadge = document.createElement('div');
  versionBadge.className = 'version-badge';
  versionBadge.textContent = `v${__GIT_COMMIT_SHA__.substring(0, 7)}`;
  versionBadge.title = `Git commit: ${__GIT_COMMIT_SHA__}`;
  container.appendChild(versionBadge);
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

function renderPlayingLayout(
  wrapper: HTMLElement,
  state: GameState & { phase: 'playing' },
  callbacks: RendererCallbacks
): void {
  // Show catch-up report modal if encounters happened during fast-forward
  if (state.catchUpReport) {
    const modalContent = document.createElement('div');
    modalContent.appendChild(
      renderCatchUpReport(state.catchUpReport, callbacks.onDismissCatchUp)
    );
    wrapper.appendChild(modalContent);
    return;
  }

  // Mobile header bar (visible only at <=900px via CSS)
  wrapper.appendChild(renderMobileHeaderBar(state.gameData, callbacks));

  // Mobile drawer overlay + sidebar (visible only at <=900px via CSS)
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

  const drawerSidebar = renderLeftSidebar(state.gameData, {
    onBuyFuel: callbacks.onBuyFuel,
    onToggleNavigation: callbacks.onToggleNavigation,
    onUndock: callbacks.onUndock,
    onDock: callbacks.onDockAtNearestPort,
    onAdvanceDay: callbacks.onAdvanceDay,
    onTogglePause: callbacks.onTogglePause,
    onSetSpeed: callbacks.onSetSpeed,
    onTabChange: callbacks.onTabChange,
  });
  const mobileDrawer = document.createElement('div');
  mobileDrawer.className = 'mobile-drawer' + (mobileDrawerOpen ? ' open' : '');
  // Close button inside drawer
  const drawerClose = document.createElement('button');
  drawerClose.className = 'mobile-drawer-close';
  drawerClose.textContent = '\u2715';
  drawerClose.addEventListener('click', () => {
    mobileDrawerOpen = false;
    mobileDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  });
  mobileDrawer.appendChild(drawerClose);
  // Clone sidebar content into the drawer (original stays in grid for desktop)
  const drawerContent = drawerSidebar.cloneNode(true) as HTMLElement;
  drawerContent.className = 'mobile-drawer-content';
  // Re-attach event listeners for cloned sidebar (clone doesn't copy listeners)
  mobileDrawer.appendChild(
    renderLeftSidebar(state.gameData, {
      onBuyFuel: callbacks.onBuyFuel,
      onToggleNavigation: () => {
        mobileDrawerOpen = false;
        if (callbacks.onToggleNavigation) callbacks.onToggleNavigation();
      },
      onUndock: () => {
        mobileDrawerOpen = false;
        if (callbacks.onUndock) callbacks.onUndock();
      },
      onDock: () => {
        mobileDrawerOpen = false;
        if (callbacks.onDockAtNearestPort) callbacks.onDockAtNearestPort();
      },
      onAdvanceDay: callbacks.onAdvanceDay,
      onTogglePause: callbacks.onTogglePause,
      onSetSpeed: callbacks.onSetSpeed,
      onTabChange: (tab: PlayingTab) => {
        mobileDrawerOpen = false;
        if (callbacks.onTabChange) callbacks.onTabChange(tab);
      },
    })
  );
  wrapper.appendChild(mobileDrawer);

  // Create the 3-column grid container
  const contentGrid = document.createElement('div');
  contentGrid.className = 'game-content-grid';

  // Left sidebar (hidden on mobile via CSS, shown on desktop)
  contentGrid.appendChild(drawerSidebar);

  // Main content (tabbed view)
  const mainContent = document.createElement('div');
  mainContent.className = 'main-content';
  mainContent.style.position = 'relative';

  mainContent.appendChild(
    renderTabbedView(
      state.gameData,
      state.activeTab,
      state.showNavigation || false,
      {
        onReset: callbacks.onReset,
        onTabChange: callbacks.onTabChange,
        onCrewAssign: callbacks.onCrewAssign,
        onCrewUnassign: callbacks.onCrewUnassign,
        onUndock: callbacks.onUndock,
        onDock: callbacks.onDock,
        onEngineOn: callbacks.onEngineOn,
        onEngineOff: callbacks.onEngineOff,
        onToggleNavigation: callbacks.onToggleNavigation,
        onSelectCrew: callbacks.onSelectCrew,
        onLevelUp: callbacks.onLevelUp,
        onAssignSkillPoint: callbacks.onAssignSkillPoint,
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
    )
  );

  // Toast notifications overlay (if any)
  if (state.toasts && state.toasts.length > 0) {
    mainContent.appendChild(renderToasts(state.toasts));
  }

  contentGrid.appendChild(mainContent);

  // Right sidebar
  contentGrid.appendChild(renderRightSidebar(state.gameData));

  // Add the grid to the wrapper
  wrapper.appendChild(contentGrid);
}

function renderMobileHeaderBar(
  gameData: GameData,
  callbacks: RendererCallbacks
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'mobile-header-bar';

  // Hamburger button
  const hamburger = document.createElement('button');
  hamburger.className = 'mobile-hamburger';
  hamburger.innerHTML = '\u2630';
  hamburger.addEventListener('click', () => {
    mobileDrawerOpen = !mobileDrawerOpen;
    const drawer = bar.parentElement?.querySelector('.mobile-drawer');
    const overlay = bar.parentElement?.querySelector('.mobile-drawer-overlay');
    if (drawer) drawer.classList.toggle('open', mobileDrawerOpen);
    if (overlay) overlay.classList.toggle('open', mobileDrawerOpen);
  });
  bar.appendChild(hamburger);

  const ship = getActiveShip(gameData);

  // Credits
  const credits = document.createElement('div');
  credits.className = 'mobile-header-stat';
  credits.innerHTML = `<span class="mobile-header-label">CR</span> <span class="mobile-header-value">${Math.round(gameData.credits).toLocaleString()}</span>`;
  bar.appendChild(credits);

  // Fuel
  const fuel = document.createElement('div');
  fuel.className = 'mobile-header-stat';
  const fuelColor =
    ship.fuel <= 20 ? '#e94560' : ship.fuel <= 50 ? '#ffc107' : '#4caf50';
  fuel.innerHTML = `<span class="mobile-header-label">FUEL</span> <span class="mobile-header-value" style="color:${fuelColor}">${ship.fuel.toFixed(0)}%</span>`;
  bar.appendChild(fuel);

  // Play/Pause button
  const playPause = document.createElement('button');
  playPause.className = 'mobile-header-playpause';
  playPause.textContent = gameData.isPaused ? '\u25B6' : '\u23F8';
  playPause.addEventListener('click', () => {
    if (callbacks.onTogglePause) callbacks.onTogglePause();
  });
  bar.appendChild(playPause);

  // Speed indicator
  const speed = document.createElement('div');
  speed.className = 'mobile-header-stat';
  const currentSpeed = gameData.timeSpeed ?? 1;
  speed.innerHTML = `<span class="mobile-header-value">${gameData.isPaused ? '--' : currentSpeed + 'x'}</span>`;
  bar.appendChild(speed);

  return bar;
}
