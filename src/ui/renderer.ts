// Swarm Game Renderer - Component-based architecture
// Follows mount-once / update-on-tick pattern from component.ts

import {
  SWARM_CONSTANTS,
  type GameData,
  type Egg,
  type Worker,
  type Queen,
} from '../models/swarmTypes';
import {
  calculateSwarmAggregates,
  getEggProgress,
  getNurseryForQueen,
  getNurseryAvailableSpace,
  getEffectiveLayingTicks,
} from '../swarmSystem';
import { getMasteryLevel, getMasteryXpForLevel } from '../foragingSystem';
import {
  formatAtmosphericMass,
  formatPercentage,
  formatPressureIndex,
} from '../formatting';
import { derivePlanetAtmosphere } from '../planetAtmosphere';
import {
  calculateEnergyBalance,
  calculateCoordinationEfficiency,
  calculateNeuralLoad,
} from '../populationSystem';
import { formatTicksDualTime } from '../timeSystem';
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
  onLayEgg: () => void;
  onExportSave: () => string;
  onImportSave: (saveData: string) => boolean;
  onResetGame: () => void;
}

export type TabId = 'swarm' | 'planet' | 'system' | 'map' | 'log';

interface RendererState {
  activeTab: TabId;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

/** Pre-computed per-tick values shared across components. */
interface TickSnapshot {
  gameData: GameData;
  year: number;
  yearProgress: number;
  elapsedHours: number;
  aggregates: ReturnType<typeof calculateSwarmAggregates>;
}

/** Compute snapshot once per tick — avoids duplicate planet lookups and aggregate scans. */
function computeTickSnapshot(gameData: GameData): TickSnapshot {
  const homePlanet = gameData.planets.find(
    (p) => p.id === gameData.homePlanetId
  );
  const asimovDayLength = homePlanet?.dayLengthTicks ?? 480;
  const year = Math.floor(gameData.gameTime / asimovDayLength) + 1;
  const yearProgress = (gameData.gameTime % asimovDayLength) / asimovDayLength;
  const elapsedHours =
    (gameData.gameTime % asimovDayLength) / SWARM_CONSTANTS.TICKS_PER_HOUR;
  const aggregates = calculateSwarmAggregates(gameData.swarm);
  return { gameData, year, yearProgress, elapsedHours, aggregates };
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

  // Create main layout container (styles in style.css for responsive overrides)
  const layout = document.createElement('div');
  layout.className = 'swarm-layout';

  // Mount all components — single sidebar instance shared between grid & drawer
  const header = createHeader(gameData, callbacks);
  const leftSidebar = createLeftSidebar(gameData);
  const rightSidebar = createRightSidebar(gameData);
  const mainPanel = createMainPanel(
    gameData,
    state,
    callbacks,
    rightSidebar.el
  );
  const footer = createFooter(gameData, callbacks);
  const mobileHeader = createMobileHeader(gameData, callbacks);

  // Drawer overlay + container (inside layout for automatic cleanup)
  const overlay = document.createElement('div');
  overlay.className = 'swarm-drawer-overlay';

  const drawerEl = document.createElement('div');
  drawerEl.className = 'swarm-drawer';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'swarm-drawer-close';
  closeBtn.textContent = '\u2715'; // ✕
  closeBtn.setAttribute('aria-label', 'Close sidebar');
  drawerEl.appendChild(closeBtn);

  // Drawer sidebar placeholder — sidebar el is reparented here on open
  const drawerContent = document.createElement('div');
  drawerContent.className = 'swarm-drawer-content';
  drawerEl.appendChild(drawerContent);

  // Append all to layout (grid areas assigned via CSS class selectors)
  layout.appendChild(header.el);
  layout.appendChild(mobileHeader.el);
  layout.appendChild(leftSidebar.el);
  layout.appendChild(mainPanel.el);
  layout.appendChild(rightSidebar.el);
  layout.appendChild(footer.el);
  // Fixed-position elements work regardless of DOM ancestry
  layout.appendChild(overlay);
  layout.appendChild(drawerEl);

  // Helpers to open/close drawer — reparent sidebar el between grid and drawer
  function openDrawer() {
    drawerContent.appendChild(leftSidebar.el);
    drawerEl.classList.add('open');
    overlay.classList.add('open');
  }

  function closeDrawer() {
    drawerEl.classList.remove('open');
    overlay.classList.remove('open');
    // Return sidebar to grid position (appendChild detaches from old parent)
    layout.insertBefore(leftSidebar.el, mainPanel.el);
  }

  // Wire hamburger to drawer
  mobileHeader.el
    .querySelector('.mobile-hamburger')
    ?.addEventListener('click', openDrawer);

  overlay.addEventListener('click', closeDrawer);
  closeBtn.addEventListener('click', closeDrawer);

  // Close drawer on breakpoint cross to prevent stale open state
  const mobileQuery = window.matchMedia('(max-width: 900px)');
  const handleBreakpointChange = (e: MediaQueryListEvent) => {
    if (!e.matches) {
      closeDrawer();
    }
  };
  mobileQuery.addEventListener('change', handleBreakpointChange);

  container.appendChild(layout);

  if (typeof window !== 'undefined') {
    window.swarmCallbacks = {
      setQueenDirective: callbacks.onSetQueenDirective,
      toggleEggProduction: callbacks.onToggleEggProduction,
      layEgg: callbacks.onLayEgg,
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

  // Store reference for updates — snapshot computed once, shared across components
  const update = (gd: GameData) => {
    const snapshot = computeTickSnapshot(gd);
    header.update(gd);
    mobileHeader.update(snapshot);
    leftSidebar.update(snapshot);
    mainPanel.update(gd);
    rightSidebar.update(gd);
    footer.update(gd);
  };

  _currentLayout = layout;

  return {
    update,
    destroy: () => {
      mobileQuery.removeEventListener('change', handleBreakpointChange);
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
  el.className = 'swarm-header';

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

function createLeftSidebar(_gameData: GameData): Component<TickSnapshot> {
  const el = document.createElement('aside');
  el.className = 'left-sidebar';

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

  const eggsEl = document.createElement('div');
  eggsEl.style.cssText = 'display: flex; justify-content: space-between;';
  eggsEl.innerHTML =
    '<span>Eggs:</span><span style="font-weight: bold;">-</span>';
  statsContainer.appendChild(eggsEl);

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
  gatheringEl.textContent = 'Gathering biomass: -';
  distributionContainer.appendChild(gatheringEl);

  const maintenanceEl = document.createElement('div');
  maintenanceEl.textContent = 'Feeding: -';
  distributionContainer.appendChild(maintenanceEl);

  const idleEmptyEl = document.createElement('div');
  idleEmptyEl.textContent = 'Idle: -';
  distributionContainer.appendChild(idleEmptyEl);

  const idleFullEl = document.createElement('div');
  idleFullEl.textContent = 'Waiting to deliver: -';
  distributionContainer.appendChild(idleFullEl);

  distributionSection.appendChild(distributionContainer);
  el.appendChild(distributionSection);

  return {
    el,
    update: (snapshot: TickSnapshot) => {
      const { year, yearProgress, elapsedHours, aggregates } = snapshot;

      yearDisplay.textContent = `Year ${year}`;
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

      dayLabel.textContent = `${(yearProgress * 100).toFixed(1)}% - ${elapsedHours.toFixed(1)}h elapsed`;

      (workersEl.lastChild as HTMLElement).textContent = String(
        aggregates.totalWorkers
      );
      (eggsEl.lastChild as HTMLElement).textContent = String(
        aggregates.totalEggs
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
      gatheringEl.textContent = `Gathering biomass: ${aggregates.workerStates.gathering}`;
      maintenanceEl.textContent = `Feeding: ${aggregates.workerStates.selfMaintenance}`;
      idleEmptyEl.textContent = `Idle: ${aggregates.workerStates.idleEmpty}`;
      idleFullEl.textContent = `Waiting to deliver: ${aggregates.workerStates.idleCargoFull}`;
    },
  };
}

// ============================================================================
// MAIN PANEL COMPONENT - Tabs
// ============================================================================

function createMainPanel(
  _gameData: GameData,
  state: RendererState,
  callbacks: RendererCallbacks,
  rightSidebarEl: HTMLElement
): Component {
  const el = document.createElement('main');
  el.className = 'main-panel';

  // Tab buttons container
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'swarm-tab-bar';

  const tabButtons = new Map<TabId, HTMLButtonElement>();

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'swarm', label: 'Swarm' },
    { id: 'planet', label: 'Planet' },
    { id: 'system', label: 'System' },
    { id: 'map', label: 'Map' },
    { id: 'log', label: 'Log' },
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
  contentContainer.style.cssText = 'flex: 1; overflow-y: auto; min-height: 0;';

  const tabContents = new Map<TabId, HTMLElement>();

  // Create tab contents first so onclick handlers can reference them
  for (const { id } of tabs) {
    const content = document.createElement('div');
    content.style.display = id === state.activeTab ? 'block' : 'none';
    tabContents.set(id, content);
    contentContainer.appendChild(content);
  }

  // Map tab holds the reparented right sidebar — styled for inline display
  const mapTabContent = tabContents.get('map')!;
  mapTabContent.className = 'map-tab-inline';
  // The map tab button is hidden on desktop (right sidebar visible there)
  const mapTabBtn = tabButtons.get('map')!;
  mapTabBtn.className = 'map-tab-button';

  // Reparent the right sidebar content into / out of the map tab
  function syncMapTab(activeTab: TabId) {
    if (activeTab === 'map') {
      // Move right sidebar content into the map tab
      if (!mapTabContent.contains(rightSidebarEl)) {
        mapTabContent.appendChild(rightSidebarEl);
        rightSidebarEl.style.display = '';
      }
    }
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
        syncMapTab(id);
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
      // Update tab content based on active tab (skip 'map' — managed via reparenting)
      const activeTab = state.activeTab;
      for (const [id, content] of tabContents) {
        if (id === activeTab && id !== 'map') {
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
    case 'map':
      return ''; // Map tab content managed via DOM reparenting, not innerHTML
    case 'log':
      return createLogTabContent(gameData);
  }
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
        ${renderWorkerActivitySection(gameData)}
        <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
          <div style="font-size: 0.9rem; line-height: 1.8;">
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
  const biomassPct =
    queen.biomassBuffer.max > 0
      ? (queen.biomassBuffer.current / queen.biomassBuffer.max) * 100
      : 0;

  // Egg production status
  const ep = queen.eggProduction;
  const nursery = getNurseryForQueen(queen, gameData.swarm.structures);
  const nurserySpace = nursery
    ? getNurseryAvailableSpace(nursery, gameData.swarm.eggs)
    : 0;
  const nurseryCapacity = nursery?.capacity ?? 0;
  const nurseryUsed = nurseryCapacity - nurserySpace;

  let layingStatus: string;
  let layingStatusColor: string;
  if (ep.isLaying) {
    layingStatus = `Laying ${ep.layingProgress.toFixed(0)}%`;
    layingStatusColor = '#4caf50';
  } else if (ep.cooldownTicksRemaining > 0) {
    layingStatus = `Cooldown ${ep.cooldownTicksRemaining}s`;
    layingStatusColor = '#ff9800';
  } else if (!nursery || nurserySpace <= 0) {
    layingStatus = 'Nursery full';
    layingStatusColor = '#ff4444';
  } else if (queen.energy.current < SWARM_CONSTANTS.EGG_COST) {
    layingStatus = 'Low energy';
    layingStatusColor = '#ff4444';
  } else {
    layingStatus = 'Ready';
    layingStatusColor = '#4caf50';
  }

  // Lay Egg button: enabled during laying (speed up) or cooldown (shorten),
  // or when ready to start a new lay
  const canLayEgg =
    ep.isLaying ||
    ep.cooldownTicksRemaining > 0 ||
    (queen.energy.current >= SWARM_CONSTANTS.EGG_COST && nurserySpace > 0);
  const layBtnStyle = canLayEgg
    ? 'background: var(--accent-cyan, #00e5ff); color: #0a0a0f; cursor: pointer;'
    : 'background: #1a1a2a; color: #555; cursor: not-allowed;';

  // Brood skill display
  const effectiveLayTicks = getEffectiveLayingTicks(queen);
  const broodSkillDisplay = queen.broodSkill.toFixed(1);

  // Mastery display
  const workerMasteryLevel = getMasteryLevel(queen.broodMastery.worker);
  const workerMasteryXp = Math.floor(queen.broodMastery.worker);
  const nextLevelXp = getMasteryXpForLevel(workerMasteryLevel + 1);

  // Nursery eggs display
  const queenEggs = gameData.swarm.eggs.filter(
    (e: Egg) => e.queenId === queen.id
  );
  const eggListHtml =
    queenEggs.length > 0
      ? queenEggs
          .map((egg: Egg) => {
            const progress = getEggProgress(egg, queen);
            const phaseLabel = egg.phase === 'incubating' ? 'Inc' : 'Mat';
            const phaseColor =
              egg.phase === 'incubating' ? '#2196f3' : '#ff9800';
            return `<div style="display: flex; align-items: center; gap: 0.5rem; white-space: nowrap;">
          <span style="color: ${phaseColor}; font-size: 0.8rem; min-width: 28px;">${phaseLabel}</span>
          <div style="flex: 1; background: #2a2a3a; height: 6px; border-radius: 3px; overflow: hidden;">
            <div style="background: ${phaseColor}; height: 100%; width: ${progress.toFixed(0)}%;"></div>
          </div>
          <span style="font-size: 0.75rem; color: #888; min-width: 32px; text-align: right;">${progress.toFixed(0)}%</span>
        </div>`;
          })
          .join('')
      : '<div style="font-size: 0.82rem; color: #555;">No eggs — enable egg production to grow your colony</div>';

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
            <div class="stat-bar__label">Biomass Buffer ${queen.biomassBuffer.current.toFixed(1)} / ${queen.biomassBuffer.max.toFixed(0)}</div>
            <div class="stat-bar__track">
              <div class="stat-bar__fill ${biomassPct > 40 ? 'bar-good' : biomassPct > 15 ? 'bar-warning' : 'bar-danger'}" style="width: ${Math.max(0, Math.min(100, biomassPct))}%;"></div>
            </div>
          </div>
          <div class="stat-bar stat-bar--compact">
            <div class="stat-bar__label">Health ${queen.health.current.toFixed(1)} / ${queen.health.max.toFixed(0)}</div>
            <div class="stat-bar__track">
              <div class="stat-bar__fill ${healthPct > 40 ? 'bar-good' : healthPct > 15 ? 'bar-warning' : 'bar-danger'}" style="width: ${Math.max(0, Math.min(100, healthPct))}%;"></div>
            </div>
          </div>
          ${renderQueenEconomySection(queen, gameData.swarm.workers)}
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
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; flex: 1;">
            <input
              type="checkbox"
              ${ep.enabled ? 'checked' : ''}
              onchange="window.swarmCallbacks?.toggleEggProduction(this.checked)"
              style="width: 18px; height: 18px;"
            >
            <span style="font-size: 0.9rem;">Auto (${SWARM_CONSTANTS.EGG_COST} energy/egg)</span>
          </label>
          <button
            onclick="window.swarmCallbacks?.layEgg()"
            ${canLayEgg ? '' : 'disabled'}
            style="
              padding: 0.4rem 0.8rem;
              border: none;
              border-radius: 4px;
              font-size: 0.85rem;
              font-weight: 600;
              ${layBtnStyle}
            "
            title="${ep.isLaying ? 'Tap to speed up laying' : ep.cooldownTicksRemaining > 0 ? 'Tap to speed up cooldown' : 'Lay an egg now'}"
          >
            ${ep.isLaying ? 'Speed Up' : ep.cooldownTicksRemaining > 0 ? 'Speed Up' : 'Lay Egg'}
          </button>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <span style="font-size: 0.82rem; color: ${layingStatusColor}; white-space: nowrap;">${layingStatus}</span>
          ${
            ep.isLaying
              ? `
            <div style="flex: 1; background: #2a2a3a; height: 6px; border-radius: 3px; overflow: hidden;">
              <div style="background: #4caf50; height: 100%; width: ${ep.layingProgress}%;"></div>
            </div>
          `
              : ''
          }
        </div>
        <div style="font-size: 0.78rem; color: #666; display: flex; gap: 1rem; flex-wrap: wrap;">
          <span style="white-space: nowrap;">Brood Skill: ${broodSkillDisplay}</span>
          <span style="white-space: nowrap;">Lay Speed: ${effectiveLayTicks.toFixed(1)}s</span>
          <span style="white-space: nowrap;">Worker Mastery: Lv.${workerMasteryLevel} (${workerMasteryXp}/${nextLevelXp} XP)</span>
        </div>
      </div>

      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Nursery (${nurseryUsed}/${nurseryCapacity})</h3>
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          ${eggListHtml}
        </div>
      </div>

      ${renderWorkerActivitySection(gameData)}
    </div>
  `;
}

function getWorkerGatherRate(worker: Worker): number {
  const skillMod = 1 + worker.skills.foraging / 100;
  const masteryMod = 1 + worker.skills.mastery.surfaceLichen / 200;
  return SWARM_CONSTANTS.BASE_GATHER_RATE * skillMod * masteryMod;
}

function renderQueenEconomySection(queen: Queen, workers: Worker[]): string {
  const neuralLoad = calculateNeuralLoad(workers.length, queen.neuralCapacity);
  const efficiency = calculateCoordinationEfficiency(neuralLoad);
  const balance = calculateEnergyBalance(workers, [queen], efficiency);

  const incomePerDay = balance.production * SWARM_CONSTANTS.TICKS_PER_DAY;
  const metabolismPerDay = balance.consumption * SWARM_CONSTANTS.TICKS_PER_DAY;
  const netPerDay = balance.net * SWARM_CONSTANTS.TICKS_PER_DAY;

  const netColor =
    netPerDay > 0 ? '#4caf50' : netPerDay < 0 ? '#ff4444' : '#888';
  const netSign = netPerDay > 0 ? '+' : '';

  // Total stored = biomass buffer + energy (both represent food reserves)
  const totalStored = queen.biomassBuffer.current + queen.energy.current;
  const totalCapacity = queen.biomassBuffer.max + queen.energy.max;

  // ETA: time to depletion or time to full (based on total reserves)
  let etaHtml = '';
  if (balance.net < 0 && totalStored > 0) {
    const ticksToEmpty = totalStored / Math.abs(balance.net);
    etaHtml = `<div style="color: #ff4444; white-space: nowrap;">Depletes in ${formatTicksDualTime(Math.ceil(ticksToEmpty))}</div>`;
  } else if (balance.net > 0 && totalStored < totalCapacity) {
    const ticksToFull = (totalCapacity - totalStored) / balance.net;
    etaHtml = `<div style="color: #4caf50; white-space: nowrap;">Full in ${formatTicksDualTime(Math.ceil(ticksToFull))}</div>`;
  }

  const storedColor =
    totalStored > totalCapacity * 0.4
      ? '#4caf50'
      : totalStored > totalCapacity * 0.15
        ? '#ffc107'
        : '#ff4444';

  return `
    <div style="font-size: 0.82rem; color: var(--text-secondary, #888); display: flex; flex-direction: column; gap: 0.2rem;">
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <span style="white-space: nowrap;">Reserves: <span style="color: ${storedColor}; font-weight: bold;">${totalStored.toFixed(1)}</span> / ${totalCapacity.toFixed(0)} biomass</span>
      </div>
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <span style="white-space: nowrap;">Gathering: <span style="color: #4caf50;">${incomePerDay.toFixed(1)}</span>/day</span>
        <span style="white-space: nowrap;">Metabolism: <span style="color: #ffc107;">${metabolismPerDay.toFixed(1)}</span>/day</span>
        <span style="white-space: nowrap;">Net: <span style="color: ${netColor}; font-weight: bold;">${netSign}${netPerDay.toFixed(1)}</span>/day</span>
      </div>
      ${etaHtml}
    </div>`;
}

function renderWorkerActivitySection(gameData: GameData): string {
  const aggregates = calculateSwarmAggregates(gameData.swarm);
  const total = aggregates.totalWorkers;

  if (total === 0) {
    return `
      <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px;">
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Workers</h3>
        <div style="font-size: 0.9rem; color: var(--text-secondary, #888);">No workers yet — lay eggs to grow your colony</div>
      </div>`;
  }

  const states = aggregates.workerStates;
  const lines: string[] = [];

  if (states.gathering > 0) {
    // Find the gathering worker closest to delivering (most cargo)
    const gatheringWorkers = gameData.swarm.workers.filter(
      (w) => w.state === 'gathering'
    );
    let nextDeliveryHtml = '';
    if (gatheringWorkers.length > 0) {
      let minTicksToFull = Infinity;
      for (const w of gatheringWorkers) {
        const remaining = w.cargo.max - w.cargo.current;
        if (remaining > 0) {
          const rate = getWorkerGatherRate(w);
          const ticks = remaining / rate;
          if (ticks < minTicksToFull) minTicksToFull = ticks;
        }
      }
      if (minTicksToFull < Infinity) {
        nextDeliveryHtml = `<span style="color: var(--text-secondary, #888); font-size: 0.8rem; white-space: nowrap;">next delivery ~${formatTicksDualTime(Math.ceil(minTicksToFull))}</span>`;
      }
    }

    lines.push(`<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.25rem;">
      <span style="color: #4caf50; white-space: nowrap;">Gathering biomass</span>
      <span style="display: flex; align-items: center; gap: 0.5rem;">
        ${nextDeliveryHtml}
        <span style="font-weight: bold; white-space: nowrap;">${states.gathering}</span>
      </span>
    </div>`);
  }
  if (states.selfMaintenance > 0) {
    lines.push(`<div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #ffc107; white-space: nowrap;">Feeding</span>
      <span style="font-weight: bold; white-space: nowrap;">${states.selfMaintenance}</span>
    </div>`);
  }
  if (states.idleCargoFull > 0) {
    lines.push(`<div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #ff9800; white-space: nowrap;">Waiting to deliver</span>
      <span style="font-weight: bold; white-space: nowrap;">${states.idleCargoFull}</span>
    </div>`);
  }
  if (states.idleEmpty > 0) {
    lines.push(`<div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #888; white-space: nowrap;">Idle</span>
      <span style="font-weight: bold; white-space: nowrap;">${states.idleEmpty}</span>
    </div>`);
  }

  return `
    <div style="background: var(--bg-panel, #12121a); padding: 1rem; border-radius: 8px;">
      <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Workers <span style="color: var(--text-secondary, #888); font-weight: normal;">(${total})</span></h3>
      <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.9rem;">
        ${lines.join('')}
      </div>
    </div>`;
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
  el.className = 'swarm-footer';

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
// MOBILE HEADER COMPONENT - Glance-level stats for <=900px
// ============================================================================

function createMobileHeader(
  _gameData: GameData,
  callbacks: RendererCallbacks
): Component<TickSnapshot> {
  const el = document.createElement('div');
  el.className = 'swarm-mobile-header';

  // Hamburger button
  const hamburger = document.createElement('button');
  hamburger.className = 'mobile-hamburger';
  hamburger.textContent = '\u2630'; // ☰
  hamburger.setAttribute('aria-label', 'Open sidebar');
  el.appendChild(hamburger);

  // Year stat
  const yearStat = document.createElement('div');
  yearStat.className = 'mobile-header-stat';
  yearStat.innerHTML =
    '<span class="mobile-header-label">Year</span>' +
    '<span class="mobile-header-value">1</span>';
  el.appendChild(yearStat);

  // Workers stat
  const workersStat = document.createElement('div');
  workersStat.className = 'mobile-header-stat';
  workersStat.innerHTML =
    '<span class="mobile-header-label">Workers</span>' +
    '<span class="mobile-header-value">0</span>';
  el.appendChild(workersStat);

  // Queens stat
  const queensStat = document.createElement('div');
  queensStat.className = 'mobile-header-stat';
  queensStat.innerHTML =
    '<span class="mobile-header-label">Queens</span>' +
    '<span class="mobile-header-value">0</span>';
  el.appendChild(queensStat);

  // Play/Pause button
  const playPause = document.createElement('button');
  playPause.className = 'mobile-header-playpause';
  playPause.textContent = '\u23F8'; // ⏸
  playPause.setAttribute('aria-label', 'Toggle pause');
  playPause.addEventListener('click', () => {
    callbacks.onTogglePause();
  });
  el.appendChild(playPause);

  const yearValueEl = yearStat.querySelector(
    '.mobile-header-value'
  ) as HTMLElement;
  const workersValueEl = workersStat.querySelector(
    '.mobile-header-value'
  ) as HTMLElement;
  const queensValueEl = queensStat.querySelector(
    '.mobile-header-value'
  ) as HTMLElement;

  return {
    el,
    update: (snapshot: TickSnapshot) => {
      yearValueEl.textContent = String(snapshot.year);
      workersValueEl.textContent = String(snapshot.aggregates.totalWorkers);
      queensValueEl.textContent = String(snapshot.aggregates.totalQueens);
    },
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
      layEgg: () => void;
      saveGame: () => void;
      loadGame: () => void;
      resetGame: () => void;
    };
  }
}
