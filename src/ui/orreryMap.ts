/**
 * Unified Orrery Map Component
 *
 * Single reusable orrery visualization for both Nav tab (single ship) and
 * Fleet tab (multi-ship). Mode logic is shared in orreryCore, ship rendering
 * is configured via props.
 *
 * This component is ONLY the map visualization. Parent views (Nav, Fleet)
 * add their own legends, controls, and interaction logic.
 */

import type { Component } from './component';
import type { GameData, WorldLocation } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import {
  createOrreryVisualization,
  computeClusterData,
  type OrreryRefs,
  type MarkerRefs,
  type LabelEntry,
  type OrreryModeState,
  deconflictLabels,
  positionMarker,
  hideMarker,
  showMarker,
  computeLocationRenderInfo,
  updateOrreryModeUI,
} from './orreryCore';
import { type ShipDisplayInfo, updateShipVisualization } from './orreryUpdate';
import { setupMapZoomPan, type MapZoomPanControls } from './mapZoomPan';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface OrreryMapConfig {
  /** Ships to display on the map */
  ships: ShipDisplayInfo[];
  /** Show zoom controls (Reset button) */
  showZoomControls: boolean;
  /** Show cluster focus buttons (e.g., "Earth System") */
  showClusterButtons: boolean;
  /** Callbacks for location/cluster interactions */
  onLocationClick?: (locationId: string, isClusterParent: boolean) => void;
  /** Callback when cluster focus changes */
  onFocusChange?: (parentId: string | null) => void;
}

export interface OrreryMapRefs {
  svg: SVGElement;
  zoomControls: MapZoomPanControls;
  orreryRefs: OrreryRefs;
  markerMap: Map<string, MarkerRefs>;
  clusterButtonsContainer: HTMLElement | null;
  backButton: HTMLElement;
  focusTitle: HTMLElement;
  getLastSvgPositions: () => Map<
    string,
    { x: number; y: number; dotR: number }
  >;
  getCurrentMode: () => OrreryModeState;
}

/**
 * Create a location marker (dot + label + hit area).
 * Extracted from navigationView/fleetMapOrrery to avoid duplication.
 */
