import type { GameData, StoryArc, Ship } from './models';
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

  // Also check deceased crew (no longer on any ship) — scan chronicles
  // that were preserved. For now, we only scan living crew and active ships.

  // Add new arcs to the story state
  if (newArcs.length > 0) {
    stories.detectedArcs.push(...newArcs);

    // Prune to MAX_ARCS, keeping highest-rated
    if (stories.detectedArcs.length > MAX_ARCS) {
      stories.detectedArcs.sort((a, b) => b.rating - a.rating);
      stories.detectedArcs.length = MAX_ARCS;
    }
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

  return (
    gameData.gameTime - stories.lastScanGameTime >= ARC_SCAN_INTERVAL * 180
  );
}

/**
 * Dismiss an arc (player doesn't want to see it anymore).
 */
export function dismissArc(gameData: GameData, arcId: string): void {
  const stories = ensureStories(gameData);
  const arc = stories.detectedArcs.find((a) => a.id === arcId);
  if (arc) {
    stories.dismissedArcIds.push(arcKey(arc));
    stories.detectedArcs = stories.detectedArcs.filter((a) => a.id !== arcId);
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

// ── Helpers ──────────────────────────────────────────────────────

function arcKey(arc: StoryArc): string {
  return `${arc.arcType}:${arc.actorId}`;
}

function matchToArc(
  match: ArcMatch,
  arcType: StoryArc['arcType'],
  actorId: string,
  actorName: string,
  ship: Ship,
  gameData: GameData
): StoryArc {
  return {
    id: generateId(),
    arcType,
    title: match.title,
    actorId,
    actorName,
    shipId: ship.id,
    entries: match.entries,
    detectedAt: gameData.gameTime,
    emotionalArc: match.emotionalArc,
    rating: match.rating,
  };
}
