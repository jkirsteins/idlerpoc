/**
 * Shared factory for action radio card groups (continue / pause / abandon).
 *
 * Used by both flightStatus (contracts + mining route transit) and
 * miningPanel (mining route at mine). Extracts the duplicated DOM
 * construction into a single place.
 */

export type ActionValue = 'continue' | 'pause' | 'abandon';

export interface ActionCardRefs {
  card: HTMLLabelElement;
  radio: HTMLInputElement;
  labelEl: HTMLElement;
  descEl: HTMLElement;
  warnEl: HTMLElement;
}

let radioGroupCounter = 0;

/**
 * Create a set of action radio cards (continue / pause / abandon).
 *
 * @param onChange Called when the user selects an action.
 * @returns The container element and a map of per-action refs for in-place updates.
 */
export function createActionRadioCards(
  onChange: (action: ActionValue) => void
): {
  groupEl: HTMLDivElement;
  cardRefs: Map<ActionValue, ActionCardRefs>;
} {
  const groupEl = document.createElement('div');
  groupEl.className = 'action-radio-group';
  groupEl.style.display = 'none';

  const radioGroupName = `action-radio-${++radioGroupCounter}`;
  const cardRefs = new Map<ActionValue, ActionCardRefs>();

  for (const value of ['continue', 'pause', 'abandon'] as ActionValue[]) {
    const card = document.createElement('label');
    card.className = 'action-radio-card action-radio-card--default';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = radioGroupName;
    radio.value = value;
    radio.addEventListener('change', () => onChange(value));
    card.appendChild(radio);

    const textWrap = document.createElement('div');
    textWrap.className = 'action-radio-text';

    const labelEl = document.createElement('div');
    labelEl.className = 'action-radio-label';
    textWrap.appendChild(labelEl);

    const descEl = document.createElement('div');
    descEl.className = 'action-radio-desc';
    textWrap.appendChild(descEl);

    const warnEl = document.createElement('div');
    warnEl.className = 'action-radio-warn';
    warnEl.style.display = 'none';
    textWrap.appendChild(warnEl);

    card.appendChild(textWrap);
    groupEl.appendChild(card);
    cardRefs.set(value, { card, radio, labelEl, descEl, warnEl });
  }

  return { groupEl, cardRefs };
}
