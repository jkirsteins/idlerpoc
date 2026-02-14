import type { GameData, LogEntry, LogEntryType } from '../models';
import { formatLogTimestamp } from '../formatting';
import { MAX_LOG_ENTRIES } from '../logSystem';
import type { Component } from './component';

type LogFilter = 'all' | 'combat' | 'financial' | 'navigation' | 'crew';

const FILTERS: LogFilter[] = [
  'all',
  'combat',
  'financial',
  'navigation',
  'crew',
];

export function createLogTab(gameData: GameData): Component {
  const container = document.createElement('div');
  container.className = 'log-tab';

  // --- persistent state ---
  let currentFilter: LogFilter = 'all';
  let currentShipFilter: string = 'all';
  let lastLogLength = -1;
  let lastFilter: LogFilter | null = null;
  let lastShipFilter: string | null = null;
  let latestGameData: GameData = gameData;

  // --- build DOM once ---
  const heading = document.createElement('h3');
  heading.textContent = 'Event Log';
  container.appendChild(heading);

  // Filter bar (created once, classes toggled in-place)
  const filterBar = document.createElement('div');
  filterBar.className = 'log-filter-bar';
  filterBar.style.display = 'flex';
  filterBar.style.gap = '0.5rem';
  filterBar.style.marginBottom = '1rem';
  filterBar.style.flexWrap = 'wrap';

  const filterButtons: Record<LogFilter, HTMLButtonElement> = {} as Record<
    LogFilter,
    HTMLButtonElement
  >;

  for (const filter of FILTERS) {
    const btn = document.createElement('button');
    btn.className =
      filter === currentFilter ? 'filter-btn active' : 'filter-btn';
    btn.textContent = filter.charAt(0).toUpperCase() + filter.slice(1);
    btn.style.padding = '0.4rem 0.8rem';
    btn.style.fontSize = '0.85rem';
    btn.addEventListener('click', () => {
      currentFilter = filter;
      syncFilterButtons();
      updateLogDisplay(latestGameData);
    });
    filterButtons[filter] = btn;
    filterBar.appendChild(btn);
  }

  // Ship filter section separator
  const shipFilterLabel = document.createElement('span');
  shipFilterLabel.textContent = '|  Ship:';
  shipFilterLabel.style.marginLeft = '0.5rem';
  shipFilterLabel.style.color = '#888';
  filterBar.appendChild(shipFilterLabel);

  // Ship filter dropdown and buttons
  const shipFilterContainer = document.createElement('div');
  shipFilterContainer.style.display = 'flex';
  shipFilterContainer.style.gap = '0.5rem';
  shipFilterContainer.style.flexWrap = 'wrap';
  const shipFilterButtons: Record<string, HTMLButtonElement> = {};

  container.appendChild(filterBar);

  // Scrollable log list (created once so scroll position persists)
  const logList = document.createElement('div');
  logList.className = 'log-list';
  container.appendChild(logList);

  // --- helpers ---

  function getUniqueShips(gd: GameData): string[] {
    const shipNames = new Set<string>();
    for (const entry of gd.log) {
      if (entry.shipName) {
        shipNames.add(entry.shipName);
      }
    }
    return Array.from(shipNames).sort();
  }

  function syncFilterButtons() {
    for (const f of FILTERS) {
      filterButtons[f].className =
        f === currentFilter ? 'filter-btn active' : 'filter-btn';
    }
  }

  function syncShipFilterButtons() {
    for (const shipName in shipFilterButtons) {
      shipFilterButtons[shipName].className =
        shipName === currentShipFilter ? 'filter-btn active' : 'filter-btn';
    }
    // Sync "All Ships" button
    const allShipsBtn = shipFilterButtons['all'];
    if (allShipsBtn) {
      allShipsBtn.className =
        currentShipFilter === 'all' ? 'filter-btn active' : 'filter-btn';
    }
  }

  function recreateShipFilterButtons(gd: GameData) {
    // Clear old buttons
    for (const shipName in shipFilterButtons) {
      shipFilterButtons[shipName].remove();
    }
    shipFilterContainer.innerHTML = '';
    Object.keys(shipFilterButtons).forEach(
      (key) => delete shipFilterButtons[key]
    );

    // Create "All Ships" button
    const allBtn = document.createElement('button');
    allBtn.className =
      currentShipFilter === 'all' ? 'filter-btn active' : 'filter-btn';
    allBtn.textContent = 'All Ships';
    allBtn.style.padding = '0.4rem 0.8rem';
    allBtn.style.fontSize = '0.85rem';
    allBtn.addEventListener('click', () => {
      currentShipFilter = 'all';
      syncShipFilterButtons();
      updateLogDisplay(latestGameData);
    });
    shipFilterButtons['all'] = allBtn;
    shipFilterContainer.appendChild(allBtn);

    // Create ship-specific buttons
    const ships = getUniqueShips(gd);
    for (const ship of ships) {
      const btn = document.createElement('button');
      btn.className =
        ship === currentShipFilter ? 'filter-btn active' : 'filter-btn';
      btn.textContent = ship;
      btn.style.padding = '0.4rem 0.8rem';
      btn.style.fontSize = '0.85rem';
      btn.addEventListener('click', () => {
        currentShipFilter = ship;
        syncShipFilterButtons();
        updateLogDisplay(latestGameData);
      });
      shipFilterButtons[ship] = btn;
      shipFilterContainer.appendChild(btn);
    }
  }

  // Stable "no logs" message and cap note, toggled via display
  const noLogsMsg = document.createElement('p');
  noLogsMsg.className = 'no-logs';
  noLogsMsg.style.display = 'none';
  logList.appendChild(noLogsMsg);

  const capNote = document.createElement('p');
  capNote.className = 'log-cap-note';
  capNote.style.color = '#888';
  capNote.style.fontSize = '0.8rem';
  capNote.style.fontStyle = 'italic';
  capNote.style.textAlign = 'center';
  capNote.style.marginTop = '0.5rem';
  capNote.textContent = `Only the last ${MAX_LOG_ENTRIES} events are kept. Older entries are no longer available.`;
  capNote.style.display = 'none';
  logList.appendChild(capNote);

  // Rendered entry elements keyed by log index (entries are immutable once added)
  const renderedEntries: HTMLElement[] = [];

  function updateLogDisplay(gd: GameData) {
    // Ensure we have rendered elements for all log entries
    while (renderedEntries.length < gd.log.length) {
      const idx = renderedEntries.length;
      const el = renderLogEntry(gd.log[idx]);
      renderedEntries.push(el);
      // Insert before the cap note (which stays at the end)
      logList.insertBefore(el, capNote);
    }

    // Handle log pruning: if log shrank, remove excess rendered entries
    while (renderedEntries.length > gd.log.length) {
      const el = renderedEntries.pop()!;
      el.remove();
    }

    // Apply filter: show/hide each entry and re-order (newest first via CSS)
    const reversedLog = [...gd.log].reverse();
    const filteredSet = new Set(
      reversedLog
        .filter((entry) =>
          matchesFilter(
            entry.type,
            currentFilter,
            entry.shipName,
            currentShipFilter
          )
        )
        .map((_, i) => gd.log.length - 1 - i)
    );

    let visibleCount = 0;
    for (let i = 0; i < renderedEntries.length; i++) {
      const visible = filteredSet.has(i);
      renderedEntries[i].style.display = visible ? '' : 'none';
      // Use CSS order for reverse display (newest first)
      renderedEntries[i].style.order = String(gd.log.length - i);
      if (visible) visibleCount++;
    }

    // Toggle "no logs" message
    if (gd.log.length === 0) {
      noLogsMsg.textContent = 'No events yet.';
      noLogsMsg.style.display = '';
    } else if (visibleCount === 0) {
      let filterDesc =
        currentFilter === 'all' ? 'events' : `${currentFilter} events`;
      if (currentShipFilter !== 'all') {
        filterDesc += ` from ${currentShipFilter}`;
      }
      noLogsMsg.textContent = `No ${filterDesc}.`;
      noLogsMsg.style.display = '';
    } else {
      noLogsMsg.style.display = 'none';
    }

    // Toggle cap note
    capNote.style.display = gd.log.length >= MAX_LOG_ENTRIES ? '' : 'none';
  }

  // --- update (called every tick) ---

  function update(gameData: GameData) {
    latestGameData = gameData;

    // Recreate ship filter buttons if ships changed
    const currentShips = getUniqueShips(gameData);
    const existingShipButtons = Object.keys(shipFilterButtons).filter(
      (k) => k !== 'all'
    );
    const shipsChanged =
      currentShips.length !== existingShipButtons.length ||
      !currentShips.every((s) => shipFilterButtons[s]);

    if (shipsChanged) {
      recreateShipFilterButtons(gameData);
    }

    // Shallow-compare: log is append-only, so length is sufficient.
    // Also re-render when the active filter changes (driven by button click).
    if (
      gameData.log.length === lastLogLength &&
      currentFilter === lastFilter &&
      currentShipFilter === lastShipFilter
    ) {
      return;
    }
    lastLogLength = gameData.log.length;
    lastFilter = currentFilter;
    lastShipFilter = currentShipFilter;

    updateLogDisplay(gameData);
  }

  // Initial render
  update(gameData);
  filterBar.appendChild(shipFilterContainer);

  return { el: container, update };
}

/**
 * Check if a log entry matches both type and ship filters.
 */
function matchesFilter(
  type: LogEntryType,
  typeFilter: LogFilter,
  shipName: string | undefined,
  shipFilter: string
): boolean {
  // Check ship filter first
  if (shipFilter !== 'all' && shipName !== shipFilter) {
    return false;
  }

  // Check type filter
  if (typeFilter === 'all') return true;

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
    'contract_expired',
  ];

  const crewTypes: LogEntryType[] = [
    'crew_hired',
    'crew_departed',
    'crew_death',
    'crew_level_up',
    'crew_role_change',
  ];

  switch (typeFilter) {
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
  timestamp.textContent = formatLogTimestamp(entry.realTime, entry.gameTime);
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
