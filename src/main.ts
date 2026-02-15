// TRAPPIST-1 Swarm Idle - Main Entry Point

import './style.css';
import type { GameData } from './models/swarmTypes';
import { createNewGame, loadGame, saveGame } from './gameFactory';
import { applyTick } from './gameTickSwarm';
import { render, type Renderer } from './ui/renderer';

const app = document.getElementById('app')!;

// Game state
let gameData: GameData | null = null;
let tickInterval: number | null = null;
let isPaused = false;
let renderer: Renderer | null = null;
let hiddenTimestampMs: number | null = null;
let isCatchUpRunning = false;

interface CatchUpTotals {
  workersHatched: number;
  workersDied: number;
  queensDied: number;
  eggsLaid: number;
  logEntries: number;
}

interface ActiveCatchUp {
  totalTicks: number;
  processedTicks: number;
  elapsedSeconds: number;
  totals: CatchUpTotals;
}

interface CatchUpOverlay {
  root: HTMLDivElement;
  fill: HTMLDivElement;
  label: HTMLDivElement;
}

let activeCatchUp: ActiveCatchUp | null = null;
let catchUpOverlay: CatchUpOverlay | null = null;

const CATCH_UP_BATCH_SIZE = 2000;
const FULL_RATE_CATCH_UP_SECONDS = 4 * 3600;
const CATCH_UP_SUMMARY_THRESHOLD_SECONDS = 30;

