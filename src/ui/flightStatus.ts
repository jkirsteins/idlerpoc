import type { GameData, FlightState, Ship } from '../models';
import { getActiveShip } from '../models';
import {
  formatDuration,
  formatRealDuration,
  GAME_SECONDS_PER_TICK,
} from '../timeSystem';
import { formatCredits } from '../formatting';
import { getGForce } from '../flightPhysics';
import { getEngineDefinition } from '../engines';
import {
  getShipPositionKm,
  calculatePositionDanger,
  getThreatLevel,
  getThreatNarrative,
} from '../encounterSystem';
import type { Component } from './component';

// Radio-group selection values (shared with workTab)
type ActiveAction = 'continue' | 'pause' | 'abandon';

// Unique radio-group name counter to avoid conflicts between instances
let radioGroupCounter = 0;

/**
 * Callbacks for station-arrival actions (continue/pause/abandon).
 */
export interface FlightStatusCallbacks {
  onContinue: () => void;
  onPause: () => void;
  onAbandon: () => void;
}

// ── Refs for radio cards ──
interface RadioCardRefs {
  card: HTMLLabelElement;
  radio: HTMLInputElement;
  labelEl: HTMLElement;
  descEl: HTMLElement;
  warnEl: HTMLElement;
}

/**
 * Mount-once / update-on-tick flight status component.
 *
 * Shows flight progress, phase, velocity, ETA, threat level, and — when
 * the ship has an active contract during flight — station-arrival action
 * radio buttons (continue / pause & dock / abandon).
 *
 * Reusable across Ship tab, Work tab, or anywhere else.
 */
