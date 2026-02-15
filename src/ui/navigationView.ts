import type { GameData, WorldLocation, Ship } from '../models';
import { getActiveShip } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import {
  isLocationReachable,
  getUnreachableReason,
  getDistanceBetween,
} from '../worldGen';
import { formatDistance } from '../formatting';
import {
  getShipPositionKm,
  estimateRouteRisk,
  getThreatLevel,
} from '../encounterSystem';
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
import { computeClusterData, type MarkerRefs } from './orreryCore';
import { createOrreryMap } from './orreryMap';
import { type ShipDisplayInfo } from './orreryUpdate';

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

/** Per-location refs for the legend item (compact card — no accordion) */
interface LegendItemRefs {
  item: HTMLElement;
  name: HTMLElement;
  distance: HTMLElement; // distance text (right-aligned in header row)
  badgesContainer: HTMLElement;
  travelInfo: HTMLElement;
  // Action area — all possible children, toggled via display
  currentBadge: HTMLElement;
  destBadge: HTMLElement;
  statusText: HTMLElement;
  travelButton: HTMLButtonElement;
  unreachableReason: HTMLElement;
}

/** Build ship display info for active ship */
function buildActiveShipInfo(gameData: GameData): ShipDisplayInfo {
  const ship = getActiveShip(gameData);
  return {
    shipId: ship.id,
    shipName: ship.name,
    color: '#dc2626', // Red for active ship in Nav tab
    locationId: ship.location.dockedAt || ship.location.orbitingAt || null,
    flightPlan: ship.activeFlightPlan || null,
    isActive: true,
  };
}

/** Shared context for update helpers — avoids passing 8+ parameters */
interface UpdateCtx {
  gd: GameData;
  ship: Ship;
  virtualOrigin: WorldLocation;
  canStartTrips: boolean;
  isInFlight: boolean;
  flightDestinationId: string | null;
  currentLocationId: string | null;
  estimateRefs: {
    el: HTMLElement;
    origin: WorldLocation;
    destination: WorldLocation;
  }[];
  onStartTrip?: (destinationId: string) => void;
}

