import type { GameData, ShipClassId } from '../models';
import {
  renderWizard,
  type WizardStep,
  type WizardDraft,
  type WizardCallbacks,
} from './wizard';
import { renderShipView } from './shipView';

export type GameState =
  | { phase: 'no_game' }
  | { phase: 'creating'; step: WizardStep; draft: WizardDraft }
  | { phase: 'playing'; gameData: GameData };

export interface RendererCallbacks {
  onStartCreate: () => void;
  onWizardComplete: (
    captainName: string,
    shipName: string,
    shipClassId: ShipClassId
  ) => void;
  onWizardCancel: () => void;
  onReset: () => void;
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
      wrapper.appendChild(renderPlaying(state.gameData, callbacks));
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
  gameData: GameData,
  callbacks: RendererCallbacks
): HTMLElement {
  return renderShipView(gameData, { onReset: callbacks.onReset });
}
