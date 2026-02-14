import type {
  GameData,
  CrewMember,
  SkillId,
  SkillMasteryState,
  ItemMastery,
  Ship,
  World,
  WorldLocation,
  EquipmentId,
} from '../models';
import { getActiveShip } from '../models';
import { canShipAccessLocation } from '../worldGen';
import {
  getEquipmentDefinition,
  getAllEquipmentDefinitions,
} from '../equipment';
import {
  getPoolFillPercent,
  getCheckpointBonuses,
  xpForMasteryLevel,
  ROUTE_MASTERY_BONUSES,
  ORE_MASTERY_BONUSES,
  TRADE_MASTERY_BONUSES,
  EQUIPMENT_REPAIR_MASTERY_BONUSES,
  GRAVITY_ASSIST_MASTERY_BONUSES,
  routeMasteryKey,
  tradeRouteMasteryKey,
  gravityAssistMasteryKey,
  POOL_CHECKPOINTS,
} from '../masterySystem';
import type { MasteryBonus } from '../masterySystem';
import { formatLargeNumber } from '../formatting';
import { getAllOreDefinitions } from '../oreTypes';
import { GRAVITY_BODIES } from '../gravityAssistSystem';

// ─── Pure helpers (no DOM) ─────────────────────────────────────────

export function getMasteryItemLabel(
  skillId: SkillId,
  itemId: string,
  world: World
): string {
  if (skillId === 'mining') {
    const ore = getAllOreDefinitions().find((o) => o.id === itemId);
    return ore ? `${ore.icon} ${ore.name}` : itemId;
  }
  if (skillId === 'repairs') {
    const eqDef = getEquipmentDefinition(itemId as EquipmentId);
    return eqDef ? `${eqDef.icon} ${eqDef.name}` : itemId;
  }
  // Gravity assist body mastery (prefixed with "ga:")
  if (itemId.startsWith('ga:')) {
    const bodyId = itemId.slice(3);
    const body = GRAVITY_BODIES.find((b) => b.locationId === bodyId);
    return body ? body.bodyName : bodyId;
  }
  const separator = skillId === 'piloting' ? '->' : '<=>';
  const parts = itemId.split(separator);
  if (parts.length === 2) {
    const locA = world.locations.find((l) => l.id === parts[0]);
    const locB = world.locations.find((l) => l.id === parts[1]);
    const nameA = locA?.name ?? parts[0];
    const nameB = locB?.name ?? parts[1];
    return `${nameA} ↔ ${nameB}`;
  }
  return itemId;
}

function getBonusTable(skillId: SkillId, itemId?: string): MasteryBonus[] {
  if (skillId === 'piloting') {
    if (itemId?.startsWith('ga:')) return GRAVITY_ASSIST_MASTERY_BONUSES;
    return ROUTE_MASTERY_BONUSES;
  }
  if (skillId === 'mining') return ORE_MASTERY_BONUSES;
  if (skillId === 'repairs') return EQUIPMENT_REPAIR_MASTERY_BONUSES;
  return TRADE_MASTERY_BONUSES;
}

function getCurrentBonusLabel(
  skillId: SkillId,
  level: number,
  itemId?: string
): string | null {
  const table = getBonusTable(skillId, itemId);
  let best: MasteryBonus | null = null;
  for (const bonus of table) {
    if (level >= bonus.level) best = bonus;
  }
  return best ? best.label : null;
}

function getNextBonusLabel(
  skillId: SkillId,
  level: number,
  itemId?: string
): { level: number; label: string } | null {
  const table = getBonusTable(skillId, itemId);
  for (const bonus of table) {
    if (level < bonus.level) return bonus;
  }
  return null;
}

export function getMasteryItemTypeName(skillId: SkillId): string {
  if (skillId === 'piloting') return 'Routes & Bodies';
  if (skillId === 'mining') return 'Ores';
  if (skillId === 'repairs') return 'Equipment';
  return 'Trade Routes';
}

