import './style.css';
import { initCombatSystem } from './combatSystem';
import type {
  ShipClassId,
  GameData,
  CrewEquipmentId,
  CatchUpReport,
  ContractSnapshot,
  Toast,
  EncounterResult,
  SkillId,
  OreId,
  RouteSnapshot,
} from './models';
import {
  buildCatchUpReport,
  snapshotContracts,
  snapshotRoutes,
} from './catchUpReportBuilder';
import { getActiveShip } from './models';
import { createNewGame, createAdditionalShip } from './gameFactory';
import { saveGame, loadGame, clearGame, importGame } from './storage';
import { render, type GameState, type RendererCallbacks } from './ui/renderer';
import type { WizardStep, WizardDraft } from './ui/wizard';
import {
  applyTick,
  deductFleetSalaries,
  drainEncounterResults,
  drainRadiationToasts,
} from './gameTick';
import { getLevelForXP } from './levelSystem';
import { createRefuelDialog, getFuelPricePerKg } from './ui/refuelDialog';
import { formatFuelMass, calculateFuelPercentage } from './ui/fuelFormatting';
import { formatCredits } from './formatting';
import {
  advanceToNextDayStart,
  GAME_SECONDS_PER_DAY,
  GAME_SECONDS_PER_TICK,
  TICKS_PER_DAY,
} from './timeSystem';
import {
  acceptQuest,
  pauseContract,
  resumeContract,
  abandonContract,
  dockShipAtLocation,
  initContractExec,
  regenerateQuestsIfNewDay,
} from './contractExec';
import { getSkillRank } from './skillRanks';
import { assignShipToRoute, unassignShipFromRoute } from './routeAssignment';
import { addLog } from './logSystem';
import { getCrewEquipmentDefinition } from './crewEquipment';
import {
  applyGravityRecovery,
  getGravityDegradationLevel,
} from './gravitySystem';
import { getShipClass } from './shipClasses';
import { canAffordResources, deductResourceCost } from './resourceCost';
import {
  isHelmManned,
  unassignCrewFromAllSlots,
  autoAssignCrewToJobs,
} from './jobSlots';
import { sellOre, sellAllOre } from './miningSystem';
import { assignMiningRoute, cancelMiningRoute } from './miningRoute';
import { getEquipmentDefinition, canEquipInSlot } from './equipment';
import { recordDailySnapshot } from './dailyLedger';

const app = document.getElementById('app')!;

/** Show a dismissable banner at the top of the page. */
function showErrorBanner(message: string): void {
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.style.cssText =
    'background:#5c1a1a;color:#ff9b9b;padding:0.75rem 1rem;text-align:center;' +
    'font-size:0.9rem;position:relative;cursor:pointer;';
  banner.textContent = message + ' (tap to dismiss)';
  banner.addEventListener('click', () => banner.remove());
  document.body.prepend(banner);
}

// All module-level `let` and `const` declarations MUST appear before any
// top-level side effects (function calls, try blocks, etc.) to prevent
// Temporal Dead Zone errors. Hoisted functions called during initialisation
// may reference these bindings, which must already be initialised.
// Enforced by: local/no-side-effects-before-definitions
let tickInterval: number | null = null;

/** State for ongoing batched catch-up processing */
interface ActiveCatchUp {
  totalTicks: number;
  ticksProcessed: number;
  prevCredits: number;
  prevGameTime: number;
  elapsedRealSeconds: number;
  routeSnapshots: Map<string, RouteSnapshot>;
  contractSnapshots: Map<string, ContractSnapshot>;
}

let activeCatchUp: ActiveCatchUp | null = null;
let catchUpBatchScheduled = false;

/**
 * Snapshot taken when the tab becomes hidden, so the catch-up report
 * can cover the full absence (including any ticks the browser
 * processes in the background before throttling kicks in).
 */
let hiddenSnapshot: {
  credits: number;
  gameTime: number;
  realTimestamp: number;
} | null = null;

/**
 * Real-world seconds of full-rate offline progress (4 hours).
 * Beyond this threshold, ticks are awarded at a logarithmically
 * diminishing rate so progress is never hard-capped but active
 * play remains more rewarding than long absences.
 */
const FULL_RATE_CATCH_UP_SECONDS = 4 * 3600;

/**
 * Compute the number of ticks to process for an offline absence.
 *
 * - First 4 real hours: 1 tick per real second (full rate).
 * - Beyond 4 hours: logarithmic diminishing returns.
 *   Uses `K * ln(1 + extra / K)` so the first extra second beyond
 *   the threshold is still ~1 tick, but it tapers smoothly.
 *
 * Examples at 1× speed:
 *   4h  → 14 400 ticks (30 game-days)
 *   8h  → ~19 400 ticks (~40 game-days)
 *   24h → ~26 600 ticks (~55 game-days)
 *   48h → ~30 500 ticks (~64 game-days)
 */
function computeCatchUpTicks(elapsedSeconds: number, speed: number): number {
  if (elapsedSeconds <= FULL_RATE_CATCH_UP_SECONDS) {
    return Math.floor(elapsedSeconds * speed);
  }
  const fullTicks = FULL_RATE_CATCH_UP_SECONDS * speed;
  const extraSeconds = elapsedSeconds - FULL_RATE_CATCH_UP_SECONDS;
  const K = FULL_RATE_CATCH_UP_SECONDS; // controls decay curve
  const extraTicks = K * Math.log(1 + extraSeconds / K) * speed;
  return Math.floor(fullTicks + extraTicks);
}

