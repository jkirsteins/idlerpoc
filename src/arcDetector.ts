import type { GameData, StoryArc, ArcType, Ship } from './models';
import { FIRST_CHAPTER_ARC_TYPES } from './models';
import { ALL_ARC_PATTERNS, type ArcMatch } from './arcPatterns';
import { generateId } from './utils';

/**
 * Arc Detection Engine
 *
 * Periodically scans crew and ship chronicles for qualifying event
 * sequences that form narratively interesting arcs. Detected arcs
 * are stored in gameData.stories.detectedArcs.
 *
 * Detection runs:
 *   - Every ARC_SCAN_INTERVAL ticks (~1 game day / ~8 real minutes)
 *   - Once after catch-up completes
 *
 * See docs/emergent-storytelling.md for the full pattern catalog.
 */

/** Ticks between automatic arc scans (~1 game day) */
export const ARC_SCAN_INTERVAL = 480;

/** Maximum detected arcs to retain */
const MAX_ARCS = 30;

/**
 * Maximum dismissed arc keys to retain.
 * Prevents unbounded growth from long playthroughs.
 */
const MAX_DISMISSED_IDS = 100;

/**
 * Arc type → gameplay effect mapping.
 * Each active arc grants a small multiplier bonus (rating * 0.01, so 1-5%)
 * to the associated effect. The bonus derives from the arc's rating, which
 * itself is computed from chronicle event analysis — so this traces back to
 * simulated gameplay events rather than being an arbitrary flat bonus.
 */
const ARC_EFFECT_MAP: Partial<
  Record<ArcType, { effect: string; label: string }>
> = {
  survivor: { effect: 'health_recovery', label: 'Health recovery' },
  rags_to_riches: { effect: 'training_speed', label: 'Training speed' },
  old_reliable: { effect: 'training_speed', label: 'Training speed' },
  legend_pilot: { effect: 'fuel_efficiency', label: 'Fuel efficiency' },
  battle_brothers: { effect: 'combat_attack', label: 'Combat effectiveness' },
  mentor_protege: { effect: 'training_speed', label: 'Training speed' },
  lucky_ship: { effect: 'evasion', label: 'Evasion chance' },
  from_ashes: { effect: 'training_speed', label: 'Crew training speed' },
  iron_crew: { effect: 'combat_attack', label: 'Combat resolve' },
};

/**
 * Ensure the stories state object exists on gameData.
 * All fields are optional with safe defaults — no save migration needed.
 */
function ensureStories(gameData: GameData): NonNullable<GameData['stories']> {
  if (!gameData.stories) {
    gameData.stories = {
      detectedArcs: [],
      dismissedArcIds: [],
      lastScanGameTime: 0,
    };
  }
  return gameData.stories;
}

/**
 * Detect story arcs across all crew and ships in the fleet.
 * Returns newly detected arcs (those not already in the detected list).
 */
export function detectArcs(gameData: GameData): StoryArc[] {
  const stories = ensureStories(gameData);
  const existingKeys = new Set(stories.detectedArcs.map((a) => arcKey(a)));
  const dismissedKeys = new Set(stories.dismissedArcIds);

  const newArcs: StoryArc[] = [];

  // Scan crew chronicles
  for (const ship of gameData.ships) {
    for (const crew of ship.crew) {
      const chronicle = crew.chronicle;
      if (!chronicle || chronicle.length === 0) continue;

      for (const pattern of ALL_ARC_PATTERNS) {
        if (pattern.actorType !== 'crew' && pattern.actorType !== 'both')
          continue;

        const match = pattern.detect(chronicle, crew, gameData);
        if (!match) continue;

        const key = `${pattern.arcType}:${crew.id}`;
        if (existingKeys.has(key) || dismissedKeys.has(key)) continue;

        const arc = matchToArc(
          match,
          pattern.arcType,
          crew.id,
          crew.name,
          ship,
          gameData
        );
        newArcs.push(arc);
        existingKeys.add(key);
      }
    }

    // Scan ship chronicles
    const shipChronicle = ship.chronicle;
    if (shipChronicle && shipChronicle.length > 0) {
      for (const pattern of ALL_ARC_PATTERNS) {
        if (pattern.actorType !== 'ship' && pattern.actorType !== 'both')
          continue;

        const match = pattern.detect(shipChronicle, ship, gameData);
        if (!match) continue;

        const key = `${pattern.arcType}:${ship.id}`;
        if (existingKeys.has(key) || dismissedKeys.has(key)) continue;

        const arc = matchToArc(
          match,
          pattern.arcType,
          ship.id,
          ship.name,
          ship,
          gameData
        );
        newArcs.push(arc);
        existingKeys.add(key);
      }
    }
  }

  // Scan dead crew archives
  const deadArchive = stories.deadCrewArchive ?? [];
  for (const dead of deadArchive) {
    if (dead.chronicle.length === 0) continue;

    for (const pattern of ALL_ARC_PATTERNS) {
      if (pattern.actorType !== 'crew' && pattern.actorType !== 'both')
        continue;

      // DeadCrewArchive satisfies ArcCrewActor — no cast needed
      const match = pattern.detect(dead.chronicle, dead, gameData);
      if (!match) continue;

      const key = `${pattern.arcType}:${dead.id}`;
      if (existingKeys.has(key) || dismissedKeys.has(key)) continue;

      // Find the ship this crew served on (may still exist)
      const ship = gameData.ships.find((s) => s.id === dead.shipId);
      const arc = matchToArc(
        match,
        pattern.arcType,
        dead.id,
        dead.name,
        ship,
        gameData
      );
      newArcs.push(arc);
      existingKeys.add(key);
    }
  }

  // Add new arcs to the story state
  if (newArcs.length > 0) {
    stories.detectedArcs.push(...newArcs);

    // Auto-dismiss first-chapter arcs when a "real" arc fires for the same actor.
    // E.g. when a survivor arc fires, dismiss the first_blood arc for that crew.
    const realArcActorIds = new Set(
      newArcs
        .filter((a) => !FIRST_CHAPTER_ARC_TYPES.has(a.arcType))
        .map((a) => a.actorId)
    );
    if (realArcActorIds.size > 0) {
      const toDismiss = stories.detectedArcs.filter(
        (a) =>
          FIRST_CHAPTER_ARC_TYPES.has(a.arcType) &&
          realArcActorIds.has(a.actorId)
      );
      for (const arc of toDismiss) {
        stories.dismissedArcIds.push(arcKey(arc));
      }
      stories.detectedArcs = stories.detectedArcs.filter(
        (a) =>
          !(
            FIRST_CHAPTER_ARC_TYPES.has(a.arcType) &&
            realArcActorIds.has(a.actorId)
          )
      );
    }

    // Prune to MAX_ARCS, keeping highest-rated
    if (stories.detectedArcs.length > MAX_ARCS) {
      stories.detectedArcs.sort((a, b) => b.rating - a.rating);
      stories.detectedArcs.length = MAX_ARCS;
    }

    invalidateArcModifierCache();
  }

  stories.lastScanGameTime = gameData.gameTime;

  return newArcs;
}

