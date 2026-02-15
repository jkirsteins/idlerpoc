/**
 * Shared Orrery Update Logic
 *
 * Update functions that work for both single-ship (Nav tab) and
 * multi-ship (Fleet Map) modes. Handles orbital motion updates,
 * ship positioning, and flight trajectory visualization.
 */

import type { GameData, WorldLocation, FlightState } from '../models';
import {
  type OrreryRefs,
  type LabelEntry,
  deconflictLabels,
  projectToSvg,
} from './orreryCore';
import { getLocationPosition } from '../orbitalMechanics';

/** Gravity assist marker refs */
export interface AssistMarkerRefs {
  halo: SVGCircleElement; // influence zone halo around body
  diamond: SVGPolygonElement; // marker on trajectory line
}

export interface ShipDisplayInfo {
  shipId: string;
  shipName: string;
  color: string; // Hex color for this ship
  locationId: string | null; // Current docked/orbiting location
  flightPlan: FlightState | null;
  isActive: boolean; // Is this the active ship?
}

export type OrreryMode =
  | { type: 'overview' }
  | { type: 'focus'; parentId: string };

/**
 * Update orrery positions for all locations.
 * Returns a map of locationId → SVG position for ship dot placement.
 */
export function updateOrreryPositions(
  _refs: OrreryRefs,
  locations: WorldLocation[],
  mode: OrreryMode,
  clusterData: {
    childrenMap: Map<string, string[]>;
    parentIds: Set<string>;
    memberIds: Set<string>;
  },
  gameData: GameData
): Map<string, { x: number; y: number; dotR: number }> {
  const svgPositions = new Map<
    string,
    { x: number; y: number; dotR: number }
  >();

  if (mode.type === 'overview') {
    // Compute positions and deconfliction for visible locations
    const labelEntries: LabelEntry[] = [];

    for (const location of locations) {
      const pos = getLocationPosition(
        location,
        gameData.gameTime,
        gameData.world
      );
      const svgPos = projectToSvg(pos.x, pos.y);
      const isChild = clusterData.memberIds.has(location.id);
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

    // Note: Actual marker positioning is done by the caller (Nav tab or Fleet Map)
    // This function just computes and returns the positions
  }

  // For focus mode, the caller (navigationView) handles the positioning
  // since it involves more complex local projection logic

  return svgPositions;
}

/**
 * Update multi-ship visualization on the orrery.
 * Places ship dots at their current locations or along flight trajectories.
 */
export function updateShipVisualization(
  refs: OrreryRefs,
  ships: ShipDisplayInfo[],
  svgPositions: Map<string, { x: number; y: number }>,
  _gameData: GameData
): void {
  // Hide all ship dots initially
  for (const dotRefs of refs.shipDotsPool) {
    dotRefs.dot.style.display = 'none';
    dotRefs.label.style.display = 'none';
    dotRefs.trajectory.style.display = 'none';
  }

  // Position ships
  for (let i = 0; i < ships.length && i < refs.shipDotsPool.length; i++) {
    const ship = ships[i];
    const dotRefs = refs.shipDotsPool[i];

    // Store ship ID for click handlers
    dotRefs.dot.dataset.shipId = ship.shipId;

    // Set color
    dotRefs.dot.setAttribute('fill', ship.color);
    dotRefs.dot.setAttribute('stroke', ship.color);
    dotRefs.label.setAttribute('fill', ship.color);

    // Set size (active ship is larger)
    if (ship.isActive) {
      dotRefs.dot.setAttribute('r', '4');
      dotRefs.dot.setAttribute(
        'filter',
        'drop-shadow(0 0 3px ' + ship.color + ')'
      );
    } else {
      dotRefs.dot.setAttribute('r', '2.5');
      dotRefs.dot.removeAttribute('filter');
    }

    if (ship.flightPlan) {
      // Ship is in flight — show trajectory and moving dot
      const fp = ship.flightPlan;

      if (fp.originPos && fp.interceptPos) {
        const originSvg = projectToSvg(fp.originPos.x, fp.originPos.y);
        const destSvg = projectToSvg(fp.interceptPos.x, fp.interceptPos.y);

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

        // Compute rotation angle for triangle ship symbol (pointing toward destination)
        const angle = Math.atan2(
          destSvg.y - originSvg.y,
          destSvg.x - originSvg.x
        );
        const angleDeg = (angle * 180) / Math.PI;

        // Trajectory line
        if (ship.isActive) {
          // Active ship: full trajectory
          dotRefs.trajectory.setAttribute('x1', String(originSvg.x));
          dotRefs.trajectory.setAttribute('y1', String(originSvg.y));
          dotRefs.trajectory.setAttribute('x2', String(destSvg.x));
          dotRefs.trajectory.setAttribute('y2', String(destSvg.y));
          dotRefs.trajectory.setAttribute('stroke', ship.color);
          dotRefs.trajectory.setAttribute('stroke-opacity', '0.6');
          dotRefs.trajectory.style.display = '';
        } else {
          // Inactive ships: faint trajectory line
          dotRefs.trajectory.setAttribute('x1', String(originSvg.x));
          dotRefs.trajectory.setAttribute('y1', String(originSvg.y));
          dotRefs.trajectory.setAttribute('x2', String(destSvg.x));
          dotRefs.trajectory.setAttribute('y2', String(destSvg.y));
          dotRefs.trajectory.setAttribute('stroke', ship.color);
          dotRefs.trajectory.setAttribute('stroke-opacity', '0.25');
          dotRefs.trajectory.style.display = '';
        }

        // Ship triangle at current position (rotated to point toward destination)
        dotRefs.dot.setAttribute(
          'transform',
          `translate(${shipSvg.x},${shipSvg.y}) rotate(${angleDeg + 90})`
        );
        dotRefs.dot.style.display = '';

        // Label (active ship only)
        if (ship.isActive) {
          dotRefs.label.textContent = ship.shipName;
          dotRefs.label.setAttribute('x', String(shipSvg.x));
          dotRefs.label.setAttribute('y', String(shipSvg.y + 8));
          dotRefs.label.setAttribute('text-anchor', 'middle');
          dotRefs.label.style.display = '';
        }
      }
    } else if (ship.locationId) {
      // Ship is docked/orbiting — show triangle pointing upward at location
      const pos = svgPositions.get(ship.locationId);
      if (pos) {
        dotRefs.dot.setAttribute(
          'transform',
          `translate(${pos.x},${pos.y}) rotate(0)`
        );
        dotRefs.dot.style.display = '';

        // Label (active ship only, or on hover for others)
        if (ship.isActive) {
          dotRefs.label.textContent = ship.shipName;
          dotRefs.label.setAttribute('x', String(pos.x));
          dotRefs.label.setAttribute('y', String(pos.y + 8));
          dotRefs.label.setAttribute('text-anchor', 'middle');
          dotRefs.label.style.display = '';
        }
      }
    }
  }
}

/**
 * Update gravity assist markers for a flight trajectory.
 * Shows halos around assisting bodies and diamonds on the trajectory line.
 * Extracted from navigationView.ts for reuse.
 */
export function updateGravityAssistMarkers(
  assistMarkers: AssistMarkerRefs[],
  flightPlan: FlightState | null,
  originSvg: { x: number; y: number },
  destSvg: { x: number; y: number },
  gameData: GameData
): void {
  const assists = flightPlan?.gravityAssists || [];

  for (let i = 0; i < assistMarkers.length; i++) {
    const marker = assistMarkers[i];
    if (i < assists.length) {
      const a = assists[i];
      const color =
        a.result === 'success'
          ? '#4caf50'
          : a.result === 'failure'
            ? '#f44336'
            : '#ffc107';

      const bodyLoc = gameData.world.locations.find((l) => l.id === a.bodyId);
      if (bodyLoc) {
        const bodyPos = getLocationPosition(
          bodyLoc,
          gameData.gameTime,
          gameData.world
        );
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
}
