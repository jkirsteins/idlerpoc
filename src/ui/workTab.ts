import type { GameData, Quest, ThreatLevel } from '../models';
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

/**
 * Conditionally set style.display to prevent unnecessary DOM mutations.
 * Only updates when the value actually changes, eliminating flicker.
 */
function setDisplay(element: HTMLElement, value: string): void {
  if (element.style.display !== value) {
    element.style.display = value;
  }
}

export interface WorkTabCallbacks {
  onAcceptQuest: (questId: string) => void;
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

// ─── Quest Card Snapshot (for shallow-compare skip) ──────────
interface QuestSnapshot {
  canAccept: boolean;
  reason: string;
  warnings: string;
  category: 'trade' | 'mining' | 'misc';
  destinationName: string;
  title: string;
  description: string;
  distanceText: string;
  cargoText: string;
  totalCargoText: string;
  tripsText: string;
  fuelText: string;
  timeText: string;
  crewCostText: string;
  fuelCostText: string;
  profitText: string;
  profitColor: string;
  paymentText: string;
  threatLevel: string;
  threatNarrative: string;
  captainBonusText: string;
  captainBonusColor: string;
  captainHintText: string;
}

function questSnapshotsEqual(a: QuestSnapshot, b: QuestSnapshot): boolean {
  return (
    a.canAccept === b.canAccept &&
    a.reason === b.reason &&
    a.warnings === b.warnings &&
    a.category === b.category &&
    a.destinationName === b.destinationName &&
    a.title === b.title &&
    a.description === b.description &&
    a.distanceText === b.distanceText &&
    a.cargoText === b.cargoText &&
    a.totalCargoText === b.totalCargoText &&
    a.tripsText === b.tripsText &&
    a.fuelText === b.fuelText &&
    a.timeText === b.timeText &&
    a.crewCostText === b.crewCostText &&
    a.fuelCostText === b.fuelCostText &&
    a.profitText === b.profitText &&
    a.profitColor === b.profitColor &&
    a.paymentText === b.paymentText &&
    a.threatLevel === b.threatLevel &&
    a.threatNarrative === b.threatNarrative &&
    a.captainBonusText === b.captainBonusText &&
    a.captainBonusColor === b.captainBonusColor &&
    a.captainHintText === b.captainHintText
  );
}

// ─── Quest Card Refs ──────────────────────────────────────────
interface QuestCardRefs {
  card: HTMLDivElement;
  // NEW: collapsible header (always visible)
  header: HTMLDivElement;
  typeBadge: HTMLSpanElement;
  headerDestination: HTMLSpanElement;
  headerProfit: HTMLSpanElement;
  expandIcon: HTMLSpanElement;
  // EXISTING: now inside collapsible section
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
  // Stable risk badge child elements (updated in-place, never recreated)
  riskBadge: HTMLDivElement;
  riskBadgeLabel: HTMLSpanElement;
  riskBadgeNarrative: HTMLSpanElement;
  lastThreatLevel: string;
  lastNarrative: string;
  payment: HTMLDivElement;
  buttonContainer: HTMLDivElement;
  acceptBtn: HTMLButtonElement;
  warningsDiv: HTMLDivElement;
  reasonDiv: HTMLDivElement;
  lastSnapshot: QuestSnapshot | null;
}

// ─── Active Contract Refs ─────────────────────────────────────
interface ActiveContractRefs {
  container: HTMLDivElement;
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
  // NEW: filter bar
  filterBar: HTMLDivElement;
  filterButtons: Record<'all' | 'trade' | 'mining' | 'misc', HTMLButtonElement>;
  // EXISTING
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
  miningRouteSetupLockedMsg: HTMLDivElement;
  miningFilterEmptyMsg: HTMLDivElement;
}

// ── Helper Functions (extracted to reduce function length) ──────

function categorizeQuest(
  quest: Quest,
  gd: GameData
): 'trade' | 'mining' | 'misc' {
  if (quest.type === 'trade_route') return 'trade';

  const miningKeywords = [
    'ore',
    'metal',
    'mineral',
    'raw ore',
    'rare metal',
    'unrefined',
  ];
  const cargoIsMining = quest.cargoTypeName
    ?.toLowerCase()
    .split(' ')
    .some((word) =>
      miningKeywords.some((kw) => kw.includes(word) || word.includes(kw))
    );

  if (cargoIsMining) return 'mining';

  const origin = gd.world.locations.find((l) => l.id === quest.origin);
  const dest = gd.world.locations.find((l) => l.id === quest.destination);

  const originIsMine =
    origin?.type === 'asteroid_belt' || origin?.services.includes('mine');
  const destIsMine =
    dest?.type === 'asteroid_belt' || dest?.services.includes('mine');

  if (originIsMine || destIsMine) return 'mining';

  return 'misc';
}

function syncCardExpansion(
  refs: QuestCardRefs,
  questId: string,
  questExpandedState: Map<string, boolean>
): void {
  const expanded = questExpandedState.get(questId) || false;

  // Toggle expanded class for CSS styling
  refs.card.classList.toggle('quest-card-expanded', expanded);

  refs.expandIcon.style.transform = expanded ? 'rotate(90deg)' : '';
  refs.expandIcon.textContent = expanded ? '▼' : '▶';

  const displayValue = expanded ? '' : 'none';
  setDisplay(refs.title, displayValue);
  setDisplay(refs.description, displayValue);
  setDisplay(refs.details, expanded ? 'flex' : 'none');

  // Show/hide button container based on expansion state
  refs.buttonContainer.style.display = expanded ? 'flex' : 'none';

  refs.warningsDiv.style.display =
    expanded && refs.warningsDiv.textContent ? '' : 'none';
  refs.reasonDiv.style.display =
    expanded && refs.reasonDiv.textContent ? '' : 'none';
}

function syncJobFilterButtons(
  filterButtons: Record<'all' | 'trade' | 'mining' | 'misc', HTMLButtonElement>,
  currentJobFilter: 'all' | 'trade' | 'mining' | 'misc'
): void {
  const filters = ['all', 'trade', 'mining', 'misc'] as const;
  for (const f of filters) {
    filterButtons[f].className =
      f === currentJobFilter ? 'filter-btn active' : 'filter-btn';
  }
}

function applyJobFilter(
  gd: GameData,
  currentJobFilter: 'all' | 'trade' | 'mining' | 'misc',
  tradeQuestCards: Map<string, QuestCardRefs>,
  regularQuestCards: Map<string, QuestCardRefs>
): void {
  const ship = getActiveShip(gd);
  if (ship.location.status !== 'docked') return;

  const locationId = ship.location.dockedAt || '';
  const locationQuests = gd.availableQuests[locationId] || [];

  for (const [questId, refs] of tradeQuestCards) {
    const quest = locationQuests.find((q) => q.id === questId);
    if (!quest) continue;

    const category = categorizeQuest(quest, gd);
    const visible = currentJobFilter === 'all' || currentJobFilter === category;
    setDisplay(refs.card, visible ? '' : 'none');
  }

  for (const [questId, refs] of regularQuestCards) {
    const quest = locationQuests.find((q) => q.id === questId);
    if (!quest) continue;

    const category = categorizeQuest(quest, gd);
    const visible = currentJobFilter === 'all' || currentJobFilter === category;
    setDisplay(refs.card, visible ? '' : 'none');
  }
}

function createQuestCardRefs(
  quest: Quest,
  gd: GameData,
  callbacks: WorkTabCallbacks,
  questExpandedState: Map<string, boolean>,
  updateQuestCardRefs: (refs: QuestCardRefs, quest: Quest, gd: GameData) => void
): QuestCardRefs {
  const card = document.createElement('div');
  card.className = 'quest-card';

  const header = document.createElement('div');
  header.className = 'quest-card-header';
  header.style.cssText = `
    display: flex; align-items: center; gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    margin-bottom: 8px;
  `;

  const typeBadge = document.createElement('span');
  typeBadge.className = 'quest-type-badge';
  typeBadge.style.cssText = `
    padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;
    font-weight: bold; text-transform: uppercase;
  `;
  header.appendChild(typeBadge);

  const headerDestination = document.createElement('span');
  headerDestination.style.cssText = 'flex: 1; font-weight: bold;';
  header.appendChild(headerDestination);

  const headerProfit = document.createElement('span');
  headerProfit.style.cssText = 'font-size: 0.9rem; font-weight: bold;';
  header.appendChild(headerProfit);

  const expandIcon = document.createElement('span');
  expandIcon.textContent = '▶';
  expandIcon.style.cssText = 'font-size: 0.8rem; transition: transform 0.2s;';
  header.appendChild(expandIcon);

  card.appendChild(header);

  const title = document.createElement('div');
  title.className = 'quest-title';
  title.style.display = 'none';
  card.appendChild(title);

  const description = document.createElement('div');
  description.className = 'quest-description';
  description.style.display = 'none';
  card.appendChild(description);

  const details = document.createElement('div');
  details.className = 'quest-details';
  details.style.display = 'none';

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

  // Create stable risk badge elements once (updated in-place, never recreated)
  const riskBadge = document.createElement('div');
  riskBadge.className = 'threat-badge threat-clear';

  const riskBadgeLabel = document.createElement('span');
  riskBadgeLabel.className = 'threat-label';
  riskBadge.appendChild(riskBadgeLabel);

  const riskBadgeNarrative = document.createElement('span');
  riskBadgeNarrative.className = 'threat-narrative';
  riskBadge.appendChild(riskBadgeNarrative);

  riskBadgeSlot.appendChild(riskBadge);
  details.appendChild(riskLine);

  card.appendChild(details);

  const payment = document.createElement('div');
  payment.className = 'quest-payment';
  card.appendChild(payment);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'quest-buttons';
  buttonContainer.style.display = 'none';
  buttonContainer.style.gap = '8px';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'accept-quest-button';
  acceptBtn.textContent = 'Accept';
  acceptBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent card collapse when clicking accept
    callbacks.onAcceptQuest(quest.id);
  });
  buttonContainer.appendChild(acceptBtn);

  card.appendChild(buttonContainer);

  const detailsToggle = document.createElement('button');
  detailsToggle.className = 'quest-details-toggle';
  detailsToggle.textContent = 'Show Details';
  detailsToggle.addEventListener('click', () => {
    const expanded = details.classList.toggle('quest-details-expanded');
    detailsToggle.textContent = expanded ? 'Hide Details' : 'Show Details';
  });
  card.appendChild(detailsToggle);

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

  const reasonDiv = document.createElement('div');
  reasonDiv.className = 'quest-reason';
  card.appendChild(reasonDiv);

  const refs: QuestCardRefs = {
    card,
    header,
    typeBadge,
    headerDestination,
    headerProfit,
    expandIcon,
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
    riskBadge,
    riskBadgeLabel,
    riskBadgeNarrative,
    lastThreatLevel: '',
    lastNarrative: '',
    payment,
    buttonContainer,
    acceptBtn,
    warningsDiv,
    reasonDiv,
    lastSnapshot: null,
  };

  // Make entire card clickable for expansion
  card.addEventListener('click', () => {
    const expanded = questExpandedState.get(quest.id) || false;
    questExpandedState.set(quest.id, !expanded);
    syncCardExpansion(refs, quest.id, questExpandedState);
  });

  updateQuestCardRefs(refs, quest, gd);
  return refs;
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

  // NEW: Collapsible state and filter state
  const questExpandedState = new Map<string, boolean>();
  let currentJobFilter: 'all' | 'trade' | 'mining' | 'misc' = 'all';
  let lastLocationId = '';
  // Track last quest order to skip unnecessary reordering
  let lastTradeQuestOrder: string[] = [];
  let lastRegularQuestOrder: string[] = [];

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

    // Filter bar for job types
    const filterBar = document.createElement('div');
    filterBar.className = 'job-filter-bar';
    filterBar.style.display = 'flex';
    filterBar.style.gap = '0.5rem';
    filterBar.style.marginBottom = '1rem';
    filterBar.style.flexWrap = 'wrap';

    const filterButtons: Record<
      'all' | 'trade' | 'mining' | 'misc',
      HTMLButtonElement
    > = {} as Record<'all' | 'trade' | 'mining' | 'misc', HTMLButtonElement>;
    const filters = ['all', 'trade', 'mining', 'misc'] as const;

    for (const filter of filters) {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.textContent = filter.charAt(0).toUpperCase() + filter.slice(1);
      btn.addEventListener('click', () => {
        currentJobFilter = filter;
        syncJobFilterButtons(noContractRefs.filterButtons, currentJobFilter);
        applyJobFilter(
          gameData,
          currentJobFilter,
          tradeQuestCards,
          regularQuestCards
        );
      });
      filterButtons[filter] = btn;
      filterBar.appendChild(btn);
    }

    cont.appendChild(filterBar);

    // Empty state message for mining filter
    const miningFilterEmptyMsg = document.createElement('div');
    miningFilterEmptyMsg.style.cssText =
      'font-size: 0.85rem; color: #888; padding: 0.75rem; background: rgba(255, 165, 0, 0.06); border: 1px solid #444; border-radius: 4px; margin-bottom: 0.75rem; display: none;';
    cont.appendChild(miningFilterEmptyMsg);

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

    const miningRouteSetupLockedMsg = document.createElement('div');
    miningRouteSetupLockedMsg.style.cssText =
      'font-size: 0.85rem; color: #ffa500; padding: 0.5rem 0.6rem; background: rgba(255, 165, 0, 0.08); border-left: 3px solid #ffa500; border-radius: 2px; margin-bottom: 0.5rem; display: none;';
    miningRouteSetupSection.appendChild(miningRouteSetupLockedMsg);

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
      filterBar,
      filterButtons,
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
      miningRouteSetupLockedMsg,
      miningFilterEmptyMsg,
    };
  }

  // ── Factory: Active Contract Content ────────────────────────
  function createActiveContractContent(): ActiveContractRefs {
    const cont = document.createElement('div');
    cont.className = 'active-contract';

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

    const category = categorizeQuest(quest, gd);

    // Compute all derived display values up front
    const profileFuelKg = resolved.estimatedFuelPerTrip;
    const profileTimeSecs = resolved.estimatedTripTicks * GAME_SECONDS_PER_TICK;
    const profileTimeTicks = resolved.estimatedTripTicks;

    const perHour = (value: number): number =>
      profileTimeSecs > 0
        ? Math.round((value / profileTimeSecs) * GAME_SECONDS_PER_HOUR)
        : 0;

    const crewSalaryPerTick = calculateShipSalaryPerTick(ship);
    const tripCrewCost = Math.round(crewSalaryPerTick * profileTimeTicks);

    const currentLocation = gd.world.locations.find(
      (l) => l.id === (ship.location.dockedAt || ship.location.orbitingAt)
    );
    const fuelPricePerKg = currentLocation
      ? getFuelPricePerKg(currentLocation, ship)
      : 2.0;
    const tripFuelCost = Math.round(profileFuelKg * fuelPricePerKg);

    const tripPayment =
      resolved.paymentPerTrip > 0
        ? resolved.paymentPerTrip
        : quest.tripsRequired > 1
          ? Math.round(resolved.paymentOnCompletion / quest.tripsRequired)
          : resolved.paymentOnCompletion;

    const totalCost = tripCrewCost + tripFuelCost;
    const profit = tripPayment - totalCost;
    const profitColor = profit >= 0 ? '#4caf50' : '#ff6b6b';
    const profitSign = profit >= 0 ? '+' : '';

    // Threat level
    let threatLevel = '';
    let threatNarrative = '';
    if (origin && destination) {
      const routeRisk = estimateRouteRisk(origin, destination, ship, gd.world);
      const tl = getThreatLevel(routeRisk);
      threatLevel = tl;
      threatNarrative = getThreatNarrative(tl);
    }

    // Captain bonus
    const hasCaptain = ship.crew.some((c) => c.isCaptain);
    const bonusPercent = Math.round(getCommandCommerceBonus(ship) * 100);
    let captainBonusText = '';
    let captainBonusColor = '';
    let captainHintText = '';
    if (hasCaptain && bonusPercent > 0) {
      captainBonusText = `Captain bonus: +${bonusPercent}%`;
      captainBonusColor = '#fbbf24';
    } else if (!hasCaptain) {
      captainBonusText =
        bonusPercent > 0 ? `Acting cpt: +${bonusPercent}%` : 'No command bonus';
      captainBonusColor = '#6b7280';
      const hypothetical = getHypotheticalCaptainBonus(ship, gd);
      if (hypothetical > 0) {
        captainHintText = `(Captain: +${Math.round(hypothetical * 100)}%)`;
      }
    }

    // Payment text
    let paymentText: string;
    if (resolved.paymentPerTrip > 0) {
      paymentText = `Payment: ${formatCredits(perHour(resolved.paymentPerTrip))}/hr (${formatCredits(resolved.paymentPerTrip)}/trip)`;
    } else if (quest.tripsRequired > 1) {
      paymentText = `Payment: ${formatCredits(resolved.paymentOnCompletion)} on completion (${formatCredits(perHour(tripPayment))}/hr)`;
    } else {
      paymentText = `Payment: ${formatCredits(resolved.paymentOnCompletion)} on completion (${formatCredits(perHour(resolved.paymentOnCompletion))}/hr)`;
    }

    // Build snapshot and compare
    const snapshot: QuestSnapshot = {
      canAccept,
      reason: reason || '',
      warnings: warnings ? warnings.join(' ') : '',
      category,
      destinationName: destination ? destination.name : 'Unknown',
      title: quest.title,
      description: resolved.description,
      distanceText:
        origin && destination
          ? `Distance: ${formatDistance(Math.abs(origin.distanceFromEarth - destination.distanceFromEarth))}`
          : '',
      cargoText:
        resolved.cargoRequired > 0
          ? `Cargo: ${formatMass(resolved.cargoRequired)}`
          : '',
      totalCargoText:
        quest.totalCargoRequired > 0
          ? `Total cargo: ${formatMass(quest.totalCargoRequired)}`
          : '',
      tripsText:
        quest.tripsRequired > 0
          ? `Trips: ${quest.tripsRequired}`
          : quest.tripsRequired === -1
            ? 'Trips: Unlimited'
            : '',
      fuelText: `Fuel: ~${formatFuelMass(profileFuelKg)} per trip`,
      timeText: `Time: ~${formatDualTime(profileTimeSecs)} per trip`,
      crewCostText:
        tripCrewCost > 0
          ? `Crew Salaries: ~${formatCredits(perHour(tripCrewCost))}/hr`
          : '',
      fuelCostText: `Fuel Cost: ~${formatCredits(perHour(tripFuelCost))}/hr`,
      profitText: `Est. Profit: ${profitSign}${formatCredits(perHour(profit))}/hr`,
      profitColor,
      paymentText,
      threatLevel,
      threatNarrative,
      captainBonusText,
      captainBonusColor,
      captainHintText,
    };

    // Early exit if nothing changed — skip all DOM work
    if (refs.lastSnapshot && questSnapshotsEqual(refs.lastSnapshot, snapshot)) {
      // Still sync expansion state (user may have clicked header)
      syncCardExpansion(refs, quest.id, questExpandedState);
      return;
    }
    refs.lastSnapshot = snapshot;

    // ── Apply snapshot to DOM ──

    // Warnings
    if (snapshot.warnings) {
      refs.warningsDiv.textContent = snapshot.warnings;
      setDisplay(refs.warningsDiv, '');
    } else {
      setDisplay(refs.warningsDiv, 'none');
    }

    // Card disabled state
    if (!canAccept) {
      refs.card.classList.add('disabled');
    } else {
      refs.card.classList.remove('disabled');
    }

    // Type badge
    const badgeConfig = {
      trade: { text: 'Trade', bg: '#4a90e2', color: '#fff' },
      mining: { text: 'Mining', bg: '#b87333', color: '#fff' },
      misc: { text: quest.type.replace('_', ' '), bg: '#666', color: '#fff' },
    };
    const config = badgeConfig[category];
    refs.typeBadge.textContent = config.text;
    refs.typeBadge.style.backgroundColor = config.bg;
    refs.typeBadge.style.color = config.color;

    refs.headerDestination.textContent = snapshot.destinationName;
    refs.title.textContent = snapshot.title;
    refs.description.textContent = snapshot.description;

    // Destination
    if (destination) {
      refs.destInfo.textContent = `Destination: ${snapshot.destinationName}`;
      setDisplay(refs.destInfo, '');
    } else {
      setDisplay(refs.destInfo, 'none');
    }

    // Distance
    if (snapshot.distanceText) {
      refs.distanceInfo.textContent = snapshot.distanceText;
      setDisplay(refs.distanceInfo, '');
    } else {
      setDisplay(refs.distanceInfo, 'none');
    }

    // Cargo
    if (snapshot.cargoText) {
      refs.cargoInfo.textContent = snapshot.cargoText;
      setDisplay(refs.cargoInfo, '');
    } else {
      setDisplay(refs.cargoInfo, 'none');
    }

    // Total cargo
    if (snapshot.totalCargoText) {
      refs.totalCargoInfo.textContent = snapshot.totalCargoText;
      setDisplay(refs.totalCargoInfo, '');
    } else {
      setDisplay(refs.totalCargoInfo, 'none');
    }

    // Trips
    if (snapshot.tripsText) {
      refs.tripsInfo.textContent = snapshot.tripsText;
      setDisplay(refs.tripsInfo, '');
    } else {
      setDisplay(refs.tripsInfo, 'none');
    }

    // Fuel and time
    refs.fuelInfo.textContent = snapshot.fuelText;
    refs.timeInfo.textContent = snapshot.timeText;

    // Crew cost
    if (snapshot.crewCostText) {
      refs.crewCostInfo.textContent = snapshot.crewCostText;
      setDisplay(refs.crewCostInfo, '');
    } else {
      setDisplay(refs.crewCostInfo, 'none');
    }

    refs.fuelCostInfo.textContent = snapshot.fuelCostText;

    // Captain bonus (inline instead of calling updateCaptainBonusDisplay)
    if (snapshot.captainBonusText) {
      refs.captainBonusInfo.textContent = snapshot.captainBonusText;
      refs.captainBonusInfo.style.color = snapshot.captainBonusColor;
      setDisplay(refs.captainBonusInfo, '');
    } else {
      setDisplay(refs.captainBonusInfo, 'none');
    }
    if (snapshot.captainHintText) {
      refs.captainHintInfo.textContent = snapshot.captainHintText;
      setDisplay(refs.captainHintInfo, '');
    } else {
      setDisplay(refs.captainHintInfo, 'none');
    }

    // Profit
    refs.profitInfo.style.color = snapshot.profitColor;
    refs.profitInfo.textContent = snapshot.profitText;

    // Header profit
    refs.headerProfit.style.color = snapshot.profitColor;
    refs.headerProfit.textContent = `${profitSign}${formatCredits(perHour(profit))}/hr`;

    // Route risk — update stable badge in-place instead of recreating
    if (snapshot.threatLevel) {
      const tl = snapshot.threatLevel as ThreatLevel;
      if (refs.lastThreatLevel !== snapshot.threatLevel) {
        refs.riskBadge.className = `threat-badge threat-${tl}`;
        refs.riskBadgeLabel.textContent = tl.toUpperCase();
        refs.lastThreatLevel = snapshot.threatLevel;
      }
      if (refs.lastNarrative !== snapshot.threatNarrative) {
        refs.riskBadgeNarrative.textContent = snapshot.threatNarrative;
        refs.lastNarrative = snapshot.threatNarrative;
      }
      setDisplay(refs.riskLine, 'flex');
    } else {
      setDisplay(refs.riskLine, 'none');
    }

    // Payment
    refs.payment.textContent = snapshot.paymentText;

    // Buttons vs reason
    if (canAccept) {
      setDisplay(refs.buttonContainer, 'flex');
      setDisplay(refs.reasonDiv, 'none');
    } else {
      setDisplay(refs.buttonContainer, 'none');
      if (snapshot.reason) {
        refs.reasonDiv.textContent = snapshot.reason;
        setDisplay(refs.reasonDiv, '');
      } else {
        setDisplay(refs.reasonDiv, 'none');
      }
    }

    // Apply collapsed/expanded state
    syncCardExpansion(refs, quest.id, questExpandedState);
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
      setDisplay(noContractRefs.shipContext, 'none');
      setDisplay(noContractRefs.filterBar, 'none');
      setDisplay(noContractRefs.tradeSection, 'none');
      setDisplay(noContractRefs.contractSection, 'none');
      setDisplay(noContractRefs.miningSlot, 'none');
      setDisplay(noContractRefs.miningRouteInfoBar, 'none');
      setDisplay(noContractRefs.miningRouteSetupSection, 'none');
      // Remove profile control if it was placed here
      if (profileControl.el.parentNode === noContractRefs.container) {
        profileControl.el.remove();
      }
      return;
    }

    const locationData = gd.world.locations.find((l) => l.id === location);
    if (!locationData) {
      setDisplay(noContractRefs.shipContext, 'none');
      setDisplay(noContractRefs.filterBar, 'none');
      setDisplay(noContractRefs.tradeSection, 'none');
      setDisplay(noContractRefs.contractSection, 'none');
      setDisplay(noContractRefs.miningSlot, 'none');
      setDisplay(noContractRefs.miningRouteInfoBar, 'none');
      setDisplay(noContractRefs.miningRouteSetupSection, 'none');
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
      setDisplay(noContractRefs.miningSlot, '');
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
      setDisplay(noContractRefs.miningSlot, 'none');
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
          lockedMsg: noContractRefs.miningRouteSetupLockedMsg,
        },
        mineCardMap,
        callbacks.onStartMiningRoute,
        gd,
        ship,
        locationData
      );
    } else {
      setDisplay(noContractRefs.miningRouteSetupSection, 'none');
    }

    // Heading
    noContractRefs.heading.textContent = `Available Work at ${locationData.name}`;

    // Ship context
    setDisplay(noContractRefs.shipContext, '');
    noContractRefs.shipContextName.textContent = ship.name;

    // Check for location change and reset filter + order tracking if needed
    if (lastLocationId !== locationData.id) {
      currentJobFilter = 'all';
      lastLocationId = locationData.id;
      lastTradeQuestOrder = [];
      lastRegularQuestOrder = [];
    }

    // Show and sync filter bar
    setDisplay(noContractRefs.filterBar, 'flex');
    syncJobFilterButtons(noContractRefs.filterButtons, currentJobFilter);

    // Get quests
    const availableQuests = gd.availableQuests[location] || [];
    const tradeRoutes = availableQuests.filter((q) => q.type === 'trade_route');
    const regularQuests = availableQuests.filter(
      (q) => q.type !== 'trade_route'
    );

    // Trade routes section
    if (tradeRoutes.length > 0) {
      setDisplay(noContractRefs.tradeSection, '');

      // Sort: acceptable first
      const sortedTrade = [...tradeRoutes].sort((a, b) => {
        const aOk = canAcceptQuest(ship, a, gd.world).canAccept;
        const bOk = canAcceptQuest(ship, b, gd.world).canAccept;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return a.id.localeCompare(b.id);
      });

      // Reconcile trade quest cards
      lastTradeQuestOrder = reconcileQuestCards(
        tradeQuestCards,
        noContractRefs.tradeCardsContainer,
        sortedTrade,
        gd,
        lastTradeQuestOrder
      );
    } else {
      setDisplay(noContractRefs.tradeSection, 'none');
      // Clean up stale cards
      for (const [id, refs] of tradeQuestCards) {
        refs.card.remove();
        tradeQuestCards.delete(id);
      }
    }

    // Regular contracts section
    setDisplay(noContractRefs.contractSection, '');

    // Show/hide heading based on whether both sections exist
    setDisplay(
      noContractRefs.contractHeading,
      tradeRoutes.length > 0 && regularQuests.length > 0 ? '' : 'none'
    );

    if (regularQuests.length === 0 && tradeRoutes.length === 0) {
      setDisplay(noContractRefs.noQuestsMsg, '');
      // Clean up stale cards
      for (const [id, refs] of regularQuestCards) {
        refs.card.remove();
        regularQuestCards.delete(id);
      }
    } else {
      setDisplay(noContractRefs.noQuestsMsg, 'none');

      if (regularQuests.length > 0) {
        const sortedQuests = [...regularQuests].sort((a, b) => {
          const aAcceptable = canAcceptQuest(ship, a, gd.world).canAccept;
          const bAcceptable = canAcceptQuest(ship, b, gd.world).canAccept;
          if (aAcceptable && !bAcceptable) return -1;
          if (!aAcceptable && bAcceptable) return 1;
          return a.id.localeCompare(b.id);
        });

        lastRegularQuestOrder = reconcileQuestCards(
          regularQuestCards,
          noContractRefs.contractCardsContainer,
          sortedQuests,
          gd,
          lastRegularQuestOrder
        );
      } else {
        // No regular quests but trade routes exist — clean up
        for (const [id, refs] of regularQuestCards) {
          refs.card.remove();
          regularQuestCards.delete(id);
        }
      }
    }

    // Apply job filter after reconciliation
    applyJobFilter(gd, currentJobFilter, tradeQuestCards, regularQuestCards);

    // H5: Mining filter empty state message
    if (currentJobFilter === 'mining') {
      // Check if any mining content is visible (quest cards + mining route setup + mining panel)
      const hasVisibleMiningQuests = (() => {
        for (const [, refs] of tradeQuestCards) {
          if (refs.card.style.display !== 'none') return true;
        }
        for (const [, refs] of regularQuestCards) {
          if (refs.card.style.display !== 'none') return true;
        }
        return false;
      })();
      const hasMiningContent =
        hasVisibleMiningQuests ||
        isAtMine ||
        hasActiveMiningRoute ||
        noContractRefs.miningRouteSetupSection.style.display !== 'none';

      if (!hasMiningContent) {
        const hasMiningBay = ship.rooms.some((r) => r.type === 'mining_bay');
        if (!hasMiningBay) {
          noContractRefs.miningFilterEmptyMsg.textContent =
            'Mining operations require a Class II ship with a mining bay.';
        } else {
          noContractRefs.miningFilterEmptyMsg.textContent =
            'No mining contracts at this location. Try a mine location or set up a mining route.';
        }
        noContractRefs.miningFilterEmptyMsg.style.display = '';
      } else {
        noContractRefs.miningFilterEmptyMsg.style.display = 'none';
      }
    } else {
      noContractRefs.miningFilterEmptyMsg.style.display = 'none';
    }
  }

  /** Reconcile a Map of quest card refs with the current quest list.
   *  Only reorders DOM children when the quest ID order actually changes. */
  function reconcileQuestCards(
    cardMap: Map<string, QuestCardRefs>,
    parentEl: HTMLElement,
    quests: Quest[],
    gd: GameData,
    lastOrder: string[]
  ): string[] {
    const currentIds = new Set<string>();
    const newOrder: string[] = [];
    let addedOrRemoved = false;

    for (const quest of quests) {
      currentIds.add(quest.id);
      newOrder.push(quest.id);

      let refs = cardMap.get(quest.id);
      if (!refs) {
        // New quest — create card
        refs = createQuestCardRefs(
          quest,
          gd,
          callbacks,
          questExpandedState,
          updateQuestCardRefs
        );
        cardMap.set(quest.id, refs);
        parentEl.appendChild(refs.card);
        addedOrRemoved = true;
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
        questExpandedState.delete(id);
        addedOrRemoved = true;
      }
    }

    // Only reorder DOM children when order actually changed
    const orderChanged =
      addedOrRemoved ||
      newOrder.length !== lastOrder.length ||
      newOrder.some((id, i) => id !== lastOrder[i]);

    if (orderChanged) {
      for (const quest of quests) {
        const refs = cardMap.get(quest.id);
        if (refs) {
          parentEl.appendChild(refs.card);
        }
      }
    }

    return newOrder;
  }

  // ── Update: Active Contract Phase ───────────────────────────
  function updateActiveContractPhase(gd: GameData): void {
    const ship = getActiveShip(gd);
    const activeContract = ship.activeContract;
    const refs = activeContractRefs;

    if (!activeContract) return;

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
        setDisplay(refs.abandonHint, '');
        setDisplay(refs.pauseHint, 'none');
      } else if (activeContract.paused) {
        setDisplay(refs.abandonHint, 'none');
        setDisplay(refs.pauseHint, '');
      } else {
        setDisplay(refs.abandonHint, 'none');
        setDisplay(refs.pauseHint, 'none');
      }
    } else {
      setDisplay(refs.abandonHint, 'none');
      setDisplay(refs.pauseHint, 'none');
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
    refs.abandonHint.textContent = `Abandon ends contract permanently. You keep ${formatCredits(activeContract.creditsEarned)} from completed trips.`;
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
    setDisplay(noContractRefs.container, curPhase === 'none' ? '' : 'none');
    setDisplay(
      activeContractRefs.container,
      curPhase === 'active' ? '' : 'none'
    );
    setDisplay(
      pausedContractRefs.container,
      curPhase === 'paused' ? '' : 'none'
    );

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
