/**
 * Inline SVG Icon System
 *
 * Monochrome icons using `currentColor` so they inherit the parent's text
 * color.  Each function returns an `<svg>` element at the requested size
 * (default 16px).  Icons are designed for 24-unit viewBox and scale cleanly.
 */

type IconSize = 16 | 20 | 24;

function svg(paths: string, size: IconSize = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '2');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'inline-block';
  el.style.verticalAlign = 'middle';
  el.style.flexShrink = '0';
  el.innerHTML = paths;
  return el;
}

function filledSvg(paths: string, size: IconSize = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('fill', 'currentColor');
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'inline-block';
  el.style.verticalAlign = 'middle';
  el.style.flexShrink = '0';
  el.innerHTML = paths;
  return el;
}

// ── Transport / Navigation ───────────────────────────────────────────

/** Play triangle (right-pointing) */
export function iconPlay(size: IconSize = 16): SVGSVGElement {
  return filledSvg('<polygon points="6,4 20,12 6,20"/>', size);
}

/** Pause (two vertical bars) */
export function iconPause(size: IconSize = 16): SVGSVGElement {
  return filledSvg(
    '<rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/>',
    size
  );
}

/** Skip forward (advance day) */
export function iconSkipForward(size: IconSize = 16): SVGSVGElement {
  return filledSvg(
    '<polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="3" height="16"/>',
    size
  );
}

/** Navigation / compass rose */
export function iconNavigation(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<polygon points="3,11 22,2 13,21 11,13 3,11" fill="currentColor" stroke="none"/>',
    size
  );
}

/** Ship silhouette */
export function iconShip(size: IconSize = 16): SVGSVGElement {
  return svg('<path d="M2 20l2-7h16l2 7"/><path d="M6 13V8l6-5 6 5v5"/>', size);
}

// ── Resources ────────────────────────────────────────────────────────

/** Fuel droplet */
export function iconFuel(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<path d="M12 2C12 2 5 10 5 15a7 7 0 0014 0C19 10 12 2 12 2z"/>',
    size
  );
}

/** Credits / coin */
export function iconCredits(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="12" cy="12" r="10"/><path d="M14.5 9a3.5 3.5 0 00-5 0"/><path d="M9.5 15a3.5 3.5 0 005 0"/><line x1="12" y1="6" x2="12" y2="18"/>',
    size
  );
}

/** Credits gained (coin with plus) */
export function iconCreditsGained(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="10" cy="12" r="8"/><line x1="10" y1="8" x2="10" y2="16"/><path d="M7 11a3 3 0 003 3"/><path d="M13 13a3 3 0 00-3-3"/><line x1="19" y1="5" x2="19" y2="11"/><line x1="16" y1="8" x2="22" y2="8"/>',
    size
  );
}

/** Credits lost (coin with minus) */
export function iconCreditsLost(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="10" cy="12" r="8"/><line x1="10" y1="8" x2="10" y2="16"/><path d="M7 11a3 3 0 003 3"/><path d="M13 13a3 3 0 00-3-3"/><line x1="16" y1="8" x2="22" y2="8"/>',
    size
  );
}

// ── Combat / Encounters ──────────────────────────────────────────────

/** Shield (evade) */
export function iconShield(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z"/>',
    size
  );
}

/** Crossed swords (combat victory) */
export function iconSwords(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<line x1="4" y1="20" x2="18" y2="6"/><polyline points="15,3 21,3 21,9"/><line x1="20" y1="20" x2="6" y2="6"/><polyline points="9,3 3,3 3,9"/>',
    size
  );
}

/** Handshake (negotiation) */
export function iconHandshake(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<path d="M11 17l-5-5 3-3 5 5"/><path d="M13 7l5 5-3 3-5-5"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M8 7l2-2"/><path d="M14 17l2-2"/>',
    size
  );
}

// ── Status / Alerts ──────────────────────────────────────────────────

/** Warning triangle */
export function iconWarning(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>',
    size
  );
}

/** Circle with exclamation (boarding / critical) */
export function iconAlertCircle(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>',
    size
  );
}

/** Info circle */
export function iconInfo(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/>',
    size
  );
}

/** Star (level up / achievement) */
export function iconStar(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor" stroke="none"/>',
    size
  );
}

// ── Environment / Hazards ────────────────────────────────────────────

/** Radiation trefoil */
export function iconRadiation(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 00-8.66 5l4.33 2.5a4 4 0 014.33-2.5V2z" fill="currentColor" stroke="none"/><path d="M3.34 7A10 10 0 003.34 17l4.33-2.5a4 4 0 010-5L3.34 7z" fill="currentColor" stroke="none"/><path d="M20.66 7l-4.33 2.5a4 4 0 010 5l4.33 2.5a10 10 0 000-10z" fill="currentColor" stroke="none"/><path d="M12 22a10 10 0 008.66-5l-4.33-2.5a4 4 0 01-4.33 2.5V22z" fill="currentColor" stroke="none"/>',
    size
  );
}

// ── People / Crew ────────────────────────────────────────────────────

/** Single person (crew member) */
export function iconCrew(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0113 0"/>',
    size
  );
}

// ── Misc ─────────────────────────────────────────────────────────────

/** Gear / cog (settings) */
export function iconSettings(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    size
  );
}

/** Map pin */
export function iconMapPin(size: IconSize = 16): SVGSVGElement {
  return svg(
    '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
    size
  );
}

/** Chevron right */
export function iconChevronRight(size: IconSize = 16): SVGSVGElement {
  return svg('<polyline points="9,6 15,12 9,18"/>', size);
}

/** Chevron down */
export function iconChevronDown(size: IconSize = 16): SVGSVGElement {
  return svg('<polyline points="6,9 12,15 18,9"/>', size);
}

/**
 * Helper: return an SVG icon element for a toast notification type.
 * Falls back to the info icon for unknown types.
 */
export function getToastIconSvg(
  type: string,
  size: IconSize = 16
): SVGSVGElement {
  switch (type) {
    case 'encounter_evaded':
      return iconShield(size);
    case 'encounter_negotiated':
      return iconHandshake(size);
    case 'encounter_victory':
      return iconSwords(size);
    case 'encounter_harassment':
      return iconWarning(size);
    case 'encounter_boarding':
      return iconAlertCircle(size);
    case 'level_up':
      return iconStar(size);
    case 'credits_gained':
      return iconCreditsGained(size);
    case 'credits_lost':
      return iconCreditsLost(size);
    case 'radiation_spike':
      return iconRadiation(size);
    default:
      return iconInfo(size);
  }
}
