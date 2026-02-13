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

/** Per-location refs for the SVG orrery marker */
interface MarkerRefs {
  dot: SVGCircleElement; // the body dot
  label: SVGTextElement; // name label
  hitArea: SVGCircleElement; // invisible click target
  leaderLine: SVGLineElement; // connects dot to displaced label
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
  summary: HTMLElement; // always-visible accordion header
  summaryDist: HTMLElement; // compact distance in summary
  chevron: HTMLElement; // expand/collapse indicator
  details: HTMLElement; // collapsible detail section
  name: HTMLElement;
  badgesContainer: HTMLElement;
  distance: HTMLElement;
  alignmentLine: HTMLElement; // launch window alignment badge
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

  // Selection state — links map dots to legend cards
  let selectedLocationId: string | null = null;

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

  // Current-location pulsing ring (visual prominence)
  const currentRing = document.createElementNS(SVG_NS, 'circle');
  currentRing.setAttribute('fill', 'none');
  currentRing.setAttribute('stroke', '#e94560');
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

  // SVG tooltip (single reusable group, positioned on hover/select)
  const tooltipGroup = document.createElementNS(SVG_NS, 'g');
  tooltipGroup.style.display = 'none';
  tooltipGroup.style.pointerEvents = 'none';
  const tooltipBg = document.createElementNS(SVG_NS, 'rect');
  tooltipBg.setAttribute('rx', '3');
  tooltipBg.setAttribute('ry', '3');
  tooltipBg.setAttribute('fill', 'rgba(10, 15, 30, 0.92)');
  tooltipBg.setAttribute('stroke', '#4a9eff');
  tooltipBg.setAttribute('stroke-width', '0.5');
  tooltipGroup.appendChild(tooltipBg);
  const tooltipName = document.createElementNS(SVG_NS, 'text');
  tooltipName.setAttribute('fill', '#fff');
  tooltipName.setAttribute('font-size', '6');
  tooltipName.setAttribute('font-weight', '600');
  tooltipGroup.appendChild(tooltipName);
  const tooltipDist = document.createElementNS(SVG_NS, 'text');
  tooltipDist.setAttribute('fill', '#aaa');
  tooltipDist.setAttribute('font-size', '5');
  tooltipGroup.appendChild(tooltipDist);
  const tooltipServices = document.createElementNS(SVG_NS, 'text');
  tooltipServices.setAttribute('fill', '#888');
  tooltipServices.setAttribute('font-size', '4.5');
  tooltipGroup.appendChild(tooltipServices);
  svg.appendChild(tooltipGroup);

  /** Position and show the SVG tooltip near a dot */
  function showTooltip(locId: string, svgPos: { x: number; y: number }): void {
    const loc = latestGameData.world.locations.find((l) => l.id === locId);
    if (!loc) return;

    const ship = getActiveShip(latestGameData);
    const curLocId = ship.location.dockedAt || ship.location.orbitingAt || null;
    const curKm = getShipPositionKm(ship, latestGameData.world);
    const virtualOrigin: WorldLocation = curLocId
      ? latestGameData.world.locations.find((l) => l.id === curLocId)!
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

    const dist = getDistanceBetween(virtualOrigin, loc);
    const distText = dist < 0.5 ? 'Current Location' : formatDistance(dist);

    tooltipName.textContent = loc.name;
    tooltipDist.textContent = distText;
    const svcText = loc.services
      .map((s) => NAV_SERVICE_LABELS[s]?.icon)
      .filter(Boolean)
      .join(' ');
    tooltipServices.textContent = svcText || '';

    // Position: flip based on quadrant
    const lineCount = svcText ? 3 : 2;
    const boxW = Math.max(loc.name.length * 4, distText.length * 3.5) + 12;
    const boxH = lineCount * 8 + 6;

    const above = svgPos.y > 0;
    const leftSide = svgPos.x > 0;
    const tx = leftSide ? svgPos.x - boxW - 5 : svgPos.x + 5;
    const ty = above ? svgPos.y - boxH - 5 : svgPos.y + 15;

    tooltipGroup.setAttribute('transform', `translate(${tx}, ${ty})`);
    tooltipBg.setAttribute('width', String(boxW));
    tooltipBg.setAttribute('height', String(boxH));
    tooltipName.setAttribute('x', '6');
    tooltipName.setAttribute('y', '10');
    tooltipDist.setAttribute('x', '6');
    tooltipDist.setAttribute('y', '20');
    if (svcText) {
      tooltipServices.setAttribute('x', '6');
      tooltipServices.setAttribute('y', '29');
    }

    tooltipGroup.style.display = '';
  }

