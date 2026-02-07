import type { GameData } from '../models';
import type { PlayingTab } from './renderer';
import { getShipClass } from '../shipClasses';
import { renderShipTab } from './shipTab';
import { renderCrewTab } from './crewTab';
import { renderWorkTab } from './workTab';
import { renderLogTab } from './logTab';
import { renderSettingsTab } from './settingsTab';
import { formatGameDate } from '../timeSystem';

export interface TabbedViewCallbacks {
  onReset: () => void;
  onTabChange: (tab: PlayingTab) => void;
  onCrewAssign: (crewId: string, roomId: string) => void;
  onCrewUnassign: (crewId: string, roomId: string) => void;
  onUndock: () => void;
  onDock: () => void;
  onEngineOn: () => void;
  onEngineOff: () => void;
  onToggleNavigation: () => void;
  onSelectCrew: (crewId: string) => void;
  onLevelUp: (crewId: string) => void;
  onAssignSkillPoint: (crewId: string, skillId: string) => void;
  onEquipItem: (crewId: string, itemId: string) => void;
  onUnequipItem: (crewId: string, itemId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onAdvanceDay: () => void;
  onDockAtNearestPort: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
}

export function renderTabbedView(
  gameData: GameData,
  activeTab: PlayingTab,
  showNavigation: boolean,
  callbacks: TabbedViewCallbacks,
  selectedCrewId?: string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tabbed-view';

  // Ship header
  container.appendChild(renderShipHeader(gameData));

  // Tab bar
  container.appendChild(renderTabBar(activeTab, callbacks));

  // Tab content
  if (activeTab === 'ship') {
    container.appendChild(renderShipTab(gameData, showNavigation, callbacks));
  } else if (activeTab === 'crew') {
    container.appendChild(renderCrewTab(gameData, selectedCrewId, callbacks));
  } else if (activeTab === 'work') {
    container.appendChild(
      renderWorkTab(gameData, {
        onAcceptQuest: callbacks.onAcceptQuest,
        onAdvanceDay: callbacks.onAdvanceDay,
        onDockAtNearestPort: callbacks.onDockAtNearestPort,
        onResumeContract: callbacks.onResumeContract,
        onAbandonContract: callbacks.onAbandonContract,
      })
    );
  } else if (activeTab === 'log') {
    container.appendChild(renderLogTab(gameData));
  } else {
    container.appendChild(renderSettingsTab(callbacks));
  }

  return container;
}

function renderShipHeader(gameData: GameData): HTMLElement {
  const header = document.createElement('div');
  header.className = 'ship-header';

  // Date display with tick counter
  const dateHeader = document.createElement('div');
  dateHeader.className = 'date-header-global';

  const dateText = document.createElement('span');
  dateText.textContent = formatGameDate(gameData.gameTime);
  dateHeader.appendChild(dateText);

  const tickCounter = document.createElement('span');
  tickCounter.className = 'tick-counter';
  const currentTick = Math.floor(gameData.gameTime / 1800); // 1 tick = 1800 seconds
  tickCounter.textContent = ` [tick: ${currentTick}]`;
  dateHeader.appendChild(tickCounter);

  header.appendChild(dateHeader);

  const shipName = document.createElement('h2');
  shipName.className = 'ship-name';
  shipName.textContent = gameData.ship.name;
  header.appendChild(shipName);

  const shipClass = getShipClass(gameData.ship.classId);
  const shipClassLabel = document.createElement('div');
  shipClassLabel.className = 'ship-class-label';
  shipClassLabel.textContent = `Class: ${shipClass?.name ?? gameData.ship.classId}`;
  header.appendChild(shipClassLabel);

  const captain = gameData.ship.crew.find((c) => c.isCaptain);
  if (captain) {
    const captainLabel = document.createElement('div');
    captainLabel.className = 'captain-label';
    captainLabel.textContent = `Captain ${captain.name}`;
    header.appendChild(captainLabel);
  }

  return header;
}

function renderTabBar(
  activeTab: PlayingTab,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';

  const shipTab = document.createElement('button');
  shipTab.className = activeTab === 'ship' ? 'tab-button active' : 'tab-button';
  shipTab.textContent = 'Ship';
  shipTab.addEventListener('click', () => callbacks.onTabChange('ship'));
  tabBar.appendChild(shipTab);

  const crewTab = document.createElement('button');
  crewTab.className = activeTab === 'crew' ? 'tab-button active' : 'tab-button';
  crewTab.textContent = 'Crew';
  crewTab.addEventListener('click', () => callbacks.onTabChange('crew'));
  tabBar.appendChild(crewTab);

  const workTab = document.createElement('button');
  workTab.className = activeTab === 'work' ? 'tab-button active' : 'tab-button';
  workTab.textContent = 'Work';
  workTab.addEventListener('click', () => callbacks.onTabChange('work'));
  tabBar.appendChild(workTab);

  const logTab = document.createElement('button');
  logTab.className = activeTab === 'log' ? 'tab-button active' : 'tab-button';
  logTab.textContent = 'Log';
  logTab.addEventListener('click', () => callbacks.onTabChange('log'));
  tabBar.appendChild(logTab);

  const settingsTab = document.createElement('button');
  settingsTab.className =
    activeTab === 'settings' ? 'tab-button active' : 'tab-button';
  settingsTab.textContent = 'Settings';
  settingsTab.addEventListener('click', () =>
    callbacks.onTabChange('settings')
  );
  tabBar.appendChild(settingsTab);

  return tabBar;
}
