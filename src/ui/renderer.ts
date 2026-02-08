import type {
  GameData,
  ShipClassId,
  CrewEquipmentId,
  CatchUpReport,
  Toast,
} from '../models';
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
  | 'fleet'
  | 'log'
  | 'settings';

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

  // Create the 3-column grid container
  const contentGrid = document.createElement('div');
  contentGrid.className = 'game-content-grid';

  // Left sidebar
  contentGrid.appendChild(
    renderLeftSidebar(state.gameData, {
      onBuyFuel: callbacks.onBuyFuel,
      onToggleNavigation: callbacks.onToggleNavigation,
      onUndock: callbacks.onUndock,
      onDock: callbacks.onDockAtNearestPort,
      onAdvanceDay: callbacks.onAdvanceDay,
    })
  );

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