/**
 * Maximum ticks to process in a single synchronous batch before yielding
 * to the browser. Keeps the UI responsive during long catch-ups.
 */
const CATCH_UP_BATCH_SIZE = 2000;

/**
 * Real-time threshold (seconds) beyond which we treat the gap as a
 * significant absence and show the catch-up report modal.
 */
const CATCH_UP_REPORT_THRESHOLD_SECONDS = 30;

/**
 * Real-time threshold (seconds) beyond which encounter severity is
 * capped (isCatchUp=true) to prevent unfair boarding events.
 */
const CATCH_UP_SEVERITY_THRESHOLD_SECONDS = 5;

let state: GameState;

/**
 * Revert in-memory game state to the last known good save from localStorage.
 * Replaces properties in-place so existing object references remain valid.
 * Returns false if no save could be loaded (game state is unrecoverable).
 */
function revertToLastSave(gameData: GameData): boolean {
  const lastGood = loadGame();
  if (!lastGood) return false;
  const record = gameData as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    delete record[key];
  }
  Object.assign(gameData, lastGood);
  return true;
}

/**
 * Fast-forward game state based on elapsed real-world time (initial load).
 *
 * Small gaps (≤ CATCH_UP_BATCH_SIZE ticks): processed synchronously,
 * returns a CatchUpReport if the gap was significant.
 *
 * Large gaps: sets up `activeCatchUp` for batched async processing
 * (handled by processCatchUpBatch via setTimeout). Returns null and
 * the report is built when batching completes.
 */
function fastForwardTicks(gameData: GameData): CatchUpReport | null {
  // Don't catch up if the game was paused when saved
  if (gameData.isPaused) {
    gameData.lastTickTimestamp = Date.now();
    return null;
  }

  const now = Date.now();
  const elapsedMs = now - gameData.lastTickTimestamp;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  if (elapsedSeconds <= 0) return null;

  const speed = gameData.timeSpeed;
  const totalTicks = computeCatchUpTicks(elapsedSeconds, speed);

  if (totalTicks <= 0) return null;

  console.log(
    `Fast-forwarding ${totalTicks} ticks (${elapsedSeconds}s elapsed, ${speed}x speed)...`
  );

  gameData.lastTickTimestamp = now;
  drainEncounterResults();

  const routeSnaps = snapshotRoutes(gameData);
  const contractSnaps = snapshotContracts(gameData);

  if (totalTicks <= CATCH_UP_BATCH_SIZE) {
    // Small gap: process synchronously
    const prevCredits = gameData.credits;
    const prevGameTime = gameData.gameTime;
    let tickError = false;

    for (let i = 0; i < totalTicks; i++) {
      try {
        applyTick(gameData, true);
      } catch (e) {
        console.error(
          `Tick ${i} failed during fast-forward, skipping rest:`,
          e
        );
        tickError = true;
        break;
      }
    }

    const encounterResults = drainEncounterResults();

    // Only persist if all ticks succeeded — a mid-tick exception leaves
    // the game state partially mutated and saving would cement corruption.
    // On error, revert to the last saved state so corrupted data never persists.
    if (!tickError) {
      saveGame(gameData);
    } else {
      revertToLastSave(gameData);
      gameData.lastTickTimestamp = now;
      saveGame(gameData);
      showErrorBanner(
        'A game error occurred during offline catch-up. Progress since last save may be lost on reload.'
      );
    }

    console.log(`Fast-forward complete. Game time: ${gameData.gameTime}s`);

    if (elapsedSeconds >= CATCH_UP_REPORT_THRESHOLD_SECONDS) {
      return buildCatchUpReport(
        totalTicks,
        elapsedSeconds,
        encounterResults,
        gameData,
        prevCredits,
        prevGameTime,
        { routes: routeSnaps, contracts: contractSnaps }
      );
    }
    return null;
  }

  // Large gap: set up batched processing (handled by processCatchUpBatch)
  activeCatchUp = {
    totalTicks,
    ticksProcessed: 0,
    prevCredits: gameData.credits,
    prevGameTime: gameData.gameTime,
    elapsedRealSeconds: elapsedSeconds,
    routeSnapshots: routeSnaps,
    contractSnapshots: contractSnaps,
  };

  return null;
}