/** Update legend item — compact card with distance, travel info, action */
function updateLegendItem(
  location: WorldLocation,
  legendRefs: LegendItemRefs,
  ctx: UpdateCtx
): void {
  const {
    ship,
    gd,
    virtualOrigin,
    canStartTrips,
    isInFlight,
    flightDestinationId,
    currentLocationId,
  } = ctx;
  const reachable = isLocationReachable(ship, location, virtualOrigin);
  const isCurrent = location.id === currentLocationId;
  const isFlightDest = location.id === flightDestinationId;
  const isOtherDestination = !isCurrent && !isFlightDest && reachable;

  legendRefs.item.classList.toggle('unreachable', !reachable);

  // Distance text
  const distanceFromCurrent = getDistanceBetween(virtualOrigin, location);
  const distText =
    distanceFromCurrent < 0.5 ? '\u2302' : formatDistance(distanceFromCurrent);
  if (legendRefs.distance.textContent !== distText) {
    legendRefs.distance.textContent = distText;
  }

  // Travel info (time + fuel) — compact card shows only basic estimate
  if (isOtherDestination) {
    const shipClass = getShipClass(ship.classId);
    if (shipClass) {
      try {
        const flight = initializeFlight(
          ship,
          virtualOrigin,
          location,
          false,
          ship.flightProfileBurnFraction,
          { gameTime: gd.gameTime, world: gd.world }
        );
        const travelTime = formatDualTime(flight.totalTime);
        const distanceKm = getDistanceBetween(virtualOrigin, location);
        const fuelCostKg = calculateTripFuelKg(
          ship,
          distanceKm,
          ship.flightProfileBurnFraction
        );
        const infoText = `\u23F1 ${travelTime} | \u26FD ~${formatFuelMass(fuelCostKg)}`;
        if (legendRefs.travelInfo.textContent !== infoText) {
          legendRefs.travelInfo.textContent = infoText;
        }
        legendRefs.travelInfo.style.display = '';
        ctx.estimateRefs.push({
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

  // Action area — toggle visibility
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
    let reason: string;
    if (ship.activeContract) {
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
  } else if (reachable && ctx.onStartTrip) {
    const btnText = isInFlight ? `Redirect to ${location.name}` : `Fly`;
    if (legendRefs.travelButton.textContent !== btnText) {
      legendRefs.travelButton.textContent = btnText;
    }
    legendRefs.travelButton.style.display = '';
  } else {
    const reason = getUnreachableReason(ship, location, virtualOrigin);
    if (reason) {
      if (legendRefs.unreachableReason.textContent !== reason) {
        legendRefs.unreachableReason.textContent = reason;
      }
      legendRefs.unreachableReason.style.display = '';
    }
  }
}

/** Update SVG marker appearance (visual state + threat coloring) */
function updateMarkerVisual(
  refs: MarkerRefs,
  location: WorldLocation,
  isCurrent: boolean,
  isFlightDest: boolean,
  isOtherDestination: boolean,
  reachable: boolean,
  ctx: UpdateCtx
): void {
  const { virtualOrigin, ship, gd } = ctx;
  if (isCurrent || isFlightDest) {
    refs.dot.setAttribute('stroke', '#dc2626');
    refs.dot.setAttribute('stroke-width', '1');
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

  if (isOtherDestination) {
    const routeRisk = estimateRouteRisk(
      virtualOrigin,
      location,
      ship,
      gd.world
    );
    const threatLevel = getThreatLevel(routeRisk);
    if (threatLevel === 'critical') refs.dot.setAttribute('fill', '#f44336');
    else if (threatLevel === 'danger') refs.dot.setAttribute('fill', '#ff9800');
    else if (threatLevel === 'caution')
      refs.dot.setAttribute('fill', '#ffc107');
    else
      refs.dot.setAttribute(
        'fill',
        getLocationTypeTemplate(location.type).color ?? '#0f3460'
      );
  } else if (!isCurrent && !isFlightDest) {
    refs.dot.setAttribute(
      'fill',
      getLocationTypeTemplate(location.type).color ?? '#0f3460'
    );
  }
}

/** Create legend item DOM — compact flat card (no accordion) */
function createLegendItemDom(
  location: WorldLocation,
  onSelect: () => void,
  onTravel: () => void
): LegendItemRefs {
  const item = document.createElement('div');
  item.className = 'nav-legend-item';
  item.style.cursor = 'pointer';

  // Header row: name + distance
  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

  const name = document.createElement('strong');
  name.textContent = location.name;
  headerRow.appendChild(name);

  const distance = document.createElement('span');
  distance.style.cssText =
    'margin-left: auto; font-size: 0.8em; color: #888; white-space: nowrap;';
  headerRow.appendChild(distance);

  item.appendChild(headerRow);

  // Service badges row
  const badgesContainer = document.createElement('div');
  badgesContainer.style.cssText =
    'display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px;';
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

  // Travel info (time + fuel cost)
  const travelInfo = document.createElement('div');
  travelInfo.style.cssText =
    'font-size: 0.8em; color: #4ade80; margin-top: 4px; white-space: nowrap; display: none;';
  item.appendChild(travelInfo);

  // Action area
  const currentBadge = document.createElement('div');
  currentBadge.className = 'nav-current-label';
  currentBadge.style.cssText = 'margin-top: 4px; display: none;';
  currentBadge.textContent = 'Current Location';
  item.appendChild(currentBadge);

  const destBadge = document.createElement('div');
  destBadge.className = 'nav-current-label';
  destBadge.style.cssText = 'margin-top: 4px; display: none;';
  destBadge.textContent = 'Destination';
  item.appendChild(destBadge);

  const statusText = document.createElement('div');
  statusText.className = 'nav-travel-disabled-reason';
  statusText.style.cssText = 'margin-top: 4px; display: none;';
  item.appendChild(statusText);

  const travelButton = document.createElement('button');
  travelButton.className = 'nav-travel-button nav-travel-button--compact';
  travelButton.style.display = 'none';
  travelButton.addEventListener('click', (e) => {
    e.stopPropagation();
    onTravel();
  });
  item.appendChild(travelButton);

  const unreachableReason = document.createElement('div');
  unreachableReason.className = 'nav-travel-disabled-reason';
  unreachableReason.style.cssText =
    'margin-top: 4px; font-size: 0.75em; display: none;';
  item.appendChild(unreachableReason);

  // Clicking card selects in orrery
  item.addEventListener('click', onSelect);

  return {
    item,
    name,
    distance,
    badgesContainer,
    travelInfo,
    currentBadge,
    destBadge,
    statusText,
    travelButton,
    unreachableReason,
  };
}

/** Per-overlay refs for the selection detail panel */
interface SelectionOverlayRefs {
  wrapper: HTMLElement;
  content: HTMLElement;
  headerName: HTMLElement;
  closeBtn: HTMLElement;
  infoRow: HTMLElement;
  overlayActionButton: HTMLButtonElement;
}

/** Create the selection overlay DOM — appended to orrery map area */
function createSelectionOverlay(onClose: () => void): SelectionOverlayRefs {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-selection-overlay';

  const content = document.createElement('div');
  content.className = 'nav-selection-overlay-content';
  content.style.display = 'none';

  // Single row: name | distance | button | X
  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const headerName = document.createElement('strong');
  headerName.style.cssText =
    'color: #d4850a; font-size: 0.95em; white-space: nowrap;';
  headerRow.appendChild(headerName);

  const infoRow = document.createElement('span');
  infoRow.style.cssText = 'font-size: 0.8em; color: #aaa; white-space: nowrap;';
  headerRow.appendChild(infoRow);

  const overlayActionButton = document.createElement('button');
  overlayActionButton.className =
    'nav-travel-button nav-travel-button--compact';
  overlayActionButton.style.cssText = 'margin-left: auto; white-space: nowrap;';
  headerRow.appendChild(overlayActionButton);

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText =
    'background: none; border: none; color: #888; cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1; flex-shrink: 0;';
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose();
  });
  headerRow.appendChild(closeBtn);
  content.appendChild(headerRow);

  wrapper.appendChild(content);
  return {
    wrapper,
    content,
    headerName,
    closeBtn,
    infoRow,
    overlayActionButton,
  };
}

/** Update overlay content for the selected location */
function updateSelectionOverlay(
  overlay: SelectionOverlayRefs,
  selectedLocationId: string | null,
  ctx: UpdateCtx
): void {
  if (!selectedLocationId) {
    overlay.content.style.display = 'none';
    return;
  }

  const location = ctx.gd.world.locations.find(
    (l) => l.id === selectedLocationId
  );
  if (!location) {
    overlay.content.style.display = 'none';
    return;
  }

  overlay.content.style.display = '';

  const {
    ship,
    virtualOrigin,
    canStartTrips,
    isInFlight,
    flightDestinationId,
    currentLocationId,
  } = ctx;
  const reachable = isLocationReachable(ship, location, virtualOrigin);
  const isCurrent = location.id === currentLocationId;
  const isFlightDest = location.id === flightDestinationId;

  // Header name
  if (overlay.headerName.textContent !== location.name) {
    overlay.headerName.textContent = location.name;
  }

  // Info row: distance only
  const distanceFromCurrent = getDistanceBetween(virtualOrigin, location);
  const distText =
    distanceFromCurrent < 0.5
      ? 'Current Location'
      : formatDistance(distanceFromCurrent);
  if (overlay.infoRow.textContent !== distText) {
    overlay.infoRow.textContent = distText;
  }

  // Action button — always visible, greyed out when not actionable
  const btn = overlay.overlayActionButton;
  if (isCurrent) {
    btn.textContent = 'Current location';
    btn.disabled = true;
    btn.title = '';
    btn.onclick = null;
  } else if (isFlightDest) {
    btn.textContent = 'En route';
    btn.disabled = true;
    btn.title = '';
    btn.onclick = null;
  } else if (!canStartTrips) {
    let reason: string;
    if (ship.activeContract) {
      reason = 'Contract in progress';
    } else if (ship.miningRoute) {
      reason = 'Mining route active';
    } else {
      reason = 'Unavailable';
    }
    btn.textContent = reason;
    btn.disabled = true;
    btn.title = '';
    btn.onclick = null;
  } else if (reachable && ctx.onStartTrip) {
    btn.textContent = isInFlight ? 'Redirect here' : 'Fly';
    btn.disabled = false;
    btn.title = '';
    const startTrip = ctx.onStartTrip;
    const locId = location.id;
    btn.onclick = (e) => {
      e.stopPropagation();
      startTrip(locId);
    };
  } else {
    const reason =
      getUnreachableReason(ship, location, virtualOrigin) || 'Unreachable';
    btn.textContent = reason;
    btn.disabled = true;
    btn.title = '';
    btn.onclick = null;
  }
}

export function createNavigationView(
  gameData: GameData,
  callbacks: NavigationViewCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'navigation-view';

  // Persistent flight profile slider — created once
  const profileControl = createFlightProfileControl(gameData);

  // Track latest gameData and UpdateCtx for handlers that close over them
  let latestGameData = gameData;
  let latestCtx: UpdateCtx | null = null;

  // Selection state — links map dots to legend cards
  let selectedLocationId: string | null = null;

  // Cluster membership data — computed once at mount
  const { memberIds: clusterMemberIds } = computeClusterData(
    gameData.world.locations
  );

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
        ref.el.textContent = `\u23F1 ${travelTime} | \u26FD ~${formatFuelMass(fuelCostKg)}`;
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

  container.appendChild(header);

  // Orrery SVG map area
  const mapArea = document.createElement('div');
  mapArea.className = 'nav-map';

  // Create orrery using unified map component
  const {
    component: orreryMapComponent,
    updateWithShips: updateOrreryWithShips,
    refs: orreryMapRefs,
  } = createOrreryMap(gameData, {
    ships: [buildActiveShipInfo(gameData)],
    showZoomControls: true,
    showClusterButtons: true,
    onLocationClick: (locationId, isClusterParent) => {
      if (isClusterParent) {
        // Clicking cluster parent in overview mode switches to focus
        // (handled by orreryMap)
      } else {
        // Clicking regular location selects it
        selectedLocationId = locationId;
        applySelection();
      }
    },
    onFocusChange: () => {
      // Mode change handled by orreryMap — just re-apply selection
      applySelection();
    },
  });

  // Extract refs for Nav-specific decorations
  const orreryRefs = orreryMapRefs.orreryRefs;
  const currentRing = orreryRefs.currentRing;
  const currentRingAnim = currentRing.children[0] as SVGAnimateElement;
  const destRing = orreryRefs.destRing;
  const selectionRing = orreryRefs.selectionRing;
  const assistMarkers = orreryRefs.assistMarkers;

  mapArea.appendChild(orreryMapComponent.el);

  const selectionOverlay = createSelectionOverlay(() => {
    selectedLocationId = null;
    applySelection();
  });
  mapArea.appendChild(selectionOverlay.wrapper);

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

  // --- Create per-location legend items ---
  // SVG markers are created by orreryMap — we just reference them for threat coloring
  const markerMap = orreryMapRefs.markerMap;
  const legendMap = new Map<string, LegendItemRefs>();

  // Setup marker hover handlers for threat coloring
  for (const [locationId, markerRefs] of markerMap) {
    const location = gameData.world.locations.find((l) => l.id === locationId);
    if (!location) continue;

    // Hover feedback on desktop (dot stroke highlight only)
    markerRefs.hitArea.addEventListener('mouseenter', () => {
      const ship = getActiveShip(latestGameData);
      const currentLocId =
        ship.location.dockedAt || ship.location.orbitingAt || null;
      const isInFlight = ship.location.status === 'in_flight';
      const flightDestId = isInFlight
        ? (ship.activeFlightPlan?.destination ?? null)
        : null;
      const isCurrent = location.id === currentLocId;
      const isDest = location.id === flightDestId;

      // Only override stroke if this is NOT current/destination (preserve red stroke)
      if (!isCurrent && !isDest) {
        markerRefs.dot.setAttribute('stroke', '#4a9eff');
        markerRefs.dot.setAttribute('stroke-width', '1');
      }
    });
    // mouseleave: stroke reset handled by update tick
  }

  for (const location of gameData.world.locations) {
    // Create legend item (compact card)
    const legendItem = createLegendItemDom(
      location,
      () => {
        selectedLocationId = location.id;
        applySelection();
      },
      () => {
        if (callbacks.onStartTrip) callbacks.onStartTrip(location.id);
      }
    );
    legend.appendChild(legendItem.item);
    legendMap.set(location.id, legendItem);
  }

  /** Apply selection state — highlight map dot + update overlay + highlight legend card */
  function applySelection(): void {
    // Update SVG selection ring position using positions from orreryMap
    if (selectedLocationId) {
      const svgPositions = orreryMapRefs.getLastSvgPositions();
      const pos = svgPositions.get(selectedLocationId);
      if (pos) {
        selectionRing.setAttribute('cx', String(pos.x));
        selectionRing.setAttribute('cy', String(pos.y));
        selectionRing.setAttribute('r', String(pos.dotR + 5));
        selectionRing.style.display = '';
      }
    } else {
      selectionRing.style.display = 'none';
    }

    // Toggle selected class on legend cards (no accordion — just highlight)
    for (const [locId, refs] of legendMap) {
      refs.item.classList.toggle(
        'nav-legend-item--selected',
        locId === selectedLocationId
      );
    }

    // Immediately update overlay (don't wait for next tick)
    if (latestCtx) {
      updateSelectionOverlay(selectionOverlay, selectedLocationId, latestCtx);
    } else if (!selectedLocationId) {
      selectionOverlay.content.style.display = 'none';
    }
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

    const ctx: UpdateCtx = {
      gd: gameData,
      ship,
      virtualOrigin,
      canStartTrips,
      isInFlight,
      flightDestinationId,
      currentLocationId,
      estimateRefs,
      onStartTrip: callbacks.onStartTrip,
    };

    // Store ctx for immediate overlay updates in applySelection()
    latestCtx = ctx;

    // Update orrery with current ship data
    updateOrreryWithShips(gameData, [buildActiveShipInfo(gameData)]);

    // Get SVG positions from orreryMap
    const svgPositions = orreryMapRefs.getLastSvgPositions();

    // Position current/dest/selection rings
    if (currentLocationId && !clusterMemberIds.has(currentLocationId)) {
      const pos = svgPositions.get(currentLocationId);
      if (pos) {
        currentRing.setAttribute('cx', String(pos.x));
        currentRing.setAttribute('cy', String(pos.y));
        currentRingAnim.setAttribute('from', String(pos.dotR + 2));
        currentRingAnim.setAttribute('to', String(pos.dotR + 12));
        currentRing.style.display = '';
      } else {
        currentRing.style.display = 'none';
      }
    } else {
      currentRing.style.display = 'none';
    }

    // Destination ring is now positioned by updateShipVisualization,
    // but Nav tab hides it in special cases (destination = current/selected location)
    if (
      flightDestinationId &&
      (flightDestinationId === currentLocationId ||
        flightDestinationId === selectedLocationId)
    ) {
      destRing.style.display = 'none';
    }

    // Hide gravity assist markers (they're shown on ship trajectory in overview mode)
    for (const marker of assistMarkers) {
      marker.halo.style.display = 'none';
      marker.diamond.style.display = 'none';
    }

    // Update marker threat coloring + legend items
    for (const location of gameData.world.locations) {
      const markerRefs = markerMap.get(location.id);
      const legendRefs = legendMap.get(location.id);
      if (!markerRefs || !legendRefs) continue;

      const reachable = isLocationReachable(ship, location, virtualOrigin);
      const isCurrent = location.id === currentLocationId;
      const isFlightDest = location.id === flightDestinationId;
      const isOtherDestination = !isCurrent && !isFlightDest && reachable;

      updateMarkerVisual(
        markerRefs,
        location,
        isCurrent,
        isFlightDest,
        isOtherDestination,
        reachable,
        ctx
      );

      updateLegendItem(location, legendRefs, ctx);
    }

    // Update selection overlay every tick (distances/alignment change with orbits)
    updateSelectionOverlay(selectionOverlay, selectedLocationId, ctx);
  }

  // Initial render
  update(gameData);
  return { el: container, update };
}
