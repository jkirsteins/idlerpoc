import './style.css';
import { initCombatSystem } from './combatSystem';
import type {
  ShipClassId,
  SkillId,
  GameData,
  CrewEquipmentId,
  CatchUpReport,
  CatchUpShipReport,
} from './models';
import { getActiveShip } from './models';
import {
  createNewGame,
  generateHireableCrewByLocation,
  createAdditionalShip,
} from './gameFactory';
import { saveGame, loadGame, clearGame } from './storage';
import { render, type GameState, type RendererCallbacks } from './ui/renderer';
import type { WizardStep, WizardDraft } from './ui/wizard';
import {
  applyTick,
  deductFleetSalaries,
  drainEncounterResults,
} from './gameTick';
import { getLevelForXP } from './levelSystem';
import { deduceRoleFromSkills } from './crewRoles';
import {
  advanceToNextDayStart,
  getDaysSinceEpoch,
  GAME_SECONDS_PER_DAY,
  TICKS_PER_DAY,
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
import { getShipClass } from './shipClasses';

const app = document.getElementById('app')!;

// Initialize the combat system encounter resolver
initCombatSystem();

let state: GameState = initializeState();
let tickInterval: number | null = null;

/**
 * Fast-forward game state based on elapsed real-world time.
 * Returns a CatchUpReport if encounters occurred, null otherwise.
 */
function fastForwardTicks(gameData: GameData): CatchUpReport | null {
  const now = Date.now();
  const elapsedMs = now - gameData.lastTickTimestamp;
  const elapsedTicks = Math.floor(elapsedMs / 1000);

  if (elapsedTicks > 0) {
    console.log(`Fast-forwarding ${elapsedTicks} ticks...`);

    const ticksToApply = Math.min(elapsedTicks, 1000);

    // Clear any stale encounter results before fast-forward
    drainEncounterResults();

    for (let i = 0; i < ticksToApply; i++) {
      applyTick(gameData, true);
    }

    // Collect encounter results from the fast-forward
    const encounterResults = drainEncounterResults();

    gameData.lastTickTimestamp = now;
    saveGame(gameData);

    console.log(`Fast-forward complete. Game time: ${gameData.gameTime}s`);

    // Build catch-up report if encounters occurred
    if (encounterResults.length > 0) {
      const shipReportMap = new Map<string, CatchUpShipReport>();

      for (const result of encounterResults) {
        const ship = gameData.ships.find((s) => s.id === result.shipId);
        if (!ship) continue;

        let report = shipReportMap.get(result.shipId);
        if (!report) {
          report = {
            shipId: result.shipId,
            shipName: ship.name,
            evaded: 0,
            negotiated: 0,
            victories: 0,
            harassments: 0,
            creditsDelta: 0,
            avgHealthLost: 0,
          };
          shipReportMap.set(result.shipId, report);
        }

        switch (result.type) {
          case 'evaded':
            report.evaded++;
            break;
          case 'negotiated':
            report.negotiated++;
            report.creditsDelta -= result.creditsLost || 0;
            break;
          case 'victory':
            report.victories++;
            report.creditsDelta += result.creditsGained || 0;
            break;
          case 'harassment':
            report.harassments++;
            if (result.healthLost) {
              const losses = Object.values(result.healthLost);
              const avgLoss =
                losses.length > 0
                  ? losses.reduce((a, b) => a + b, 0) / losses.length
                  : 0;
              report.avgHealthLost += avgLoss;
            }
            break;
        }
      }

      return {
        totalTicks: ticksToApply,
        shipReports: Array.from(shipReportMap.values()),
      };
    }
  }

  return null;
}

function initializeState(): GameState {
  const gameData = loadGame();
  if (gameData) {
    const catchUpReport = fastForwardTicks(gameData);
    return {
      phase: 'playing',
      gameData,
      activeTab: 'ship',
      catchUpReport: catchUpReport ?? undefined,
    };
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
    const ship = getActiveShip(state.gameData);

    for (const room of ship.rooms) {
      const index = room.assignedCrewIds.indexOf(crewId);
      if (index !== -1) {
        room.assignedCrewIds.splice(index, 1);
      }
    }

    const targetRoom = ship.rooms.find((r) => r.id === roomId);
    if (targetRoom && !targetRoom.assignedCrewIds.includes(crewId)) {
      targetRoom.assignedCrewIds.push(crewId);
    }

    saveGame(state.gameData);
    renderApp();
  },

  onCrewUnassign: (crewId, roomId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    const room = ship.rooms.find((r) => r.id === roomId);
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
    const ship = getActiveShip(state.gameData);

    // Check minimum crew on bridge
    const bridge = ship.rooms.find((r) => r.type === 'bridge');
    if (!bridge || bridge.assignedCrewIds.length === 0) return;

    ship.location.status = 'in_flight';
    delete ship.location.dockedAt;

    ship.engine.state = 'warming_up';
    ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onDock: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    ship.location.status = 'docked';
    ship.location.dockedAt = 'earth';

    ship.engine.state = 'off';
    ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onEngineOn: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status === 'docked') return;

    ship.engine.state = 'warming_up';
    ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onEngineOff: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    ship.engine.state = 'off';
    ship.engine.warmupProgress = 0;

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
    const ship = getActiveShip(state.gameData);

    const crew = ship.crew.find((c) => c.id === crewId);
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
    const ship = getActiveShip(state.gameData);

    const crew = ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    if (crew.unspentSkillPoints > 0 && crew.skills[skillId as SkillId] < 10) {
      crew.skills[skillId as SkillId]++;
      crew.unspentSkillPoints--;

      if (!crew.isCaptain) {
        crew.role = deduceRoleFromSkills(crew.skills);
      }

      saveGame(state.gameData);
      renderApp();
    }
  },

  onEquipItem: (crewId, itemId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    const crew = ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    const itemIndex = ship.cargo.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) return;

    const item = ship.cargo[itemIndex];

    ship.cargo.splice(itemIndex, 1);
    crew.equipment.push(item);

    saveGame(state.gameData);
    renderApp();
  },

  onUnequipItem: (crewId, itemId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    const crew = ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    const itemIndex = crew.equipment.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) return;

    const item = crew.equipment[itemIndex];

    crew.equipment.splice(itemIndex, 1);
    ship.cargo.push(item);

    saveGame(state.gameData);
    renderApp();
  },

  onAcceptQuest: (questId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    const currentLocation = ship.location.dockedAt;
    if (!currentLocation) return;

    const locationQuests =
      state.gameData.availableQuests[currentLocation] || [];
    const quest = locationQuests.find((q) => q.id === questId);
    if (!quest) return;

    const questIndex = locationQuests.indexOf(quest);
    if (questIndex !== -1) {
      locationQuests.splice(questIndex, 1);
    }

    acceptQuest(state.gameData, ship, quest);
    saveGame(state.gameData);
    renderApp();
  },

  onAdvanceDay: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked') return;
    if (ship.activeContract) return;

    // Deduct fleet-wide crew salaries for 1 day (48 ticks)
    deductFleetSalaries(state.gameData, TICKS_PER_DAY);

    // Process ALL ships for day advancement (including in-flight)
    for (const s of state.gameData.ships) {
      // Gravity recovery for docked ships
      if (s.location.status === 'docked') {
        const previousExposures = new Map<string, number>();
        for (const crew of s.crew) {
          previousExposures.set(crew.id, crew.zeroGExposure);
        }

        applyGravityRecovery(s, GAME_SECONDS_PER_DAY);

        for (const crew of s.crew) {
          const previousExposure = previousExposures.get(crew.id) || 0;
          const previousLevel = getGravityDegradationLevel(previousExposure);
          const currentLevel = getGravityDegradationLevel(crew.zeroGExposure);

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
              message,
              s.name
            );
          }
        }
      }

      // Advance in-flight ships by 48 ticks
      if (s.location.status === 'in_flight') {
        for (let i = 0; i < TICKS_PER_DAY; i++) {
          applyTick(state.gameData);
        }
      }
    }

    // Advance to the start of the next day
    state.gameData.gameTime = advanceToNextDayStart(state.gameData.gameTime);

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'day_advanced',
      'Advanced one day'
    );

    // Regenerate quests for all locations
    state.gameData.availableQuests = generateAllLocationQuests(
      ship,
      state.gameData.world
    );
    state.gameData.lastQuestRegenDay = getDaysSinceEpoch(
      state.gameData.gameTime
    );

    // Regenerate hireable crew only for stations with docked ships
    const dockedIds: string[] = [];
    for (const s of state.gameData.ships) {
      if (s.location.status === 'docked' && s.location.dockedAt) {
        dockedIds.push(s.location.dockedAt);
      }
    }
    state.gameData.hireableCrewByLocation = generateHireableCrewByLocation(
      state.gameData.world,
      dockedIds
    );

    // Check for unpaid crew across all ships
    for (const s of state.gameData.ships) {
      const unpaidCrew = s.crew.filter(
        (c) => c.unpaidTicks > 0 && !c.isCaptain
      );
      if (unpaidCrew.length > 0) {
        for (const crew of unpaidCrew) {
          addLog(
            state.gameData.log,
            state.gameData.gameTime,
            'crew_departed',
            `${crew.name} has unpaid wages (${Math.ceil(crew.unpaidTicks / TICKS_PER_DAY)} days) and will depart if ship leaves port`,
            s.name
          );
        }
      }
    }

    saveGame(state.gameData);
    renderApp();
  },

  onDockAtNearestPort: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    pauseContract(ship);
    saveGame(state.gameData);
    renderApp();
  },

  onResumeContract: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    resumeContract(state.gameData, ship);
    saveGame(state.gameData);
    renderApp();
  },

  onAbandonContract: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    abandonContract(state.gameData, ship);
    saveGame(state.gameData);
    renderApp();
  },

  onBuyFuel: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked') return;

    const dockedLocationId = ship.location.dockedAt;
    if (!dockedLocationId) return;

    const location = state.gameData.world.locations.find(
      (l) => l.id === dockedLocationId
    );
    if (!location || !location.services.includes('refuel')) return;

    const fuelNeeded = 100 - ship.fuel;
    if (fuelNeeded <= 0) return;

    const cost = Math.round(fuelNeeded * 5);

    if (state.gameData.credits >= cost) {
      state.gameData.credits -= cost;
      ship.fuel = 100;

      addLog(
        state.gameData.log,
        state.gameData.gameTime,
        'refueled',
        `Purchased ${Math.round(fuelNeeded)}% fuel for ${cost} credits`,
        ship.name
      );

      saveGame(state.gameData);
      renderApp();
    }
  },

  onStartTrip: (destinationId: string) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked') return;
    if (ship.activeContract) return;

    // Check minimum crew on bridge
    const bridge = ship.rooms.find((r) => r.type === 'bridge');
    if (!bridge || bridge.assignedCrewIds.length === 0) return;

    const currentLocationId = ship.location.dockedAt;
    if (!currentLocationId) return;

    const origin = state.gameData.world.locations.find(
      (l) => l.id === currentLocationId
    );
    const destination = state.gameData.world.locations.find(
      (l) => l.id === destinationId
    );

    if (!origin || !destination) return;

    import('./flightPhysics').then(({ initializeFlight }) => {
      if (state.phase !== 'playing') return;

      ship.location.status = 'in_flight';
      delete ship.location.dockedAt;

      ship.location.flight = initializeFlight(ship, origin, destination, true);

      ship.engine.state = 'warming_up';
      ship.engine.warmupProgress = 0;

      addLog(
        state.gameData.log,
        state.gameData.gameTime,
        'departure',
        `Departed ${origin.name} en route to ${destination.name}`,
        ship.name
      );

      state.showNavigation = false;

      saveGame(state.gameData);
      renderApp();
    });
  },

  onHireCrew: (crewId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked') return;

    const dockedAt = ship.location.dockedAt;
    if (!dockedAt) return;

    const locationCrew = state.gameData.hireableCrewByLocation[dockedAt] || [];
    const crew = locationCrew.find((c) => c.id === crewId);
    if (!crew) return;

    if (state.gameData.credits < crew.hireCost) return;

    state.gameData.credits -= crew.hireCost;

    ship.crew.push(crew);

    const index = locationCrew.indexOf(crew);
    if (index !== -1) {
      locationCrew.splice(index, 1);
    }

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'crew_hired',
      `Hired ${crew.name} (${crew.role}) for ${crew.hireCost} credits`,
      ship.name
    );

    saveGame(state.gameData);
    renderApp();
  },

  onBuyEquipment: (equipmentId: CrewEquipmentId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked') return;

    const equipDef = getCrewEquipmentDefinition(equipmentId);
    if (!equipDef) return;

    if (state.gameData.credits < equipDef.value) return;

    state.gameData.credits -= equipDef.value;

    ship.cargo.push({
      id: Math.random().toString(36).substring(2, 11),
      definitionId: equipmentId,
    });

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'equipment_bought',
      `Purchased ${equipDef.name} for ${equipDef.value} credits`,
      ship.name
    );

    saveGame(state.gameData);
    renderApp();
  },

  onSellEquipment: (itemId: string) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked') return;

    let itemIndex = ship.cargo.findIndex((i) => i.id === itemId);
    const isInCargo = itemIndex !== -1;
    let item = isInCargo ? ship.cargo[itemIndex] : null;

    if (!item) {
      for (const crew of ship.crew) {
        itemIndex = crew.equipment.findIndex((i) => i.id === itemId);
        if (itemIndex !== -1) {
          item = crew.equipment[itemIndex];
          crew.equipment.splice(itemIndex, 1);
          break;
        }
      }
    } else {
      ship.cargo.splice(itemIndex, 1);
    }

    if (!item) return;

    const equipDef = getCrewEquipmentDefinition(item.definitionId);
    const sellPrice = Math.floor(equipDef.value * 0.5);

    state.gameData.credits += sellPrice;

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'equipment_sold',
      `Sold ${equipDef.name} for ${sellPrice} credits`,
      ship.name
    );

    saveGame(state.gameData);
    renderApp();
  },

  onSelectShip: (shipId: string) => {
    if (state.phase !== 'playing') return;
    const ship = state.gameData.ships.find((s) => s.id === shipId);
    if (!ship) return;

    state.gameData.activeShipId = shipId;
    saveGame(state.gameData);
    renderApp();
  },

  onBuyShip: (classId: string, shipName: string) => {
    if (state.phase !== 'playing') return;
    const activeShip = getActiveShip(state.gameData);
    if (activeShip.location.status !== 'docked') return;

    const shipClass = getShipClass(classId as ShipClassId);
    if (!shipClass) return;

    // Check unlock threshold
    if (state.gameData.lifetimeCreditsEarned < shipClass.unlockThreshold)
      return;

    // Check credits
    if (state.gameData.credits < shipClass.price) return;

    state.gameData.credits -= shipClass.price;

    const stationId = activeShip.location.dockedAt!;
    const newShip = createAdditionalShip(
      shipName,
      classId as ShipClassId,
      stationId
    );
    state.gameData.ships.push(newShip);

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'equipment_bought',
      `Purchased new ship: ${shipClass.name} for ${shipClass.price.toLocaleString()} credits`
    );

    saveGame(state.gameData);
    renderApp();
  },

  onDismissCatchUp: () => {
    if (state.phase === 'playing') {
      state = { ...state, catchUpReport: undefined };
      renderApp();
    }
  },

  onTransferCrew: (crewId: string, fromShipId: string, toShipId: string) => {
    if (state.phase !== 'playing') return;

    const fromShip = state.gameData.ships.find((s) => s.id === fromShipId);
    const toShip = state.gameData.ships.find((s) => s.id === toShipId);
    if (!fromShip || !toShip) return;

    // Both ships must be docked at same station
    if (
      fromShip.location.status !== 'docked' ||
      toShip.location.status !== 'docked' ||
      fromShip.location.dockedAt !== toShip.location.dockedAt
    )
      return;

    const crewIndex = fromShip.crew.findIndex((c) => c.id === crewId);
    if (crewIndex === -1) return;

    const crew = fromShip.crew[crewIndex];

    // Cannot transfer captain
    if (crew.isCaptain) return;

    // Cannot leave ship with 0 crew if it has an active contract
    if (fromShip.crew.length <= 1 && fromShip.activeContract) return;

    // Remove from source ship
    fromShip.crew.splice(crewIndex, 1);

    // Remove from any rooms on source ship
    for (const room of fromShip.rooms) {
      const idx = room.assignedCrewIds.indexOf(crewId);
      if (idx !== -1) {
        room.assignedCrewIds.splice(idx, 1);
      }
    }

    // Add to target ship
    toShip.crew.push(crew);

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'crew_hired',
      `${crew.name} transferred from ${fromShip.name} to ${toShip.name}`
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
  if (tickInterval !== null) return;

  tickInterval = window.setInterval(() => {
    if (state.phase === 'playing') {
      const changed = applyTick(state.gameData);
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

  if (state.phase === 'playing') {
    startTickSystem();
  } else {
    stopTickSystem();
  }
}

renderApp();
