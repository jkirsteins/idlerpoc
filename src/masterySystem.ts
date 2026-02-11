/**
 * Mastery System — Melvor Idle-inspired three-layer progression.
 *
 * Layer 1: Skill Level (0-99) — gates access to content
 * Layer 2: Item Mastery (0-99 per item) — per-item efficiency bonuses
 * Layer 3: Mastery Pool (0-100%) — skill-wide passive bonuses at checkpoints
 *
 * Each action generates:
 *   - Skill XP (toward skill level, handled by skillProgression.ts)
 *   - Item Mastery XP (toward that item's mastery level)
 *   - 25% of item mastery XP flows into the mastery pool automatically
 */

import type { SkillId, MasteryPool, SkillMasteryState } from './models';

// ─── XP Table ────────────────────────────────────────────────────
// Same exponential curve as Melvor/RuneScape: level 92 ≈ half of 99.
// Total XP for level 99 = 13,034,431.

function buildXpTable(): number[] {
  const table: number[] = [];
  let acc = 0;
  for (let lvl = 0; lvl < 100; lvl++) {
    table[lvl] = Math.floor(acc);
    acc += Math.floor(lvl + 300 * Math.pow(2, lvl / 7)) / 4;
  }
  return table;
}

const XP_TABLE = buildXpTable();

/** XP required to reach a given mastery level (0-indexed). */
export function xpForMasteryLevel(level: number): number {
  if (level <= 0) return 0;
  if (level >= 99) return XP_TABLE[99] ?? XP_TABLE[XP_TABLE.length - 1];
  return XP_TABLE[level];
}

/** Derive mastery level from XP. */
export function masteryLevelFromXp(xp: number): number {
  for (let lvl = 99; lvl >= 0; lvl--) {
    if (xp >= XP_TABLE[lvl]) return lvl;
  }
  return 0;
}

// ─── Pool Constants ──────────────────────────────────────────────

/** Pool XP cap per item in the skill. */
const POOL_CAP_PER_ITEM = 1_000;

/** Fraction of item mastery XP that flows into the pool. */
const POOL_FLOW_RATE = 0.25;

/** After skill level 99, pool flow increases. */
const POOL_FLOW_RATE_POST_99 = 0.5;

/** Checkpoint thresholds as fractions of pool cap. */
export const POOL_CHECKPOINTS = [0.1, 0.25, 0.5, 0.95] as const;

// ─── Checkpoint Bonus Definitions ────────────────────────────────

export interface CheckpointBonus {
  threshold: number; // 0.1, 0.25, 0.5, 0.95
  label: string;
  active: boolean;
}

const PILOTING_CHECKPOINT_LABELS: Record<number, string> = {
  0.1: '+5% Piloting mastery XP',
  0.25: '-0.1s engine warmup time',
  0.5: '+5% fuel efficiency on all routes',
  0.95: '+10% encounter evasion on all routes',
};

const MINING_CHECKPOINT_LABELS: Record<number, string> = {
  0.1: '+5% Mining mastery XP',
  0.25: '+5% yield on all ores',
  0.5: '-10% equipment degradation while mining',
  0.95: '+10% chance to double any ore drop',
};

const COMMERCE_CHECKPOINT_LABELS: Record<number, string> = {
  0.1: '+5% Commerce mastery XP',
  0.25: '-5% crew salary costs',
  0.5: '+5% sell price for all ore and goods',
  0.95: '+10% payment on all contracts',
};

const REPAIRS_CHECKPOINT_LABELS: Record<number, string> = {
  0.1: '+5% Repairs mastery XP',
  0.25: '+5% repair speed on all equipment',
  0.5: '-10% air filter degradation rate',
  0.95: '+10% chance for bonus repair points',
};

const CHECKPOINT_LABELS: Record<SkillId, Record<number, string>> = {
  piloting: PILOTING_CHECKPOINT_LABELS,
  mining: MINING_CHECKPOINT_LABELS,
  commerce: COMMERCE_CHECKPOINT_LABELS,
  repairs: REPAIRS_CHECKPOINT_LABELS,
};

// ─── Item Mastery Bonus Tables ───────────────────────────────────

export interface MasteryBonus {
  level: number;
  label: string;
}