/**
 * Check if it's time to run arc detection based on the tick interval.
 * Called from gameTick.
 */
export function shouldRunArcScan(gameData: GameData): boolean {
  const stories = gameData.stories;
  if (!stories) return gameData.gameTime >= ARC_SCAN_INTERVAL;

  return gameData.gameTime - stories.lastScanGameTime >= ARC_SCAN_INTERVAL;
}

/**
 * Dismiss an arc (player doesn't want to see it anymore).
 * Prunes the dismissed list if it exceeds MAX_DISMISSED_IDS to prevent
 * unbounded growth in long playthroughs.
 */
export function dismissArc(gameData: GameData, arcId: string): void {
  const stories = ensureStories(gameData);
  const arc = stories.detectedArcs.find((a) => a.id === arcId);
  if (arc) {
    stories.dismissedArcIds.push(arcKey(arc));
    stories.detectedArcs = stories.detectedArcs.filter((a) => a.id !== arcId);
    invalidateArcModifierCache();

    // Prune oldest dismissed entries if list grows too large
    if (stories.dismissedArcIds.length > MAX_DISMISSED_IDS) {
      stories.dismissedArcIds =
        stories.dismissedArcIds.slice(-MAX_DISMISSED_IDS);
    }
  }
}

/**
 * Get all active (non-dismissed) arcs sorted by rating (highest first).
 */
export function getActiveArcs(gameData: GameData): StoryArc[] {
  const stories = gameData.stories;
  if (!stories) return [];
  return [...stories.detectedArcs].sort((a, b) => b.rating - a.rating);
}

/**
 * Get the single highest-rated arc for the sidebar "featured story".
 */
export function getFeaturedArc(gameData: GameData): StoryArc | null {
  const arcs = getActiveArcs(gameData);
  return arcs.length > 0 ? arcs[0] : null;
}

// ── Arc modifier cache ───────────────────────────────────────────
// Precomputed lookup: "actorId:effect" → bonus (additive, not yet 1.0-based).
// Rebuilt lazily when arcs change (detection or dismissal).
let arcModifierCache: Map<string, number> | null = null;

function invalidateArcModifierCache(): void {
  arcModifierCache = null;
}

function buildArcModifierCache(arcs: StoryArc[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const arc of arcs) {
    const mapping = ARC_EFFECT_MAP[arc.arcType];
    if (!mapping) continue;
    const key = `${arc.actorId}:${mapping.effect}`;
    map.set(key, (map.get(key) ?? 0) + arc.rating * 0.01);
  }
  return map;
}

/**
 * Get a gameplay multiplier for a specific effect from active story arcs
 * on a given actor (crew member or ship).
 *
 * Returns a multiplier (e.g. 1.03 for +3%). The bonus per arc is
 * `rating * 0.01` — a 3-star arc gives +3%, a 5-star gives +5%.
 * Rating itself derives from chronicle event analysis, so the bonus
 * traces back to simulated gameplay events.
 *
 * Multiple arcs of different types with the same effect stack additively.
 * Results are cached and rebuilt only when arcs are detected or dismissed.
 */
export function getArcModifier(
  gameData: GameData,
  actorId: string,
  effect: string
): number {
  const stories = gameData.stories;
  if (!stories || stories.detectedArcs.length === 0) return 1.0;

  if (!arcModifierCache) {
    arcModifierCache = buildArcModifierCache(stories.detectedArcs);
  }

  const bonus = arcModifierCache.get(`${actorId}:${effect}`) ?? 0;
  return 1.0 + bonus;
}

// ── Helpers ──────────────────────────────────────────────────────

function arcKey(arc: StoryArc): string {
  return `${arc.arcType}:${arc.actorId}`;
}

function matchToArc(
  match: ArcMatch,
  arcType: StoryArc['arcType'],
  actorId: string,
  actorName: string,
  ship: Ship | undefined,
  gameData: GameData
): StoryArc {
  return {
    id: generateId(),
    arcType,
    title: match.title,
    actorId,
    actorName,
    shipId: ship?.id,
    entries: match.entries,
    detectedAt: gameData.gameTime,
    emotionalArc: match.emotionalArc,
    rating: match.rating,
  };
}
