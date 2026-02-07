import './style.css';
import type { ShipClassId, SkillId, GameData, CrewEquipmentId } from './models';
import { createNewGame, generateHireableCrew } from './gameFactory';
import { saveGame, loadGame, clearGame } from './storage';
import { render, type GameState, type RendererCallbacks } from './ui/renderer';
import type { WizardStep, WizardDraft } from './ui/wizard';
import { applyTick, deductCrewSalaries } from './gameTick';
import { getLevelForXP } from './levelSystem';
import { deduceRoleFromSkills } from './crewRoles';
import {
  advanceToNextDayStart,
  getDaysSinceEpoch,
  GAME_SECONDS_PER_DAY,
} from './timeSystem';
import { generateAllLocationQuests } from './questGen';
import {
  acceptQuest,
  pauseContract,
  resumeContract,
  abandonContract,
} from './contractExec';
import { addLog } from './logSystem';
import { getCrewEquipmentDefinition } from './crewEquipment';
import {
  applyGravityRecovery,
  getGravityDegradationLevel,
} from './gravitySystem';

const app = document.getElementById('app')!;

let state: GameState = initializeState();
let tickInterval: number | null = null;

/**
 * Fast-forward game state based on elapsed real-world time
 */
function fastForwardTicks(gameData: GameData): void {
  const now = Date.now();
  const elapsedMs = now - gameData.lastTickTimestamp;
  const elapsedTicks = Math.floor(elapsedMs / 1000); // 1 tick = 1 second

  if (elapsedTicks > 0) {
    console.log(`Fast-forwarding ${elapsedTicks} ticks...`);

    // Apply up to 1000 ticks at once (safety limit)
    const ticksToApply = Math.min(elapsedTicks, 1000);

    for (let i = 0; i < ticksToApply; i++) {
      applyTick(gameData);
    }

    // Update timestamp to current time
    gameData.lastTickTimestamp = now;
    saveGame(gameData);

    console.log(`Fast-forward complete. Game time: ${gameData.gameTime}s`);
  }
}