function initializeState(): GameState {
  const gameData = loadGame();
  if (gameData) {
    const catchUpReport = fastForwardTicks(gameData);

    // If a large catch-up was set up, show progress modal
    if (activeCatchUp) {
      return {
        phase: 'playing',
        gameData,
        activeTab: 'ship',
        catchUpProgress: {
          processed: 0,
          total: activeCatchUp.totalTicks,
        },
      };
    }

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
    if (!saveGame(gameData)) {
      showErrorBanner(
        'Warning: could not save game. Storage may be unavailable on this device.'
      );
    }
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

  onImportState: (json: string) => {
    const gameData = importGame(json);
    if (!gameData) {
      alert(
        'Failed to import save file. The file may be invalid or corrupted.'
      );
      return;
    }
    state = { phase: 'playing', gameData, activeTab: 'settings' };
    renderApp();
  },

  onAutoPauseSettingChange: (setting, value) => {
    if (state.phase !== 'playing') return;
    state.gameData.autoPauseSettings[setting] = value;
    saveGame(state.gameData);
    renderApp();
  },

  onTabChange: (tab) => {
    if (state.phase === 'playing') {
      state = { ...state, activeTab: tab };
      renderApp();
    }
  },

  onJobAssign: (crewId, jobSlotId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    // First remove crew from any existing job slot
    unassignCrewFromAllSlots(ship, crewId);

    // Assign to target job slot
    const slot = ship.jobSlots.find((s) => s.id === jobSlotId);
    if (slot) {
      // If slot already has someone, unassign them first
      if (slot.assignedCrewId) {
        // The previous occupant becomes unassigned
        slot.assignedCrewId = null;
      }
      slot.assignedCrewId = crewId;
    }

    saveGame(state.gameData);
    renderApp();
  },

  onJobUnassign: (crewId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    unassignCrewFromAllSlots(ship, crewId);

    saveGame(state.gameData);
    renderApp();
  },

  onAutoAssignCrew: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    autoAssignCrewToJobs(ship);

    saveGame(state.gameData);
    renderApp();
  },

  onUndock: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    // Helm must be manned to undock
    if (!isHelmManned(ship)) return;

    // Save current location before transitioning to orbiting
    const currentLocation = ship.location.dockedAt;

    ship.location.status = 'orbiting';
    ship.location.orbitingAt = currentLocation;
    delete ship.location.dockedAt;

    ship.engine.state = 'warming_up';
    ship.engine.warmupProgress = 0;

    saveGame(state.gameData);
    renderApp();
  },

  onDock: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    // Determine where to dock based on ship state
    let dockLocation: string;

    if (ship.location.status === 'orbiting' && ship.location.orbitingAt) {
      // Orbiting - dock at orbited location
      dockLocation = ship.location.orbitingAt;
    } else if (ship.activeFlightPlan) {
      // In flight - dock at the nearest location (destination if far along, origin if just started)
      const progress =
        ship.activeFlightPlan.distanceCovered /
        ship.activeFlightPlan.totalDistance;

      // If more than halfway to destination, dock at destination; otherwise dock at origin
      dockLocation =
        progress > 0.5
          ? ship.activeFlightPlan.destination
          : ship.activeFlightPlan.origin;
    } else if (ship.location.dockedAt) {
      // Already docked - no-op
      dockLocation = ship.location.dockedAt;
    } else {
      // Shouldn't happen, but handle gracefully
      console.warn(
        'Ship has no flight and no dockedAt - cannot determine location'
      );
      return;
    }

    dockShipAtLocation(ship, dockLocation);

    // Clear route assignment if manually docking
    if (ship.routeAssignment) {
      unassignShipFromRoute(state.gameData, ship);
    }

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

    const currentLocation = ship.location.dockedAt || ship.location.orbitingAt;
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
    if (
      ship.location.status !== 'docked' &&
      ship.location.status !== 'orbiting'
    )
      return;
    if (ship.activeContract) return;

    // Gravity recovery for docked ships (happens independently of ticks)
    for (const s of state.gameData.ships) {
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
    }

    // Compute how many ticks are needed to reach the next day boundary.
    // Using the exact count (rather than a fixed TICKS_PER_DAY) prevents
    // overshooting when game time isn't aligned to a day boundary.
    const targetTime = advanceToNextDayStart(state.gameData.gameTime);
    const ticksNeeded = Math.ceil(
      (targetTime - state.gameData.gameTime) / GAME_SECONDS_PER_TICK
    );

    // Check if any ship in the fleet is in-flight — if so, run the full
    // tick loop. applyTick already processes ALL ships per call, so we
    // must NOT call it inside a per-ship loop.
    const hasInFlightShip = state.gameData.ships.some(
      (s) => s.location.status === 'in_flight'
    );

    if (hasInFlightShip) {
      for (let i = 0; i < ticksNeeded; i++) {
        applyTick(state.gameData);
      }
    } else {
      // No ships in-flight: still deduct salaries for the day
      deductFleetSalaries(state.gameData, ticksNeeded);
    }

    // Snap to exact day boundary (avoids rounding from integer tick count)
    state.gameData.gameTime = targetTime;
    recordDailySnapshot(state.gameData);

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'day_advanced',
      'Advanced one day'
    );

    // Regenerate quests & hireable crew for the new day
    regenerateQuestsIfNewDay(state.gameData);

    // Warn about unpaid crew across all ships
    for (const s of state.gameData.ships) {
      for (const crew of s.crew.filter(
        (c) => c.unpaidTicks > 0 && !c.isCaptain
      )) {
        addLog(
          state.gameData.log,
          state.gameData.gameTime,
          'crew_departed',
          `${crew.name} has unpaid wages (${Math.ceil(crew.unpaidTicks / TICKS_PER_DAY)} days) and will depart if ship leaves port`,
          s.name
        );
      }
    }

    // Update timestamp so catch-up on reload doesn't replay these ticks
    state.gameData.lastTickTimestamp = Date.now();

    saveGame(state.gameData);
    renderApp();
  },

  onDockAtNearestPort: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    if (ship.activeContract) {
      ship.activeContract.abandonRequested = false;
    }

    if (ship.location.status === 'orbiting' && ship.location.orbitingAt) {
      // Orbiting — dock immediately at the orbited location
      dockShipAtLocation(ship, ship.location.orbitingAt);
    } else {
      // In flight (warming up or moving) — pause contract, dock on arrival
      pauseContract(ship);
    }

    saveGame(state.gameData);
    renderApp();
  },

  onCancelPause: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.activeContract) {
      ship.activeContract.paused = false;
      ship.activeContract.abandonRequested = false;
    }
    saveGame(state.gameData);
    renderApp();
  },

  onRequestAbandon: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.activeContract) {
      ship.activeContract.abandonRequested = true;
      ship.activeContract.paused = false;
    }
    saveGame(state.gameData);
    renderApp();
  },

  onFlightProfileChange: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'in_flight' || !ship.activeFlightPlan) {
      // Not in flight — slider just updates ship.flightProfileBurnFraction
      // which will be used on the next flight start. No redirect needed.
      saveGame(state.gameData);
      renderApp();
      return;
    }

    // Recalculate current flight with the new burn fraction
    void Promise.all([
      import('./flightPhysics'),
      import('./encounterSystem'),
    ]).then(([{ redirectShipFlight }, { getShipPositionKm }]) => {
      if (state.phase !== 'playing') return;

      const currentKm = getShipPositionKm(ship, state.gameData.world);
      const dest = state.gameData.world.locations.find(
        (l) => l.id === ship.activeFlightPlan?.destination
      );
      if (!dest) return;

      redirectShipFlight(
        ship,
        currentKm,
        dest,
        ship.activeFlightPlan?.dockOnArrival ?? false,
        ship.flightProfileBurnFraction,
        state.gameData.gameTime,
        state.gameData.world
      );

      saveGame(state.gameData);
      renderApp();
    });
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

  onAssignRoute: (questId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    const currentLocation = ship.location.dockedAt;
    if (!currentLocation) return;

    const locationQuests =
      state.gameData.availableQuests[currentLocation] || [];
    const quest = locationQuests.find((q) => q.id === questId);
    if (!quest) return;

    const result = assignShipToRoute(state.gameData, ship, questId);
    if (result.success) {
      // Remove quest from available quests (it's now being automated)
      const questIndex = locationQuests.indexOf(quest);
      if (questIndex !== -1) {
        locationQuests.splice(questIndex, 1);
      }
      saveGame(state.gameData);
      renderApp();
    } else {
      console.error('Failed to assign route:', result.error);
    }
  },

  onUnassignRoute: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    unassignShipFromRoute(state.gameData, ship);
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

    const maxPurchaseKg = ship.maxFuelKg - ship.fuelKg;
    if (maxPurchaseKg <= 0) {
      // Already full
      return;
    }

    // Show refuel dialog
    const dialog = createRefuelDialog(state.gameData, location, {
      onConfirm: (fuelKg: number) => {
        if (state.phase !== 'playing') return;

        const ship = getActiveShip(state.gameData);
        const pricePerKg = getFuelPricePerKg(location, ship);
        const totalCost = Math.round(fuelKg * pricePerKg);

        if (state.gameData.credits >= totalCost && fuelKg > 0) {
          // Deduct credits
          state.gameData.credits -= totalCost;

          // Add fuel
          ship.fuelKg = Math.min(ship.maxFuelKg, ship.fuelKg + fuelKg);

          // Track fuel costs in metrics
          ship.metrics.fuelCostsPaid += totalCost;

          // Log the purchase
          addLog(
            state.gameData.log,
            state.gameData.gameTime,
            'refueled',
            `Purchased ${formatFuelMass(fuelKg)} fuel for ${formatCredits(totalCost)}`,
            ship.name
          );

          saveGame(state.gameData);
          renderApp();
        }
      },
      onCancel: () => {
        // Dialog closed, no action needed
      },
    });

    document.body.appendChild(dialog);
  },

  onStartTrip: (destinationId: string) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.activeContract) return;

    const destination = state.gameData.world.locations.find(
      (l) => l.id === destinationId
    );
    if (!destination) return;

    // Mid-flight redirect
    if (ship.location.status === 'in_flight') {
      if (ship.miningRoute) return;

      void Promise.all([
        import('./flightPhysics'),
        import('./encounterSystem'),
      ]).then(([{ redirectShipFlight }, { getShipPositionKm }]) => {
        if (state.phase !== 'playing') return;

        const currentKm = getShipPositionKm(ship, state.gameData.world);
        const prevDest = state.gameData.world.locations.find(
          (l) => l.id === ship.activeFlightPlan?.destination
        );

        const redirected = redirectShipFlight(
          ship,
          currentKm,
          destination,
          true,
          ship.flightProfileBurnFraction,
          state.gameData.gameTime,
          state.gameData.world
        );

        if (!redirected) return;

        addLog(
          state.gameData.log,
          state.gameData.gameTime,
          'departure',
          `Redirected from ${prevDest?.name ?? 'unknown'} course to ${destination.name}`,
          ship.name
        );

        state.showNavigation = false;
        saveGame(state.gameData);
        renderApp();
      });
      return;
    }

    // Standard departure from station/orbit
    if (
      ship.location.status !== 'docked' &&
      ship.location.status !== 'orbiting'
    )
      return;

    const currentLocationId =
      ship.location.dockedAt || ship.location.orbitingAt;
    if (!currentLocationId) return;

    const origin = state.gameData.world.locations.find(
      (l) => l.id === currentLocationId
    );
    if (!origin) return;

    void import('./flightPhysics').then(({ startShipFlight }) => {
      if (state.phase !== 'playing') return;

      const departed = startShipFlight(
        ship,
        origin,
        destination,
        true,
        ship.flightProfileBurnFraction,
        state.gameData.gameTime,
        state.gameData.world
      );

      if (!departed) return; // Helm unmanned — UI already reflects this

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

    // Set service record timestamps and origin
    crew.hiredAt = state.gameData.gameTime;
    crew.boardedShipAt = state.gameData.gameTime;
    crew.hiredLocation = dockedAt;

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

  onBuyShipEquipment: (equipmentId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked') return;

    const equipDef = getEquipmentDefinition(equipmentId);
    if (!equipDef) return;
    if (equipDef.value === undefined || state.gameData.credits < equipDef.value)
      return;

    // Find existing mining equipment on the ship (if upgrading)
    const existingMiningIdx = ship.equipment.findIndex((eq) => {
      const def = getEquipmentDefinition(eq.definitionId);
      return def?.category === 'mining';
    });

    let tradeInCredit = 0;
    if (existingMiningIdx !== -1) {
      const oldEquip = ship.equipment[existingMiningIdx];
      const oldDef = getEquipmentDefinition(oldEquip.definitionId);
      tradeInCredit = Math.floor((oldDef?.value ?? 0) * 0.5);

      // Remove old equipment from slot
      for (const slot of ship.equipmentSlots) {
        if (slot.equippedId === oldEquip.id) {
          slot.equippedId = undefined;
          break;
        }
      }
      // Remove from equipment array
      ship.equipment.splice(existingMiningIdx, 1);
    }

    // Check for compatible slot
    const compatibleSlot = ship.equipmentSlots.find(
      (slot) => !slot.equippedId && canEquipInSlot(equipDef, slot)
    );
    if (!compatibleSlot && existingMiningIdx === -1) return; // No free slot

    // Deduct credits (minus trade-in)
    const netCost = equipDef.value - tradeInCredit;
    if (state.gameData.credits < netCost) return;
    state.gameData.credits -= netCost;

    // Install new equipment
    const newEquip = {
      id: Math.random().toString(36).substring(2, 11),
      definitionId: equipmentId,
      degradation: 0,
    };
    ship.equipment.push(newEquip);

    // Assign to slot
    const targetSlot =
      compatibleSlot ??
      ship.equipmentSlots.find((s) => canEquipInSlot(equipDef, s));
    if (targetSlot) {
      targetSlot.equippedId = newEquip.id;
    }

    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'equipment_bought',
      tradeInCredit > 0
        ? `Installed ${equipDef.name} (traded in old equipment for ${tradeInCredit} cr credit)`
        : `Installed ${equipDef.name} for ${equipDef.value} cr`,
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

    // Check resource costs (mined ore requirements)
    if (!canAffordResources(state.gameData.ships, shipClass)) return;

    state.gameData.credits -= shipClass.price;
    deductResourceCost(state.gameData, shipClass);

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
      `Purchased new ship: ${shipClass.name} for ${formatCredits(shipClass.price)}`
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

    // Cannot leave ship with 0 crew if it has an active contract
    if (fromShip.crew.length <= 1 && fromShip.activeContract) return;

    // Remove from source ship
    fromShip.crew.splice(crewIndex, 1);

    // Remove from any job slots on source ship
    unassignCrewFromAllSlots(fromShip, crewId);

    // Add to target ship — update service timestamp
    crew.boardedShipAt = state.gameData.gameTime;
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

  onSpecializeCrew: (crewId: string, skillId: SkillId) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    const crew = ship.crew.find((c) => c.id === crewId);
    if (!crew || crew.specialization) return;

    const level = Math.floor(crew.skills[skillId]);
    if (level < 50) return;

    const rank = getSkillRank(level);

    crew.specialization = {
      skillId,
      rankAtSpecialization: rank.name,
      specializedAt: state.gameData.gameTime,
    };

    const skillName = skillId.charAt(0).toUpperCase() + skillId.slice(1);
    addLog(
      state.gameData.log,
      state.gameData.gameTime,
      'crew_level_up',
      `${crew.name} has specialized in ${skillName}! +50% training speed.`,
      ship.name
    );

    saveGame(state.gameData);
    renderApp();
  },

  onTogglePause: () => {
    if (state.phase !== 'playing') return;
    state.gameData.isPaused = !state.gameData.isPaused;
    // Reset timestamp so we don't catch up for time spent paused
    state.gameData.lastTickTimestamp = Date.now();
    saveGame(state.gameData);
    renderApp();
  },

  onSetSpeed: (speed: 1 | 2 | 5) => {
    if (state.phase !== 'playing') return;
    state.gameData.timeSpeed = speed;
    state.gameData.isPaused = false; // Auto-unpause when setting speed
    // Reset timestamp so speed change takes effect from now
    state.gameData.lastTickTimestamp = Date.now();
    saveGame(state.gameData);
    renderApp();
  },

  onSellOre: (oreId: OreId, quantity: number) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked' || !ship.location.dockedAt) return;

    const location = state.gameData.world.locations.find(
      (l) => l.id === ship.location.dockedAt
    );
    if (!location || !location.services.includes('trade')) return;

    sellOre(ship, oreId, quantity, location, state.gameData);
    saveGame(state.gameData);
    renderApp();
  },

  onSellAllOre: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    if (ship.location.status !== 'docked' || !ship.location.dockedAt) return;

    const location = state.gameData.world.locations.find(
      (l) => l.id === ship.location.dockedAt
    );
    if (!location || !location.services.includes('trade')) return;

    sellAllOre(ship, location, state.gameData);
    saveGame(state.gameData);
    renderApp();
  },

  onStartMiningRoute: (sellLocationId: string) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    const result = assignMiningRoute(state.gameData, ship, sellLocationId);
    if (!result.success) {
      console.warn('Mining route failed:', result.error);
      return;
    }

    saveGame(state.gameData);
    renderApp();
  },

  onCancelMiningRoute: () => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);

    cancelMiningRoute(state.gameData, ship);
    saveGame(state.gameData);
    renderApp();
  },

  onSelectMiningOre: (oreId: string | null) => {
    if (state.phase !== 'playing') return;
    const ship = getActiveShip(state.gameData);
    ship.selectedMiningOreId = (oreId as import('./models').OreId) || undefined;
    saveGame(state.gameData);
    renderApp();
  },
};