function generateRoutesFromCurrentLocation(
  ship: Ship,
  currentLocation: WorldLocation,
  world: World,
  skillId: 'piloting' | 'commerce'
): Array<{ key: string; locked: boolean; lockReason: string }> {
  const keyFn = skillId === 'piloting' ? routeMasteryKey : tradeRouteMasteryKey;
  const routes: Array<{ key: string; locked: boolean; lockReason: string }> =
    [];

  for (const dest of world.locations) {
    if (dest.id === currentLocation.id) continue;
    const key = keyFn(currentLocation.id, dest.id);
    const locked = !canShipAccessLocation(ship, dest);

    routes.push({
      key,
      locked,
      lockReason: locked ? `Piloting ${dest.pilotingRequirement}` : '',
    });
  }
  return routes;
}

// ─── Mastery item entry type ──────────────────────────────────────

type MasteryItemEntry = {
  id: string;
  label: string;
  mastery: ItemMastery | null;
  locked: boolean;
  lockReason: string;
};

// ─── Mastery item row refs ────────────────────────────────────────

interface MasteryItemRowRefs {
  row: HTMLDivElement;
  nameSpan: HTMLSpanElement;
  rightSpan: HTMLSpanElement;
  // Right span children (stable, toggled via display)
  lockSpan: HTMLSpanElement;
  levelSpan: HTMLSpanElement;
  undiscoveredSpan: HTMLSpanElement;
  // Progress bar section
  barOuter: HTMLDivElement;
  barFill: HTMLDivElement;
  // Hint line and children (stable, toggled via display)
  hintLine: HTMLDivElement;
  hintActiveSpan: HTMLSpanElement;
  hintSepSpan: HTMLSpanElement;
  hintNextSpan: HTMLSpanElement;
  // Spend pool XP button
  spendBtn: HTMLButtonElement;
}

function createMasteryItemRow(
  _skillId: SkillId,
  _entry: MasteryItemEntry,
  onSpend?: () => void
): MasteryItemRowRefs {
  const row = document.createElement('div');
  row.style.padding = '3px 6px';
  row.style.borderRadius = '3px';

  const topLine = document.createElement('div');
  topLine.style.display = 'flex';
  topLine.style.justifyContent = 'space-between';
  topLine.style.alignItems = 'center';

  const nameSpan = document.createElement('span');
  topLine.appendChild(nameSpan);

  const rightSpan = document.createElement('span');
  rightSpan.style.display = 'flex';
  rightSpan.style.alignItems = 'center';
  rightSpan.style.gap = '0.4rem';
  topLine.appendChild(rightSpan);

  row.appendChild(topLine);

  // Right span children — created once, toggled via display
  const lockSpan = document.createElement('span');
  lockSpan.style.color = 'var(--brown-dark)';
  lockSpan.style.fontSize = '0.75rem';
  lockSpan.style.display = 'none';
  rightSpan.appendChild(lockSpan);

  const levelSpan = document.createElement('span');
  levelSpan.style.display = 'none';
  rightSpan.appendChild(levelSpan);

  const undiscoveredSpan = document.createElement('span');
  undiscoveredSpan.style.color = 'var(--text-dark-gray)';
  undiscoveredSpan.style.fontSize = '0.75rem';
  undiscoveredSpan.style.display = 'none';
  rightSpan.appendChild(undiscoveredSpan);

  // Spend pool XP button
  const spendBtn = document.createElement('button');
  spendBtn.className = 'small-button';
  spendBtn.style.display = 'none';
  spendBtn.textContent = '+1 Lv';
  if (onSpend) {
    spendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onSpend();
    });
  }
  rightSpan.appendChild(spendBtn);

  // Progress bar (always present, toggled via display)
  const barOuter = document.createElement('div');
  barOuter.style.width = '100%';
  barOuter.style.height = '3px';
  barOuter.style.backgroundColor = 'rgba(255,255,255,0.08)';
  barOuter.style.borderRadius = '2px';
  barOuter.style.overflow = 'hidden';
  barOuter.style.marginTop = '2px';
  barOuter.style.display = 'none';

  const barFill = document.createElement('div');
  barFill.style.width = '0%';
  barFill.style.height = '100%';
  barFill.style.borderRadius = '2px';
  barOuter.appendChild(barFill);
  row.appendChild(barOuter);

  // Hint line and children — created once, toggled via display
  const hintLine = document.createElement('div');
  hintLine.style.fontSize = '0.7rem';
  hintLine.style.marginTop = '2px';
  hintLine.style.lineHeight = '1.3';
  hintLine.style.display = 'none';
  row.appendChild(hintLine);

  const hintActiveSpan = document.createElement('span');
  hintActiveSpan.style.color = 'var(--positive-green)';
  hintActiveSpan.style.display = 'none';
  hintLine.appendChild(hintActiveSpan);

  const hintSepSpan = document.createElement('span');
  hintSepSpan.textContent = ' · ';
  hintSepSpan.style.display = 'none';
  hintLine.appendChild(hintSepSpan);

  const hintNextSpan = document.createElement('span');
  hintNextSpan.style.color = 'var(--text-disabled)';
  hintNextSpan.style.display = 'none';
  hintLine.appendChild(hintNextSpan);

  return {
    row,
    nameSpan,
    rightSpan,
    lockSpan,
    levelSpan,
    undiscoveredSpan,
    barOuter,
    barFill,
    hintLine,
    hintActiveSpan,
    hintSepSpan,
    hintNextSpan,
    spendBtn,
  };
}

