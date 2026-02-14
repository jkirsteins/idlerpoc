import type { LogEntry, LogEntryMeta } from './models';
import { formatCredits } from './formatting';

/**
 * Log System
 *
 * Creates log entries for significant game events.
 * The log is capped at MAX_LOG_ENTRIES to prevent unbounded growth
 * which would eventually exceed localStorage's ~5 MB quota and cause
 * silent save failures.
 *
 * Trimming uses a priority system:
 *  1. Combinable entries (ore_mined, ore_sold, payment, refueled, salary_paid)
 *     are aggregated into summary entries with summed amounts.
 *  2. Droppable entries (departure, arrival, trip_complete, etc.) are removed
 *     oldest-first.
 *  3. Important entries (crew_death, stranded, encounters, etc.) are preserved
 *     and only removed as a last resort.
 */

/**
 * Maximum number of log entries kept in the save.
 * Oldest entries beyond this limit are discarded.
 */
export const MAX_LOG_ENTRIES = 200;

/**
 * Check if a log entry type can be aggregated into summary entries
 * during trim. These carry structured `meta` data that is summed
 * when merging.
 */
function isCombinable(type: LogEntry['type']): boolean {
  return (
    type === 'ore_mined' ||
    type === 'ore_sold' ||
    type === 'payment' ||
    type === 'refueled' ||
    type === 'salary_paid'
  );
}

/**
 * Check if a log entry type is high-frequency and low-importance.
 * During trimming these are dropped oldest-first (after combinable
 * entries have been compacted).
 */
function isDroppable(type: LogEntry['type']): boolean {
  return (
    type === 'departure' ||
    type === 'arrival' ||
    type === 'trip_complete' ||
    type === 'day_advanced' ||
    type === 'mining_route' ||
    type === 'cargo_full'
  );
}

export function createLogEntry(
  gameTime: number,
  type: LogEntry['type'],
  message: string,
  shipName?: string,
  meta?: LogEntryMeta,
  realTime: number = Date.now()
): LogEntry {
  const entry: LogEntry = {
    gameTime,
    realTime,
    type,
    message,
  };
  if (shipName) {
    entry.shipName = shipName;
  }
  if (meta) {
    entry.meta = meta;
  }
  return entry;
}

export function addLog(
  log: LogEntry[],
  gameTime: number,
  type: LogEntry['type'],
  message: string,
  shipName?: string,
  meta?: LogEntryMeta
): void {
  log.push(createLogEntry(gameTime, type, message, shipName, meta));

  // Trim to stay within budget. We keep a small buffer above
  // MAX_LOG_ENTRIES before trimming to avoid scanning on every push.
  const TRIM_BUFFER = 50;
  if (log.length > MAX_LOG_ENTRIES + TRIM_BUFFER) {
    compactAndTrimLog(log);
  }
}

// ── Trim Implementation ──────────────────────────────────────────

/**
 * Build a grouping key for combinable entries.
 * Entries are grouped by (type, shipName) so each ship's events
 * aggregate independently.
 */
function groupKey(entry: LogEntry): string {
  return `${entry.type}::${entry.shipName ?? ''}`;
}

/**
 * Build a human-readable summary message for a group of combined entries.
 */
function buildSummaryMessage(
  type: LogEntry['type'],
  mergedMeta: LogEntryMeta,
  count: number,
  shipName?: string
): string {
  const prefix = shipName ? `${shipName}: ` : '';

  if (type === 'ore_mined') {
    const oreDesc = mergedMeta.oreType
      ? `${mergedMeta.oreQty ?? 0} ${mergedMeta.oreType}`
      : `ore`;
    return `${prefix}Extracted ${oreDesc} (x${count})`;
  }
  if (type === 'ore_sold') {
    return `${prefix}Sold ore for ${formatCredits(mergedMeta.credits ?? 0)} (x${count} sales)`;
  }
  if (type === 'payment') {
    return `${prefix}Earned ${formatCredits(mergedMeta.credits ?? 0)} (x${count} payments)`;
  }
  if (type === 'refueled') {
    return `${prefix}Refueled/resupplied for ${formatCredits(mergedMeta.credits ?? 0)} (x${count})`;
  }
  if (type === 'salary_paid') {
    return `${prefix}Paid salaries: ${formatCredits(mergedMeta.credits ?? 0)} (x${count})`;
  }
  return `${prefix}${type} (x${count})`;
}

/**
 * Merge meta from multiple entries of the same type.
 * For ore_mined: sums oreQty (per oreType — when types differ,
 * the summary shows total quantity without type breakdown).
 * For credit-based types: sums credits.
 */