// ── Module initialisation ──
// Wrapped in init() so there are zero bare top-level side effects.
// The only top-level call is init() at the bottom of the file.

function init(): void {
  // Register cross-module callbacks
  initCombatSystem();
  initContractExec();

  try {
    state = initializeState();
  } catch (e) {
    console.error('Failed to initialize game state, clearing save:', e);
    clearGame();
    state = { phase: 'no_game' };
    const errorDetail = e instanceof Error ? e.message : String(e);
    showErrorBanner(`Save corrupted and cleared: ${errorDetail}`);
  }

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

  // Keyboard shortcuts for time controls
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (state.phase !== 'playing') return;

    // Ignore if user is typing in an input field
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (event.key) {
      case ' ': // Space - toggle pause
      case 'p': // P - toggle pause
      case 'P':
        event.preventDefault();
        callbacks.onTogglePause?.();
        break;
      case '1': // 1 - set speed to 1x
        event.preventDefault();
        callbacks.onSetSpeed?.(1);
        break;
      case '2': // 2 - set speed to 2x
        event.preventDefault();
        callbacks.onSetSpeed?.(2);
        break;
      case '5': // 5 - set speed to 5x
        event.preventDefault();
        callbacks.onSetSpeed?.(5);
        break;
      case 'r': // R - resume from pause
      case 'R':
        if (state.phase === 'playing' && state.gameData.isPaused) {
          event.preventDefault();
          callbacks.onTogglePause?.();
        }
        break;
    }
  });

  renderApp();
}