/** Compute the pool XP cost to gain 1 level on an item at the given level. */
function poolXpCostForNextLevel(currentLevel: number): number {
  if (currentLevel >= 99) return Infinity;
  return xpForMasteryLevel(currentLevel + 1) - xpForMasteryLevel(currentLevel);
}

/**
 * Check if spending `cost` pool XP would drop below any active checkpoint.
 * Returns the highest checkpoint that would be lost, or null.
 */
function wouldLoseCheckpoint(
  pool: { xp: number; maxXp: number },
  cost: number
): number | null {
  if (pool.maxXp <= 0) return null;
  const currentPct = pool.xp / pool.maxXp;
  const afterPct = (pool.xp - cost) / pool.maxXp;
  for (let i = POOL_CHECKPOINTS.length - 1; i >= 0; i--) {
    const cp = POOL_CHECKPOINTS[i];
    if (currentPct >= cp && afterPct < cp) return cp;
  }
  return null;
}

/** Update the spend button state in-place using CSS classes. */
function updateSpendButton(
  btn: HTMLButtonElement,
  level: number,
  pool: { xp: number; maxXp: number }
): void {
  if (level >= 99 || pool.maxXp <= 0) {
    btn.style.display = 'none';
    return;
  }
  const cost = poolXpCostForNextLevel(level);
  const canAfford = pool.xp >= cost;
  const lostCheckpoint = canAfford ? wouldLoseCheckpoint(pool, cost) : null;

  btn.style.display = '';
  btn.disabled = !canAfford;

  if (lostCheckpoint) {
    btn.className = 'small-button small-button--caution';
    btn.title = `Spend ${formatLargeNumber(cost)} pool XP to gain 1 level (drops below ${Math.round(lostCheckpoint * 100)}% checkpoint!)`;
  } else {
    btn.className = 'small-button';
    btn.title = canAfford
      ? `Spend ${formatLargeNumber(cost)} pool XP to gain 1 level`
      : `Need ${formatLargeNumber(cost)} pool XP (have ${formatLargeNumber(Math.floor(pool.xp))})`;
  }
}

