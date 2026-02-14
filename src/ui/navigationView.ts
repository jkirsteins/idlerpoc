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
  leaderLine: SVGLineElement; // connects dot to displaced label
  clusterIndicator: SVGCircleElement | null; // dashed ring on cluster parents
}

// SVG namespace
const SVG_NS = 'http://www.w3.org/2000/svg';
const ORRERY_SIZE = 400; // viewBox is -200..200
const ORRERY_HALF = ORRERY_SIZE / 2;

/** Minimum SVG-unit separation between label centers before repulsion kicks in */
const MIN_LABEL_SEPARATION = 14;
/** Displacement threshold before a leader line is shown */
const LEADER_LINE_THRESHOLD = 4;
/** Number of repulsion iterations per tick */
const DECONFLICT_ITERATIONS = 3;

/**
 * Generic label deconfliction — no location-specific layout logic.
 *
 * Design principle: the orrery must never contain location-specific layout
 * logic. All visual positioning derives from orbital data through generic
 * algorithms. Adding new locations to the world should "just work" without
 * any orrery-specific code changes.
 */
interface LabelEntry {
  id: string;
  dotX: number;
  dotY: number;
  labelX: number;
  labelY: number;
}

function deconflictLabels(entries: LabelEntry[]): void {
  for (let iter = 0; iter < DECONFLICT_ITERATIONS; iter++) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        const dx = b.labelX - a.labelX;
        const dy = b.labelY - a.labelY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_LABEL_SEPARATION && dist > 0.01) {
          // Push labels apart along the line connecting them
          const overlap = MIN_LABEL_SEPARATION - dist;
          const pushX = (dx / dist) * overlap * 0.5;
          const pushY = (dy / dist) * overlap * 0.5;
          a.labelX -= pushX;
          a.labelY -= pushY;
          b.labelX += pushX;
          b.labelY += pushY;
        } else if (dist <= 0.01) {
          // Labels exactly coincide — push radially outward from centroid
          const cx = (a.dotX + b.dotX) * 0.5;
          const cy = (a.dotY + b.dotY) * 0.5;
          const angleA = Math.atan2(a.dotY - cy, a.dotX - cx) + Math.PI * 0.1;
          const angleB = angleA + Math.PI;
          a.labelX += Math.cos(angleA) * MIN_LABEL_SEPARATION * 0.5;
          a.labelY += Math.sin(angleA) * MIN_LABEL_SEPARATION * 0.5;
          b.labelX += Math.cos(angleB) * MIN_LABEL_SEPARATION * 0.5;
          b.labelY += Math.sin(angleB) * MIN_LABEL_SEPARATION * 0.5;
        }
      }
    }
  }
  // Clamp to viewBox bounds
  const bound = ORRERY_HALF - 10;
  for (const e of entries) {
    e.labelX = Math.max(-bound, Math.min(bound, e.labelX));
    e.labelY = Math.max(-bound, Math.min(bound, e.labelY));
  }
}

/** Ship flight trajectory line and moving dot */
interface FlightLineRefs {
  line: SVGLineElement;
  shipDot: SVGCircleElement;
}

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

/**
 * Map a satellite's orbital radius (km from parent body) to SVG radius
 * for cluster Focus mode. Uses log scale across the LOCAL distance range.
 * Generic: works for any cluster given its log10 min/max orbital radii.
 */
function localOrbitalRadiusToSvg(
  radiusKm: number,
  logMin: number,
  logMax: number
): number {
  const logR = Math.log10(Math.max(radiusKm, 1));
  if (logMax - logMin < 0.01) return 105; // degenerate: all at same radius
  const t = (logR - logMin) / (logMax - logMin);
  return 30 + t * 150; // same 30..180 SVG range as overview
}

/**
 * Project a satellite position to SVG in cluster Focus mode.
 * Uses the real-time angle from parent body and a local log scale
 * for the radial distance.
 */