/**
 * Create toast notifications from encounter results.
 */
function createEncounterToasts(encounterResults: EncounterResult[]): Toast[] {
  const toasts: Toast[] = [];
  const now = Date.now();

  for (const result of encounterResults) {
    const ship =
      state.phase === 'playing'
        ? state.gameData.ships.find((s) => s.id === result.shipId)
        : null;
    const shipName = ship?.name || 'Unknown Ship';

    let message = '';
    let type: Toast['type'] = 'encounter_evaded';

    switch (result.type) {
      case 'evaded':
        message = `${shipName}: Pirates evaded!`;
        type = 'encounter_evaded';
        break;
      case 'negotiated':
        message = `${shipName}: Negotiated passage (-${result.creditsLost || 0} cr)`;
        type = 'encounter_negotiated';
        break;
      case 'victory':
        message = `${shipName}: Pirates defeated! (+${result.creditsGained || 0} cr)`;
        type = 'encounter_victory';
        break;
      case 'harassment':
        message = `${shipName}: Harassed by pirates (-${result.creditsLost || 0} cr)`;
        type = 'encounter_harassment';
        break;
      case 'boarding':
        message = `${shipName}: Boarded! (-${result.creditsLost || 0} cr)`;
        type = 'encounter_boarding';
        break;
      case 'fled':
        message = `${shipName}: Outmatched — fled with minor damage`;
        type = 'encounter_fled';
        break;
    }

    toasts.push({
      id: `toast-${now}-${result.shipId}-${result.type}`,
      type,
      message,
      expiresAt: now + 5000, // 5 seconds
    });
  }

  return toasts;
}

