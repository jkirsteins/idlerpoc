import type { GameData, StoryArc } from '../models';
import type { Component } from './component';
import { getActiveArcs } from '../arcDetector';
import { generateNarrative } from '../narrativeGenerator';
import { getTraitDisplayName, getTraitDescription } from '../personalitySystem';

/**
 * Stories Tab
 *
 * Mount-once / update-on-tick component displaying:
 * - Active story arcs sorted by rating
 * - Crew chronicle summaries
 * - Ship history milestones
 *
 * Follows the same pattern as logTab, crewTab, etc.
 */

export interface StoriesTabCallbacks {
  onDismissStory: (arcId: string) => void;
  onShareStory: (arcId: string) => void;
}

export function createStoriesTab(
  gameData: GameData,
  callbacks: StoriesTabCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'stories-tab';

  // --- Heading ---
  const heading = document.createElement('h3');
  heading.textContent = 'Fleet Chronicles';
  container.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.className = 'stories-subtitle';
  subtitle.textContent =
    "Stories emerge from your fleet's experiences. As your crew survives, grows, and overcomes challenges, their stories will appear here.";
  subtitle.style.color = '#a0a0b0';
  subtitle.style.marginBottom = '1rem';
  subtitle.style.fontSize = '0.85rem';
  container.appendChild(subtitle);

  // --- Active Stories Section ---
  const storiesSection = document.createElement('div');
  storiesSection.className = 'stories-section';

  const storiesHeading = document.createElement('h4');
  storiesHeading.textContent = 'Active Stories';
  storiesHeading.style.marginBottom = '0.5rem';
  storiesSection.appendChild(storiesHeading);

  const noStoriesMsg = document.createElement('p');
  noStoriesMsg.className = 'no-stories-msg';
  noStoriesMsg.textContent =
    'No stories detected yet. Keep flying — stories emerge from combat, near-death experiences, skill milestones, and more.';
  noStoriesMsg.style.color = '#666';
  noStoriesMsg.style.fontStyle = 'italic';
  storiesSection.appendChild(noStoriesMsg);

  const storyList = document.createElement('div');
  storyList.className = 'story-list';
  storiesSection.appendChild(storyList);

  container.appendChild(storiesSection);

  // --- Crew Chronicles Section ---
  const crewSection = document.createElement('div');
  crewSection.className = 'crew-chronicles-section';
  crewSection.style.marginTop = '1.5rem';

  const crewHeading = document.createElement('h4');
  crewHeading.textContent = 'Crew Chronicles';
  crewHeading.style.marginBottom = '0.5rem';
  crewSection.appendChild(crewHeading);

  const crewList = document.createElement('div');
  crewList.className = 'crew-chronicle-list';
  crewSection.appendChild(crewList);

  container.appendChild(crewSection);

  // --- Ship Histories Section ---
  const shipSection = document.createElement('div');
  shipSection.className = 'ship-histories-section';
  shipSection.style.marginTop = '1.5rem';

  const shipHeading = document.createElement('h4');
  shipHeading.textContent = 'Ship Histories';
  shipHeading.style.marginBottom = '0.5rem';
  shipSection.appendChild(shipHeading);

  const shipList = document.createElement('div');
  shipList.className = 'ship-history-list';
  shipSection.appendChild(shipList);

  container.appendChild(shipSection);

  // --- State for shallow comparison ---
  let lastArcCount = -1;
  let lastCrewCount = -1;
  let lastShipCount = -1;
  let lastArcIds = '';
  let lastCrewChronicleHash = '';
  let lastShipChronicleHash = '';

  // Stable references for story cards
  const storyCardMap = new Map<
    string,
    { el: HTMLElement; expanded: boolean }
  >();

  function update(gd: GameData): void {
    // --- Active Stories ---
    const arcs = getActiveArcs(gd);
    const arcIds = arcs.map((a) => a.id).join(',');

    if (arcIds !== lastArcIds || arcs.length !== lastArcCount) {
      lastArcIds = arcIds;
      lastArcCount = arcs.length;

      noStoriesMsg.style.display = arcs.length === 0 ? '' : 'none';

      // Reconcile story cards
      const currentIds = new Set(arcs.map((a) => a.id));

      // Remove departed
      for (const [id, card] of storyCardMap) {
        if (!currentIds.has(id)) {
          card.el.remove();
          storyCardMap.delete(id);
        }
      }

      // Add/update
      for (const arc of arcs) {
        let card = storyCardMap.get(arc.id);
        if (!card) {
          const el = createStoryCard(arc, callbacks);
          storyList.appendChild(el);
          card = { el, expanded: false };
          storyCardMap.set(arc.id, card);
        } else {
          updateStoryCard(card.el, arc);
        }
      }
    }

    // --- Crew Chronicles ---
    const allCrew = gd.ships.flatMap((s) => s.crew);
    const crewWithChronicle = allCrew.filter(
      (c) => c.chronicle && c.chronicle.length > 0
    );
    const crewHash = crewWithChronicle
      .map((c) => `${c.id}:${c.chronicle!.length}`)
      .join(',');

    if (
      crewHash !== lastCrewChronicleHash ||
      crewWithChronicle.length !== lastCrewCount
    ) {
      lastCrewChronicleHash = crewHash;
      lastCrewCount = crewWithChronicle.length;
      updateCrewChronicles(crewList, crewWithChronicle, gd);
    }

    // --- Ship Histories ---
    const shipsWithChronicle = gd.ships.filter(
      (s) => s.chronicle && s.chronicle.length > 0
    );
    const shipHash = shipsWithChronicle
      .map((s) => `${s.id}:${s.chronicle!.length}`)
      .join(',');

    if (
      shipHash !== lastShipChronicleHash ||
      shipsWithChronicle.length !== lastShipCount
    ) {
      lastShipChronicleHash = shipHash;
      lastShipCount = shipsWithChronicle.length;
      updateShipHistories(shipList, shipsWithChronicle, gd);
    }
  }

  // Initial render
  update(gameData);

  return { el: container, update };
}

