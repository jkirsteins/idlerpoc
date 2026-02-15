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
import { setupMapZoomPan, type MapZoomPanControls } from './mapZoomPan';
import { getLocationPosition } from '../orbitalMechanics';
import {
  createOrreryVisualization,
  buildOrbitPath,
  projectToSvg,
  localOrbitalRadiusToSvg,
  projectToSvgLocal,
  computeClusterData,
  positionMarker,
  hideMarker,
  showMarker,
  type OrreryRefs,
  type MarkerRefs,
  type LabelEntry,
  deconflictLabels,
} from './orreryCore';
import { updateGravityAssistMarkers } from './orreryUpdate';

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

// SVG namespace
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Ship flight trajectory line and moving dot */
interface FlightLineRefs {
  line: SVGLineElement;
  shipDot: SVGCircleElement;
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

/**
 * Build cluster focus buttons for the orrery map.
 * Clicking a button switches to Focus mode for that cluster.
 */
function buildClusterButtons(
  locations: WorldLocation[],
  clusterChildrenMap: Map<string, string[]>,
  clusterParentIds: Set<string>,
  onFocusCluster: (parentId: string) => void
): HTMLElement | null {
  const bar = document.createElement('div');
  bar.className = 'nav-map-cluster-bar';

  for (const [parentId, childIds] of clusterChildrenMap) {
    if (childIds.length < 2) continue;
    if (!clusterParentIds.has(parentId)) continue;
    const parent = locations.find((l) => l.id === parentId);
    if (!parent) continue;

    const btn = document.createElement('button');
    btn.className = 'nav-map-btn';
    btn.textContent = `${parent.name} System`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onFocusCluster(parentId);
    });
    bar.appendChild(btn);
  }

  return bar.children.length > 0 ? bar : null;
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

  // --- Orrery mode: overview (solar system) or focus (cluster detail) ---
  type OrreryMode = { type: 'overview' } | { type: 'focus'; parentId: string };
  let orreryMode: OrreryMode = { type: 'overview' };

  // Cluster membership data — computed once at mount
  const {
    childrenMap: clusterChildrenMap,
    parentIds: clusterParentIds,
    memberIds: clusterMemberIds,
  } = computeClusterData(gameData.world.locations);

  // Cached SVG positions from most recent update tick (used by applySelection + hover)
  let cachedSvgPositions = new Map<
    string,
    { x: number; y: number; dotR: number }
  >();

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

  // Create orrery using shared visualization component
  const orreryRefs: OrreryRefs = createOrreryVisualization(
    gameData.world.locations,
    {
      mode: 'single-ship',
      showZoomControls: true,
      showClusterButtons: true,
    }
  );

  // Extract refs for Nav-specific use
  const svg = orreryRefs.svg;
  const overviewOrbitRings = orreryRefs.overviewRings;
  const localRings = orreryRefs.localRings;
  const sunDot = orreryRefs.sunDot;
  const sunLabel = orreryRefs.sunLabel;
  const bodyLayer = orreryRefs.layers.bodies;
  const focusParentDot = orreryRefs.focusParentDot;
  const focusParentLabel = orreryRefs.focusParentLabel;
  const flightLine = orreryRefs.flightLine;
  const shipDot = orreryRefs.shipDot;
  const flightRefs: FlightLineRefs = { line: flightLine, shipDot };
  const currentRing = orreryRefs.currentRing;
  const currentRingAnim = currentRing.children[0] as SVGAnimateElement;
  const destRing = orreryRefs.destRing;
  const selectionRing = orreryRefs.selectionRing;
  const assistMarkers = orreryRefs.assistMarkers;
  const MAX_LOCAL_RINGS = localRings.length;

  mapArea.appendChild(svg);

  const selectionOverlay = createSelectionOverlay(() => {
    selectedLocationId = null;
    applySelection();
  });
  mapArea.appendChild(selectionOverlay.wrapper);

  // Zoom/pan gesture handling (pinch, drag, wheel)
  const zoomControls: MapZoomPanControls = setupMapZoomPan(svg, mapArea);

  // Add legend toggle button to controls container
  const legendButton = document.createElement('button');
  legendButton.textContent = 'Legend';
  legendButton.className = 'nav-map-btn';
  // Insert at the beginning so it appears on the left
  zoomControls.controlsContainer.insertBefore(
    legendButton,
    zoomControls.controlsContainer.firstChild
  );

  // Create orrery legend panel (hidden by default)
  const orreryLegend = document.createElement('div');
  orreryLegend.className = 'nav-map-legend-panel';
  orreryLegend.style.display = 'none';

  // Ships section header
  const shipsHeader = document.createElement('div');
  shipsHeader.textContent = 'Ships';
  shipsHeader.style.fontWeight = 'bold';
  shipsHeader.style.marginBottom = '6px';
  shipsHeader.style.color = '#4a9eff';
  shipsHeader.style.fontSize = '11px';
  orreryLegend.appendChild(shipsHeader);

  // Ships list container (single ship for Nav tab)
  const shipsList = document.createElement('div');
  shipsList.style.marginBottom = '10px';
  orreryLegend.appendChild(shipsList);

  // Location types section header
  const typesHeader = document.createElement('div');
  typesHeader.textContent = 'Locations';
  typesHeader.style.fontWeight = 'bold';
  typesHeader.style.marginBottom = '6px';
  typesHeader.style.color = '#4a9eff';
  typesHeader.style.fontSize = '11px';
  typesHeader.style.borderTop = '1px solid #333';
  typesHeader.style.paddingTop = '8px';
  orreryLegend.appendChild(typesHeader);

  // Location types list (static, built once)
  const typesList = document.createElement('div');
  orreryLegend.appendChild(typesList);

  // Build location types list
  const worldTypes = new Set(gameData.world.locations.map((loc) => loc.type));
  for (const typeName of worldTypes) {
    const template = getLocationTypeTemplate(typeName);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.padding = '2px 0';
    row.style.whiteSpace = 'nowrap';

    // Colored circle indicator
    const circle = document.createElement('div');
    circle.style.width = '8px';
    circle.style.height = '8px';
    circle.style.borderRadius = '50%';
    circle.style.background = template.color ?? '#0f3460';
    circle.style.flexShrink = '0';
    row.appendChild(circle);

    // Type name
    const name = document.createElement('span');
    name.textContent = template.name ?? typeName;
    name.style.color = '#ccc';
    row.appendChild(name);

    typesList.appendChild(row);
  }

  mapArea.appendChild(orreryLegend);

  // Toggle legend visibility
  let legendVisible = false;
  legendButton.addEventListener('click', () => {
    legendVisible = !legendVisible;
    orreryLegend.style.display = legendVisible ? 'block' : 'none';
    legendButton.style.fontWeight = legendVisible ? 'bold' : 'normal';
  });

  // Cluster focus buttons (e.g. "Earth System") — switches to focus mode
  const clusterBar = buildClusterButtons(
    gameData.world.locations,
    clusterChildrenMap,
    clusterParentIds,
    (parentId) => switchToFocus(parentId)
  );
  if (clusterBar) mapArea.appendChild(clusterBar);

  // Back-to-overview button (hidden by default, shown in focus mode)
  const backToOverviewBtn = document.createElement('button');
  backToOverviewBtn.className = 'nav-map-btn nav-map-back-btn';
  backToOverviewBtn.textContent = '\u2190 Overview';
  backToOverviewBtn.style.display = 'none';
  backToOverviewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToOverview();
  });
  mapArea.appendChild(backToOverviewBtn);

  // Focus mode title (e.g. "Earth System") — hidden by default
  const focusTitle = document.createElement('div');
  focusTitle.className = 'nav-map-focus-title';
  focusTitle.style.display = 'none';
  mapArea.appendChild(focusTitle);

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
  const markerMap = orreryRefs.markerMap; // Use shared marker map
  const legendMap = new Map<string, LegendItemRefs>();

  for (const location of gameData.world.locations) {
    // --- SVG marker ---
    const pos = projectToSvg(location.x, location.y);

    const template = getLocationTypeTemplate(location.type);
    const isClusterChild = clusterMemberIds.has(location.id);
    const isClusterParent = clusterParentIds.has(location.id);
    const dotRadius =
      location.type === 'planet' ? 5 : isClusterChild ? 2.5 : 3.5;

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(pos.x));
    dot.setAttribute('cy', String(pos.y));
    dot.setAttribute('r', String(dotRadius));
    dot.setAttribute('fill', template.color ?? '#0f3460');
    dot.setAttribute('stroke', '#0f3460');
    dot.setAttribute('stroke-width', '1');
    bodyLayer.appendChild(dot);

    // Cluster indicator ring on parent dots (dashed, pulsing)
    let clusterIndicator: SVGCircleElement | null = null;
    if (isClusterParent) {
      clusterIndicator = document.createElementNS(SVG_NS, 'circle');
      clusterIndicator.setAttribute('cx', String(pos.x));
      clusterIndicator.setAttribute('cy', String(pos.y));
      clusterIndicator.setAttribute('r', String(dotRadius + 4));
      clusterIndicator.setAttribute('fill', 'none');
      clusterIndicator.setAttribute('stroke', '#4a9eff');
      clusterIndicator.setAttribute('stroke-width', '1');
      clusterIndicator.setAttribute('stroke-dasharray', '3,2');
      clusterIndicator.setAttribute('class', 'orrery-cluster-indicator');
      bodyLayer.appendChild(clusterIndicator);
    }

    // Leader line (connects dot to displaced label, hidden by default)
    const leaderLine = document.createElementNS(SVG_NS, 'line');
    leaderLine.setAttribute('stroke', '#4a6fa5');
    leaderLine.setAttribute('stroke-width', '0.3');
    leaderLine.setAttribute('stroke-opacity', '0.3');
    leaderLine.style.display = 'none';
    bodyLayer.appendChild(leaderLine);

    const markerLabel = document.createElementNS(SVG_NS, 'text');
    markerLabel.setAttribute('x', String(pos.x));
    markerLabel.setAttribute('y', String(pos.y + dotRadius + 6));
    markerLabel.setAttribute('text-anchor', 'middle');
    markerLabel.setAttribute('fill', '#ccc');
    markerLabel.setAttribute('font-size', '6');
    markerLabel.textContent = location.name;
    bodyLayer.appendChild(markerLabel);

    // Invisible hit area for click/hover events (15-unit radius for mobile)
    const hitArea = document.createElementNS(SVG_NS, 'circle');
    hitArea.setAttribute('cx', String(pos.x));
    hitArea.setAttribute('cy', String(pos.y));
    hitArea.setAttribute('r', '15');
    hitArea.setAttribute('fill', 'transparent');
    hitArea.style.cursor = 'pointer';
    bodyLayer.appendChild(hitArea);

    // Click handler — selects location or drills into cluster
    hitArea.addEventListener('click', () => {
      if (orreryMode.type === 'overview' && clusterParentIds.has(location.id)) {
        switchToFocus(location.id);
      } else {
        selectedLocationId = location.id;
        applySelection();
      }
    });

    // Hover feedback on desktop (dot stroke highlight only)
    hitArea.addEventListener('mouseenter', () => {
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
        dot.setAttribute('stroke', '#4a9eff');
        dot.setAttribute('stroke-width', '1');
      }
    });
    // mouseleave: stroke reset handled by update tick

    markerMap.set(location.id, {
      dot,
      label: markerLabel,
      hitArea,
      leaderLine,
      clusterIndicator,
    });

    // --- Legend item (compact card) ---
    const legendItem = createLegendItemDom(
      location,
      () => {
        // If this is a cluster child and we're in overview, switch to focus mode
        if (
          orreryMode.type === 'overview' &&
          clusterMemberIds.has(location.id)
        ) {
          const parentId = location.orbital?.parentId;
          if (parentId && clusterParentIds.has(parentId)) {
            selectedLocationId = location.id;
            switchToFocus(parentId);
            return;
          }
        }
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
    // Update SVG selection ring position using cached positions
    if (selectedLocationId) {
      const pos = cachedSvgPositions.get(selectedLocationId);
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

  /** Switch orrery to cluster Focus mode */
  function switchToFocus(parentId: string): void {
    orreryMode = { type: 'focus', parentId };
    // Preserve current zoom level
    const currentZoom = zoomControls.getCurrentZoom();
    zoomControls.zoomTo(0, 0, currentZoom, false);
    // Keep selection if it's in this cluster, otherwise clear
    const childIds = clusterChildrenMap.get(parentId) || [];
    if (
      selectedLocationId &&
      selectedLocationId !== parentId &&
      !childIds.includes(selectedLocationId)
    ) {
      selectedLocationId = null;
    }
    update(latestGameData);
    applySelection();
  }

  /** Switch orrery back to solar system Overview mode */
  function switchToOverview(): void {
    orreryMode = { type: 'overview' };
    // Preserve current zoom level
    const currentZoom = zoomControls.getCurrentZoom();
    zoomControls.zoomTo(0, 0, currentZoom, false);
    // If selected location was a hidden cluster child, select parent instead
    if (selectedLocationId && clusterMemberIds.has(selectedLocationId)) {
      const loc = latestGameData.world.locations.find(
        (l) => l.id === selectedLocationId
      );
      if (loc?.orbital?.parentId) {
        selectedLocationId = loc.orbital.parentId;
      }
    }
    update(latestGameData);
    applySelection();
  }

  /** Update flight trajectory visualization using overview (solar) projection */
  function updateFlightVizOverview(
    gd: GameData,
    ship: Ship,
    isInFlight: boolean
  ): void {
    if (isInFlight && ship.activeFlightPlan) {
      const fp = ship.activeFlightPlan;
      let originSvg: { x: number; y: number };
      let destSvg: { x: number; y: number };

      // Project trajectory endpoints to SVG coordinates with log scaling
      if (fp.originPos && fp.interceptPos) {
        originSvg = projectToSvg(fp.originPos.x, fp.originPos.y);
        destSvg = projectToSvg(fp.interceptPos.x, fp.interceptPos.y);
      } else {
        const originLoc = gd.world.locations.find((l) => l.id === fp.origin);
        const destLoc = gd.world.locations.find((l) => l.id === fp.destination);
        originSvg = originLoc
          ? projectToSvg(originLoc.x, originLoc.y)
          : { x: 0, y: 0 };
        destSvg = destLoc ? projectToSvg(destLoc.x, destLoc.y) : { x: 0, y: 0 };
      }

      // CRITICAL: Interpolate ship position in SVG space, not in linear km space!
      // With logarithmic radial scaling, projecting a linearly-interpolated km
      // position causes massive distortion (5% real progress can appear as 50%
      // visual progress). Always interpolate in the post-projection SVG space
      // so visual progress matches flight progress.
      const progress =
        fp.totalDistance > 0 ? fp.distanceCovered / fp.totalDistance : 0;
      const shipSvg = {
        x: originSvg.x + (destSvg.x - originSvg.x) * progress,
        y: originSvg.y + (destSvg.y - originSvg.y) * progress,
      };

      flightRefs.line.setAttribute('x1', String(originSvg.x));
      flightRefs.line.setAttribute('y1', String(originSvg.y));
      flightRefs.line.setAttribute('x2', String(destSvg.x));
      flightRefs.line.setAttribute('y2', String(destSvg.y));
      flightRefs.line.style.display = '';
      flightRefs.shipDot.setAttribute('cx', String(shipSvg.x));
      flightRefs.shipDot.setAttribute('cy', String(shipSvg.y));
      flightRefs.shipDot.style.display = '';

      // Update gravity assist markers
      updateGravityAssistMarkers(assistMarkers, fp, originSvg, destSvg, gd);
    } else {
      hideFlightViz();
    }
  }

  /** Update flight trajectory for focus mode — handle 3 scenarios */
  function updateFlightVizFocus(
    gd: GameData,
    ship: Ship,
    isInFlight: boolean,
    parentId: string,
    parentPos: { x: number; y: number }
  ): void {
    if (!isInFlight || !ship.activeFlightPlan) {
      hideFlightViz();
      return;
    }

    const fp = ship.activeFlightPlan;
    const childIds = clusterChildrenMap.get(parentId) || [];
    const isInCluster = (id: string) =>
      id === parentId || childIds.includes(id);
    const originInCluster = isInCluster(fp.origin);
    const destInCluster = isInCluster(fp.destination);

    if (!originInCluster && !destInCluster) {
      // Scenario C: flight entirely outside this cluster — hide
      hideFlightViz();
      return;
    }

    // For scenarios A and B, we need projected positions
    const getLocalPos = (locId: string): { x: number; y: number } => {
      const cached = cachedSvgPositions.get(locId);
      return cached ?? { x: 0, y: 0 };
    };

    const getEdgePos = (externalLocId: string): { x: number; y: number } => {
      const extLoc = gd.world.locations.find((l) => l.id === externalLocId);
      if (!extLoc) return { x: 0, y: 0 };
      const extPos = getLocationPosition(extLoc, gd.gameTime, gd.world);
      const angle = Math.atan2(extPos.y - parentPos.y, extPos.x - parentPos.x);
      return { x: 185 * Math.cos(angle), y: 185 * Math.sin(angle) };
    };

    let originSvg: { x: number; y: number };
    let destSvg: { x: number; y: number };

    if (originInCluster && destInCluster) {
      // Scenario A: local flight
      originSvg = getLocalPos(fp.origin);
      destSvg = getLocalPos(fp.destination);
    } else if (originInCluster) {
      // Scenario B: leaving the cluster
      originSvg = getLocalPos(fp.origin);
      destSvg = getEdgePos(fp.destination);
    } else {
      // Scenario B: arriving into the cluster
      originSvg = getEdgePos(fp.origin);
      destSvg = getLocalPos(fp.destination);
    }

    flightRefs.line.setAttribute('x1', String(originSvg.x));
    flightRefs.line.setAttribute('y1', String(originSvg.y));
    flightRefs.line.setAttribute('x2', String(destSvg.x));
    flightRefs.line.setAttribute('y2', String(destSvg.y));
    flightRefs.line.style.display = '';

    // Ship dot position: interpolate in SVG space (post-projection) to match
    // visual progress with flight progress. Projecting a linear km position
    // causes logarithmic distortion.
    const progress =
      fp.totalDistance > 0 ? fp.distanceCovered / fp.totalDistance : 0;
    flightRefs.shipDot.setAttribute(
      'cx',
      String(originSvg.x + (destSvg.x - originSvg.x) * progress)
    );
    flightRefs.shipDot.setAttribute(
      'cy',
      String(originSvg.y + (destSvg.y - originSvg.y) * progress)
    );
    flightRefs.shipDot.style.display = '';

    // Hide assist markers in focus mode for simplicity
    for (const marker of assistMarkers) {
      marker.halo.style.display = 'none';
      marker.diamond.style.display = 'none';
    }
  }

  /** Hide all flight visualization elements */
  function hideFlightViz(): void {
    flightRefs.line.style.display = 'none';
    flightRefs.shipDot.style.display = 'none';
    for (const marker of assistMarkers) {
      marker.halo.style.display = 'none';
      marker.diamond.style.display = 'none';
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

    if (orreryMode.type === 'overview') {
      updateOverview(ctx);
    } else {
      updateFocus(ctx, orreryMode.parentId);
    }

    // Update selection overlay every tick (distances/alignment change with orbits)
    updateSelectionOverlay(selectionOverlay, selectedLocationId, ctx);
  }

  /** Update in Overview mode — solar system view, clusters collapsed */
  function updateOverview(ctx: UpdateCtx): void {
    const {
      gd,
      ship,
      virtualOrigin,
      currentLocationId,
      flightDestinationId,
      isInFlight,
    } = ctx;
    // Show overview UI
    sunDot.style.display = '';
    sunLabel.style.display = '';
    for (const ring of overviewOrbitRings) ring.style.display = '';
    if (clusterBar) clusterBar.style.display = '';

    // Hide focus UI
    focusParentDot.style.display = 'none';
    focusParentLabel.style.display = 'none';
    for (const ring of localRings) ring.style.display = 'none';
    backToOverviewBtn.style.display = 'none';
    focusTitle.style.display = 'none';

    // Compute positions and deconfliction for visible locations
    const labelEntries: LabelEntry[] = [];
    const svgPositions = new Map<
      string,
      { x: number; y: number; dotR: number }
    >();

    for (const location of gd.world.locations) {
      const svgPos = projectToSvg(location.x, location.y);
      const isChild = clusterMemberIds.has(location.id);
      const dotR = location.type === 'planet' ? 5 : isChild ? 2.5 : 3.5;
      svgPositions.set(location.id, { ...svgPos, dotR });

      if (!isChild) {
        labelEntries.push({
          id: location.id,
          dotX: svgPos.x,
          dotY: svgPos.y,
          labelX: svgPos.x,
          labelY: svgPos.y + dotR + 6,
        });
      }
    }

    deconflictLabels(labelEntries);

    const labelPositions = new Map<string, { x: number; y: number }>();
    for (const entry of labelEntries) {
      labelPositions.set(entry.id, { x: entry.labelX, y: entry.labelY });
    }

    // Cache positions for applySelection and hover
    cachedSvgPositions = svgPositions;

    // Update pulsing rings — consolidate to avoid overlapping rings at same position
    // Priority: currentRing (pulsing orange) > selectionRing (blue) > destRing (blue)
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

    // Destination ring — skip if current location already has a ring
    if (
      flightDestinationId &&
      !clusterMemberIds.has(flightDestinationId) &&
      flightDestinationId !== currentLocationId &&
      flightDestinationId !== selectedLocationId
    ) {
      const pos = svgPositions.get(flightDestinationId);
      if (pos) {
        destRing.setAttribute('cx', String(pos.x));
        destRing.setAttribute('cy', String(pos.y));
        destRing.setAttribute('r', String(pos.dotR + 4));
        destRing.style.display = '';
      } else {
        destRing.style.display = 'none';
      }
    } else {
      destRing.style.display = 'none';
    }

    // Selection ring — skip if current or destination ring already shown
    if (
      selectedLocationId &&
      !clusterMemberIds.has(selectedLocationId) &&
      selectedLocationId !== currentLocationId
    ) {
      const pos = svgPositions.get(selectedLocationId);
      if (pos) {
        selectionRing.setAttribute('cx', String(pos.x));
        selectionRing.setAttribute('cy', String(pos.y));
        selectionRing.setAttribute('r', String(pos.dotR + 5));
        selectionRing.style.display = '';
      } else {
        selectionRing.style.display = 'none';
      }
    } else {
      selectionRing.style.display = 'none';
    }

    // Per-location update
    for (const location of gd.world.locations) {
      const refs = markerMap.get(location.id);
      const legendRefs = legendMap.get(location.id);
      if (!refs || !legendRefs) continue;

      const isChild = clusterMemberIds.has(location.id);

      if (isChild) {
        // Hide cluster children markers in overview, but keep legend visible
        hideMarker(refs);
        legendRefs.item.style.display = '';
        updateLegendItem(location, legendRefs, ctx);
        continue;
      }

      // Show this location
      showMarker(refs);
      legendRefs.item.style.display = '';

      const svgPos = svgPositions.get(location.id)!;
      const labelPos = labelPositions.get(location.id)!;
      positionMarker(refs, svgPos, labelPos, svgPos.dotR);

      // Cluster indicator ring on parents
      if (refs.clusterIndicator) {
        refs.clusterIndicator.setAttribute('cx', String(svgPos.x));
        refs.clusterIndicator.setAttribute('cy', String(svgPos.y));
        refs.clusterIndicator.style.display = '';
      }

      const reachable = isLocationReachable(ship, location, virtualOrigin);
      const isCurrent = location.id === currentLocationId;
      const isFlightDest = location.id === flightDestinationId;
      const isOtherDestination = !isCurrent && !isFlightDest && reachable;

      updateMarkerVisual(
        refs,
        location,
        isCurrent,
        isFlightDest,
        isOtherDestination,
        reachable,
        ctx
      );

      updateLegendItem(location, legendRefs, ctx);
    }

    // Update orrery legend ships section
    shipsList.innerHTML = '';
    const shipRow = document.createElement('div');
    shipRow.style.display = 'flex';
    shipRow.style.alignItems = 'center';
    shipRow.style.gap = '6px';
    shipRow.style.padding = '2px 0';
    shipRow.style.whiteSpace = 'nowrap';
    shipRow.style.fontWeight = 'bold';

    // Triangle indicator
    const triangle = document.createElement('div');
    triangle.style.width = '0';
    triangle.style.height = '0';
    triangle.style.borderLeft = '4px solid transparent';
    triangle.style.borderRight = '4px solid transparent';
    triangle.style.borderBottom = '7px solid #dc2626';
    triangle.style.flexShrink = '0';
    shipRow.appendChild(triangle);

    // Ship name
    const shipName = document.createElement('span');
    shipName.textContent = ship.name;
    shipName.style.color = '#dc2626';
    shipRow.appendChild(shipName);

    // Status
    const shipStatus = document.createElement('span');
    shipStatus.style.color = '#888';
    shipStatus.style.fontSize = '9px';
    shipStatus.style.marginLeft = '4px';
    if (isInFlight && flightDestinationId) {
      const destLoc = gd.world.locations.find(
        (l) => l.id === flightDestinationId
      );
      shipStatus.textContent = `→ ${destLoc?.name ?? 'Unknown'}`;
    } else if (currentLocationId) {
      const loc = gd.world.locations.find((l) => l.id === currentLocationId);
      shipStatus.textContent = `@ ${loc?.name ?? 'Unknown'}`;
    }
    shipRow.appendChild(shipStatus);

    shipsList.appendChild(shipRow);

    // Flight visualization (overview projection)
    updateFlightVizOverview(gd, ship, isInFlight);
  }

  /** Update in Focus mode — local cluster view */
  function updateFocus(ctx: UpdateCtx, parentId: string): void {
    const {
      gd,
      ship,
      virtualOrigin,
      currentLocationId,
      flightDestinationId,
      isInFlight,
    } = ctx;
    // Hide overview UI
    sunDot.style.display = 'none';
    sunLabel.style.display = 'none';
    for (const ring of overviewOrbitRings) ring.style.display = 'none';
    if (clusterBar) clusterBar.style.display = 'none';

    // Show focus UI
    backToOverviewBtn.style.display = '';
    focusTitle.style.display = '';

    const parentLoc = gd.world.locations.find((l) => l.id === parentId);
    if (!parentLoc) return;

    // Update focus title
    focusTitle.textContent = `${parentLoc.name} System`;

    // Focus parent dot at center
    focusParentDot.style.display = '';
    focusParentDot.setAttribute(
      'fill',
      getLocationTypeTemplate(parentLoc.type).color ?? '#4fc3f7'
    );
    focusParentDot.setAttribute('stroke', '#fff');
    focusParentDot.setAttribute('stroke-width', '1');
    focusParentLabel.style.display = '';
    focusParentLabel.textContent = parentLoc.name;

    // Gather cluster children and compute local log bounds
    const childIds = clusterChildrenMap.get(parentId) || [];
    const children = childIds
      .map((id) => gd.world.locations.find((l) => l.id === id))
      .filter((l): l is WorldLocation => l !== undefined);

    const radii = children.map((c) => c.orbital!.orbitalRadiusKm);
    const logMin = Math.log10(Math.min(...radii));
    const logMax = Math.log10(Math.max(...radii));

    // Configure local orbit rings — unique (radius, eccentricity) pairs
    const localOrbitMap = new Map<string, { a: number; e: number }>();
    for (const c of children) {
      const a = c.orbital!.orbitalRadiusKm;
      const e = c.orbital!.eccentricity ?? 0;
      const key = `${a}:${e}`;
      if (!localOrbitMap.has(key)) localOrbitMap.set(key, { a, e });
    }
    const localOrbits = [...localOrbitMap.values()].sort((a, b) => a.a - b.a);
    const localLogMin = logMin;
    const localLogMax = logMax;
    for (let i = 0; i < MAX_LOCAL_RINGS; i++) {
      if (i < localOrbits.length) {
        const { a, e } = localOrbits[i];
        const toSvg = (r: number) =>
          localOrbitalRadiusToSvg(r, localLogMin, localLogMax);
        localRings[i].setAttribute('d', buildOrbitPath(a, e, toSvg));
        localRings[i].style.display = '';
      } else {
        localRings[i].style.display = 'none';
      }
    }

    // Parent position for local projection
    const parentPos = getLocationPosition(parentLoc, gd.gameTime, gd.world);

    // Compute local SVG positions
    const svgPositions = new Map<
      string,
      { x: number; y: number; dotR: number }
    >();
    const labelEntries: LabelEntry[] = [];

    // Parent at center
    svgPositions.set(parentId, { x: 0, y: 0, dotR: 8 });

    for (const child of children) {
      const satPos = getLocationPosition(child, gd.gameTime, gd.world);
      const localSvg = projectToSvgLocal(parentPos, satPos, logMin, logMax);
      const dotR = 3.5;
      svgPositions.set(child.id, { ...localSvg, dotR });
      labelEntries.push({
        id: child.id,
        dotX: localSvg.x,
        dotY: localSvg.y,
        labelX: localSvg.x,
        labelY: localSvg.y + dotR + 6,
      });
    }

    deconflictLabels(labelEntries);

    const labelPositions = new Map<string, { x: number; y: number }>();
    for (const entry of labelEntries) {
      labelPositions.set(entry.id, { x: entry.labelX, y: entry.labelY });
    }

    // Cache positions
    cachedSvgPositions = svgPositions;

    // Pulsing rings — consolidate to avoid overlapping rings at same position
    // Priority: currentRing (pulsing orange) > selectionRing (blue) > destRing (blue)
    if (currentLocationId) {
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

    // Destination ring — skip if current location already has a ring
    if (
      flightDestinationId &&
      flightDestinationId !== currentLocationId &&
      flightDestinationId !== selectedLocationId
    ) {
      const pos = svgPositions.get(flightDestinationId);
      if (pos) {
        destRing.setAttribute('cx', String(pos.x));
        destRing.setAttribute('cy', String(pos.y));
        destRing.setAttribute('r', String(pos.dotR + 4));
        destRing.style.display = '';
      } else {
        destRing.style.display = 'none';
      }
    } else {
      destRing.style.display = 'none';
    }

    // Selection ring — skip if current or destination ring already shown
    if (selectedLocationId && selectedLocationId !== currentLocationId) {
      const pos = svgPositions.get(selectedLocationId);
      if (pos) {
        selectionRing.setAttribute('cx', String(pos.x));
        selectionRing.setAttribute('cy', String(pos.y));
        selectionRing.setAttribute('r', String(pos.dotR + 5));
        selectionRing.style.display = '';
      } else {
        selectionRing.style.display = 'none';
      }
    } else {
      selectionRing.style.display = 'none';
    }

    // Per-location update
    for (const location of gd.world.locations) {
      const refs = markerMap.get(location.id);
      const legendRefs = legendMap.get(location.id);
      if (!refs || !legendRefs) continue;

      const isParent = location.id === parentId;
      const isClusterChild = childIds.includes(location.id);

      if (!isParent && !isClusterChild) {
        // Hide non-cluster locations
        hideMarker(refs);
        legendRefs.item.style.display = 'none';
        continue;
      }

      if (isParent) {
        // Parent uses the dedicated focus dot — hide its regular marker
        hideMarker(refs);
        legendRefs.item.style.display = '';

        updateLegendItem(location, legendRefs, ctx);
        continue;
      }

      // Cluster child — show and position using local projection
      showMarker(refs);
      legendRefs.item.style.display = '';

      // Use focus-mode dot size (all children same size in focus)
      refs.dot.setAttribute('r', '3.5');

      const svgPos = svgPositions.get(location.id)!;
      const labelPos = labelPositions.get(location.id)!;
      positionMarker(refs, svgPos, labelPos, svgPos.dotR);

      // Hide cluster indicator in focus mode
      if (refs.clusterIndicator) refs.clusterIndicator.style.display = 'none';

      const reachable = isLocationReachable(ship, location, virtualOrigin);
      const isCurrent = location.id === currentLocationId;
      const isFlightDest = location.id === flightDestinationId;
      const isOtherDestination = !isCurrent && !isFlightDest && reachable;

      updateMarkerVisual(
        refs,
        location,
        isCurrent,
        isFlightDest,
        isOtherDestination,
        reachable,
        ctx
      );

      updateLegendItem(location, legendRefs, ctx);
    }

    // Defensive: ensure all cluster indicators are hidden in focus mode
    for (const [, refs] of markerMap) {
      if (refs.clusterIndicator) {
        refs.clusterIndicator.style.display = 'none';
      }
    }

    // Flight visualization (focus projection)
    updateFlightVizFocus(gd, ship, isInFlight, parentId, parentPos);
  }

  // Initial render
  update(gameData);
  return { el: container, update };
}
