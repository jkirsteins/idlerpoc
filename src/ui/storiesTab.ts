import type { GameData, StoryArc, CrewMember, Ship } from '../models';
import { COMBAT_EVENT_TYPES } from '../models';
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
 * Follows the Component pattern (see component.ts):
 * - Container element created once, never replaced
 * - update() patches in-place using stable element references
 * - Variable-length lists reconciled via Map<id, refs>
 * - Never uses replaceChildren() or while-clear loops
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

  const noCrewMsg = document.createElement('p');
  noCrewMsg.textContent = 'No crew chronicles yet.';
  noCrewMsg.style.cssText = 'color:#666;font-style:italic;';
  crewSection.appendChild(noCrewMsg);

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

  const noShipMsg = document.createElement('p');
  noShipMsg.textContent = 'No ship histories yet.';
  noShipMsg.style.cssText = 'color:#666;font-style:italic;';
  shipSection.appendChild(noShipMsg);

  const shipList = document.createElement('div');
  shipList.className = 'ship-history-list';
  shipSection.appendChild(shipList);

  container.appendChild(shipSection);

  // --- Stable references for reconciliation ---

  // Story cards: Map<arcId, {el, refs}>
  const storyCardMap = new Map<
    string,
    {
      el: HTMLElement;
      titleEl: HTMLElement;
      ratingEl: HTMLElement;
      actorEl: HTMLElement;
      narrativeEl: HTMLElement;
      expanded: boolean;
    }
  >();

  // Crew chronicle rows: Map<crewId, {el, refs}>
  interface CrewRowRefs {
    el: HTMLElement;
    nameEl: HTMLElement;
    traitEl: HTMLElement;
    statsEl: HTMLElement;
    lastHash: string;
  }
  const crewRowMap = new Map<string, CrewRowRefs>();

  // Ship history rows: Map<shipId, {el, refs}>
  interface ShipRowRefs {
    el: HTMLElement;
    nameEl: HTMLElement;
    statsEl: HTMLElement;
    lastHash: string;
  }
  const shipRowMap = new Map<string, ShipRowRefs>();

  // Previous state for shallow comparison
  let lastArcIds = '';

  function update(gd: GameData): void {
    updateStoryCards(gd);
    updateCrewChronicles(gd);
    updateShipHistories(gd);
  }

  function updateStoryCards(gd: GameData): void {
    const arcs = getActiveArcs(gd);
    const arcIds = arcs.map((a) => a.id).join(',');

    if (arcIds === lastArcIds) return;
    lastArcIds = arcIds;

    noStoriesMsg.style.display = arcs.length === 0 ? '' : 'none';

    const currentIds = new Set(arcs.map((a) => a.id));

    // Remove departed cards
    for (const [id, card] of storyCardMap) {
      if (!currentIds.has(id)) {
        card.el.remove();
        storyCardMap.delete(id);
      }
    }

    // Add new / update existing
    // Arcs are sorted by rating (highest first) — auto-expand the top card
    const highestArcId = arcs.length > 0 ? arcs[0].id : null;
    for (const arc of arcs) {
      const card = storyCardMap.get(arc.id);
      if (!card) {
        const isHighest = arc.id === highestArcId;
        const el = createStoryCard(arc, callbacks, isHighest);
        storyList.appendChild(el.container);
        storyCardMap.set(arc.id, el);
      } else {
        // Patch in-place
        if (card.titleEl.textContent !== arc.title) {
          card.titleEl.textContent = arc.title;
        }
        const stars =
          '\u2605'.repeat(arc.rating) + '\u2606'.repeat(5 - arc.rating);
        if (card.ratingEl.textContent !== stars) {
          card.ratingEl.textContent = stars;
        }
        if (card.actorEl.textContent !== arc.actorName) {
          card.actorEl.textContent = arc.actorName;
        }
      }
    }
  }

  function updateCrewChronicles(gd: GameData): void {
    const allCrew = gd.ships.flatMap((s) => s.crew);
    const crewWithChronicle = allCrew.filter(
      (c) => c.chronicle && c.chronicle.length > 0
    );

    noCrewMsg.style.display = crewWithChronicle.length === 0 ? '' : 'none';

    const activeIds = new Set(crewWithChronicle.map((c) => c.id));

    // Remove departed crew
    for (const [id, row] of crewRowMap) {
      if (!activeIds.has(id)) {
        row.el.remove();
        crewRowMap.delete(id);
      }
    }

    // Add new / update existing
    for (const member of crewWithChronicle) {
      const chronicle = member.chronicle!;
      const hash = `${member.id}:${chronicle.length}:${member.name}`;

      let row = crewRowMap.get(member.id);
      if (!row) {
        row = createCrewRow(member);
        crewList.appendChild(row.el);
        crewRowMap.set(member.id, row);
      }

      if (row.lastHash !== hash) {
        row.lastHash = hash;
        patchCrewRow(row, member, chronicle);
      }
    }
  }

  function updateShipHistories(gd: GameData): void {
    const shipsWithChronicle = gd.ships.filter(
      (s) => s.chronicle && s.chronicle.length > 0
    );

    noShipMsg.style.display = shipsWithChronicle.length === 0 ? '' : 'none';

    const activeIds = new Set(shipsWithChronicle.map((s) => s.id));

    // Remove departed ships
    for (const [id, row] of shipRowMap) {
      if (!activeIds.has(id)) {
        row.el.remove();
        shipRowMap.delete(id);
      }
    }

    // Add new / update existing
    for (const ship of shipsWithChronicle) {
      const chronicle = ship.chronicle!;
      const hash = `${ship.id}:${chronicle.length}:${ship.name}`;

      let row = shipRowMap.get(ship.id);
      if (!row) {
        row = createShipRow(ship);
        shipList.appendChild(row.el);
        shipRowMap.set(ship.id, row);
      }

      if (row.lastHash !== hash) {
        row.lastHash = hash;
        patchShipRow(row, ship, chronicle);
      }
    }
  }

  // Initial render
  update(gameData);

  return { el: container, update };
}

