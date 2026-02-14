import type { GameData, Quest, Ship } from '../models';
import { getActiveShip } from '../models';
import {
  formatDualTime,
  GAME_SECONDS_PER_TICK,
  GAME_SECONDS_PER_HOUR,
} from '../timeSystem';
import { canAcceptQuest, resolveQuestForShip } from '../questGen';
import { calculateShipSalaryPerTick } from '../crewRoles';
import {
  estimateRouteRisk,
  getThreatLevel,
  getThreatNarrative,
} from '../encounterSystem';
import { renderThreatBadge } from './threatBadge';
import type { Component } from './component';
import { formatFuelMass, calculateFuelPercentage } from './fuelFormatting';
import { getFuelPricePerKg } from './refuelDialog';
import { createFlightStatusComponent } from './flightStatus';
import {
  getCommandCommerceBonus,
  getHypotheticalCaptainBonus,
} from '../captainBonus';
import { formatCredits, formatMass, formatDistance } from '../formatting';
import {
  createFlightProfileControl,
  updateFlightProfileControl,
} from './flightProfileControl';
import { createMiningPanel } from './miningPanel';
import {
  updateMiningRouteInfoBar,
  updateMiningRouteSetup as updateMiningRouteSetupImpl,
  type MineCardRefs,
} from './miningRouteSetup';

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
  onStartMiningRoute: (sellLocationId: string, mineLocationId?: string) => void;
  onCancelMiningRoute: () => void;
  onSelectMiningOre: (oreId: string | null) => void;
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
  captainBonusInfo: HTMLDivElement;
  captainHintInfo: HTMLDivElement;
  profitInfo: HTMLDivElement;
  riskLine: HTMLDivElement;
  riskBadgeSlot: HTMLDivElement;
  payment: HTMLDivElement;
  buttonContainer: HTMLDivElement;
  acceptBtn: HTMLButtonElement;
  assignBtn: HTMLButtonElement;
  warningsDiv: HTMLDivElement;
  reasonDiv: HTMLDivElement;
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
  miningRouteInfoBar: HTMLDivElement;
  miningRouteInfoLabel: HTMLSpanElement;
  miningRouteInfoStatus: HTMLDivElement;
  miningRouteInfoStats: HTMLDivElement;
  miningRouteInfoCancelBtn: HTMLButtonElement;
  miningRouteSetupSection: HTMLDivElement;
  miningRouteSetupHeading: HTMLHeadingElement;
  miningRouteSetupContainer: HTMLDivElement;
  miningRouteSetupNoMines: HTMLParagraphElement;
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

  // Mining status panel — self-contained component (created lazily)
  let miningPanel: ReturnType<typeof createMiningPanel> | null = null;

  // Mining route setup — reconciliation map for mine cards
  const mineCardMap = new Map<string, MineCardRefs>();

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

    // ── Mining Route Info Bar (shown at any station when route is active) ──
    const miningRouteInfoBar = document.createElement('div');
    miningRouteInfoBar.style.cssText = `
      padding: 0.75rem; margin-bottom: 0.75rem;
      border: 2px solid #b87333; border-radius: 4px;
      background: rgba(255, 165, 0, 0.08); display: none;
    `;

    const miningRouteInfoHeader = document.createElement('div');
    miningRouteInfoHeader.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;';

    const miningRouteInfoLabel = document.createElement('span');
    miningRouteInfoLabel.style.cssText =
      'font-weight: bold; font-size: 0.9rem; color: #ffa500;';
    miningRouteInfoHeader.appendChild(miningRouteInfoLabel);

    const miningRouteInfoCancelBtn = document.createElement('button');
    miningRouteInfoCancelBtn.textContent = 'Cancel Route';
    miningRouteInfoCancelBtn.style.cssText =
      'font-size: 0.75rem; padding: 2px 8px;';
    miningRouteInfoCancelBtn.addEventListener('click', () =>
      callbacks.onCancelMiningRoute()
    );
    miningRouteInfoHeader.appendChild(miningRouteInfoCancelBtn);
    miningRouteInfoBar.appendChild(miningRouteInfoHeader);

    const miningRouteInfoStatus = document.createElement('div');
    miningRouteInfoStatus.style.cssText =
      'font-size: 0.85rem; color: #ccc; margin-bottom: 0.25rem;';
    miningRouteInfoBar.appendChild(miningRouteInfoStatus);

    const miningRouteInfoStats = document.createElement('div');
    miningRouteInfoStats.style.cssText = 'font-size: 0.8rem; color: #888;';
    miningRouteInfoBar.appendChild(miningRouteInfoStats);

    cont.appendChild(miningRouteInfoBar);

    // ── Mining Route Setup Section (non-mine stations) ──
    const miningRouteSetupSection = document.createElement('div');
    miningRouteSetupSection.className = 'mining-route-setup-section';
    miningRouteSetupSection.style.display = 'none';

    const miningRouteSetupHeading = document.createElement('h4');
    miningRouteSetupHeading.textContent = 'Mining Routes';
    miningRouteSetupHeading.style.cssText =
      'color: #ffa500; margin-bottom: 0.25rem;';
    miningRouteSetupSection.appendChild(miningRouteSetupHeading);

    const miningRouteSetupDesc = document.createElement('p');
    miningRouteSetupDesc.style.cssText =
      'color: #888; font-size: 0.85rem; margin-top: 0; margin-bottom: 0.75rem;';
    miningRouteSetupDesc.textContent =
      'Start an automated mining route. Your ship will fly to the mine, fill cargo, sell ore, and repeat.';
    miningRouteSetupSection.appendChild(miningRouteSetupDesc);

    const miningRouteSetupNoMines = document.createElement('p');
    miningRouteSetupNoMines.style.cssText = 'font-size: 0.85rem; color: #666;';
    miningRouteSetupNoMines.textContent = 'No reachable mining locations.';
    miningRouteSetupNoMines.style.display = 'none';
    miningRouteSetupSection.appendChild(miningRouteSetupNoMines);

    const miningRouteSetupContainer = document.createElement('div');
    miningRouteSetupContainer.style.cssText =
      'display: flex; flex-direction: column; gap: 8px;';
    miningRouteSetupSection.appendChild(miningRouteSetupContainer);

    cont.appendChild(miningRouteSetupSection);

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
      miningRouteInfoBar,
      miningRouteInfoLabel,
      miningRouteInfoStatus,
      miningRouteInfoStats,
      miningRouteInfoCancelBtn,
      miningRouteSetupSection,
      miningRouteSetupHeading,
      miningRouteSetupContainer,
      miningRouteSetupNoMines,
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
    <div><strong>Credits Earned:</strong> ${formatCredits(assignment.creditsEarned)}</div>
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

    const captainBonusInfo = document.createElement('div');
    details.appendChild(captainBonusInfo);

    const captainHintInfo = document.createElement('div');
    captainHintInfo.style.cssText = 'color: #666; font-size: 0.85em;';
    details.appendChild(captainHintInfo);

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

    // Details toggle button (visible only on mobile via CSS)
    const detailsToggle = document.createElement('button');
    detailsToggle.className = 'quest-details-toggle';
    detailsToggle.textContent = 'Show Details';
    detailsToggle.addEventListener('click', () => {
      const expanded = details.classList.toggle('quest-details-expanded');
      detailsToggle.textContent = expanded ? 'Hide Details' : 'Show Details';
    });
    card.appendChild(detailsToggle);

    // Warnings div (soft warnings that don't block acceptance)
    const warningsDiv = document.createElement('div');
    warningsDiv.className = 'quest-warnings';
    warningsDiv.style.color = '#fbbf24';
    warningsDiv.style.fontSize = '0.85em';
    warningsDiv.style.marginTop = '0.5rem';
    warningsDiv.style.padding = '0.4rem 0.6rem';
    warningsDiv.style.background = 'rgba(251, 191, 36, 0.08)';
    warningsDiv.style.borderLeft = '3px solid #fbbf24';
    warningsDiv.style.display = 'none';
    card.appendChild(warningsDiv);

    // Reason div (for when quest can't be accepted)
    const reasonDiv = document.createElement('div');
    reasonDiv.className = 'quest-reason';
    card.appendChild(reasonDiv);

    // Initial population
    const refs: QuestCardRefs = {
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
      captainBonusInfo,
      captainHintInfo,
      profitInfo,
      riskLine,
      riskBadgeSlot,
      payment,
      buttonContainer,
      acceptBtn,
      assignBtn,
      warningsDiv,
      reasonDiv,
    };
    updateQuestCardRefs(refs, quest, gd);
    return refs;
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

    // Resolve quest template into per-ship values (cargo, payment, fuel, time)
    const resolved = resolveQuestForShip(quest, ship, gd.world);
    const { canAccept, reason, warnings } = canAcceptQuest(
      ship,
      quest,
      gd.world
    );

    // Show soft warnings
    if (warnings && warnings.length > 0) {
      refs.warningsDiv.textContent = warnings.join(' ');
      refs.warningsDiv.style.display = '';
    } else {
      refs.warningsDiv.style.display = 'none';
    }

    // Card disabled state
    if (!canAccept) {
      refs.card.classList.add('disabled');
    } else {
      refs.card.classList.remove('disabled');
    }

    refs.title.textContent = quest.title;
    refs.description.textContent = resolved.description;

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
      refs.distanceInfo.textContent = `Distance: ${formatDistance(distance)}`;
      refs.distanceInfo.style.display = '';
    } else {
      refs.distanceInfo.style.display = 'none';
    }

    // Cargo
    if (resolved.cargoRequired > 0) {
      refs.cargoInfo.textContent = `Cargo: ${formatMass(resolved.cargoRequired)}`;
      refs.cargoInfo.style.display = '';
    } else {
      refs.cargoInfo.style.display = 'none';
    }

    // Total cargo
    if (quest.totalCargoRequired > 0) {
      refs.totalCargoInfo.textContent = `Total cargo: ${formatMass(quest.totalCargoRequired)}`;
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

    // Fuel and time from resolved per-ship values
    const profileFuelKg = resolved.estimatedFuelPerTrip;
    const profileTimeSecs = resolved.estimatedTripTicks * GAME_SECONDS_PER_TICK;
    const profileTimeTicks = resolved.estimatedTripTicks;

    refs.fuelInfo.textContent = `Fuel: ~${formatFuelMass(profileFuelKg)} per trip`;
    refs.timeInfo.textContent = `Time: ~${formatDualTime(profileTimeSecs)} per trip`;

    // Helper: convert a per-trip value to a per-game-hour rate
    const perHour = (value: number): number =>
      profileTimeSecs > 0
        ? Math.round((value / profileTimeSecs) * GAME_SECONDS_PER_HOUR)
        : 0;

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
      refs.crewCostInfo.textContent = `Crew Salaries: ~${formatCredits(perHour(tripCrewCost))}/hr`;
      refs.crewCostInfo.style.display = '';
    } else {
      refs.crewCostInfo.style.display = 'none';
    }

    refs.fuelCostInfo.textContent = `Fuel Cost: ~${formatCredits(perHour(tripFuelCost))}/hr`;

    // For lump-sum multi-trip contracts, divide by trips for per-trip comparison
    const tripPayment =
      resolved.paymentPerTrip > 0
        ? resolved.paymentPerTrip
        : quest.tripsRequired > 1
          ? Math.round(resolved.paymentOnCompletion / quest.tripsRequired)
          : resolved.paymentOnCompletion;

    // Captain command bonus attribution
    updateCaptainBonusDisplay(refs, ship, gd);

    // Profit
    const totalCost = tripCrewCost + tripFuelCost;
    const profit = tripPayment - totalCost;

    refs.profitInfo.style.color = profit >= 0 ? '#4caf50' : '#e94560';
    refs.profitInfo.textContent = `Est. Profit: ${profit >= 0 ? '+' : ''}${formatCredits(perHour(profit))}/hr`;

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

    // Payment — show per-hour rate for comparability across different trip distances
    if (resolved.paymentPerTrip > 0) {
      refs.payment.textContent = `Payment: ${formatCredits(perHour(resolved.paymentPerTrip))}/hr (${formatCredits(resolved.paymentPerTrip)}/trip)`;
    } else if (quest.tripsRequired > 1) {
      refs.payment.textContent = `Payment: ${formatCredits(resolved.paymentOnCompletion)} on completion (${formatCredits(perHour(tripPayment))}/hr)`;
    } else {
      refs.payment.textContent = `Payment: ${formatCredits(resolved.paymentOnCompletion)} on completion (${formatCredits(perHour(resolved.paymentOnCompletion))}/hr)`;
    }

    // Buttons vs reason
    if (canAccept) {
      refs.buttonContainer.style.display = 'flex';
      refs.reasonDiv.style.display = 'none';
      // Show assign button only for trade routes
      refs.assignBtn.style.display = quest.type === 'trade_route' ? '' : 'none';
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
      noContractRefs.miningRouteInfoBar.style.display = 'none';
      noContractRefs.miningRouteSetupSection.style.display = 'none';
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
      noContractRefs.miningRouteInfoBar.style.display = 'none';
      noContractRefs.miningRouteSetupSection.style.display = 'none';
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

    // Mining status panel (at mine locations only)
    const isAtMine = locationData.services.includes('mine');
    if (isAtMine) {
      noContractRefs.miningSlot.style.display = '';
      if (!miningPanel) {
        miningPanel = createMiningPanel({
          onStartMiningRoute: callbacks.onStartMiningRoute,
          onCancelMiningRoute: callbacks.onCancelMiningRoute,
          onSelectMiningOre: callbacks.onSelectMiningOre,
        });
        noContractRefs.miningSlot.appendChild(miningPanel.el);
      }
      miningPanel.update(gd, ship, locationData);
    } else {
      noContractRefs.miningSlot.style.display = 'none';
    }

    // Mining route info bar (any station when route is active)
    updateMiningRouteInfoBar(
      {
        bar: noContractRefs.miningRouteInfoBar,
        label: noContractRefs.miningRouteInfoLabel,
        status: noContractRefs.miningRouteInfoStatus,
        stats: noContractRefs.miningRouteInfoStats,
      },
      gd,
      ship
    );

    // Mining route setup (non-mine stations, no active route)
    const hasActiveMiningRoute = !!ship.miningRoute;
    if (!isAtMine && !hasActiveMiningRoute) {
      updateMiningRouteSetupImpl(
        {
          section: noContractRefs.miningRouteSetupSection,
          container: noContractRefs.miningRouteSetupContainer,
          noMinesMsg: noContractRefs.miningRouteSetupNoMines,
        },
        mineCardMap,
        callbacks.onStartMiningRoute,
        gd,
        ship,
        locationData
      );
    } else {
      noContractRefs.miningRouteSetupSection.style.display = 'none';
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
        const aOk = canAcceptQuest(ship, a, gd.world).canAccept;
        const bOk = canAcceptQuest(ship, b, gd.world).canAccept;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return a.id.localeCompare(b.id);
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
          const aAcceptable = canAcceptQuest(ship, a, gd.world).canAccept;
          const bAcceptable = canAcceptQuest(ship, b, gd.world).canAccept;
          if (aAcceptable && !bAcceptable) return -1;
          if (!aAcceptable && bAcceptable) return 1;
          return a.id.localeCompare(b.id);
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
    } else {
      refs.progress.textContent = `Trip ${activeContract.tripsCompleted + 1}/${quest.tripsRequired}`;
    }

    refs.leg.textContent =
      activeContract.leg === 'outbound' ? 'Leg: Outbound' : 'Leg: Inbound';

    // Payment info
    if (quest.paymentPerTrip > 0) {
      refs.paymentInfo.textContent =
        activeContract.leg === 'outbound'
          ? `Next payment: ${formatCredits(quest.paymentPerTrip)} on inbound arrival`
          : `Next payment: ${formatCredits(quest.paymentPerTrip)} on arrival`;
    } else if (quest.paymentOnCompletion > 0) {
      refs.paymentInfo.textContent = `Completion bonus: ${formatCredits(quest.paymentOnCompletion)}`;
    } else {
      refs.paymentInfo.textContent = '';
    }

    refs.earned.textContent = `Earned so far: ${formatCredits(activeContract.creditsEarned)}`;

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
    } else {
      refs.progress.textContent = `Trip ${activeContract.tripsCompleted + 1}/${quest.tripsRequired}`;
    }

    refs.earned.textContent = `Earned so far: ${formatCredits(activeContract.creditsEarned)}`;

    // Abandon button state
    updatePausedAbandonButton();

    // Abandon hint
    const hasRouteAssignment = !!ship.routeAssignment;
    let hintText = `Abandon ends contract permanently. You keep ${formatCredits(activeContract.creditsEarned)} from completed trips.`;
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

