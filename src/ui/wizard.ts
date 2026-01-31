import {
  BACKGROUNDS,
  SKILL_NAMES,
  TOTAL_SKILL_POINTS,
  type Background,
  type Skills,
} from '../character';
import { generateSciFiName } from '../names';

export type WizardStep = 'name' | 'background' | 'skills';

export interface WizardDraft {
  name?: string;
  background?: Background;
  skills?: Skills;
}

export interface WizardCallbacks {
  onComplete: (name: string, background: Background, skills: Skills) => void;
  onCancel: () => void;
}

export function renderWizard(
  step: WizardStep,
  draft: WizardDraft,
  callbacks: WizardCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'wizard';

  const title = document.createElement('h2');
  title.textContent = 'Create Your Character';
  container.appendChild(title);

  const stepIndicator = document.createElement('div');
  stepIndicator.className = 'step-indicator';
  stepIndicator.textContent = `Step ${getStepNumber(step)} of 3`;
  container.appendChild(stepIndicator);

  switch (step) {
    case 'name':
      container.appendChild(renderNameStep(draft, callbacks));
      break;
    case 'background':
      container.appendChild(renderBackgroundStep(draft, callbacks));
      break;
    case 'skills':
      container.appendChild(renderSkillsStep(draft, callbacks));
      break;
  }

  return container;
}

function getStepNumber(step: WizardStep): number {
  switch (step) {
    case 'name':
      return 1;
    case 'background':
      return 2;
    case 'skills':
      return 3;
  }
}

function renderNameStep(
  draft: WizardDraft,
  callbacks: WizardCallbacks
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'wizard-step';

  const label = document.createElement('label');
  label.textContent = 'Enter your name:';
  label.htmlFor = 'name-input';
  form.appendChild(label);

  const inputRow = document.createElement('div');
  inputRow.className = 'input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'name-input';
  input.value = draft.name ?? '';
  input.placeholder = 'Your character name';
  input.maxLength = 30;
  inputRow.appendChild(input);

  const randomBtn = document.createElement('button');
  randomBtn.type = 'button';
  randomBtn.className = 'secondary';
  randomBtn.textContent = 'Randomize';
  randomBtn.addEventListener('click', () => {
    input.value = generateSciFiName();
  });
  inputRow.appendChild(randomBtn);

  form.appendChild(inputRow);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', callbacks.onCancel);
  buttonRow.appendChild(cancelBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'Next';
  nextBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (name.length > 0) {
      window.dispatchEvent(
        new CustomEvent('wizard-next', {
          detail: { step: 'background', draft: { ...draft, name } },
        })
      );
    }
  });
  buttonRow.appendChild(nextBtn);

  form.appendChild(buttonRow);

  return form;
}

function renderBackgroundStep(
  draft: WizardDraft,
  _callbacks: WizardCallbacks
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'wizard-step';

  const label = document.createElement('p');
  label.textContent = 'Select your background:';
  form.appendChild(label);

  const options = document.createElement('div');
  options.className = 'background-options';

  let selected: Background | undefined = draft.background;

  for (const bg of BACKGROUNDS) {
    const option = document.createElement('div');
    option.className =
      'background-option' + (selected === bg.id ? ' selected' : '');
    option.dataset.background = bg.id;

    const optionLabel = document.createElement('strong');
    optionLabel.textContent = bg.label;
    option.appendChild(optionLabel);

    const optionDesc = document.createElement('p');
    optionDesc.textContent = bg.description;
    option.appendChild(optionDesc);

    option.addEventListener('click', () => {
      selected = bg.id;
      options
        .querySelectorAll('.background-option')
        .forEach((el) => el.classList.remove('selected'));
      option.classList.add('selected');
    });

    options.appendChild(option);
  }

  form.appendChild(options);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'secondary';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('wizard-next', {
        detail: { step: 'name', draft },
      })
    );
  });
  buttonRow.appendChild(backBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'Next';
  nextBtn.addEventListener('click', () => {
    if (selected) {
      window.dispatchEvent(
        new CustomEvent('wizard-next', {
          detail: { step: 'skills', draft: { ...draft, background: selected } },
        })
      );
    }
  });
  buttonRow.appendChild(nextBtn);

  form.appendChild(buttonRow);

  return form;
}

function renderSkillsStep(
  draft: WizardDraft,
  callbacks: WizardCallbacks
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'wizard-step';

  const label = document.createElement('p');
  label.textContent = `Allocate ${TOTAL_SKILL_POINTS} skill points:`;
  form.appendChild(label);

  const skills: Skills = draft.skills ?? { charisma: 0, strength: 0 };

  const getRemainingPoints = () =>
    TOTAL_SKILL_POINTS - skills.charisma - skills.strength;

  const remainingDisplay = document.createElement('div');
  remainingDisplay.className = 'remaining-points';
  const updateRemaining = () => {
    remainingDisplay.textContent = `Remaining: ${getRemainingPoints()}`;
  };
  updateRemaining();
  form.appendChild(remainingDisplay);

  const skillsContainer = document.createElement('div');
  skillsContainer.className = 'skills-container';

  for (const skillName of SKILL_NAMES) {
    const row = document.createElement('div');
    row.className = 'skill-row';

    const skillLabel = document.createElement('span');
    skillLabel.className = 'skill-label';
    skillLabel.textContent =
      skillName.charAt(0).toUpperCase() + skillName.slice(1);
    row.appendChild(skillLabel);

    const controls = document.createElement('div');
    controls.className = 'skill-controls';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'skill-btn';
    minusBtn.textContent = '-';
    controls.appendChild(minusBtn);

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'skill-value';
    valueDisplay.textContent = String(skills[skillName]);
    controls.appendChild(valueDisplay);

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'skill-btn';
    plusBtn.textContent = '+';
    controls.appendChild(plusBtn);

    minusBtn.addEventListener('click', () => {
      if (skills[skillName] > 0) {
        skills[skillName]--;
        valueDisplay.textContent = String(skills[skillName]);
        updateRemaining();
      }
    });

    plusBtn.addEventListener('click', () => {
      if (getRemainingPoints() > 0) {
        skills[skillName]++;
        valueDisplay.textContent = String(skills[skillName]);
        updateRemaining();
      }
    });

    row.appendChild(controls);
    skillsContainer.appendChild(row);
  }

  form.appendChild(skillsContainer);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'secondary';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('wizard-next', {
        detail: { step: 'background', draft: { ...draft, skills } },
      })
    );
  });
  buttonRow.appendChild(backBtn);

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.textContent = 'Create Character';
  createBtn.addEventListener('click', () => {
    if (getRemainingPoints() === 0 && draft.name && draft.background) {
      callbacks.onComplete(draft.name, draft.background, skills);
    }
  });
  buttonRow.appendChild(createBtn);

  form.appendChild(buttonRow);

  return form;
}