// ── Story Card (mount-once per arc) ─────────────────────────────

function createStoryCard(
  arc: StoryArc,
  callbacks: StoriesTabCallbacks,
  autoExpand: boolean = false
): {
  container: HTMLElement;
  el: HTMLElement;
  titleEl: HTMLElement;
  ratingEl: HTMLElement;
  actorEl: HTMLElement;
  narrativeEl: HTMLElement;
  expanded: boolean;
} {
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
    'font-size:0.85rem;color:#c0c0d0;line-height:1.5;margin-bottom:0.5rem;' +
    (autoExpand ? '' : 'display:none;');
  narrativeEl.textContent = generateNarrative(arc);
  card.appendChild(narrativeEl);

  // Actions
  const actionsEl = document.createElement('div');
  actionsEl.style.cssText = 'display:flex;gap:0.5rem;';

  const readBtn = document.createElement('button');
  readBtn.className = 'story-btn';
  readBtn.textContent = autoExpand ? 'Collapse' : 'Read';
  readBtn.style.cssText =
    'padding:0.25rem 0.5rem;font-size:0.8rem;cursor:pointer;' +
    'background:#2a2a4a;border:1px solid #444;color:#c0c0d0;border-radius:3px;';
  let expanded = autoExpand;
  readBtn.addEventListener('click', () => {
    expanded = !expanded;
    narrativeEl.style.display = expanded ? '' : 'none';
    readBtn.textContent = expanded ? 'Collapse' : 'Read';
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

  return {
    container: card,
    el: card,
    titleEl,
    ratingEl,
    actorEl,
    narrativeEl,
    expanded,
  };
}

// ── Crew Chronicle Row (mount-once per crew) ────────────────────

function createCrewRow(member: CrewMember): {
  el: HTMLElement;
  nameEl: HTMLElement;
  traitEl: HTMLElement;
  statsEl: HTMLElement;
  lastHash: string;
} {
  const row = document.createElement('div');
  row.style.cssText =
    'padding:0.5rem;margin-bottom:0.5rem;background:#16162a;border-radius:4px;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;';

  const nameEl = document.createElement('strong');
  nameEl.textContent = member.name;
  nameEl.style.color = '#c0c0e0';
  nameRow.appendChild(nameEl);

  const traitEl = document.createElement('span');
  traitEl.style.cssText = 'font-size:0.8rem;color:#8888aa;';
  if (member.personality) {
    traitEl.textContent = `${getTraitDisplayName(member.personality.trait1)}, ${getTraitDisplayName(member.personality.trait2)}`;
    traitEl.title = `${getTraitDescription(member.personality.trait1)} | ${getTraitDescription(member.personality.trait2)}`;
  }
  nameRow.appendChild(traitEl);

  row.appendChild(nameRow);

  const statsEl = document.createElement('div');
  statsEl.style.cssText = 'font-size:0.8rem;color:#888;margin-top:0.25rem;';
  row.appendChild(statsEl);

  return { el: row, nameEl, traitEl, statsEl, lastHash: '' };
}

function patchCrewRow(
  row: { nameEl: HTMLElement; traitEl: HTMLElement; statsEl: HTMLElement },
  member: CrewMember,
  chronicle: NonNullable<CrewMember['chronicle']>
): void {
  if (row.nameEl.textContent !== member.name) {
    row.nameEl.textContent = member.name;
  }

  if (member.personality) {
    const traitText = `${getTraitDisplayName(member.personality.trait1)}, ${getTraitDisplayName(member.personality.trait2)}`;
    if (row.traitEl.textContent !== traitText) {
      row.traitEl.textContent = traitText;
      row.traitEl.title = `${getTraitDescription(member.personality.trait1)} | ${getTraitDescription(member.personality.trait2)}`;
    }
  }

  const nearDeaths = chronicle.filter((e) => e.type === 'near_death').length;
  const combats = chronicle.filter((e) =>
    COMBAT_EVENT_TYPES.includes(e.type)
  ).length;
  const milestones = chronicle.filter(
    (e) => e.type === 'skill_milestone'
  ).length;

  const parts: string[] = [`${chronicle.length} events`];
  if (nearDeaths > 0) parts.push(`${nearDeaths} near-death`);
  if (combats > 0) parts.push(`${combats} combat`);
  if (milestones > 0) parts.push(`${milestones} milestones`);

  const statsText = parts.join(' \u00b7 ');
  if (row.statsEl.textContent !== statsText) {
    row.statsEl.textContent = statsText;
  }
}

// ── Ship History Row (mount-once per ship) ──────────────────────

function createShipRow(ship: Ship): {
  el: HTMLElement;
  nameEl: HTMLElement;
  statsEl: HTMLElement;
  lastHash: string;
} {
  const row = document.createElement('div');
  row.style.cssText =
    'padding:0.5rem;margin-bottom:0.5rem;background:#16162a;border-radius:4px;';

  const nameEl = document.createElement('strong');
  nameEl.textContent = ship.name;
  nameEl.style.color = '#c0c0e0';
  row.appendChild(nameEl);

  const statsEl = document.createElement('div');
  statsEl.style.cssText = 'font-size:0.8rem;color:#888;margin-top:0.25rem;';
  row.appendChild(statsEl);

  return { el: row, nameEl, statsEl, lastHash: '' };
}

function patchShipRow(
  row: { nameEl: HTMLElement; statsEl: HTMLElement },
  ship: Ship,
  chronicle: NonNullable<Ship['chronicle']>
): void {
  if (row.nameEl.textContent !== ship.name) {
    row.nameEl.textContent = ship.name;
  }

  const deaths = chronicle.filter((e) => e.type === 'death').length;
  const combats = chronicle.filter((e) =>
    COMBAT_EVENT_TYPES.includes(e.type)
  ).length;
  const rescues = chronicle.filter(
    (e) => e.type === 'rescue_participant'
  ).length;

  const parts: string[] = [`${chronicle.length} events`];
  if (deaths > 0) parts.push(`${deaths} crew lost`);
  if (combats > 0) parts.push(`${combats} combat`);
  if (rescues > 0) parts.push(`${rescues} rescues`);

  const statsText = parts.join(' \u00b7 ');
  if (row.statsEl.textContent !== statsText) {
    row.statsEl.textContent = statsText;
  }
}
