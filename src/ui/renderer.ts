// Swarm Game Renderer

import type { GameData } from '../models/swarmTypes';
import { calculateSwarmAggregates } from '../swarmSystem';

// ============================================================================
// TYPES
// ============================================================================

export interface RendererCallbacks {
  onTogglePause: () => void;
  onSetTimeSpeed: (speed: 1 | 2 | 5) => void;
  onSetQueenDirective: (directive: 'gather_biomass' | 'idle') => void;
  onToggleEggProduction: (enabled: boolean) => void;
  onExportSave: () => string;
  onImportSave: (saveData: string) => boolean;
  onResetGame: () => void;
}

export interface GameState {
  gameData: GameData;
  activeTab: 'swarm' | 'planet' | 'system' | 'log';
}

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

export function render(
  container: HTMLElement,
  gameData: GameData,
  callbacks: RendererCallbacks
): void {
  const state: GameState = {
    gameData,
    activeTab: 'swarm',
  };

  // Clear container
  container.innerHTML = '';

  // Create main layout
  const layout = document.createElement('div');
  layout.className = 'swarm-layout';
  layout.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0a0a0f;
    color: #e0e0e0;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  // Header
  layout.appendChild(createHeader(gameData, callbacks));

  // Main content area
  const content = document.createElement('div');
  content.className = 'swarm-content';
  content.style.cssText = `
    display: flex;
    flex: 1;
    overflow: hidden;
  `;

  // Left sidebar - Swarm status
  content.appendChild(createSwarmSidebar(gameData));

  // Main panel - Active tab
  content.appendChild(createMainPanel(state, callbacks));

  // Right sidebar - System view mini
  content.appendChild(createSystemSidebar(gameData));

  layout.appendChild(content);

  // Footer - Controls
  layout.appendChild(createFooter(gameData, callbacks));

  container.appendChild(layout);
}

// ============================================================================
// HEADER
// ============================================================================