// ── Story Card ──────────────────────────────────────────────────

function createStoryCard(
  arc: StoryArc,
  callbacks: StoriesTabCallbacks
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'story-card';
  card.dataset.arcId = arc.id;
  card.style.cssText =
    'border:1px solid #333;border-left:3px solid #e94560;border-radius:4px;' +
    'padding:0.75rem;margin-bottom:0.75rem;background:#1a1a2e;';

  // Header row
  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;';

  const titleEl = document.createElement('strong');
  titleEl.className = 'story-title';
  titleEl.textContent = arc.title;
  titleEl.style.color = '#e94560';
  header.appendChild(titleEl);

  const ratingEl = document.createElement('span');
  ratingEl.className = 'story-rating';
  ratingEl.textContent =
    '\u2605'.repeat(arc.rating) + '\u2606'.repeat(5 - arc.rating);
  ratingEl.style.color = '#ffc107';
  ratingEl.style.fontSize = '0.9rem';
  header.appendChild(ratingEl);

  card.appendChild(header);

  // Actor info
  const actorEl = document.createElement('div');
  actorEl.className = 'story-actor';
  actorEl.textContent = arc.actorName;
  actorEl.style.cssText =
    'font-size:0.85rem;color:#8888aa;margin-bottom:0.5rem;';
  card.appendChild(actorEl);

  // Narrative (collapsible)
  const narrativeEl = document.createElement('div');
  narrativeEl.className = 'story-narrative';
  narrativeEl.style.cssText =
    'font-size:0.85rem;color:#c0c0d0;line-height:1.5;display:none;margin-bottom:0.5rem;';
  narrativeEl.textContent = generateNarrative(arc);
  card.appendChild(narrativeEl);

  // Actions
  const actionsEl = document.createElement('div');
  actionsEl.style.cssText = 'display:flex;gap:0.5rem;';

  const readBtn = document.createElement('button');
  readBtn.className = 'story-btn';
  readBtn.textContent = 'Read';
  readBtn.style.cssText =
    'padding:0.25rem 0.5rem;font-size:0.8rem;cursor:pointer;' +
    'background:#2a2a4a;border:1px solid #444;color:#c0c0d0;border-radius:3px;';
  readBtn.addEventListener('click', () => {
    const isHidden = narrativeEl.style.display === 'none';
    narrativeEl.style.display = isHidden ? '' : 'none';
    readBtn.textContent = isHidden ? 'Collapse' : 'Read';
  });
  actionsEl.appendChild(readBtn);

  const shareBtn = document.createElement('button');
  shareBtn.className = 'story-btn';
  shareBtn.textContent = 'Share';
  shareBtn.style.cssText =
    'padding:0.25rem 0.5rem;font-size:0.8rem;cursor:pointer;' +
    'background:#2a2a4a;border:1px solid #444;color:#c0c0d0;border-radius:3px;';
  shareBtn.addEventListener('click', () => callbacks.onShareStory(arc.id));
  actionsEl.appendChild(shareBtn);

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'story-btn dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.style.cssText =
    'padding:0.25rem 0.5rem;font-size:0.8rem;cursor:pointer;' +
    'background:#2a2a4a;border:1px solid #444;color:#888;border-radius:3px;';
  dismissBtn.addEventListener('click', () => callbacks.onDismissStory(arc.id));
  actionsEl.appendChild(dismissBtn);

  card.appendChild(actionsEl);

  return card;
}

