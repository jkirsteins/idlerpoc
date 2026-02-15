/**
 * Fleet Map Orrery Component
 *
 * Multi-ship orrery visualization for the Fleet tab. Shows all ships'
 * positions across the solar system using the shared orrery core.
 *
 * Differences from Nav tab orrery:
 * - Shows multiple ships simultaneously with color coding
 * - Always in overview mode (no cluster focus)
 * - No zoom/pan controls (simpler interaction)
 * - Click ship to select/switch active ship
 */

import type { Component } from './component';
import type { GameData, WorldLocation } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import {
  createOrreryVisualization,
  computeClusterData,
  projectToSvg,
  type OrreryRefs,
  type MarkerRefs,
  type LabelEntry,
  deconflictLabels,
  positionMarker,
  hideMarker,
  showMarker,
} from './orreryCore';
import { type ShipDisplayInfo, updateShipVisualization } from './orreryUpdate';
import { getShipColor } from './shipColors';
import { getLocationPosition } from '../orbitalMechanics';
import { setupMapZoomPan } from './mapZoomPan';

export interface FleetMapCallbacks {
  onSelectShip: (shipId: string) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create location marker DOM elements.
 * Extracted from navigationView.ts for reuse.
 */
function createLocationMarker(
  location: WorldLocation,
  bodyLayer: SVGGElement,
  clusterMemberIds: Set<string>,
  clusterParentIds: Set<string>,
  onClick: () => void
): MarkerRefs {
  const pos = projectToSvg(location.x, location.y);
  const template = getLocationTypeTemplate(location.type);
  const isClusterChild = clusterMemberIds.has(location.id);
  const isClusterParent = clusterParentIds.has(location.id);
  const dotRadius = location.type === 'planet' ? 5 : isClusterChild ? 2.5 : 3.5;

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

  // Click handler
  hitArea.addEventListener('click', onClick);

  return {
    dot,
    label: markerLabel,
    hitArea,
    leaderLine,
    clusterIndicator,
  };
}

export function createFleetMapOrrery(
  gameData: GameData,
  callbacks: FleetMapCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'fleet-map-orrery';
  container.style.position = 'relative';
  container.style.height = '400px';
  container.style.background = '#0d0d18';
  container.style.border = '1px solid #444';
  container.style.borderRadius = '8px';

  // Cluster membership data — computed once at mount
  const {
    parentIds: clusterParentIds,
    memberIds: clusterMemberIds,
    childrenMap: clusterChildrenMap,
  } = computeClusterData(gameData.world.locations);

  // Orrery mode state
  type OrreryMode = { type: 'overview' } | { type: 'focus'; parentId: string };
  let orreryMode: OrreryMode = { type: 'overview' };

  // Create orrery with multi-ship config
  const orreryRefs: OrreryRefs = createOrreryVisualization(
    gameData.world.locations,
    {
      mode: 'multi-ship',
      showZoomControls: true,
      showClusterButtons: false,
      maxShips: 10, // Pre-allocate pool
    }
  );

  // Create location markers
  for (const location of gameData.world.locations) {
    const markerRefs = createLocationMarker(
      location,
      orreryRefs.layers.bodies,
      clusterMemberIds,
      clusterParentIds,
      () => {
        // Fleet Map doesn't drill into clusters — just show tooltip or info
        // Could add location selection here in the future
      }
    );
    orreryRefs.markerMap.set(location.id, markerRefs);
  }

  // Setup ship dot click handlers
  for (const shipDotRef of orreryRefs.shipDotsPool) {
    shipDotRef.dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const shipId = shipDotRef.dot.dataset.shipId;
      if (shipId) callbacks.onSelectShip(shipId);
    });
  }

  container.appendChild(orreryRefs.svg);

  // Setup zoom/pan controls
  const zoomControls = setupMapZoomPan(orreryRefs.svg, container);

  // Add legend toggle button to controls container (left of Reset button)
  const legendButton = document.createElement('button');
  legendButton.textContent = 'Legend';
  legendButton.className = 'nav-map-btn';
  // Insert at the beginning so it appears on the left
  zoomControls.controlsContainer.insertBefore(
    legendButton,
    zoomControls.controlsContainer.firstChild
  );

  // Helper to build cluster focus buttons
  function buildClusterButtons(): HTMLElement | null {
    const bar = document.createElement('div');
    bar.className = 'nav-map-cluster-bar';

    for (const [parentId, childIds] of clusterChildrenMap) {
      if (childIds.length < 2) continue;
      if (!clusterParentIds.has(parentId)) continue;
      const parent = gameData.world.locations.find((l) => l.id === parentId);
      if (!parent) continue;

      const btn = document.createElement('button');
      btn.className = 'nav-map-btn';
      btn.textContent = `${parent.name} System`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        switchToFocus(parentId);
      });
      bar.appendChild(btn);
    }

    return bar.children.length > 0 ? bar : null;
  }

  // Cluster focus buttons
  const clusterBar = buildClusterButtons();
  if (clusterBar) container.appendChild(clusterBar);

  // Back-to-overview button (hidden by default, shown in focus mode)
  const backToOverviewBtn = document.createElement('button');
  backToOverviewBtn.className = 'nav-map-btn nav-map-back-btn';
  backToOverviewBtn.textContent = '\u2190 Overview';
  backToOverviewBtn.style.display = 'none';
  backToOverviewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToOverview();
  });
  container.appendChild(backToOverviewBtn);

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
    if (clusterBar) clusterBar.style.display = 'none';
    backToOverviewBtn.style.display = '';
    const parent = gameData.world.locations.find((l) => l.id === parentId);
    if (parent) {
      focusTitle.textContent = `${parent.name} System`;
      focusTitle.style.display = '';
    }
  }

  function switchToOverview(): void {
    orreryMode = { type: 'overview' };
    // Preserve current zoom level
    const currentZoom = zoomControls.getCurrentZoom();
    zoomControls.zoomTo(0, 0, currentZoom, false);

    // Update UI
    if (clusterBar) clusterBar.style.display = '';
    backToOverviewBtn.style.display = 'none';
    focusTitle.style.display = 'none';
  }

  // Create legend overlay (hidden by default)
  const legend = document.createElement('div');
  legend.className = 'nav-map-legend-panel';
  legend.style.display = 'none';

  // Toggle legend visibility
  let legendVisible = false;
  legendButton.addEventListener('click', () => {
    legendVisible = !legendVisible;
    legend.style.display = legendVisible ? 'block' : 'none';
    legendButton.style.fontWeight = legendVisible ? 'bold' : 'normal';
  });

  // Ships section header
  const shipsHeader = document.createElement('div');
  shipsHeader.textContent = 'Ships';
  shipsHeader.style.fontWeight = 'bold';
  shipsHeader.style.marginBottom = '6px';
  shipsHeader.style.color = '#4a9eff';
  shipsHeader.style.fontSize = '11px';
  legend.appendChild(shipsHeader);

  // Ships list container (will be updated dynamically)
  const shipsList = document.createElement('div');
  shipsList.style.marginBottom = '10px';
  legend.appendChild(shipsList);

  // Location types section header
  const typesHeader = document.createElement('div');
  typesHeader.textContent = 'Locations';
  typesHeader.style.fontWeight = 'bold';
  typesHeader.style.marginBottom = '6px';
  typesHeader.style.color = '#4a9eff';
  typesHeader.style.fontSize = '11px';
  typesHeader.style.borderTop = '1px solid #333';
  typesHeader.style.paddingTop = '8px';
  legend.appendChild(typesHeader);

  // Location types list (static, built once)
  const typesList = document.createElement('div');
  legend.appendChild(typesList);

  // Build location types list
  const worldTypes = new Set(gameData.world.locations.map((loc) => loc.type));
  for (const typeName of worldTypes) {
    const template = getLocationTypeTemplate(typeName);

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
      white-space: nowrap;
    `;

    // Colored circle indicator
    const circle = document.createElement('div');
    circle.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${template.color ?? '#0f3460'};
      flex-shrink: 0;
    `;
    row.appendChild(circle);

    // Type name
    const name = document.createElement('span');
    name.textContent = template.name ?? typeName;
    name.style.color = '#ccc';
    row.appendChild(name);

    typesList.appendChild(row);
  }

  container.appendChild(legend);

  function update(gameData: GameData): void {
    // Build ship display info array
    const ships: ShipDisplayInfo[] = gameData.ships.map((ship) => ({
      shipId: ship.id,
      shipName: ship.name,
      color: getShipColor(ship.id, ship.id === gameData.activeShipId),
      locationId: ship.location.dockedAt || ship.location.orbitingAt || null,
      flightPlan: ship.activeFlightPlan || null,
      isActive: ship.id === gameData.activeShipId,
    }));

    // Update location positions (accounts for orbital motion)
    const svgPositions = new Map<
      string,
      { x: number; y: number; dotR: number }
    >();
    const labelEntries: LabelEntry[] = [];

    for (const location of gameData.world.locations) {
      const pos = getLocationPosition(
        location,
        gameData.gameTime,
        gameData.world
      );
      const svgPos = projectToSvg(pos.x, pos.y);
      const isChild = clusterMemberIds.has(location.id);
      const dotR = location.type === 'planet' ? 5 : isChild ? 2.5 : 3.5;
      svgPositions.set(location.id, { ...svgPos, dotR });

      // In overview mode, hide cluster children
      // In focus mode, show only cluster members
      const shouldShowLabel =
        orreryMode.type === 'overview'
          ? !isChild
          : location.id === orreryMode.parentId ||
            (clusterChildrenMap
              .get(orreryMode.parentId)
              ?.includes(location.id) ??
              false);

      if (shouldShowLabel) {
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

    // Update location markers based on mode
    for (const location of gameData.world.locations) {
      const refs = orreryRefs.markerMap.get(location.id);
      if (!refs) continue;

      const isChild = clusterMemberIds.has(location.id);
      const isInFocusCluster =
        orreryMode.type === 'focus' &&
        (location.id === orreryMode.parentId ||
          (clusterChildrenMap.get(orreryMode.parentId)?.includes(location.id) ??
            false));

      // Show/hide based on mode
      if (orreryMode.type === 'overview') {
        // Overview: hide cluster children
        if (isChild) {
          hideMarker(refs);
          continue;
        }
      } else {
        // Focus: show only cluster members
        if (!isInFocusCluster) {
          hideMarker(refs);
          continue;
        }
      }

      // Show this location
      showMarker(refs);

      const svgPos = svgPositions.get(location.id)!;
      const labelPos = labelPositions.get(location.id);
      if (labelPos) {
        positionMarker(refs, svgPos, labelPos, svgPos.dotR);
      }

      // Cluster indicator ring on parents (only in overview mode)
      if (refs.clusterIndicator) {
        if (orreryMode.type === 'overview') {
          refs.clusterIndicator.setAttribute('cx', String(svgPos.x));
          refs.clusterIndicator.setAttribute('cy', String(svgPos.y));
          refs.clusterIndicator.style.display = '';
        } else {
          refs.clusterIndicator.style.display = 'none';
        }
      }
    }

    // Update ship visualization
    updateShipVisualization(orreryRefs, ships, svgPositions, gameData);

    // Update ships legend
    shipsList.innerHTML = '';
    for (const ship of ships) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 0;
        cursor: pointer;
        white-space: nowrap;
      `;
      if (ship.isActive) {
        row.style.fontWeight = 'bold';
      }

      // Hover effect
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(74, 158, 255, 0.2)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = '';
      });

      // Click to select ship
      row.addEventListener('click', () => {
        callbacks.onSelectShip(ship.shipId);
      });

      // Triangle indicator (matching ship color)
      const triangle = document.createElement('div');
      triangle.style.cssText = `
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-bottom: 7px solid ${ship.color};
        flex-shrink: 0;
      `;
      row.appendChild(triangle);

      // Ship name
      const name = document.createElement('span');
      name.textContent = ship.shipName;
      name.style.color = ship.color;
      row.appendChild(name);

      // Status (docked at X / in flight to Y)
      const status = document.createElement('span');
      status.style.cssText = 'color: #888; font-size: 9px; margin-left: 4px;';
      if (ship.flightPlan) {
        const destLoc = gameData.world.locations.find(
          (l) => l.id === ship.flightPlan!.destination
        );
        status.textContent = `→ ${destLoc?.name ?? 'Unknown'}`;
      } else if (ship.locationId) {
        const loc = gameData.world.locations.find(
          (l) => l.id === ship.locationId
        );
        status.textContent = `@ ${loc?.name ?? 'Unknown'}`;
      }
      row.appendChild(status);

      shipsList.appendChild(row);
    }
  }

  return { el: container, update };
}