/** Route mastery bonuses (piloting) */
export const ROUTE_MASTERY_BONUSES: MasteryBonus[] = [
  { level: 10, label: '-5% fuel consumption' },
  { level: 25, label: '-10% fuel, -5% travel time' },
  { level: 40, label: '-15% fuel, -10% travel time' },
  { level: 50, label: '+5% encounter evasion' },
  { level: 65, label: '-20% fuel, -15% travel time' },
  { level: 80, label: '+10% evasion, -20% travel time' },
  { level: 99, label: '-25% fuel, -25% travel time, +15% evasion' },
];

/** Ore mastery bonuses (mining) */
export const ORE_MASTERY_BONUSES: MasteryBonus[] = [
  { level: 10, label: '+5% yield' },
  { level: 25, label: '+10% yield, -5% equipment wear' },
  { level: 40, label: '+15% yield, +5% rare variant chance' },
  { level: 50, label: '-10% equipment wear, +10% rare variant' },
  { level: 65, label: '+25% yield' },
  { level: 80, label: '+30% yield, +15% rare variant, -15% wear' },
  { level: 99, label: '+40% yield, +20% rare variant, -20% wear' },
];

/** Trade route mastery bonuses (commerce) */
export const TRADE_MASTERY_BONUSES: MasteryBonus[] = [
  { level: 10, label: '+3% payment bonus' },
  { level: 25, label: '+5% payment, commodity insights' },
  { level: 40, label: '+8% payment, -5% fuel discount' },
  { level: 50, label: '+10% payment, exclusive contracts' },
  { level: 65, label: '+12% payment, -8% fuel discount' },
  { level: 80, label: '+15% payment, -10% fuel, priority docking' },
  { level: 99, label: '+20% payment, -15% fuel, best prices' },
];

/** Equipment repair mastery bonuses (repairs) */
export const EQUIPMENT_REPAIR_MASTERY_BONUSES: MasteryBonus[] = [
  { level: 10, label: '+5% repair speed' },
  { level: 25, label: '+10% repair speed' },
  { level: 40, label: '+15% repair speed' },
  { level: 50, label: '+20% repair speed' },
  { level: 65, label: '+25% repair speed' },
  { level: 80, label: '+30% repair speed' },
  { level: 99, label: '+40% repair speed' },
];

// ─── Computed Bonus Helpers ──────────────────────────────────────

/** Get the ore yield bonus from mastery level (multiplicative, e.g. 0.10 = +10%). */
export function getOreMasteryYieldBonus(masteryLevel: number): number {
  if (masteryLevel >= 99) return 0.4;
  if (masteryLevel >= 80) return 0.3;
  if (masteryLevel >= 65) return 0.25;
  if (masteryLevel >= 40) return 0.15;
  if (masteryLevel >= 25) return 0.1;
  if (masteryLevel >= 10) return 0.05;
  return 0;
}

/** Get the equipment wear reduction from ore mastery (e.g. 0.15 = -15%). */
export function getOreMasteryWearReduction(masteryLevel: number): number {
  if (masteryLevel >= 99) return 0.2;
  if (masteryLevel >= 80) return 0.15;
  if (masteryLevel >= 50) return 0.1;
  if (masteryLevel >= 25) return 0.05;
  return 0;
}

/** Get the route fuel bonus from piloting mastery (e.g. 0.15 = -15%). */
export function getRouteMasteryFuelBonus(masteryLevel: number): number {
  if (masteryLevel >= 99) return 0.25;
  if (masteryLevel >= 65) return 0.2;
  if (masteryLevel >= 40) return 0.15;
  if (masteryLevel >= 25) return 0.1;
  if (masteryLevel >= 10) return 0.05;
  return 0;
}

/** Get the route travel time reduction from piloting mastery. */
export function getRouteMasteryTimeBonus(masteryLevel: number): number {
  if (masteryLevel >= 99) return 0.25;
  if (masteryLevel >= 80) return 0.2;
  if (masteryLevel >= 65) return 0.15;
  if (masteryLevel >= 40) return 0.1;
  if (masteryLevel >= 25) return 0.05;
  return 0;
}

