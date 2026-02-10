import type { GameData, WorldLocation } from '../models';
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
import { initializeFlight } from '../flightPhysics';
import { calculateTripFuelKg } from '../questGen';
import { formatDualTime } from '../timeSystem';
import type { Component } from './component';
import { formatFuelMass } from './fuelFormatting';
import {
  createFlightProfileControl,
  updateFlightProfileControl,
} from './flightProfileControl';

const NAV_SERVICE_LABELS: Record<string, { icon: string; label: string }> = {
  refuel: { icon: '⛽', label: 'Fuel' },
  trade: { icon: '🛒', label: 'Trade' },
  repair: { icon: '🔧', label: 'Repair' },
  hire: { icon: '👤', label: 'Hire' },
  mine: { icon: '⛏️', label: 'Mine' },
};

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

export function createNavigationView(
  gameData: GameData,
  callbacks: NavigationViewCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'navigation-view';

  // Persistent flight profile slider - created once, survives rebuilds
  const profileControl = createFlightProfileControl(gameData);

  // Track latest gameData for slider input handler
  let latestGameData = gameData;

  // Refs to travel estimate elements — updated in-place on slider drag
  // so we never call replaceChildren() during a touch gesture.
  let estimateRefs: {
    el: HTMLElement;
    origin: WorldLocation;
    destination: WorldLocation;
  }[] = [];

  // When slider changes, patch estimate text in-place (no DOM rebuild)
  profileControl.slider.addEventListener('input', () => {
    const ship = getActiveShip(latestGameData);
    const shipClass = getShipClass(ship.classId);
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    if (!shipClass) return;
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
        const maxRangeKm = computeMaxRange(shipClass, engineDef);
        const fuelCostKg = calculateFuelCost(distanceKm, maxRangeKm);
        ref.el.textContent = `⏱ Travel Time: ${travelTime} | ⛽ Fuel Cost: ~${formatFuelMass(fuelCostKg)}`;
      } catch {
        // skip if estimate fails
      }
    }
  });

  function rebuild(gameData: GameData) {
    latestGameData = gameData;
    estimateRefs = [];
    container.replaceChildren();
    const ship = getActiveShip(gameData);

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

    // Current location is only where the ship physically is (docked or orbiting)
    const currentLocationId =
      ship.location.dockedAt || ship.location.orbitingAt || null;
    // Reference location for distance calculations (includes flight destination as fallback)
    const referenceLocationId =
      currentLocationId || ship.activeFlightPlan?.destination || 'earth';
    const currentLocation =
      gameData.world.locations.find((loc) => loc.id === referenceLocationId) ||
      gameData.world.locations[0];

    const canStartTrips =
      (ship.location.status === 'docked' ||
        ship.location.status === 'orbiting') &&
      !ship.activeContract;

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

    // Flight profile slider — shown when ship can depart
    if (canStartTrips) {
      updateFlightProfileControl(profileControl, ship);
      container.appendChild(profileControl.el);
    }

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

      // Service badges
      if (location.services.length > 0) {
        const badges = document.createElement('div');
        badges.style.cssText =
          'display: flex; gap: 4px; flex-wrap: wrap; margin: 3px 0;';
        for (const svc of location.services) {
          const info = NAV_SERVICE_LABELS[svc];
          if (!info) continue;
          const badge = document.createElement('span');
          badge.style.cssText =
            'font-size: 0.7rem; padding: 1px 6px; border-radius: 3px; background: rgba(255,255,255,0.06); color: #aaa; border: 1px solid #444;';
          badge.textContent = `${info.icon} ${info.label}`;
          badges.appendChild(badge);
        }
        item.appendChild(badges);
      }

      const distanceFromCurrent = Math.abs(
        location.distanceFromEarth - currentLocation.distanceFromEarth
      );
      const distance = document.createElement('div');
      distance.textContent = `Distance: ${formatDistance(distanceFromCurrent)}`;
      item.appendChild(distance);

      // Add travel time and fuel cost estimates for reachable non-current locations
      if (location.id !== currentLocationId && reachable) {
        const shipClass = getShipClass(ship.classId);
        if (shipClass) {
          try {
            const flight = initializeFlight(
              ship,
              currentLocation,
              location,
              false,
              ship.flightProfileBurnFraction
            );
            const travelTime = formatDualTime(flight.totalTime);

            const distanceKm = getDistanceBetween(currentLocation, location);
            const fuelCostKg = calculateTripFuelKg(
              ship,
              distanceKm,
              ship.flightProfileBurnFraction
            );

            const travelInfo = document.createElement('div');
            travelInfo.style.fontSize = '0.85em';
            travelInfo.style.color = '#4ade80';
            travelInfo.style.marginTop = '0.25rem';
            travelInfo.textContent = `⏱ Travel Time: ${travelTime} | ⛽ Fuel Cost: ~${formatFuelMass(fuelCostKg)}`;
            item.appendChild(travelInfo);

            // Store ref for in-place update on slider drag
            estimateRefs.push({
              el: travelInfo,
              origin: currentLocation,
              destination: location,
            });
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
  }

  rebuild(gameData);
  return { el: container, update: rebuild };
}
