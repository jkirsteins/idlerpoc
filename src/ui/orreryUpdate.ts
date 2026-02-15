/**
 * Shared Orrery Update Logic
 *
 * Update functions that work for both single-ship (Nav tab) and
 * multi-ship (Fleet Map) modes. Handles orbital motion updates,
 * ship positioning, and flight trajectory visualization.
 */

import type { GameData, WorldLocation, FlightState, Vec2 } from '../models';
import {
  type OrreryRefs,
  type LabelEntry,
  deconflictLabels,
  projectToSvg,
} from './orreryCore';
import { getLocationPosition } from '../orbitalMechanics';
import { computeFrozenTrajectoryLocal } from './mapProjection';

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

/** Compute edge position for a trajectory endpoint outside the current cluster */
function computeEdgePos(
  frozenPos: Vec2 | undefined,
  externalLocId: string,
  parentPos: { x: number; y: number },
  gd: GameData
): { x: number; y: number } {
  if (frozenPos) {
    const angle = Math.atan2(
      frozenPos.y - parentPos.y,
      frozenPos.x - parentPos.x
    );
    return { x: 185 * Math.cos(angle), y: 185 * Math.sin(angle) };
  }
  const extLoc = gd.world.locations.find((l) => l.id === externalLocId);
  if (!extLoc) return { x: 0, y: 0 };
  const extPos = getLocationPosition(extLoc, gd.gameTime, gd.world);
  const angle = Math.atan2(extPos.y - parentPos.y, extPos.x - parentPos.x);
  return { x: 185 * Math.cos(angle), y: 185 * Math.sin(angle) };
}

/** Resolve origin/dest SVG positions for a flight in focus mode */
function resolveFlightEndpoints(
  fp: FlightState,
  originInCluster: boolean,
  destInCluster: boolean,
  cachedSvgPositions: Map<string, { x: number; y: number }>,
  parentPos: { x: number; y: number },
  gd: GameData,
  ctx: { parentLoc: WorldLocation; logMin: number; logMax: number }
): { originSvg: { x: number; y: number }; destSvg: { x: number; y: number } } {
  const getLocalPos = (locId: string) =>
    cachedSvgPositions.get(locId) ?? { x: 0, y: 0 };

  const depTime = fp.departureGameTime ?? fp.estimatedArrivalGameTime;
  const hasFrozen = !!(
    fp.originPos &&
    fp.interceptPos &&
    fp.estimatedArrivalGameTime
  );
  const frozen = hasFrozen
    ? computeFrozenTrajectoryLocal(
        fp.originPos!,
        fp.interceptPos!,
        fp.estimatedArrivalGameTime!,
        {
          parentLoc: ctx.parentLoc,
          world: gd.world,
          logMin: ctx.logMin,
          logMax: ctx.logMax,
          departureGameTime: depTime,
        }
      )
    : undefined;

  let originSvg: { x: number; y: number };
  let destSvg: { x: number; y: number };

  if (originInCluster && destInCluster) {
    originSvg = frozen?.originSvg ?? getLocalPos(fp.origin);
    destSvg = frozen?.destSvg ?? getLocalPos(fp.destination);
  } else if (originInCluster) {
    originSvg = frozen?.originSvg ?? getLocalPos(fp.origin);
    destSvg = frozen
      ? computeEdgePos(fp.interceptPos, fp.destination, parentPos, gd)
      : computeEdgePos(undefined, fp.destination, parentPos, gd);
  } else {
    originSvg = frozen
      ? computeEdgePos(fp.originPos, fp.origin, parentPos, gd)
      : computeEdgePos(undefined, fp.origin, parentPos, gd);
    destSvg = frozen?.destSvg ?? getLocalPos(fp.destination);
  }

  return { originSvg, destSvg };
}

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
 * Handles both overview and focus modes with frozen trajectory support.
 */