function createHeader(
  gameData: GameData,
  callbacks: RendererCallbacks
): HTMLElement {
  const header = document.createElement('header');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #12121a;
    border-bottom: 1px solid #2a2a3a;
  `;

  // Title
  const title = document.createElement('h1');
  title.textContent = 'TRAPPIST-1 Swarm';
  title.style.cssText = `
    margin: 0;
    font-size: 1.25rem;
    color: #64ffda;
  `;
  header.appendChild(title);

  // Game info
  const info = document.createElement('div');
  info.style.cssText = `
    display: flex;
    gap: 1.5rem;
    font-size: 0.9rem;
  `;

  const day = Math.floor(gameData.gameTime / 480);
  info.innerHTML = `
    <span>Day ${day}</span>
    <span style="color: ${gameData.isPaused ? '#ff6b6b' : '#69f0ae'}">${gameData.isPaused ? 'PAUSED' : 'RUNNING'}</span>
  `;
  header.appendChild(info);

  // Settings button
  const settingsBtn = document.createElement('button');
  settingsBtn.textContent = '⚙️';
  settingsBtn.style.cssText = `
    background: transparent;
    border: 1px solid #444;
    color: #fff;
    padding: 0.5rem;
    cursor: pointer;
    border-radius: 4px;
  `;
  settingsBtn.onclick = () => showSettingsModal(callbacks);
  header.appendChild(settingsBtn);

  return header;
}

// ============================================================================
// SWARM SIDEBAR
// ============================================================================

function createSwarmSidebar(gameData: GameData): HTMLElement {
  const sidebar = document.createElement('aside');
  sidebar.style.cssText = `
    width: 280px;
    background: #12121a;
    border-right: 1px solid #2a2a3a;
    padding: 1rem;
    overflow-y: auto;
  `;

  const aggregates = calculateSwarmAggregates(gameData.swarm);
  const queen = gameData.swarm.queens[0];

  sidebar.innerHTML = `
    <h2 style="margin: 0 0 1rem 0; font-size: 1rem; color: #64ffda;">Swarm Status</h2>
    
    <div style="margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>Queens:</span>
        <span style="font-weight: bold;">${aggregates.totalQueens}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>Workers:</span>
        <span style="font-weight: bold;">${aggregates.totalWorkers}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>Neural Load:</span>
        <span style="font-weight: bold; color: ${aggregates.neuralLoad > 1 ? '#ff6b6b' : '#69f0ae'}">
          ${Math.round(aggregates.neuralLoad * 100)}%
        </span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Efficiency:</span>
        <span style="font-weight: bold;">${Math.round(aggregates.efficiency * 100)}%</span>
      </div>
    </div>
    
    <h3 style="margin: 0 0 0.75rem 0; font-size: 0.9rem; color: #aaa;">Worker Distribution</h3>
    <div style="font-size: 0.85rem; line-height: 1.6;">
      <div>• Self-maintenance: ${aggregates.workerStates.selfMaintenance}</div>
      <div>• Gathering: ${aggregates.workerStates.gathering}</div>
      <div>• Idle (empty): ${aggregates.workerStates.idleEmpty}</div>
      <div>• Idle (full): ${aggregates.workerStates.idleCargoFull}</div>
    </div>
    
    ${
      queen
        ? `
    <h3 style="margin: 1.5rem 0 0.75rem 0; font-size: 0.9rem; color: #aaa;">Queen Energy</h3>
    <div style="background: #1a1a2e; border-radius: 4px; padding: 0.75rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>Current:</span>
        <span>${Math.floor(queen.energy.current)} / ${queen.energy.max}</span>
      </div>
      <div style="background: #2a2a3a; height: 8px; border-radius: 4px; overflow: hidden;">
        <div style="background: #64ffda; height: 100%; width: ${(queen.energy.current / queen.energy.max) * 100}%"></div>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #888;">
        Egg: ${queen.eggProduction.inProgress ? `${Math.floor(queen.eggProduction.progress)}%` : 'Not laying'}
      </div>
    </div>
    `
        : ''
    }
  `;

  return sidebar;
}

// ============================================================================
// MAIN PANEL
// ============================================================================

function createMainPanel(
  state: GameState,
  callbacks: RendererCallbacks
): HTMLElement {
  const panel = document.createElement('main');
  panel.style.cssText = `
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
    background: #0a0a0f;
  `;

  // Tab buttons
  const tabs = document.createElement('div');
  tabs.style.cssText = `
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid #2a2a3a;
    padding-bottom: 0.5rem;
  `;

  const tabNames: Array<[string, string]> = [
    ['swarm', 'Swarm'],
    ['planet', 'Planet'],
    ['system', 'System'],
    ['log', 'Log'],
  ];

  for (const [id, label] of tabNames) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      background: ${state.activeTab === id ? '#2a2a3a' : 'transparent'};
      border: none;
      color: ${state.activeTab === id ? '#64ffda' : '#888'};
      padding: 0.5rem 1rem;
      cursor: pointer;
      border-radius: 4px;
    `;
    btn.onclick = () => {
      state.activeTab = id as typeof state.activeTab;
      render(panel.parentElement!.parentElement!, state.gameData, callbacks);
    };
    tabs.appendChild(btn);
  }

  panel.appendChild(tabs);

  // Tab content
  const content = document.createElement('div');
  content.style.cssText = 'min-height: 400px;';

  switch (state.activeTab) {
    case 'swarm':
      content.innerHTML = createSwarmTabContent(state.gameData, callbacks);
      break;
    case 'planet':
      content.innerHTML = createPlanetTabContent(state.gameData);
      break;
    case 'system':
      content.innerHTML = createSystemTabContent(state.gameData);
      break;
    case 'log':
      content.innerHTML = createLogTabContent(state.gameData);
      break;
  }

  panel.appendChild(content);

  return panel;
}

// ============================================================================
// TAB CONTENT
// ============================================================================