function updateMasteryItemRow(
  refs: MasteryItemRowRefs,
  skillId: SkillId,
  entry: MasteryItemEntry,
  pool: { xp: number; maxXp: number }
): void {
  // Row background
  refs.row.style.background = entry.locked
    ? 'rgba(0,0,0,0.2)'
    : 'rgba(255,255,255,0.02)';

  // Name
  refs.nameSpan.style.color = entry.locked ? '#555' : '#ccc';
  refs.nameSpan.textContent = entry.label;

  // Right span children — toggle visibility, update textContent in-place
  if (entry.locked) {
    refs.lockSpan.style.display = '';
    refs.lockSpan.textContent = `🔒 ${entry.lockReason}`;
    refs.levelSpan.style.display = 'none';
    refs.undiscoveredSpan.style.display = 'none';
    refs.spendBtn.style.display = 'none';
  } else if (entry.mastery) {
    refs.lockSpan.style.display = 'none';
    refs.levelSpan.style.display = '';
    refs.levelSpan.style.color =
      entry.mastery.level >= 99
        ? '#fbbf24'
        : entry.mastery.level >= 50
          ? '#4ade80'
          : '#aaa';
    refs.levelSpan.style.fontWeight =
      entry.mastery.level >= 99 ? 'bold' : 'normal';
    refs.levelSpan.textContent = `Lv ${entry.mastery.level}`;
    refs.undiscoveredSpan.style.display = 'none';
    updateSpendButton(refs.spendBtn, entry.mastery.level, pool);
  } else {
    refs.lockSpan.style.display = 'none';
    refs.levelSpan.style.display = 'none';
    refs.undiscoveredSpan.style.display = '';
    refs.undiscoveredSpan.textContent = 'Lv 0';
    updateSpendButton(refs.spendBtn, 0, pool);
  }

  // Progress bar
  if (!entry.locked) {
    const level = entry.mastery?.level ?? 0;
    const xp = entry.mastery?.xp ?? 0;

    if (level < 99) {
      const currentLevelXp = xpForMasteryLevel(level);
      const nextLevelXp = xpForMasteryLevel(level + 1);
      const progress =
        nextLevelXp > currentLevelXp
          ? ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
          : 0;

      refs.barOuter.style.display = '';
      refs.barFill.style.width = `${Math.min(progress, 100)}%`;
      refs.barFill.style.backgroundColor = level >= 50 ? '#4ade80' : '#4a90e2';
    } else {
      refs.barOuter.style.display = 'none';
    }

    // Bonus hint line — update children in-place
    const currentBonus = getCurrentBonusLabel(skillId, level, entry.id);
    const nextBonus = getNextBonusLabel(skillId, level, entry.id);

    if (currentBonus || nextBonus) {
      refs.hintLine.style.display = '';

      if (currentBonus) {
        refs.hintActiveSpan.style.display = '';
        refs.hintActiveSpan.textContent = currentBonus;
      } else {
        refs.hintActiveSpan.style.display = 'none';
      }

      if (currentBonus && nextBonus) {
        refs.hintSepSpan.style.display = '';
      } else {
        refs.hintSepSpan.style.display = 'none';
      }

      if (nextBonus) {
        refs.hintNextSpan.style.display = '';
        refs.hintNextSpan.textContent = `Next Lv ${nextBonus.level}: ${nextBonus.label}`;
      } else {
        refs.hintNextSpan.style.display = 'none';
      }
    } else {
      refs.hintLine.style.display = 'none';
      refs.hintActiveSpan.style.display = 'none';
      refs.hintSepSpan.style.display = 'none';
      refs.hintNextSpan.style.display = 'none';
    }
  } else {
    refs.barOuter.style.display = 'none';
    refs.hintLine.style.display = 'none';
    refs.hintActiveSpan.style.display = 'none';
    refs.hintSepSpan.style.display = 'none';
    refs.hintNextSpan.style.display = 'none';
  }
}

// ─── Checkpoint row refs ──────────────────────────────────────────

export interface CheckpointRowRefs {
  row: HTMLDivElement;
  indicator: HTMLSpanElement;
  threshLabel: HTMLSpanElement;
  bonusLabel: HTMLSpanElement;
}

// ─── Mastery section refs for one skill ───────────────────────────