export function updateShipVisualization(
  refs: OrreryRefs,
  ships: ShipDisplayInfo[],
  svgPositions: Map<string, { x: number; y: number; dotR: number }>,
  gameData: GameData,
  mode: OrreryMode,
  clusterData: { childrenMap: Map<string, string[]> }
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
    dotRefs.label.setAttribute('fill', ship.color);

    // All ships same size; active ship has colored stroke ring (yellow when burning, white when coasting)
    const shipRadius = 1.5;
    dotRefs.dot.setAttribute('r', String(shipRadius));
    dotRefs.dot.removeAttribute('filter');

    if (ship.isActive) {
      // Active ship stroke: yellow during burn, white during coast
      const isBurning =
        ship.flightPlan &&
        (ship.flightPlan.phase === 'accelerating' ||
          ship.flightPlan.phase === 'decelerating');
      dotRefs.dot.setAttribute('stroke', isBurning ? '#ffc107' : '#fff');
      dotRefs.dot.setAttribute('stroke-width', String(shipRadius * 0.3));
    } else {
      dotRefs.dot.setAttribute('stroke', ship.color);
      dotRefs.dot.setAttribute('stroke-width', String(shipRadius * 0.2));
    }

    if (ship.flightPlan) {
      // Ship is in flight — show trajectory and moving dot
      const fp = ship.flightPlan;

      let originSvg: { x: number; y: number };
      let destSvg: { x: number; y: number };

      if (mode.type === 'overview') {
        // Overview mode: project using frozen trajectory positions if available
        if (fp.originPos && fp.interceptPos) {
          originSvg = projectToSvg(fp.originPos.x, fp.originPos.y);
          destSvg = projectToSvg(fp.interceptPos.x, fp.interceptPos.y);
        } else {
          const originLoc = gameData.world.locations.find(
            (l) => l.id === fp.origin
          );
          const destLoc = gameData.world.locations.find(
            (l) => l.id === fp.destination
          );
          originSvg = originLoc
            ? projectToSvg(originLoc.x, originLoc.y)
            : { x: 0, y: 0 };
          destSvg = destLoc
            ? projectToSvg(destLoc.x, destLoc.y)
            : { x: 0, y: 0 };
        }
      } else {
        // Focus mode: check if flight is within cluster
        const parentId = mode.parentId;
        const childIds = clusterData.childrenMap.get(parentId) || [];
        const isInCluster = (id: string) =>
          id === parentId || childIds.includes(id);
        const originInCluster = isInCluster(fp.origin);
        const destInCluster = isInCluster(fp.destination);

        if (!originInCluster && !destInCluster) {
          // Flight entirely outside cluster — hide this ship's trajectory
          continue;
        }

        // Compute focus mode projection
        const parentLoc = gameData.world.locations.find(
          (l) => l.id === parentId
        );
        if (!parentLoc) continue;

        const children = childIds
          .map((id) => gameData.world.locations.find((l) => l.id === id))
          .filter((l): l is WorldLocation => l !== undefined);
        const radii = children.map((c) => c.orbital!.orbitalRadiusKm);
        const logMin = Math.log10(Math.min(...radii));
        const logMax = Math.log10(Math.max(...radii));
        const parentPos = getLocationPosition(
          parentLoc,
          gameData.gameTime,
          gameData.world
        );

        const endpoints = resolveFlightEndpoints(
          fp,
          originInCluster,
          destInCluster,
          svgPositions,
          parentPos,
          gameData,
          { parentLoc, logMin, logMax }
        );
        originSvg = endpoints.originSvg;
        destSvg = endpoints.destSvg;
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

      // Trajectory line
      dotRefs.trajectory.setAttribute('x1', String(originSvg.x));
      dotRefs.trajectory.setAttribute('y1', String(originSvg.y));
      dotRefs.trajectory.setAttribute('x2', String(destSvg.x));
      dotRefs.trajectory.setAttribute('y2', String(destSvg.y));

      // Trajectory color and opacity (burn phase coloring for active ship)
      if (ship.isActive) {
        // Active ship trajectory: bright, with burn phase coloring
        if (fp.phase === 'accelerating' || fp.phase === 'decelerating') {
          dotRefs.trajectory.setAttribute('stroke', '#ffc107'); // Yellow during burn
        } else {
          dotRefs.trajectory.setAttribute('stroke', '#fff'); // White during coast
        }
        dotRefs.trajectory.setAttribute('stroke-opacity', '0.6');
      } else {
        // Inactive ship trajectory: dimmed
        dotRefs.trajectory.setAttribute('stroke', ship.color);
        dotRefs.trajectory.setAttribute('stroke-opacity', '0.25');
      }
      dotRefs.trajectory.style.display = '';

      // Ship circle at current position
      dotRefs.dot.setAttribute('cx', String(shipSvg.x));
      dotRefs.dot.setAttribute('cy', String(shipSvg.y));
      dotRefs.dot.style.display = '';

      // Label (only shown for active ship, 50% size)
      if (ship.isActive) {
        dotRefs.label.textContent = ship.shipName;
        dotRefs.label.setAttribute('x', String(shipSvg.x));
        dotRefs.label.setAttribute('y', String(shipSvg.y + 8));
        dotRefs.label.setAttribute('text-anchor', 'middle');
        dotRefs.label.setAttribute('font-size', '4');
        dotRefs.label.style.display = '';
      }
    } else if (ship.locationId) {
      // Ship is docked/orbiting — show circle at location
      const pos = svgPositions.get(ship.locationId);
      if (pos) {
        dotRefs.dot.setAttribute('cx', String(pos.x));
        dotRefs.dot.setAttribute('cy', String(pos.y));
        dotRefs.dot.style.display = '';

        // Label (only shown for active ship, 50% size)
        if (ship.isActive) {
          dotRefs.label.textContent = ship.shipName;
          dotRefs.label.setAttribute('x', String(pos.x));
          dotRefs.label.setAttribute('y', String(pos.y + 8));
          dotRefs.label.setAttribute('text-anchor', 'middle');
          dotRefs.label.setAttribute('font-size', '4');
          dotRefs.label.style.display = '';
        }
      }
    }
  }

  // Update destination ring (blue circle around active ship's destination)
  const activeShip = ships.find((s) => s.isActive);
  if (activeShip?.flightPlan) {
    const destPos = svgPositions.get(activeShip.flightPlan.destination);
    if (destPos) {
      refs.destRing.setAttribute('cx', String(destPos.x));
      refs.destRing.setAttribute('cy', String(destPos.y));
      refs.destRing.setAttribute('r', String(destPos.dotR * 1.6));
      refs.destRing.style.display = '';
    } else {
      refs.destRing.style.display = 'none';
    }
  } else {
    refs.destRing.style.display = 'none';
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
