import type { GameData, Quest, Ship } from '../models';
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
import { getCrewRoleDefinition } from '../crewRoles';
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
import { renderFlightStatus } from './flightStatus';
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
  onResumeContract: () => void;
  onAbandonContract: () => void;
  onStartMiningRoute: (sellLocationId: string) => void;
  onCancelMiningRoute: () => void;
}

export function createWorkTab(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'work-tab';

  // Persistent flight profile slider - created once, survives rebuilds
  const profileControl = createFlightProfileControl(gameData);

  function rebuild(gameData: GameData) {
    container.replaceChildren();
    const ship = getActiveShip(gameData);
    const activeContract = ship.activeContract;

    if (
      (ship.location.status === 'docked' ||
        ship.location.status === 'orbiting') &&
      !activeContract
    ) {
      // Update slider to match current ship setting (e.g. after switching ships)
      updateFlightProfileControl(profileControl, ship);
      container.appendChild(profileControl.el);

      // Mining status panel
      const mineLocationId = ship.location.orbitingAt ?? ship.location.dockedAt;
      const mineLocation = mineLocationId
        ? gameData.world.locations.find((l) => l.id === mineLocationId)
        : null;
      if (mineLocation?.services.includes('mine')) {
        container.appendChild(
          renderMiningStatus(gameData, ship, mineLocation, callbacks)
        );
      }

      const workContent = renderAvailableWork(gameData, callbacks);
      container.appendChild(workContent);
    } else if (activeContract && activeContract.paused) {
      container.appendChild(renderPausedContract(gameData, callbacks));
    } else if (activeContract) {
      container.appendChild(renderActiveContract(gameData, callbacks));
    }
  }

  rebuild(gameData);
  return { el: container, update: rebuild };
}

function renderAvailableWork(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'available-work';

  const ship = getActiveShip(gameData);
  const location = ship.location.dockedAt || ship.location.orbitingAt;

  console.log('Work tab - location:', location);
  console.log('Work tab - ship status:', ship.location.status);

  if (!location) {
    console.error('Work tab - NO LOCATION, returning empty');
    return container;
  }

  console.log('Work tab - world.locations:', gameData.world.locations);
  console.log('Work tab - looking for location id:', location);
  console.log(
    'Work tab - location ids in world:',
    gameData.world.locations.map((l) => l.id)
  );

  const locationData = gameData.world.locations.find((l) => l.id === location);
  console.log('Work tab - locationData:', locationData);

  if (!locationData) {
    console.error('Work tab - LOCATION DATA NOT FOUND, returning empty');
    return container;
  }

  // Get quests for this location
  const availableQuests = gameData.availableQuests[location] || [];
  console.log('Work tab - availableQuests for location:', availableQuests);

  // Split into trade routes and regular contracts
  const tradeRoutes = availableQuests.filter((q) => q.type === 'trade_route');
  const regularQuests = availableQuests.filter((q) => q.type !== 'trade_route');

  // Header
  const heading = document.createElement('h3');
  heading.textContent = `Available Work at ${locationData.name}`;
  console.log('Work tab - Adding heading:', heading.textContent);
  container.appendChild(heading);

  // Ship context
  const shipContext = document.createElement('div');
  shipContext.style.marginBottom = '0.75rem';
  shipContext.style.padding = '0.5rem';
  shipContext.style.background = 'rgba(74, 158, 255, 0.1)';
  shipContext.style.border = '1px solid #4a9eff';
  shipContext.style.borderRadius = '4px';
  shipContext.style.fontSize = '0.9rem';
  shipContext.innerHTML = `<span style="color: #aaa;">Assigning to:</span> <span style="color: #4a9eff; font-weight: bold;">${ship.name}</span>`;
  container.appendChild(shipContext);

  // Trade Routes section (permanent work)
  if (tradeRoutes.length > 0) {
    const tradeSection = document.createElement('div');
    tradeSection.className = 'trade-routes-section';

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

    // Sort: acceptable first
    const sortedTrade = [...tradeRoutes].sort((a, b) => {
      const aOk = canAcceptQuest(ship, a).canAccept;
      const bOk = canAcceptQuest(ship, b).canAccept;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return 0;
    });

    for (const quest of sortedTrade) {
      tradeSection.appendChild(renderQuestCard(gameData, quest, callbacks));
    }

    container.appendChild(tradeSection);
  }

  // Regular contracts section
  const contractSection = document.createElement('div');
  contractSection.className = 'contracts-section';

  if (tradeRoutes.length > 0 && regularQuests.length > 0) {
    const contractHeading = document.createElement('h4');
    contractHeading.textContent = 'Available Contracts';
    contractHeading.style.marginBottom = '0.5rem';
    contractSection.appendChild(contractHeading);
  }

  if (regularQuests.length === 0 && tradeRoutes.length === 0) {
    const noQuests = document.createElement('p');
    noQuests.className = 'no-quests';
    noQuests.textContent = 'No work available. Try advancing the day.';
    contractSection.appendChild(noQuests);
  } else if (regularQuests.length > 0) {
    // Sort quests: acceptable ones first, then unacceptable ones
    const sortedQuests = [...regularQuests].sort((a, b) => {
      const aAcceptable = canAcceptQuest(ship, a).canAccept;
      const bAcceptable = canAcceptQuest(ship, b).canAccept;

      // Acceptable quests come first (true > false gives descending order)
      if (aAcceptable && !bAcceptable) return -1;
      if (!aAcceptable && bAcceptable) return 1;
      return 0;
    });

    for (const quest of sortedQuests) {
      contractSection.appendChild(renderQuestCard(gameData, quest, callbacks));
    }
  }

  container.appendChild(contractSection);

  return container;
}