export function createFlightStatusComponent(
  gameData: GameData,
  callbacks: FlightStatusCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'flight-status-component';

  // ── Flight info section (stable refs, patched in-place) ──
  const flightSection = document.createElement('div');
  flightSection.className = 'flight-status';
  flightSection.style.display = 'none';

  const heading = document.createElement('h4');
  heading.textContent = 'Flight Status';
  flightSection.appendChild(heading);

  const routeEl = document.createElement('div');
  routeEl.className = 'flight-route';
  flightSection.appendChild(routeEl);

  const profileEl = document.createElement('div');
  profileEl.style.cssText =
    'font-size: 0.85rem; color: #4a9eff; margin-bottom: 2px;';
  flightSection.appendChild(profileEl);

  const regionalEl = document.createElement('div');
  flightSection.appendChild(regionalEl);

  const phaseEl = document.createElement('div');
  phaseEl.className = 'flight-phase';
  flightSection.appendChild(phaseEl);

  const gForceEl = document.createElement('div');
  gForceEl.className = 'flight-gforce';
  flightSection.appendChild(gForceEl);

  const velocityEl = document.createElement('div');
  velocityEl.className = 'flight-velocity';
  flightSection.appendChild(velocityEl);

  // Distance progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  const progressLabel = document.createElement('div');
  progressBar.appendChild(progressLabel);
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  bar.appendChild(fill);
  progressBar.appendChild(bar);
  flightSection.appendChild(progressBar);

  const etaEl = document.createElement('div');
  etaEl.className = 'flight-eta';
  flightSection.appendChild(etaEl);

  container.appendChild(flightSection);

  // ── Station action radio group (stable refs, patched in-place) ──
  const radioGroupName = `flight-action-${++radioGroupCounter}`;
  const radioGroupEl = document.createElement('div');
  radioGroupEl.className = 'action-radio-group';
  radioGroupEl.style.display = 'none';
  const radioCardRefs = new Map<ActiveAction, RadioCardRefs>();

  for (const value of ['continue', 'pause', 'abandon'] as ActiveAction[]) {
    const card = document.createElement('label');
    card.className = 'action-radio-card action-radio-card--default';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = radioGroupName;
    radio.value = value;
    radio.addEventListener('change', () => handleRadioSelect(value));
    card.appendChild(radio);

    const textWrap = document.createElement('div');
    textWrap.className = 'action-radio-text';

    const labelEl = document.createElement('div');
    labelEl.className = 'action-radio-label';
    textWrap.appendChild(labelEl);

    const descEl = document.createElement('div');
    descEl.className = 'action-radio-desc';
    textWrap.appendChild(descEl);

    const warnEl = document.createElement('div');
    warnEl.className = 'action-radio-warn';
    warnEl.style.display = 'none';
    textWrap.appendChild(warnEl);

    card.appendChild(textWrap);
    radioGroupEl.appendChild(card);
    radioCardRefs.set(value, { card, radio, labelEl, descEl, warnEl });
  }

  container.appendChild(radioGroupEl);

  function handleRadioSelect(action: ActiveAction) {
    if (action === 'continue') {
      callbacks.onContinue();
    } else if (action === 'pause') {
      callbacks.onPause();
    } else if (action === 'abandon') {
      callbacks.onAbandon();
    }
  }

  // ── Update: flight info ──
  function updateFlightInfo(flight: FlightState, gd: GameData, ship: Ship) {
    const origin = gd.world.locations.find((l) => l.id === flight.origin);
    const destination = gd.world.locations.find(
      (l) => l.id === flight.destination
    );

    routeEl.textContent = `${origin?.name} \u2192 ${destination?.name}`;
    profileEl.textContent = `Profile: ${Math.round(flight.burnFraction * 100)}% \u2014 ${getProfileLabel(flight.burnFraction)}`;

    // Regional threat
    const currentKm = getShipPositionKm(ship, gd.world);
    const positionDanger = calculatePositionDanger(currentKm, gd.world);
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
    regionalEl.className = `regional-status threat-${regionalThreat}`;
    regionalEl.textContent = `Crossing ${regionalNarrative.toLowerCase()}`;

    // Phase
    let phaseText = '';
    if (ship.engine.state === 'warming_up') {
      phaseText = `Phase: Engine Warming Up (${Math.round(ship.engine.warmupProgress)}%)`;
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
    phaseEl.textContent = phaseText;

    // G-force
    const gForce = getGForce(flight);
    gForceEl.textContent = `G-force: ${gForce.toFixed(4)}g`;

    // Velocity
    const velocityMs = flight.currentVelocity;
    if (velocityMs < 1000) {
      velocityEl.textContent = `Velocity: ${velocityMs.toFixed(1)} m/s`;
    } else {
      velocityEl.textContent = `Velocity: ${(velocityMs / 1000).toFixed(2)} km/s`;
    }

    // Distance progress
    const percent = (flight.distanceCovered / flight.totalDistance) * 100;
    progressLabel.textContent = `Distance: ${percent.toFixed(1)}%`;
    fill.style.width = `${percent}%`;

    // ETA
    const remainingTime = flight.totalTime - flight.elapsedTime;
    const remainingTicks = Math.ceil(remainingTime / GAME_SECONDS_PER_TICK);
    let totalRealSeconds = remainingTicks;
    if (ship.engine.state === 'warming_up') {
      const remainingWarmup = 100 - ship.engine.warmupProgress;
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const estimatedWarmupTicks = Math.ceil(
        remainingWarmup / engineDef.warmupRate
      );
      totalRealSeconds += estimatedWarmupTicks;
    }
    etaEl.textContent = `ETA: ${formatDuration(remainingTime)} (~${formatRealDuration(totalRealSeconds)} real)`;
  }

  // ── Update: radio group ──
  function updateRadioGroup(ship: Ship) {
    const activeContract = ship.activeContract;
    if (!activeContract) return;

    const selectedAction: ActiveAction = activeContract.abandonRequested
      ? 'abandon'
      : activeContract.paused
        ? 'pause'
        : 'continue';

    const hasRouteAssignment = !!ship.routeAssignment;

    const optionData: Record<
      ActiveAction,
      { label: string; desc: string; warn?: string; style: string }
    > = {
      continue: {
        label: 'Continue flying',
        desc: 'Ship continues to destination. No changes.',
        style: 'default',
      },
      pause: {
        label: 'Pause & dock on arrival',
        desc: 'Contract pauses when you arrive. You keep all earnings. Resume anytime.',
        style: 'caution',
      },
      abandon: {
        label: 'Abandon contract',
        desc:
          activeContract.leg === 'inbound'
            ? `Ends contract on arrival. This return trip will still be paid. You keep all earnings from completed trips.`
            : `Ends contract on arrival. No payment for this outbound trip — delivery not yet complete. You keep ${formatCredits(activeContract.creditsEarned)} from prior trips.`,
        warn: hasRouteAssignment
          ? 'Your automated route assignment will also end.'
          : undefined,
        style: 'danger',
      },
    };

    for (const [action, refs] of radioCardRefs) {
      const data = optionData[action];
      const isSelected = selectedAction === action;

      refs.radio.checked = isSelected;
      refs.card.className = `action-radio-card action-radio-card--${data.style}`;
      if (isSelected) refs.card.classList.add('action-radio-card--selected');

      refs.labelEl.textContent = data.label;
      refs.descEl.textContent = data.desc;

      if (data.warn) {
        refs.warnEl.textContent = data.warn;
        refs.warnEl.style.display = '';
      } else {
        refs.warnEl.style.display = 'none';
      }
    }
  }

  // ── Main update ──
  function update(gd: GameData) {
    const ship = getActiveShip(gd);
    const flight = ship.activeFlightPlan;

    // Show flight info when in flight
    if (flight) {
      flightSection.style.display = '';
      updateFlightInfo(flight, gd, ship);
    } else {
      flightSection.style.display = 'none';
    }

    // Show radio buttons when:
    // - ship has an active contract AND
    // - ship is in flight (including paused-while-in-flight) AND
    // - the contract requires more than one trip (single-trip contracts
    //   complete on arrival so continue/pause/abandon choices are meaningless)
    const activeContract = ship.activeContract;
    const showActions =
      !!activeContract &&
      ship.location.status === 'in_flight' &&
      !!flight &&
      activeContract.quest.tripsRequired !== 1;

    if (showActions) {
      radioGroupEl.style.display = '';
      updateRadioGroup(ship);
    } else {
      radioGroupEl.style.display = 'none';
    }
  }

  // Initial render
  update(gameData);
  return { el: container, update };
}

function getProfileLabel(burnFraction: number): string {
  if (burnFraction >= 0.95) return 'Max Speed';
  if (burnFraction >= 0.75) return 'Fast';
  if (burnFraction >= 0.5) return 'Balanced';
  if (burnFraction >= 0.3) return 'Economical';
  return 'Max Economy';
}