function updateStoryCard(el: HTMLElement, arc: StoryArc): void {
  const titleEl = el.querySelector('.story-title');
  if (titleEl && titleEl.textContent !== arc.title) {
    titleEl.textContent = arc.title;
  }
  const ratingEl = el.querySelector('.story-rating');
  if (ratingEl) {
    const stars = '\u2605'.repeat(arc.rating) + '\u2606'.repeat(5 - arc.rating);
    if (ratingEl.textContent !== stars) {
      ratingEl.textContent = stars;
    }
  }
}

// ── Crew Chronicles ─────────────────────────────────────────────

import type { CrewMember, Ship } from '../models';

function updateCrewChronicles(
  container: HTMLElement,
  crew: CrewMember[],
  _gameData: GameData
): void {
  // Clear and rebuild (crew chronicles change infrequently)
  while (container.lastChild) container.removeChild(container.lastChild);

  if (crew.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'No crew chronicles yet.';
    msg.style.cssText = 'color:#666;font-style:italic;';
    container.appendChild(msg);
    return;
  }

  for (const member of crew) {
    const chronicle = member.chronicle;
    if (!chronicle || chronicle.length === 0) continue;

    const row = document.createElement('div');
    row.style.cssText =
      'padding:0.5rem;margin-bottom:0.5rem;background:#16162a;border-radius:4px;';

    // Name and personality
    const nameRow = document.createElement('div');
    nameRow.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;';

    const nameEl = document.createElement('strong');
    nameEl.textContent = member.name;
    nameEl.style.color = '#c0c0e0';
    nameRow.appendChild(nameEl);

    if (member.personality) {
      const traitEl = document.createElement('span');
      traitEl.textContent = `${getTraitDisplayName(member.personality.trait1)}, ${getTraitDisplayName(member.personality.trait2)}`;
      traitEl.style.cssText = 'font-size:0.8rem;color:#8888aa;';
      traitEl.title = `${getTraitDescription(member.personality.trait1)} | ${getTraitDescription(member.personality.trait2)}`;
      nameRow.appendChild(traitEl);
    }

    row.appendChild(nameRow);

    // Stats summary
    const stats = document.createElement('div');
    stats.style.cssText = 'font-size:0.8rem;color:#888;margin-top:0.25rem;';

    const nearDeaths = chronicle.filter((e) => e.type === 'near_death').length;
    const combats = chronicle.filter(
      (e) =>
        e.type === 'combat_victory' ||
        e.type === 'boarding_survived' ||
        e.type === 'close_call'
    ).length;
    const milestones = chronicle.filter(
      (e) => e.type === 'skill_milestone'
    ).length;

    const parts: string[] = [];
    parts.push(`${chronicle.length} events`);
    if (nearDeaths > 0) parts.push(`${nearDeaths} near-death`);
    if (combats > 0) parts.push(`${combats} combat`);
    if (milestones > 0) parts.push(`${milestones} milestones`);

    stats.textContent = parts.join(' \u00b7 ');
    row.appendChild(stats);

    container.appendChild(row);
  }
}

// ── Ship Histories ──────────────────────────────────────────────

function updateShipHistories(
  container: HTMLElement,
  ships: Ship[],
  _gameData: GameData
): void {
  while (container.lastChild) container.removeChild(container.lastChild);

  if (ships.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'No ship histories yet.';
    msg.style.cssText = 'color:#666;font-style:italic;';
    container.appendChild(msg);
    return;
  }

  for (const ship of ships) {
    const chronicle = ship.chronicle;
    if (!chronicle || chronicle.length === 0) continue;

    const row = document.createElement('div');
    row.style.cssText =
      'padding:0.5rem;margin-bottom:0.5rem;background:#16162a;border-radius:4px;';

    const nameEl = document.createElement('strong');
    nameEl.textContent = ship.name;
    nameEl.style.color = '#c0c0e0';
    row.appendChild(nameEl);

    const stats = document.createElement('div');
    stats.style.cssText = 'font-size:0.8rem;color:#888;margin-top:0.25rem;';

    const deaths = chronicle.filter((e) => e.type === 'death').length;
    const combats = chronicle.filter(
      (e) =>
        e.type === 'combat_victory' ||
        e.type === 'boarding_survived' ||
        e.type === 'close_call'
    ).length;
    const rescues = chronicle.filter(
      (e) => e.type === 'rescue_participant'
    ).length;

    const parts: string[] = [];
    parts.push(`${chronicle.length} events`);
    if (deaths > 0) parts.push(`${deaths} crew lost`);
    if (combats > 0) parts.push(`${combats} combat`);
    if (rescues > 0) parts.push(`${rescues} rescues`);

    stats.textContent = parts.join(' \u00b7 ');
    row.appendChild(stats);

    container.appendChild(row);
  }
}
