import type { GameData } from '../models';
import { SHIP_CLASSES } from '../shipClasses';
import type { Component } from './component';

export interface SettingsTabCallbacks {
  onReset: () => void;
  onAutoPauseSettingChange?: (
    setting: keyof GameData['autoPauseSettings'],
    value: boolean
  ) => void;
  onImportState?: (json: string) => void;
}

export function createSettingsTab(
  gameData: GameData,
  callbacks: SettingsTabCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'settings-tab';

  // ── Title ──
  const title = document.createElement('h3');
  title.textContent = 'Settings';
  container.appendChild(title);

  // ── Stats Section ──
  const statsSection = document.createElement('div');
  statsSection.className = 'settings-section';

  const statsTitle = document.createElement('h4');
  statsTitle.textContent = 'Statistics';
  statsTitle.style.marginBottom = '1rem';
  statsTitle.style.color = '#4a9eff';
  statsSection.appendChild(statsTitle);

  // Lifetime Credits row
  const lifetimeCreditsRow = document.createElement('div');
  lifetimeCreditsRow.className = 'stat-row';
  const lifetimeCreditsLabel = document.createElement('span');
  lifetimeCreditsLabel.className = 'stat-label';
  lifetimeCreditsLabel.textContent = 'Lifetime Credits Earned:';
  const lifetimeCreditsValue = document.createElement('span');
  lifetimeCreditsValue.className = 'stat-value';
  lifetimeCreditsRow.appendChild(lifetimeCreditsLabel);
  lifetimeCreditsRow.appendChild(lifetimeCreditsValue);
  statsSection.appendChild(lifetimeCreditsRow);

  // Current Credits row
  const currentCreditsRow = document.createElement('div');
  currentCreditsRow.className = 'stat-row';
  const currentCreditsLabel = document.createElement('span');
  currentCreditsLabel.className = 'stat-label';
  currentCreditsLabel.textContent = 'Current Credits:';
  const currentCreditsValue = document.createElement('span');
  currentCreditsValue.className = 'stat-value';
  currentCreditsRow.appendChild(currentCreditsLabel);
  currentCreditsRow.appendChild(currentCreditsValue);
  statsSection.appendChild(currentCreditsRow);

  // Ship Unlock Progress row (always exists, toggled via display)
  const unlockRow = document.createElement('div');
  unlockRow.className = 'stat-row';
  unlockRow.style.marginTop = '1rem';
  const unlockLabel = document.createElement('span');
  unlockLabel.className = 'stat-label';
  const unlockValue = document.createElement('span');
  unlockValue.className = 'stat-value';
  unlockRow.appendChild(unlockLabel);
  unlockRow.appendChild(unlockValue);
  statsSection.appendChild(unlockRow);

  // Progress bar (always exists, toggled via display)
  const progressBar = document.createElement('div');
  progressBar.className = 'unlock-progress-bar';
  progressBar.style.width = '100%';
  progressBar.style.height = '8px';
  progressBar.style.background = 'rgba(255, 255, 255, 0.1)';
  progressBar.style.borderRadius = '4px';
  progressBar.style.marginTop = '0.5rem';
  progressBar.style.overflow = 'hidden';

  const progressFill = document.createElement('div');
  progressFill.style.height = '100%';
  progressFill.style.background = '#4a9eff';
  progressFill.style.transition = 'width 0.3s ease';
  progressBar.appendChild(progressFill);
  statsSection.appendChild(progressBar);

  // Encounter Stats heading
  const encounterTitle = document.createElement('div');
  encounterTitle.style.marginTop = '1.5rem';
  encounterTitle.style.marginBottom = '0.5rem';
  encounterTitle.style.fontWeight = 'bold';
  encounterTitle.style.color = '#aaa';
  encounterTitle.textContent = 'Encounters:';
  statsSection.appendChild(encounterTitle);

  // Encounter stat rows — create all 6 once, keep refs to value spans
  const encounterStatDefs = [
    { label: 'Total', color: '#fff' },
    { label: 'Evaded', color: '#4ade80' },
    { label: 'Negotiated', color: '#fbbf24' },
    { label: 'Victories', color: '#60a5fa' },
    { label: 'Harassments', color: '#fb923c' },
    { label: 'Boardings', color: '#ef4444' },
  ] as const;

  const encounterValueRefs: HTMLSpanElement[] = [];

  for (const def of encounterStatDefs) {
    const row = document.createElement('div');
    row.className = 'stat-row';

    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = `${def.label}:`;

    const value = document.createElement('span');
    value.className = 'stat-value';
    value.style.color = def.color;

    row.appendChild(label);
    row.appendChild(value);
    statsSection.appendChild(row);
    encounterValueRefs.push(value);
  }

  container.appendChild(statsSection);

  // ── Auto-Pause Settings Section ──
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

  const pauseSettingDefs = [
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

  const checkboxRefs: {
    key: keyof GameData['autoPauseSettings'];
    checkbox: HTMLInputElement;
  }[] = [];

  for (const setting of pauseSettingDefs) {
    const row = document.createElement('div');
    row.style.marginBottom = '0.75rem';

    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'flex-start';
    label.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
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

    checkboxRefs.push({ key: setting.key, checkbox });
  }

  container.appendChild(autoPauseSection);

  // ── Reference to latest gameData for download ──
  let latestGameData: GameData = gameData;

  // ── Debug Section (static — download/upload state) ──
  const debugSection = document.createElement('div');
  debugSection.className = 'settings-section';
  debugSection.style.marginTop = '2rem';

  const debugTitle = document.createElement('h4');
  debugTitle.style.marginBottom = '1rem';
  debugTitle.style.color = '#4a9eff';

  const debugTitleText = document.createElement('span');
  debugTitleText.textContent = 'State Backup';
  debugTitle.appendChild(debugTitleText);

  const debugBadge = document.createElement('span');
  debugBadge.textContent = 'DEBUG';
  debugBadge.style.marginLeft = '0.5rem';
  debugBadge.style.fontSize = '10px';
  debugBadge.style.padding = '2px 6px';
  debugBadge.style.borderRadius = '4px';
  debugBadge.style.background = 'rgba(251, 191, 36, 0.2)';
  debugBadge.style.color = '#fbbf24';
  debugBadge.style.fontWeight = '600';
  debugBadge.style.verticalAlign = 'middle';
  debugTitle.appendChild(debugBadge);
  debugSection.appendChild(debugTitle);

  const debugDesc = document.createElement('p');
  debugDesc.textContent =
    'Download your game state as a JSON file for backup, or upload a previously saved file to restore.';
  debugDesc.className = 'settings-description';
  debugDesc.style.marginBottom = '1rem';
  debugSection.appendChild(debugDesc);

  const debugBtnRow = document.createElement('div');
  debugBtnRow.style.display = 'flex';
  debugBtnRow.style.gap = '0.75rem';
  debugBtnRow.style.flexWrap = 'wrap';

  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download State';
  downloadBtn.addEventListener('click', () => {
    const json = JSON.stringify(latestGameData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `starship-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  debugBtnRow.appendChild(downloadBtn);

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload State';
  uploadBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        if (
          confirm(
            'Are you sure you want to replace your current game state? ' +
              'Your existing progress will be overwritten.'
          )
        ) {
          callbacks.onImportState?.(text);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });
  debugBtnRow.appendChild(uploadBtn);

  debugSection.appendChild(debugBtnRow);

  const importStatus = document.createElement('p');
  importStatus.style.marginTop = '0.5rem';
  importStatus.style.fontSize = '12px';
  importStatus.style.display = 'none';
  debugSection.appendChild(importStatus);

  container.appendChild(debugSection);

  // ── Reset Section (static — never changes) ──
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

  // ── Snapshot for shallow-compare ──
  let prevLifetimeCredits = -1;
  let prevCurrentCredits = -1;
  let prevUnlockShipName = '';
  let prevUnlockThreshold = -1;
  let prevEncTotal = -1;
  let prevEncEvaded = -1;
  let prevEncNegotiated = -1;
  let prevEncVictories = -1;
  let prevEncHarassments = -1;
  let prevEncBoardings = -1;
  let prevAutoPauseOnArrival = false;
  let prevAutoPauseOnContractComplete = false;
  let prevAutoPauseOnCriticalAlert = false;
  let prevAutoPauseOnLowFuel = false;

  function update(gameData: GameData): void {
    latestGameData = gameData;

    // Lifetime credits
    const ltc = gameData.lifetimeCreditsEarned;
    if (ltc !== prevLifetimeCredits) {
      lifetimeCreditsValue.textContent = `${ltc.toLocaleString()} cr`;
      prevLifetimeCredits = ltc;
    }

    // Current credits
    const cc = Math.round(gameData.credits);
    if (cc !== prevCurrentCredits) {
      currentCreditsValue.textContent = `${cc.toLocaleString()} cr`;
      prevCurrentCredits = cc;
    }

    // Ship unlock progress
    const nextUnlock = findNextShipUnlock(ltc);
    if (nextUnlock) {
      const shipName = nextUnlock.shipName;
      const threshold = nextUnlock.threshold;

      if (
        shipName !== prevUnlockShipName ||
        threshold !== prevUnlockThreshold
      ) {
        unlockLabel.textContent = `Next Ship Unlock (${shipName}):`;
        prevUnlockShipName = shipName;
        prevUnlockThreshold = threshold;
      }

      const remaining = threshold - ltc;
      unlockValue.textContent = `${remaining.toLocaleString()} cr remaining`;

      const progress = (ltc / threshold) * 100;
      progressFill.style.width = `${Math.min(100, progress)}%`;

      unlockRow.style.opacity = '';
      progressBar.style.opacity = '';
    } else {
      if (prevUnlockShipName !== '' || prevUnlockThreshold !== -1) {
        unlockLabel.textContent = 'Ship Unlocks:';
        prevUnlockShipName = '';
        prevUnlockThreshold = -1;
      }
      unlockValue.textContent = 'All ships unlocked!';
      progressFill.style.width = '100%';
      unlockRow.style.opacity = '0.4';
      progressBar.style.opacity = '0.4';
    }

    // Encounter stats
    const stats = gameData.encounterStats || {
      totalEncounters: 0,
      evaded: 0,
      negotiated: 0,
      victories: 0,
      harassments: 0,
      boardings: 0,
    };

    const encounterValues = [
      stats.totalEncounters,
      stats.evaded,
      stats.negotiated,
      stats.victories,
      stats.harassments,
      stats.boardings,
    ];

    const prevEncValues = [
      prevEncTotal,
      prevEncEvaded,
      prevEncNegotiated,
      prevEncVictories,
      prevEncHarassments,
      prevEncBoardings,
    ];

    for (let i = 0; i < encounterValues.length; i++) {
      if (encounterValues[i] !== prevEncValues[i]) {
        encounterValueRefs[i].textContent = String(encounterValues[i]);
      }
    }

    prevEncTotal = stats.totalEncounters;
    prevEncEvaded = stats.evaded;
    prevEncNegotiated = stats.negotiated;
    prevEncVictories = stats.victories;
    prevEncHarassments = stats.harassments;
    prevEncBoardings = stats.boardings;

    // Auto-pause checkboxes
    const apSettings = gameData.autoPauseSettings;
    const currentApValues = [
      apSettings.onArrival,
      apSettings.onContractComplete,
      apSettings.onCriticalAlert,
      apSettings.onLowFuel,
    ];
    const prevApValues = [
      prevAutoPauseOnArrival,
      prevAutoPauseOnContractComplete,
      prevAutoPauseOnCriticalAlert,
      prevAutoPauseOnLowFuel,
    ];

    for (let i = 0; i < checkboxRefs.length; i++) {
      if (currentApValues[i] !== prevApValues[i]) {
        checkboxRefs[i].checkbox.checked = currentApValues[i];
      }
    }

    prevAutoPauseOnArrival = apSettings.onArrival;
    prevAutoPauseOnContractComplete = apSettings.onContractComplete;
    prevAutoPauseOnCriticalAlert = apSettings.onCriticalAlert;
    prevAutoPauseOnLowFuel = apSettings.onLowFuel;
  }

  // Initial render
  update(gameData);

  return { el: container, update };
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