/**
 * Check for auto-pause triggers and pause if needed
 * Returns true if auto-pause was triggered
 */
function checkAutoPause(gameData: GameData, prevGameTime: number): boolean {
  const settings = gameData.autoPauseSettings;

  // Check for arrivals - look for arrival log entries added in this tick
  if (settings.onArrival) {
    const recentArrivals = gameData.log.filter(
      (entry) => entry.type === 'arrival' && entry.gameTime > prevGameTime
    );
    if (recentArrivals.length > 0) {
      gameData.isPaused = true;
      return true;
    }
  }

  // Check for contract completion
  if (settings.onContractComplete) {
    const recentCompletions = gameData.log.filter(
      (entry) =>
        (entry.type === 'contract_complete' ||
          entry.type === 'trip_complete') &&
        entry.gameTime > prevGameTime
    );
    if (recentCompletions.length > 0) {
      gameData.isPaused = true;
      return true;
    }
  }

  // Check for low fuel
  if (settings.onLowFuel) {
    for (const ship of gameData.ships) {
      const fuelPercent = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
      if (fuelPercent < 10 && ship.location.status === 'in_flight') {
        gameData.isPaused = true;
        return true;
      }
    }
  }

  return false;
}

/**
 * Process one batch of catch-up ticks, then yield to the browser.
 * Schedules itself via setTimeout(0) until all ticks are processed,
 * then builds the catch-up report and shows it.
 */
