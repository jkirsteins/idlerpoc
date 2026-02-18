import type { GameData, FlightState, Ship } from '../models';
import { getActiveShip } from '../models';
import {
  formatDuration,
  formatRealDuration,
  GAME_SECONDS_PER_TICK,
} from '../timeSystem';
import { formatCredits, formatMass } from '../formatting';
import { getGForce } from '../flightPhysics';
import { getEngineDefinition } from '../engines';
import {
  getShipPositionKm,
  calculatePositionDanger,
  getThreatLevel,
  getThreatNarrative,
} from '../encounterSystem';
import {
  getMiningRouteActionOptions,
  getSelectedMiningAction,
} from '../miningRoute';
import type { Component } from './component';
import { createActionRadioCards, type ActionValue } from './actionRadioCards';

/**
 * Callbacks for station-arrival actions (continue/pause/abandon).
 */
export interface FlightStatusCallbacks {
  onContinue: () => void;
  onPause: () => void;
  onAbandon: () => void;
  onSetMiningPendingAction: (action: 'pause' | 'abandon' | null) => void;
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

  // Gravity assist indicator (always shown when in flight)
  const gravAssistEl = document.createElement('div');
  gravAssistEl.className = 'gravity-assist-status';
  gravAssistEl.style.cssText =
    'font-size: 0.85rem; margin-top: 4px; color: #888;';
  flightSection.appendChild(gravAssistEl);

  container.appendChild(flightSection);

  // ── Station action radio group (stable refs, patched in-place) ──
  const { groupEl: radioGroupEl, cardRefs: radioCardRefs } =
    createActionRadioCards(handleRadioSelect);
  container.appendChild(radioGroupEl);

  /** Which system owns the radio group, derived from update(). */
  let radioContext: 'contract' | 'mining' | 'hidden' = 'hidden';

  function handleRadioSelect(action: ActionValue) {
    if (radioContext === 'mining') {
      if (action === 'continue') {
        callbacks.onSetMiningPendingAction(null);
      } else {
        callbacks.onSetMiningPendingAction(action);
      }
    } else if (radioContext === 'contract') {
      if (action === 'continue') {
        callbacks.onContinue();
      } else if (action === 'pause') {
        callbacks.onPause();
      } else if (action === 'abandon') {
        callbacks.onAbandon();
      }
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

    // Gravity assist status
    const assists = flight.gravityAssists;
    if (!assists || assists.length === 0) {
      const noAssistText = 'Gravity assists: None on this trajectory';
      if (gravAssistEl.textContent !== noAssistText) {
        gravAssistEl.textContent = noAssistText;
        gravAssistEl.style.color = '#666';
      }
    } else {
      const parts: string[] = [];
      for (const a of assists) {
        if (a.result === 'pending') {
          const pctToApproach = (a.approachProgress * 100).toFixed(0);
          parts.push(`${a.bodyName} (at ${pctToApproach}%)`);
        } else if (a.result === 'success') {
          parts.push(
            `${a.bodyName} \u2714 saved ${formatMass(a.fuelRefundKg)}`
          );
        } else {
          parts.push(
            `${a.bodyName} \u2718 cost ${formatMass(a.fuelPenaltyKg)}`
          );
        }
      }
      const assistText = `Gravity assists: ${parts.join(', ')}`;
      if (gravAssistEl.textContent !== assistText) {
        gravAssistEl.textContent = assistText;
        const hasSuccess = assists.some((a) => a.result === 'success');
        const hasFailure = assists.some((a) => a.result === 'failure');
        gravAssistEl.style.color = hasSuccess
          ? '#4caf50'
          : hasFailure
            ? '#f44336'
            : '#ffc107';
      }
    }
  }

  // ── Update: radio group (contract) ──
  function updateRadioGroupContract(ship: Ship) {
    const activeContract = ship.activeContract;
    if (!activeContract) return;

    const selectedAction: ActionValue = activeContract.abandonRequested
      ? 'abandon'
      : activeContract.paused
        ? 'pause'
        : 'continue';

    const optionData: Record<
      ActionValue,
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
        style: 'danger',
      },
    };

    applyRadioData(optionData, selectedAction);
  }

  // ── Update: radio group (mining route) ──
  function updateRadioGroupMining(ship: Ship) {
    const route = ship.miningRoute;
    if (!route) return;

    const selectedAction: ActionValue = getSelectedMiningAction(route);
    const optionData = getMiningRouteActionOptions(route);

    applyRadioData(optionData, selectedAction);
  }

  /** Apply option data to the shared radio card elements. */
  function applyRadioData(
    optionData: Record<
      ActionValue,
      { label: string; desc: string; warn?: string; style: string }
    >,
    selectedAction: ActionValue
  ) {
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

    // Show radio buttons when in flight with either:
    // - an active contract (multi-trip), or
    // - an active mining route (selling/returning transit)
    const activeContract = ship.activeContract;
    const miningRoute = ship.miningRoute;
    const showContractActions =
      !!activeContract &&
      ship.location.status === 'in_flight' &&
      !!flight &&
      activeContract.quest.tripsRequired !== 1;
    const showMiningActions =
      !!miningRoute &&
      ship.location.status === 'in_flight' &&
      !!flight &&
      (miningRoute.status === 'selling' || miningRoute.status === 'returning');

    if (showContractActions) {
      radioContext = 'contract';
      radioGroupEl.style.display = '';
      updateRadioGroupContract(ship);
    } else if (showMiningActions) {
      radioContext = 'mining';
      radioGroupEl.style.display = '';
      updateRadioGroupMining(ship);
    } else {
      radioContext = 'hidden';
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
