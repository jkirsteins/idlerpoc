import type { GameData } from '../models';
import { SHIP_CLASSES } from '../shipClasses';

export interface SettingsTabCallbacks {
  onReset: () => void;
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
