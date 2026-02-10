import type { GameData, FlightState, Ship } from '../models';
import { getActiveShip } from '../models';
import {
  formatDuration,
  formatRealDuration,
  GAME_SECONDS_PER_TICK,
} from '../timeSystem';
import { getGForce } from '../flightPhysics';
import { getEngineDefinition } from '../engines';
import {
  getShipPositionKm,
  calculatePositionDanger,
  getThreatLevel,
  getThreatNarrative,
} from '../encounterSystem';

/**
 * Shared flight status component used by Ship tab and Work tab.
 * Shows flight progress, phase, velocity, ETA, fuel, and threat level.
 */
export function renderFlightStatus(
  flight: FlightState,
  gameData: GameData,
  ship: Ship
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
  route.textContent = `${origin?.name} \u2192 ${destination?.name}`;
  status.appendChild(route);

  // Flight profile indicator (always visible per UI discoverability rule)
  const profileDiv = document.createElement('div');
  profileDiv.style.cssText =
    'font-size: 0.85rem; color: #4a9eff; margin-bottom: 2px;';
  profileDiv.textContent = `Profile: ${Math.round(flight.burnFraction * 100)}% \u2014 ${getProfileLabel(flight.burnFraction)}`;
  status.appendChild(profileDiv);

  // Regional threat status
  const currentKm = getShipPositionKm(ship, gameData.world);
  const positionDanger = calculatePositionDanger(currentKm, gameData.world);
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
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    const estimatedWarmupTicks = Math.ceil(
      remainingWarmup / engineDef.warmupRate
    );
    totalRealSeconds += estimatedWarmupTicks;
  }

  const eta = document.createElement('div');
  eta.className = 'flight-eta';
  eta.textContent = `ETA: ${formatDuration(remainingTime)} (~${formatRealDuration(totalRealSeconds)} real)`;
  status.appendChild(eta);

  return status;
}

/**
 * Compact flight status strip for use in headers and sidebars.
 * Shows route, progress bar, and ETA in a single line.
 */
export function renderFlightStrip(gameData: GameData): HTMLElement | null {
  const ship = getActiveShip(gameData);
  if (!ship.activeFlightPlan) return null;

  const flight = ship.activeFlightPlan;
  const strip = document.createElement('div');
  strip.className = 'flight-strip';
  strip.style.cssText =
    'padding: 0.5rem 0.75rem; background: rgba(74, 158, 255, 0.08); border: 1px solid rgba(74, 158, 255, 0.2); border-radius: 4px; margin-bottom: 0.75rem;';

  const destination = gameData.world.locations.find(
    (l) => l.id === flight.destination
  );
  const percent = (flight.distanceCovered / flight.totalDistance) * 100;
  const remainingTime = flight.totalTime - flight.elapsedTime;

  // Route + phase line
  const routeLine = document.createElement('div');
  routeLine.style.cssText =
    'font-size: 0.85rem; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;';

  const routeText = document.createElement('span');
  routeText.style.color = '#4a9eff';
  routeText.style.fontWeight = 'bold';
  routeText.textContent = `In flight to ${destination?.name || '?'}`;
  routeLine.appendChild(routeText);

  let phaseLabel = '';
  if (ship.engine.state === 'warming_up') {
    phaseLabel = `Warmup ${Math.round(ship.engine.warmupProgress)}%`;
  } else {
    switch (flight.phase) {
      case 'accelerating':
        phaseLabel = 'Accel';
        break;
      case 'coasting':
        phaseLabel = 'Coast';
        break;
      case 'decelerating':
        phaseLabel = 'Decel';
        break;
    }
  }
  const phaseSpan = document.createElement('span');
  phaseSpan.style.cssText = 'font-size: 0.8rem; color: #aaa;';
  phaseSpan.textContent = phaseLabel;
  routeLine.appendChild(phaseSpan);

  strip.appendChild(routeLine);

  // Progress bar
  const barContainer = document.createElement('div');
  barContainer.style.cssText =
    'height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 4px;';
  const barFill = document.createElement('div');
  barFill.style.cssText = `height: 100%; width: ${percent}%; background: #4a9eff; border-radius: 3px; transition: width 0.3s ease;`;
  barContainer.appendChild(barFill);
  strip.appendChild(barContainer);

  // Speed line
  const speedLine = document.createElement('div');
  speedLine.style.cssText =
    'font-size: 0.85rem; color: #4ade80; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;';

  const velocityMs = flight.currentVelocity;
  const speedText = document.createElement('span');
  if (velocityMs < 1000) {
    speedText.textContent = `${velocityMs.toFixed(1)} m/s`;
  } else {
    speedText.textContent = `${(velocityMs / 1000).toFixed(2)} km/s`;
  }
  speedText.style.fontWeight = 'bold';
  speedLine.appendChild(speedText);

  const gForce = getGForce(flight);
  const gText = document.createElement('span');
  gText.style.cssText = 'font-size: 0.8rem; color: #aaa;';
  gText.textContent = gForce > 0 ? `${gForce.toFixed(4)}g` : '0g';
  speedLine.appendChild(gText);

  strip.appendChild(speedLine);

  // Stats line
  const statsLine = document.createElement('div');
  statsLine.style.cssText =
    'font-size: 0.8rem; color: #aaa; display: flex; justify-content: space-between;';

  const progressText = document.createElement('span');
  progressText.textContent = `${percent.toFixed(0)}% complete`;
  statsLine.appendChild(progressText);

  const etaText = document.createElement('span');
  etaText.textContent = `ETA: ${formatDuration(remainingTime)}`;
  statsLine.appendChild(etaText);

  strip.appendChild(statsLine);

  return strip;
}

function getProfileLabel(burnFraction: number): string {
  if (burnFraction >= 0.95) return 'Max Speed';
  if (burnFraction >= 0.75) return 'Fast';
  if (burnFraction >= 0.5) return 'Balanced';
  if (burnFraction >= 0.3) return 'Economical';
  return 'Max Economy';
}
