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
  container.style.background = 'rgba(0, 0, 0, 0.5)';
  container.style.borderRadius = '4px';
  container.style.border = '1px solid #666';

  // Cluster membership data — computed once at mount
  const { parentIds: clusterParentIds, memberIds: clusterMemberIds } =
    computeClusterData(gameData.world.locations);

  // Create orrery with multi-ship config
  const orreryRefs: OrreryRefs = createOrreryVisualization(
    gameData.world.locations,
    {
      mode: 'multi-ship',
      showZoomControls: false,
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

    // Update location markers (always overview mode for Fleet Map)
    for (const location of gameData.world.locations) {
      const refs = orreryRefs.markerMap.get(location.id);
      if (!refs) continue;

      const isChild = clusterMemberIds.has(location.id);

      if (isChild) {
        // Hide cluster children in overview
        hideMarker(refs);
        continue;
      }

      // Show this location
      showMarker(refs);

      const svgPos = svgPositions.get(location.id)!;
      const labelPos = labelPositions.get(location.id)!;
      positionMarker(refs, svgPos, labelPos, svgPos.dotR);

      // Cluster indicator ring on parents
      if (refs.clusterIndicator) {
        refs.clusterIndicator.setAttribute('cx', String(svgPos.x));
        refs.clusterIndicator.setAttribute('cy', String(svgPos.y));
        refs.clusterIndicator.style.display = '';
      }
    }

    // Update ship visualization
    updateShipVisualization(orreryRefs, ships, svgPositions, gameData);
  }

  return { el: container, update };
}