function mergeMeta(entries: LogEntry[]): LogEntryMeta {
  const result: LogEntryMeta = { count: 0 };
  let totalCredits = 0;
  let totalOreQty = 0;
  const oreTypes = new Set<string>();
  let hasCredits = false;
  let hasOre = false;

  for (const e of entries) {
    const prevCount = e.meta?.count ?? 1;
    result.count = (result.count ?? 0) + prevCount;

    if (e.meta?.credits !== undefined) {
      totalCredits += e.meta.credits;
      hasCredits = true;
    }
    if (e.meta?.oreQty !== undefined) {
      totalOreQty += e.meta.oreQty;
      hasOre = true;
      if (e.meta.oreType) oreTypes.add(e.meta.oreType);
    }
  }

  if (hasCredits) result.credits = totalCredits;
  if (hasOre) {
    result.oreQty = totalOreQty;
    // If all entries are the same ore type, preserve it; otherwise omit
    if (oreTypes.size === 1) {
      result.oreType = oreTypes.values().next().value;
    }
  }

  return result;
}

/**
 * Priority-aware log compaction and trimming.
 *
 * Phase 1: Aggregate combinable entries (ore_mined, ore_sold, etc.)
 *          into summary entries using their `meta` fields.
 * Phase 2: Drop oldest droppable entries (departure, arrival, etc.).
 * Phase 3: Drop oldest important entries as a last resort.
 *
 * Operates in-place on the log array to preserve external references.
 */
function compactAndTrimLog(log: LogEntry[]): void {
  const target = MAX_LOG_ENTRIES;

  // ── Phase 1: Compact combinable entries ──
  // Group combinable entries by (type, shipName). For each group with
  // more than one entry, merge into a single summary.
  const combinableGroups = new Map<string, LogEntry[]>();
  const combinableIndices = new Set<number>();

  for (let i = 0; i < log.length; i++) {
    if (isCombinable(log[i].type) && log[i].meta) {
      const key = groupKey(log[i]);
      let group = combinableGroups.get(key);
      if (!group) {
        group = [];
        combinableGroups.set(key, group);
      }
      group.push(log[i]);
      combinableIndices.add(i);
    }
  }

  // Build replacement summaries for groups with >1 entries
  const summaries: LogEntry[] = [];
  const singletonIndices = new Set<number>();

  for (const [, group] of combinableGroups) {
    if (group.length <= 1) {
      // Keep single entries as-is — find their index and un-mark them
      for (let i = 0; i < log.length; i++) {
        if (combinableIndices.has(i) && log[i] === group[0]) {
          singletonIndices.add(i);
        }
      }
      continue;
    }

    const mergedMeta = mergeMeta(group);
    const latest = group[group.length - 1];
    const totalCount = mergedMeta.count ?? group.length;

    summaries.push(
      createLogEntry(
        latest.gameTime,
        latest.type,
        buildSummaryMessage(
          latest.type,
          mergedMeta,
          totalCount,
          latest.shipName
        ),
        latest.shipName,
        mergedMeta
      )
    );
  }

  // Remove singleton indices from the "to remove" set
  for (const idx of singletonIndices) {
    combinableIndices.delete(idx);
  }

  // Build compacted array: non-combinable entries in order, plus summaries
  // inserted at the position of the latest entry in each group.
  const compacted: LogEntry[] = [];
  for (let i = 0; i < log.length; i++) {
    if (!combinableIndices.has(i)) {
      compacted.push(log[i]);
    }
  }
  // Insert summaries (they carry the gameTime of the latest entry in their
  // group, so we insert them in chronological position)
  for (const summary of summaries) {
    // Find insertion point to maintain chronological order
    let insertAt = compacted.length;
    for (let i = compacted.length - 1; i >= 0; i--) {
      if (compacted[i].gameTime <= summary.gameTime) {
        insertAt = i + 1;
        break;
      }
      if (i === 0) insertAt = 0;
    }
    compacted.splice(insertAt, 0, summary);
  }

  // ── Phase 2: Drop oldest droppable entries ──
  if (compacted.length > target) {
    const excess = compacted.length - target;
    const droppableIndices: number[] = [];
    for (let i = 0; i < compacted.length; i++) {
      if (isDroppable(compacted[i].type)) {
        droppableIndices.push(i);
      }
    }
    // Remove up to `excess` oldest droppable entries
    const toRemove = new Set(droppableIndices.slice(0, excess));
    if (toRemove.size > 0) {
      let writeIdx = 0;
      for (let readIdx = 0; readIdx < compacted.length; readIdx++) {
        if (!toRemove.has(readIdx)) {
          compacted[writeIdx++] = compacted[readIdx];
        }
      }
      compacted.length = writeIdx;
    }
  }

  // ── Phase 3: Fallback — drop oldest entries of any type ──
  if (compacted.length > target) {
    compacted.splice(0, compacted.length - target);
  }

  // Write back in-place to preserve the array reference
  log.length = 0;
  for (let i = 0; i < compacted.length; i++) {
    log.push(compacted[i]);
  }
}