/** Get the repair speed bonus from equipment repair mastery (e.g. 0.20 = +20%). */
export function getEquipmentRepairMasteryBonus(masteryLevel: number): number {
  if (masteryLevel >= 99) return 0.4;
  if (masteryLevel >= 80) return 0.3;
  if (masteryLevel >= 65) return 0.25;
  if (masteryLevel >= 50) return 0.2;
  if (masteryLevel >= 40) return 0.15;
  if (masteryLevel >= 25) return 0.1;
  if (masteryLevel >= 10) return 0.05;
  return 0;
}

/** Get the trade route payment bonus from commerce mastery. */
export function getTradeRouteMasteryPayBonus(masteryLevel: number): number {
  if (masteryLevel >= 99) return 0.2;
  if (masteryLevel >= 80) return 0.15;
  if (masteryLevel >= 65) return 0.12;
  if (masteryLevel >= 50) return 0.1;
  if (masteryLevel >= 40) return 0.08;
  if (masteryLevel >= 25) return 0.05;
  if (masteryLevel >= 10) return 0.03;
  return 0;
}

// ─── Pool Checkpoint Queries ─────────────────────────────────────

/** Check if a pool checkpoint is active (pool XP >= threshold × maxXp). */
export function isCheckpointActive(
  pool: MasteryPool,
  threshold: number
): boolean {
  if (pool.maxXp <= 0) return false;
  return pool.xp >= pool.maxXp * threshold;
}

/** Get all checkpoint bonuses for a skill with active/inactive status. */
export function getCheckpointBonuses(
  skillId: SkillId,
  pool: MasteryPool
): CheckpointBonus[] {
  const labels = CHECKPOINT_LABELS[skillId];
  return POOL_CHECKPOINTS.map((t) => ({
    threshold: t,
    label: labels[t] ?? '',
    active: isCheckpointActive(pool, t),
  }));
}

/** Get pool fill percentage (0-100). */
export function getPoolFillPercent(pool: MasteryPool): number {
  if (pool.maxXp <= 0) return 0;
  return Math.min(100, (pool.xp / pool.maxXp) * 100);
}

// ─── Pool Bonus Helpers ──────────────────────────────────────────

/** Piloting pool: +5% mastery XP at 10%. */
export function getPilotingPoolMasteryXpBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.1) ? 0.05 : 0;
}

/** Piloting pool: +5% fuel efficiency at 50%. */
export function getPilotingPoolFuelBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.5) ? 0.05 : 0;
}

/** Piloting pool: +10% evasion at 95%. */
export function getPilotingPoolEvasionBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.95) ? 0.1 : 0;
}

/** Mining pool: +5% mastery XP at 10%. */
export function getMiningPoolMasteryXpBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.1) ? 0.05 : 0;
}

/** Mining pool: +5% yield at 25%. */
export function getMiningPoolYieldBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.25) ? 0.05 : 0;
}

/** Mining pool: -10% equipment degradation at 50%. */
export function getMiningPoolWearReduction(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.5) ? 0.1 : 0;
}

/** Mining pool: +10% double drop at 95%. */
export function getMiningPoolDoubleChance(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.95) ? 0.1 : 0;
}

/** Commerce pool: +5% mastery XP at 10%. */
export function getCommercePoolMasteryXpBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.1) ? 0.05 : 0;
}

/** Commerce pool: -5% salary costs at 25%. */
export function getCommercePoolSalaryReduction(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.25) ? 0.05 : 0;
}

/** Commerce pool: +5% sell price at 50%. */
export function getCommercePoolSellBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.5) ? 0.05 : 0;
}

/** Commerce pool: +10% contract payment at 95%. */
export function getCommercePoolPaymentBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.95) ? 0.1 : 0;
}

/** Repairs pool: +5% repair speed at 25%. */
export function getRepairsPoolSpeedBonus(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.25) ? 0.05 : 0;
}

/** Repairs pool: -10% air filter degradation at 50%. */
export function getRepairsPoolFilterReduction(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.5) ? 0.1 : 0;
}

/** Repairs pool: +10% chance for bonus repair points at 95%. */
export function getRepairsPoolBonusChance(pool: MasteryPool): number {
  return isCheckpointActive(pool, 0.95) ? 0.1 : 0;
}

// ─── Mastery XP Award ────────────────────────────────────────────