export interface MasterySectionRefs {
  container: HTMLDivElement;
  // Pool section
  poolLabel: HTMLSpanElement;
  poolValue: HTMLSpanElement;
  // Callback for spending pool XP on items
  onSpendPoolXp?: (crewId: string, skillId: SkillId, itemId: string) => void;
  barOuter: HTMLDivElement;
  barFill: HTMLDivElement;
  // Checkpoint markers and labels are recreated since count can change
  checkpointMarkersContainer: HTMLDivElement;
  bonusList: HTMLDivElement;
  checkpointRows: CheckpointRowRefs[];
  // Item mastery section
  itemHeader: HTMLDivElement;
  itemList: HTMLDivElement;
  itemRowMap: Map<string, MasteryItemRowRefs>;
}

export function createMasterySection(
  skillId: SkillId,
  state: SkillMasteryState,
  crew: CrewMember,
  gameData: GameData,
  onSpendPoolXp?: (crewId: string, skillId: SkillId, itemId: string) => void
): MasterySectionRefs {
  const container = document.createElement('div');
  container.className = 'mastery-section';
  container.style.marginLeft = '0.5rem';
  container.style.marginBottom = '1rem';
  container.style.padding = '0.5rem 0.75rem';
  container.style.background = 'rgba(255,255,255,0.03)';
  container.style.borderLeft = '2px solid rgba(255,255,255,0.1)';
  container.style.fontSize = '0.85rem';

  // ── Mastery Pool section ──
  const poolSection = document.createElement('div');
  poolSection.style.marginBottom = '0.5rem';

  // Pool header
  const poolHeader = document.createElement('div');
  poolHeader.style.display = 'flex';
  poolHeader.style.justifyContent = 'space-between';
  poolHeader.style.alignItems = 'center';
  poolHeader.style.marginBottom = '3px';

  const poolLabel = document.createElement('span');
  poolLabel.style.color = 'var(--text-secondary)';
  poolLabel.textContent = 'Mastery Pool';
  poolHeader.appendChild(poolLabel);

  const poolValue = document.createElement('span');
  poolHeader.appendChild(poolValue);

  poolSection.appendChild(poolHeader);

  // Pool progress bar outer (with checkpoint markers overlaid)
  const checkpointMarkersContainer = document.createElement('div');
  checkpointMarkersContainer.style.position = 'relative';
  checkpointMarkersContainer.style.width = '100%';
  checkpointMarkersContainer.style.height = '14px';
  checkpointMarkersContainer.style.backgroundColor = 'rgba(0,0,0,0.4)';
  checkpointMarkersContainer.style.borderRadius = '3px';
  checkpointMarkersContainer.style.overflow = 'visible';
  checkpointMarkersContainer.style.display = 'none';

  const barFill = document.createElement('div');
  barFill.style.width = '0%';
  barFill.style.height = '100%';
  barFill.style.borderRadius = '3px';
  barFill.style.transition = 'width 0.3s ease';
  checkpointMarkersContainer.appendChild(barFill);

  poolSection.appendChild(checkpointMarkersContainer);

  // Checkpoint bonus list
  const bonusList = document.createElement('div');
  bonusList.style.marginTop = '1.2rem';
  bonusList.style.display = 'none';
  bonusList.style.flexDirection = 'column';
  bonusList.style.gap = '2px';
  poolSection.appendChild(bonusList);

  container.appendChild(poolSection);

  // ── Item mastery section ──
  const itemContainer = document.createElement('div');
  itemContainer.style.marginTop = '0.5rem';

  const itemHeader = document.createElement('div');
  itemHeader.style.color = 'var(--text-secondary)';
  itemHeader.style.marginBottom = '4px';
  itemContainer.appendChild(itemHeader);

  const itemList = document.createElement('div');
  itemList.style.display = 'flex';
  itemList.style.flexDirection = 'column';
  itemList.style.gap = '4px';
  itemContainer.appendChild(itemList);

  container.appendChild(itemContainer);

  const refs: MasterySectionRefs = {
    container,
    poolLabel,
    poolValue,
    barOuter: checkpointMarkersContainer,
    barFill,
    checkpointMarkersContainer,
    bonusList,
    checkpointRows: [],
    itemHeader,
    itemList,
    itemRowMap: new Map(),
    onSpendPoolXp,
  };

  updateMasterySection(refs, skillId, state, crew, gameData);

  return refs;
}

