import type { GameData, Quest, Ship, WorldLocation } from '../models';
import { getActiveShip } from '../models';
import {
  formatDuration,
  GAME_SECONDS_PER_TICK,
  gameSecondsToTicks,
} from '../timeSystem';
import {
  canAcceptQuest,
  calculateTripFuelKg,
  estimateTripTime,
} from '../questGen';
import { calculateShipSalaryPerTick } from '../crewRoles';
import {
  estimateRouteRisk,
  getThreatLevel,
  getThreatNarrative,
} from '../encounterSystem';
import { renderThreatBadge } from './threatBadge';
import type { Component } from './component';
import { formatFuelMass, calculateFuelPercentage } from './fuelFormatting';
import { getDistanceBetween, canShipAccessLocation } from '../worldGen';
import { getFuelPricePerKg } from './refuelDialog';
import { createFlightStatusComponent } from './flightStatus';
import { getOreDefinition, canMineOre } from '../oreTypes';
import { getCrewForJobType } from '../jobSlots';
import { getBestShipMiningEquipment } from '../equipment';
import { getOreCargoWeight, getRemainingOreCapacity } from '../miningSystem';
import {
  createFlightProfileControl,
  updateFlightProfileControl,
} from './flightProfileControl';

export interface WorkTabCallbacks {
  onAcceptQuest: (questId: string) => void;
  onAssignRoute: (questId: string) => void;
  onUnassignRoute: () => void;
  onDockAtNearestPort: () => void;
  onCancelPause: () => void;
  onRequestAbandon: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
  onFlightProfileChange: () => void;
  onStartMiningRoute: (sellLocationId: string) => void;
  onCancelMiningRoute: () => void;
}

// ─── Quest Card Refs ──────────────────────────────────────────
interface QuestCardRefs {
  card: HTMLDivElement;
  title: HTMLDivElement;
  description: HTMLDivElement;
  details: HTMLDivElement;
  destInfo: HTMLDivElement;
  distanceInfo: HTMLDivElement;
  cargoInfo: HTMLDivElement;
  totalCargoInfo: HTMLDivElement;
  tripsInfo: HTMLDivElement;
  fuelInfo: HTMLDivElement;
  timeInfo: HTMLDivElement;
  crewCostInfo: HTMLDivElement;
  fuelCostInfo: HTMLDivElement;
  profitInfo: HTMLDivElement;
  riskLine: HTMLDivElement;
  riskBadgeSlot: HTMLDivElement;
  payment: HTMLDivElement;
  buttonContainer: HTMLDivElement;
  acceptBtn: HTMLButtonElement;
  assignBtn: HTMLButtonElement;
  reasonDiv: HTMLDivElement;
}

// ─── Mining Status Refs ───────────────────────────────────────
interface MiningStatusRefs {
  panel: HTMLDivElement;
  title: HTMLSpanElement;
  statusBadge: HTMLSpanElement;
  undockPrompt: HTMLDivElement;
  oresSection: HTMLDivElement;
  oresLabel: HTMLDivElement;
  oreTagsContainer: HTMLDivElement;
  minersSection: HTMLDivElement;
  cargoSection: HTMLDivElement;
  breakdownSection: HTMLDivElement;
  routeSection: HTMLDivElement;
  // Active route refs
  activeRouteContainer: HTMLDivElement;
  activeRouteLabel: HTMLSpanElement;
  activeRouteCancelBtn: HTMLButtonElement;
  activeRouteStats: HTMLDivElement;
  // Setup route refs
  setupRouteContainer: HTMLDivElement;
  setupRouteLabel: HTMLDivElement;
  noTradeMsg: HTMLDivElement;
  setupRow: HTMLDivElement;
  miningRouteSelect: HTMLSelectElement;
  startRouteBtn: HTMLButtonElement;
  setupHint: HTMLDivElement;
}

// ─── Route Assignment Info Refs ───────────────────────────────
interface RouteAssignmentRefs {
  container: HTMLDivElement;
  header: HTMLDivElement;
  routeInfo: HTMLDivElement;
  unassignBtn: HTMLButtonElement;
}

// ─── Active Contract Refs ─────────────────────────────────────
interface ActiveContractRefs {
  container: HTMLDivElement;
  routeAssignment: RouteAssignmentRefs;
  summaryTitle: HTMLHeadingElement;
  progress: HTMLDivElement;
  leg: HTMLDivElement;
  paymentInfo: HTMLDivElement;
  earned: HTMLDivElement;
  abandonHint: HTMLDivElement;
  pauseHint: HTMLDivElement;
  flightStatusSlot: HTMLDivElement;
  fuelGauge: HTMLDivElement;
  fuelLabel: HTMLDivElement;
  fuelFill: HTMLDivElement;
}

// ─── Paused Contract Refs ─────────────────────────────────────
interface PausedContractRefs {
  container: HTMLDivElement;
  routeAssignment: RouteAssignmentRefs;
  summaryTitle: HTMLHeadingElement;
  pausedBadge: HTMLSpanElement;
  pauseHint: HTMLDivElement;
  progress: HTMLDivElement;
  earned: HTMLDivElement;
  flightStatusSlot: HTMLDivElement;
  resumeBtn: HTMLButtonElement;
  abandonBtn: HTMLButtonElement;
  abandonHint: HTMLDivElement;
}

// ─── No Contract (Available Work) Refs ────────────────────────
interface NoContractRefs {
  container: HTMLDivElement;
  heading: HTMLHeadingElement;
  shipContext: HTMLDivElement;
  shipContextName: HTMLSpanElement;
  tradeSection: HTMLDivElement;
  tradeHeading: HTMLHeadingElement;
  tradeDesc: HTMLParagraphElement;
  tradeCardsContainer: HTMLDivElement;
  contractSection: HTMLDivElement;
  contractHeading: HTMLHeadingElement;
  noQuestsMsg: HTMLParagraphElement;
  contractCardsContainer: HTMLDivElement;
  miningSlot: HTMLDivElement;
}

