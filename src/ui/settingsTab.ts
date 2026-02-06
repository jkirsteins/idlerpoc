export interface SettingsTabCallbacks {
  onReset: () => void;
}

export function renderSettingsTab(
  callbacks: SettingsTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'settings-tab';

  const title = document.createElement('h3');
  title.textContent = 'Settings';
  container.appendChild(title);

  const section = document.createElement('div');
  section.className = 'settings-section';

  const description = document.createElement('p');
  description.textContent =
    'Reset your game and return to the beginning. All progress will be lost.';
  description.className = 'settings-description';
  section.appendChild(description);

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
  section.appendChild(resetBtn);

  container.appendChild(section);

  return container;
}
