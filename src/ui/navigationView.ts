import type { GameData, WorldLocation } from '../models';
import { getActiveShip } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import {
  isLocationReachable,
  getUnreachableReason,
  getDistanceBetween,
} from '../worldGen';
import { formatDistance } from '../formatting';
import { getGravityDegradationLevel } from '../gravitySystem';
import {
  getShipPositionKm,
  estimateRouteRisk,
  getThreatLevel,
  getThreatNarrative,
} from '../encounterSystem';
import { renderThreatBadge } from './threatBadge';
import { getShipClass } from '../shipClasses';
import { initializeFlight } from '../flightPhysics';
import { calculateTripFuelKg } from '../questGen';
import { formatDualTime } from '../timeSystem';
import type { Component } from './component';
import { formatFuelMass } from './fuelFormatting';
import {
  createFlightProfileControl,
  updateFlightProfileControl,
} from './flightProfileControl';
import {
  computeLaunchWindow,
  type AlignmentQuality,
} from '../orbitalMechanics';

const NAV_SERVICE_LABELS: Record<string, { icon: string; label: string }> = {
  refuel: { icon: '\u26FD', label: 'Fuel' },
  trade: { icon: '\uD83D\uDED2', label: 'Trade' },
  repair: { icon: '\uD83D\uDD27', label: 'Repair' },
  hire: { icon: '\uD83D\uDC64', label: 'Hire' },
  mine: { icon: '\u26CF\uFE0F', label: 'Mine' },
};

export interface NavigationViewCallbacks {
  onToggleNavigation: () => void;
  onStartTrip?: (destinationId: string) => void;
}

/** Per-location refs for the SVG orrery marker */
interface MarkerRefs {
  dot: SVGCircleElement; // the body dot
  label: SVGTextElement; // name label
  hitArea: SVGCircleElement; // invisible click target
}

/** Ship flight trajectory line and moving dot */
interface FlightLineRefs {
  line: SVGLineElement;
  shipDot: SVGCircleElement;
}

// SVG namespace
const SVG_NS = 'http://www.w3.org/2000/svg';
const ORRERY_SIZE = 400; // viewBox is -200..200
const ORRERY_HALF = ORRERY_SIZE / 2;

/**
 * Map an orbital radius (km) to SVG visual radius.
 * Logarithmic scaling so Earth-orbit (~150M km) and Jupiter (~778M km)
 * are both visible, while inner Earth-system bodies cluster near Earth.
 */
function orbitalRadiusToSvg(radiusKm: number): number {
  if (radiusKm <= 0) return 0;
  const logMin = Math.log10(100_000_000); // ~0.67 AU
  const logMax = Math.log10(900_000_000); // ~6 AU
  const logR = Math.log10(Math.max(radiusKm, 100_000_000));
  const t = (logR - logMin) / (logMax - logMin);
  return 30 + t * 150; // 30..180 SVG units from center
}

/**
 * Project a location's real km position (x,y from Sun) to SVG coordinates.
 * Uses the angle from the real position but log-scales the radius
 * to keep the solar system viewable.
 */