function renderQuestCard(
  gameData: GameData,
  quest: Quest,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'quest-card';

  const ship = getActiveShip(gameData);
  const destination = gameData.world.locations.find(
    (l) => l.id === quest.destination
  );
  const { canAccept, reason } = canAcceptQuest(ship, quest);

  if (!canAccept) {
    card.classList.add('disabled');
  }

  // Title
  const title = document.createElement('div');
  title.className = 'quest-title';
  title.textContent = quest.title;
  card.appendChild(title);

  // Description
  const description = document.createElement('div');
  description.className = 'quest-description';
  description.textContent = quest.description;
  card.appendChild(description);

  // Details
  const details = document.createElement('div');
  details.className = 'quest-details';

  if (destination) {
    const destInfo = document.createElement('div');
    destInfo.textContent = `Destination: ${destination.name}`;
    details.appendChild(destInfo);
  }

  const distanceInfo = document.createElement('div');
  const origin = gameData.world.locations.find((l) => l.id === quest.origin);
  if (origin && destination) {
    const distance = Math.abs(
      origin.distanceFromEarth - destination.distanceFromEarth
    );
    distanceInfo.textContent = `Distance: ${distance.toLocaleString()} km`;
    details.appendChild(distanceInfo);
  }

  if (quest.cargoRequired > 0) {
    const cargoInfo = document.createElement('div');
    cargoInfo.textContent = `Cargo: ${quest.cargoRequired.toLocaleString()} kg`;
    details.appendChild(cargoInfo);
  }

  if (quest.totalCargoRequired > 0) {
    const totalCargoInfo = document.createElement('div');
    totalCargoInfo.textContent = `Total cargo: ${quest.totalCargoRequired.toLocaleString()} kg`;
    details.appendChild(totalCargoInfo);
  }

  if (quest.tripsRequired > 0) {
    const tripsInfo = document.createElement('div');
    tripsInfo.textContent = `Trips: ${quest.tripsRequired}`;
    details.appendChild(tripsInfo);
  } else if (quest.tripsRequired === -1) {
    const tripsInfo = document.createElement('div');
    tripsInfo.textContent = 'Trips: Unlimited';
    details.appendChild(tripsInfo);
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

  const fuelInfo = document.createElement('div');
  fuelInfo.textContent = `Fuel: ~${formatFuelMass(profileFuelKg)} per trip`;
  details.appendChild(fuelInfo);

  const timeInfo = document.createElement('div');
  timeInfo.textContent = `Time: ~${formatDuration(profileTimeSecs)} per trip`;
  details.appendChild(timeInfo);

  // Calculate costs and profit
  let crewSalaryPerTick = 0;
  for (const crew of ship.crew) {
    const roleDef = getCrewRoleDefinition(crew.role);
    if (roleDef) {
      crewSalaryPerTick += roleDef.salary;
    }
  }
  const tripCrewCost = Math.round(crewSalaryPerTick * profileTimeTicks);

  // Fuel cost in credits (using local station price)
  const currentLocation = gameData.world.locations.find(
    (l) => l.id === (ship.location.dockedAt || ship.location.orbitingAt)
  );
  const fuelPricePerKg = currentLocation
    ? getFuelPricePerKg(currentLocation, ship)
    : 2.0;
  const tripFuelCost = Math.round(profileFuelKg * fuelPricePerKg);

  if (tripCrewCost > 0) {
    const crewCostInfo = document.createElement('div');
    crewCostInfo.textContent = `Crew Salaries: ~${tripCrewCost.toLocaleString()} cr per trip`;
    crewCostInfo.style.color = '#ffa500';
    details.appendChild(crewCostInfo);
  }

  const fuelCostInfo = document.createElement('div');
  fuelCostInfo.textContent = `Fuel Cost: ~${tripFuelCost.toLocaleString()} cr per trip`;
  fuelCostInfo.style.color = '#ffa500';
  details.appendChild(fuelCostInfo);

  // Profit/loss estimate
  const tripPayment =
    quest.paymentPerTrip > 0 ? quest.paymentPerTrip : quest.paymentOnCompletion;
  const totalCost = tripCrewCost + tripFuelCost;
  const profit = tripPayment - totalCost;

  const profitInfo = document.createElement('div');
  profitInfo.style.cssText = `font-weight: bold; margin-top: 4px; color: ${profit >= 0 ? '#4caf50' : '#e94560'};`;
  profitInfo.textContent = `Est. Profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} cr per trip`;
  details.appendChild(profitInfo);

  // Route risk threat badge
  if (origin && destination) {
    const routeRisk = estimateRouteRisk(
      origin,
      destination,
      ship,
      gameData.world
    );
    const threatLevel = getThreatLevel(routeRisk);
    const narrative = getThreatNarrative(threatLevel);

    const riskLine = document.createElement('div');
    riskLine.style.display = 'flex';
    riskLine.style.alignItems = 'center';
    riskLine.style.gap = '8px';
    riskLine.style.marginTop = '4px';

    const riskLabel = document.createElement('span');
    riskLabel.textContent = 'Route Risk:';
    riskLine.appendChild(riskLabel);

    riskLine.appendChild(renderThreatBadge(threatLevel, narrative));
    details.appendChild(riskLine);
  }

  card.appendChild(details);

  // Payment
  const payment = document.createElement('div');
  payment.className = 'quest-payment';

  if (quest.paymentPerTrip > 0) {
    payment.textContent = `Payment: ${quest.paymentPerTrip.toLocaleString()} credits/trip`;
  } else {
    payment.textContent = `Payment: ${quest.paymentOnCompletion.toLocaleString()} credits on completion`;
  }

  card.appendChild(payment);

  // Accept button or reason
  if (canAccept) {
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

    // Add "Assign Route" button for standing freight and trade routes
    if (quest.type === 'standing_freight' || quest.type === 'trade_route') {
      const assignBtn = document.createElement('button');
      assignBtn.className = 'assign-route-button';
      assignBtn.textContent = 'Assign Route';
      assignBtn.style.backgroundColor = '#4a90e2';
      assignBtn.addEventListener('click', () =>
        callbacks.onAssignRoute(quest.id)
      );
      buttonContainer.appendChild(assignBtn);
    }

    card.appendChild(buttonContainer);
  } else if (reason) {
    const reasonDiv = document.createElement('div');
    reasonDiv.className = 'quest-reason';
    reasonDiv.textContent = reason;
    card.appendChild(reasonDiv);
  }

  return card;
}

function renderActiveContract(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'active-contract';

  const ship = getActiveShip(gameData);
  const activeContract = ship.activeContract;

  if (!activeContract) {
    return container;
  }

  // Show route assignment info if ship is on automated route
  if (ship.routeAssignment) {
    container.appendChild(renderRouteAssignmentInfo(gameData, callbacks));
  }

  const quest = activeContract.quest;
  const flight = ship.activeFlightPlan;

  // Contract summary
  const summary = document.createElement('div');
  summary.className = 'contract-summary';

  const title = document.createElement('h3');
  title.textContent = quest.title;
  summary.appendChild(title);

  const progress = document.createElement('div');
  progress.className = 'contract-progress';

  if (quest.tripsRequired === -1) {
    progress.textContent = `Trips completed: ${activeContract.tripsCompleted} (Unlimited)`;
  } else if (quest.type === 'supply') {
    progress.textContent = `Cargo delivered: ${activeContract.cargoDelivered.toLocaleString()} / ${quest.totalCargoRequired.toLocaleString()} kg`;
  } else {
    progress.textContent = `Trip ${activeContract.tripsCompleted + 1}/${quest.tripsRequired}`;
  }

  summary.appendChild(progress);

  const leg = document.createElement('div');
  leg.className = 'contract-leg';
  leg.textContent =
    activeContract.leg === 'outbound' ? 'Leg: Outbound' : 'Leg: Inbound';
  summary.appendChild(leg);

  const earned = document.createElement('div');
  earned.className = 'contract-earned';
  earned.textContent = `Earned so far: ${activeContract.creditsEarned.toLocaleString()} credits`;
  summary.appendChild(earned);

  container.appendChild(summary);

  // Flight status
  if (flight) {
    container.appendChild(renderFlightStatus(flight, gameData, ship));
  }

  // Fuel gauge
  const fuelGauge = document.createElement('div');
  fuelGauge.className = 'fuel-gauge';
  const fuelLabel = document.createElement('div');
  fuelLabel.textContent = `Fuel: ${formatFuelMass(ship.fuelKg)}`;
  fuelGauge.appendChild(fuelLabel);

  const fuelBar = document.createElement('div');
  fuelBar.className = 'fuel-bar';
  const fuelFill = document.createElement('div');
  fuelFill.className = 'fuel-fill';
  const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  fuelFill.style.width = `${fuelPercentage}%`;
  fuelBar.appendChild(fuelFill);
  fuelGauge.appendChild(fuelBar);

  container.appendChild(fuelGauge);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'contract-actions';

  const dockBtn = document.createElement('button');
  dockBtn.className = 'dock-button';
  dockBtn.textContent = 'Dock at nearest port';
  dockBtn.addEventListener('click', () => callbacks.onDockAtNearestPort());
  actions.appendChild(dockBtn);

  const abandonBtn = document.createElement('button');
  abandonBtn.className = 'abandon-button';
  abandonBtn.textContent = 'Abandon contract';
  abandonBtn.addEventListener('click', () => callbacks.onAbandonContract());
  actions.appendChild(abandonBtn);

  container.appendChild(actions);

  return container;
}

function renderPausedContract(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'paused-contract';

  const ship = getActiveShip(gameData);
  const activeContract = ship.activeContract;

  if (!activeContract) {
    return container;
  }

  const quest = activeContract.quest;

  // Contract summary
  const summary = document.createElement('div');
  summary.className = 'contract-summary';

  const title = document.createElement('h3');
  title.textContent = quest.title;
  summary.appendChild(title);

  const pausedBadge = document.createElement('span');
  pausedBadge.className = 'paused-badge';
  pausedBadge.textContent = 'PAUSED';
  summary.appendChild(pausedBadge);

  const progress = document.createElement('div');
  progress.className = 'contract-progress';

  if (quest.tripsRequired === -1) {
    progress.textContent = `Trips completed: ${activeContract.tripsCompleted} (Unlimited)`;
  } else if (quest.type === 'supply') {
    progress.textContent = `Cargo delivered: ${activeContract.cargoDelivered.toLocaleString()} / ${quest.totalCargoRequired.toLocaleString()} kg`;
  } else {
    progress.textContent = `Trip ${activeContract.tripsCompleted + 1}/${quest.tripsRequired}`;
  }

  summary.appendChild(progress);

  const earned = document.createElement('div');
  earned.className = 'contract-earned';
  earned.textContent = `Earned so far: ${activeContract.creditsEarned.toLocaleString()} credits`;
  summary.appendChild(earned);

  container.appendChild(summary);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'contract-actions';

  const resumeBtn = document.createElement('button');
  resumeBtn.className = 'resume-button';
  resumeBtn.textContent = 'Resume contract';
  resumeBtn.addEventListener('click', () => callbacks.onResumeContract());
  actions.appendChild(resumeBtn);

  const abandonBtn = document.createElement('button');
  abandonBtn.className = 'abandon-button';
  abandonBtn.textContent = 'Abandon contract';
  abandonBtn.addEventListener('click', () => callbacks.onAbandonContract());
  actions.appendChild(abandonBtn);

  container.appendChild(actions);

  return container;
}

function renderRouteAssignmentInfo(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'route-assignment-info';
  container.style.padding = '12px';
  container.style.marginBottom = '12px';
  container.style.border = '2px solid #4a90e2';
  container.style.borderRadius = '4px';
  container.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';

  const ship = getActiveShip(gameData);
  const assignment = ship.routeAssignment;

  if (!assignment) return container;

  const originLoc = gameData.world.locations.find(
    (l) => l.id === assignment.originId
  );
  const destLoc = gameData.world.locations.find(
    (l) => l.id === assignment.destinationId
  );

  // Header
  const header = document.createElement('div');
  header.style.fontSize = '14px';
  header.style.fontWeight = 'bold';
  header.style.color = '#4a90e2';
  header.style.marginBottom = '8px';
  header.textContent = '🔄 Automated Route Assignment';
  container.appendChild(header);

  // Route info
  const routeInfo = document.createElement('div');
  routeInfo.style.fontSize = '12px';
  routeInfo.style.marginBottom = '8px';
  routeInfo.innerHTML = `
    <div><strong>Route:</strong> ${originLoc?.name || 'Unknown'} ↔ ${destLoc?.name || 'Unknown'}</div>
    <div><strong>Trips Completed:</strong> ${assignment.totalTripsCompleted}</div>
    <div><strong>Credits Earned:</strong> ${assignment.creditsEarned.toLocaleString()}</div>
    <div><strong>Auto-Refuel:</strong> ${assignment.autoRefuel ? `Enabled (< ${assignment.autoRefuelThreshold}%)` : 'Disabled'}</div>
  `;
  container.appendChild(routeInfo);

  // End assignment button
  const actions = document.createElement('div');
  actions.style.marginTop = '8px';

  const unassignBtn = document.createElement('button');
  unassignBtn.className = 'abandon-button';
  unassignBtn.textContent = 'End Route Assignment';
  unassignBtn.addEventListener('click', () => callbacks.onUnassignRoute());
  actions.appendChild(unassignBtn);

  container.appendChild(actions);

  return container;
}

// ─── Mining Status Panel ────────────────────────────────────────

function renderMiningStatus(
  gameData: GameData,
  ship: Ship,
  location: import('../models').WorldLocation,
  callbacks: WorkTabCallbacks
): HTMLElement {
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
  title.textContent = `⛏️ Mining at ${location.name}`;
  header.appendChild(title);

  // Active/inactive status badge
  const isDocked = ship.location.status === 'docked';
  const miners = getCrewForJobType(ship, 'mining_ops');
  const shipMiningEquip = getBestShipMiningEquipment(ship);
  const hasActiveMiner = shipMiningEquip !== undefined && miners.length > 0;
  const statusBadge = document.createElement('span');
  if (isDocked) {
    statusBadge.style.cssText =
      'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(74,158,255,0.15); color: #4a9eff; border: 1px solid #4a9eff;';
    statusBadge.textContent = 'DOCKED';
  } else if (hasActiveMiner && getRemainingOreCapacity(ship) > 0) {
    statusBadge.style.cssText =
      'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(76,175,80,0.2); color: #4caf50; border: 1px solid #4caf50;';
    statusBadge.textContent = 'ACTIVE';
  } else if (hasActiveMiner) {
    statusBadge.style.cssText =
      'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(233,69,96,0.2); color: #e94560; border: 1px solid #e94560;';
    statusBadge.textContent = 'CARGO FULL';
  } else {
    statusBadge.style.cssText =
      'font-size: 0.8rem; padding: 2px 8px; border-radius: 3px; background: rgba(255,165,0,0.15); color: #ffa500; border: 1px solid #b87333;';
    statusBadge.textContent = 'IDLE';
  }
  header.appendChild(statusBadge);
  panel.appendChild(header);

  // Undock prompt when docked at a mining location
  if (isDocked) {
    const undockPrompt = document.createElement('div');
    undockPrompt.style.cssText =
      'padding: 0.5rem; margin-bottom: 0.5rem; background: rgba(74,158,255,0.1); border: 1px solid #4a9eff; border-radius: 4px; font-size: 0.85rem; color: #4a9eff;';
    undockPrompt.textContent =
      'Undock to enter orbit and begin mining operations. Mining equipment operates while orbiting.';
    panel.appendChild(undockPrompt);
  }

  // Available ores at this location
  const oresSection = document.createElement('div');
  oresSection.style.cssText = 'margin-bottom: 0.5rem;';
  const oresLabel = document.createElement('div');
  oresLabel.style.cssText =
    'font-size: 0.85rem; color: #aaa; margin-bottom: 0.25rem;';
  oresLabel.textContent = 'Available Ores:';
  oresSection.appendChild(oresLabel);

  const availableOres = location.availableOres ?? [];
  for (const oreId of availableOres) {
    const ore = getOreDefinition(oreId);
    const oreTag = document.createElement('span');
    oreTag.style.cssText = `
      display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px;
      border-radius: 3px; font-size: 0.8rem;
      background: rgba(255,165,0,0.15); border: 1px solid #665533;
    `;
    // Check if any miner can mine this ore
    const someMinerCanMine = miners.some((m) =>
      canMineOre(m.skills.mining, oreId)
    );
    if (!someMinerCanMine) {
      oreTag.style.opacity = '0.5';
      oreTag.title = `Requires Mining ${ore.miningLevelRequired}`;
    }
    oreTag.textContent = `${ore.icon} ${ore.name} (${ore.baseValue} cr)`;
    if (!someMinerCanMine) {
      oreTag.textContent += ` [Mining ${ore.miningLevelRequired}]`;
    }
    oresSection.appendChild(oreTag);
  }
  panel.appendChild(oresSection);

  // Miners status
  const minersSection = document.createElement('div');
  minersSection.style.cssText = 'margin-bottom: 0.5rem; font-size: 0.85rem;';

  if (miners.length === 0) {
    const noMiners = document.createElement('div');
    noMiners.style.color = '#e94560';
    noMiners.textContent =
      'No crew assigned to Mining Ops. Assign crew in the Ship tab.';
    minersSection.appendChild(noMiners);
  } else if (!shipMiningEquip) {
    const noEquip = document.createElement('div');
    noEquip.style.color = '#e94560';
    noEquip.textContent =
      'No mining equipment installed on ship. Purchase at a station store.';
    minersSection.appendChild(noEquip);
  } else {
    // Show ship equipment info
    const equipInfo = document.createElement('div');
    equipInfo.style.cssText =
      'margin-bottom: 4px; color: #6c6; font-size: 0.8rem;';
    equipInfo.textContent = `Ship Equipment: ${shipMiningEquip.name} (${shipMiningEquip.miningRate}x)`;
    if (
      shipMiningEquip.miningLevelRequired &&
      shipMiningEquip.miningLevelRequired > 0
    ) {
      equipInfo.textContent += ` · Requires Mining ${shipMiningEquip.miningLevelRequired}`;
    }
    minersSection.appendChild(equipInfo);

    for (const miner of miners) {
      const minerLine = document.createElement('div');
      minerLine.style.cssText = 'margin-bottom: 2px; color: #ccc;';
      const miningSkill = Math.floor(miner.skills.mining);

      if (miningSkill < (shipMiningEquip.miningLevelRequired ?? 0)) {
        minerLine.style.color = '#ffa500';
        minerLine.textContent = `${miner.name} (Mining ${miningSkill}) — Skill too low to operate equipment`;
      } else {
        const bestOre = availableOres
          .map((id) => getOreDefinition(id))
          .filter((o) => miningSkill >= o.miningLevelRequired)
          .sort((a, b) => b.baseValue - a.baseValue)[0];

        minerLine.textContent = `${miner.name} (Mining ${miningSkill})`;
        if (bestOre) {
          minerLine.textContent += ` → ${bestOre.icon} ${bestOre.name}`;
        }
      }
      minersSection.appendChild(minerLine);
    }
  }
  panel.appendChild(minersSection);

  // Cargo status
  const cargoSection = document.createElement('div');
  cargoSection.style.cssText = 'font-size: 0.85rem; color: #aaa;';

  const oreWeight = getOreCargoWeight(ship);
  const remaining = getRemainingOreCapacity(ship);
  const totalOreUnits = ship.oreCargo.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  let cargoText = `Ore Cargo: ${totalOreUnits} units (${Math.round(oreWeight).toLocaleString()} kg)`;
  if (remaining <= 0) {
    cargoText += ' — FULL';
    cargoSection.style.color = '#e94560';
  } else {
    cargoText += ` — ${Math.round(remaining).toLocaleString()} kg remaining`;
  }
  cargoSection.textContent = cargoText;
  panel.appendChild(cargoSection);

  // Ore cargo breakdown
  if (ship.oreCargo.length > 0) {
    const breakdown = document.createElement('div');
    breakdown.style.cssText =
      'margin-top: 0.35rem; font-size: 0.8rem; color: #888;';
    for (const item of ship.oreCargo) {
      const ore = getOreDefinition(item.oreId);
      const line = document.createElement('div');
      line.textContent = `  ${ore.icon} ${ore.name}: ${item.quantity} units`;
      breakdown.appendChild(line);
    }
    panel.appendChild(breakdown);
  }

  // ─── Mining Route Controls ──────────────────────────────────
  const routeSection = document.createElement('div');
  routeSection.style.cssText =
    'margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid #444;';

  if (ship.miningRoute) {
    // Active route status
    const route = ship.miningRoute;
    const sellLoc = gameData.world.locations.find(
      (l) => l.id === route.sellLocationId
    );

    const routeHeader = document.createElement('div');
    routeHeader.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;';

    const routeLabel = document.createElement('span');
    routeLabel.style.cssText = 'font-size: 0.85rem; color: #4caf50;';
    routeLabel.textContent = `🔄 Auto-sell route → ${sellLoc?.name ?? 'Unknown'}`;
    routeHeader.appendChild(routeLabel);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel Route';
    cancelBtn.style.cssText = 'font-size: 0.75rem; padding: 2px 8px;';
    cancelBtn.addEventListener('click', () => callbacks.onCancelMiningRoute());
    routeHeader.appendChild(cancelBtn);

    routeSection.appendChild(routeHeader);

    const routeStats = document.createElement('div');
    routeStats.style.cssText = 'font-size: 0.8rem; color: #888;';
    routeStats.textContent = `Trips: ${route.totalTrips} · Earned: ${route.totalCreditsEarned.toLocaleString()} cr · Status: ${route.status}`;
    routeSection.appendChild(routeStats);
  } else {
    // Set up route — show sell destination picker
    const routeLabel = document.createElement('div');
    routeLabel.style.cssText =
      'font-size: 0.85rem; color: #aaa; margin-bottom: 0.35rem;';
    routeLabel.textContent = '🔄 Auto-Sell Route (idle mining)';
    routeSection.appendChild(routeLabel);

    // Find reachable trade locations
    const tradeLocations = gameData.world.locations.filter(
      (l) =>
        l.id !== location.id &&
        l.services.includes('trade') &&
        canShipAccessLocation(ship, l)
    );

    if (tradeLocations.length === 0) {
      const noTrade = document.createElement('div');
      noTrade.style.cssText = 'font-size: 0.8rem; color: #888;';
      noTrade.textContent =
        'No reachable trade stations available for auto-sell.';
      routeSection.appendChild(noTrade);
    } else {
      const row = document.createElement('div');
      row.style.cssText =
        'display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;';

      const select = document.createElement('select');
      select.style.cssText =
        'font-size: 0.8rem; padding: 3px 6px; background: #1a1a2e; color: #eee; border: 1px solid #444; border-radius: 3px;';

      // Sort by distance (nearest first)
      const sorted = tradeLocations
        .map((loc) => ({
          loc,
          dist: getDistanceBetween(location, loc),
        }))
        .sort((a, b) => a.dist - b.dist);

      for (const { loc, dist } of sorted) {
        const opt = document.createElement('option');
        opt.value = loc.id;
        const distLabel =
          dist < 1e9
            ? `${(dist / 1e6).toFixed(0)} Mm`
            : `${(dist / 1e9).toFixed(1)} Gm`;
        // Show location type price multiplier hint
        const priceHint =
          loc.type === 'planet'
            ? '1.1×'
            : loc.type === 'space_station'
              ? '1.0×'
              : loc.type === 'orbital'
                ? '0.85×'
                : loc.type === 'moon'
                  ? '0.9×'
                  : '0.8×';
        opt.textContent = `${loc.name} (${distLabel}, ${priceHint} price)`;
        select.appendChild(opt);
      }
      row.appendChild(select);

      const startBtn = document.createElement('button');
      startBtn.textContent = 'Start Route';
      startBtn.style.cssText = 'font-size: 0.8rem; padding: 3px 10px;';
      startBtn.addEventListener('click', () =>
        callbacks.onStartMiningRoute(select.value)
      );
      row.appendChild(startBtn);

      routeSection.appendChild(row);

      const hint = document.createElement('div');
      hint.style.cssText =
        'font-size: 0.75rem; color: #666; margin-top: 0.25rem;';
      hint.textContent =
        'When cargo fills, ship auto-flies to sell ore, refuels, then returns to mine.';
      routeSection.appendChild(hint);
    }
  }
  panel.appendChild(routeSection);

  return panel;
}