export function createWorkTab(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'work-tab';

  // Persistent flight profile slider — created once, survives updates
  const profileControl = createFlightProfileControl(gameData, () => {
    callbacks.onFlightProfileChange();
  });

  // Persistent flight status component — created once, survives updates.
  // Includes flight info + station action radio buttons.
  const flightStatusComponent = createFlightStatusComponent(gameData, {
    onContinue: () => callbacks.onCancelPause(),
    onPause: () => callbacks.onDockAtNearestPort(),
    onAbandon: () => callbacks.onRequestAbandon(),
  });

  let prevPhase: 'none' | 'active' | 'paused' = 'none';
  // Two-step confirm state for the paused view's abandon button (docked context)
  let pausedAbandonPending = false;
  let pausedAbandonTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Create all three phase containers once ──────────────────
  const noContractRefs = createNoContractContent();
  const activeContractRefs = createActiveContractContent();
  const pausedContractRefs = createPausedContractContent();

  // Content area holds the three phase containers
  const contentArea = document.createElement('div');
  contentArea.appendChild(noContractRefs.container);
  contentArea.appendChild(activeContractRefs.container);
  contentArea.appendChild(pausedContractRefs.container);

  // Hide all initially
  noContractRefs.container.style.display = 'none';
  activeContractRefs.container.style.display = 'none';
  pausedContractRefs.container.style.display = 'none';

  container.appendChild(contentArea);
  container.appendChild(flightStatusComponent.el);

  // Quest card pools for reconciliation
  const tradeQuestCards = new Map<string, QuestCardRefs>();
  const regularQuestCards = new Map<string, QuestCardRefs>();

  // Mining status panel refs (created lazily, but only once)
  let miningRefs: MiningStatusRefs | null = null;
  // Map of ore tag elements for reconciliation
  const oreTagMap = new Map<string, HTMLSpanElement>();
  // Map of miner line elements for reconciliation
  const minerLineMap = new Map<string, HTMLDivElement>();
  // Map of ore cargo breakdown lines
  const oreCargoLineMap = new Map<string, HTMLDivElement>();
  // Map of mining route select options
  const miningSelectOptionMap = new Map<string, HTMLOptionElement>();

  // ── Factory: No Contract Content ────────────────────────────
  function createNoContractContent(): NoContractRefs {
    const cont = document.createElement('div');
    cont.className = 'available-work';

    const heading = document.createElement('h3');
    heading.textContent = 'Available Work';
    cont.appendChild(heading);

    const shipContext = document.createElement('div');
    shipContext.style.marginBottom = '0.75rem';
    shipContext.style.padding = '0.5rem';
    shipContext.style.background = 'rgba(74, 158, 255, 0.1)';
    shipContext.style.border = '1px solid #4a9eff';
    shipContext.style.borderRadius = '4px';
    shipContext.style.fontSize = '0.9rem';

    const assignLabel = document.createElement('span');
    assignLabel.style.color = '#aaa';
    assignLabel.textContent = 'Assigning to: ';
    shipContext.appendChild(assignLabel);

    const shipContextName = document.createElement('span');
    shipContextName.style.color = '#4a9eff';
    shipContextName.style.fontWeight = 'bold';
    shipContext.appendChild(shipContextName);
    cont.appendChild(shipContext);

    // Mining status slot (positioned before work listings)
    const miningSlot = document.createElement('div');
    cont.appendChild(miningSlot);

    // Trade Routes section
    const tradeSection = document.createElement('div');
    tradeSection.className = 'trade-routes-section';
    tradeSection.style.display = 'none';

    const tradeHeading = document.createElement('h4');
    tradeHeading.textContent = 'Trade Routes';
    tradeHeading.style.color = '#4a9eff';
    tradeHeading.style.marginBottom = '0.25rem';
    tradeSection.appendChild(tradeHeading);

    const tradeDesc = document.createElement('p');
    tradeDesc.style.color = '#888';
    tradeDesc.style.fontSize = '0.85rem';
    tradeDesc.style.marginTop = '0';
    tradeDesc.style.marginBottom = '0.75rem';
    tradeDesc.textContent =
      "Permanent trade routes representing this location's economic activity. Pay scales with distance and route danger.";
    tradeSection.appendChild(tradeDesc);

    const tradeCardsContainer = document.createElement('div');
    tradeSection.appendChild(tradeCardsContainer);
    cont.appendChild(tradeSection);

    // Regular contracts section
    const contractSection = document.createElement('div');
    contractSection.className = 'contracts-section';

    const contractHeading = document.createElement('h4');
    contractHeading.textContent = 'Available Contracts';
    contractHeading.style.marginBottom = '0.5rem';
    contractHeading.style.display = 'none';
    contractSection.appendChild(contractHeading);

    const noQuestsMsg = document.createElement('p');
    noQuestsMsg.className = 'no-quests';
    noQuestsMsg.textContent = 'No work available. Try advancing the day.';
    noQuestsMsg.style.display = 'none';
    contractSection.appendChild(noQuestsMsg);

    const contractCardsContainer = document.createElement('div');
    contractSection.appendChild(contractCardsContainer);
    cont.appendChild(contractSection);

    return {
      container: cont,
      heading,
      shipContext,
      shipContextName,
      tradeSection,
      tradeHeading,
      tradeDesc,
      tradeCardsContainer,
      contractSection,
      contractHeading,
      noQuestsMsg,
      contractCardsContainer,
      miningSlot,
    };
  }

  // ── Factory: Route Assignment Info ──────────────────────────
  function createRouteAssignmentRefs(): RouteAssignmentRefs {
    const cont = document.createElement('div');
    cont.className = 'route-assignment-info';
    cont.style.padding = '12px';
    cont.style.marginBottom = '12px';
    cont.style.border = '2px solid #4a90e2';
    cont.style.borderRadius = '4px';
    cont.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
    cont.style.display = 'none';

    const header = document.createElement('div');
    header.style.fontSize = '14px';
    header.style.fontWeight = 'bold';
    header.style.color = '#4a90e2';
    header.style.marginBottom = '8px';
    header.textContent = '\u{1F504} Automated Route Assignment';
    cont.appendChild(header);

    const routeInfo = document.createElement('div');
    routeInfo.style.fontSize = '12px';
    routeInfo.style.marginBottom = '8px';
    cont.appendChild(routeInfo);

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';

    const unassignBtn = document.createElement('button');
    unassignBtn.className = 'abandon-button';
    unassignBtn.textContent = 'End Route Assignment';
    unassignBtn.addEventListener('click', () => callbacks.onUnassignRoute());
    actions.appendChild(unassignBtn);
    cont.appendChild(actions);

    return { container: cont, header, routeInfo, unassignBtn };
  }

  function updateRouteAssignmentRefs(
    refs: RouteAssignmentRefs,
    gd: GameData
  ): void {
    const ship = getActiveShip(gd);
    const assignment = ship.routeAssignment;

    if (!assignment) {
      refs.container.style.display = 'none';
      return;
    }

    refs.container.style.display = '';

    const originLoc = gd.world.locations.find(
      (l) => l.id === assignment.originId
    );
    const destLoc = gd.world.locations.find(
      (l) => l.id === assignment.destinationId
    );

    const infoHtml = `
    <div><strong>Route:</strong> ${originLoc?.name || 'Unknown'} \u2194 ${destLoc?.name || 'Unknown'}</div>
    <div><strong>Trips Completed:</strong> ${assignment.totalTripsCompleted}</div>
    <div><strong>Credits Earned:</strong> ${assignment.creditsEarned.toLocaleString()}</div>
    <div><strong>Auto-Refuel:</strong> ${assignment.autoRefuel ? `Enabled (< ${assignment.autoRefuelThreshold}%)` : 'Disabled'}</div>
  `;
    refs.routeInfo.innerHTML = infoHtml;
  }

  // ── Factory: Active Contract Content ────────────────────────
  function createActiveContractContent(): ActiveContractRefs {
    const cont = document.createElement('div');
    cont.className = 'active-contract';

    const routeAssignment = createRouteAssignmentRefs();
    cont.appendChild(routeAssignment.container);

    // Contract summary
    const summary = document.createElement('div');
    summary.className = 'contract-summary';

    const summaryTitle = document.createElement('h3');
    summary.appendChild(summaryTitle);

    const progress = document.createElement('div');
    progress.className = 'contract-progress';
    summary.appendChild(progress);

    const leg = document.createElement('div');
    leg.className = 'contract-leg';
    summary.appendChild(leg);

    const paymentInfo = document.createElement('div');
    paymentInfo.className = 'contract-payment-hint';
    summary.appendChild(paymentInfo);

    const earned = document.createElement('div');
    earned.className = 'contract-earned';
    summary.appendChild(earned);

    cont.appendChild(summary);

    // Status hints
    const abandonHint = document.createElement('div');
    abandonHint.className = 'contract-pause-hint';
    abandonHint.textContent =
      'Contract will be abandoned on arrival. Change selection below to cancel.';
    abandonHint.style.display = 'none';
    cont.appendChild(abandonHint);

    const pauseHint = document.createElement('div');
    pauseHint.className = 'contract-pause-hint';
    pauseHint.textContent =
      'Ship will dock on arrival. Change selection below to cancel.';
    pauseHint.style.display = 'none';
    cont.appendChild(pauseHint);

    // Flight status slot
    const flightStatusSlot = document.createElement('div');
    cont.appendChild(flightStatusSlot);

    // Fuel gauge
    const fuelGauge = document.createElement('div');
    fuelGauge.className = 'fuel-gauge';

    const fuelLabel = document.createElement('div');
    fuelGauge.appendChild(fuelLabel);

    const fuelBar = document.createElement('div');
    fuelBar.className = 'fuel-bar';
    const fuelFill = document.createElement('div');
    fuelFill.className = 'fuel-fill';
    fuelBar.appendChild(fuelFill);
    fuelGauge.appendChild(fuelBar);

    cont.appendChild(fuelGauge);

    return {
      container: cont,
      routeAssignment,
      summaryTitle,
      progress,
      leg,
      paymentInfo,
      earned,
      abandonHint,
      pauseHint,
      flightStatusSlot,
      fuelGauge,
      fuelLabel,
      fuelFill,
    };
  }

  // ── Factory: Paused Contract Content ────────────────────────
  function createPausedContractContent(): PausedContractRefs {
    const cont = document.createElement('div');
    cont.className = 'paused-contract';

    const routeAssignment = createRouteAssignmentRefs();
    cont.appendChild(routeAssignment.container);

    // Contract summary
    const summary = document.createElement('div');
    summary.className = 'contract-summary';

    const summaryTitle = document.createElement('h3');
    summary.appendChild(summaryTitle);

    const pausedBadge = document.createElement('span');
    pausedBadge.className = 'paused-badge';
    pausedBadge.textContent = 'PAUSED';
    summary.appendChild(pausedBadge);

    const pauseHint = document.createElement('div');
    pauseHint.className = 'contract-pause-hint';
    summary.appendChild(pauseHint);

    const progress = document.createElement('div');
    progress.className = 'contract-progress';
    summary.appendChild(progress);

    const earned = document.createElement('div');
    earned.className = 'contract-earned';
    summary.appendChild(earned);

    cont.appendChild(summary);

    // Flight status slot
    const flightStatusSlot = document.createElement('div');
    cont.appendChild(flightStatusSlot);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'paused-action-buttons';

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'action-confirm-btn action-confirm-btn--primary';
    resumeBtn.textContent = 'Resume contract';
    resumeBtn.addEventListener('click', () => {
      pausedAbandonPending = false;
      callbacks.onResumeContract();
    });
    actions.appendChild(resumeBtn);

    const abandonBtn = document.createElement('button');
    abandonBtn.className = 'action-confirm-btn action-confirm-btn--danger';
    abandonBtn.textContent = 'Abandon contract';
    abandonBtn.addEventListener('click', () => {
      if (!pausedAbandonPending) {
        pausedAbandonPending = true;
        if (pausedAbandonTimer) clearTimeout(pausedAbandonTimer);
        pausedAbandonTimer = setTimeout(() => {
          pausedAbandonPending = false;
          // Next tick will update the button state
        }, 4000);
        // Update button immediately
        updatePausedAbandonButton();
      } else {
        pausedAbandonPending = false;
        callbacks.onAbandonContract();
      }
    });
    actions.appendChild(abandonBtn);

    const abandonHint = document.createElement('div');
    abandonHint.className = 'action-button-hint';
    actions.appendChild(abandonHint);

    cont.appendChild(actions);

    return {
      container: cont,
      routeAssignment,
      summaryTitle,
      pausedBadge,
      pauseHint,
      progress,
      earned,
      flightStatusSlot,
      resumeBtn,
      abandonBtn,
      abandonHint,
    };
  }

  function updatePausedAbandonButton(): void {
    const refs = pausedContractRefs;
    if (pausedAbandonPending) {
      refs.abandonBtn.textContent = 'Are you sure? Click again to abandon';
      refs.abandonBtn.className =
        'action-confirm-btn action-confirm-btn--danger-hot';
    } else {
      refs.abandonBtn.textContent = 'Abandon contract';
      refs.abandonBtn.className =
        'action-confirm-btn action-confirm-btn--danger';
    }
  }

  // ── Factory: Mining Status Panel ────────────────────────────
  function createMiningStatusRefs(): MiningStatusRefs {
    const panel = document.createElement('div');
    panel.className = 'mining-status-panel';
    panel.style.cssText = `
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: rgba(255, 165, 0, 0.08);
      border: 1px solid #b87333;
      border-radius: 4px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';
    const title = document.createElement('span');
    title.style.cssText = 'font-weight: bold; font-size: 1rem; color: #ffa500;';
    header.appendChild(title);

    const statusBadge = document.createElement('span');
    statusBadge.style.cssText =
      'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px;';
    header.appendChild(statusBadge);
    panel.appendChild(header);

    // Undock prompt
    const undockPrompt = document.createElement('div');
    undockPrompt.style.cssText =
      'padding: 0.5rem; margin-bottom: 0.5rem; background: rgba(74,158,255,0.1); border: 1px solid #4a9eff; border-radius: 4px; font-size: 0.85rem; color: #4a9eff;';
    undockPrompt.textContent =
      'Undock to enter orbit and begin mining operations. Mining equipment operates while orbiting.';
    undockPrompt.style.display = 'none';
    panel.appendChild(undockPrompt);

    // Available ores
    const oresSection = document.createElement('div');
    oresSection.style.cssText = 'margin-bottom: 0.5rem;';
    const oresLabel = document.createElement('div');
    oresLabel.style.cssText =
      'font-size: 0.85rem; color: #aaa; margin-bottom: 0.25rem;';
    oresLabel.textContent = 'Available Ores:';
    oresSection.appendChild(oresLabel);

    const oreTagsContainer = document.createElement('div');
    oresSection.appendChild(oreTagsContainer);
    panel.appendChild(oresSection);

    // Miners section
    const minersSection = document.createElement('div');
    minersSection.style.cssText = 'margin-bottom: 0.5rem; font-size: 0.85rem;';
    panel.appendChild(minersSection);

    // Cargo section
    const cargoSection = document.createElement('div');
    cargoSection.style.cssText = 'font-size: 0.85rem; color: #aaa;';
    panel.appendChild(cargoSection);

    // Ore cargo breakdown
    const breakdownSection = document.createElement('div');
    breakdownSection.style.cssText =
      'margin-top: 0.35rem; font-size: 0.8rem; color: #888;';
    panel.appendChild(breakdownSection);

    // Mining route controls
    const routeSection = document.createElement('div');
    routeSection.style.cssText =
      'margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid #444;';

    // Active route sub-container
    const activeRouteContainer = document.createElement('div');
    activeRouteContainer.style.display = 'none';

    const activeRouteHeader = document.createElement('div');
    activeRouteHeader.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;';

    const activeRouteLabel = document.createElement('span');
    activeRouteLabel.style.cssText = 'font-size: 0.85rem; color: #4caf50;';
    activeRouteHeader.appendChild(activeRouteLabel);

    const activeRouteCancelBtn = document.createElement('button');
    activeRouteCancelBtn.textContent = 'Cancel Route';
    activeRouteCancelBtn.style.cssText =
      'font-size: 0.75rem; padding: 2px 8px;';
    activeRouteCancelBtn.addEventListener('click', () =>
      callbacks.onCancelMiningRoute()
    );
    activeRouteHeader.appendChild(activeRouteCancelBtn);
    activeRouteContainer.appendChild(activeRouteHeader);

    const activeRouteStats = document.createElement('div');
    activeRouteStats.style.cssText = 'font-size: 0.8rem; color: #888;';
    activeRouteContainer.appendChild(activeRouteStats);
    routeSection.appendChild(activeRouteContainer);

    // Setup route sub-container
    const setupRouteContainer = document.createElement('div');
    setupRouteContainer.style.display = 'none';

    const setupRouteLabel = document.createElement('div');
    setupRouteLabel.style.cssText =
      'font-size: 0.85rem; color: #aaa; margin-bottom: 0.35rem;';
    setupRouteLabel.textContent = '\u{1F504} Auto-Sell Route (idle mining)';
    setupRouteContainer.appendChild(setupRouteLabel);

    const noTradeMsg = document.createElement('div');
    noTradeMsg.style.cssText = 'font-size: 0.8rem; color: #888;';
    noTradeMsg.textContent =
      'No reachable trade stations available for auto-sell.';
    noTradeMsg.style.display = 'none';
    setupRouteContainer.appendChild(noTradeMsg);

    const setupRow = document.createElement('div');
    setupRow.style.cssText =
      'display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;';

    const miningRouteSelect = document.createElement('select');
    miningRouteSelect.style.cssText =
      'font-size: 0.8rem; padding: 3px 6px; background: #1a1a2e; color: #eee; border: 1px solid #444; border-radius: 3px;';
    setupRow.appendChild(miningRouteSelect);

    const startRouteBtn = document.createElement('button');
    startRouteBtn.textContent = 'Start Route';
    startRouteBtn.style.cssText = 'font-size: 0.8rem; padding: 3px 10px;';
    startRouteBtn.addEventListener('click', () =>
      callbacks.onStartMiningRoute(miningRouteSelect.value)
    );
    setupRow.appendChild(startRouteBtn);
    setupRouteContainer.appendChild(setupRow);

    const setupHint = document.createElement('div');
    setupHint.style.cssText =
      'font-size: 0.75rem; color: #666; margin-top: 0.25rem;';
    setupHint.textContent =
      'When cargo fills, ship auto-flies to sell ore, refuels, then returns to mine.';
    setupRouteContainer.appendChild(setupHint);
    routeSection.appendChild(setupRouteContainer);

    panel.appendChild(routeSection);

    return {
      panel,
      title,
      statusBadge,
      undockPrompt,
      oresSection,
      oresLabel,
      oreTagsContainer,
      minersSection,
      cargoSection,
      breakdownSection,
      routeSection,
      activeRouteContainer,
      activeRouteLabel,
      activeRouteCancelBtn,
      activeRouteStats,
      setupRouteContainer,
      setupRouteLabel,
      noTradeMsg,
      setupRow,
      miningRouteSelect,
      startRouteBtn,
      setupHint,
    };
  }

  // ── Factory: Quest Card ─────────────────────────────────────
  function createQuestCardRefs(quest: Quest, gd: GameData): QuestCardRefs {
    const card = document.createElement('div');
    card.className = 'quest-card';

    const title = document.createElement('div');
    title.className = 'quest-title';
    card.appendChild(title);

    const description = document.createElement('div');
    description.className = 'quest-description';
    card.appendChild(description);

    const details = document.createElement('div');
    details.className = 'quest-details';

    const destInfo = document.createElement('div');
    details.appendChild(destInfo);

    const distanceInfo = document.createElement('div');
    details.appendChild(distanceInfo);

    const cargoInfo = document.createElement('div');
    details.appendChild(cargoInfo);

    const totalCargoInfo = document.createElement('div');
    details.appendChild(totalCargoInfo);

    const tripsInfo = document.createElement('div');
    details.appendChild(tripsInfo);

    const fuelInfo = document.createElement('div');
    details.appendChild(fuelInfo);

    const timeInfo = document.createElement('div');
    details.appendChild(timeInfo);

    const crewCostInfo = document.createElement('div');
    crewCostInfo.style.color = '#ffa500';
    details.appendChild(crewCostInfo);

    const fuelCostInfo = document.createElement('div');
    fuelCostInfo.style.color = '#ffa500';
    details.appendChild(fuelCostInfo);

    const profitInfo = document.createElement('div');
    profitInfo.style.cssText = 'font-weight: bold; margin-top: 4px;';
    details.appendChild(profitInfo);

    // Risk line
    const riskLine = document.createElement('div');
    riskLine.style.display = 'flex';
    riskLine.style.alignItems = 'center';
    riskLine.style.gap = '8px';
    riskLine.style.marginTop = '4px';

    const riskLabel = document.createElement('span');
    riskLabel.textContent = 'Route Risk:';
    riskLine.appendChild(riskLabel);

    const riskBadgeSlot = document.createElement('div');
    riskBadgeSlot.style.display = 'inline-block';
    riskLine.appendChild(riskBadgeSlot);
    details.appendChild(riskLine);

    card.appendChild(details);

    // Payment
    const payment = document.createElement('div');
    payment.className = 'quest-payment';
    card.appendChild(payment);

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'quest-buttons';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'accept-quest-button';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', () =>
      callbacks.onAcceptQuest(quest.id)
    );
    buttonContainer.appendChild(acceptBtn);

    const assignBtn = document.createElement('button');
    assignBtn.className = 'assign-route-button';
    assignBtn.textContent = 'Assign Route';
    assignBtn.style.backgroundColor = '#4a90e2';
    assignBtn.addEventListener('click', () =>
      callbacks.onAssignRoute(quest.id)
    );
    buttonContainer.appendChild(assignBtn);

    card.appendChild(buttonContainer);

    // Reason div (for when quest can't be accepted)
    const reasonDiv = document.createElement('div');
    reasonDiv.className = 'quest-reason';
    card.appendChild(reasonDiv);

    // Initial population
    updateQuestCardRefs(
      {
        card,
        title,
        description,
        details,
        destInfo,
        distanceInfo,
        cargoInfo,
        totalCargoInfo,
        tripsInfo,
        fuelInfo,
        timeInfo,
        crewCostInfo,
        fuelCostInfo,
        profitInfo,
        riskLine,
        riskBadgeSlot,
        payment,
        buttonContainer,
        acceptBtn,
        assignBtn,
        reasonDiv,
      },
      quest,
      gd
    );

    return {
      card,
      title,
      description,
      details,
      destInfo,
      distanceInfo,
      cargoInfo,
      totalCargoInfo,
      tripsInfo,
      fuelInfo,
      timeInfo,
      crewCostInfo,
      fuelCostInfo,
      profitInfo,
      riskLine,
      riskBadgeSlot,
      payment,
      buttonContainer,
      acceptBtn,
      assignBtn,
      reasonDiv,
    };
  }

  function updateQuestCardRefs(
    refs: QuestCardRefs,
    quest: Quest,
    gd: GameData
  ): void {
    const ship = getActiveShip(gd);
    const destination = gd.world.locations.find(
      (l) => l.id === quest.destination
    );
    const origin = gd.world.locations.find((l) => l.id === quest.origin);
    const { canAccept, reason } = canAcceptQuest(ship, quest);

    // Card disabled state
    if (!canAccept) {
      refs.card.classList.add('disabled');
    } else {
      refs.card.classList.remove('disabled');
    }

    refs.title.textContent = quest.title;
    refs.description.textContent = quest.description;

    // Destination
    if (destination) {
      refs.destInfo.textContent = `Destination: ${destination.name}`;
      refs.destInfo.style.display = '';
    } else {
      refs.destInfo.style.display = 'none';
    }

    // Distance
    if (origin && destination) {
      const distance = Math.abs(
        origin.distanceFromEarth - destination.distanceFromEarth
      );
      refs.distanceInfo.textContent = `Distance: ${distance.toLocaleString()} km`;
      refs.distanceInfo.style.display = '';
    } else {
      refs.distanceInfo.style.display = 'none';
    }

    // Cargo
    if (quest.cargoRequired > 0) {
      refs.cargoInfo.textContent = `Cargo: ${quest.cargoRequired.toLocaleString()} kg`;
      refs.cargoInfo.style.display = '';
    } else {
      refs.cargoInfo.style.display = 'none';
    }

    // Total cargo
    if (quest.totalCargoRequired > 0) {
      refs.totalCargoInfo.textContent = `Total cargo: ${quest.totalCargoRequired.toLocaleString()} kg`;
      refs.totalCargoInfo.style.display = '';
    } else {
      refs.totalCargoInfo.style.display = 'none';
    }

    // Trips
    if (quest.tripsRequired > 0) {
      refs.tripsInfo.textContent = `Trips: ${quest.tripsRequired}`;
      refs.tripsInfo.style.display = '';
    } else if (quest.tripsRequired === -1) {
      refs.tripsInfo.textContent = 'Trips: Unlimited';
      refs.tripsInfo.style.display = '';
    } else {
      refs.tripsInfo.style.display = 'none';
    }

    // Recalculate fuel and time based on flight profile
    const burnFraction = ship.flightProfileBurnFraction ?? 1.0;
    const distanceKm =
      origin && destination ? getDistanceBetween(origin, destination) : 0;

    // Profile-aware fuel estimate (round trip)
    const profileFuelKg =
      distanceKm > 0
        ? calculateTripFuelKg(ship, distanceKm, burnFraction) * 2
        : quest.estimatedFuelPerTrip;

    // Profile-aware time estimate (round trip in game seconds)
    const profileTimeSecs =
      distanceKm > 0
        ? estimateTripTime(ship, distanceKm, burnFraction) * 2
        : quest.estimatedTripTicks * GAME_SECONDS_PER_TICK;
    const profileTimeTicks = gameSecondsToTicks(profileTimeSecs);

    refs.fuelInfo.textContent = `Fuel: ~${formatFuelMass(profileFuelKg)} per trip`;
    refs.timeInfo.textContent = `Time: ~${formatDuration(profileTimeSecs)} per trip`;

    // Costs
    const crewSalaryPerTick = calculateShipSalaryPerTick(ship);
    const tripCrewCost = Math.round(crewSalaryPerTick * profileTimeTicks);

    const currentLocation = gd.world.locations.find(
      (l) => l.id === (ship.location.dockedAt || ship.location.orbitingAt)
    );
    const fuelPricePerKg = currentLocation
      ? getFuelPricePerKg(currentLocation, ship)
      : 2.0;
    const tripFuelCost = Math.round(profileFuelKg * fuelPricePerKg);

    if (tripCrewCost > 0) {
      refs.crewCostInfo.textContent = `Crew Salaries: ~${tripCrewCost.toLocaleString()} cr per trip`;
      refs.crewCostInfo.style.display = '';
    } else {
      refs.crewCostInfo.style.display = 'none';
    }

    refs.fuelCostInfo.textContent = `Fuel Cost: ~${tripFuelCost.toLocaleString()} cr per trip`;

    // Profit
    const tripPayment =
      quest.paymentPerTrip > 0
        ? quest.paymentPerTrip
        : quest.paymentOnCompletion;
    const totalCost = tripCrewCost + tripFuelCost;
    const profit = tripPayment - totalCost;

    refs.profitInfo.style.color = profit >= 0 ? '#4caf50' : '#e94560';
    refs.profitInfo.textContent = `Est. Profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} cr per trip`;

    // Route risk
    if (origin && destination) {
      const routeRisk = estimateRouteRisk(origin, destination, ship, gd.world);
      const threatLevel = getThreatLevel(routeRisk);
      const narrative = getThreatNarrative(threatLevel);

      // Replace badge in slot (leaf helper — transient)
      refs.riskBadgeSlot.textContent = '';
      refs.riskBadgeSlot.appendChild(renderThreatBadge(threatLevel, narrative));
      refs.riskLine.style.display = 'flex';
    } else {
      refs.riskLine.style.display = 'none';
    }

    // Payment
    if (quest.paymentPerTrip > 0) {
      refs.payment.textContent = `Payment: ${quest.paymentPerTrip.toLocaleString()} credits/trip`;
    } else {
      refs.payment.textContent = `Payment: ${quest.paymentOnCompletion.toLocaleString()} credits on completion`;
    }

    // Buttons vs reason
    if (canAccept) {
      refs.buttonContainer.style.display = 'flex';
      refs.reasonDiv.style.display = 'none';
      // Show assign button only for standing freight and trade routes
      refs.assignBtn.style.display =
        quest.type === 'standing_freight' || quest.type === 'trade_route'
          ? ''
          : 'none';
    } else {
      refs.buttonContainer.style.display = 'none';
      if (reason) {
        refs.reasonDiv.textContent = reason;
        refs.reasonDiv.style.display = '';
      } else {
        refs.reasonDiv.style.display = 'none';
      }
    }
  }

  // ── Update: No Contract Phase ───────────────────────────────
  function updateNoContractPhase(gd: GameData): void {
    const ship = getActiveShip(gd);
    const location = ship.location.dockedAt || ship.location.orbitingAt;

    if (
      !location ||
      (ship.location.status !== 'docked' && ship.location.status !== 'orbiting')
    ) {
      // Nothing to show — hide content but keep phase visible for structure
      noContractRefs.heading.textContent = 'Available Work';
      noContractRefs.shipContext.style.display = 'none';
      noContractRefs.tradeSection.style.display = 'none';
      noContractRefs.contractSection.style.display = 'none';
      noContractRefs.miningSlot.style.display = 'none';
      // Remove profile control if it was placed here
      if (profileControl.el.parentNode === noContractRefs.container) {
        profileControl.el.remove();
      }
      return;
    }

    const locationData = gd.world.locations.find((l) => l.id === location);
    if (!locationData) {
      noContractRefs.shipContext.style.display = 'none';
      noContractRefs.tradeSection.style.display = 'none';
      noContractRefs.contractSection.style.display = 'none';
      noContractRefs.miningSlot.style.display = 'none';
      return;
    }

    // Show flight profile slider at top of no-contract content
    updateFlightProfileControl(profileControl, ship);
    // Insert before the heading if not already there
    if (profileControl.el.parentNode !== noContractRefs.container) {
      noContractRefs.container.insertBefore(
        profileControl.el,
        noContractRefs.container.firstChild
      );
    }

    // Mining status
    if (locationData.services.includes('mine')) {
      noContractRefs.miningSlot.style.display = '';
      updateMiningStatus(gd, ship, locationData);
    } else {
      noContractRefs.miningSlot.style.display = 'none';
    }

    // Heading
    noContractRefs.heading.textContent = `Available Work at ${locationData.name}`;

    // Ship context
    noContractRefs.shipContext.style.display = '';
    noContractRefs.shipContextName.textContent = ship.name;

    // Get quests
    const availableQuests = gd.availableQuests[location] || [];
    const tradeRoutes = availableQuests.filter((q) => q.type === 'trade_route');
    const regularQuests = availableQuests.filter(
      (q) => q.type !== 'trade_route'
    );

    // Trade routes section
    if (tradeRoutes.length > 0) {
      noContractRefs.tradeSection.style.display = '';

      // Sort: acceptable first
      const sortedTrade = [...tradeRoutes].sort((a, b) => {
        const aOk = canAcceptQuest(ship, a).canAccept;
        const bOk = canAcceptQuest(ship, b).canAccept;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return 0;
      });

      // Reconcile trade quest cards
      reconcileQuestCards(
        tradeQuestCards,
        noContractRefs.tradeCardsContainer,
        sortedTrade,
        gd
      );
    } else {
      noContractRefs.tradeSection.style.display = 'none';
      // Clean up stale cards
      for (const [id, refs] of tradeQuestCards) {
        refs.card.remove();
        tradeQuestCards.delete(id);
      }
    }

    // Regular contracts section
    noContractRefs.contractSection.style.display = '';

    // Show/hide heading based on whether both sections exist
    noContractRefs.contractHeading.style.display =
      tradeRoutes.length > 0 && regularQuests.length > 0 ? '' : 'none';

    if (regularQuests.length === 0 && tradeRoutes.length === 0) {
      noContractRefs.noQuestsMsg.style.display = '';
      // Clean up stale cards
      for (const [id, refs] of regularQuestCards) {
        refs.card.remove();
        regularQuestCards.delete(id);
      }
    } else {
      noContractRefs.noQuestsMsg.style.display = 'none';

      if (regularQuests.length > 0) {
        const sortedQuests = [...regularQuests].sort((a, b) => {
          const aAcceptable = canAcceptQuest(ship, a).canAccept;
          const bAcceptable = canAcceptQuest(ship, b).canAccept;
          if (aAcceptable && !bAcceptable) return -1;
          if (!aAcceptable && bAcceptable) return 1;
          return 0;
        });

        reconcileQuestCards(
          regularQuestCards,
          noContractRefs.contractCardsContainer,
          sortedQuests,
          gd
        );
      } else {
        // No regular quests but trade routes exist — clean up
        for (const [id, refs] of regularQuestCards) {
          refs.card.remove();
          regularQuestCards.delete(id);
        }
      }
    }
  }

  /** Reconcile a Map of quest card refs with the current quest list. */
  function reconcileQuestCards(
    cardMap: Map<string, QuestCardRefs>,
    parentEl: HTMLElement,
    quests: Quest[],
    gd: GameData
  ): void {
    const currentIds = new Set<string>();

    for (const quest of quests) {
      currentIds.add(quest.id);

      let refs = cardMap.get(quest.id);
      if (!refs) {
        // New quest — create card
        refs = createQuestCardRefs(quest, gd);
        cardMap.set(quest.id, refs);
        parentEl.appendChild(refs.card);
      } else {
        // Existing quest — update in place
        updateQuestCardRefs(refs, quest, gd);
      }
    }

    // Remove cards for quests no longer present
    for (const [id, refs] of cardMap) {
      if (!currentIds.has(id)) {
        refs.card.remove();
        cardMap.delete(id);
      }
    }

    // Ensure correct order
    for (const quest of quests) {
      const refs = cardMap.get(quest.id);
      if (refs) {
        parentEl.appendChild(refs.card);
      }
    }
  }

  // ── Update: Mining Status ───────────────────────────────────
  function updateMiningStatus(
    gd: GameData,
    ship: Ship,
    location: WorldLocation
  ): void {
    if (!miningRefs) {
      miningRefs = createMiningStatusRefs();
      noContractRefs.miningSlot.appendChild(miningRefs.panel);
    }

    const refs = miningRefs;

    refs.title.textContent = `\u26CF\uFE0F Mining at ${location.name}`;

    // Status badge
    const isDocked = ship.location.status === 'docked';
    const miners = getCrewForJobType(ship, 'mining_ops');
    const shipMiningEquip = getBestShipMiningEquipment(ship);
    const hasActiveMiner = shipMiningEquip !== undefined && miners.length > 0;

    if (isDocked) {
      refs.statusBadge.style.cssText =
        'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(74,158,255,0.15); color: #4a9eff; border: 1px solid #4a9eff;';
      refs.statusBadge.textContent = 'DOCKED';
    } else if (hasActiveMiner && getRemainingOreCapacity(ship) > 0) {
      refs.statusBadge.style.cssText =
        'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(76,175,80,0.2); color: #4caf50; border: 1px solid #4caf50;';
      refs.statusBadge.textContent = 'ACTIVE';
    } else if (hasActiveMiner) {
      refs.statusBadge.style.cssText =
        'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(233,69,96,0.2); color: #e94560; border: 1px solid #e94560;';
      refs.statusBadge.textContent = 'CARGO FULL';
    } else {
      refs.statusBadge.style.cssText =
        'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(255,165,0,0.15); color: #ffa500; border: 1px solid #b87333;';
      refs.statusBadge.textContent = 'IDLE';
    }

    // Undock prompt
    refs.undockPrompt.style.display = isDocked ? '' : 'none';

    // Available ores — reconcile tags
    const availableOres = location.availableOres ?? [];
    const currentOreIds = new Set<string>();

    for (const oreId of availableOres) {
      currentOreIds.add(oreId);
      const ore = getOreDefinition(oreId);
      const someMinerCanMine = miners.some((m) =>
        canMineOre(m.skills.mining, oreId)
      );

      let tag = oreTagMap.get(oreId);
      if (!tag) {
        tag = document.createElement('span');
        tag.style.cssText = `
          display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px;
          border-radius: 3px; font-size: 0.8rem;
          background: rgba(255,165,0,0.15); border: 1px solid #665533;
        `;
        oreTagMap.set(oreId, tag);
        refs.oreTagsContainer.appendChild(tag);
      }

      if (!someMinerCanMine) {
        tag.style.opacity = '0.5';
        tag.title = `Requires Mining ${ore.miningLevelRequired}`;
        tag.textContent = `${ore.icon} ${ore.name} (${ore.baseValue} cr) [Mining ${ore.miningLevelRequired}]`;
      } else {
        tag.style.opacity = '1';
        tag.title = '';
        tag.textContent = `${ore.icon} ${ore.name} (${ore.baseValue} cr)`;
      }
    }

    // Remove tags for ores no longer available
    for (const [id, tag] of oreTagMap) {
      if (!currentOreIds.has(id)) {
        tag.remove();
        oreTagMap.delete(id);
      }
    }

    // Miners section — reconcile
    refs.minersSection.textContent = '';
    minerLineMap.clear();

    if (miners.length === 0) {
      const noMiners = document.createElement('div');
      noMiners.style.color = '#e94560';
      noMiners.textContent =
        'No crew assigned to Mining Ops. Assign crew in the Ship tab.';
      refs.minersSection.appendChild(noMiners);
    } else if (!shipMiningEquip) {
      const noEquip = document.createElement('div');
      noEquip.style.color = '#e94560';
      noEquip.textContent =
        'No mining equipment installed on ship. Purchase at a station store.';
      refs.minersSection.appendChild(noEquip);
    } else {
      // Show ship equipment info
      const equipInfo = document.createElement('div');
      equipInfo.style.cssText =
        'margin-bottom: 4px; color: #6c6; font-size: 0.8rem;';
      let equipText = `Ship Equipment: ${shipMiningEquip.name} (${shipMiningEquip.miningRate}x)`;
      if (
        shipMiningEquip.miningLevelRequired &&
        shipMiningEquip.miningLevelRequired > 0
      ) {
        equipText += ` \u00B7 Requires Mining ${shipMiningEquip.miningLevelRequired}`;
      }
      equipInfo.textContent = equipText;
      refs.minersSection.appendChild(equipInfo);

      for (const miner of miners) {
        const minerLine = document.createElement('div');
        minerLine.style.cssText = 'margin-bottom: 2px; color: #ccc;';
        const miningSkill = Math.floor(miner.skills.mining);

        if (miningSkill < (shipMiningEquip.miningLevelRequired ?? 0)) {
          minerLine.style.color = '#ffa500';
          minerLine.textContent = `${miner.name} (Mining ${miningSkill}) \u2014 Skill too low to operate equipment`;
        } else {
          const bestOre = availableOres
            .map((id) => getOreDefinition(id))
            .filter((o) => miningSkill >= o.miningLevelRequired)
            .sort((a, b) => b.baseValue - a.baseValue)[0];

          minerLine.textContent = `${miner.name} (Mining ${miningSkill})`;
          if (bestOre) {
            minerLine.textContent += ` \u2192 ${bestOre.icon} ${bestOre.name}`;
          }
        }
        refs.minersSection.appendChild(minerLine);
        minerLineMap.set(miner.id, minerLine);
      }
    }

    // Cargo status
    const oreWeight = getOreCargoWeight(ship);
    const remaining = getRemainingOreCapacity(ship);
    const totalOreUnits = ship.oreCargo.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    let cargoText = `Ore Cargo: ${totalOreUnits} units (${Math.round(oreWeight).toLocaleString()} kg)`;
    if (remaining <= 0) {
      cargoText += ' \u2014 FULL';
      refs.cargoSection.style.color = '#e94560';
    } else {
      cargoText += ` \u2014 ${Math.round(remaining).toLocaleString()} kg remaining`;
      refs.cargoSection.style.color = '#aaa';
    }
    refs.cargoSection.textContent = cargoText;

    // Ore cargo breakdown — reconcile
    const currentOreCargoIds = new Set<string>();
    refs.breakdownSection.textContent = '';
    oreCargoLineMap.clear();

    if (ship.oreCargo.length > 0) {
      refs.breakdownSection.style.display = '';
      for (const item of ship.oreCargo) {
        currentOreCargoIds.add(item.oreId);
        const ore = getOreDefinition(item.oreId);
        const line = document.createElement('div');
        line.textContent = `  ${ore.icon} ${ore.name}: ${item.quantity} units`;
        refs.breakdownSection.appendChild(line);
        oreCargoLineMap.set(item.oreId, line);
      }
    } else {
      refs.breakdownSection.style.display = 'none';
    }

    // Mining route controls
    if (ship.miningRoute) {
      refs.activeRouteContainer.style.display = '';
      refs.setupRouteContainer.style.display = 'none';

      const route = ship.miningRoute;
      const sellLoc = gd.world.locations.find(
        (l) => l.id === route.sellLocationId
      );

      refs.activeRouteLabel.textContent = `\u{1F504} Auto-sell route \u2192 ${sellLoc?.name ?? 'Unknown'}`;
      refs.activeRouteStats.textContent = `Trips: ${route.totalTrips} \u00B7 Earned: ${route.totalCreditsEarned.toLocaleString()} cr \u00B7 Status: ${route.status}`;
    } else {
      refs.activeRouteContainer.style.display = 'none';
      refs.setupRouteContainer.style.display = '';

      // Find reachable trade locations
      const tradeLocations = gd.world.locations.filter(
        (l) =>
          l.id !== location.id &&
          l.services.includes('trade') &&
          canShipAccessLocation(ship, l)
      );

      if (tradeLocations.length === 0) {
        refs.noTradeMsg.style.display = '';
        refs.setupRow.style.display = 'none';
        refs.setupHint.style.display = 'none';
      } else {
        refs.noTradeMsg.style.display = 'none';
        refs.setupRow.style.display = 'flex';
        refs.setupHint.style.display = '';

        // Sort by distance (nearest first)
        const sorted = tradeLocations
          .map((loc) => ({
            loc,
            dist: getDistanceBetween(location, loc),
          }))
          .sort((a, b) => a.dist - b.dist);

        // Reconcile select options
        const currentLocIds = new Set<string>();
        for (const { loc, dist } of sorted) {
          currentLocIds.add(loc.id);

          const distLabel =
            dist < 1e9
              ? `${(dist / 1e6).toFixed(0)} Mm`
              : `${(dist / 1e9).toFixed(1)} Gm`;
          const priceHint =
            loc.type === 'planet'
              ? '1.1\u00D7'
              : loc.type === 'space_station'
                ? '1.0\u00D7'
                : loc.type === 'orbital'
                  ? '0.85\u00D7'
                  : loc.type === 'moon'
                    ? '0.9\u00D7'
                    : '0.8\u00D7';
          const optText = `${loc.name} (${distLabel}, ${priceHint} price)`;

          let opt = miningSelectOptionMap.get(loc.id);
          if (!opt) {
            opt = document.createElement('option');
            opt.value = loc.id;
            miningSelectOptionMap.set(loc.id, opt);
            refs.miningRouteSelect.appendChild(opt);
          }
          opt.textContent = optText;
        }

        // Remove options no longer reachable
        for (const [id, opt] of miningSelectOptionMap) {
          if (!currentLocIds.has(id)) {
            opt.remove();
            miningSelectOptionMap.delete(id);
          }
        }

        // Ensure correct order
        for (const { loc } of sorted) {
          const opt = miningSelectOptionMap.get(loc.id);
          if (opt) {
            refs.miningRouteSelect.appendChild(opt);
          }
        }
      }
    }
  }

  // ── Update: Active Contract Phase ───────────────────────────
  function updateActiveContractPhase(gd: GameData): void {
    const ship = getActiveShip(gd);
    const activeContract = ship.activeContract;
    const refs = activeContractRefs;

    if (!activeContract) return;

    // Route assignment
    updateRouteAssignmentRefs(refs.routeAssignment, gd);

    const quest = activeContract.quest;

    // Contract summary
    refs.summaryTitle.textContent = quest.title;

    if (quest.tripsRequired === -1) {
      refs.progress.textContent = `Trips completed: ${activeContract.tripsCompleted} (Unlimited)`;
    } else if (quest.type === 'supply') {
      refs.progress.textContent = `Cargo delivered: ${activeContract.cargoDelivered.toLocaleString()} / ${quest.totalCargoRequired.toLocaleString()} kg`;
    } else {
      refs.progress.textContent = `Trip ${activeContract.tripsCompleted + 1}/${quest.tripsRequired}`;
    }

    refs.leg.textContent =
      activeContract.leg === 'outbound' ? 'Leg: Outbound' : 'Leg: Inbound';

    // Payment info
    if (quest.paymentPerTrip > 0) {
      refs.paymentInfo.textContent =
        activeContract.leg === 'outbound'
          ? `Next payment: ${quest.paymentPerTrip.toLocaleString()} cr on inbound arrival`
          : `Next payment: ${quest.paymentPerTrip.toLocaleString()} cr on arrival`;
    } else if (quest.paymentOnCompletion > 0) {
      refs.paymentInfo.textContent = `Completion bonus: ${quest.paymentOnCompletion.toLocaleString()} cr`;
    } else {
      refs.paymentInfo.textContent = '';
    }

    refs.earned.textContent = `Earned so far: ${activeContract.creditsEarned.toLocaleString()} credits`;

    // Status hints
    if (ship.location.status === 'in_flight') {
      if (activeContract.abandonRequested) {
        refs.abandonHint.style.display = '';
        refs.pauseHint.style.display = 'none';
      } else if (activeContract.paused) {
        refs.abandonHint.style.display = 'none';
        refs.pauseHint.style.display = '';
      } else {
        refs.abandonHint.style.display = 'none';
        refs.pauseHint.style.display = 'none';
      }
    } else {
      refs.abandonHint.style.display = 'none';
      refs.pauseHint.style.display = 'none';
    }

    // Fuel gauge
    refs.fuelLabel.textContent = `Fuel: ${formatFuelMass(ship.fuelKg)}`;
    const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
    refs.fuelFill.style.width = `${fuelPercentage}%`;
  }

  // ── Update: Paused Contract Phase ───────────────────────────
  function updatePausedContractPhase(gd: GameData): void {
    const ship = getActiveShip(gd);
    const activeContract = ship.activeContract;
    const refs = pausedContractRefs;

    if (!activeContract) return;

    // Route assignment
    updateRouteAssignmentRefs(refs.routeAssignment, gd);

    const quest = activeContract.quest;
    const flight = ship.activeFlightPlan;
    const stillInFlight = ship.location.status === 'in_flight' && !!flight;

    // Contract summary
    refs.summaryTitle.textContent = quest.title;

    refs.pauseHint.textContent = stillInFlight
      ? 'Ship will dock on arrival. Resume to continue earning.'
      : 'Docked mid-route \u2014 resume to continue earning.';

    if (quest.tripsRequired === -1) {
      refs.progress.textContent = `Trips completed: ${activeContract.tripsCompleted} (Unlimited)`;
    } else if (quest.type === 'supply') {
      refs.progress.textContent = `Cargo delivered: ${activeContract.cargoDelivered.toLocaleString()} / ${quest.totalCargoRequired.toLocaleString()} kg`;
    } else {
      refs.progress.textContent = `Trip ${activeContract.tripsCompleted + 1}/${quest.tripsRequired}`;
    }

    refs.earned.textContent = `Earned so far: ${activeContract.creditsEarned.toLocaleString()} credits`;

    // Abandon button state
    updatePausedAbandonButton();

    // Abandon hint
    const hasRouteAssignment = !!ship.routeAssignment;
    let hintText = `Abandon ends contract permanently. You keep ${activeContract.creditsEarned.toLocaleString()} cr from completed trips.`;
    if (hasRouteAssignment) {
      hintText += ' Your automated route assignment will also end.';
    }
    refs.abandonHint.textContent = hintText;
  }

  // ── Main update function ────────────────────────────────────
  function update(gameData: GameData): void {
    const ship = getActiveShip(gameData);
    const activeContract = ship.activeContract;

    // Phase: paused-while-in-flight stays 'active' so radio buttons
    // remain visible and the user can toggle their choice freely.
    const curPhase: 'none' | 'active' | 'paused' = !activeContract
      ? 'none'
      : activeContract.paused && ship.location.status !== 'in_flight'
        ? 'paused'
        : 'active';

    if (curPhase !== prevPhase) {
      pausedAbandonPending = false;
      if (pausedAbandonTimer) {
        clearTimeout(pausedAbandonTimer);
        pausedAbandonTimer = null;
      }
      prevPhase = curPhase;
    }

    // Toggle phase containers
    noContractRefs.container.style.display = curPhase === 'none' ? '' : 'none';
    activeContractRefs.container.style.display =
      curPhase === 'active' ? '' : 'none';
    pausedContractRefs.container.style.display =
      curPhase === 'paused' ? '' : 'none';

    // Update the consolidated flight status component (handles its own
    // visibility: shows flight info when in flight, radio buttons when
    // there's an active contract in flight)
    flightStatusComponent.update(gameData);

    if (curPhase === 'none') {
      updateNoContractPhase(gameData);
      // Remove profile control from other locations if needed
      if (profileControl.el.parentNode === activeContractRefs.container) {
        profileControl.el.remove();
      }
    } else if (curPhase === 'active') {
      updateActiveContractPhase(gameData);

      // Flight profile slider below flight status component
      updateFlightProfileControl(profileControl, ship);
      flightStatusComponent.el.after(profileControl.el);
    } else if (curPhase === 'paused') {
      updatePausedContractPhase(gameData);

      // Show flight profile slider for adjusting before resume
      updateFlightProfileControl(profileControl, ship);
      if (profileControl.el.parentNode !== pausedContractRefs.container) {
        pausedContractRefs.container.appendChild(profileControl.el);
      }
    }
  }

  // Initial render
  update(gameData);
  return { el: container, update };
}
