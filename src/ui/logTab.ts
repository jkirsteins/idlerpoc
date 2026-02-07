import type { GameData, LogEntry } from '../models';
import { formatGameDateTime } from '../timeSystem';

export function renderLogTab(gameData: GameData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'log-tab';

  const heading = document.createElement('h3');
  heading.textContent = 'Event Log';
  container.appendChild(heading);

  const logList = document.createElement('div');
  logList.className = 'log-list';

  if (gameData.log.length === 0) {
    const noLogs = document.createElement('p');
    noLogs.className = 'no-logs';
    noLogs.textContent = 'No events yet.';
    logList.appendChild(noLogs);
  } else {
    // Reverse chronological order
    const reversedLog = [...gameData.log].reverse();

    for (const entry of reversedLog) {
      logList.appendChild(renderLogEntry(entry));
    }
  }

  container.appendChild(logList);

  return container;
}

function renderLogEntry(entry: LogEntry): HTMLElement {
  const entryDiv = document.createElement('div');
  entryDiv.className = `log-entry log-entry-${entry.type}`;

  const timestamp = document.createElement('span');
  timestamp.className = 'log-timestamp';
  timestamp.textContent = formatGameDateTime(entry.gameTime);
  entryDiv.appendChild(timestamp);

  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = entry.message;
  entryDiv.appendChild(message);

  return entryDiv;
}