export interface MasteryXpResult {
  itemId: string;
  masteryXpGained: number;
  poolXpGained: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

/**
 * Award mastery XP to an item and its skill pool.
 *
 * @param state - The crew member's mastery state for this skill
 * @param itemId - The specific item (route key, ore ID, trade route key)
 * @param baseMasteryXp - Raw mastery XP before bonuses
 * @param skillLevel - Current skill level (affects pool flow rate)
 * @param totalItemCount - Total items in this skill (affects pool cap)
 * @returns Result describing what happened
 */
export function awardMasteryXp(
  state: SkillMasteryState,
  itemId: string,
  baseMasteryXp: number,
  skillLevel: number,
  totalItemCount: number
): MasteryXpResult {
  // Ensure item mastery exists
  if (!state.itemMasteries[itemId]) {
    state.itemMasteries[itemId] = { itemId, xp: 0, level: 0 };
  }

  const item = state.itemMasteries[itemId];
  const oldLevel = item.level;

  // Apply pool mastery XP bonus (10% checkpoint)
  // This is skill-specific — check the pool
  const poolXpBonus = isCheckpointActive(state.pool, 0.1) ? 0.05 : 0;
  const effectiveMasteryXp = baseMasteryXp * (1 + poolXpBonus);

  // Award item mastery XP
  item.xp += effectiveMasteryXp;
  item.level = masteryLevelFromXp(item.xp);

  // Flow 25% (or 50% post-99) into pool
  const flowRate = skillLevel >= 99 ? POOL_FLOW_RATE_POST_99 : POOL_FLOW_RATE;
  const poolXp = effectiveMasteryXp * flowRate;

  // Update pool cap based on total items
  state.pool.maxXp = POOL_CAP_PER_ITEM * totalItemCount;

  // Add to pool (capped)
  const poolXpGained = Math.min(poolXp, state.pool.maxXp - state.pool.xp);
  state.pool.xp = Math.min(state.pool.maxXp, state.pool.xp + poolXp);

  return {
    itemId,
    masteryXpGained: effectiveMasteryXp,
    poolXpGained,
    oldLevel,
    newLevel: item.level,
    leveledUp: item.level > oldLevel,
  };
}

/**
 * Spend pool XP to boost an item's mastery level.
 *
 * @returns The number of levels gained, or 0 if insufficient pool XP.
 */
export function spendPoolXpOnItem(
  state: SkillMasteryState,
  itemId: string,
  levelsToGain: number
): number {
  if (!state.itemMasteries[itemId]) {
    state.itemMasteries[itemId] = { itemId, xp: 0, level: 0 };
  }

  const item = state.itemMasteries[itemId];
  let gained = 0;

  for (let i = 0; i < levelsToGain; i++) {
    const nextLevel = item.level + 1;
    if (nextLevel > 99) break;

    const xpNeeded = xpForMasteryLevel(nextLevel) - item.xp;
    if (xpNeeded <= 0) {
      // Already have enough XP, just level up
      item.level = masteryLevelFromXp(item.xp);
      gained++;
      continue;
    }

    if (state.pool.xp < xpNeeded) break;

    state.pool.xp -= xpNeeded;
    item.xp += xpNeeded;
    item.level = masteryLevelFromXp(item.xp);
    gained++;
  }

  return gained;
}

// ─── Factory ─────────────────────────────────────────────────────

/** Create an empty mastery state for a skill. */
export function createEmptyMasteryState(): SkillMasteryState {
  return {
    itemMasteries: {},
    pool: { xp: 0, maxXp: 0 },
  };
}

/** Create initial mastery state for a new crew member (all skills). */
export function createInitialMastery(): Record<SkillId, SkillMasteryState> {
  return {
    piloting: createEmptyMasteryState(),
    mining: createEmptyMasteryState(),
    commerce: createEmptyMasteryState(),
    repairs: createEmptyMasteryState(),
  };
}

// ─── Route Key Helpers ───────────────────────────────────────────

/** Generate a canonical route key for piloting mastery (sorted pair). */
export function routeMasteryKey(
  originId: string,
  destinationId: string
): string {
  const pair = [originId, destinationId].sort();
  return `${pair[0]}->${pair[1]}`;
}

/** Generate a trade route key for commerce mastery (sorted pair). */
export function tradeRouteMasteryKey(
  originId: string,
  destinationId: string
): string {
  const pair = [originId, destinationId].sort();
  return `${pair[0]}<=>${pair[1]}`;
}
