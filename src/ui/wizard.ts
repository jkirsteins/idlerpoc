import type { ShipClassId } from '../models';
import { SHIP_CLASSES, type ShipClassTier } from '../shipClasses';
import { generateCaptainName, generateShipName } from '../names';

export type WizardStep = 'captain_name' | 'ship_name' | 'ship_class';

export interface WizardDraft {
  captainName?: string;
  shipName?: string;
  shipClassId?: ShipClassId;
}

export interface WizardCallbacks {
  onComplete: (
    captainName: string,
    shipName: string,
    shipClassId: ShipClassId
  ) => void;
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
  title.textContent = 'New Game';
  container.appendChild(title);

  const stepIndicator = document.createElement('div');
  stepIndicator.className = 'step-indicator';
  stepIndicator.textContent = `Step ${getStepNumber(step)} of 3`;
  container.appendChild(stepIndicator);

  switch (step) {
    case 'captain_name':
      container.appendChild(renderCaptainNameStep(draft, callbacks));
      break;
    case 'ship_name':
      container.appendChild(renderShipNameStep(draft, callbacks));
      break;
    case 'ship_class':
      container.appendChild(renderShipClassStep(draft, callbacks));
      break;
  }

  return container;
}

function getStepNumber(step: WizardStep): number {
  switch (step) {
    case 'captain_name':
      return 1;
    case 'ship_name':
      return 2;
    case 'ship_class':
      return 3;
  }
}

function renderCaptainNameStep(
  draft: WizardDraft,
  callbacks: WizardCallbacks
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'wizard-step';

  const label = document.createElement('label');
  label.textContent = "Enter your captain's name:";
  label.htmlFor = 'captain-name-input';
  form.appendChild(label);

  const inputRow = document.createElement('div');
  inputRow.className = 'input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'captain-name-input';
  input.value = draft.captainName ?? '';
  input.placeholder = 'e.g. Nick Succorso';
  input.maxLength = 40;
  inputRow.appendChild(input);

  const randomBtn = document.createElement('button');
  randomBtn.type = 'button';
  randomBtn.className = 'secondary';
  randomBtn.textContent = 'Randomize';
  randomBtn.addEventListener('click', () => {
    input.value = generateCaptainName();
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
    const captainName = input.value.trim();
    if (captainName.length > 0) {
      window.dispatchEvent(
        new CustomEvent('wizard-next', {
          detail: { step: 'ship_name', draft: { ...draft, captainName } },
        })
      );
    }
  });
  buttonRow.appendChild(nextBtn);

  form.appendChild(buttonRow);

  return form;
}

function renderShipNameStep(
  draft: WizardDraft,
  _callbacks: WizardCallbacks
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'wizard-step';

  const label = document.createElement('label');
  label.textContent = 'Name your ship:';
  label.htmlFor = 'ship-name-input';
  form.appendChild(label);

  const inputRow = document.createElement('div');
  inputRow.className = 'input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'ship-name-input';
  input.value = draft.shipName ?? '';
  input.placeholder = 'e.g. Bright Beauty';
  input.maxLength = 40;
  inputRow.appendChild(input);

  const randomBtn = document.createElement('button');
  randomBtn.type = 'button';
  randomBtn.className = 'secondary';
  randomBtn.textContent = 'Randomize';
  randomBtn.addEventListener('click', () => {
    input.value = generateShipName();
  });
  inputRow.appendChild(randomBtn);

  form.appendChild(inputRow);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'secondary';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('wizard-next', {
        detail: { step: 'captain_name', draft },
      })
    );
  });
  buttonRow.appendChild(backBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'Next';
  nextBtn.addEventListener('click', () => {
    const shipName = input.value.trim();
    if (shipName.length > 0) {
      window.dispatchEvent(
        new CustomEvent('wizard-next', {
          detail: { step: 'ship_class', draft: { ...draft, shipName } },
        })
      );
    }
  });
  buttonRow.appendChild(nextBtn);

  form.appendChild(buttonRow);

  return form;
}