function updateCaptainBonusDisplay(
  refs: QuestCardRefs,
  ship: Ship,
  gd: GameData
): void {
  const hasCaptain = ship.crew.some((c) => c.isCaptain);
  const bonusPercent = Math.round(getCommandCommerceBonus(ship) * 100);

  if (hasCaptain && bonusPercent > 0) {
    refs.captainBonusInfo.textContent = `Captain bonus: +${bonusPercent}%`;
    refs.captainBonusInfo.style.color = '#fbbf24';
    refs.captainBonusInfo.style.display = '';
    refs.captainHintInfo.style.display = 'none';
  } else if (!hasCaptain) {
    if (bonusPercent > 0) {
      refs.captainBonusInfo.textContent = `Acting cpt: +${bonusPercent}%`;
    } else {
      refs.captainBonusInfo.textContent = 'No command bonus';
    }
    refs.captainBonusInfo.style.color = '#6b7280';
    refs.captainBonusInfo.style.display = '';
    const hypothetical = getHypotheticalCaptainBonus(ship, gd);
    if (hypothetical > 0) {
      refs.captainHintInfo.textContent = `(Captain: +${Math.round(hypothetical * 100)}%)`;
      refs.captainHintInfo.style.display = '';
    } else {
      refs.captainHintInfo.style.display = 'none';
    }
  } else {
    refs.captainBonusInfo.style.display = 'none';
    refs.captainHintInfo.style.display = 'none';
  }
}