  function hideTooltip(): void {
    tooltipGroup.style.display = 'none';
  }

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

    // Click handler — selects location (scrolls legend + highlights)
    hitArea.addEventListener('click', () => {
      selectedLocationId = location.id;
      applySelection();
    });

    // Hover feedback on desktop
    hitArea.addEventListener('mouseenter', () => {
      dot.setAttribute('stroke', '#4a9eff');
      dot.setAttribute('stroke-width', '2');
      const svgPos = projectToSvg(location.x, location.y);
      showTooltip(location.id, svgPos);
    });
    hitArea.addEventListener('mouseleave', () => {
      // Restore stroke based on selection/current/reachable state
      // The next tick update will correct it; for now just reset to default
      if (selectedLocationId !== location.id) {
        dot.setAttribute('stroke', '#0f3460');
        dot.setAttribute('stroke-width', '1');
      }
      hideTooltip();
    });

    markerMap.set(location.id, {
      dot,
      label: markerLabel,
      hitArea,
      leaderLine,
    });

    // --- Legend item (accordion: summary always visible, details toggled) ---
    const item = document.createElement('div');
    item.className = 'nav-legend-item';

    // Summary row — always visible, clickable to select
    const summary = document.createElement('div');
    summary.className = 'nav-legend-summary';
    summary.style.cursor = 'pointer';

    const summaryTop = document.createElement('div');
    summaryTop.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const chevron = document.createElement('span');
    chevron.className = 'nav-legend-chevron';
    chevron.textContent = '\u25B6'; // right-pointing triangle
    summaryTop.appendChild(chevron);

    const name = document.createElement('strong');
    name.textContent = location.name;
    summaryTop.appendChild(name);

    const summaryDist = document.createElement('span');
    summaryDist.style.cssText =
      'margin-left: auto; font-size: 0.8em; color: #888;';
    summaryTop.appendChild(summaryDist);

    summary.appendChild(summaryTop);

    // Service badges — static since services don't change
    const badgesContainer = document.createElement('div');
    badgesContainer.style.cssText =
      'display: flex; gap: 4px; flex-wrap: wrap; margin: 3px 0 0 18px;';
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
    summary.appendChild(badgesContainer);

    item.appendChild(summary);

    // Click on summary → select this location (and toggle expansion)
    summary.addEventListener('click', () => {
      selectedLocationId = location.id;
      applySelection();
    });

    // Details section — hidden by default, shown when selected
    const details = document.createElement('div');
    details.className = 'nav-legend-details';
    details.style.display = 'none';

    const distance = document.createElement('div');
    details.appendChild(distance);

    const alignmentLine = document.createElement('div');
    alignmentLine.style.fontSize = '0.85em';
    alignmentLine.style.marginTop = '0.15rem';
    alignmentLine.style.display = 'none';
    details.appendChild(alignmentLine);

    const travelInfo = document.createElement('div');
    travelInfo.style.fontSize = '0.85em';
    travelInfo.style.color = '#4ade80';
    travelInfo.style.marginTop = '0.25rem';
    travelInfo.style.display = 'none';
    details.appendChild(travelInfo);