function createSwarmTabContent(
  gameData: GameData,
  _callbacks: RendererCallbacks
): string {
  const queen = gameData.swarm.queens[0];
  if (!queen) return '<div>No queen found</div>';

  return `
    <div style="max-width: 600px;">
      <h2 style="color: #64ffda; margin-bottom: 1rem;">Queen Control</h2>
      
      <div style="background: #12121a; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Directive</h3>
        <div style="display: flex; gap: 0.5rem;">
          <button 
            onclick="window.setQueenDirective('gather_biomass')"
            style="
              flex: 1; 
              padding: 0.75rem; 
              background: ${queen.directive === 'gather_biomass' ? '#64ffda' : '#2a2a3a'};
              color: ${queen.directive === 'gather_biomass' ? '#0a0a0f' : '#fff'};
              border: none;
              border-radius: 4px;
              cursor: pointer;
            "
          >
            Gather Biomass
          </button>
          <button 
            onclick="window.setQueenDirective('idle')"
            style="
              flex: 1; 
              padding: 0.75rem; 
              background: ${queen.directive === 'idle' ? '#64ffda' : '#2a2a3a'};
              color: ${queen.directive === 'idle' ? '#0a0a0f' : '#fff'};
              border: none;
              border-radius: 4px;
              cursor: pointer;
            "
          >
            Idle
          </button>
        </div>
      </div>
      
      <div style="background: #12121a; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Egg Production</h3>
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input 
            type="checkbox" 
            ${queen.eggProduction.enabled ? 'checked' : ''}
            onchange="window.toggleEggProduction(this.checked)"
            style="width: 20px; height: 20px;"
          >
          <span>Enable egg laying (costs 10 energy per egg)</span>
        </label>
        ${
          queen.eggProduction.inProgress
            ? `
          <div style="margin-top: 0.75rem;">
            <div style="background: #2a2a3a; height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: #69f0ae; height: 100%; width: ${queen.eggProduction.progress}%"></div>
            </div>
            <div style="font-size: 0.8rem; color: #888; margin-top: 0.25rem;">
              ${Math.floor(queen.eggProduction.ticksRemaining)} ticks remaining
            </div>
          </div>
        `
            : ''
        }
      </div>
      
      <div style="background: #12121a; padding: 1rem; border-radius: 8px;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Swarm Stats</h3>
        <div style="font-size: 0.9rem; line-height: 1.8;">
          <div>Total Workers: ${gameData.swarm.workers.length}</div>
          <div>Total Queens: ${gameData.swarm.queens.length}</div>
          <div>Game Time: Day ${Math.floor(gameData.gameTime / 480)}</div>
        </div>
      </div>
    </div>
  `;
}

function createPlanetTabContent(gameData: GameData): string {
  const homePlanet = gameData.planets.find(
    (p) => p.id === gameData.homePlanetId
  );
  if (!homePlanet) return '<div>No planet found</div>';

  const conqueredZones = homePlanet.zones.filter(
    (z) => z.state === 'harvesting' || z.state === 'saturated'
  ).length;
  const totalZones = homePlanet.zones.length;

  return `
    <div>
      <h2 style="color: #64ffda; margin-bottom: 1rem;">${homePlanet.name}</h2>
      <div style="margin-bottom: 1rem; color: #888;">
        ${homePlanet.zones[0].name} — Starting zone
      </div>
      <div style="background: #12121a; padding: 1rem; border-radius: 8px;">
        <div>Zones conquered: ${conqueredZones} / ${totalZones}</div>
        <div style="margin-top: 0.5rem; font-size: 0.85rem; color: #888;">
          Planet visualization coming in v2
        </div>
      </div>
    </div>
  `;
}

