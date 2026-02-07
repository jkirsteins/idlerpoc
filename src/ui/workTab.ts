import type { GameData, Quest, FlightState } from '../models';
import { formatDuration } from '../timeSystem';
import { canAcceptQuest } from '../questGen';
import { getGForce } from '../flightPhysics';

export interface WorkTabCallbacks {
  onAcceptQuest: (questId: string) => void;
  onAdvanceDay: () => void;
  onDockAtNearestPort: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
}

export function renderWorkTab(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): HTMLElement {
  console.log('=== renderWorkTab called ===');
  const container = document.createElement('div');
  container.className = 'work-tab';

  const { ship, activeContract } = gameData;

  console.log('renderWorkTab - status:', ship.location.status);
  console.log('renderWorkTab - activeContract:', activeContract);

  if (ship.location.status === 'docked' && !activeContract) {
    console.log('renderWorkTab - Rendering available work');
    const workContent = renderAvailableWork(gameData, callbacks);
    console.log(
      'renderWorkTab - workContent children:',
      workContent.children.length
    );
    container.appendChild(workContent);
  } else if (activeContract && activeContract.paused) {
    console.log('renderWorkTab - Rendering paused contract');
    container.appendChild(renderPausedContract(gameData, callbacks));
  } else if (activeContract) {
    console.log('renderWorkTab - Rendering active contract');
    container.appendChild(renderActiveContract(gameData, callbacks));
  } else {
    console.log('renderWorkTab - NO CONDITION MET!');
  }

  console.log(
    'renderWorkTab - final container children:',
    container.children.length
  );
  return container;
}

function renderAvailableWork(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'available-work';

  const { ship, availableQuests } = gameData;
  const location = ship.location.dockedAt;

  console.log('Work tab - availableQuests:', availableQuests);
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

  // Header
  const heading = document.createElement('h3');
  heading.textContent = `Available Work at ${locationData.name}`;
  console.log('Work tab - Adding heading:', heading.textContent);
  container.appendChild(heading);

  // Advance Day button
  const advanceDayBtn = document.createElement('button');
  advanceDayBtn.className = 'advance-day-button';
  advanceDayBtn.textContent = 'Advance Day';
  advanceDayBtn.addEventListener('click', () => callbacks.onAdvanceDay());
  container.appendChild(advanceDayBtn);

  // Quest list
  const questList = document.createElement('div');
  questList.className = 'quest-list';

  if (availableQuests.length === 0) {
    const noQuests = document.createElement('p');
    noQuests.className = 'no-quests';
    noQuests.textContent = 'No work available. Try advancing the day.';
    questList.appendChild(noQuests);
  } else {
    for (const quest of availableQuests) {
      questList.appendChild(renderQuestCard(gameData, quest, callbacks));
    }
  }

  container.appendChild(questList);

  return container;
}

function renderQuestCard(
  gameData: GameData,
  quest: Quest,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'quest-card';

  const { ship } = gameData;
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

  const fuelInfo = document.createElement('div');
  fuelInfo.textContent = `Fuel: ~${Math.round(quest.estimatedFuelPerTrip)}% per trip`;
  details.appendChild(fuelInfo);

  const timeInfo = document.createElement('div');
  timeInfo.textContent = `Time: ~${quest.estimatedTripTicks} ticks per trip`;
  details.appendChild(timeInfo);

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
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'accept-quest-button';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', () =>
      callbacks.onAcceptQuest(quest.id)
    );
    card.appendChild(acceptBtn);
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

  const { ship, activeContract } = gameData;

  if (!activeContract) {
    return container;
  }

  const quest = activeContract.quest;
  const flight = ship.location.flight;

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
    container.appendChild(renderFlightStatus(flight, gameData));
  }

  // Fuel gauge
  const fuelGauge = document.createElement('div');
  fuelGauge.className = 'fuel-gauge';
  const fuelLabel = document.createElement('div');
  fuelLabel.textContent = `Fuel: ${Math.round(ship.fuel)}%`;
  fuelGauge.appendChild(fuelLabel);

  const fuelBar = document.createElement('div');
  fuelBar.className = 'fuel-bar';
  const fuelFill = document.createElement('div');
  fuelFill.className = 'fuel-fill';
  fuelFill.style.width = `${ship.fuel}%`;
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
  gameData: GameData
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

  // Phase
  const phase = document.createElement('div');
  phase.className = 'flight-phase';
  let phaseText = '';
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
  phase.textContent = phaseText;
  status.appendChild(phase);

  // G-force
  const gForce = getGForce(flight);
  const gForceDiv = document.createElement('div');
  gForceDiv.className = 'flight-gforce';
  gForceDiv.textContent = `G-force: ${gForce.toFixed(4)}g`;
  status.appendChild(gForceDiv);

  // Velocity
  const velocity = document.createElement('div');
  velocity.className = 'flight-velocity';
  velocity.textContent = `Velocity: ${(flight.currentVelocity / 1000).toFixed(2)} km/s`;
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

  // ETA
  const remainingTime = flight.totalTime - flight.elapsedTime;
  const eta = document.createElement('div');
  eta.className = 'flight-eta';
  eta.textContent = `ETA: ${formatDuration(remainingTime)}`;
  status.appendChild(eta);

  return status;
}

function renderPausedContract(
  gameData: GameData,
  callbacks: WorkTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'paused-contract';

  const { activeContract } = gameData;

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