export function updateMasterySection(
  refs: MasterySectionRefs,
  skillId: SkillId,
  state: SkillMasteryState,
  crew: CrewMember,
  gameData: GameData
): void {
  const world = gameData.world;

  // ── Pool bar ──
  const fillPct = getPoolFillPercent(state.pool);
  refs.poolValue.style.color = fillPct >= 95 ? '#fbbf24' : '#ccc';
  refs.poolValue.style.fontWeight = fillPct >= 95 ? 'bold' : 'normal';
  const displayPct = Math.floor(fillPct * 10) / 10;
  refs.poolValue.textContent =
    state.pool.maxXp > 0 ? `${displayPct.toFixed(1)}%` : 'No items discovered';

  if (state.pool.maxXp === 0) {
    refs.barOuter.style.display = 'none';
    refs.bonusList.style.display = 'none';
    // Clear item mastery rows if pool is empty
  } else {
    refs.barOuter.style.display = '';

    refs.barFill.style.width = `${Math.min(fillPct, 100)}%`;
    if (fillPct >= 95) {
      refs.barFill.style.backgroundColor = '#fbbf24';
    } else if (fillPct >= 50) {
      refs.barFill.style.backgroundColor = '#4ade80';
    } else if (fillPct >= 25) {
      refs.barFill.style.backgroundColor = '#60a5fa';
    } else {
      refs.barFill.style.backgroundColor = '#6b7280';
    }

    // Checkpoint markers - recreate since count can change
    // Remove old markers (everything after barFill)
    while (refs.barOuter.childNodes.length > 1) {
      refs.barOuter.removeChild(refs.barOuter.lastChild!);
    }

    const checkpoints = getCheckpointBonuses(skillId, state.pool);
    for (const cp of checkpoints) {
      const pct = cp.threshold * 100;

      const marker = document.createElement('div');
      marker.style.position = 'absolute';
      marker.style.left = `${pct}%`;
      marker.style.top = '0';
      marker.style.bottom = '0';
      marker.style.width = '2px';
      marker.style.backgroundColor = cp.active
        ? 'rgba(251, 191, 36, 0.8)'
        : 'rgba(255,255,255,0.3)';
      marker.style.zIndex = '1';
      refs.barOuter.appendChild(marker);

      const label = document.createElement('div');
      label.style.position = 'absolute';
      label.style.left = `${pct}%`;
      label.style.top = '16px';
      label.style.transform = 'translateX(-50%)';
      label.style.fontSize = '0.65rem';
      label.style.color = cp.active ? '#fbbf24' : 'rgba(255,255,255,0.4)';
      label.style.whiteSpace = 'nowrap';
      label.textContent = `${Math.round(pct)}%`;
      refs.barOuter.appendChild(label);
    }

    // Checkpoint bonus rows - recreate since the active state list can change
    refs.bonusList.style.display = 'flex';
    while (refs.bonusList.firstChild) {
      refs.bonusList.removeChild(refs.bonusList.firstChild);
    }
    refs.checkpointRows = [];

    for (const cp of checkpoints) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '0.4rem';
      row.style.fontSize = '0.8rem';

      const indicator = document.createElement('span');
      if (cp.active) {
        indicator.textContent = '●';
        indicator.style.color = 'var(--yellow-bright)';
      } else {
        indicator.textContent = '○';
        indicator.style.color = 'var(--text-dark-gray)';
      }
      row.appendChild(indicator);

      const threshLabel = document.createElement('span');
      threshLabel.style.color = 'var(--text-muted)';
      threshLabel.style.minWidth = '2.5rem';
      threshLabel.textContent = `${Math.round(cp.threshold * 100)}%`;
      row.appendChild(threshLabel);

      const bonusLabel = document.createElement('span');
      bonusLabel.style.color = cp.active ? '#ddd' : '#666';
      bonusLabel.textContent = cp.label;
      row.appendChild(bonusLabel);

      refs.bonusList.appendChild(row);
      refs.checkpointRows.push({ row, indicator, threshLabel, bonusLabel });
    }
  }

  // ── Item mastery list ──
  refs.itemHeader.textContent = getMasteryItemTypeName(skillId);

  // Build entries
  const entries: MasteryItemEntry[] = [];

  if (skillId === 'mining') {
    const skillLevel = Math.floor(crew.skills.mining);
    for (const ore of getAllOreDefinitions()) {
      const mastery = state.itemMasteries[ore.id] ?? null;
      const locked = skillLevel < ore.miningLevelRequired;
      entries.push({
        id: ore.id,
        label: `${ore.icon} ${ore.name}`,
        mastery,
        locked,
        lockReason: locked ? `Mining ${ore.miningLevelRequired}` : '',
      });
    }
  } else if (skillId === 'repairs') {
    // Show all degradable equipment types
    const degradableEquipment = getAllEquipmentDefinitions().filter(
      (d) => d.hasDegradation
    );
    for (const eqDef of degradableEquipment) {
      const mastery = state.itemMasteries[eqDef.id] ?? null;
      entries.push({
        id: eqDef.id,
        label: `${eqDef.icon} ${eqDef.name}`,
        mastery,
        locked: false,
        lockReason: '',
      });
    }
  } else {
    const ship = getActiveShip(gameData);
    const currentLocId =
      ship.location.dockedAt ?? ship.location.orbitingAt ?? null;
    const currentLoc = currentLocId
      ? world.locations.find((l) => l.id === currentLocId)
      : null;

    if (currentLoc) {
      const routes = generateRoutesFromCurrentLocation(
        ship,
        currentLoc,
        world,
        skillId
      );

      for (const route of routes) {
        const mastery = state.itemMasteries[route.key] ?? null;
        entries.push({
          id: route.key,
          label: getMasteryItemLabel(skillId, route.key, world),
          mastery,
          locked: route.locked,
          lockReason: route.lockReason,
        });
      }
    }

    // Also show any previously mastered routes not from current location
    for (const [itemId, itemMastery] of Object.entries(state.itemMasteries)) {
      if (entries.some((e) => e.id === itemId)) continue;
      // Gravity assist bodies are added separately below
      if (itemId.startsWith('ga:')) continue;
      entries.push({
        id: itemId,
        label: getMasteryItemLabel(skillId, itemId, world),
        mastery: itemMastery,
        locked: false,
        lockReason: '',
      });
    }

    // Add all gravity assist bodies (piloting only)
    if (skillId === 'piloting') {
      for (const body of GRAVITY_BODIES) {
        const key = gravityAssistMasteryKey(body.locationId);
        const mastery = state.itemMasteries[key] ?? null;
        entries.push({
          id: key,
          label: getMasteryItemLabel(skillId, key, world),
          mastery,
          locked: false,
          lockReason: '',
        });
      }
    }
  }

  // Reconcile item rows
  const currentIds = new Set<string>();
  for (const entry of entries) {
    currentIds.add(entry.id);
    let rowRefs = refs.itemRowMap.get(entry.id);
    if (!rowRefs) {
      const onSpend = refs.onSpendPoolXp
        ? () => refs.onSpendPoolXp!(crew.id, skillId, entry.id)
        : undefined;
      rowRefs = createMasteryItemRow(skillId, entry, onSpend);
      refs.itemRowMap.set(entry.id, rowRefs);
      refs.itemList.appendChild(rowRefs.row);
    }
    updateMasteryItemRow(rowRefs, skillId, entry, state.pool);
  }

  // Remove departed items
  for (const [id, rowRefs] of refs.itemRowMap) {
    if (!currentIds.has(id)) {
      rowRefs.row.remove();
      refs.itemRowMap.delete(id);
    }
  }
}
