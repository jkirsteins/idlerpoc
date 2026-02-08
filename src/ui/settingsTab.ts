import type { GameData } from '../models';
import { SHIP_CLASSES } from '../shipClasses';

export interface SettingsTabCallbacks {
  onReset: () => void;
  onAutoPauseSettingChange?: (
    setting: keyof GameData['autoPauseSettings'],
    value: boolean
  ) => void;
}

export function renderSettingsTab(
  gameData: GameData,
  callbacks: SettingsTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'settings-tab';

  const title = document.createElement('h3');
  title.textContent = 'Settings';
  container.appendChild(title);

  // Stats Section
  const statsSection = document.createElement('div');
  statsSection.className = 'settings-section';

  const statsTitle = document.createElement('h4');
  statsTitle.textContent = 'Statistics';
  statsTitle.style.marginBottom = '1rem';
  statsTitle.style.color = '#4a9eff';
  statsSection.appendChild(statsTitle);

  // Lifetime Credits
  const lifetimeCredits = document.createElement('div');
  lifetimeCredits.className = 'stat-row';
  lifetimeCredits.innerHTML = `
    <span class="stat-label">Lifetime Credits Earned:</span>
    <span class="stat-value">${gameData.lifetimeCreditsEarned.toLocaleString()} cr</span>
  `;
  statsSection.appendChild(lifetimeCredits);

  // Current Credits
  const currentCredits = document.createElement('div');
  currentCredits.className = 'stat-row';
  currentCredits.innerHTML = `
    <span class="stat-label">Current Credits:</span>
    <span class="stat-value">${Math.round(gameData.credits).toLocaleString()} cr</span>
  `;
  statsSection.appendChild(currentCredits);

  // Ship Unlock Progress
  const nextUnlock = findNextShipUnlock(gameData.lifetimeCreditsEarned);
  if (nextUnlock) {
    const progress =
      (gameData.lifetimeCreditsEarned / nextUnlock.threshold) * 100;
    const remaining = nextUnlock.threshold - gameData.lifetimeCreditsEarned;

    const unlockDiv = document.createElement('div');
    unlockDiv.className = 'stat-row';
    unlockDiv.style.marginTop = '1rem';
    unlockDiv.innerHTML = `
      <span class="stat-label">Next Ship Unlock (${nextUnlock.shipName}):</span>
      <span class="stat-value">${remaining.toLocaleString()} cr remaining</span>
    `;
    statsSection.appendChild(unlockDiv);

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'unlock-progress-bar';
    progressBar.style.width = '100%';
    progressBar.style.height = '8px';
    progressBar.style.background = 'rgba(255, 255, 255, 0.1)';
    progressBar.style.borderRadius = '4px';
    progressBar.style.marginTop = '0.5rem';
    progressBar.style.overflow = 'hidden';

    const progressFill = document.createElement('div');
    progressFill.style.width = `${Math.min(100, progress)}%`;
    progressFill.style.height = '100%';
    progressFill.style.background = '#4a9eff';
    progressFill.style.transition = 'width 0.3s ease';
    progressBar.appendChild(progressFill);

    statsSection.appendChild(progressBar);
  }

  // Encounter Stats
  const encounterTitle = document.createElement('div');
  encounterTitle.style.marginTop = '1.5rem';
  encounterTitle.style.marginBottom = '0.5rem';
  encounterTitle.style.fontWeight = 'bold';
  encounterTitle.style.color = '#aaa';
  encounterTitle.textContent = 'Encounters:';
  statsSection.appendChild(encounterTitle);

  const stats = gameData.encounterStats || {
    totalEncounters: 0,
    evaded: 0,
    negotiated: 0,
    victories: 0,
    harassments: 0,
    boardings: 0,
  };
  const encounterStats = [
    { label: 'Total', value: stats.totalEncounters },
    { label: 'Evaded', value: stats.evaded, color: '#4ade80' },
    { label: 'Negotiated', value: stats.negotiated, color: '#fbbf24' },
    { label: 'Victories', value: stats.victories, color: '#60a5fa' },
    { label: 'Harassments', value: stats.harassments, color: '#fb923c' },
    { label: 'Boardings', value: stats.boardings, color: '#ef4444' },
  ];

  for (const stat of encounterStats) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span class="stat-label">${stat.label}:</span>
      <span class="stat-value" style="color: ${stat.color || '#fff'}">${stat.value}</span>
    `;
    statsSection.appendChild(row);
  }

  container.appendChild(statsSection);

  // Auto-Pause Settings Section
  const autoPauseSection = document.createElement('div');
  autoPauseSection.className = 'settings-section';
  autoPauseSection.style.marginTop = '2rem';

  const autoPauseTitle = document.createElement('h4');
  autoPauseTitle.textContent = 'Auto-Pause Settings';
  autoPauseTitle.style.marginBottom = '1rem';
  autoPauseTitle.style.color = '#4a9eff';
  autoPauseSection.appendChild(autoPauseTitle);

  const autoPauseDesc = document.createElement('p');
  autoPauseDesc.textContent =
    'Automatically pause the game when certain events occur:';
  autoPauseDesc.className = 'settings-description';
  autoPauseDesc.style.marginBottom = '1rem';
  autoPauseSection.appendChild(autoPauseDesc);

  // Auto-pause checkboxes
  const pauseSettings = [
    {
      key: 'onArrival' as const,
      label: 'Pause on ship arrival',
      description: 'Pause when any ship arrives at a destination',
    },
    {
      key: 'onContractComplete' as const,
      label: 'Pause on contract completion',
      description: 'Pause when contracts or trips are completed',
    },
    {
      key: 'onCriticalAlert' as const,
      label: 'Pause on critical alerts',
      description: 'Pause when critical situations occur',
    },
    {
      key: 'onLowFuel' as const,
      label: 'Pause on low fuel',
      description: 'Pause when fuel drops below 10%',
    },
  ];

  for (const setting of pauseSettings) {
    const row = document.createElement('div');
    row.style.marginBottom = '0.75rem';

    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'flex-start';
    label.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = gameData.autoPauseSettings[setting.key];
    checkbox.style.marginTop = '2px';
    checkbox.style.marginRight = '0.5rem';
    checkbox.addEventListener('change', () => {
      if (callbacks.onAutoPauseSettingChange) {
        callbacks.onAutoPauseSettingChange(setting.key, checkbox.checked);
      }
    });

    const textDiv = document.createElement('div');
    const labelText = document.createElement('div');
    labelText.textContent = setting.label;
    labelText.style.fontWeight = '500';
    labelText.style.color = '#fff';
    textDiv.appendChild(labelText);

    const descText = document.createElement('div');
    descText.textContent = setting.description;
    descText.style.fontSize = '12px';
    descText.style.color = '#aaa';
    descText.style.marginTop = '2px';
    textDiv.appendChild(descText);

    label.appendChild(checkbox);
    label.appendChild(textDiv);
    row.appendChild(label);
    autoPauseSection.appendChild(row);
  }

  container.appendChild(autoPauseSection);

  // Reset Section
  const resetSection = document.createElement('div');
  resetSection.className = 'settings-section';
  resetSection.style.marginTop = '2rem';

  const description = document.createElement('p');
  description.textContent =
    'Reset your game and return to the beginning. All progress will be lost.';
  description.className = 'settings-description';
  resetSection.appendChild(description);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'danger';
  resetBtn.textContent = 'Reset Game';
  resetBtn.addEventListener('click', () => {
    if (
      confirm(
        'Are you sure you want to reset your game? All progress will be lost.'
      )
    ) {
      callbacks.onReset();
    }
  });
  resetSection.appendChild(resetBtn);

  container.appendChild(resetSection);

  return container;
}

/**
 * Find the next ship unlock threshold.
 */
function findNextShipUnlock(lifetimeCredits: number): {
  shipName: string;
  threshold: number;
} | null {
  const lockedShips = SHIP_CLASSES.filter(
    (sc) => sc.unlockThreshold > lifetimeCredits
  ).sort((a, b) => a.unlockThreshold - b.unlockThreshold);

  if (lockedShips.length === 0) return null;

  const nextShip = lockedShips[0];
  return {
    shipName: nextShip.name,
    threshold: nextShip.unlockThreshold,
  };
}
