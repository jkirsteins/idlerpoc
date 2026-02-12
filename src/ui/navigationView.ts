import type { GameData, WorldLocation, Quest, Ship } from '../models';
import { getActiveShip } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import {
  isLocationReachable,
  getUnreachableReason,
  getDistanceBetween,
} from '../worldGen';
import { formatDistance, formatCredits } from '../formatting';
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

const NAV_SERVICE_LABELS: Record<string, { icon: string; label: string }> = {
  refuel: { icon: '\u26FD', label: 'Fuel' },
  trade: { icon: '\uD83D\uDED2', label: 'Trade' },
  repair: { icon: '\uD83D\uDD27', label: 'Repair' },
  hire: { icon: '\uD83D\uDC64', label: 'Hire' },
  mine: { icon: '\u26CF\uFE0F', label: 'Mine' },
};

const QUEST_TYPE_ICONS: Record<string, string> = {
  delivery: '\uD83D\uDCE6',
  passenger: '\uD83D\uDC65',
  freight: '\uD83D\uDE9A',
  trade_route: '\uD83D\uDD04',
  rescue: '\uD83C\uDD98',
};

interface NavContractInfo {
  quest: Quest;
  relationship: 'from here' | 'to here';
  isActive: boolean;
}

function getContractsForLocation(
  locationId: string,
  gameData: GameData,
  ship: Ship
): NavContractInfo[] {
  const result: NavContractInfo[] = [];

  // Active contract
  if (ship.activeContract) {
    const q = ship.activeContract.quest;
    if (q.origin === locationId) {
      result.push({ quest: q, relationship: 'from here', isActive: true });
    } else if (q.destination === locationId) {
      result.push({ quest: q, relationship: 'to here', isActive: true });
    }
  }

  // Available contracts originating from this location
  const fromHere = gameData.availableQuests[locationId] || [];
  for (const q of fromHere) {
    result.push({ quest: q, relationship: 'from here', isActive: false });
  }

  // Available contracts destined for this location (from other origins)
  for (const [originId, quests] of Object.entries(gameData.availableQuests)) {
    if (originId === locationId) continue;
    for (const q of quests) {
      if (q.destination === locationId) {
        result.push({ quest: q, relationship: 'to here', isActive: false });
      }
    }
  }

  return result;
}

export interface NavigationViewCallbacks {
  onToggleNavigation: () => void;
  onStartTrip?: (destinationId: string) => void;
}

/** Per-location refs for the map marker */
interface MarkerRefs {
  marker: HTMLElement;
  dot: HTMLElement;
  label: HTMLElement;
}

/** Per-location refs for the legend item */
interface LegendItemRefs {
  item: HTMLElement;
  name: HTMLElement;
  badgesContainer: HTMLElement;
  distance: HTMLElement;
  travelInfo: HTMLElement;
  description: HTMLElement;
  riskLine: HTMLElement;
  gravityWarning: HTMLElement;
  contractsContainer: HTMLElement;
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

  // Map area
  const mapArea = document.createElement('div');
  mapArea.className = 'nav-map';
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
    // --- Marker ---
    const marker = document.createElement('div');
    marker.className = 'nav-marker';
    marker.style.left = `${location.x}%`;
    marker.style.top = `${location.y}%`;

    const template = getLocationTypeTemplate(location.type);
    const dot = document.createElement('div');
    dot.className = 'nav-marker-dot';
    dot.textContent = template.icon;
    marker.appendChild(dot);

    const markerLabel = document.createElement('div');
    markerLabel.className = 'nav-marker-label';
    markerLabel.textContent = location.name;
    marker.appendChild(markerLabel);

