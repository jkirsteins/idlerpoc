/**
 * Refueling Dialog - kg-based fuel purchase interface
 *
 * Allows players to purchase fuel by kilogram with location-based pricing.
 */

import type { GameData, WorldLocation } from '../models';
import { getActiveShip } from '../models';
import { formatFuelMass } from './fuelFormatting';
import { formatCredits } from '../formatting';
import { getFuelPricePerKg } from '../fuelPricing';

export { getFuelPricePerKg };

export interface RefuelDialogCallbacks {
  onConfirm: (fuelKg: number) => void;
  onCancel: () => void;
}

/**
 * Create refueling dialog modal
 */
export function createRefuelDialog(
  gameData: GameData,
  location: WorldLocation,
  callbacks: RefuelDialogCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const pricePerKg = getFuelPricePerKg(location, ship);
  const maxPurchaseKg = Math.floor(ship.maxFuelKg - ship.fuelKg);

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  // Create dialog
  const dialog = document.createElement('div');
  dialog.className = 'refuel-dialog';
  dialog.style.cssText = `
    background: #1a1a2e;
    border: 2px solid #4a90e2;
    border-radius: 8px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    color: #e0e0e0;
  `;

  // Title
  const title = document.createElement('h2');
  title.textContent = '⛽ Refuel Ship';
  title.style.cssText = `
    margin: 0 0 1.5rem 0;
    color: #4a90e2;
    font-size: 1.5rem;
  `;
  dialog.appendChild(title);

  // Current fuel status
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = `
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  `;

  const currentFuelLabel = document.createElement('div');
  currentFuelLabel.style.marginBottom = '0.5rem';
  currentFuelLabel.innerHTML = `
    <strong>Current Fuel:</strong> ${formatFuelMass(ship.fuelKg)} / ${formatFuelMass(ship.maxFuelKg)}
  `;
  statusDiv.appendChild(currentFuelLabel);

  const availableLabel = document.createElement('div');
  availableLabel.style.marginBottom = '0.5rem';
  availableLabel.innerHTML = `
    <strong>Available Capacity:</strong> ${formatFuelMass(maxPurchaseKg)}
  `;
  statusDiv.appendChild(availableLabel);

  const priceLabel = document.createElement('div');
  priceLabel.innerHTML = `
    <strong>Price:</strong> ${pricePerKg.toFixed(2)} cr/kg <span style="color: #888; font-size: 0.9em;">(${location.name})</span>
  `;
  statusDiv.appendChild(priceLabel);

  dialog.appendChild(statusDiv);

  // Fuel amount input section
  const inputSection = document.createElement('div');
  inputSection.style.marginBottom = '1.5rem';

  const inputLabel = document.createElement('label');
  inputLabel.textContent = 'Fuel Amount (kg):';
  inputLabel.style.cssText = `
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  `;
  inputSection.appendChild(inputLabel);

  // Numeric input
  const inputGroup = document.createElement('div');
  inputGroup.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  `;

  const fuelLabel = document.createElement('label');
  fuelLabel.textContent = 'Fuel amount (kg)';
  fuelLabel.htmlFor = 'refuel-amount-input';
  fuelLabel.style.cssText =
    'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);';
  inputGroup.appendChild(fuelLabel);

  const fuelInput = document.createElement('input');
  fuelInput.type = 'number';
  fuelInput.id = 'refuel-amount-input';
  fuelInput.min = '0';
  fuelInput.max = maxPurchaseKg.toString();
  fuelInput.step = '100';
  fuelInput.value = maxPurchaseKg.toString();
  fuelInput.style.cssText = `
    flex: 1 1 100%;
    padding: 0.5rem;
    background: #16213e;
    border: 1px solid #4a90e2;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 1rem;
    min-width: 0;
  `;
  inputGroup.appendChild(fuelInput);

  // Slider (created before buttons so button click handlers can reference it)
  const sliderLabel = document.createElement('label');
  sliderLabel.textContent = 'Fuel amount slider';
  sliderLabel.htmlFor = 'refuel-amount-slider';
  sliderLabel.style.cssText =
    'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'refuel-amount-slider';
  slider.min = '0';
  slider.max = maxPurchaseKg.toString();
  slider.step = '100';
  slider.value = maxPurchaseKg.toString();
  slider.style.cssText = `
    width: 100%;
    margin-bottom: 1rem;
  `;

  // Quick fill buttons
  const buttonGroup = document.createElement('div');
  buttonGroup.style.cssText = `
    display: flex;
    gap: 0.5rem;
    flex: 1 1 100%;
  `;

  const quickFillButtons: Array<{ label: string; getAmount: () => number }> = [
    { label: '25%', getAmount: () => Math.round(maxPurchaseKg * 0.25) },
    { label: '50%', getAmount: () => Math.round(maxPurchaseKg * 0.5) },
    { label: '75%', getAmount: () => Math.round(maxPurchaseKg * 0.75) },
    {
      label: 'Max',
      getAmount: () => {
        const affordable =
          pricePerKg > 0
            ? Math.floor(gameData.credits / pricePerKg)
            : maxPurchaseKg;
        return Math.min(maxPurchaseKg, affordable);
      },
    },
  ];

  for (const { label, getAmount } of quickFillButtons) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      flex: 1;
      padding: 0.5rem;
      background: #16213e;
      border: 1px solid #4a90e2;
      border-radius: 4px;
      color: #4a90e2;
      cursor: pointer;
      font-size: 0.9rem;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#4a90e2';
      btn.style.color = 'var(--text-white)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'var(--bg-container)';
      btn.style.color = 'var(--blue-light)';
    });
    btn.addEventListener('click', () => {
      const amount = getAmount();
      fuelInput.value = amount.toString();
      slider.value = amount.toString();
      updateCostDisplay();
    });
    buttonGroup.appendChild(btn);
  }
  inputGroup.appendChild(buttonGroup);

  inputSection.appendChild(inputGroup);

  // Append slider label + slider after input group
  inputSection.appendChild(sliderLabel);
  inputSection.appendChild(slider);

  // Sync slider and input
  slider.addEventListener('input', () => {
    fuelInput.value = slider.value;
    updateCostDisplay();
  });
  fuelInput.addEventListener('input', () => {
    slider.value = fuelInput.value;
    updateCostDisplay();
  });

  dialog.appendChild(inputSection);

  // Cost display
  const costDisplay = document.createElement('div');
  costDisplay.style.cssText = `
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: rgba(74, 144, 226, 0.1);
    border: 1px solid #4a90e2;
    border-radius: 4px;
    font-size: 1.2rem;
    text-align: center;
  `;

  const costLabel = document.createElement('div');
  costLabel.style.color = 'var(--text-muted)';
  costLabel.style.fontSize = '0.9rem';
  costLabel.style.marginBottom = '0.25rem';
  costLabel.textContent = 'Total Cost:';
  costDisplay.appendChild(costLabel);

  const costValue = document.createElement('div');
  costValue.style.cssText = `
    font-weight: bold;
    color: #4a90e2;
    font-size: 1.5rem;
  `;
  costDisplay.appendChild(costValue);

  const creditsAvailable = document.createElement('div');
  creditsAvailable.style.cssText = `
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: #888;
  `;
  costDisplay.appendChild(creditsAvailable);

  dialog.appendChild(costDisplay);

  // Create confirmBtn early so updateCostDisplay can reference it
  const confirmBtn = document.createElement('button');

  // Update cost display function
  function updateCostDisplay() {
    const fuelKg = Math.max(
      0,
      Math.min(maxPurchaseKg, parseInt(fuelInput.value) || 0)
    );
    const totalCost = Math.round(fuelKg * pricePerKg);
    const canAfford = gameData.credits >= totalCost;

    costValue.textContent = formatCredits(totalCost);
    costValue.style.color = canAfford ? '#4a90e2' : '#e94560';

    creditsAvailable.textContent = `Available: ${formatCredits(gameData.credits)}`;
    creditsAvailable.style.color = canAfford ? '#888' : '#e94560';

    confirmBtn.disabled = !canAfford || fuelKg <= 0;
    confirmBtn.style.opacity = !canAfford || fuelKg <= 0 ? '0.5' : '1';
    confirmBtn.style.cursor =
      !canAfford || fuelKg <= 0 ? 'not-allowed' : 'pointer';
  }

  // Action buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 1rem;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    flex: 1;
    padding: 0.75rem;
    background: #16213e;
    border: 1px solid #666;
    border-radius: 4px;
    color: #e0e0e0;
    cursor: pointer;
    font-size: 1rem;
  `;
  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.background = '#0f1729';
  });
  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.background = 'var(--bg-container)';
  });
  cancelBtn.addEventListener('click', () => {
    callbacks.onCancel();
    overlay.remove();
  });
  buttonContainer.appendChild(cancelBtn);

  confirmBtn.textContent = 'Purchase Fuel';
  confirmBtn.style.cssText = `
    flex: 2;
    padding: 0.75rem;
    background: #4a90e2;
    border: 1px solid #4a90e2;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
    font-size: 1rem;
    font-weight: bold;
  `;
  confirmBtn.addEventListener('mouseenter', () => {
    if (!confirmBtn.disabled) {
      confirmBtn.style.background = '#357abd';
    }
  });
  confirmBtn.addEventListener('mouseleave', () => {
    confirmBtn.style.background = '#4a90e2';
  });
  confirmBtn.addEventListener('click', () => {
    const fuelKg = Math.max(
      0,
      Math.min(maxPurchaseKg, parseInt(fuelInput.value) || 0)
    );
    if (fuelKg > 0) {
      callbacks.onConfirm(fuelKg);
      overlay.remove();
    }
  });
  buttonContainer.appendChild(confirmBtn);

  dialog.appendChild(buttonContainer);

  // Initial cost display
  updateCostDisplay();

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      callbacks.onCancel();
      overlay.remove();
    }
  });

  // Close on Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      callbacks.onCancel();
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  overlay.appendChild(dialog);
  return overlay;
}