function projectToSvgLocal(
  parentPos: { x: number; y: number },
  satPos: { x: number; y: number },
  logMin: number,
  logMax: number
): { x: number; y: number } {
  const dx = satPos.x - parentPos.x;
  const dy = satPos.y - parentPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { x: 0, y: 0 };
  const angle = Math.atan2(dy, dx);
  const r = localOrbitalRadiusToSvg(dist, logMin, logMax);
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
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
 * Compute cluster membership from location orbital data.
 * Returns parent→children map and convenience sets.
 * Generic: any body with 2+ satellites (via parentId) forms a cluster.
 */
function computeClusterData(locations: WorldLocation[]): {
  childrenMap: Map<string, string[]>;
  parentIds: Set<string>;
  memberIds: Set<string>;
} {
  const childrenMap = new Map<string, string[]>();
  for (const loc of locations) {
    if (loc.orbital?.parentId) {
      const pid = loc.orbital.parentId;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(loc.id);
    }
  }
  // Only keep clusters with 2+ children
  const parentIds = new Set<string>();
  const memberIds = new Set<string>();
  for (const [parentId, childIds] of childrenMap) {
    if (childIds.length >= 2) {
      parentIds.add(parentId);
      for (const id of childIds) memberIds.add(id);
    }
  }
  return { childrenMap, parentIds, memberIds };
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
    btn.className = 'nav-map-cluster-btn';
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

/** Position a marker and its label, update leader line */
function positionMarker(
  refs: MarkerRefs,
  svgPos: { x: number; y: number },
  labelPos: { x: number; y: number },
  dotR: number
): void {
  refs.dot.setAttribute('cx', String(svgPos.x));
  refs.dot.setAttribute('cy', String(svgPos.y));
  refs.label.setAttribute('x', String(labelPos.x));
  refs.label.setAttribute('y', String(labelPos.y));
  refs.hitArea.setAttribute('cx', String(svgPos.x));
  refs.hitArea.setAttribute('cy', String(svgPos.y));

  const labelDx = labelPos.x - svgPos.x;
  const labelDy = labelPos.y - (svgPos.y + dotR + 6);
  const labelDisplacement = Math.sqrt(labelDx * labelDx + labelDy * labelDy);
  if (labelDisplacement > LEADER_LINE_THRESHOLD) {
    refs.leaderLine.setAttribute('x1', String(svgPos.x));
    refs.leaderLine.setAttribute('y1', String(svgPos.y));
    refs.leaderLine.setAttribute('x2', String(labelPos.x));
    refs.leaderLine.setAttribute('y2', String(labelPos.y - 3));
    refs.leaderLine.style.display = '';
  } else {
    refs.leaderLine.style.display = 'none';
  }
}

/** Hide a marker's SVG elements */
function hideMarker(refs: MarkerRefs): void {
  refs.dot.style.display = 'none';
  refs.label.style.display = 'none';
  refs.hitArea.style.display = 'none';
  refs.leaderLine.style.display = 'none';
  if (refs.clusterIndicator) refs.clusterIndicator.style.display = 'none';

  // Reset stale attributes to prevent visual artifacts if element becomes visible
  refs.dot.setAttribute('stroke', '#0f3460');
  refs.dot.setAttribute('stroke-width', '1');
  refs.dot.removeAttribute('opacity');
  refs.label.setAttribute('fill', '#ccc');
  refs.label.removeAttribute('opacity');
}

/** Show a marker's SVG elements */
function showMarker(refs: MarkerRefs): void {
  refs.dot.style.display = '';
  refs.label.style.display = '';
  refs.hitArea.style.display = '';
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

  // Orbit rings — one per unique Sun-orbiting radius (overview mode)
  const overviewOrbitRings: SVGCircleElement[] = [];
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
    overviewOrbitRings.push(ring);
  }

  // Focus-mode local orbit ring pool (max 8, hidden by default)
  const MAX_LOCAL_RINGS = 8;
  const localRings: SVGCircleElement[] = [];
  for (let i = 0; i < MAX_LOCAL_RINGS; i++) {
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '0');
    ring.setAttribute('cy', '0');
    ring.setAttribute('r', '0');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'rgba(74, 158, 255, 0.3)');
    ring.setAttribute('stroke-width', '0.5');
    ring.setAttribute('stroke-dasharray', '3,3');
    ring.style.display = 'none';
    ringLayer.appendChild(ring);
    localRings.push(ring);
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

  // Focus-mode parent dot at center (hidden by default)
  const focusParentDot = document.createElementNS(SVG_NS, 'circle');
  focusParentDot.setAttribute('cx', '0');
  focusParentDot.setAttribute('cy', '0');
  focusParentDot.setAttribute('r', '8');
  focusParentDot.setAttribute('fill', '#4fc3f7');
  focusParentDot.setAttribute('stroke', '#fff');
  focusParentDot.setAttribute('stroke-width', '1');
  focusParentDot.style.display = 'none';
  bodyLayer.appendChild(focusParentDot);

  const focusParentLabel = document.createElementNS(SVG_NS, 'text');
  focusParentLabel.setAttribute('x', '0');
  focusParentLabel.setAttribute('y', '14');
  focusParentLabel.setAttribute('text-anchor', 'middle');
  focusParentLabel.setAttribute('fill', '#fff');
  focusParentLabel.setAttribute('font-size', '7');
  focusParentLabel.style.display = 'none';
  bodyLayer.appendChild(focusParentLabel);

  // Flight trajectory layer (on top of rings, below labels)
  const flightLayer = document.createElementNS(SVG_NS, 'g');
  flightLayer.setAttribute('class', 'orrery-flights');
  svg.appendChild(flightLayer);

  // Flight line + ship dot (created once, updated each tick)
  const flightLine = document.createElementNS(SVG_NS, 'line');
  flightLine.setAttribute('stroke', '#dc2626');
  flightLine.setAttribute('stroke-width', '1');
  flightLine.setAttribute('stroke-dasharray', '4,2');
  flightLine.setAttribute('stroke-opacity', '0.6');
  flightLine.style.display = 'none';
  flightLayer.appendChild(flightLine);

  const shipDot = document.createElementNS(SVG_NS, 'circle');
  shipDot.setAttribute('r', '2');
  shipDot.setAttribute('fill', '#dc2626');
  shipDot.setAttribute('stroke', '#fff');
  shipDot.setAttribute('stroke-width', '0.5');
  shipDot.style.display = 'none';
  flightLayer.appendChild(shipDot);

  const flightRefs: FlightLineRefs = { line: flightLine, shipDot };

  // Current-location pulsing ring (visual prominence)
  const currentRing = document.createElementNS(SVG_NS, 'circle');
  currentRing.setAttribute('fill', 'none');
  currentRing.setAttribute('stroke', '#dc2626');
  currentRing.setAttribute('stroke-width', '1');
  currentRing.setAttribute('stroke-opacity', '0');
  currentRing.style.display = 'none';
  const currentRingAnim = document.createElementNS(SVG_NS, 'animate');
  currentRingAnim.setAttribute('attributeName', 'r');
  currentRingAnim.setAttribute('from', '6');
  currentRingAnim.setAttribute('to', '16');
  currentRingAnim.setAttribute('dur', '2s');
  currentRingAnim.setAttribute('repeatCount', 'indefinite');
  currentRing.appendChild(currentRingAnim);
  const currentRingOpacAnim = document.createElementNS(SVG_NS, 'animate');
  currentRingOpacAnim.setAttribute('attributeName', 'stroke-opacity');
  currentRingOpacAnim.setAttribute('values', '0.7;0');
  currentRingOpacAnim.setAttribute('dur', '2s');
  currentRingOpacAnim.setAttribute('repeatCount', 'indefinite');
  currentRing.appendChild(currentRingOpacAnim);
  flightLayer.appendChild(currentRing);

  // Destination glow ring (steady)
  const destRing = document.createElementNS(SVG_NS, 'circle');
  destRing.setAttribute('fill', 'none');
  destRing.setAttribute('stroke', '#4a9eff');
  destRing.setAttribute('stroke-width', '1.5');
  destRing.setAttribute('stroke-opacity', '0.6');
  destRing.setAttribute('r', '10');
  destRing.style.display = 'none';
  flightLayer.appendChild(destRing);

  // Selection highlight ring
  const selectionRing = document.createElementNS(SVG_NS, 'circle');
  selectionRing.setAttribute('fill', 'none');
  selectionRing.setAttribute('stroke', '#4a9eff');
  selectionRing.setAttribute('stroke-width', '2');
  selectionRing.setAttribute('stroke-opacity', '0.8');
  selectionRing.setAttribute('r', '12');
  selectionRing.style.display = 'none';
  flightLayer.appendChild(selectionRing);

  // Gravity assist markers pool (max 5 — created once, show/hide as needed)
  const MAX_ASSIST_MARKERS = 5;

  interface AssistMarkerRefs {
    halo: SVGCircleElement; // influence zone halo around body
    diamond: SVGPolygonElement; // marker on trajectory line
  }

  const assistMarkers: AssistMarkerRefs[] = [];
  for (let i = 0; i < MAX_ASSIST_MARKERS; i++) {
    const halo = document.createElementNS(SVG_NS, 'circle');
    halo.setAttribute('r', '10');
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', '#ffc107');
    halo.setAttribute('stroke-width', '1');
    halo.setAttribute('stroke-opacity', '0.5');
    halo.setAttribute('stroke-dasharray', '2,2');
    halo.style.display = 'none';
    flightLayer.appendChild(halo);

    const diamond = document.createElementNS(SVG_NS, 'polygon');
    diamond.setAttribute('fill', '#ffc107');
    diamond.setAttribute('stroke', '#fff');
    diamond.setAttribute('stroke-width', '0.3');
    diamond.style.display = 'none';
    flightLayer.appendChild(diamond);

    assistMarkers.push({ halo, diamond });
  }

  mapArea.appendChild(svg);

  const selectionOverlay = createSelectionOverlay(() => {
    selectedLocationId = null;
    applySelection();
  });
  mapArea.appendChild(selectionOverlay.wrapper);

  // Zoom/pan gesture handling (pinch, drag, wheel)
  const zoomControls: MapZoomPanControls = setupMapZoomPan(svg, mapArea);

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
  backToOverviewBtn.className = 'nav-map-cluster-btn nav-map-back-btn';
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
  const markerMap = new Map<string, MarkerRefs>();
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
    // Reset CSS zoom/pan
    zoomControls.zoomTo(0, 0, 1, false);
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
    // Reset CSS zoom/pan
    zoomControls.zoomTo(0, 0, 1, false);
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

      const assists = fp.gravityAssists || [];
      for (let i = 0; i < MAX_ASSIST_MARKERS; i++) {
        const marker = assistMarkers[i];
        if (i < assists.length) {
          const a = assists[i];
          const color =
            a.result === 'success'
              ? '#4caf50'
              : a.result === 'failure'
                ? '#f44336'
                : '#ffc107';
          const bodyLoc = gd.world.locations.find((l) => l.id === a.bodyId);
          if (bodyLoc) {
            const bodyPos = getLocationPosition(bodyLoc, gd.gameTime, gd.world);
            const bodySvg = projectToSvg(bodyPos.x, bodyPos.y);
            marker.halo.setAttribute('cx', String(bodySvg.x));
            marker.halo.setAttribute('cy', String(bodySvg.y));
            marker.halo.setAttribute('stroke', color);
            marker.halo.style.display = '';
          } else {
            marker.halo.style.display = 'none';
          }
          const dx = destSvg.x - originSvg.x;
          const dy = destSvg.y - originSvg.y;
          const mx = originSvg.x + dx * a.approachProgress;
          const my = originSvg.y + dy * a.approachProgress;
          const ds = 2.5;
          marker.diamond.setAttribute(
            'points',
            `${mx},${my - ds} ${mx + ds},${my} ${mx},${my + ds} ${mx - ds},${my}`
          );
          marker.diamond.setAttribute('fill', color);
          marker.diamond.style.display = '';
        } else {
          marker.halo.style.display = 'none';
          marker.diamond.style.display = 'none';
        }
      }
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

    // Configure local orbit rings
    const uniqueRadii = [...new Set(radii)].sort((a, b) => a - b);
    for (let i = 0; i < MAX_LOCAL_RINGS; i++) {
      if (i < uniqueRadii.length) {
        const r = localOrbitalRadiusToSvg(uniqueRadii[i], logMin, logMax);
        localRings[i].setAttribute('r', String(r));
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
