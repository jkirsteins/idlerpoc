/**
 * Core Orrery Rendering Logic
 *
 * Pure rendering functions for the orbital orrery map visualization.
 * Extracted from navigationView.ts to be shared by both the Nav tab
 * (single-ship mode) and Fleet Map tab (multi-ship mode).
 *
 * Contains no game state dependencies — only pure projection math,
 * SVG element creation, and label deconfliction algorithms.
 */

import type { WorldLocation } from '../models';

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

// ─── Projection Functions ─────────────────────────────────────────

/**
 * Build an SVG path string for an elliptical orbit.
 * Samples 72 points along the orbit and projects each through the provided
 * radius-to-SVG mapping function, so the path matches the log-scale
 * projection used for dot positions.
 */
export function buildOrbitPath(
  semiMajorAxis: number,
  eccentricity: number,
  radiusToSvg: (km: number) => number
): string {
  const N = 72; // every 5°
  const parts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const theta = (2 * Math.PI * i) / N;
    const r =
      eccentricity === 0
        ? semiMajorAxis
        : (semiMajorAxis * (1 - eccentricity * eccentricity)) /
          (1 + eccentricity * Math.cos(theta));
    const svgR = radiusToSvg(r);
    const x = svgR * Math.cos(theta);
    const y = svgR * Math.sin(theta);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Map an orbital radius (km) to SVG visual radius (overview mode).
 * Logarithmic scaling so Earth-orbit (~150M km) and Jupiter (~778M km)
 * are both visible, while inner Earth-system bodies cluster near Earth.
 */
export function orbitalRadiusToSvg(radiusKm: number): number {
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
export function projectToSvg(
  xKm: number,
  yKm: number
): { x: number; y: number } {
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
export function localOrbitalRadiusToSvg(
  radiusKm: number,
  logMin: number,
  logMax: number
): number {
  const logR = Math.log10(Math.max(radiusKm, 1));
  if (logMax - logMin < 0.01) return 105; // degenerate: all at same radius
  const t = (logR - logMin) / (logMax - logMin);
  return 20 + t * 170; // Focus mode: spread wider (20..190 SVG range vs overview's 30..180)
}

/**
 * Project a satellite position to SVG in cluster Focus mode.
 * Uses the real-time angle from parent body and a local log scale
 * for the radial distance.
 */
export function projectToSvgLocal(
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

// ─── Label Deconfliction ──────────────────────────────────────────

/**
 * Generic label deconfliction — no location-specific layout logic.
 *
 * Design principle: the orrery must never contain location-specific layout
 * logic. All visual positioning derives from orbital data through generic
 * algorithms. Adding new locations to the world should "just work" without
 * any orrery-specific code changes.
 */
export interface LabelEntry {
  id: string;
  dotX: number;
  dotY: number;
  labelX: number;
  labelY: number;
}

export function deconflictLabels(entries: LabelEntry[]): void {
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

// ─── Cluster Data ─────────────────────────────────────────────────

/**
 * Compute cluster membership from location orbital data.
 * Returns parent→children map and convenience sets.
 * Generic: any body with 2+ satellites (via parentId) forms a cluster.
 */
export function computeClusterData(locations: WorldLocation[]): {
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

// ─── SVG Element Creation ─────────────────────────────────────────

/** Per-location refs for the SVG orrery marker */
export interface MarkerRefs {
  dot: SVGCircleElement; // the body dot
  label: SVGTextElement; // name label
  hitArea: SVGCircleElement; // invisible click target
  leaderLine: SVGLineElement; // connects dot to displaced label
  clusterIndicator: SVGCircleElement | null; // dashed ring on cluster parents
}

/** Ship flight trajectory line and moving dot */
export interface ShipDotRefs {
  dot: SVGPolygonElement;
  label: SVGTextElement;
  trajectory: SVGLineElement;
}

export interface OrreryRefs {
  svg: SVGSVGElement;
  layers: {
    rings: SVGGElement;
    bodies: SVGGElement;
    flights: SVGGElement;
  };
  overviewRings: SVGPathElement[];
  localRings: SVGPathElement[];
  sunDot: SVGCircleElement;
  sunLabel: SVGTextElement;
  focusParentDot: SVGCircleElement;
  focusParentLabel: SVGTextElement;
  markerMap: Map<string, MarkerRefs>;
  shipDotsPool: ShipDotRefs[]; // Pool for multi-ship visualization
  // Single-ship flight visualization (used by Nav tab)
  flightLine: SVGLineElement;
  shipDot: SVGCircleElement;
  currentRing: SVGCircleElement; // pulsing ring at current location
  destRing: SVGCircleElement; // glow ring at destination
  selectionRing: SVGCircleElement; // highlight ring for selected location
  assistMarkers: {
    halo: SVGCircleElement;
    diamond: SVGPolygonElement;
  }[];
  tooltipGroup: SVGGElement; // hover tooltip
  tooltipBg: SVGRectElement;
  tooltipName: SVGTextElement;
  tooltipDist: SVGTextElement;
  tooltipServices: SVGTextElement;
}

export interface OrreryConfig {
  mode: 'single-ship' | 'multi-ship';
  showZoomControls: boolean;
  showClusterButtons: boolean;
  maxShips?: number; // Pre-allocate ship dot pool
}

/**
 * Create the orrery SVG visualization structure.
 * Returns stable refs to all layers and elements for in-place updates.
 */
export function createOrreryVisualization(
  locations: WorldLocation[],
  config: OrreryConfig
): OrreryRefs {
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

  // Orbit rings — one per unique Sun-orbiting (radius, eccentricity) pair (overview mode)
  const overviewOrbitRings: SVGPathElement[] = [];
  const sunOrbits = new Map<string, { a: number; e: number }>();
  for (const loc of locations) {
    if (loc.orbital && !loc.orbital.parentId) {
      const a = loc.orbital.orbitalRadiusKm;
      const e = loc.orbital.eccentricity ?? 0;
      const key = `${a}:${e}`;
      if (!sunOrbits.has(key)) sunOrbits.set(key, { a, e });
    }
  }
  for (const { a, e } of sunOrbits.values()) {
    const ring = document.createElementNS(SVG_NS, 'path');
    ring.setAttribute('d', buildOrbitPath(a, e, orbitalRadiusToSvg));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'rgba(15, 52, 96, 0.5)');
    ring.setAttribute('stroke-width', '0.5');
    ring.setAttribute('stroke-dasharray', '3,3');
    ringLayer.appendChild(ring);
    overviewOrbitRings.push(ring);
  }

  // Focus-mode local orbit ring pool (max 8, hidden by default)
  const MAX_LOCAL_RINGS = 8;
  const localRings: SVGPathElement[] = [];
  for (let i = 0; i < MAX_LOCAL_RINGS; i++) {
    const ring = document.createElementNS(SVG_NS, 'path');
    ring.setAttribute('d', '');
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

  // Single-ship flight line + ship dot (used by Nav tab)
  const flightLine = document.createElementNS(SVG_NS, 'line');
  flightLine.setAttribute('stroke', '#dc2626');
  flightLine.setAttribute('stroke-width', '1');
  flightLine.setAttribute('stroke-dasharray', '4,2');
  flightLine.setAttribute('stroke-opacity', '0.6');
  flightLine.style.display = 'none';
  flightLayer.appendChild(flightLine);

  const shipDot = document.createElementNS(SVG_NS, 'circle');
  shipDot.setAttribute('r', '3');
  shipDot.setAttribute('fill', '#dc2626');
  shipDot.setAttribute('stroke', '#fff');
  shipDot.setAttribute('stroke-width', '0.5');
  shipDot.style.display = 'none';
  flightLayer.appendChild(shipDot);

  // Multi-ship dot pool (used by Fleet Map)
  const shipDotsPool: ShipDotRefs[] = [];
  const maxShips = config.maxShips || 10;
  for (let i = 0; i < maxShips; i++) {
    const dot = document.createElementNS(SVG_NS, 'polygon');
    dot.setAttribute('points', '0,-4 3.5,4 -3.5,4'); // Triangle pointing up, ~8 SVG units tall
    dot.setAttribute('stroke', '#fff');
    dot.setAttribute('stroke-width', '0.5');
    dot.style.display = 'none';
    flightLayer.appendChild(dot);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '7');
    label.setAttribute('fill', '#fff');
    label.style.display = 'none';
    flightLayer.appendChild(label);

    const trajectory = document.createElementNS(SVG_NS, 'line');
    trajectory.setAttribute('stroke-width', '1');
    trajectory.setAttribute('stroke-dasharray', '4,4');
    trajectory.style.display = 'none';
    flightLayer.appendChild(trajectory);

    shipDotsPool.push({ dot, label, trajectory });
  }

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
  const assistMarkers: {
    halo: SVGCircleElement;
    diamond: SVGPolygonElement;
  }[] = [];
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

  // Location markers (created per location, stored in map)
  const markerMap = new Map<string, MarkerRefs>();

  return {
    svg,
    layers: {
      rings: ringLayer,
      bodies: bodyLayer,
      flights: flightLayer,
    },
    overviewRings: overviewOrbitRings,
    localRings,
    sunDot,
    sunLabel,
    focusParentDot,
    focusParentLabel,
    markerMap,
    shipDotsPool,
    flightLine,
    shipDot,
    currentRing,
    destRing,
    selectionRing,
    assistMarkers,
    tooltipGroup,
    tooltipBg,
    tooltipName,
    tooltipDist,
    tooltipServices,
  };
}

/**
 * Helper: Position a marker and its label, update leader line.
 * Extracted from navigationView.ts positionMarker().
 */
export function positionMarker(
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
export function hideMarker(refs: MarkerRefs): void {
  refs.dot.style.display = 'none';
  refs.label.style.display = 'none';
  refs.hitArea.style.display = 'none';
  refs.leaderLine.style.display = 'none';
  if (refs.clusterIndicator) refs.clusterIndicator.style.display = 'none';
}

/** Show a marker's SVG elements */
export function showMarker(refs: MarkerRefs): void {
  refs.dot.style.display = '';
  refs.label.style.display = '';
  refs.hitArea.style.display = '';
}