function projectToSvg(xKm: number, yKm: number): { x: number; y: number } {
  const distFromSun = Math.sqrt(xKm * xKm + yKm * yKm);
  if (distFromSun < 1000) {
    // At origin (Sun) — center of SVG
    return { x: 0, y: 0 };
  }
  const angle = Math.atan2(yKm, xKm);
  const r = orbitalRadiusToSvg(distFromSun);
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

/** Get alignment badge color */
function alignmentColor(alignment: AlignmentQuality): string {
  switch (alignment) {
    case 'excellent':
      return '#4caf50';
    case 'good':
      return '#8bc34a';
    case 'moderate':
      return '#ffc107';
    case 'poor':
      return '#f44336';
  }
}

/** Per-location refs for the legend item */
interface LegendItemRefs {
  item: HTMLElement;
  name: HTMLElement;
  badgesContainer: HTMLElement;
  distance: HTMLElement;
  alignmentLine: HTMLElement; // launch window alignment badge
  travelInfo: HTMLElement;
  description: HTMLElement;
  riskLine: HTMLElement;
  gravityWarning: HTMLElement;
  // Action area — all possible children, toggled via display
  currentBadge: HTMLElement;
  destBadge: HTMLElement;
  statusText: HTMLElement;
  travelButton: HTMLButtonElement;
  unreachableReason: HTMLElement;
}

export function createNavigationView(
  gameData: GameData,
  callbacks: NavigationViewCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'navigation-view';

  // Persistent flight profile slider — created once
  const profileControl = createFlightProfileControl(gameData);

  // Track latest gameData for handlers that close over it
  let latestGameData = gameData;

  // Refs to travel estimate elements — updated in-place on slider drag
  let estimateRefs: {
    el: HTMLElement;
    origin: WorldLocation;
    destination: WorldLocation;
  }[] = [];

  // When slider changes, patch estimate text in-place (no DOM rebuild)
  profileControl.slider.addEventListener('input', () => {
    const ship = getActiveShip(latestGameData);
    if (!getShipClass(ship.classId)) return;
    for (const ref of estimateRefs) {
      try {
        const flight = initializeFlight(
          ship,
          ref.origin,
          ref.destination,
          false,
          ship.flightProfileBurnFraction
        );
        const travelTime = formatDualTime(flight.totalTime);
        const distanceKm = getDistanceBetween(ref.origin, ref.destination);
        const fuelCostKg = calculateTripFuelKg(
          ship,
          distanceKm,
          ship.flightProfileBurnFraction
        );
        ref.el.textContent = `\u23F1 Travel Time: ${travelTime} | \u26FD Fuel Cost: ~${formatFuelMass(fuelCostKg)}`;
      } catch {
        // skip if estimate fails
      }
    }
  });

  // --- Build DOM structure once ---

  // Header (static)
  const header = document.createElement('div');
  header.className = 'nav-header';

  const title = document.createElement('h3');
  title.textContent = 'Navigation Chart';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'nav-close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', callbacks.onToggleNavigation);
  header.appendChild(closeBtn);

  container.appendChild(header);

  // Orrery SVG map area
  const mapArea = document.createElement('div');
  mapArea.className = 'nav-map';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute(
    'viewBox',
    `${-ORRERY_HALF} ${-ORRERY_HALF} ${ORRERY_SIZE} ${ORRERY_SIZE}`
  );
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  // Background ring layer (behind dots)
  const ringLayer = document.createElementNS(SVG_NS, 'g');
  ringLayer.setAttribute('class', 'orrery-rings');
  svg.appendChild(ringLayer);

  // Orbit rings — one per unique Sun-orbiting radius
  const sunOrbitRadii = new Set<number>();
  for (const loc of gameData.world.locations) {
    if (loc.orbital && !loc.orbital.parentId) {
      sunOrbitRadii.add(loc.orbital.orbitalRadiusKm);
    }
  }
  for (const radiusKm of sunOrbitRadii) {
    const r = orbitalRadiusToSvg(radiusKm);
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '0');
    ring.setAttribute('cy', '0');
    ring.setAttribute('r', String(r));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'rgba(15, 52, 96, 0.5)');
    ring.setAttribute('stroke-width', '0.5');
    ring.setAttribute('stroke-dasharray', '3,3');
    ringLayer.appendChild(ring);
  }

  // Sun marker at center
  const sunDot = document.createElementNS(SVG_NS, 'circle');
  sunDot.setAttribute('cx', '0');
  sunDot.setAttribute('cy', '0');
  sunDot.setAttribute('r', '4');
  sunDot.setAttribute('fill', '#ffd700');
  svg.appendChild(sunDot);
  const sunLabel = document.createElementNS(SVG_NS, 'text');
  sunLabel.setAttribute('x', '0');
  sunLabel.setAttribute('y', '10');
  sunLabel.setAttribute('text-anchor', 'middle');
  sunLabel.setAttribute('fill', '#888');
  sunLabel.setAttribute('font-size', '5');
  sunLabel.textContent = 'Sun';
  svg.appendChild(sunLabel);

  // Body dots layer
  const bodyLayer = document.createElementNS(SVG_NS, 'g');
  bodyLayer.setAttribute('class', 'orrery-bodies');
  svg.appendChild(bodyLayer);

  // Flight trajectory layer (on top of rings, below labels)
  const flightLayer = document.createElementNS(SVG_NS, 'g');
  flightLayer.setAttribute('class', 'orrery-flights');
  svg.appendChild(flightLayer);

  // Flight line + ship dot (created once, updated each tick)
  const flightLine = document.createElementNS(SVG_NS, 'line');
  flightLine.setAttribute('stroke', '#e94560');
  flightLine.setAttribute('stroke-width', '1');
  flightLine.setAttribute('stroke-dasharray', '4,2');
  flightLine.setAttribute('stroke-opacity', '0.6');
  flightLine.style.display = 'none';
  flightLayer.appendChild(flightLine);

  const shipDot = document.createElementNS(SVG_NS, 'circle');
  shipDot.setAttribute('r', '3');
  shipDot.setAttribute('fill', '#e94560');
  shipDot.setAttribute('stroke', '#fff');
  shipDot.setAttribute('stroke-width', '0.5');
  shipDot.style.display = 'none';
  flightLayer.appendChild(shipDot);

  const flightRefs: FlightLineRefs = { line: flightLine, shipDot };

  mapArea.appendChild(svg);
  container.appendChild(mapArea);

  // Profile slot — always in the DOM, visibility toggled
  const profileSlot = document.createElement('div');
  profileSlot.style.display = 'none';
  profileSlot.appendChild(profileControl.el);
  container.appendChild(profileSlot);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'nav-legend';

  const legendTitle = document.createElement('h4');
  legendTitle.textContent = 'Locations';
  legend.appendChild(legendTitle);

  container.appendChild(legend);

  // --- Create per-location elements once ---
  const markerMap = new Map<string, MarkerRefs>();
  const legendMap = new Map<string, LegendItemRefs>();

  for (const location of gameData.world.locations) {
    // --- SVG marker ---
    const pos = projectToSvg(location.x, location.y);

    const template = getLocationTypeTemplate(location.type);
    const isEarthSatellite = location.orbital?.parentId === 'earth';
    const dotRadius =
      location.id === 'earth' || location.id === 'mars'
        ? 5
        : isEarthSatellite
          ? 2.5
          : 3.5;

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(pos.x));
    dot.setAttribute('cy', String(pos.y));
    dot.setAttribute('r', String(dotRadius));
    dot.setAttribute('fill', template.color ?? '#0f3460');
    dot.setAttribute('stroke', '#0f3460');
    dot.setAttribute('stroke-width', '1');
    bodyLayer.appendChild(dot);

    const markerLabel = document.createElementNS(SVG_NS, 'text');
    markerLabel.setAttribute('x', String(pos.x));
    markerLabel.setAttribute('y', String(pos.y + dotRadius + 6));
    markerLabel.setAttribute('text-anchor', 'middle');
    markerLabel.setAttribute('fill', '#ccc');
    markerLabel.setAttribute('font-size', isEarthSatellite ? '4' : '5');
    markerLabel.textContent = location.name;
    bodyLayer.appendChild(markerLabel);

    // Invisible hit area for click events
    const hitArea = document.createElementNS(SVG_NS, 'circle');
    hitArea.setAttribute('cx', String(pos.x));
    hitArea.setAttribute('cy', String(pos.y));
    hitArea.setAttribute('r', '10');
    hitArea.setAttribute('fill', 'transparent');
    hitArea.style.cursor = 'pointer';
    bodyLayer.appendChild(hitArea);

    // Click handler — checks conditions against latestGameData at click time
    hitArea.addEventListener('click', () => {
      if (!callbacks.onStartTrip) return;
      const gd = latestGameData;
      const s = getActiveShip(gd);
      const curLocId = s.location.dockedAt || s.location.orbitingAt || null;
      const inFlight = s.location.status === 'in_flight';
      const flightDest = inFlight
        ? (s.activeFlightPlan?.destination ?? null)
        : null;
      const canStart =
        !s.activeContract &&
        !s.miningRoute &&
        (s.location.status === 'docked' ||
          s.location.status === 'orbiting' ||
          s.location.status === 'in_flight');
      if (!canStart) return;
      if (location.id === curLocId || location.id === flightDest) return;
      const curKm = getShipPositionKm(s, gd.world);
      const vOrigin: WorldLocation = curLocId
        ? gd.world.locations.find((l) => l.id === curLocId)!
        : ({
            id: '__current_position__',
            name: 'Current Position',
            type: 'orbital' as const,
            description: '',
            distanceFromEarth: curKm,
            x: 0,
            y: 0,
            services: [] as WorldLocation['services'],
            size: 0,
            pilotingRequirement: 0,
          } as WorldLocation);
      if (!isLocationReachable(s, location, vOrigin)) return;
      callbacks.onStartTrip(location.id);
    });

    markerMap.set(location.id, { dot, label: markerLabel, hitArea });

    // --- Legend item ---
    const item = document.createElement('div');
    item.className = 'nav-legend-item';

    const name = document.createElement('strong');
    name.textContent = location.name;
    item.appendChild(name);

    // Service badges — static since services don't change
    const badgesContainer = document.createElement('div');
    badgesContainer.style.cssText =
      'display: flex; gap: 4px; flex-wrap: wrap; margin: 3px 0;';
    if (location.services.length > 0) {
      for (const svc of location.services) {
        const info = NAV_SERVICE_LABELS[svc];
        if (!info) continue;
        const badge = document.createElement('span');
        badge.style.cssText =
          'font-size: 0.7rem; padding: 1px 6px; border-radius: 3px; background: rgba(255,255,255,0.06); color: #aaa; border: 1px solid #444;';
        badge.textContent = `${info.icon} ${info.label}`;
        badgesContainer.appendChild(badge);
      }
    }
    item.appendChild(badgesContainer);

    const distance = document.createElement('div');
    item.appendChild(distance);

    const alignmentLine = document.createElement('div');
    alignmentLine.style.fontSize = '0.85em';
    alignmentLine.style.marginTop = '0.15rem';
    alignmentLine.style.display = 'none';
    item.appendChild(alignmentLine);

    const travelInfo = document.createElement('div');
    travelInfo.style.fontSize = '0.85em';
    travelInfo.style.color = '#4ade80';
    travelInfo.style.marginTop = '0.25rem';
    travelInfo.style.display = 'none';
    item.appendChild(travelInfo);

    const description = document.createElement('div');
    description.textContent = location.description;
    description.style.fontSize = '0.9em';
    description.style.color = '#aaa';
    item.appendChild(description);

    const riskLine = document.createElement('div');
    riskLine.style.marginTop = '6px';
    riskLine.style.display = 'none';
    item.appendChild(riskLine);

    const gravityWarning = document.createElement('div');
    gravityWarning.style.fontSize = '0.85em';
    gravityWarning.style.color = '#fbbf24';
    gravityWarning.style.marginTop = '0.25rem';
    gravityWarning.style.display = 'none';
    item.appendChild(gravityWarning);

    // Action area elements — all created once, visibility toggled
    const currentBadge = document.createElement('div');
    currentBadge.className = 'nav-current-label';
    currentBadge.textContent = 'Current Location';
    currentBadge.style.display = 'none';
    item.appendChild(currentBadge);

    const destBadge = document.createElement('div');
    destBadge.className = 'nav-current-label';
    destBadge.textContent = 'Destination';
    destBadge.style.display = 'none';
    item.appendChild(destBadge);

    const statusText = document.createElement('div');
    statusText.className = 'nav-travel-disabled-reason';
    statusText.style.display = 'none';
    item.appendChild(statusText);

    const travelButton = document.createElement('button');
    travelButton.className = 'nav-travel-button';
    travelButton.style.display = 'none';
    travelButton.addEventListener('click', () => {
      if (callbacks.onStartTrip) {
        callbacks.onStartTrip(location.id);
      }
    });
    item.appendChild(travelButton);

    const unreachableReason = document.createElement('div');
    unreachableReason.className = 'nav-travel-disabled-reason';
    unreachableReason.style.display = 'none';
    item.appendChild(unreachableReason);

    legend.appendChild(item);
    legendMap.set(location.id, {
      item,
      name,
      badgesContainer,
      distance,
      alignmentLine,
      travelInfo,
      description,
      riskLine,
      gravityWarning,
      currentBadge,
      destBadge,
      statusText,
      travelButton,
      unreachableReason,
    });
  }

  // --- Update function: patches refs in-place ---
  function update(gameData: GameData): void {
    latestGameData = gameData;
    estimateRefs = [];

    const ship = getActiveShip(gameData);

    const currentLocationId =
      ship.location.dockedAt || ship.location.orbitingAt || null;
    const currentKm = getShipPositionKm(ship, gameData.world);
    const isInFlight = ship.location.status === 'in_flight';
    const flightDestinationId = isInFlight
      ? (ship.activeFlightPlan?.destination ?? null)
      : null;
    const canStartTrips =
      !ship.activeContract &&
      !ship.miningRoute &&
      (ship.location.status === 'docked' ||
        ship.location.status === 'orbiting' ||
        ship.location.status === 'in_flight');

    const virtualOrigin: WorldLocation = currentLocationId
      ? gameData.world.locations.find((l) => l.id === currentLocationId)!
      : ({
          id: '__current_position__',
          name: 'Current Position',
          type: 'orbital' as const,
          description: '',
          distanceFromEarth: currentKm,
          x: 0,
          y: 0,
          services: [] as WorldLocation['services'],
          size: 0,
          pilotingRequirement: 0,
        } as WorldLocation);

    // Profile slider visibility
    if (canStartTrips) {
      updateFlightProfileControl(profileControl, ship);
      profileSlot.style.display = '';
    } else {
      profileSlot.style.display = 'none';
    }

    // Gravity-degraded crew (computed once, used per-location)
    const degradedCrew = ship.crew.filter(
      (c) => getGravityDegradationLevel(c.zeroGExposure) !== 'none'
    );

    for (const location of gameData.world.locations) {
      const refs = markerMap.get(location.id);
      const legendRefs = legendMap.get(location.id);
      if (!refs || !legendRefs) continue;

      const reachable = isLocationReachable(ship, location, virtualOrigin);
      const isCurrent = location.id === currentLocationId;
      const isFlightDest = location.id === flightDestinationId;
      const isOtherDestination = !isCurrent && !isFlightDest && reachable;

      // --- Update SVG marker position ---
      const svgPos = projectToSvg(location.x, location.y);
      const isEarthSat = location.orbital?.parentId === 'earth';
      const dotR =
        location.id === 'earth' || location.id === 'mars'
          ? 5
          : isEarthSat
            ? 2.5
            : 3.5;

      refs.dot.setAttribute('cx', String(svgPos.x));
      refs.dot.setAttribute('cy', String(svgPos.y));
      refs.label.setAttribute('x', String(svgPos.x));
      refs.label.setAttribute('y', String(svgPos.y + dotR + 6));
      refs.hitArea.setAttribute('cx', String(svgPos.x));
      refs.hitArea.setAttribute('cy', String(svgPos.y));

      // Visual state
      if (isCurrent || isFlightDest) {
        refs.dot.setAttribute('stroke', '#e94560');
        refs.dot.setAttribute('stroke-width', '2');
        refs.label.setAttribute('fill', '#fff');
      } else if (!reachable) {
        refs.dot.setAttribute('stroke', '#333');
        refs.dot.setAttribute('stroke-width', '1');
        refs.dot.setAttribute('opacity', '0.4');
        refs.label.setAttribute('fill', '#666');
        refs.label.setAttribute('opacity', '0.4');
      } else {
        refs.dot.setAttribute('stroke', '#0f3460');
        refs.dot.setAttribute('stroke-width', '1');
        refs.dot.removeAttribute('opacity');
        refs.label.setAttribute('fill', '#ccc');
        refs.label.removeAttribute('opacity');
      }

      // Threat coloring on the dot
      if (isOtherDestination) {
        const routeRisk = estimateRouteRisk(
          virtualOrigin,
          location,
          ship,
          gameData.world
        );
        const threatLevel = getThreatLevel(routeRisk);
        if (threatLevel === 'critical') {
          refs.dot.setAttribute('fill', '#f44336');
        } else if (threatLevel === 'danger') {
          refs.dot.setAttribute('fill', '#ff9800');
        } else if (threatLevel === 'caution') {
          refs.dot.setAttribute('fill', '#ffc107');
        } else {
          const template = getLocationTypeTemplate(location.type);
          refs.dot.setAttribute('fill', template.color ?? '#0f3460');
        }
      } else if (!isCurrent && !isFlightDest) {
        const template = getLocationTypeTemplate(location.type);
        refs.dot.setAttribute('fill', template.color ?? '#0f3460');
      }

      // --- Update legend item ---
      legendRefs.item.classList.toggle('unreachable', !reachable);

      // Distance (uses 2D Euclidean via getDistanceBetween)
      const distanceFromCurrent = getDistanceBetween(virtualOrigin, location);
      const distText =
        distanceFromCurrent < 0.5
          ? 'Current Location'
          : `Distance: ${formatDistance(distanceFromCurrent)}`;
      if (legendRefs.distance.textContent !== distText) {
        legendRefs.distance.textContent = distText;
      }

      // Launch window alignment
      if (isOtherDestination && virtualOrigin.orbital && location.orbital) {
        const window = computeLaunchWindow(
          virtualOrigin,
          location,
          gameData.gameTime,
          gameData.world
        );
        if (window) {
          const distRange = window.maxDistanceKm - window.minDistanceKm;
          const rangeRatio = distRange / Math.max(window.minDistanceKm, 1);
          // Only show alignment when distance variation exceeds 10%
          if (rangeRatio > 0.1) {
            const color = alignmentColor(window.alignment);
            const label =
              window.alignment.charAt(0).toUpperCase() +
              window.alignment.slice(1);
            let alignText = `Alignment: <span style="color:${color};font-weight:600">${label}</span>`;
            if (
              window.alignment !== 'excellent' &&
              window.nextOptimalInDays > 1
            ) {
              const nextOptDays = Math.round(window.nextOptimalInDays);
              alignText += ` | Next optimal: ${formatDualTime(nextOptDays * 86400)}`;
            }
            if (legendRefs.alignmentLine.innerHTML !== alignText) {
              legendRefs.alignmentLine.innerHTML = alignText;
            }
            legendRefs.alignmentLine.style.display = '';
          } else {
            legendRefs.alignmentLine.style.display = 'none';
          }
        } else {
          legendRefs.alignmentLine.style.display = 'none';
        }
      } else {
        legendRefs.alignmentLine.style.display = 'none';
      }

      // Travel info
      if (isOtherDestination) {
        const shipClass = getShipClass(ship.classId);
        if (shipClass) {
          try {
            const flight = initializeFlight(
              ship,
              virtualOrigin,
              location,
              false,
              ship.flightProfileBurnFraction
            );
            const travelTime = formatDualTime(flight.totalTime);
            const distanceKm = getDistanceBetween(virtualOrigin, location);
            const fuelCostKg = calculateTripFuelKg(
              ship,
              distanceKm,
              ship.flightProfileBurnFraction
            );
            const infoText = `\u23F1 Travel Time: ${travelTime} | \u26FD Fuel Cost: ~${formatFuelMass(fuelCostKg)}`;
            if (legendRefs.travelInfo.textContent !== infoText) {
              legendRefs.travelInfo.textContent = infoText;
            }
            legendRefs.travelInfo.style.display = '';

            estimateRefs.push({
              el: legendRefs.travelInfo,
              origin: virtualOrigin,
              destination: location,
            });
          } catch {
            legendRefs.travelInfo.style.display = 'none';
          }
        } else {
          legendRefs.travelInfo.style.display = 'none';
        }
      } else {
        legendRefs.travelInfo.style.display = 'none';
      }

      // Risk badge
      if (isOtherDestination) {
        const routeRisk = estimateRouteRisk(
          virtualOrigin,
          location,
          ship,
          gameData.world
        );
        const threatLevel = getThreatLevel(routeRisk);
        const narrative = getThreatNarrative(threatLevel);

        // renderThreatBadge returns a fresh element — replace content of riskLine
        // We use a single child approach: clear and append only when content changes
        const currentThreatAttr =
          legendRefs.riskLine.getAttribute('data-threat-cache');
        const newThreatKey = `${threatLevel}:${narrative}`;
        if (currentThreatAttr !== newThreatKey) {
          // Remove old badge children
          while (legendRefs.riskLine.firstChild) {
            legendRefs.riskLine.removeChild(legendRefs.riskLine.firstChild);
          }
          legendRefs.riskLine.appendChild(
            renderThreatBadge(threatLevel, narrative)
          );
          legendRefs.riskLine.setAttribute('data-threat-cache', newThreatKey);
        }
        legendRefs.riskLine.style.display = '';
      } else {
        legendRefs.riskLine.style.display = 'none';
      }

      // Gravity warning
      if (degradedCrew.length > 0 && isOtherDestination) {
        const warnText = `\u26A0\uFE0F ${degradedCrew.length} crew member${degradedCrew.length > 1 ? 's' : ''} with zero-g atrophy`;
        if (legendRefs.gravityWarning.textContent !== warnText) {
          legendRefs.gravityWarning.textContent = warnText;
        }
        legendRefs.gravityWarning.style.display = '';
      } else {
        legendRefs.gravityWarning.style.display = 'none';
      }

      // --- Action area: toggle visibility of the correct element ---
      // Hide all first
      legendRefs.currentBadge.style.display = 'none';
      legendRefs.destBadge.style.display = 'none';
      legendRefs.statusText.style.display = 'none';
      legendRefs.travelButton.style.display = 'none';
      legendRefs.unreachableReason.style.display = 'none';

      if (isCurrent) {
        legendRefs.currentBadge.style.display = '';
      } else if (isFlightDest) {
        legendRefs.destBadge.style.display = '';
      } else if (!canStartTrips) {
        // Active contract, route assignment, or mining route
        let reason: string;
        if (ship.activeContract || ship.routeAssignment) {
          reason = 'Contract in progress';
        } else if (ship.miningRoute) {
          reason = 'Mining route active';
        } else {
          reason = 'Unavailable';
        }
        if (legendRefs.statusText.textContent !== reason) {
          legendRefs.statusText.textContent = reason;
        }
        legendRefs.statusText.style.display = '';
      } else if (reachable && callbacks.onStartTrip) {
        const btnText = isInFlight
          ? `Redirect to ${location.name}`
          : `Travel to ${location.name}`;
        if (legendRefs.travelButton.textContent !== btnText) {
          legendRefs.travelButton.textContent = btnText;
        }
        legendRefs.travelButton.style.display = '';
      } else {
        // Unreachable
        const reason = getUnreachableReason(ship, location, virtualOrigin);
        if (reason) {
          if (legendRefs.unreachableReason.textContent !== reason) {
            legendRefs.unreachableReason.textContent = reason;
          }
          legendRefs.unreachableReason.style.display = '';
        }
      }
    }

    // --- Update flight trajectory line on orrery ---
    if (isInFlight && ship.activeFlightPlan) {
      const fp = ship.activeFlightPlan;
      // Use originPos and interceptPos if available, otherwise approximate from locations
      let originSvg: { x: number; y: number };
      let destSvg: { x: number; y: number };
      let shipSvg: { x: number; y: number };

      if (fp.originPos && fp.interceptPos && fp.shipPos) {
        originSvg = projectToSvg(fp.originPos.x, fp.originPos.y);
        destSvg = projectToSvg(fp.interceptPos.x, fp.interceptPos.y);
        shipSvg = projectToSvg(fp.shipPos.x, fp.shipPos.y);
      } else {
        // Legacy flight — approximate from location positions
        const originLoc = gameData.world.locations.find(
          (l) => l.id === fp.origin
        );
        const destLoc = gameData.world.locations.find(
          (l) => l.id === fp.destination
        );
        originSvg = originLoc
          ? projectToSvg(originLoc.x, originLoc.y)
          : { x: 0, y: 0 };
        destSvg = destLoc ? projectToSvg(destLoc.x, destLoc.y) : { x: 0, y: 0 };
        // Interpolate ship position
        const progress =
          fp.totalDistance > 0 ? fp.distanceCovered / fp.totalDistance : 0;
        shipSvg = {
          x: originSvg.x + (destSvg.x - originSvg.x) * progress,
          y: originSvg.y + (destSvg.y - originSvg.y) * progress,
        };
      }

      flightRefs.line.setAttribute('x1', String(originSvg.x));
      flightRefs.line.setAttribute('y1', String(originSvg.y));
      flightRefs.line.setAttribute('x2', String(destSvg.x));
      flightRefs.line.setAttribute('y2', String(destSvg.y));
      flightRefs.line.style.display = '';

      flightRefs.shipDot.setAttribute('cx', String(shipSvg.x));
      flightRefs.shipDot.setAttribute('cy', String(shipSvg.y));
      flightRefs.shipDot.style.display = '';
    } else {
      flightRefs.line.style.display = 'none';
      flightRefs.shipDot.style.display = 'none';
    }
  }

  // Initial render
  update(gameData);
  return { el: container, update };
}