/** Debug speed multiplier from ?debugspeed=N query param */
function getDebugSpeedMultiplier(): number {
  const param = new URLSearchParams(window.location.search).get('debugspeed');
  const n = param ? Number(param) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function computeCatchUpTicks(elapsedSeconds: number): number {
  const debugSpeed = getDebugSpeedMultiplier();
  if (elapsedSeconds <= FULL_RATE_CATCH_UP_SECONDS) {
    return Math.floor(elapsedSeconds * debugSpeed);
  }

  const fullTicks = FULL_RATE_CATCH_UP_SECONDS * debugSpeed;
  const extraSeconds = elapsedSeconds - FULL_RATE_CATCH_UP_SECONDS;
  const k = FULL_RATE_CATCH_UP_SECONDS;
  const extraTicks = k * Math.log(1 + extraSeconds / k) * debugSpeed;
  return Math.floor(fullTicks + extraTicks);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(): void {
  // Try to load saved game
  const savedData = localStorage.getItem('swarmSave');

  if (savedData) {
    const loaded = loadGame(savedData);
    if (loaded) {
      gameData = loaded;
      console.log('Loaded saved game');
    } else {
      // Invalid save, start new
      gameData = createNewGame();
      console.log('Invalid save, starting new game');
    }
  } else {
    // No save, start new
    gameData = createNewGame();
    console.log('Starting new game');
  }

  // Initial render (mount once)
  renderer = renderGame();

  // Initial catch-up from saved timestamp
  if (gameData) {
    const elapsedSeconds = Math.floor(
      Math.max(0, Date.now() - gameData.lastTickTimestamp) / 1000
    );
    startCatchUp(elapsedSeconds);
  }

  // Start tick loop
  startTickLoop();

  // Handle visibility change for catch-up
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Save on unload
  window.addEventListener('beforeunload', saveCurrentGame);
}

// ============================================================================
// TICK LOOP
// ============================================================================

function startTickLoop(): void {
  if (tickInterval) return;

  const debugSpeed = getDebugSpeedMultiplier();
  const frameIntervalMs = 100;
  const msPerGameTick = 1000;
  const maxTicksPerFrame = 100;
  let lastFrameMs = Date.now();
  let carriedGameMs = 0;
  let saveTickAccumulator = 0;

  tickInterval = window.setInterval(() => {
    if (!isPaused && gameData && !isCatchUpRunning) {
      const now = Date.now();
      const elapsedRealMs = now - lastFrameMs;
      lastFrameMs = now;

      carriedGameMs += elapsedRealMs * debugSpeed;
      const ticksToProcess = Math.min(
        maxTicksPerFrame,
        Math.floor(carriedGameMs / msPerGameTick)
      );

      if (ticksToProcess <= 0) return;
      carriedGameMs -= ticksToProcess * msPerGameTick;

      applyTick(gameData, now, ticksToProcess);

      // Save every 30 in-game seconds
      saveTickAccumulator += ticksToProcess;
      if (saveTickAccumulator >= 30) {
        saveTickAccumulator = 0;
        saveCurrentGame();
      }

      // Update UI in-place (no full re-render)
      if (renderer) {
        renderer.update(gameData);
      }
    } else {
      lastFrameMs = Date.now();
    }
  }, frameIntervalMs);
}

// ============================================================================
// VISIBILITY & CATCH-UP
// ============================================================================

function handleVisibilityChange(): void {
  if (!gameData) return;

  if (document.hidden) {
    hiddenTimestampMs = Date.now();
    // Tab hidden - save state
    saveCurrentGame();
  } else {
    const now = Date.now();
    const elapsedSeconds = hiddenTimestampMs
      ? Math.floor(Math.max(0, now - hiddenTimestampMs) / 1000)
      : Math.floor(Math.max(0, now - gameData.lastTickTimestamp) / 1000);
    hiddenTimestampMs = null;
    startCatchUp(elapsedSeconds);
  }
}

function createCatchUpOverlay(totalTicks: number): CatchUpOverlay {
  const root = document.createElement('div');
  root.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1200; display: flex; align-items: center; justify-content: center;';

  const card = document.createElement('div');
  card.style.cssText =
    'width: min(420px, 92vw); background: #11131b; border: 1px solid #2a2f42; border-radius: 10px; padding: 1rem; color: #e6ebff;';

  const title = document.createElement('div');
  title.textContent = 'Replaying absence...';
  title.style.cssText =
    'font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; color: #00e5ff;';

  const track = document.createElement('div');
  track.style.cssText =
    'height: 10px; border-radius: 999px; background: #1f2538; overflow: hidden;';

  const fill = document.createElement('div');
  fill.style.cssText =
    'height: 100%; width: 0%; background: linear-gradient(90deg, #00c6ff 0%, #4f7cff 100%); transition: width 120ms linear;';
  track.appendChild(fill);

  const label = document.createElement('div');
  label.textContent = `0 / ${totalTicks} seconds`;
  label.style.cssText =
    'margin-top: 0.5rem; font-size: 0.82rem; color: #9da7cc;';

  card.appendChild(title);
  card.appendChild(track);
  card.appendChild(label);
  root.appendChild(card);
  document.body.appendChild(root);

  return { root, fill, label };
}

function updateCatchUpOverlay(processed: number, total: number): void {
  if (!catchUpOverlay) return;
  const pct = total > 0 ? Math.min(100, (processed / total) * 100) : 100;
  catchUpOverlay.fill.style.width = `${pct.toFixed(1)}%`;
  catchUpOverlay.label.textContent = `${processed.toLocaleString()} / ${total.toLocaleString()} seconds (${pct.toFixed(1)}%)`;
}

function removeCatchUpOverlay(): void {
  if (!catchUpOverlay) return;
  catchUpOverlay.root.remove();
  catchUpOverlay = null;
}

function showCatchUpSummary(
  totalTicks: number,
  elapsedSeconds: number,
  totals: CatchUpTotals
): void {
  if (elapsedSeconds < CATCH_UP_SUMMARY_THRESHOLD_SECONDS) return;

  const modal = document.createElement('div');
  modal.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 1201; display: flex; align-items: center; justify-content: center;';

  const card = document.createElement('div');
  card.style.cssText =
    'width: min(460px, 92vw); background: #11131b; border: 1px solid #2a2f42; border-radius: 10px; padding: 1rem; color: #e6ebff;';
  card.innerHTML = `
    <h3 style="margin: 0 0 0.75rem 0; color: #00e5ff;">While you were away...</h3>
    <div style="font-size: 0.9rem; line-height: 1.6; color: #c6cee9;">
      <div>Replayed: ${totalTicks.toLocaleString()} in-game seconds</div>
      <div>Elapsed: ${Math.floor(elapsedSeconds / 3600)}h ${Math.floor((elapsedSeconds % 3600) / 60)}m</div>
      <div>Events logged: ${totals.logEntries.toLocaleString()}</div>
      <div>Workers hatched: ${totals.workersHatched.toLocaleString()}</div>
      <div>Worker losses: ${totals.workersDied.toLocaleString()}</div>
      <div>Queen losses: ${totals.queensDied.toLocaleString()}</div>
    </div>
    <button id="closeCatchUpSummary" style="margin-top: 1rem; width: 100%; padding: 0.7rem; border: 1px solid #364064; background: #1a2032; color: #dbe6ff; border-radius: 6px; cursor: pointer;">Close</button>
  `;
  modal.appendChild(card);
  document.body.appendChild(modal);

  card
    .querySelector('#closeCatchUpSummary')
    ?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

function startCatchUp(elapsedSeconds: number): void {
  if (!gameData || isPaused || isCatchUpRunning) return;

  const totalTicks = computeCatchUpTicks(elapsedSeconds);
  if (totalTicks <= 0) return;

  isCatchUpRunning = true;
  activeCatchUp = {
    totalTicks,
    processedTicks: 0,
    elapsedSeconds,
    totals: {
      workersHatched: 0,
      workersDied: 0,
      queensDied: 0,
      eggsLaid: 0,
      logEntries: 0,
    },
  };
  catchUpOverlay = createCatchUpOverlay(totalTicks);
  updateCatchUpOverlay(0, totalTicks);

  const processBatch = (): void => {
    if (!gameData || !activeCatchUp) {
      isCatchUpRunning = false;
      removeCatchUpOverlay();
      return;
    }

    const remaining = activeCatchUp.totalTicks - activeCatchUp.processedTicks;
    const batchTicks = Math.min(CATCH_UP_BATCH_SIZE, remaining);

    const result = applyTick(gameData, Date.now(), batchTicks);
    activeCatchUp.processedTicks += batchTicks;
    activeCatchUp.totals.workersHatched += result.workersHatched;
    activeCatchUp.totals.workersDied += result.workersDied;
    activeCatchUp.totals.queensDied += result.queensDied;
    activeCatchUp.totals.eggsLaid += result.eggsLaid;
    activeCatchUp.totals.logEntries += result.logEntries.length;

    if (renderer) renderer.update(gameData);
    updateCatchUpOverlay(
      activeCatchUp.processedTicks,
      activeCatchUp.totalTicks
    );

    if (activeCatchUp.processedTicks >= activeCatchUp.totalTicks) {
      const finished = activeCatchUp;
      activeCatchUp = null;
      isCatchUpRunning = false;
      removeCatchUpOverlay();
      saveCurrentGame();
      showCatchUpSummary(
        finished.totalTicks,
        finished.elapsedSeconds,
        finished.totals
      );
      return;
    }

    setTimeout(processBatch, 0);
  };

  setTimeout(processBatch, 0);
}

// ============================================================================
// SAVE/LOAD
// ============================================================================

function saveCurrentGame(): void {
  if (gameData) {
    const saveString = saveGame(gameData);
    localStorage.setItem('swarmSave', saveString);
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderGame(): Renderer {
  if (!gameData) {
    throw new Error('No game data');
  }

  return render(app, gameData, {
    onTogglePause,
    onSetQueenDirective,
    onToggleEggProduction,
    onExportSave,
    onImportSave,
    onResetGame,
  });
}

// ============================================================================
// CALLBACKS
// ============================================================================

function onTogglePause(): void {
  isPaused = !isPaused;
  if (gameData) {
    gameData.isPaused = isPaused;
  }
}

function onSetQueenDirective(directive: 'gather_biomass' | 'idle'): void {
  if (!gameData) return;

  const queen = gameData.swarm.queens[0];
  if (queen) {
    queen.directive = directive;
  }
}

function onToggleEggProduction(enabled: boolean): void {
  if (!gameData) return;

  const queen = gameData.swarm.queens[0];
  if (queen) {
    queen.eggProduction.enabled = enabled;
  }
}

function onExportSave(): string {
  if (!gameData) return '';
  return saveGame(gameData);
}

function onImportSave(saveData: string): boolean {
  const loaded = loadGame(saveData);
  if (loaded) {
    gameData = loaded;
    hiddenTimestampMs = null;
    saveCurrentGame();
    // Re-render on import
    if (renderer) {
      renderer.destroy();
    }
    renderer = renderGame();
    return true;
  }
  return false;
}

function onResetGame(): void {
  if (confirm('Start a new game? All progress will be lost.')) {
    localStorage.removeItem('swarmSave');
    gameData = createNewGame();
    hiddenTimestampMs = null;
    // Re-render on reset
    if (renderer) {
      renderer.destroy();
    }
    renderer = renderGame();
  }
}

// ============================================================================
// START
// ============================================================================

// eslint-disable-next-line top/no-top-level-side-effects
if (typeof window !== 'undefined') {
  init();

  // Expose for debugging
  (window as unknown as { gameData: GameData }).gameData = gameData!;
}
