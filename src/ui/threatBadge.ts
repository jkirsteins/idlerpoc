import type { ThreatLevel } from '../models';

/**
 * Create a reusable threat level badge element.
 * Used in quest cards, navigation legend, and flight status.
 */
export function renderThreatBadge(
  level: ThreatLevel,
  narrative: string
): HTMLElement {
  const badge = document.createElement('div');
  badge.className = `threat-badge threat-${level}`;

  const label = document.createElement('span');
  label.className = 'threat-label';
  label.textContent = level.toUpperCase();
  badge.appendChild(label);

  const narrativeSpan = document.createElement('span');
  narrativeSpan.className = 'threat-narrative';
  narrativeSpan.textContent = narrative;
  badge.appendChild(narrativeSpan);

  return badge;
}
