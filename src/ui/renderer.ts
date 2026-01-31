import type { Character, Background, Skills } from '../character';
import { getBackgroundLabel } from '../character';
import { renderTable } from './table';
import {
  renderWizard,
  type WizardStep,
  type WizardDraft,
  type WizardCallbacks,
} from './wizard';

export type GameState =
  | { phase: 'no_character' }
  | { phase: 'creating'; step: WizardStep; draft: WizardDraft }
  | { phase: 'viewing'; character: Character };

export interface RendererCallbacks {
  onStartCreate: () => void;
  onWizardComplete: (
    name: string,
    background: Background,
    skills: Skills
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
  header.textContent = 'Idle Game';
  wrapper.appendChild(header);

  switch (state.phase) {
    case 'no_character':
      wrapper.appendChild(renderNoCharacter(callbacks));
      break;
    case 'creating':
      wrapper.appendChild(renderCreating(state.step, state.draft, callbacks));
      break;
    case 'viewing':
      wrapper.appendChild(renderViewing(state.character, callbacks));
      break;
  }

  container.appendChild(wrapper);
}

function renderNoCharacter(callbacks: RendererCallbacks): HTMLElement {
  const div = document.createElement('div');
  div.className = 'no-character';

  const message = document.createElement('p');
  message.textContent = 'No character found. Start your journey!';
  div.appendChild(message);

  const btn = document.createElement('button');
  btn.textContent = 'Create a Character';
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

function renderViewing(
  character: Character,
  callbacks: RendererCallbacks
): HTMLElement {
  const div = document.createElement('div');
  div.className = 'character-view';

  const subtitle = document.createElement('h2');
  subtitle.textContent = character.name;
  div.appendChild(subtitle);

  const tableData: Record<string, string | number> = {
    Name: character.name,
    Background: getBackgroundLabel(character.background),
    Charisma: character.skills.charisma,
    Strength: character.skills.strength,
    Created: new Date(character.createdAt).toLocaleDateString(),
  };

  div.appendChild(renderTable(tableData));

  const resetBtn = document.createElement('button');
  resetBtn.className = 'danger';
  resetBtn.textContent = 'Reset Progress';
  resetBtn.addEventListener('click', () => {
    if (
      confirm(
        'Are you sure you want to reset your progress? This cannot be undone.'
      )
    ) {
      callbacks.onReset();
    }
  });
  div.appendChild(resetBtn);

  return div;
}
