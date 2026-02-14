import { getLocationPosition } from '../orbitalMechanics';
import type { Vec2, WorldLocation, World } from '../models';

/**
 * Map an orbital radius (km) to SVG visual radius.
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
export function projectToSvg(xKm: number, yKm: number): { x: number; y: number } {
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
  return 30 + t * 150; // same 30..180 SVG range as overview
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

/**
 * Compute frozen trajectory endpoints in local (focus mode) SVG coordinates.
 *
 * originPos is frozen at departure time, interceptPos at arrival time.
 * Each endpoint is projected using the parent body's position at the
 * matching time so the local angle is correct for both ends.
 *
 * @param departureGameTime When originPos was frozen (launch time).
 *   Falls back to arrivalGameTime for legacy saves where both were
 *   frozen at the same time.
 */
export function computeFrozenTrajectoryLocal(
  originPos: Vec2,
  interceptPos: Vec2,
  arrivalGameTime: number,
  parentLoc: WorldLocation,
  world: World,
  logMin: number,
  logMax: number,
  departureGameTime?: number
): { originSvg: { x: number; y: number }; destSvg: { x: number; y: number } } {
  const originTime = departureGameTime ?? arrivalGameTime;
  const parentPosAtDeparture = getLocationPosition(parentLoc, originTime, world);
  const parentPosAtArrival = getLocationPosition(parentLoc, arrivalGameTime, world);
  const originSvg = projectToSvgLocal(parentPosAtDeparture, originPos, logMin, logMax);
  const destSvg = projectToSvgLocal(parentPosAtArrival, interceptPos, logMin, logMax);
  return { originSvg, destSvg };
}
