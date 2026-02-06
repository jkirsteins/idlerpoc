import './style.css';
import type { ShipClassId } from './models';
import { createNewGame } from './gameFactory';
import { saveGame, loadGame, clearGame } from './storage';
import { render, type GameState, type RendererCallbacks } from './ui/renderer';
import type { WizardStep, WizardDraft } from './ui/wizard';
import { applyTick } from './gameTick';

const app = document.getElementById('app')!;

let state: GameState = initializeState();
let tickInterval: number | null = null;

function initializeState(): GameState {
  const gameData = loadGame();
  if (gameData) {
    return { phase: 'playing', gameData, activeTab: 'ship' };
  }
  return { phase: 'no_game' };
}

const callbacks: RendererCallbacks = {
  onStartCreate: () => {
    state = { phase: 'creating', step: 'captain_name', draft: {} };
    renderApp();
  },

  onWizardComplete: (
    captainName: string,
    shipName: string,
    shipClassId: ShipClassId
  ) => {
    const gameData = createNewGame(captainName, shipName, shipClassId);
    saveGame(gameData);
    state = { phase: 'playing', gameData, activeTab: 'ship' };
    renderApp();
  },

  onWizardCancel: () => {
    state = { phase: 'no_game' };
    renderApp();
  },

  onReset: () => {
    clearGame();
    state = { phase: 'no_game' };
    renderApp();
  },

  onTabChange: (tab) => {
    if (state.phase === 'playing') {
      state = { ...state, activeTab: tab };
      renderApp();
    }
  },

  onCrewAssign: (crewId, roomId) => {
    if (state.phase !== 'playing') return;

    // Remove crew from any existing room
    for (const room of state.gameData.ship.rooms) {
      const index = room.assignedCrewIds.indexOf(crewId);
      if (index !== -1) {
        room.assignedCrewIds.splice(index, 1);
      }
    }

    // Add crew to target room
    const targetRoom = state.gameData.ship.rooms.find((r) => r.id === roomId);
    if (targetRoom && !targetRoom.assignedCrewIds.includes(crewId)) {
      targetRoom.assignedCrewIds.push(crewId);
    }

    saveGame(state.gameData);
    renderApp();
  },

  onCrewUnassign: (crewId, roomId) => {
    if (state.phase !== 'playing') return;

    const room = state.gameData.ship.rooms.find((r) => r.id === roomId);
    if (room) {
      const index = room.assignedCrewIds.indexOf(crewId);
      if (index !== -1) {
        room.assignedCrewIds.splice(index, 1);
      }
    }

    saveGame(state.gameData);
    renderApp();
  },

  onUndock: () => {
    if (state.phase !== 'playing') return;

    state.gameData.ship.location.status = 'in_flight';
    delete state.gameData.ship.location.dockedAt;

    // Auto-start engine warmup when undocking
    state.gameData.ship.engine.state = 'warming_up';
    state.gameData.ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onDock: () => {
    if (state.phase !== 'playing') return;

    state.gameData.ship.location.status = 'docked';
    state.gameData.ship.location.dockedAt = 'Earth';

    // Turn off engine when docking
    state.gameData.ship.engine.state = 'off';
    state.gameData.ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onEngineOn: () => {
    if (state.phase !== 'playing') return;
    if (state.gameData.ship.location.status === 'docked') return;

    state.gameData.ship.engine.state = 'warming_up';
    state.gameData.ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onEngineOff: () => {
    if (state.phase !== 'playing') return;

    state.gameData.ship.engine.state = 'off';
    state.gameData.ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onToggleNavigation: () => {
    if (state.phase !== 'playing') return;

    state = {
      ...state,
      showNavigation: !state.showNavigation,
    };
    renderApp();
  },
};

window.addEventListener('wizard-next', ((
  event: CustomEvent<{ step: WizardStep; draft: WizardDraft }>
) => {
  state = {
    phase: 'creating',
    step: event.detail.step,
    draft: event.detail.draft,
  };
  renderApp();
}) as EventListener);

function startTickSystem(): void {
  if (tickInterval !== null) return; // Already running

  tickInterval = window.setInterval(() => {
    if (state.phase === 'playing') {
      const changed = applyTick(state.gameData);
      if (changed) {
        saveGame(state.gameData);
        renderApp();
      }
    }
  }, 1000);
}

function stopTickSystem(): void {
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function renderApp(): void {
  render(app, state, callbacks);

  // Manage tick system based on game phase
  if (state.phase === 'playing') {
    startTickSystem();
  } else {
    stopTickSystem();
  }
}

renderApp();
