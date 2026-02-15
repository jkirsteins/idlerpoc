// Swarm Game Renderer - Component-based architecture
// Follows mount-once / update-on-tick pattern from component.ts

import { SWARM_CONSTANTS, type GameData } from '../models/swarmTypes';
import { calculateSwarmAggregates } from '../swarmSystem';
import {
  formatAtmosphericMass,
  formatPercentage,
  formatPressureIndex,
} from '../formatting';
import { derivePlanetAtmosphere } from '../planetAtmosphere';
import type { Component } from './component';
import { createOrreryComponent, type OrreryCallbacks } from './orreryComponent';
import {
  createPlanetMapComponent,
  type PlanetMapCallbacks,
} from './planetMapComponent';
import {
  createPlanetLocalComponent,
  type PlanetLocalCallbacks,
} from './planetLocalComponent';

// ============================================================================
// TYPES
// ============================================================================

export interface RendererCallbacks {
  onTogglePause: () => void;
  onSetQueenDirective: (directive: 'gather_biomass' | 'idle') => void;
  onToggleEggProduction: (enabled: boolean) => void;
  onExportSave: () => string;
  onImportSave: (saveData: string) => boolean;
  onResetGame: () => void;
}

export type TabId = 'swarm' | 'planet' | 'system' | 'log' | 'settings';

interface RendererState {
  activeTab: TabId;
}

// ============================================================================
// MAIN RENDER FUNCTION - Mount Once
// ============================================================================

export interface Renderer {
  update: (gameData: GameData) => void;
  destroy: () => void;
}

// Track current layout for potential cleanup (used in destroy)
let _currentLayout: HTMLElement | null = null;
void _currentLayout; // Suppress unused warning - used in destroy()

