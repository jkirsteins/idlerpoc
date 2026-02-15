// TRAPPIST-1 Swarm Idle - Main Entry Point

import './style.css';
import type { GameData } from './models/swarmTypes';
import { createNewGame, loadGame, saveGame } from './gameFactory';
import { applyTick, processCatchUp } from './gameTickSwarm';
import { render } from './ui/renderer';

const app = document.getElementById('app')!;

// Game state
let gameData: GameData | null = null;
let tickInterval: number | null = null;
let isPaused = false;

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

  // Initial render
  renderGame();

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

  tickInterval = window.setInterval(() => {
    if (!isPaused && gameData) {
      const result = applyTick(gameData, Date.now());

      // Log significant events
      if (result.logEntries.length > 0) {
        // Events logged to gameData.log automatically
      }

      // Save periodically (every 30 seconds)
      if (gameData.gameTime % 30 === 0) {
        saveCurrentGame();
      }

      // Render
      renderGame();
    }
  }, 1000); // 1 tick per second
}

// ============================================================================
// VISIBILITY & CATCH-UP
// ============================================================================

function handleVisibilityChange(): void {
  if (!gameData) return;

  if (document.hidden) {
    // Tab hidden - save state
    saveCurrentGame();
  } else {
    // Tab visible - process catch-up
    const result = processCatchUp(gameData, Date.now());

    if (result.logEntries.length > 0) {
      // Show catch-up summary (could add modal here)
      console.log('Catch-up processed:', result);
    }

    renderGame();
  }
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

function renderGame(): void {
  if (!gameData) return;

  render(app, gameData, {
    onTogglePause,
    onSetTimeSpeed,
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
  renderGame();
}

function onSetTimeSpeed(speed: 1 | 2 | 5): void {
  if (gameData) {
    gameData.timeSpeed = speed;
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
    saveCurrentGame();
    renderGame();
    return true;
  }
  return false;
}

function onResetGame(): void {
  if (confirm('Start a new game? All progress will be lost.')) {
    localStorage.removeItem('swarmSave');
    gameData = createNewGame();
    renderGame();
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