function createSystemTabContent(gameData: GameData): string {
  return `
    <div>
      <h2 style="color: #64ffda; margin-bottom: 1rem;">TRAPPIST-1 System</h2>
      <div style="display: grid; gap: 0.75rem;">
        ${gameData.planets
          .map(
            (planet) => `
          <div style="
            background: ${planet.id === gameData.homePlanetId ? '#1a3a3a' : '#12121a'};
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid ${planet.id === gameData.homePlanetId ? '#64ffda' : '#2a2a3a'};
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: bold; color: ${planet.id === gameData.homePlanetId ? '#64ffda' : '#fff'}">
                  ${planet.name} ${planet.id === gameData.homePlanetId ? '(Home)' : ''}
                </div>
                <div style="font-size: 0.8rem; color: #888;">
                  ${planet.distanceAU} AU • ${planet.accessible ? 'Accessible' : 'Locked'}
                </div>
              </div>
              <div style="font-size: 0.75rem; color: #666;">
                ${planet.trappistId}
              </div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function createLogTabContent(gameData: GameData): string {
  const recentLogs = gameData.log.slice(-20).reverse();

  return `
    <div>
      <h2 style="color: #64ffda; margin-bottom: 1rem;">Event Log</h2>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${recentLogs.length === 0 ? '<div style="color: #666;">No events yet</div>' : ''}
        ${recentLogs
          .map(
            (log) => `
          <div style="
            background: #12121a;
            padding: 0.75rem;
            border-radius: 4px;
            font-size: 0.85rem;
            border-left: 3px solid ${log.type === 'daily_summary' ? '#64ffda' : '#444'};
          ">
            ${log.message}
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// SYSTEM SIDEBAR
// ============================================================================

function createSystemSidebar(_gameData: GameData): HTMLElement {
  void _gameData;
  const sidebar = document.createElement('aside');
  sidebar.style.cssText = `
    width: 240px;
    background: #12121a;
    border-left: 1px solid #2a2a3a;
    padding: 1rem;
    overflow-y: auto;
  `;

  sidebar.innerHTML = `
    <h2 style="margin: 0 0 1rem 0; font-size: 1rem; color: #64ffda;">System Map</h2>
    <div style="font-size: 0.85rem; color: #888; text-align: center; padding: 2rem 0;">
      <div style="margin-bottom: 1rem;">🪐</div>
      <div>7 planets</div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem;">
        Detailed orrery<br>coming in v2
      </div>
    </div>
    <div style="margin-top: 1rem; font-size: 0.8rem;">
      <div style="color: #666; margin-bottom: 0.5rem;">Legend:</div>
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
        <div style="width: 8px; height: 8px; background: #64ffda; border-radius: 50%;"></div>
        <span>Current planet</span>
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
        <div style="width: 8px; height: 8px; background: #444; border-radius: 50%;"></div>
        <span>Locked planet</span>
      </div>
    </div>
  `;

  return sidebar;
}

// ============================================================================
// FOOTER
// ============================================================================

function createFooter(
  gameData: GameData,
  callbacks: RendererCallbacks
): HTMLElement {
  const footer = document.createElement('footer');
  footer.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #12121a;
    border-top: 1px solid #2a2a3a;
  `;

  // Left: Pause/Resume
  const left = document.createElement('div');
  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = gameData.isPaused ? '▶️ Resume' : '⏸️ Pause';
  pauseBtn.style.cssText = `
    background: ${gameData.isPaused ? '#69f0ae' : '#ff6b6b'};
    color: #0a0a0f;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  `;
  pauseBtn.onclick = callbacks.onTogglePause;
  left.appendChild(pauseBtn);
  footer.appendChild(left);

  // Center: Speed control
  const center = document.createElement('div');
  center.style.cssText = 'display: flex; gap: 0.5rem;';

  for (const speed of [1, 2, 5] as const) {
    const btn = document.createElement('button');
    btn.textContent = `${speed}x`;
    btn.style.cssText = `
      background: ${gameData.timeSpeed === speed ? '#64ffda' : '#2a2a3a'};
      color: ${gameData.timeSpeed === speed ? '#0a0a0f' : '#fff'};
      border: none;
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
    `;
    btn.onclick = () => callbacks.onSetTimeSpeed(speed);
    center.appendChild(btn);
  }
  footer.appendChild(center);

  // Right: Version
  const right = document.createElement('div');
  right.style.cssText = 'font-size: 0.75rem; color: #666;';
  right.textContent = 'v1.0.0 Swarm';
  footer.appendChild(right);

  return footer;
}

// ============================================================================
// SETTINGS MODAL
// ============================================================================

function showSettingsModal(callbacks: RendererCallbacks): void {
  const modal = document.createElement('div');
  modal.style.cssText = `
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

  const content = document.createElement('div');
  content.style.cssText = `
    background: #12121a;
    padding: 2rem;
    border-radius: 8px;
    max-width: 400px;
    width: 90%;
    border: 1px solid #2a2a3a;
  `;

  content.innerHTML = `
    <h2 style="margin: 0 0 1rem 0; color: #64ffda;">Settings</h2>
    
    <div style="margin-bottom: 1rem;">
      <button id="exportBtn" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem; background: #2a2a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
        Export Save
      </button>
      <button id="importBtn" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem; background: #2a2a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
        Import Save
      </button>
      <button id="resetBtn" style="width: 100%; padding: 0.75rem; background: #5c1a1a; color: #ff9b9b; border: none; border-radius: 4px; cursor: pointer;">
        Reset Game
      </button>
    </div>
    
    <button id="closeBtn" style="width: 100%; padding: 0.75rem; background: transparent; color: #888; border: 1px solid #444; border-radius: 4px; cursor: pointer;">
      Close
    </button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  // Event handlers
  content.querySelector('#exportBtn')!.addEventListener('click', () => {
    const saveData = callbacks.onExportSave();
    if (saveData) {
      void navigator.clipboard.writeText(saveData).then(() => {
        alert('Save data copied to clipboard!');
      });
    }
  });

  content.querySelector('#importBtn')!.addEventListener('click', () => {
    const saveData = prompt('Paste save data:');
    if (saveData && callbacks.onImportSave(saveData)) {
      alert('Save loaded successfully!');
      modal.remove();
    } else if (saveData) {
      alert('Invalid save data!');
    }
  });

  content.querySelector('#resetBtn')!.addEventListener('click', () => {
    modal.remove();
    callbacks.onResetGame();
  });

  content.querySelector('#closeBtn')!.addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ============================================================================
// GLOBAL HANDLERS (for inline onclick)
// ============================================================================

declare global {
  interface Window {
    setQueenDirective: (directive: 'gather_biomass' | 'idle') => void;
    toggleEggProduction: (enabled: boolean) => void;
  }
}