function processCatchUpBatch(): void {
  if (!activeCatchUp || state.phase !== 'playing') {
    activeCatchUp = null;
    catchUpBatchScheduled = false;
    return;
  }

  const remaining = activeCatchUp.totalTicks - activeCatchUp.ticksProcessed;
  const batch = Math.min(remaining, CATCH_UP_BATCH_SIZE);

  let processed = 0;
  let tickError = false;
  for (let i = 0; i < batch; i++) {
    try {
      applyTick(state.gameData, true);
      processed++;
    } catch (e) {
      console.error('Tick failed during catch-up batch, finishing early:', e);
      tickError = true;
      break;
    }
  }
  if (tickError) {
    // Revert to last saved state so corrupted data never persists.
    // Skip remaining ticks to avoid repeated failures on bad state.
    revertToLastSave(state.gameData);
    state.gameData.lastTickTimestamp = Date.now();
    saveGame(state.gameData);

    const report = buildCatchUpReport(
      activeCatchUp.ticksProcessed + processed,
      activeCatchUp.elapsedRealSeconds,
      drainEncounterResults(),
      state.gameData,
      activeCatchUp.prevCredits,
      activeCatchUp.prevGameTime,
      {
        routes: activeCatchUp.routeSnapshots,
        contracts: activeCatchUp.contractSnapshots,
      }
    );
    activeCatchUp = null;
    catchUpBatchScheduled = false;
    if (state.phase === 'playing') {
      state = {
        ...state,
        catchUpReport: report,
        catchUpProgress: undefined,
      };
    }
    showErrorBanner(
      'A game error occurred during offline catch-up. Progress since last save may be lost on reload.'
    );
    renderApp();
    return;
  }
  activeCatchUp.ticksProcessed += processed;

  // Regenerate quests & crew if a day boundary was crossed during the batch
  regenerateQuestsIfNewDay(state.gameData);

  if (activeCatchUp.ticksProcessed >= activeCatchUp.totalTicks) {
    // Done — build report and show it
    const encounterResults = drainEncounterResults();
    const report = buildCatchUpReport(
      activeCatchUp.totalTicks,
      activeCatchUp.elapsedRealSeconds,
      encounterResults,
      state.gameData,
      activeCatchUp.prevCredits,
      activeCatchUp.prevGameTime,
      {
        routes: activeCatchUp.routeSnapshots,
        contracts: activeCatchUp.contractSnapshots,
      }
    );
    activeCatchUp = null;
    catchUpBatchScheduled = false;

    if (state.phase === 'playing') {
      state = {
        ...state,
        catchUpReport: report,
        catchUpProgress: undefined,
      };
    }
    saveGame(state.gameData);
    renderApp();
  } else {
    // More to go — update progress and yield to browser
    if (state.phase === 'playing') {
      state = {
        ...state,
        catchUpProgress: {
          processed: activeCatchUp.ticksProcessed,
          total: activeCatchUp.totalTicks,
        },
      };
    }
    // Save periodically (every 10 batches) in case user closes mid-catch-up
    if (activeCatchUp.ticksProcessed % (CATCH_UP_BATCH_SIZE * 10) === 0) {
      saveGame(state.gameData);
    }
    renderApp();
    setTimeout(processCatchUpBatch, 0);
  }
}

/**
 * Process all pending ticks based on real elapsed time.
 * Called by the interval timer and by the visibilitychange handler.
 *
 * Instead of assuming each interval = 1 real second, we compute the
 * actual elapsed time since the last processed tick and apply the
 * correct number of ticks (elapsed seconds × speed multiplier).
 * This ensures idle gameplay works even when the browser throttles
 * background tabs or the user closes the phone and returns later.
 */
