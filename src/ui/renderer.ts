import type { GameData, ShipClassId } from '../models';
import {
  renderWizard,
  type WizardStep,
  type WizardDraft,
  type WizardCallbacks,
} from './wizard';
import { renderTabbedView } from './tabbedView';

export type PlayingTab = 'ship' | 'crew' | 'work' | 'log' | 'settings';

export type GameState =
  | { phase: 'no_game' }
  | { phase: 'creating'; step: WizardStep; draft: WizardDraft }
  | {
      phase: 'playing';
      gameData: GameData;
      activeTab: PlayingTab;
      showNavigation?: boolean;
      selectedCrewId?: string;
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
  onAdvanceDay: () => void;
  onDockAtNearestPort: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
}

export function render(
  container: HTMLElement,
  state: GameState,
  callbacks: RendererCallbacks
): void {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'game-container';

  const header = document.createElement('h1');
  header.textContent = 'Starship Commander';
  wrapper.appendChild(header);

  switch (state.phase) {
    case 'no_game':
      wrapper.appendChild(renderNoGame(callbacks));
      break;
    case 'creating':
      wrapper.appendChild(renderCreating(state.step, state.draft, callbacks));
      break;
    case 'playing':
      wrapper.appendChild(renderPlaying(state, callbacks));
      break;
  }

  container.appendChild(wrapper);
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

function renderPlaying(
  state: GameState & { phase: 'playing' },
  callbacks: RendererCallbacks
): HTMLElement {
  return renderTabbedView(
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
      onAdvanceDay: callbacks.onAdvanceDay,
      onDockAtNearestPort: callbacks.onDockAtNearestPort,
      onResumeContract: callbacks.onResumeContract,
      onAbandonContract: callbacks.onAbandonContract,
    },
    state.selectedCrewId
  );
}