    // Click handler — checks conditions against latestGameData at click time
    marker.addEventListener('click', () => {
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

    mapArea.appendChild(marker);
    markerMap.set(location.id, { marker, dot, label: markerLabel });

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

    // Contracts container — compact contract lines, updated on tick
    const contractsContainer = document.createElement('div');
    contractsContainer.className = 'nav-contracts-summary';
    contractsContainer.style.display = 'none';
    item.appendChild(contractsContainer);

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
      travelInfo,
      description,
      contractsContainer,
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

      // --- Update marker ---
      refs.marker.classList.toggle('current', isCurrent || isFlightDest);
      refs.marker.classList.toggle('unreachable', !reachable);
      refs.marker.classList.toggle(
        'clickable',
        canStartTrips &&
          reachable &&
          !isCurrent &&
          !isFlightDest &&
          !!callbacks.onStartTrip
      );

      if (canStartTrips && reachable && !isCurrent && !isFlightDest) {
        refs.marker.title = isInFlight
          ? `Click to redirect to ${location.name}`
          : `Click to travel to ${location.name}`;
      } else {
        refs.marker.title = '';
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
        if (threatLevel !== 'clear') {
          refs.dot.setAttribute('data-threat', threatLevel);
        } else {
          refs.dot.removeAttribute('data-threat');
        }
      } else {
        refs.dot.removeAttribute('data-threat');
      }

      // --- Update legend item ---
      legendRefs.item.classList.toggle('unreachable', !reachable);

      // Distance
      const distanceFromCurrent = Math.abs(
        location.distanceFromEarth - currentKm
      );
      const distText =
        distanceFromCurrent < 0.5
          ? 'Current Location'
          : `Distance: ${formatDistance(distanceFromCurrent)}`;
      if (legendRefs.distance.textContent !== distText) {
        legendRefs.distance.textContent = distText;
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

      // Contracts relevant to this location
      const contracts = getContractsForLocation(location.id, gameData, ship);

      if (contracts.length > 0) {
        legendRefs.contractsContainer.style.display = '';

        const contractKey = contracts
          .map((c) => `${c.quest.id}:${c.isActive}:${c.relationship}`)
          .join('|');
        const prevKey = legendRefs.contractsContainer.getAttribute(
          'data-contracts-cache'
        );

        if (contractKey !== prevKey) {
          while (legendRefs.contractsContainer.firstChild) {
            legendRefs.contractsContainer.removeChild(
              legendRefs.contractsContainer.firstChild
            );
          }

          const cHeader = document.createElement('div');
          cHeader.style.cssText =
            'font-size: 0.8em; color: #4a9eff; margin-bottom: 4px; font-weight: 600;';
          cHeader.textContent = 'Contracts:';
          legendRefs.contractsContainer.appendChild(cHeader);

          for (const info of contracts) {
            const line = document.createElement('div');
            line.style.cssText =
              'font-size: 0.8em; color: #ccc; padding: 2px 0; display: flex; align-items: center; gap: 4px;';

            const icon = QUEST_TYPE_ICONS[info.quest.type] || '\u2753';

            const iconSpan = document.createElement('span');
            iconSpan.textContent = icon;
            line.appendChild(iconSpan);

            const titleSpan = document.createElement('span');
            titleSpan.style.cssText =
              'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            titleSpan.textContent = info.quest.title;
            line.appendChild(titleSpan);

            const paySpan = document.createElement('span');
            paySpan.style.cssText =
              'color: #4ade80; white-space: nowrap; font-size: 0.85em;';
            const totalPay =
              info.quest.paymentPerTrip > 0
                ? info.quest.paymentPerTrip
                : info.quest.paymentOnCompletion;
            paySpan.textContent = formatCredits(totalPay);
            line.appendChild(paySpan);

            if (info.isActive) {
              const badge = document.createElement('span');
              badge.style.cssText =
                'font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: #4a9eff; color: #fff; font-weight: 700;';
              badge.textContent = 'ACTIVE';
              line.appendChild(badge);
            } else {
              const relSpan = document.createElement('span');
              relSpan.style.cssText = 'font-size: 0.7em; color: #888;';
              relSpan.textContent = info.relationship;
              line.appendChild(relSpan);
            }

            legendRefs.contractsContainer.appendChild(line);
          }

          legendRefs.contractsContainer.setAttribute(
            'data-contracts-cache',
            contractKey
          );
        }
      } else {
        legendRefs.contractsContainer.style.display = 'none';
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
  }

  // Initial render
  update(gameData);
  return { el: container, update };
}