    const description = document.createElement('div');
    description.textContent = location.description;
    description.style.fontSize = '0.9em';
    description.style.color = '#aaa';
    details.appendChild(description);

    // Contracts container — compact contract lines, updated on tick
    const contractsContainer = document.createElement('div');
    contractsContainer.className = 'nav-contracts-summary';
    contractsContainer.style.display = 'none';
    details.appendChild(contractsContainer);

    const riskLine = document.createElement('div');
    riskLine.style.marginTop = '6px';
    riskLine.style.display = 'none';
    details.appendChild(riskLine);

    const gravityWarning = document.createElement('div');
    gravityWarning.style.fontSize = '0.85em';
    gravityWarning.style.color = '#fbbf24';
    gravityWarning.style.marginTop = '0.25rem';
    gravityWarning.style.display = 'none';
    details.appendChild(gravityWarning);

    // Action area elements — all created once, visibility toggled
    const currentBadge = document.createElement('div');
    currentBadge.className = 'nav-current-label';
    currentBadge.textContent = 'Current Location';
    currentBadge.style.display = 'none';
    details.appendChild(currentBadge);

    const destBadge = document.createElement('div');
    destBadge.className = 'nav-current-label';
    destBadge.textContent = 'Destination';
    destBadge.style.display = 'none';
    details.appendChild(destBadge);

    const statusText = document.createElement('div');
    statusText.className = 'nav-travel-disabled-reason';
    statusText.style.display = 'none';
    details.appendChild(statusText);

