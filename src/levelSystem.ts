// XP thresholds for levels 1-20
const XP_THRESHOLDS = [
  0, // Level 1
  10, // Level 2
  50, // Level 3
  120, // Level 4
  250, // Level 5
  450, // Level 6
  750, // Level 7
  1150, // Level 8
  1700, // Level 9
  2400, // Level 10
  3300, // Level 11
  4500, // Level 12
  6000, // Level 13
  8000, // Level 14
  10500, // Level 15
  13700, // Level 16
  17500, // Level 17
  22500, // Level 18
  29000, // Level 19
  37000, // Level 20
];

export const MAX_LEVEL = 20;

/**
 * Get the level for a given amount of XP
 */
export function getLevelForXP(xp: number): number {
  for (let level = XP_THRESHOLDS.length - 1; level >= 0; level--) {
    if (xp >= XP_THRESHOLDS[level]) {
      return level + 1; // levels are 1-indexed
    }
  }
  return 1;
}

/**
 * Get the XP required for the next level
 * Returns null if already at max level
 */
export function getXPForNextLevel(level: number): number | null {
  if (level >= MAX_LEVEL) {
    return null;
  }
  return XP_THRESHOLDS[level]; // level is 1-indexed, array is 0-indexed
}

/**
 * Get the current progress toward the next level as a percentage (0-100)
 */
export function getLevelProgress(xp: number, level: number): number {
  if (level >= MAX_LEVEL) {
    return 100; // max level
  }

  const currentLevelXP = XP_THRESHOLDS[level - 1]; // current level threshold
  const nextLevelXP = XP_THRESHOLDS[level]; // next level threshold

  const xpIntoLevel = xp - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;

  return Math.min(100, Math.max(0, (xpIntoLevel / xpNeededForLevel) * 100));
}

/**
 * Generate starting XP for a new crew member (0-250 range, random)
 */
export function generateStartingXP(): number {
  return Math.floor(Math.random() * 251); // 0-250
}

/**
 * Get XP threshold for a specific level
 */
export function getXPThresholdForLevel(level: number): number {
  if (level < 1 || level > MAX_LEVEL) {
    throw new Error(
      `Invalid level: ${level}. Must be between 1 and ${MAX_LEVEL}`
    );
  }
  return XP_THRESHOLDS[level - 1];
}
