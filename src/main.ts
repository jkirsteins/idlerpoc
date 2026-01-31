import './style.css';
import type { ShipClassId } from './models';
import { createNewGame } from './gameFactory';
import { saveGame, loadGame, clearGame } from './storage';
import { render, type GameState, type RendererCallbacks } from './ui/renderer';
import type { WizardStep, WizardDraft } from './ui/wizard';

const app = document.getElementById('app')!;

let state: GameState = initializeState();

function initializeState(): GameState {
  const gameData = loadGame();
  if (gameData) {
    return { phase: 'playing', gameData };
  }
  return { phase: 'no_game' };
}

const callbacks: RendererCallbacks = {
  onStartCreate: () => {
    state = { phase: 'creating', step: 'captain_name', draft: {} };
    renderApp();
  },

  onWizardComplete: (
    captainName: string,
    shipName: string,
    shipClassId: ShipClassId
  ) => {
    const gameData = createNewGame(captainName, shipName, shipClassId);
    saveGame(gameData);
    state = { phase: 'playing', gameData };
    renderApp();
  },

  onWizardCancel: () => {
    state = { phase: 'no_game' };
    renderApp();
  },

  onReset: () => {
    clearGame();
    state = { phase: 'no_game' };
    renderApp();
  },
};

window.addEventListener('wizard-next', ((
  event: CustomEvent<{ step: WizardStep; draft: WizardDraft }>
) => {
  state = {
    phase: 'creating',
    step: event.detail.step,
    draft: event.detail.draft,
  };
  renderApp();
}) as EventListener);

function renderApp(): void {
  render(app, state, callbacks);
}

renderApp();
