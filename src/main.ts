import './style.css';
import { createCharacter, type Background, type Skills } from './character';
import { saveCharacter, loadCharacter, clearCharacter } from './storage';
import { render, type GameState, type RendererCallbacks } from './ui/renderer';
import type { WizardStep, WizardDraft } from './ui/wizard';

const app = document.getElementById('app')!;

let state: GameState = initializeState();

function initializeState(): GameState {
  const character = loadCharacter();
  if (character) {
    return { phase: 'viewing', character };
  }
  return { phase: 'no_character' };
}

const callbacks: RendererCallbacks = {
  onStartCreate: () => {
    state = { phase: 'creating', step: 'name', draft: {} };
    renderApp();
  },

  onWizardComplete: (name: string, background: Background, skills: Skills) => {
    const character = createCharacter(name, background, skills);
    saveCharacter(character);
    state = { phase: 'viewing', character };
    renderApp();
  },

  onWizardCancel: () => {
    state = { phase: 'no_character' };
    renderApp();
  },

  onReset: () => {
    clearCharacter();
    state = { phase: 'no_character' };
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