export function render(
  container: HTMLElement,
  gameData: GameData,
  callbacks: RendererCallbacks
): Renderer {
  // Store state outside render cycle
  const state: RendererState = {
    activeTab: 'swarm',
  };

  // Clear container once on initial mount
  container.innerHTML = '';

  // Create main layout container
  const layout = document.createElement('div');
  layout.className = 'swarm-layout';
  layout.style.cssText = `
    display: grid;
    grid-template-columns: 280px 1fr 50%;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      'header header header'
      'left main right'
      'footer footer footer';
    height: 100%;
    background: var(--bg-void, #050508);
    color: var(--text-primary, #e0e0e0);
    font-family: var(--font-body, system-ui, sans-serif);
  `;

  // Mount all components
  const header = createHeader(gameData, callbacks);
  const leftSidebar = createLeftSidebar(gameData);
  const mainPanel = createMainPanel(gameData, state, callbacks);
  const rightSidebar = createRightSidebar(gameData);
  const footer = createFooter(gameData, callbacks);

  // Set grid areas
  header.el.style.gridArea = 'header';
  leftSidebar.el.style.gridArea = 'left';
  mainPanel.el.style.gridArea = 'main';
  rightSidebar.el.style.gridArea = 'right';
  footer.el.style.gridArea = 'footer';

  // Append all to layout
  layout.appendChild(header.el);
  layout.appendChild(leftSidebar.el);
  layout.appendChild(mainPanel.el);
  layout.appendChild(rightSidebar.el);
  layout.appendChild(footer.el);

  container.appendChild(layout);

  if (typeof window !== 'undefined') {
    window.swarmCallbacks = {
      setQueenDirective: callbacks.onSetQueenDirective,
      toggleEggProduction: callbacks.onToggleEggProduction,
      saveGame: () => {
        const saveData = callbacks.onExportSave();
        if (!saveData) return;
        const blob = new Blob([saveData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `swarm-save-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
      },
      loadGame: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const content =
              typeof reader.result === 'string' ? reader.result : '';
            if (!content) {
              alert('Failed to read save file.');
              return;
            }

            if (
              confirm(
                'Load this save file and replace current progress? This cannot be undone.'
              )
            ) {
              if (callbacks.onImportSave(content)) {
                alert('Save loaded successfully!');
              } else {
                alert('Invalid save file!');
              }
            }
          };
          reader.readAsText(file);
        });
        input.click();
      },
      resetGame: callbacks.onResetGame,
    };
  }

  // Store reference for updates
  const update = (gd: GameData) => {
    header.update(gd);
    leftSidebar.update(gd);
    mainPanel.update(gd);
    rightSidebar.update(gd);
    footer.update(gd);
  };

  _currentLayout = layout;

  return {
    update,
    destroy: () => {
      container.innerHTML = '';
      _currentLayout = null;
    },
  };
}

// ============================================================================
// HEADER COMPONENT
// ============================================================================

function createHeader(
  _gameData: GameData,
  _callbacks: RendererCallbacks
): Component {
  const el = document.createElement('header');
  el.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-panel, #0a0a12);
    border-bottom: 1px solid var(--border-color, #2a2a3a);
  `;

  // Logo
  const logoContainer = document.createElement('div');
  logoContainer.style.cssText =
    'display: flex; align-items: center; gap: 0.75rem;';

  const logo = document.createElement('img');
  logo.src = '/logo.png';
  logo.alt = 'TRAPPIST-1 Swarm';
  logo.style.cssText = 'height: 40px; width: auto;';
  logoContainer.appendChild(logo);

  const title = document.createElement('h1');
  title.textContent = 'TRAPPIST-1 Swarm';
  title.style.cssText = `
    margin: 0;
    font-size: 1.25rem;
    color: var(--accent-cyan, #00e5ff);
    font-family: var(--font-header, sans-serif);
  `;
  logoContainer.appendChild(title);

  el.appendChild(logoContainer);

  // Settings button
  const settingsBtn = document.createElement('button');
  settingsBtn.textContent = '⚙️';
  settingsBtn.style.cssText = `
    background: transparent;
    border: 1px solid var(--border-color, #444);
    color: #fff;
    padding: 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    font-size: 1rem;
  `;
  settingsBtn.onclick = () => showSettingsModal(_callbacks);
  el.appendChild(settingsBtn);

  return {
    el,
    update: (_gameData: GameData) => {
      // Header is mostly static, could update title/status here if needed
    },
  };
}

// ============================================================================
// LEFT SIDEBAR COMPONENT - Day Progress & Swarm Stats
// ============================================================================

function createLeftSidebar(_gameData: GameData): Component {
  const el = document.createElement('aside');
  el.className = 'left-sidebar';
  el.style.cssText = `
    background: var(--bg-panel, #0a0a12);
    border-right: 1px solid var(--border-color, #2a2a3a);
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  `;

  // Day/Year Display Section
  const timeSection = document.createElement('div');
  timeSection.style.cssText = 'text-align: center;';

  const yearDisplay = document.createElement('div');
  yearDisplay.style.cssText = `
    font-size: 1.1rem;
    font-weight: bold;
    color: var(--accent-cyan, #00e5ff);
    margin-bottom: 0.5rem;
  `;
  timeSection.appendChild(yearDisplay);

  // Progress bar container
  const progressContainer = document.createElement('div');
  progressContainer.style.cssText = `
    background: var(--bg-void, #050508);
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
    position: relative;
  `;

  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease, background-color 0.3s ease;
  `;
  progressContainer.appendChild(progressBar);
  timeSection.appendChild(progressContainer);

  const dayLabel = document.createElement('div');
  dayLabel.style.cssText = `
    font-size: 0.8rem;
    color: var(--text-secondary, #888);
    margin-top: 0.25rem;
  `;
  timeSection.appendChild(dayLabel);

  el.appendChild(timeSection);

  // Swarm Stats Section
  const statsSection = document.createElement('div');
  statsSection.innerHTML =
    '<h3 style="margin: 0 0 0.75rem 0; font-size: 0.9rem; color: var(--text-secondary, #aaa);">Swarm Status</h3>';

  const statsContainer = document.createElement('div');
  statsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
  `;

  const workersEl = document.createElement('div');
  workersEl.style.cssText = 'display: flex; justify-content: space-between;';
  workersEl.innerHTML =
    '<span>Workers:</span><span style="font-weight: bold;">-</span>';
  statsContainer.appendChild(workersEl);

  const queensEl = document.createElement('div');
  queensEl.style.cssText = 'display: flex; justify-content: space-between;';
  queensEl.innerHTML =
    '<span>Queens:</span><span style="font-weight: bold;">-</span>';
  statsContainer.appendChild(queensEl);

  const neuralEl = document.createElement('div');
  neuralEl.style.cssText = 'display: flex; justify-content: space-between;';
  neuralEl.innerHTML =
    '<span>Neural Load:</span><span style="font-weight: bold;">-</span>';
  statsContainer.appendChild(neuralEl);

  const efficiencyEl = document.createElement('div');
  efficiencyEl.style.cssText = 'display: flex; justify-content: space-between;';
  efficiencyEl.innerHTML =
    '<span>Efficiency:</span><span style="font-weight: bold;">-</span>';
  statsContainer.appendChild(efficiencyEl);

  statsSection.appendChild(statsContainer);
  el.appendChild(statsSection);

  // Worker Distribution Section
  const distributionSection = document.createElement('div');
  distributionSection.innerHTML =
    '<h3 style="margin: 0 0 0.75rem 0; font-size: 0.9rem; color: var(--text-secondary, #aaa);">Worker Distribution</h3>';

  const distributionContainer = document.createElement('div');
  distributionContainer.style.cssText = `
    font-size: 0.85rem;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  `;

  const gatheringEl = document.createElement('div');
  gatheringEl.textContent = 'Gathering: -';
  distributionContainer.appendChild(gatheringEl);

  const idleEmptyEl = document.createElement('div');
  idleEmptyEl.textContent = 'Idle (empty): -';
  distributionContainer.appendChild(idleEmptyEl);

  const idleFullEl = document.createElement('div');
  idleFullEl.textContent = 'Idle (full): -';
  distributionContainer.appendChild(idleFullEl);

  const maintenanceEl = document.createElement('div');
  maintenanceEl.textContent = 'Maintenance: -';
  distributionContainer.appendChild(maintenanceEl);

  distributionSection.appendChild(distributionContainer);
  el.appendChild(distributionSection);

  return {
    el,
    update: (gameData: GameData) => {
      // Get home planet (Asimov) - year is based on its rotation
      const homePlanet = gameData.planets.find(
        (p) => p.id === gameData.homePlanetId
      );
      const asimovDayLength = homePlanet?.dayLengthTicks ?? 480;

      // Year = orbits around Asimov (1 rotation = 1 year)
      const years = Math.floor(gameData.gameTime / asimovDayLength) + 1;
      const yearProgress =
        (gameData.gameTime % asimovDayLength) / asimovDayLength;

      yearDisplay.textContent = `Year ${years}`;
      progressBar.style.width = `${yearProgress * 100}%`;

      // Color gradient through the year
      let color: string;
      if (yearProgress < 0.25) {
        color = '#4a9eff';
      } else if (yearProgress < 0.5) {
        color = '#ffc107';
      } else if (yearProgress < 0.75) {
        color = '#ff9800';
      } else {
        color = '#9c27b0';
      }
      progressBar.style.backgroundColor = color;

      const elapsedTicksInYear = gameData.gameTime % asimovDayLength;
      const elapsedHoursInYear =
        elapsedTicksInYear / SWARM_CONSTANTS.TICKS_PER_HOUR;
      dayLabel.textContent = `${(yearProgress * 100).toFixed(1)}% - ${elapsedHoursInYear.toFixed(1)}h elapsed`;

      // Update swarm stats
      const aggregates = calculateSwarmAggregates(gameData.swarm);

      (workersEl.lastChild as HTMLElement).textContent = String(
        aggregates.totalWorkers
      );
      (queensEl.lastChild as HTMLElement).textContent = String(
        aggregates.totalQueens
      );

      const neuralLoadEl = neuralEl.lastChild as HTMLElement;
      neuralLoadEl.textContent = `${Math.round(aggregates.neuralLoad * 100)}%`;
      neuralLoadEl.style.color =
        aggregates.neuralLoad > 1 ? '#ff4444' : '#4caf50';

      (efficiencyEl.lastChild as HTMLElement).textContent =
        `${Math.round(aggregates.efficiency * 100)}%`;

      // Update distribution
      gatheringEl.textContent = `Gathering: ${aggregates.workerStates.gathering}`;
      idleEmptyEl.textContent = `Idle (empty): ${aggregates.workerStates.idleEmpty}`;
      idleFullEl.textContent = `Idle (full): ${aggregates.workerStates.idleCargoFull}`;
      maintenanceEl.textContent = `Maintenance: ${aggregates.workerStates.selfMaintenance}`;
    },
  };
}

// ============================================================================
// MAIN PANEL COMPONENT - Tabs
// ============================================================================

function createMainPanel(
  _gameData: GameData,
  state: RendererState,
  callbacks: RendererCallbacks
): Component {
  const el = document.createElement('main');
  el.className = 'main-panel';
  el.style.cssText = `
    padding: 1rem;
    overflow-y: auto;
    background: var(--bg-void, #050508);
  `;

  // Tab buttons container
  const tabsContainer = document.createElement('div');
  tabsContainer.style.cssText = `
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border-color, #2a2a3a);
    padding-bottom: 0.5rem;
  `;

  const tabButtons = new Map<TabId, HTMLButtonElement>();

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'swarm', label: 'Swarm' },
    { id: 'planet', label: 'Planet' },
    { id: 'system', label: 'System' },
    { id: 'log', label: 'Log' },
    { id: 'settings', label: 'Settings' },
  ];

  for (const { id, label } of tabs) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.tabId = id;
    btn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-secondary, #888);
      padding: 0.5rem 1rem;
      cursor: pointer;
      border-radius: 4px;
      font-size: 0.9rem;
      transition: all 0.2s;
    `;

    tabButtons.set(id, btn);
    tabsContainer.appendChild(btn);
  }

  el.appendChild(tabsContainer);

  // Tab content container
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = 'min-height: 400px;';

  const tabContents = new Map<TabId, HTMLElement>();

  // Create tab contents first so onclick handlers can reference them
  for (const { id } of tabs) {
    const content = document.createElement('div');
    content.style.display = id === state.activeTab ? 'block' : 'none';
    tabContents.set(id, content);
    contentContainer.appendChild(content);
  }

  // Now add onclick handlers that reference tabContents
  for (const { id } of tabs) {
    const btn = tabButtons.get(id);
    if (btn) {
      btn.onclick = () => {
        state.activeTab = id;
        // Update button styles
        for (const [tabId, button] of tabButtons) {
          if (tabId === id) {
            button.style.background = 'var(--bg-panel, #12121e)';
            button.style.color = 'var(--accent-cyan, #00e5ff)';
          } else {
            button.style.background = 'transparent';
            button.style.color = 'var(--text-secondary, #888)';
          }
        }
        // Update content visibility
        for (const [tabId, content] of tabContents) {
          content.style.display = tabId === id ? 'block' : 'none';
        }
      };
    }
  }

  el.appendChild(contentContainer);

  // Initial tab state
  const initialBtn = tabButtons.get(state.activeTab);
  if (initialBtn) {
    initialBtn.style.background = 'var(--bg-panel, #12121e)';
    initialBtn.style.color = 'var(--accent-cyan, #00e5ff)';
  }

  return {
    el,
    update: (gameData: GameData) => {
      // Update tab content based on active tab
      const activeTab = state.activeTab;
      for (const [id, content] of tabContents) {
        if (id === activeTab) {
          content.innerHTML = getTabContent(id, gameData, callbacks);
        }
      }
    },
  };
}

function getTabContent(
  tabId: TabId,
  gameData: GameData,
  callbacks: RendererCallbacks
): string {
  switch (tabId) {
    case 'swarm':
      return createSwarmTabContent(gameData, callbacks);
    case 'planet':
      return createPlanetTabContent(gameData);
    case 'system':
      return createSystemTabContent(gameData);
    case 'log':
      return createLogTabContent(gameData);
    case 'settings':
      return createSettingsTabContent();
    default:
      return '';
  }
}

function createSettingsTabContent(): string {
  return `
    <div style="max-width: 560px;">
      <h2 style="color: var(--accent-cyan, #00e5ff); margin-bottom: 1rem;">Settings</h2>
      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.75rem;">
        <button
          onclick="window.swarmCallbacks?.saveGame()"
          style="padding: 0.75rem; background: #2a2a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;"
        >
          Download Save
        </button>
        <button
          onclick="window.swarmCallbacks?.loadGame()"
          style="padding: 0.75rem; background: #2a2a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;"
        >
          Upload Save
        </button>
        <button
          onclick="window.swarmCallbacks?.resetGame()"
          style="padding: 0.75rem; background: #5c1a1a; color: #ff9b9b; border: none; border-radius: 4px; cursor: pointer;"
        >
          Reset Game
        </button>
      </div>
    </div>
  `;
}

function createSwarmTabContent(
  gameData: GameData,
  _callbacks: RendererCallbacks
): string {
  const queen = gameData.swarm.queens[0];
  if (!queen) {
    return `
      <div style="max-width: 600px;">
        <h2 style="color: var(--accent-cyan, #00e5ff); margin-bottom: 1rem;">Swarm Control</h2>
        <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
          <div style="font-size: 1rem; font-weight: 600; color: #ff9b9b; margin-bottom: 0.5rem;">No active queens</div>
          <div style="color: var(--text-secondary, #888); line-height: 1.5;">All queens are dead. Swarm-owned areas remain under swarm control, but no new directives can be issued.</div>
        </div>
        <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px;">
          <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Swarm Stats</h3>
          <div style="font-size: 0.9rem; line-height: 1.8;">
            <div>Total Workers: ${gameData.swarm.workers.length}</div>
            <div>Total Queens: ${gameData.swarm.queens.length}</div>
            <div>Swarm-Owned Zones: ${gameData.planets.reduce(
              (sum, planet) =>
                sum + planet.zones.filter((zone) => zone.ownedBySwarm).length,
              0
            )}</div>
          </div>
        </div>
      </div>
    `;
  }

  const energyPct =
    queen.energy.max > 0 ? (queen.energy.current / queen.energy.max) * 100 : 0;
  const healthPct =
    queen.health.max > 0 ? (queen.health.current / queen.health.max) * 100 : 0;
  const eggHoursRemaining =
    queen.eggProduction.ticksRemaining / SWARM_CONSTANTS.TICKS_PER_HOUR;

  return `
    <div style="max-width: 600px;">
      <h2 style="color: var(--accent-cyan, #00e5ff); margin-bottom: 1rem;">Queen Control</h2>

      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Vital Status</h3>
        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
          <div class="stat-bar stat-bar--compact">
            <div class="stat-bar__label">Energy ${queen.energy.current.toFixed(1)} / ${queen.energy.max.toFixed(0)}</div>
            <div class="stat-bar__track">
              <div class="stat-bar__fill ${energyPct > 40 ? 'bar-good' : energyPct > 15 ? 'bar-warning' : 'bar-danger'}" style="width: ${Math.max(0, Math.min(100, energyPct))}%;"></div>
            </div>
          </div>
          <div class="stat-bar stat-bar--compact">
            <div class="stat-bar__label">Health ${queen.health.current.toFixed(1)} / ${queen.health.max.toFixed(0)}</div>
            <div class="stat-bar__track">
              <div class="stat-bar__fill ${healthPct > 40 ? 'bar-good' : healthPct > 15 ? 'bar-warning' : 'bar-danger'}" style="width: ${Math.max(0, Math.min(100, healthPct))}%;"></div>
            </div>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-secondary, #888);">
            Metabolism: ${queen.metabolismPerTick.toFixed(4)} energy/s
          </div>
        </div>
      </div>
      
      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Directive</h3>
        <div style="display: flex; gap: 0.5rem;">
          <button 
            onclick="window.swarmCallbacks?.setQueenDirective('gather_biomass')"
            style="
              flex: 1; 
              padding: 0.75rem; 
              background: ${queen.directive === 'gather_biomass' ? 'var(--accent-cyan, #00e5ff)' : '#2a2a3a'};
              color: ${queen.directive === 'gather_biomass' ? '#0a0a0f' : '#fff'};
              border: none;
              border-radius: 4px;
              cursor: pointer;
            "
          >
            Gather Biomass
          </button>
          <button 
            onclick="window.swarmCallbacks?.setQueenDirective('idle')"
            style="
              flex: 1; 
              padding: 0.75rem; 
              background: ${queen.directive === 'idle' ? 'var(--accent-cyan, #00e5ff)' : '#2a2a3a'};
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
      
      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Egg Production</h3>
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input 
            type="checkbox" 
            ${queen.eggProduction.enabled ? 'checked' : ''}
            onchange="window.swarmCallbacks?.toggleEggProduction(this.checked)"
            style="width: 20px; height: 20px;"
          >
          <span>Enable egg laying (costs 10 energy per egg)</span>
        </label>
        ${
          queen.eggProduction.inProgress
            ? `
          <div style="margin-top: 0.75rem;">
            <div style="background: #2a2a3a; height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: #4caf50; height: 100%; width: ${queen.eggProduction.progress}%"></div>
            </div>
            <div style="font-size: 0.8rem; color: #888; margin-top: 0.25rem;">
              ${eggHoursRemaining.toFixed(1)}h remaining
            </div>
          </div>
        `
            : ''
        }
      </div>
      
      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Swarm Stats</h3>
        <div style="font-size: 0.9rem; line-height: 1.8;">
          <div>Total Workers: ${gameData.swarm.workers.length}</div>
          <div>Total Queens: ${gameData.swarm.queens.length}</div>
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

  const atmosphere = derivePlanetAtmosphere(homePlanet);

  const conqueredZones = homePlanet.zones.filter((z) => z.ownedBySwarm).length;
  const totalZones = homePlanet.zones.length;

  const composition = atmosphere.composition;
  const compositionMass = atmosphere.compositionMass;
  const topGas = [
    { label: 'N2', value: composition.n2 },
    { label: 'CO2', value: composition.co2 },
    { label: 'O2', value: composition.o2 },
    { label: 'CH4', value: composition.ch4 },
    { label: 'Inert', value: composition.inert },
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((gas) => `${gas.label} ${formatPercentage(gas.value)}`)
    .join(', ');

  const bandRows = atmosphere.bandSummaries
    .map((band) => {
      const bandLabel =
        band.band === 'light'
          ? 'Light'
          : band.band === 'terminator'
            ? 'Terminator'
            : 'Dark';
      return `
        <tr>
          <td style="padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${bandLabel}</td>
          <td style="padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${band.zones}</td>
          <td style="padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${formatAtmosphericMass(band.totalMass)} (${formatPercentage(band.massShare)})</td>
          <td style="padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${formatAtmosphericMass(band.averageMass)}</td>
          <td style="padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${band.dominantAtmosphere}</td>
        </tr>
      `;
    })
    .join('');

  const gasBreakdown = [
    { label: 'N2', pct: composition.n2, mass: compositionMass.n2 },
    { label: 'CO2', pct: composition.co2, mass: compositionMass.co2 },
    { label: 'O2', pct: composition.o2, mass: compositionMass.o2 },
    { label: 'CH4', pct: composition.ch4, mass: compositionMass.ch4 },
    { label: 'Inert', pct: composition.inert, mass: compositionMass.inert },
  ]
    .sort((a, b) => b.mass - a.mass)
    .map(
      (gas) =>
        `<tr>
          <td style="padding: 0.35rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${gas.label}</td>
          <td style="padding: 0.35rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${formatPercentage(gas.pct)}</td>
          <td style="padding: 0.35rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${formatAtmosphericMass(gas.mass)}</td>
        </tr>`
    )
    .join('');

  const topZoneLines = atmosphere.topContributors
    .map((zone, index) => {
      const bandLabel =
        zone.band === 'light'
          ? 'Light'
          : zone.band === 'terminator'
            ? 'Terminator'
            : 'Dark';
      return `<tr>
        <td style="padding: 0.35rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${index + 1}</td>
        <td style="padding: 0.35rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); word-break: break-word;">${zone.zoneName}</td>
        <td style="padding: 0.35rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${formatAtmosphericMass(zone.mass)} (${formatPercentage(zone.massShare)})</td>
        <td style="padding: 0.35rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">${bandLabel}</td>
      </tr>`;
    })
    .join('');

  return `
    <div>
      <h2 style="color: var(--accent-cyan, #00e5ff); margin-bottom: 1rem;">${homePlanet.name}</h2>
      <div style="margin-bottom: 1rem; color: var(--text-secondary, #888);">
        ${homePlanet.zones[0]?.name || 'Unknown'} — Starting zone
      </div>
      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px;">
        <div>Zones conquered: ${conqueredZones} / ${totalZones}</div>
        <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary, #888);">
          Planet visualization available in the System tab
        </div>
      </div>
      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
        <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--accent-cyan, #00e5ff);">Atmosphere (Derived from Zones)</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; table-layout: fixed;">
          <tbody>
            <tr>
              <th style="text-align: left; width: 170px; color: var(--text-secondary, #888); font-weight: 500; padding: 0.4rem 0.5rem;">Mass</th>
              <td style="padding: 0.4rem 0.5rem; word-break: break-word;">${formatAtmosphericMass(atmosphere.totalMass)}</td>
            </tr>
            <tr>
              <th style="text-align: left; width: 170px; color: var(--text-secondary, #888); font-weight: 500; padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">Pressure Index</th>
              <td style="padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); word-break: break-word;">${formatPressureIndex(atmosphere.pressureIndex)}</td>
            </tr>
            <tr>
              <th style="text-align: left; width: 170px; color: var(--text-secondary, #888); font-weight: 500; padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);">Dominant Gases</th>
              <td style="padding: 0.4rem 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); word-break: break-word;">${topGas}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 0.75rem; background: rgba(0,0,0,0.18); border: 1px solid var(--border-color, #2a2a3a); border-radius: 6px; padding: 0.6rem; min-width: 0;">
          <div style="font-size: 0.78rem; color: var(--text-secondary, #888); margin-bottom: 0.35rem;">Insolation Band Contribution</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; table-layout: fixed;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Band</th>
                <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Zones</th>
                <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Total</th>
                <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Avg/Zone</th>
                <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">State</th>
              </tr>
            </thead>
            <tbody>${bandRows}</tbody>
          </table>
        </div>

        <div style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; min-width: 0;">
          <div style="background: rgba(0,0,0,0.18); border: 1px solid var(--border-color, #2a2a3a); border-radius: 6px; padding: 0.6rem; min-width: 0;">
            <div style="font-size: 0.78rem; color: var(--text-secondary, #888); margin-bottom: 0.35rem;">Gas Mass Contribution</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; table-layout: fixed;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Gas</th>
                  <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Share</th>
                  <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Mass</th>
                </tr>
              </thead>
              <tbody>${gasBreakdown}</tbody>
            </table>
          </div>
          <div style="background: rgba(0,0,0,0.18); border: 1px solid var(--border-color, #2a2a3a); border-radius: 6px; padding: 0.6rem; min-width: 0;">
            <div style="font-size: 0.78rem; color: var(--text-secondary, #888); margin-bottom: 0.35rem;">Top Zone Contributors</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; table-layout: fixed;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888); width: 32px;">#</th>
                  <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Zone</th>
                  <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Contribution</th>
                  <th style="text-align: left; padding: 0.3rem 0.5rem; color: var(--text-secondary, #888);">Band</th>
                </tr>
              </thead>
              <tbody>${topZoneLines}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function createSystemTabContent(gameData: GameData): string {
  return `
    <div>
      <h2 style="color: var(--accent-cyan, #00e5ff); margin-bottom: 1rem;">TRAPPIST-1 System</h2>
      <div style="display: grid; gap: 0.75rem;">
        ${gameData.planets
          .map(
            (planet) => `
          <div style="
            background: ${planet.id === gameData.homePlanetId ? '#1a3a3a' : 'var(--bg-panel, #12121a)'};
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid ${planet.id === gameData.homePlanetId ? 'var(--accent-cyan, #00e5ff)' : 'var(--border-color, #2a2a3a)'};
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: bold; color: ${planet.id === gameData.homePlanetId ? 'var(--accent-cyan, #00e5ff)' : '#fff'}">
                  ${planet.name} ${planet.id === gameData.homePlanetId ? '(Home)' : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary, #888);">
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
      <h2 style="color: var(--accent-cyan, #00e5ff); margin-bottom: 1rem;">Event Log</h2>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${recentLogs.length === 0 ? '<div style="color: #666;">No events yet</div>' : ''}
        ${recentLogs
          .map(
            (log) => `
          <div style="
            background: var(--bg-panel, #12121a);
            padding: 0.75rem;
            border-radius: 4px;
            font-size: 0.85rem;
            border-left: 3px solid ${log.type === 'daily_summary' ? 'var(--accent-cyan, #00e5ff)' : '#444'};
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
// RIGHT SIDEBAR COMPONENT - Map (Orrery + Planet View)
// ============================================================================

type MapViewMode = 'system' | 'local' | 'planet';

function createRightSidebar(gameData: GameData): Component {
  const el = document.createElement('aside');
  el.className = 'right-sidebar';
  el.style.cssText = `
    background: var(--bg-panel, #0a0a12);
    border-left: 1px solid var(--border-color, #2a2a3a);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  // View state
  let viewMode: MapViewMode = 'system';
  let selectedPlanetId: string | null = null;
  void selectedPlanetId; // Will be used for displaying selected planet info

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color, #2a2a3a);
  `;

  const title = document.createElement('span');
  title.style.cssText =
    'font-weight: bold; color: var(--accent-cyan, #00e5ff);';
  title.textContent = 'System Map';
  header.appendChild(title);

  el.appendChild(header);

  // Orrery container
  const orreryContainer = document.createElement('div');
  orreryContainer.style.cssText =
    'flex: 1; position: relative; display: none; min-height: 0;';
  el.appendChild(orreryContainer);

  // Planet local view container (planet + moons)
  const planetLocalContainer = document.createElement('div');
  planetLocalContainer.style.cssText =
    'flex: 1; position: relative; display: none; min-height: 0;';
  el.appendChild(planetLocalContainer);

  // Planet map container
  const planetMapContainer = document.createElement('div');
  planetMapContainer.style.cssText =
    'flex: 1; position: relative; display: none; min-height: 0;';
  el.appendChild(planetMapContainer);

  // Create orrery component
  const orreryCallbacks: OrreryCallbacks = {
    onPlanetSelect: (planetId: string) => {
      const planet = gameData.planets.find((p) => p.id === planetId);
      if (planet?.accessible) {
        selectedPlanetId = planetId;
        switchToLocalView(planetId);
      } else {
        // Show locked view or alert
        console.log('Planet is locked:', planetId);
      }
    },
    onPlanetFocus: (planetId: string) => {
      const planet = gameData.planets.find((p) => p.id === planetId);
      if (planet?.accessible) {
        switchToLocalView(planetId);
      } else {
        console.log('Planet is locked:', planetId);
      }
    },
  };

  const orrery = createOrreryComponent(
    orreryContainer,
    gameData,
    orreryCallbacks
  );

  // Create planet local component (planet + moons)
  const planetLocalCallbacks: PlanetLocalCallbacks = {
    onBackToSystem: () => {
      switchToSystemView();
    },
    onViewZones: (planetId: string) => {
      switchToPlanetView(planetId);
    },
  };

  let planetLocal: Component<GameData> | null = null;

  // Create planet map component (zones)
  const planetMapCallbacks: PlanetMapCallbacks = {
    onZoneSelect: (zoneId: string) => {
      console.log('Selected zone:', zoneId);
    },
    onBackToLocal: () => {
      if (selectedPlanetId) {
        switchToLocalView(selectedPlanetId);
      } else {
        switchToSystemView();
      }
    },
    onBackToSystem: () => {
      switchToSystemView();
    },
    getPlanetId: () => selectedPlanetId,
  };

  let planetMap: Component<GameData> | null = null;

  // Helper to switch to planet view (zones)
  function switchToPlanetView(planetId: string) {
    console.log('Switching to planet view:', planetId);
    selectedPlanetId = planetId;
    viewMode = 'planet';
    orreryContainer.style.display = 'none';
    planetLocalContainer.style.display = 'none';
    planetMapContainer.style.display = '';
    title.textContent = 'Zone Map';

    // Create planet map if not exists
    if (!planetMap) {
      console.log('Creating planet map component');
      planetMap = createPlanetMapComponent(
        planetMapContainer,
        gameData,
        planetMapCallbacks
      );
      console.log('Planet map created, element:', planetMap.el);
    }
    planetMap.update(gameData);
  }

  // Helper to switch to local view (planet + moons)
  function switchToLocalView(planetId: string) {
    console.log('Switching to local view:', planetId);
    selectedPlanetId = planetId;
    viewMode = 'local';
    orreryContainer.style.display = 'none';
    planetLocalContainer.style.display = '';
    planetMapContainer.style.display = 'none';
    title.textContent = 'Planet Local';

    if (!planetLocal) {
      console.log('Creating planet local component');
      planetLocal = createPlanetLocalComponent(
        planetLocalContainer,
        gameData,
        planetLocalCallbacks
      );
      console.log('Planet local created:', planetLocal.el);
    }
    planetLocal.update(gameData);
  }

  // Helper to switch back to system view
  function switchToSystemView() {
    viewMode = 'system';
    selectedPlanetId = null;
    orreryContainer.style.display = '';
    planetLocalContainer.style.display = 'none';
    planetMapContainer.style.display = 'none';
    title.textContent = 'System Map';
  }

  // Initialize view
  orreryContainer.style.display = '';

  return {
    el,
    update: (gameData: GameData) => {
      orrery.update(gameData);
      if (planetLocal && viewMode === 'local') {
        planetLocal.update(gameData);
      }
      if (planetMap && viewMode === 'planet') {
        planetMap.update(gameData);
      }
    },
  };
}

// ============================================================================
// FOOTER COMPONENT
// ============================================================================

function createFooter(
  _gameData: GameData,
  _callbacks: RendererCallbacks
): Component {
  const el = document.createElement('footer');
  el.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-panel, #0a0a12);
    border-top: 1px solid var(--border-color, #2a2a3a);
  `;

  // Center: Status
  const status = document.createElement('div');
  status.style.cssText =
    'font-size: 0.9rem; color: var(--text-secondary, #888);';
  status.textContent = 'TRAPPIST-1 System';
  el.appendChild(status);

  return {
    el,
    update: (_gameData: GameData) => {},
  };
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
    background: var(--bg-panel, #12121a);
    padding: 2rem;
    border-radius: 8px;
    max-width: 400px;
    width: 90%;
    border: 1px solid var(--border-color, #2a2a3a);
  `;

  content.innerHTML = `
    <h2 style="margin: 0 0 1rem 0; color: var(--accent-cyan, #00e5ff);">Settings</h2>
    
    <div style="margin-bottom: 1rem;">
      <button id="exportBtn" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem; background: #2a2a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
        Download Save
      </button>
      <button id="importBtn" style="width: 100%; padding: 0.75rem; margin-bottom: 0.5rem; background: #2a2a3a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
        Upload Save
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
    if (!saveData) return;
    const blob = new Blob([saveData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swarm-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  content.querySelector('#importBtn')!.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : '';
        if (!content) {
          alert('Failed to read save file.');
          return;
        }

        if (
          confirm(
            'Load this save file and replace current progress? This cannot be undone.'
          )
        ) {
          if (callbacks.onImportSave(content)) {
            alert('Save loaded successfully!');
            modal.remove();
          } else {
            alert('Invalid save file!');
          }
        }
      };
      reader.readAsText(file);
    });
    input.click();
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
// GLOBAL HANDLERS
// ============================================================================

declare global {
  interface Window {
    swarmCallbacks?: {
      setQueenDirective: (directive: 'gather_biomass' | 'idle') => void;
      toggleEggProduction: (enabled: boolean) => void;
      saveGame: () => void;
      loadGame: () => void;
      resetGame: () => void;
    };
  }
}
