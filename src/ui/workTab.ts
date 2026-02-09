import type { GameData, Quest, FlightState, Ship } from '../models';
import { getActiveShip } from '../models';
import {
  formatDuration,
  formatRealDuration,
  GAME_SECONDS_PER_TICK,
  gameSecondsToTicks,
} from '../timeSystem';
import {
  canAcceptQuest,
  calculateTripFuelKg,
  estimateTripTime,
} from '../questGen';
import { getGForce } from '../flightPhysics';
import { getCrewRoleDefinition } from '../crewRoles';
import {
  estimateRouteRisk,
  getThreatLevel,
  getThreatNarrative,
  getShipPositionKm,
  calculatePositionDanger,
} from '../encounterSystem';
import { renderThreatBadge } from './threatBadge';
import type { Component } from './component';
import { formatFuelMass, calculateFuelPercentage } from './fuelFormatting';
import { getDistanceBetween } from '../worldGen';
import { getFuelPricePerKg } from './refuelDialog';

export interface WorkTabCallbacks {
  onAcceptQuest: (questId: string) => void;
  onAssignRoute: (questId: string) => void;
  onUnassignRoute: () => void;
  onDockAtNearestPort: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
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

/**
 * Flight profile presets for display labels
 */
function getProfileLabel(burnFraction: number): string {
  if (burnFraction >= 0.95) return 'Max Speed';
  if (burnFraction >= 0.75) return 'Fast';
  if (burnFraction >= 0.5) return 'Balanced';
  if (burnFraction >= 0.3) return 'Economical';
  return 'Max Economy';
}

interface FlightProfileControl {
  el: HTMLElement;
  slider: HTMLInputElement;
  label: HTMLElement;
}

function createFlightProfileControl(gameData: GameData): FlightProfileControl {
  const ship = getActiveShip(gameData);
  const el = document.createElement('div');
  el.className = 'flight-profile-control';
  el.style.cssText = `
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    background: rgba(74, 158, 255, 0.05);
    border: 1px solid #333;
    border-radius: 4px;
  `;

  const header = document.createElement('div');
  header.style.cssText =
    'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';

  const title = document.createElement('span');
  title.style.cssText = 'font-weight: bold; font-size: 0.9rem; color: #ccc;';
  title.textContent = 'Flight Profile';
  header.appendChild(title);

  const label = document.createElement('span');
  label.style.cssText =
    'font-size: 0.85rem; color: #4a9eff; font-weight: bold;';
  label.textContent = `${Math.round(ship.flightProfileBurnFraction * 100)}% — ${getProfileLabel(ship.flightProfileBurnFraction)}`;
  header.appendChild(label);

  el.appendChild(header);

  // Slider row with labels
  const sliderRow = document.createElement('div');
  sliderRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const leftLabel = document.createElement('span');
  leftLabel.style.cssText =
    'font-size: 0.75rem; color: #888; white-space: nowrap;';
  leftLabel.textContent = 'Economy';
  sliderRow.appendChild(leftLabel);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '10';
  slider.max = '100';
  slider.step = '10';
  slider.value = String(Math.round(ship.flightProfileBurnFraction * 100));
  slider.style.cssText = 'flex: 1; cursor: pointer;';
  slider.addEventListener('input', () => {
    const fraction = parseInt(slider.value) / 100;
    ship.flightProfileBurnFraction = fraction;
    label.textContent = `${slider.value}% — ${getProfileLabel(fraction)}`;
  });
  sliderRow.appendChild(slider);

  const rightLabel = document.createElement('span');
  rightLabel.style.cssText =
    'font-size: 0.75rem; color: #888; white-space: nowrap;';
  rightLabel.textContent = 'Max Speed';
  sliderRow.appendChild(rightLabel);

  el.appendChild(sliderRow);

  // Description
  const desc = document.createElement('div');
  desc.style.cssText = 'font-size: 0.75rem; color: #666; margin-top: 0.4rem;';
  desc.textContent =
    'Lower = longer coast phase, less fuel. Higher = shorter trip, more fuel.';
  el.appendChild(desc);

  return { el, slider, label };
}

function updateFlightProfileControl(
  control: FlightProfileControl,
  ship: Ship
): void {
  const currentSliderVal = parseInt(control.slider.value);
  const shipVal = Math.round(ship.flightProfileBurnFraction * 100);
  // Only update if the ship value changed externally (e.g. switched ships)
  // Don't overwrite while user is dragging
  if (currentSliderVal !== shipVal) {
    control.slider.value = String(shipVal);
    control.label.textContent = `${shipVal}% — ${getProfileLabel(ship.flightProfileBurnFraction)}`;
  }
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
    ? getFuelPricePerKg(currentLocation)
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

function renderFlightStatus(
  flight: FlightState,
  gameData: GameData,
  ship: import('../models').Ship
): HTMLElement {
  const status = document.createElement('div');
  status.className = 'flight-status';

  const heading = document.createElement('h4');
  heading.textContent = 'Flight Status';
  status.appendChild(heading);

  // Origin and destination
  const origin = gameData.world.locations.find((l) => l.id === flight.origin);
  const destination = gameData.world.locations.find(
    (l) => l.id === flight.destination
  );

  const route = document.createElement('div');
  route.className = 'flight-route';
  route.textContent = `${origin?.name} → ${destination?.name}`;
  status.appendChild(route);

  // Flight profile indicator
  if (flight.burnFraction < 1.0) {
    const profileDiv = document.createElement('div');
    profileDiv.style.cssText =
      'font-size: 0.85rem; color: #4a9eff; margin-bottom: 2px;';
    profileDiv.textContent = `Profile: ${Math.round(flight.burnFraction * 100)}% — ${getProfileLabel(flight.burnFraction)}`;
    status.appendChild(profileDiv);
  }

  // Regional threat status
  const currentKm = getShipPositionKm(ship, gameData.world);
  const positionDanger = calculatePositionDanger(currentKm, gameData.world);
  // Map position danger to a cumulative-like risk for threat level display
  const dangerRisk =
    positionDanger > 3
      ? 0.35
      : positionDanger > 1.5
        ? 0.2
        : positionDanger > 0.5
          ? 0.08
          : 0.02;
  const regionalThreat = getThreatLevel(dangerRisk);
  const regionalNarrative = getThreatNarrative(regionalThreat);

  const regionalStatus = document.createElement('div');
  regionalStatus.className = `regional-status threat-${regionalThreat}`;
  regionalStatus.textContent = `Crossing ${regionalNarrative.toLowerCase()}`;
  status.appendChild(regionalStatus);

  // Phase (or engine warmup)
  const phase = document.createElement('div');
  phase.className = 'flight-phase';
  let phaseText = '';

  if (ship.engine.state === 'warming_up') {
    const warmupPercent = Math.round(ship.engine.warmupProgress);
    phaseText = `Phase: Engine Warming Up (${warmupPercent}%)`;
  } else {
    switch (flight.phase) {
      case 'accelerating':
        phaseText = 'Phase: Accelerating';
        break;
      case 'coasting':
        phaseText = 'Phase: Coasting (0g)';
        break;
      case 'decelerating':
        phaseText = 'Phase: Decelerating';
        break;
    }
  }
  phase.textContent = phaseText;
  status.appendChild(phase);

  // G-force
  const gForce = getGForce(flight);
  const gForceDiv = document.createElement('div');
  gForceDiv.className = 'flight-gforce';
  gForceDiv.textContent = `G-force: ${gForce.toFixed(4)}g`;
  status.appendChild(gForceDiv);

  // Velocity (adaptive display)
  const velocity = document.createElement('div');
  velocity.className = 'flight-velocity';
  const velocityMs = flight.currentVelocity;
  if (velocityMs < 1000) {
    velocity.textContent = `Velocity: ${velocityMs.toFixed(1)} m/s`;
  } else {
    velocity.textContent = `Velocity: ${(velocityMs / 1000).toFixed(2)} km/s`;
  }
  status.appendChild(velocity);

  // Distance progress
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';

  const progressLabel = document.createElement('div');
  const percent = (flight.distanceCovered / flight.totalDistance) * 100;
  progressLabel.textContent = `Distance: ${percent.toFixed(1)}%`;
  progressBar.appendChild(progressLabel);

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  fill.style.width = `${percent}%`;
  bar.appendChild(fill);
  progressBar.appendChild(bar);

  status.appendChild(progressBar);

  // ETA (with real-time estimation)
  const remainingTime = flight.totalTime - flight.elapsedTime;
  const remainingTicks = Math.ceil(remainingTime / GAME_SECONDS_PER_TICK);

  // Add warmup overhead if engine is still warming up
  let totalRealSeconds = remainingTicks;
  if (ship.engine.state === 'warming_up') {
    const remainingWarmup = 100 - ship.engine.warmupProgress;
    // Estimate warmup ticks (simplified - actual rate depends on engine definition)
    const estimatedWarmupTicks = Math.ceil(remainingWarmup / 5); // rough estimate
    totalRealSeconds += estimatedWarmupTicks;
  }

  const eta = document.createElement('div');
  eta.className = 'flight-eta';
  eta.textContent = `ETA: ${formatDuration(remainingTime)} (~${formatRealDuration(totalRealSeconds)} real)`;
  status.appendChild(eta);

  return status;
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
