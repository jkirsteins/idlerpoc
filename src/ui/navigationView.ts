import type { GameData } from '../models';
import { getActiveShip } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import {
  isLocationReachable,
  getUnreachableReason,
  getDistanceBetween,
} from '../worldGen';
import { getGravityDegradationLevel } from '../gravitySystem';
import {
  estimateRouteRisk,
  getThreatLevel,
  getThreatNarrative,
} from '../encounterSystem';
import { renderThreatBadge } from './threatBadge';
import { getShipClass } from '../shipClasses';
import { getEngineDefinition } from '../engines';
import {
  initializeFlight,
  calculateFuelCost,
  computeMaxRange,
} from '../flightPhysics';
import { formatDualTime } from '../timeSystem';

export interface NavigationViewCallbacks {
  onToggleNavigation: () => void;
  onStartTrip?: (destinationId: string) => void;
}

function formatDistance(km: number): string {
  if (km === 0) return 'Current Location';
  if (km < 1000) return `${km} km`;
  if (km < 1_000_000) return `${(km / 1000).toFixed(1)}K km`;
  return `${(km / 1_000_000).toFixed(1)}M km`;
}

export function renderNavigationView(
  gameData: GameData,
  callbacks: NavigationViewCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const container = document.createElement('div');
  container.className = 'navigation-view';

  // Header
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

  // Map area
  const mapArea = document.createElement('div');
  mapArea.className = 'nav-map';

  // Get current location (either docked location or flight origin/destination)
  const currentLocationId =
    ship.location.dockedAt || ship.location.flight?.destination || 'earth';
  const currentLocation =
    gameData.world.locations.find((loc) => loc.id === currentLocationId) ||
    gameData.world.locations[0];

  const canStartTrips =
    ship.location.status === 'docked' && !ship.activeContract;

  for (const location of gameData.world.locations) {
    const marker = document.createElement('div');
    marker.className = 'nav-marker';
    marker.style.left = `${location.x}%`;
    marker.style.top = `${location.y}%`;

    const reachable = isLocationReachable(ship, location, currentLocation);

    if (location.id === currentLocationId) {
      marker.classList.add('current');
    }
    if (!reachable) {
      marker.classList.add('unreachable');
    }

    // Make clickable if we can start trips and location is reachable
    if (
      canStartTrips &&
      reachable &&
      location.id !== currentLocationId &&
      callbacks.onStartTrip
    ) {
      marker.classList.add('clickable');
      marker.addEventListener('click', () => {
        if (callbacks.onStartTrip) {
          callbacks.onStartTrip(location.id);
        }
      });
      marker.title = `Click to travel to ${location.name}`;
    }

    const template = getLocationTypeTemplate(location.type);
    const dot = document.createElement('div');
    dot.className = 'nav-marker-dot';
    dot.textContent = template.icon;

    // Threat-based marker coloring for reachable non-current locations
    if (reachable && location.id !== currentLocationId) {
      const routeRisk = estimateRouteRisk(
        currentLocation,
        location,
        ship,
        gameData.world
      );
      const threatLevel = getThreatLevel(routeRisk);
      if (threatLevel !== 'clear') {
        dot.setAttribute('data-threat', threatLevel);
      }
    }

    marker.appendChild(dot);

    const label = document.createElement('div');
    label.className = 'nav-marker-label';
    label.textContent = location.name;
    marker.appendChild(label);

    mapArea.appendChild(marker);
  }

  container.appendChild(mapArea);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'nav-legend';

  const legendTitle = document.createElement('h4');
  legendTitle.textContent = 'Locations';
  legend.appendChild(legendTitle);

  for (const location of gameData.world.locations) {
    const reachable = isLocationReachable(ship, location, currentLocation);

    const item = document.createElement('div');
    item.className = 'nav-legend-item';
    if (!reachable) {
      item.classList.add('unreachable');
    }

    const name = document.createElement('strong');
    name.textContent = location.name;
    item.appendChild(name);

    const distanceFromCurrent = Math.abs(
      location.distanceFromEarth - currentLocation.distanceFromEarth
    );
    const distance = document.createElement('div');
    distance.textContent = `Distance: ${formatDistance(distanceFromCurrent)}`;
    item.appendChild(distance);

    // Add travel time and fuel cost estimates for reachable non-current locations
    if (location.id !== currentLocationId && reachable) {
      const shipClass = getShipClass(ship.classId);
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      if (shipClass) {
        try {
          const flight = initializeFlight(
            ship,
            currentLocation,
            location,
            false
          );
          const travelTime = formatDualTime(flight.totalTime);

          const distanceKm = getDistanceBetween(currentLocation, location);
          const maxRangeKm = computeMaxRange(shipClass, engineDef);
          const fuelCost = calculateFuelCost(distanceKm, maxRangeKm);

          const travelInfo = document.createElement('div');
          travelInfo.style.fontSize = '0.85em';
          travelInfo.style.color = '#4ade80';
          travelInfo.style.marginTop = '0.25rem';
          travelInfo.innerHTML = `⏱ Travel Time: ${travelTime} | ⛽ Fuel Cost: ~${fuelCost.toFixed(1)}%`;
          item.appendChild(travelInfo);
        } catch {
          // Silently skip if travel estimate fails
        }
      }
    }

    const description = document.createElement('div');
    description.textContent = location.description;
    description.style.fontSize = '0.9em';
    description.style.color = '#aaa';
    item.appendChild(description);

    // Route risk threat badge for non-current locations
    if (location.id !== currentLocationId && reachable) {
      const routeRisk = estimateRouteRisk(
        currentLocation,
        location,
        ship,
        gameData.world
      );
      const threatLevel = getThreatLevel(routeRisk);
      const narrative = getThreatNarrative(threatLevel);

      const riskLine = document.createElement('div');
      riskLine.style.marginTop = '6px';
      riskLine.appendChild(renderThreatBadge(threatLevel, narrative));
      item.appendChild(riskLine);
    }

    // Gravity warning for degraded crew
    const degradedCrew = ship.crew.filter(
      (c) => getGravityDegradationLevel(c.zeroGExposure) !== 'none'
    );

    if (
      degradedCrew.length > 0 &&
      location.id !== currentLocationId &&
      reachable
    ) {
      const warning = document.createElement('div');
      warning.style.fontSize = '0.85em';
      warning.style.color = '#fbbf24';
      warning.style.marginTop = '0.25rem';
      warning.textContent = `⚠️ ${degradedCrew.length} crew member${degradedCrew.length > 1 ? 's' : ''} with zero-g atrophy`;
      item.appendChild(warning);
    }

    // Add travel button or status indicator
    if (location.id === currentLocationId) {
      // Current location badge
      const currentBadge = document.createElement('div');
      currentBadge.className = 'nav-current-label';
      currentBadge.textContent = 'Current Location';
      item.appendChild(currentBadge);
    } else if (!canStartTrips) {
      // Active contract, route assignment, or in-flight - show status
      const statusText = document.createElement('div');
      statusText.className = 'nav-travel-disabled-reason';

      if (ship.activeContract || ship.routeAssignment) {
        statusText.textContent = 'Contract in progress';
      } else if (ship.location.status === 'in_flight') {
        statusText.textContent = 'In flight';
      } else {
        statusText.textContent = 'Unavailable';
      }

      item.appendChild(statusText);
    } else if (reachable && callbacks.onStartTrip) {
      // Reachable - show travel button
      const travelButton = document.createElement('button');
      travelButton.className = 'nav-travel-button';
      travelButton.textContent = `Travel to ${location.name}`;
      travelButton.addEventListener('click', () => {
        if (callbacks.onStartTrip) {
          callbacks.onStartTrip(location.id);
        }
      });
      item.appendChild(travelButton);
    } else {
      // Unreachable - show reason
      const unreachableReason = getUnreachableReason(
        ship,
        location,
        currentLocation
      );
      if (unreachableReason) {
        const reasonText = document.createElement('div');
        reasonText.className = 'nav-travel-disabled-reason';
        reasonText.textContent = unreachableReason;
        item.appendChild(reasonText);
      }
    }

    legend.appendChild(item);
  }

  container.appendChild(legend);

  return container;
}