function initializeState(): GameState {
  const gameData = loadGame();
  if (gameData) {
    // Fast-forward ticks based on elapsed real-world time
    fastForwardTicks(gameData);
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
    state.gameData.ship.location.dockedAt = 'earth';

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

  onSelectCrew: (crewId) => {
    if (state.phase !== 'playing') return;

    state = {
      ...state,
      selectedCrewId: crewId,
    };
    renderApp();
  },

  onLevelUp: (crewId) => {
    if (state.phase !== 'playing') return;

    const crew = state.gameData.ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    const newLevel = getLevelForXP(crew.xp);
    const levelsGained = newLevel - crew.level;

    if (levelsGained > 0) {
      crew.level = newLevel;
      crew.unspentSkillPoints += levelsGained;

      saveGame(state.gameData);
      renderApp();
    }
  },

  onAssignSkillPoint: (crewId, skillId) => {
    if (state.phase !== 'playing') return;

    const crew = state.gameData.ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    if (crew.unspentSkillPoints > 0 && crew.skills[skillId as SkillId] < 10) {
      crew.skills[skillId as SkillId]++;
      crew.unspentSkillPoints--;

      // Update role based on new skill distribution (unless captain)
      if (!crew.isCaptain) {
        crew.role = deduceRoleFromSkills(crew.skills);
      }

      saveGame(state.gameData);
      renderApp();
    }
  },

  onEquipItem: (crewId, itemId) => {
    if (state.phase !== 'playing') return;

    const crew = state.gameData.ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    const itemIndex = state.gameData.ship.cargo.findIndex(
      (i) => i.id === itemId
    );
    if (itemIndex === -1) return;

    const item = state.gameData.ship.cargo[itemIndex];

    // Move item from cargo to crew equipment
    state.gameData.ship.cargo.splice(itemIndex, 1);
    crew.equipment.push(item);

    saveGame(state.gameData);
    renderApp();
  },

  onUnequipItem: (crewId, itemId) => {
    if (state.phase !== 'playing') return;

    const crew = state.gameData.ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    const itemIndex = crew.equipment.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) return;

    const item = crew.equipment[itemIndex];

    // Move item from crew equipment to cargo
    crew.equipment.splice(itemIndex, 1);
    state.gameData.ship.cargo.push(item);

    saveGame(state.gameData);
    renderApp();
  },

  onAcceptQuest: (questId) => {
    if (state.phase !== 'playing') return;

    const currentLocation = state.gameData.ship.location.dockedAt;
    if (!currentLocation) return;

    const locationQuests =
      state.gameData.availableQuests[currentLocation] || [];
    const quest = locationQuests.find((q) => q.id === questId);
    if (!quest) return;

    // Remove the accepted quest from the location's quest list
    const questIndex = locationQuests.indexOf(quest);
    if (questIndex !== -1) {
      locationQuests.splice(questIndex, 1);
    }

    acceptQuest(state.gameData, quest);
    saveGame(state.gameData);
    renderApp();
  },

  onAdvanceDay: () => {
    if (state.phase !== 'playing') return;
    if (state.gameData.ship.location.status !== 'docked') return;
    if (state.gameData.activeContract) return;

    // Deduct crew salaries for 1 day (48 ticks)
    const TICKS_PER_DAY = 48;
    deductCrewSalaries(state.gameData.ship, TICKS_PER_DAY);

    // Store previous exposure values to detect recovery threshold crossings
    const previousExposures = new Map<string, number>();
    for (const crew of state.gameData.ship.crew) {
      previousExposures.set(crew.id, crew.zeroGExposure);
    }

    // Apply gravity recovery (1 day)
    applyGravityRecovery(state.gameData, GAME_SECONDS_PER_DAY);

    // Check for recovery threshold crossings and log them
    for (const crew of state.gameData.ship.crew) {
      const previousExposure = previousExposures.get(crew.id) || 0;
      const previousLevel = getGravityDegradationLevel(previousExposure);
      const currentLevel = getGravityDegradationLevel(crew.zeroGExposure);

      // Only log if we recovered PAST a threshold (went to a better level)
      if (
        previousLevel !== 'none' &&
        currentLevel !== previousLevel &&
        previousExposure > crew.zeroGExposure
      ) {
        const message =
          currentLevel === 'none'
            ? `${crew.name} has fully recovered from zero-g atrophy.`
            : `${crew.name} has recovered from ${previousLevel} to ${currentLevel} zero-g atrophy.`;

        addLog(
          state.gameData.log,
          state.gameData.gameTime,
          'gravity_warning',
          message
        );
      }
    }

    // Advance to the start of the next day
    state.gameData.gameTime = advanceToNextDayStart(state.gameData.gameTime);

    // Log day advancement
    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'day_advanced',
      'Advanced one day'
    );

    // Regenerate quests for all locations
    state.gameData.availableQuests = generateAllLocationQuests(
      state.gameData.ship,
      state.gameData.world
    );
    state.gameData.lastQuestRegenDay = getDaysSinceEpoch(
      state.gameData.gameTime
    );

    // Regenerate hireable crew
    state.gameData.hireableCrew = generateHireableCrew();

    // Check for unpaid crew and log them (they'll depart if player tries to undock)
    const unpaidCrew = state.gameData.ship.crew.filter(
      (c) => c.unpaidTicks > 0 && !c.isCaptain
    );
    if (unpaidCrew.length > 0) {
      for (const crew of unpaidCrew) {
        addLog(
          state.gameData.log,
          state.gameData.gameTime,
          'crew_departed',
          `${crew.name} has unpaid wages (${crew.unpaidTicks} ticks) and will depart if ship leaves port`
        );
      }
    }

    saveGame(state.gameData);
    renderApp();
  },

  onDockAtNearestPort: () => {
    if (state.phase !== 'playing') return;

    pauseContract(state.gameData);
    saveGame(state.gameData);
    renderApp();
  },

  onResumeContract: () => {
    if (state.phase !== 'playing') return;

    resumeContract(state.gameData);
    saveGame(state.gameData);
    renderApp();
  },

  onAbandonContract: () => {
    if (state.phase !== 'playing') return;

    abandonContract(state.gameData);
    saveGame(state.gameData);
    renderApp();
  },

  onBuyFuel: () => {
    if (state.phase !== 'playing') return;
    if (state.gameData.ship.location.status !== 'docked') return;

    const dockedLocationId = state.gameData.ship.location.dockedAt;
    if (!dockedLocationId) return;

    const location = state.gameData.world.locations.find(
      (l) => l.id === dockedLocationId
    );
    if (!location || !location.services.includes('refuel')) return;

    const fuelNeeded = 100 - state.gameData.ship.fuel;
    if (fuelNeeded <= 0) return;

    const cost = Math.round(fuelNeeded * 5); // 5 credits per percent

    if (state.gameData.ship.credits >= cost) {
      state.gameData.ship.credits -= cost;
      state.gameData.ship.fuel = 100;

      addLog(
        state.gameData.log,
        state.gameData.gameTime,
        'refueled',
        `Purchased ${Math.round(fuelNeeded)}% fuel for ${cost} credits`
      );

      saveGame(state.gameData);
      renderApp();
    }
  },

  onStartTrip: (destinationId: string) => {
    if (state.phase !== 'playing') return;
    if (state.gameData.ship.location.status !== 'docked') return;
    if (state.gameData.activeContract) return; // Can't start manual trip during contract

    const currentLocationId = state.gameData.ship.location.dockedAt;
    if (!currentLocationId) return;

    const origin = state.gameData.world.locations.find(
      (l) => l.id === currentLocationId
    );
    const destination = state.gameData.world.locations.find(
      (l) => l.id === destinationId
    );

    if (!origin || !destination) return;

    // Import initializeFlight dynamically
    import('./flightPhysics').then(({ initializeFlight }) => {
      if (state.phase !== 'playing') return;

      // Undock and start flight
      state.gameData.ship.location.status = 'in_flight';
      delete state.gameData.ship.location.dockedAt;

      // Initialize flight
      state.gameData.ship.location.flight = initializeFlight(
        state.gameData.ship,
        origin,
        destination,
        true // Dock on arrival for manual trips
      );

      // Start engine warmup
      state.gameData.ship.engine.state = 'warming_up';
      state.gameData.ship.engine.warmupProgress = 0;

      // Log departure
      addLog(
        state.gameData.log,
        state.gameData.gameTime,
        'departure',
        `Departed ${origin.name} en route to ${destination.name}`
      );

      // Close navigation view
      state.showNavigation = false;

      saveGame(state.gameData);
      renderApp();
    });
  },

  onHireCrew: (crewId) => {
    if (state.phase !== 'playing') return;
    if (state.gameData.ship.location.status !== 'docked') return;

    const crew = state.gameData.hireableCrew.find((c) => c.id === crewId);
    if (!crew) return;

    // Check if can afford
    if (state.gameData.ship.credits < crew.hireCost) return;

    // Deduct credits
    state.gameData.ship.credits -= crew.hireCost;

    // Add to ship crew
    state.gameData.ship.crew.push(crew);

    // Remove from hireable crew
    const index = state.gameData.hireableCrew.indexOf(crew);
    if (index !== -1) {
      state.gameData.hireableCrew.splice(index, 1);
    }

    // Log hire
    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'crew_hired',
      `Hired ${crew.name} (${crew.role}) for ${crew.hireCost} credits`
    );

    saveGame(state.gameData);
    renderApp();
  },

  onBuyEquipment: (equipmentId: CrewEquipmentId) => {
    if (state.phase !== 'playing') return;
    if (state.gameData.ship.location.status !== 'docked') return;

    const equipDef = getCrewEquipmentDefinition(equipmentId);
    if (!equipDef) return;

    // Check if can afford
    if (state.gameData.ship.credits < equipDef.value) return;

    // Deduct credits
    state.gameData.ship.credits -= equipDef.value;

    // Add to cargo
    state.gameData.ship.cargo.push({
      id: Math.random().toString(36).substring(2, 11),
      definitionId: equipmentId,
    });

    // Log purchase
    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'equipment_bought',
      `Purchased ${equipDef.name} for ${equipDef.value} credits`
    );

    saveGame(state.gameData);
    renderApp();
  },

  onSellEquipment: (itemId: string) => {
    if (state.phase !== 'playing') return;
    if (state.gameData.ship.location.status !== 'docked') return;

    // Check if item is in cargo
    let itemIndex = state.gameData.ship.cargo.findIndex((i) => i.id === itemId);
    const isInCargo = itemIndex !== -1;
    let item = isInCargo ? state.gameData.ship.cargo[itemIndex] : null;

    // If not in cargo, check crew equipment
    if (!item) {
      for (const crew of state.gameData.ship.crew) {
        itemIndex = crew.equipment.findIndex((i) => i.id === itemId);
        if (itemIndex !== -1) {
          item = crew.equipment[itemIndex];
          crew.equipment.splice(itemIndex, 1);
          break;
        }
      }
    } else {
      // Remove from cargo
      state.gameData.ship.cargo.splice(itemIndex, 1);
    }

    if (!item) return;

    const equipDef = getCrewEquipmentDefinition(item.definitionId);
    const sellPrice = Math.floor(equipDef.value * 0.5);

    // Add credits
    state.gameData.ship.credits += sellPrice;

    // Log sale
    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'equipment_sold',
      `Sold ${equipDef.name} for ${sellPrice} credits`
    );

    saveGame(state.gameData);
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
      // Update timestamp after each tick
      state.gameData.lastTickTimestamp = Date.now();
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
