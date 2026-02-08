import type { GameData, LogEntry, LogEntryType } from '../models';
import { formatGameDateTime } from '../timeSystem';

type LogFilter = 'all' | 'combat' | 'financial' | 'navigation' | 'crew';

export function renderLogTab(gameData: GameData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'log-tab';

  const heading = document.createElement('h3');
  heading.textContent = 'Event Log';
  container.appendChild(heading);

  // Filter state
  let currentFilter: LogFilter = 'all';

  // Filter buttons
  const filterBar = document.createElement('div');
  filterBar.className = 'log-filter-bar';
  filterBar.style.display = 'flex';
  filterBar.style.gap = '0.5rem';
  filterBar.style.marginBottom = '1rem';
  filterBar.style.flexWrap = 'wrap';

  const filters: LogFilter[] = [
    'all',
    'combat',
    'financial',
    'navigation',
    'crew',
  ];
  const filterButtons: Partial<Record<LogFilter, HTMLButtonElement>> = {};

  const updateLogDisplay = () => {
    // Clear log list
    logList.innerHTML = '';

    if (gameData.log.length === 0) {
      const noLogs = document.createElement('p');
      noLogs.className = 'no-logs';
      noLogs.textContent = 'No events yet.';
      logList.appendChild(noLogs);
      return;
    }

    // Filter and display logs
    const reversedLog = [...gameData.log].reverse();
    const filtered = reversedLog.filter((entry) =>
      matchesFilter(entry.type, currentFilter)
    );

    if (filtered.length === 0) {
      const noLogs = document.createElement('p');
      noLogs.className = 'no-logs';
      noLogs.textContent = `No ${currentFilter} events.`;
      logList.appendChild(noLogs);
      return;
    }

    for (const entry of filtered) {
      logList.appendChild(renderLogEntry(entry));
    }
  };

  for (const filter of filters) {
    const btn = document.createElement('button');
    btn.className =
      filter === currentFilter ? 'filter-btn active' : 'filter-btn';
    btn.textContent = filter.charAt(0).toUpperCase() + filter.slice(1);
    btn.style.padding = '0.4rem 0.8rem';
    btn.style.fontSize = '0.85rem';
    btn.addEventListener('click', () => {
      currentFilter = filter;
      // Update button states
      for (const f of filters) {
        const btn = filterButtons[f];
        if (btn) {
          btn.className =
            f === currentFilter ? 'filter-btn active' : 'filter-btn';
        }
      }
      updateLogDisplay();
    });
    filterButtons[filter] = btn;
    filterBar.appendChild(btn);
  }

  container.appendChild(filterBar);

  const logList = document.createElement('div');
  logList.className = 'log-list';

  updateLogDisplay();

  container.appendChild(logList);

  return container;
}

/**
 * Check if a log entry type matches the current filter.
 */
function matchesFilter(type: LogEntryType, filter: LogFilter): boolean {
  if (filter === 'all') return true;

  const combatTypes: LogEntryType[] = [
    'encounter_evaded',
    'encounter_negotiated',
    'encounter_victory',
    'encounter_harassment',
    'encounter_boarding',
  ];

  const financialTypes: LogEntryType[] = [
    'payment',
    'salary_paid',
    'equipment_bought',
    'equipment_sold',
    'refueled',
  ];

  const navigationTypes: LogEntryType[] = [
    'departure',
    'arrival',
    'trip_complete',
    'contract_accepted',
    'contract_complete',
    'contract_abandoned',
  ];

  const crewTypes: LogEntryType[] = [
    'crew_hired',
    'crew_departed',
    'crew_level_up',
    'crew_role_change',
  ];

  switch (filter) {
    case 'combat':
      return combatTypes.includes(type);
    case 'financial':
      return financialTypes.includes(type);
    case 'navigation':
      return navigationTypes.includes(type);
    case 'crew':
      return crewTypes.includes(type);
    default:
      return true;
  }
}

function renderLogEntry(entry: LogEntry): HTMLElement {
  const entryDiv = document.createElement('div');
  entryDiv.className = `log-entry log-entry-${entry.type}`;

  const timestamp = document.createElement('span');
  timestamp.className = 'log-timestamp';
  timestamp.textContent = formatGameDateTime(entry.gameTime);
  entryDiv.appendChild(timestamp);

  if (entry.shipName) {
    const shipPrefix = document.createElement('span');
    shipPrefix.className = 'log-ship-name';
    shipPrefix.textContent = `[${entry.shipName}] `;
    shipPrefix.style.color = '#4a9eff';
    shipPrefix.style.fontWeight = 'bold';
    entryDiv.appendChild(shipPrefix);
  }

  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = entry.message;
  entryDiv.appendChild(message);

  return entryDiv;
}