    const travelButton = document.createElement('button');
    travelButton.className = 'nav-travel-button';
    travelButton.style.display = 'none';
    travelButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onStartTrip) {
        callbacks.onStartTrip(location.id);
      }
    });
    details.appendChild(travelButton);

    const unreachableReason = document.createElement('div');
    unreachableReason.className = 'nav-travel-disabled-reason';
    unreachableReason.style.display = 'none';
    details.appendChild(unreachableReason);

    item.appendChild(details);

    legend.appendChild(item);
    legendMap.set(location.id, {
      item,
      summary,
      summaryDist,
      chevron,
      details,
      name,
      badgesContainer,
      distance,
      alignmentLine,
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

  /** Apply selection state — highlight map dot + scroll/expand legend card */
  function applySelection(): void {
    // Update SVG selection ring position
    if (selectedLocationId) {
      const loc = latestGameData.world.locations.find(
        (l) => l.id === selectedLocationId
      );
      if (loc) {
        const svgPos = projectToSvg(loc.x, loc.y);
        selectionRing.setAttribute('cx', String(svgPos.x));
        selectionRing.setAttribute('cy', String(svgPos.y));
        selectionRing.style.display = '';
        showTooltip(selectedLocationId, svgPos);
      }
    } else {
      selectionRing.style.display = 'none';
      hideTooltip();
    }

    // Toggle accordion: expand selected, collapse others
    for (const [locId, refs] of legendMap) {
      const isSelected = locId === selectedLocationId;
      refs.item.classList.toggle('nav-legend-item--selected', isSelected);
      refs.details.style.display = isSelected ? '' : 'none';
      refs.chevron.textContent = isSelected ? '\u25BC' : '\u25B6';
    }

    // Scroll selected legend item into view
    if (selectedLocationId) {
      const refs = legendMap.get(selectedLocationId);
      if (refs) {
        refs.item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
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

    // Gravity-degraded crew (computed once, used per-location)
    const degradedCrew = ship.crew.filter(
      (c) => getGravityDegradationLevel(c.zeroGExposure) !== 'none'
    );

    // Collect label entries for deconfliction
    const labelEntries: LabelEntry[] = [];
    const svgPositions = new Map<
      string,
      { x: number; y: number; dotR: number }
    >();

    // First pass: compute SVG positions and dot radii
    for (const location of gameData.world.locations) {
      const svgPos = projectToSvg(location.x, location.y);
      const isEarthSat = location.orbital?.parentId === 'earth';
      const dotR =
        location.id === 'earth' || location.id === 'mars'
          ? 5
          : isEarthSat
            ? 2.5
            : 3.5;
      svgPositions.set(location.id, { ...svgPos, dotR });
      labelEntries.push({
        id: location.id,
        dotX: svgPos.x,
        dotY: svgPos.y,
        labelX: svgPos.x,
        labelY: svgPos.y + dotR + 6,
      });
    }

    // Run generic deconfliction
    deconflictLabels(labelEntries);

    // Build lookup for deconflicted label positions
    const labelPositions = new Map<string, { x: number; y: number }>();
    for (const entry of labelEntries) {
      labelPositions.set(entry.id, { x: entry.labelX, y: entry.labelY });
    }

    // Update current-location and destination pulsing rings
    if (currentLocationId) {
      const pos = svgPositions.get(currentLocationId);
      if (pos) {
        currentRing.setAttribute('cx', String(pos.x));
        currentRing.setAttribute('cy', String(pos.y));
        currentRing.style.display = '';
      }
    } else {
      currentRing.style.display = 'none';
    }

    if (flightDestinationId) {
      const pos = svgPositions.get(flightDestinationId);
      if (pos) {
        destRing.setAttribute('cx', String(pos.x));
        destRing.setAttribute('cy', String(pos.y));
        destRing.style.display = '';
      }
    } else {
      destRing.style.display = 'none';
    }

    // Update selection ring position if a location is selected
    if (selectedLocationId) {
      const pos = svgPositions.get(selectedLocationId);
      if (pos) {
        selectionRing.setAttribute('cx', String(pos.x));
        selectionRing.setAttribute('cy', String(pos.y));
        selectionRing.style.display = '';
      }
    } else {
      selectionRing.style.display = 'none';
    }

    for (const location of gameData.world.locations) {
      const refs = markerMap.get(location.id);
      const legendRefs = legendMap.get(location.id);
      if (!refs || !legendRefs) continue;

      const reachable = isLocationReachable(ship, location, virtualOrigin);
      const isCurrent = location.id === currentLocationId;
      const isFlightDest = location.id === flightDestinationId;
      const isOtherDestination = !isCurrent && !isFlightDest && reachable;

      // --- Update SVG marker position ---
      const svgPos = svgPositions.get(location.id)!;
      const dotR = svgPos.dotR;
      const labelPos = labelPositions.get(location.id)!;

      refs.dot.setAttribute('cx', String(svgPos.x));
      refs.dot.setAttribute('cy', String(svgPos.y));
      refs.label.setAttribute('x', String(labelPos.x));
      refs.label.setAttribute('y', String(labelPos.y));
      refs.hitArea.setAttribute('cx', String(svgPos.x));
      refs.hitArea.setAttribute('cy', String(svgPos.y));

      // Leader line: show when label is displaced from its dot
      const labelDx = labelPos.x - svgPos.x;
      const labelDy = labelPos.y - (svgPos.y + dotR + 6);
      const labelDisplacement = Math.sqrt(
        labelDx * labelDx + labelDy * labelDy
      );
      if (labelDisplacement > LEADER_LINE_THRESHOLD) {
        refs.leaderLine.setAttribute('x1', String(svgPos.x));
        refs.leaderLine.setAttribute('y1', String(svgPos.y));
        refs.leaderLine.setAttribute('x2', String(labelPos.x));
        refs.leaderLine.setAttribute('y2', String(labelPos.y - 3));
        refs.leaderLine.style.display = '';
      } else {
        refs.leaderLine.style.display = 'none';
      }

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
      // Update compact summary distance
      const summaryDistText =
        distanceFromCurrent < 0.5
          ? '\u2302'
          : formatDistance(distanceFromCurrent);
      if (legendRefs.summaryDist.textContent !== summaryDistText) {
        legendRefs.summaryDist.textContent = summaryDistText;
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