function renderShipClassStep(
  draft: WizardDraft,
  callbacks: WizardCallbacks
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'wizard-step';

  const label = document.createElement('p');
  label.textContent = 'Select your ship:';
  form.appendChild(label);

  let selected: ShipClassId | undefined = draft.shipClassId;

  // Group ships by tier
  const shipsByTier = new Map<ShipClassTier, typeof SHIP_CLASSES>();
  for (const shipClass of SHIP_CLASSES) {
    const tierShips = shipsByTier.get(shipClass.tier) ?? [];
    tierShips.push(shipClass);
    shipsByTier.set(shipClass.tier, tierShips);
  }

  // Render each tier section
  const tiers: ShipClassTier[] = ['I', 'II', 'III', 'IV'];
  for (const tier of tiers) {
    const ships = shipsByTier.get(tier);
    if (!ships || ships.length === 0) continue;

    const tierSection = document.createElement('div');
    tierSection.className = 'ship-tier-section';

    const tierTitle = document.createElement('h3');
    tierTitle.className = 'ship-tier-title';
    tierTitle.textContent = getTierName(tier);
    tierSection.appendChild(tierTitle);

    const options = document.createElement('div');
    options.className = 'ship-class-options';

    for (const shipClass of ships) {
      const option = document.createElement('div');
      option.className = 'ship-class-option';

      if (!shipClass.unlocked) {
        option.classList.add('locked');
      } else if (selected === shipClass.id) {
        option.classList.add('selected');
      }

      option.dataset.shipClass = shipClass.id;

      const header = document.createElement('div');
      header.className = 'ship-class-header';

      const optionLabel = document.createElement('strong');
      optionLabel.textContent = shipClass.name;
      header.appendChild(optionLabel);

      if (!shipClass.unlocked) {
        const lockedBadge = document.createElement('span');
        lockedBadge.className = 'locked-badge';
        lockedBadge.textContent = 'Locked';
        header.appendChild(lockedBadge);
      }

      option.appendChild(header);

      const optionDesc = document.createElement('p');
      optionDesc.textContent = shipClass.description;
      option.appendChild(optionDesc);

      const stats = document.createElement('div');
      stats.className = 'ship-class-stats';
      stats.innerHTML = `<span>Price: ${formatCredits(shipClass.price)}</span><span>Rooms: ${shipClass.rooms.length}</span><span>Max Crew: ${shipClass.maxCrew}</span>`;
      option.appendChild(stats);

      if (shipClass.unlocked) {
        option.addEventListener('click', () => {
          selected = shipClass.id;
          document
            .querySelectorAll('.ship-class-option')
            .forEach((el) => el.classList.remove('selected'));
          option.classList.add('selected');
        });
      }

      options.appendChild(option);
    }

    tierSection.appendChild(options);
    form.appendChild(tierSection);
  }

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'secondary';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('wizard-next', {
        detail: {
          step: 'ship_name',
          draft: { ...draft, shipClassId: selected },
        },
      })
    );
  });
  buttonRow.appendChild(backBtn);

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.textContent = 'Launch!';
  createBtn.addEventListener('click', () => {
    if (selected && draft.captainName && draft.shipName) {
      callbacks.onComplete(draft.captainName, draft.shipName, selected);
    }
  });
  buttonRow.appendChild(createBtn);

  form.appendChild(buttonRow);

  return form;
}

function getTierName(tier: ShipClassTier): string {
  switch (tier) {
    case 'I':
      return 'Class I: Orbital Maintenance Vessels';
    case 'II':
      return 'Class II: Inner System Vessels';
    case 'III':
      return 'Class III: Interplanetary Vessels';
    case 'IV':
      return 'Class IV: Deep System Cruisers';
    case 'V':
      return 'Class V: Gap-Capable Vessels';
  }
}

function formatCredits(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}B CR`;
  } else if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M CR`;
  } else if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K CR`;
  }
  return `${amount} CR`;
}