function createLocationMarker(
  location: WorldLocation,
  bodyLayer: SVGGElement,
  clusterMemberIds: Set<string>,
  clusterParentIds: Set<string>,
  onClick: () => void
): MarkerRefs {
  const template = getLocationTypeTemplate(location.type);
  const isClusterChild = clusterMemberIds.has(location.id);
  const isClusterParent = clusterParentIds.has(location.id);
  const dotRadius = location.type === 'planet' ? 5 : isClusterChild ? 2.5 : 3.5;

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('r', String(dotRadius));
  dot.setAttribute('fill', template.color ?? '#0f3460');
  dot.setAttribute('stroke', '#0f3460');
  dot.setAttribute('stroke-width', '1');
  bodyLayer.appendChild(dot);

  // Cluster indicator ring on parent dots (dashed, pulsing)
  let clusterIndicator: SVGCircleElement | null = null;
  if (isClusterParent) {
    clusterIndicator = document.createElementNS(SVG_NS, 'circle');
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
  markerLabel.setAttribute('text-anchor', 'middle');
  markerLabel.setAttribute('fill', '#ccc');
  markerLabel.setAttribute('font-size', '6');
  markerLabel.textContent = location.name;
  bodyLayer.appendChild(markerLabel);

  // Invisible hit area for click/hover events (15-unit radius for mobile)
  const hitArea = document.createElementNS(SVG_NS, 'circle');
  hitArea.setAttribute('r', '15');
  hitArea.setAttribute('fill', 'transparent');
  hitArea.style.cursor = 'pointer';
  bodyLayer.appendChild(hitArea);

  hitArea.addEventListener('click', onClick);

  return {
    dot,
    label: markerLabel,
    hitArea,
    leaderLine,
    clusterIndicator,
  };
}

/**
 * Build cluster focus buttons for the orrery map.
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

export function createOrreryMap(
  gameData: GameData,
  config: OrreryMapConfig
): {
  component: Component;
  updateWithShips: (gd: GameData, ships?: ShipDisplayInfo[]) => void;
  refs: OrreryMapRefs;
} {
  const container = document.createElement('div');
  container.className = 'orrery-map-container';
  container.style.cssText = `
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  `;

  // Cluster membership data — computed once at mount
  const {
    parentIds: clusterParentIds,
    memberIds: clusterMemberIds,
    childrenMap: clusterChildrenMap,
  } = computeClusterData(gameData.world.locations);

  // Orrery mode state
  let orreryMode: OrreryModeState = { type: 'overview' };

  // Cached SVG positions from last update (for Nav ring positioning)
  let lastSvgPositions = new Map<
    string,
    { x: number; y: number; dotR: number }
  >();

  // Create orrery with config
  const orreryRefs: OrreryRefs = createOrreryVisualization(
    gameData.world.locations,
    {
      mode: config.ships.length === 1 ? 'single-ship' : 'multi-ship',
      showZoomControls: config.showZoomControls,
      showClusterButtons: false, // We'll build our own below
      maxShips: Math.max(config.ships.length, 1),
    }
  );

  // Create location markers
  const markerMap = orreryRefs.markerMap;
  for (const location of gameData.world.locations) {
    const markerRefs = createLocationMarker(
      location,
      orreryRefs.layers.bodies,
      clusterMemberIds,
      clusterParentIds,
      () => {
        const isClusterParent = clusterParentIds.has(location.id);
        if (config.onLocationClick) {
          config.onLocationClick(location.id, isClusterParent);
        }
      }
    );
    markerMap.set(location.id, markerRefs);
  }

  container.appendChild(orreryRefs.svg);

  // Setup zoom/pan controls
  const zoomControls = setupMapZoomPan(orreryRefs.svg, container);

  // Cluster focus buttons
  let clusterButtonsContainer: HTMLElement | null = null;
  if (config.showClusterButtons) {
    clusterButtonsContainer = buildClusterButtons(
      gameData.world.locations,
      clusterChildrenMap,
      clusterParentIds,
      (parentId) => switchToFocus(parentId)
    );
    if (clusterButtonsContainer) container.appendChild(clusterButtonsContainer);
  }

  // Back-to-overview button (hidden by default, shown in focus mode)
  const backButton = document.createElement('button');
  backButton.className = 'nav-map-btn nav-map-back-btn';
  backButton.textContent = '\u2190 Overview';
  backButton.style.display = 'none';
  backButton.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToOverview();
  });
  container.appendChild(backButton);

  // Focus mode title (e.g. "Earth System") — hidden by default
  const focusTitle = document.createElement('div');
  focusTitle.className = 'nav-map-focus-title';
  focusTitle.style.display = 'none';
  container.appendChild(focusTitle);

  function switchToFocus(parentId: string): void {
    orreryMode = { type: 'focus', parentId };
    // Preserve current zoom level
    const currentZoom = zoomControls.getCurrentZoom();
    zoomControls.zoomTo(0, 0, currentZoom, false);

    // Update UI
    if (clusterButtonsContainer) clusterButtonsContainer.style.display = 'none';
    backButton.style.display = '';
    const parent = gameData.world.locations.find((l) => l.id === parentId);
    if (parent) {
      focusTitle.textContent = `${parent.name} System`;
      focusTitle.style.display = '';
    }

    if (config.onFocusChange) config.onFocusChange(parentId);
  }

  function switchToOverview(): void {
    orreryMode = { type: 'overview' };
    // Preserve current zoom level
    const currentZoom = zoomControls.getCurrentZoom();
    zoomControls.zoomTo(0, 0, currentZoom, false);

    // Update UI
    if (clusterButtonsContainer) clusterButtonsContainer.style.display = '';
    backButton.style.display = 'none';
    focusTitle.style.display = 'none';

    if (config.onFocusChange) config.onFocusChange(null);
  }

  function update(gameData: GameData, ships?: ShipDisplayInfo[]): void {
    // Use provided ships or keep current config
    const currentShips = ships || config.ships;
    // Update orrery mode UI (sun/focus parent, orbit rings)
    updateOrreryModeUI(orreryRefs, orreryMode, gameData.world.locations, {
      parentIds: clusterParentIds,
      memberIds: clusterMemberIds,
      childrenMap: clusterChildrenMap,
    });

    // Compute location render info using shared mode logic
    const renderInfo = computeLocationRenderInfo(
      gameData.world.locations,
      {
        parentIds: clusterParentIds,
        memberIds: clusterMemberIds,
        childrenMap: clusterChildrenMap,
      },
      orreryMode,
      gameData.gameTime,
      gameData.world
    );

    // Build label entries for deconfliction
    const labelEntries: LabelEntry[] = renderInfo
      .filter((info) => info.visible && !info.isFocusParent)
      .map((info) => ({
        id: info.id,
        dotX: info.svgPos.x,
        dotY: info.svgPos.y,
        labelX: info.svgPos.x,
        labelY: info.svgPos.y + info.dotR + 6,
      }));

    deconflictLabels(labelEntries);

    const labelPositions = new Map<string, { x: number; y: number }>();
    for (const entry of labelEntries) {
      labelPositions.set(entry.id, { x: entry.labelX, y: entry.labelY });
    }

    // Build SVG positions map for ship visualization
    const svgPositions = new Map<
      string,
      { x: number; y: number; dotR: number }
    >();
    for (const info of renderInfo) {
      svgPositions.set(info.id, { ...info.svgPos, dotR: info.dotR });
    }

    // Cache positions for external use (Nav ring positioning)
    lastSvgPositions = svgPositions;

    // Apply render info to markers
    for (const info of renderInfo) {
      const refs = markerMap.get(info.id);
      if (!refs) continue;

      if (!info.visible || info.isFocusParent) {
        // Hidden or using dedicated focus parent elements
        hideMarker(refs);
        continue;
      }

      // Show this location
      showMarker(refs);

      const labelPos = labelPositions.get(info.id);
      if (labelPos) {
        positionMarker(refs, info.svgPos, labelPos, info.dotR);
      }

      // Cluster indicator ring on parents (only in overview mode)
      if (refs.clusterIndicator) {
        if (orreryMode.type === 'overview') {
          refs.clusterIndicator.setAttribute('cx', String(info.svgPos.x));
          refs.clusterIndicator.setAttribute('cy', String(info.svgPos.y));
          refs.clusterIndicator.style.display = '';
        } else {
          refs.clusterIndicator.style.display = 'none';
        }
      }
    }

    // Update ship visualization with mode and cluster data
    updateShipVisualization(
      orreryRefs,
      currentShips,
      svgPositions,
      gameData,
      orreryMode,
      {
        childrenMap: clusterChildrenMap,
      }
    );
  }

  // Initial render
  update(gameData, config.ships);

  // Expose an extended update function for external control
  const updateWithShips = (gd: GameData, ships?: ShipDisplayInfo[]) => {
    update(gd, ships);
  };

  return {
    component: {
      el: container,
      update: (gd: GameData) => update(gd, undefined),
    },
    updateWithShips,
    refs: {
      svg: orreryRefs.svg,
      zoomControls,
      orreryRefs,
      markerMap,
      clusterButtonsContainer,
      backButton,
      focusTitle,
      getLastSvgPositions: () => lastSvgPositions,
      getCurrentMode: () => orreryMode,
    },
  };
}