function processPendingTicks(): void {
  // Skip if batched catch-up is in progress
  if (activeCatchUp) return;
  if (state.phase !== 'playing' || state.gameData.isPaused) return;

  const now = Date.now();
  const elapsedMs = now - state.gameData.lastTickTimestamp;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  if (elapsedSeconds <= 0) return;

  const speed = state.gameData.timeSpeed;
  const totalTicks = computeCatchUpTicks(elapsedSeconds, speed);

  // Use the hidden snapshot for report data if available, so the report
  // covers the full absence (including ticks the browser processed in
  // the background before throttling kicked in).
  const snapshot = hiddenSnapshot;
  hiddenSnapshot = null;

  // Real elapsed seconds for the report: from when the user left (snapshot)
  // or from lastTickTimestamp if no snapshot exists.
  const reportRealSeconds = snapshot
    ? Math.floor((now - snapshot.realTimestamp) / 1000)
    : elapsedSeconds;

  // Credits/gameTime snapshot for the report delta calculation
  const reportPrevCredits = snapshot
    ? snapshot.credits
    : state.gameData.credits;
  const reportPrevGameTime = snapshot
    ? snapshot.gameTime
    : state.gameData.gameTime;

  const pendingRouteSnaps = snapshotRoutes(state.gameData);
  const pendingContractSnaps = snapshotContracts(state.gameData);

  if (totalTicks > CATCH_UP_BATCH_SIZE) {
    // Large gap: start batched catch-up
    state.gameData.lastTickTimestamp = now;
    drainEncounterResults();
    activeCatchUp = {
      totalTicks,
      ticksProcessed: 0,
      prevCredits: reportPrevCredits,
      prevGameTime: reportPrevGameTime,
      elapsedRealSeconds: reportRealSeconds,
      routeSnapshots: pendingRouteSnaps,
      contractSnapshots: pendingContractSnaps,
    };
    if (state.phase === 'playing') {
      state = {
        ...state,
        catchUpProgress: { processed: 0, total: totalTicks },
      };
    }
    renderApp();
    if (!catchUpBatchScheduled) {
      catchUpBatchScheduled = true;
      setTimeout(processCatchUpBatch, 0);
    }
    return;
  }

  // Small gap: process inline
  const isCatchUp = elapsedSeconds >= CATCH_UP_SEVERITY_THRESHOLD_SECONDS;
  const prevCredits = reportPrevCredits;
  const prevGameTime = reportPrevGameTime;

  if (isCatchUp) {
    drainEncounterResults();
  }

  let changed = false;
  let tickError = false;
  for (let i = 0; i < totalTicks; i++) {
    try {
      changed = applyTick(state.gameData, isCatchUp) || changed;
    } catch (e) {
      console.error('Tick failed during processing:', e);
      tickError = true;
      break;
    }
  }

  // If a day boundary was crossed while all ships were docked, the
  // in-flight arrival path never fires — regenerate quests & crew here.
  regenerateQuestsIfNewDay(state.gameData);

  // On tick error, revert to last saved state so corrupted data never
  // persists. Advance the timestamp to avoid replaying the same failing ticks.
  if (tickError) {
    revertToLastSave(state.gameData);
    state.gameData.lastTickTimestamp = now;
    saveGame(state.gameData);
    showErrorBanner(
      'A game error occurred. Progress since last save may be lost on reload.'
    );
    renderApp();
    return;
  }

  state.gameData.lastTickTimestamp = now;

  const isLongAbsence = reportRealSeconds >= CATCH_UP_REPORT_THRESHOLD_SECONDS;
  if (isLongAbsence) {
    const encounterResults = drainEncounterResults();
    const report = buildCatchUpReport(
      totalTicks,
      reportRealSeconds,
      encounterResults,
      state.gameData,
      prevCredits,
      prevGameTime,
      { routes: pendingRouteSnaps, contracts: pendingContractSnaps }
    );
    if (state.phase === 'playing') {
      state = { ...state, catchUpReport: report };
    }
    saveGame(state.gameData);
    renderApp();
  } else {
    // Normal play or short gap: handle auto-pause, encounter toasts, etc.
    const autoPaused = checkAutoPause(state.gameData, prevGameTime);

    const encounterResults = drainEncounterResults();
    const radiationToasts = drainRadiationToasts();
    if (encounterResults.length > 0 || radiationToasts.length > 0) {
      const newToasts = [
        ...createEncounterToasts(encounterResults),
        ...radiationToasts,
      ];
      const existingToasts =
        state.phase === 'playing' ? state.toasts || [] : [];

      if (state.phase === 'playing') {
        state.toasts = [
          ...existingToasts.filter((t) => t.expiresAt > now),
          ...newToasts,
        ];
      }

      saveGame(state.gameData);
      renderApp();
    } else if (changed || autoPaused) {
      if (state.phase === 'playing') {
        const activeToasts = (state.toasts || []).filter(
          (t) => t.expiresAt > now
        );
        if (activeToasts.length !== (state.toasts || []).length) {
          state.toasts = activeToasts;
        }
      }

      saveGame(state.gameData);
      renderApp();
    }
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    // Snapshot state when leaving so the catch-up report covers the
    // full absence, including ticks the browser runs in the background.
    if (state.phase === 'playing' && !state.gameData.isPaused) {
      hiddenSnapshot = {
        credits: state.gameData.credits,
        gameTime: state.gameData.gameTime,
        realTimestamp: Date.now(),
      };
    }
    // Ensure state is persisted when the tab is hidden — iOS Safari doesn't
    // reliably fire beforeunload, but visibilitychange + pagehide cover it.
    if (state.phase === 'playing') {
      saveGame(state.gameData);
    }
  } else if (document.visibilityState === 'visible') {
    processPendingTicks();
  }
}

/**
 * Last-chance save when the page is about to be unloaded.
 * On iOS Safari, `pagehide` fires reliably on pull-to-refresh and tab close
 * whereas `beforeunload` does not.
 */
function onPageHide(): void {
  if (state.phase === 'playing') {
    saveGame(state.gameData);
  }
}

function startTickSystem(): void {
  if (tickInterval !== null) return;

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  tickInterval = window.setInterval(processPendingTicks, 1000);
}

function stopTickSystem(): void {
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', onPageHide);
}

function renderApp(): void {
  try {
    render(app, state, callbacks);
  } catch (e) {
    console.error('Render failed:', e);
    // Show minimal error UI instead of blank screen
    app.innerHTML =
      '<div style="color:#ff6b6b;padding:2rem;text-align:center;">' +
      '<h2>Something went wrong</h2>' +
      '<p>The game encountered an error. Your save may be incompatible.</p>' +
      '<button onclick="localStorage.removeItem(\'spaceship_game_data\');location.reload()" ' +
      'style="margin-top:1rem;padding:0.5rem 1rem;cursor:pointer;">Reset &amp; Reload</button>' +
      '</div>';
    return;
  }

  if (state.phase === 'playing') {
    startTickSystem();

    // Kick off batched catch-up processing if pending
    if (activeCatchUp && !catchUpBatchScheduled) {
      catchUpBatchScheduled = true;
      setTimeout(processCatchUpBatch, 0);
    }
  } else {
    stopTickSystem();
  }
}

init();
