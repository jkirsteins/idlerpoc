import type {
  GameData,
  StoryArc,
  ArcType,
  CrewMember,
  Ship,
  CommentaryEntry,
} from '../models';
import { COMBAT_EVENT_TYPES } from '../models';
import type { Component } from './component';
import { getActiveArcs } from '../arcDetector';
import { generateNarrative } from '../narrativeGenerator';
import { getTraitDisplayName, getTraitDescription } from '../personalitySystem';
import { formatGameDate } from '../timeSystem';
import { ARC_GALLERY, type ArcGalleryEntry } from '../arcPatterns';

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

  // --- Ship's Log Section (commentary) ---
  const logSection = document.createElement('div');
  logSection.className = 'ships-log-section';
  logSection.style.marginBottom = '1.5rem';

  const logHeading = document.createElement('h4');
  logHeading.textContent = "Ship's Log";
  logHeading.style.marginBottom = '0.5rem';
  logSection.appendChild(logHeading);

  const noLogMsg = document.createElement('p');
  noLogMsg.textContent =
    'Your crew is settling in. Personal observations will appear here as they experience life aboard.';
  noLogMsg.style.cssText = 'color:#666;font-style:italic;font-size:0.85rem;';
  logSection.appendChild(noLogMsg);

  const logList = document.createElement('div');
  logList.className = 'ships-log-list';
  logSection.appendChild(logList);

  container.appendChild(logSection);

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

  // --- Possible Stories Gallery (dimmed/locked) ---
  const gallerySection = document.createElement('div');
  gallerySection.className = 'arc-gallery-section';
  gallerySection.style.marginTop = '1.5rem';

  const galleryHeading = document.createElement('h4');
  galleryHeading.textContent = 'Possible Stories';
  galleryHeading.style.marginBottom = '0.5rem';
  gallerySection.appendChild(galleryHeading);

  const gallerySubtitle = document.createElement('p');
  gallerySubtitle.style.cssText =
    'color:#666;font-size:0.8rem;margin-bottom:0.75rem;';
  gallerySubtitle.textContent =
    "These stories can emerge from your fleet's experiences.";
  gallerySection.appendChild(gallerySubtitle);

  const galleryList = document.createElement('div');
  galleryList.className = 'arc-gallery-list';
  galleryList.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;';
  gallerySection.appendChild(galleryList);

  // Pre-create gallery cards (static, patched for seen/unseen state)
  const galleryCardMap = new Map<ArcType, { el: HTMLElement; seen: boolean }>();

  for (const entry of ARC_GALLERY) {
    const card = createGalleryCard(entry);
    galleryList.appendChild(card.el);
    galleryCardMap.set(entry.arcType, card);
  }

  container.appendChild(gallerySection);

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

  // Commentary log entries: Map<index, {el, refs}>
  const logEntryMap = new Map<number, HTMLElement>();
  let lastCommentaryCount = 0;

  /** Max visible commentary entries in the Ship's Log. */
  const MAX_VISIBLE_LOG = 8;

  // Previous state for shallow comparison
  let lastArcIds = '';

  function update(gd: GameData): void {
    updateShipsLog(gd);
    updateStoryCards(gd);
    updateGallery(gd);
    updateCrewChronicles(gd);
    updateShipHistories(gd);
  }

  function updateShipsLog(gd: GameData): void {
    const commentary = gd.stories?.commentary ?? [];
    if (commentary.length === lastCommentaryCount) return;
    lastCommentaryCount = commentary.length;

    noLogMsg.style.display = commentary.length === 0 ? '' : 'none';

    // Show the most recent entries (newest first)
    const visible = commentary.slice(-MAX_VISIBLE_LOG).reverse();

    // Remove entries that are no longer in the visible window
    const visibleGameTimes = new Set(visible.map((e) => e.gameTime));
    for (const [gt, el] of logEntryMap) {
      if (!visibleGameTimes.has(gt)) {
        el.remove();
        logEntryMap.delete(gt);
      }
    }

    // Add new entries (prepend = newest at top)
    for (let i = visible.length - 1; i >= 0; i--) {
      const entry = visible[i];
      if (logEntryMap.has(entry.gameTime)) continue;

      const el = createLogEntry(entry);
      // Insert at the correct position (index i from top)
      if (logList.children[i]) {
        logList.insertBefore(el, logList.children[i]);
      } else {
        logList.appendChild(el);
      }
      logEntryMap.set(entry.gameTime, el);
    }
  }

  function updateGallery(gd: GameData): void {
    // Build set of arc types the player has seen (active or dismissed)
    const seenTypes = new Set<ArcType>();
    for (const arc of gd.stories?.detectedArcs ?? []) {
      seenTypes.add(arc.arcType);
    }
    for (const key of gd.stories?.dismissedArcIds ?? []) {
      const arcType = key.split(':')[0] as ArcType;
      seenTypes.add(arcType);
    }

    // Update each gallery card's dimmed/seen state
    for (const [arcType, card] of galleryCardMap) {
      const nowSeen = seenTypes.has(arcType);
      if (nowSeen !== card.seen) {
        card.seen = nowSeen;
        card.el.style.opacity = nowSeen ? '0.3' : '0.5';
        if (nowSeen) {
          card.el.style.textDecoration = 'line-through';
        } else {
          card.el.style.textDecoration = '';
        }
      }
    }
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

// ── Gallery Card (mount-once per arc type) ──────────────────────

function createGalleryCard(entry: ArcGalleryEntry): {
  el: HTMLElement;
  seen: boolean;
} {
  const card = document.createElement('div');
  card.style.cssText =
    'display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.6rem;' +
    'background:#16162a;border:1px solid #2a2a3e;border-radius:4px;' +
    'opacity:0.5;font-size:0.78rem;white-space:nowrap;';
  card.title = entry.hint;

  // Lock icon
  const lockIcon = document.createElement('span');
  lockIcon.textContent = '\u{1F512}';
  lockIcon.style.fontSize = '0.7rem';
  card.appendChild(lockIcon);

  // Arc title
  const titleSpan = document.createElement('span');
  titleSpan.textContent = entry.title;
  titleSpan.style.color = '#8888aa';
  card.appendChild(titleSpan);

  // Actor type badge
  const badge = document.createElement('span');
  badge.textContent = entry.actorType === 'crew' ? 'crew' : 'ship';
  badge.style.cssText =
    'font-size:0.65rem;color:#555;border:1px solid #333;border-radius:2px;' +
    'padding:0 0.2rem;';
  card.appendChild(badge);

  return { el: card, seen: false };
}

// ── Commentary Log Entry ────────────────────────────────────────

function createLogEntry(entry: CommentaryEntry): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'padding:0.4rem 0.6rem;margin-bottom:0.4rem;background:#16162a;' +
    'border-left:2px solid #4a9eff;border-radius:3px;font-size:0.85rem;line-height:1.4;';

  const dateSpan = document.createElement('span');
  dateSpan.style.cssText =
    'color:#4a9eff;font-weight:bold;margin-right:0.5rem;white-space:nowrap;';
  dateSpan.textContent = formatGameDate(entry.gameTime);
  el.appendChild(dateSpan);

  const textSpan = document.createElement('span');
  textSpan.style.color = '#c0c0d0';
  textSpan.textContent = entry.text;
  el.appendChild(textSpan);

  return el;
}
