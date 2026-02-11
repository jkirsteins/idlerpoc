import type {
  GameData,
  CrewMember,
  CrewEquipmentId,
  SkillId,
  SkillMasteryState,
  ItemMastery,
  Ship,
  World,
  WorldLocation,
} from '../models';
import { getActiveShip } from '../models';
import { canShipAccessLocation } from '../worldGen';
import type { TabbedViewCallbacks } from './types';
import { getCrewEquipmentDefinition } from '../crewEquipment';
import { getLevelForXP } from '../levelSystem';
import {
  getCrewRoleDefinition,
  getCrewRoleName,
  getPrimarySkillForRole,
} from '../crewRoles';
import {
  getGravityDegradationLevel,
  getStrengthMultiplier,
  formatExposureDays,
  getDegradationLevelName,
  getDegradationDescription,
  getNextThreshold,
  estimateRecoveryTime,
} from '../gravitySystem';
import { TICKS_PER_DAY, formatDualTime, formatGameDate } from '../timeSystem';
import { getEngineDefinition } from '../engines';
import { getEquipmentDefinition } from '../equipment';
import { calculateTickTraining } from '../skillProgression';
import { getCrewJobSlot, getJobSlotDefinition } from '../jobSlots';
import {
  getSkillRank,
  getNextRank,
  getRankProgress,
  SPECIALIZATION_THRESHOLD,
} from '../skillRanks';
import {
  getPoolFillPercent,
  getCheckpointBonuses,
  xpForMasteryLevel,
  ROUTE_MASTERY_BONUSES,
  ORE_MASTERY_BONUSES,
  TRADE_MASTERY_BONUSES,
  routeMasteryKey,
  tradeRouteMasteryKey,
} from '../masterySystem';
import type { MasteryBonus } from '../masterySystem';
import { getAllOreDefinitions } from '../oreTypes';
import type { Component } from './component';

// ─── Pure helpers (no DOM) ─────────────────────────────────────────

function calculateAttackScore(crew: CrewMember): number {
  const level = getGravityDegradationLevel(crew.zeroGExposure);
  const multiplier = getStrengthMultiplier(level);
  let attack = Math.floor(crew.skills.piloting * multiplier);

  const weaponSlot = crew.equipment.find((item) => {
    const def = getCrewEquipmentDefinition(item.definitionId);
    return def.category === 'weapon';
  });

  if (weaponSlot) {
    const weaponDef = getCrewEquipmentDefinition(weaponSlot.definitionId);
    attack += weaponDef.attackScore;
  }

  return attack;
}

function getMasteryItemLabel(
  skillId: SkillId,
  itemId: string,
  world: World
): string {
  if (skillId === 'mining') {
    const ore = getAllOreDefinitions().find((o) => o.id === itemId);
    return ore ? `${ore.icon} ${ore.name}` : itemId;
  }
  const separator = skillId === 'piloting' ? '->' : '<=>';
  const parts = itemId.split(separator);
  if (parts.length === 2) {
    const locA = world.locations.find((l) => l.id === parts[0]);
    const locB = world.locations.find((l) => l.id === parts[1]);
    const nameA = locA?.name ?? parts[0];
    const nameB = locB?.name ?? parts[1];
    return `${nameA} → ${nameB}`;
  }
  return itemId;
}

function getBonusTable(skillId: SkillId): MasteryBonus[] {
  if (skillId === 'piloting') return ROUTE_MASTERY_BONUSES;
  if (skillId === 'mining') return ORE_MASTERY_BONUSES;
  return TRADE_MASTERY_BONUSES;
}

function getCurrentBonusLabel(skillId: SkillId, level: number): string | null {
  const table = getBonusTable(skillId);
  let best: MasteryBonus | null = null;
  for (const bonus of table) {
    if (level >= bonus.level) best = bonus;
  }
  return best ? best.label : null;
}

function getNextBonusLabel(
  skillId: SkillId,
  level: number
): { level: number; label: string } | null {
  const table = getBonusTable(skillId);
  for (const bonus of table) {
    if (level < bonus.level) return bonus;
  }
  return null;
}

function getMasteryItemTypeName(skillId: SkillId): string {
  if (skillId === 'piloting') return 'Routes';
  if (skillId === 'mining') return 'Ores';
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

// ─── Snapshot comparison ───────────────────────────────────────────

function snapshotCrewProps(
  gameData: GameData,
  selectedCrewId: string | undefined
) {
  const ship = getActiveShip(gameData);
  return {
    selectedCrewId,
    shipId: ship.id,
    locationStatus: ship.location.status,
    dockedAt: ship.location.dockedAt,
    cargoCount: ship.cargo.length,
    credits: gameData.credits,
    shipsCount: gameData.ships.length,
    gameTime: gameData.gameTime,
    crew: ship.crew
      .map(
        (c) =>
          `${c.id},${c.health},${c.morale},${c.level},${c.xp},${c.unpaidTicks},${c.zeroGExposure},${c.equipment.length},${c.hiredAt},${c.boardedShipAt}`
      )
      .join(';'),
    crewSkills: ship.crew
      .map(
        (c) =>
          `${c.skills.piloting}${c.skills.mining}${c.skills.commerce}${c.specialization?.skillId ?? ''}`
      )
      .join(),
    crewMastery: ship.crew
      .map((c) => {
        const m = c.mastery;
        const poolSummary = (['piloting', 'mining', 'commerce'] as const)
          .map((s) => `${s}:${m[s].pool.xp}/${m[s].pool.maxXp}`)
          .join(',');
        const itemCount = (['piloting', 'mining', 'commerce'] as const)
          .map((s) => Object.keys(m[s].itemMasteries).length)
          .join(',');
        return `${c.id}:${poolSummary}|${itemCount}`;
      })
      .join(';'),
    crewEquip: ship.crew
      .flatMap((c) => c.equipment.map((eq) => eq.id + eq.definitionId))
      .join(),
    cargo: ship.cargo.map((i) => i.id + i.definitionId).join(),
    hireable: ship.location.dockedAt
      ? (gameData.hireableCrewByLocation[ship.location.dockedAt] || [])
          .map((h) => h.id)
          .join()
      : '',
    slots: ship.jobSlots.map((s) => s.id + ':' + s.assignedCrewId).join(),
    otherShips:
      ship.location.status === 'docked'
        ? gameData.ships
            .filter(
              (s) =>
                s.id !== ship.id &&
                s.location.status === 'docked' &&
                s.location.dockedAt === ship.location.dockedAt
            )
            .map((s) => s.id)
            .join()
        : '',
  };
}

type CrewSnapshot = ReturnType<typeof snapshotCrewProps>;

function crewPropsChanged(a: CrewSnapshot | null, b: CrewSnapshot): boolean {
  if (!a) return true;
  for (const key of Object.keys(b) as Array<keyof CrewSnapshot>) {
    if (a[key] !== b[key]) return true;
  }
  return false;
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
  // Progress bar section (may or may not be showing)
  barOuter: HTMLDivElement;
  barFill: HTMLDivElement;
  // Hint line
  hintLine: HTMLDivElement;
}

function createMasteryItemRow(
  skillId: SkillId,
  entry: MasteryItemEntry
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

  // Hint line (always present, toggled via display)
  const hintLine = document.createElement('div');
  hintLine.style.fontSize = '0.7rem';
  hintLine.style.marginTop = '2px';
  hintLine.style.lineHeight = '1.3';
  hintLine.style.display = 'none';
  row.appendChild(hintLine);

  const refs: MasteryItemRowRefs = {
    row,
    nameSpan,
    rightSpan,
    barOuter,
    barFill,
    hintLine,
  };

  updateMasteryItemRow(refs, skillId, entry);

  return refs;
}

function updateMasteryItemRow(
  refs: MasteryItemRowRefs,
  skillId: SkillId,
  entry: MasteryItemEntry
): void {
  // Row background
  refs.row.style.background = entry.locked
    ? 'rgba(0,0,0,0.2)'
    : 'rgba(255,255,255,0.02)';

  // Name
  refs.nameSpan.style.color = entry.locked ? '#555' : '#ccc';
  refs.nameSpan.textContent = entry.label;

  // Right span - rebuild inline since it's small and varies by state
  // Clear existing children
  while (refs.rightSpan.firstChild) {
    refs.rightSpan.removeChild(refs.rightSpan.firstChild);
  }

  if (entry.locked) {
    const lockSpan = document.createElement('span');
    lockSpan.style.color = '#665522';
    lockSpan.style.fontSize = '0.75rem';
    lockSpan.textContent = `🔒 ${entry.lockReason}`;
    refs.rightSpan.appendChild(lockSpan);
  } else if (entry.mastery) {
    const levelSpan = document.createElement('span');
    levelSpan.style.color =
      entry.mastery.level >= 99
        ? '#fbbf24'
        : entry.mastery.level >= 50
          ? '#4ade80'
          : '#aaa';
    levelSpan.style.fontWeight = entry.mastery.level >= 99 ? 'bold' : 'normal';
    levelSpan.textContent = `Lv ${entry.mastery.level}`;
    refs.rightSpan.appendChild(levelSpan);
  } else {
    const undiscovered = document.createElement('span');
    undiscovered.style.color = '#555';
    undiscovered.style.fontSize = '0.75rem';
    undiscovered.textContent = 'Lv 0';
    refs.rightSpan.appendChild(undiscovered);
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

    // Bonus hint line
    const currentBonus = getCurrentBonusLabel(skillId, level);
    const nextBonus = getNextBonusLabel(skillId, level);

    if (currentBonus || nextBonus) {
      refs.hintLine.style.display = '';
      // Clear and rebuild hint content
      while (refs.hintLine.firstChild) {
        refs.hintLine.removeChild(refs.hintLine.firstChild);
      }

      if (currentBonus) {
        const activeSpan = document.createElement('span');
        activeSpan.style.color = '#4ade80';
        activeSpan.textContent = currentBonus;
        refs.hintLine.appendChild(activeSpan);
      }

      if (nextBonus) {
        if (currentBonus) {
          refs.hintLine.appendChild(document.createTextNode(' · '));
        }
        const nextSpan = document.createElement('span');
        nextSpan.style.color = '#666';
        nextSpan.textContent = `Next Lv ${nextBonus.level}: ${nextBonus.label}`;
        refs.hintLine.appendChild(nextSpan);
      }
    } else {
      refs.hintLine.style.display = 'none';
    }
  } else {
    refs.barOuter.style.display = 'none';
    refs.hintLine.style.display = 'none';
  }
}

// ─── Checkpoint row refs ──────────────────────────────────────────

interface CheckpointRowRefs {
  row: HTMLDivElement;
  indicator: HTMLSpanElement;
  threshLabel: HTMLSpanElement;
  bonusLabel: HTMLSpanElement;
}

// ─── Mastery section refs for one skill ───────────────────────────

interface MasterySectionRefs {
  container: HTMLDivElement;
  // Pool section
  poolLabel: HTMLSpanElement;
  poolValue: HTMLSpanElement;
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

function createMasterySection(
  skillId: SkillId,
  state: SkillMasteryState,
  crew: CrewMember,
  gameData: GameData
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
  poolLabel.style.color = '#aaa';
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
  itemHeader.style.color = '#aaa';
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
  };

  updateMasterySection(refs, skillId, state, crew, gameData);

  return refs;
}

function updateMasterySection(
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
        indicator.style.color = '#fbbf24';
      } else {
        indicator.textContent = '○';
        indicator.style.color = '#555';
      }
      row.appendChild(indicator);

      const threshLabel = document.createElement('span');
      threshLabel.style.color = '#888';
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
      entries.push({
        id: itemId,
        label: getMasteryItemLabel(skillId, itemId, world),
        mastery: itemMastery,
        locked: false,
        lockReason: '',
      });
    }
  }

  // Reconcile item rows
  const currentIds = new Set<string>();
  for (const entry of entries) {
    currentIds.add(entry.id);
    let rowRefs = refs.itemRowMap.get(entry.id);
    if (!rowRefs) {
      rowRefs = createMasteryItemRow(skillId, entry);
      refs.itemRowMap.set(entry.id, rowRefs);
      refs.itemList.appendChild(rowRefs.row);
    } else {
      updateMasteryItemRow(rowRefs, skillId, entry);
    }
  }

  // Remove departed items
  for (const [id, rowRefs] of refs.itemRowMap) {
    if (!currentIds.has(id)) {
      rowRefs.row.remove();
      refs.itemRowMap.delete(id);
    }
  }
}

// ─── Skill row refs ───────────────────────────────────────────────

interface SkillRowRefs {
  row: HTMLDivElement;
  skillLabel: HTMLSpanElement;
  rankSpan: HTMLSpanElement;
  skillValue: HTMLSpanElement;
  barContainer: HTMLDivElement;
  barFill: HTMLDivElement;
}

function createSkillRow(crew: CrewMember, skillId: SkillId): SkillRowRefs {
  const row = document.createElement('div');
  row.className = 'skill-row';
  row.style.marginBottom = '0.5rem';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.justifyContent = 'space-between';
  topRow.style.alignItems = 'center';
  topRow.style.marginBottom = '2px';

  const skillLabel = document.createElement('span');
  skillLabel.className = 'skill-label';
  topRow.appendChild(skillLabel);

  const rightSpan = document.createElement('span');
  rightSpan.style.display = 'flex';
  rightSpan.style.alignItems = 'center';
  rightSpan.style.gap = '0.5rem';

  const rankSpan = document.createElement('span');
  rankSpan.style.fontSize = '0.8rem';
  rightSpan.appendChild(rankSpan);

  const skillValue = document.createElement('span');
  skillValue.className = 'skill-value';
  rightSpan.appendChild(skillValue);

  topRow.appendChild(rightSpan);
  row.appendChild(topRow);

  // Progress bar toward next rank
  const barContainer = document.createElement('div');
  barContainer.style.width = '100%';
  barContainer.style.height = '4px';
  barContainer.style.backgroundColor = 'rgba(255,255,255,0.1)';
  barContainer.style.borderRadius = '2px';
  barContainer.style.overflow = 'hidden';
  barContainer.style.display = 'none';

  const barFill = document.createElement('div');
  barFill.style.width = '0%';
  barFill.style.height = '100%';
  barFill.style.borderRadius = '2px';
  barFill.style.transition = 'width 0.3s ease';
  barContainer.appendChild(barFill);

  row.appendChild(barContainer);

  const refs: SkillRowRefs = {
    row,
    skillLabel,
    rankSpan,
    skillValue,
    barContainer,
    barFill,
  };

  updateSkillRow(refs, crew, skillId);

  return refs;
}

function updateSkillRow(
  refs: SkillRowRefs,
  crew: CrewMember,
  skillId: SkillId
): void {
  const skillName = skillId.charAt(0).toUpperCase() + skillId.slice(1);
  const rawValue = crew.skills[skillId];
  const intValue = Math.floor(rawValue);
  const rank = getSkillRank(intValue);
  const isSpecialized = crew.specialization?.skillId === skillId;

  refs.skillLabel.textContent = `${skillName}:`;

  refs.rankSpan.style.color =
    rank.index >= 8 ? '#fbbf24' : rank.index >= 6 ? '#4ade80' : '#888';
  refs.rankSpan.textContent = rank.name;
  refs.rankSpan.style.fontWeight = isSpecialized ? 'bold' : 'normal';
  if (isSpecialized) {
    refs.rankSpan.textContent = rank.name + ' *';
  }

  refs.skillValue.textContent = `${intValue}`;

  const nextRank = getNextRank(intValue);
  if (nextRank) {
    const progress = getRankProgress(rawValue);
    refs.barContainer.style.display = '';
    refs.barFill.style.width = `${progress}%`;
    refs.barFill.style.backgroundColor = isSpecialized ? '#4ade80' : '#4a90e2';
  } else {
    refs.barContainer.style.display = 'none';
  }
}

// ─── Equipment slot refs ──────────────────────────────────────────

interface EquipSlotRefs {
  slot: HTMLDivElement;
  slotLabel: HTMLDivElement;
  itemDiv: HTMLDivElement;
  emptyDiv: HTMLDivElement;
  unequipBtn: HTMLButtonElement;
}

// ─── Crew list item refs ──────────────────────────────────────────

interface CrewRowRefs {
  row: HTMLDivElement;
  nameDiv: HTMLDivElement;
  roleDiv: HTMLDivElement;
  levelDiv: HTMLDivElement;
  unpaidBadge: HTMLDivElement;
}

// ─── Cargo item refs ──────────────────────────────────────────────

interface CargoItemRefs {
  item: HTMLDivElement;
  itemInfo: HTMLDivElement;
  equipButton: HTMLButtonElement;
}

// ─── Main createCrewTab factory ───────────────────────────────────

export function createCrewTab(
  gameData: GameData,
  selectedCrewId: string | undefined,
  callbacks: TabbedViewCallbacks
): Component & { setSelectedCrewId(id: string | undefined): void } {
  const container = document.createElement('div');
  container.className = 'crew-tab';

  let latestGameData = gameData;
  let currentSelectedCrewId = selectedCrewId;
  let lastSnapshot: CrewSnapshot | null = null;

  // ── Layout ──
  const layout = document.createElement('div');
  layout.className = 'crew-list-detail';
  container.appendChild(layout);

  // ────────────────────────────────────────────────────────────────
  // LEFT PANEL: Crew list
  // ────────────────────────────────────────────────────────────────

  const crewListPanel = document.createElement('div');
  crewListPanel.className = 'crew-list-panel';

  const crewListTitle = document.createElement('h3');
  crewListTitle.textContent = 'Crew Members';
  crewListPanel.appendChild(crewListTitle);

  const crewListEl = document.createElement('div');
  crewListEl.className = 'crew-list';
  crewListPanel.appendChild(crewListEl);

  layout.appendChild(crewListPanel);

  const crewRowMap = new Map<string, CrewRowRefs>();

  function createCrewRow(crew: CrewMember): CrewRowRefs {
    const row = document.createElement('div');
    row.className = 'crew-list-item';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'crew-list-name';
    row.appendChild(nameDiv);

    const roleDiv = document.createElement('div');
    roleDiv.className = 'crew-list-role';
    row.appendChild(roleDiv);

    const levelDiv = document.createElement('div');
    levelDiv.className = 'crew-list-level';
    row.appendChild(levelDiv);

    const unpaidBadge = document.createElement('div');
    unpaidBadge.className = 'unpaid-badge';
    unpaidBadge.style.color = '#ff4444';
    unpaidBadge.style.fontSize = '0.75rem';
    unpaidBadge.style.fontWeight = 'bold';
    unpaidBadge.style.display = 'none';
    row.appendChild(unpaidBadge);

    row.addEventListener('click', () => callbacks.onSelectCrew(crew.id));

    return { row, nameDiv, roleDiv, levelDiv, unpaidBadge };
  }

  function updateCrewRow(refs: CrewRowRefs, crew: CrewMember): void {
    refs.row.className =
      crew.id === currentSelectedCrewId
        ? 'crew-list-item selected'
        : 'crew-list-item';

    refs.nameDiv.textContent = crew.isCaptain ? `CPT ${crew.name}` : crew.name;
    if (crew.isCaptain) {
      refs.roleDiv.textContent = 'Owner-Operator';
    } else {
      const primarySkill = getPrimarySkillForRole(crew.role);
      const rankName = primarySkill
        ? getSkillRank(Math.floor(crew.skills[primarySkill])).name
        : '';
      const roleName = getCrewRoleName(crew.role);
      refs.roleDiv.textContent = rankName
        ? `${rankName} ${roleName}`
        : roleName;
    }
    refs.levelDiv.textContent = `Level ${crew.level}`;

    if (crew.unpaidTicks > 0 && !crew.isCaptain) {
      refs.unpaidBadge.textContent = '⚠️ UNPAID';
      refs.unpaidBadge.style.display = '';
    } else {
      refs.unpaidBadge.style.display = 'none';
    }
  }

  // ────────────────────────────────────────────────────────────────
  // RIGHT PANEL: Crew detail
  // ────────────────────────────────────────────────────────────────

  // No-crew-selected message
  const noCrewMessage = document.createElement('div');
  noCrewMessage.className = 'crew-detail-panel';
  const noCrewText = document.createElement('p');
  noCrewText.textContent = 'Select a crew member to view details';
  noCrewText.style.textAlign = 'center';
  noCrewText.style.marginTop = '2rem';
  noCrewMessage.appendChild(noCrewText);
  noCrewMessage.style.display = 'none';
  layout.appendChild(noCrewMessage);

  // Detail panel
  const detailPanel = document.createElement('div');
  detailPanel.className = 'crew-detail-panel';
  detailPanel.style.display = 'none';
  layout.appendChild(detailPanel);

  // ── Header section ──
  const headerSection = document.createElement('div');
  headerSection.className = 'crew-detail-header';

  const detailName = document.createElement('h2');
  const captainBadge = document.createElement('span');
  captainBadge.className = 'captain-badge';
  captainBadge.textContent = 'CPT';
  captainBadge.style.display = 'none';
  const captainBadgeSpace = document.createTextNode(' ');
  detailName.appendChild(captainBadge);
  detailName.appendChild(captainBadgeSpace);
  const nameTextNode = document.createTextNode('');
  detailName.appendChild(nameTextNode);
  headerSection.appendChild(detailName);

  const detailRole = document.createElement('div');
  detailRole.className = 'crew-detail-role';
  headerSection.appendChild(detailRole);

  detailPanel.appendChild(headerSection);

  // ── Service record section ──
  const serviceSection = document.createElement('div');
  serviceSection.className = 'crew-service-record';
  serviceSection.style.padding = '0.75rem';
  serviceSection.style.marginBottom = '1rem';
  serviceSection.style.background = 'rgba(255,255,255,0.03)';
  serviceSection.style.border = '1px solid rgba(255,255,255,0.08)';
  serviceSection.style.borderRadius = '4px';
  serviceSection.style.fontSize = '0.9rem';
  serviceSection.style.lineHeight = '1.6';
  serviceSection.style.color = '#aaa';

  const serviceAssignment = document.createElement('div');
  serviceAssignment.style.color = '#ccc';
  serviceSection.appendChild(serviceAssignment);

  const serviceShipTenure = document.createElement('div');
  serviceSection.appendChild(serviceShipTenure);

  const serviceCompanyTenure = document.createElement('div');
  serviceSection.appendChild(serviceCompanyTenure);

  const serviceOrigin = document.createElement('div');
  serviceOrigin.style.color = '#888';
  serviceSection.appendChild(serviceOrigin);

  detailPanel.appendChild(serviceSection);

  // ── Transfer crew section ──
  const transferSection = document.createElement('div');
  transferSection.className = 'transfer-crew-section';
  transferSection.style.padding = '0.75rem';
  transferSection.style.background = 'rgba(74, 158, 255, 0.1)';
  transferSection.style.border = '1px solid #4a9eff';
  transferSection.style.borderRadius = '4px';
  transferSection.style.marginBottom = '1rem';

  const transferTitle = document.createElement('div');
  transferTitle.textContent = 'Transfer Crew';
  transferTitle.style.fontWeight = 'bold';
  transferTitle.style.marginBottom = '0.5rem';
  transferTitle.style.color = '#4a9eff';
  transferSection.appendChild(transferTitle);

  const transferNoShipsMsg = document.createElement('div');
  transferNoShipsMsg.style.color = '#aaa';
  transferNoShipsMsg.style.fontSize = '0.85rem';
  transferNoShipsMsg.textContent = 'No other ships docked at this station.';
  transferNoShipsMsg.style.display = 'none';
  transferSection.appendChild(transferNoShipsMsg);

  const transferControls = document.createElement('div');
  transferControls.style.display = 'none';
  transferControls.style.gap = '0.5rem';
  transferControls.style.alignItems = 'center';

  const transferLabel = document.createElement('span');
  transferLabel.textContent = 'Transfer to:';
  transferLabel.style.fontSize = '0.9rem';
  transferControls.appendChild(transferLabel);

  const transferSelect = document.createElement('select');
  transferSelect.style.flex = '1';
  transferSelect.style.padding = '0.5rem';
  transferSelect.style.background = 'rgba(0, 0, 0, 0.5)';
  transferSelect.style.border = '1px solid #666';
  transferSelect.style.borderRadius = '4px';
  transferSelect.style.color = '#fff';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = '-- Select ship --';
  transferSelect.appendChild(placeholderOption);

  transferControls.appendChild(transferSelect);

  const transferBtn = document.createElement('button');
  transferBtn.textContent = 'Transfer';
  transferBtn.style.padding = '0.5rem 1rem';
  transferBtn.disabled = true;

  transferSelect.addEventListener('change', () => {
    transferBtn.disabled = transferSelect.value === '';
  });

  transferBtn.addEventListener('click', () => {
    const targetShipId = transferSelect.value;
    if (targetShipId && callbacks.onTransferCrew) {
      const ship = getActiveShip(latestGameData);
      callbacks.onTransferCrew(currentSelectedCrewId!, ship.id, targetShipId);
    }
  });

  transferControls.appendChild(transferBtn);
  transferSection.appendChild(transferControls);

  detailPanel.appendChild(transferSection);

  // ── Stats section ──
  const statsSection = document.createElement('div');
  statsSection.className = 'crew-detail-section';

  const statsTitle = document.createElement('h3');
  statsTitle.textContent = 'Stats';
  statsSection.appendChild(statsTitle);

  const statsDiv = document.createElement('div');
  statsDiv.className = 'crew-stats';

  // Health row
  const healthRow = document.createElement('div');
  healthRow.className = 'stat-row';
  const healthLabel = document.createElement('span');
  healthLabel.textContent = 'Health:';
  const healthValue = document.createElement('span');
  healthRow.appendChild(healthLabel);
  healthRow.appendChild(healthValue);
  statsDiv.appendChild(healthRow);

  // Attack row
  const attackRow = document.createElement('div');
  attackRow.className = 'stat-row';
  const attackLabel = document.createElement('span');
  attackLabel.textContent = 'Attack:';
  const attackValue = document.createElement('span');
  attackRow.appendChild(attackLabel);
  attackRow.appendChild(attackValue);
  statsDiv.appendChild(attackRow);

  // Salary row
  const salaryRow = document.createElement('div');
  salaryRow.className = 'stat-row';
  salaryRow.style.display = 'none';
  const salaryLabel = document.createElement('span');
  salaryLabel.textContent = 'Salary:';
  const salaryValue = document.createElement('span');
  salaryRow.appendChild(salaryLabel);
  salaryRow.appendChild(salaryValue);
  statsDiv.appendChild(salaryRow);

  // Unpaid warning
  const unpaidWarning = document.createElement('div');
  unpaidWarning.className = 'unpaid-warning';
  unpaidWarning.style.color = '#ff4444';
  unpaidWarning.style.marginTop = '0.5rem';
  unpaidWarning.style.fontWeight = 'bold';
  unpaidWarning.style.display = 'none';
  statsDiv.appendChild(unpaidWarning);

  statsSection.appendChild(statsDiv);

  // ── Zero-G Exposure section ──
  const exposureSection = document.createElement('div');
  exposureSection.className = 'exposure-section';
  exposureSection.style.marginTop = '1rem';
  exposureSection.style.padding = '0.5rem';
  exposureSection.style.border = '1px solid rgba(255,255,255,0.1)';
  exposureSection.style.borderRadius = '4px';

  const exposureTitle = document.createElement('div');
  exposureTitle.style.fontWeight = 'bold';
  exposureTitle.style.marginBottom = '0.5rem';
  exposureSection.appendChild(exposureTitle);

  // Exposure progress bar container
  const exposureBarContainer = document.createElement('div');
  exposureBarContainer.style.position = 'relative';
  exposureBarContainer.style.width = '100%';
  exposureBarContainer.style.height = '20px';
  exposureBarContainer.style.backgroundColor = 'rgba(0,0,0,0.3)';
  exposureBarContainer.style.borderRadius = '4px';
  exposureBarContainer.style.overflow = 'hidden';
  exposureBarContainer.style.marginBottom = '0.5rem';

  const exposureBarFill = document.createElement('div');
  exposureBarFill.style.width = '0%';
  exposureBarFill.style.height = '100%';
  exposureBarFill.style.transition = 'width 0.3s ease';
  exposureBarContainer.appendChild(exposureBarFill);

  // Threshold markers (static - always the same thresholds)
  const thresholds = [
    { days: 14, label: '14d' },
    { days: 60, label: '60d' },
    { days: 180, label: '180d' },
    { days: 365, label: '365d' },
  ];
  const maxDays = 365;

  for (const threshold of thresholds) {
    const marker = document.createElement('div');
    marker.style.position = 'absolute';
    marker.style.left = `${(threshold.days / maxDays) * 100}%`;
    marker.style.top = '0';
    marker.style.bottom = '0';
    marker.style.width = '2px';
    marker.style.backgroundColor = 'rgba(255,255,255,0.3)';
    exposureBarContainer.appendChild(marker);

    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.left = `${(threshold.days / maxDays) * 100}%`;
    label.style.bottom = '-18px';
    label.style.transform = 'translateX(-50%)';
    label.style.fontSize = '0.7em';
    label.style.color = 'rgba(255,255,255,0.5)';
    label.textContent = threshold.label;
    exposureBarContainer.appendChild(label);
  }

  exposureSection.appendChild(exposureBarContainer);

  // Status text
  const exposureStatusText = document.createElement('div');
  exposureStatusText.style.fontSize = '0.9em';
  exposureStatusText.style.marginTop = '1rem';
  exposureSection.appendChild(exposureStatusText);

  // Next threshold text
  const exposureNextText = document.createElement('div');
  exposureNextText.style.fontSize = '0.85em';
  exposureNextText.style.marginTop = '0.25rem';
  exposureNextText.style.opacity = '0.7';
  exposureNextText.style.display = 'none';
  exposureSection.appendChild(exposureNextText);

  // Recovery div
  const recoveryDiv = document.createElement('div');
  recoveryDiv.style.marginTop = '0.5rem';
  recoveryDiv.style.padding = '0.5rem 0.75rem';
  recoveryDiv.style.background = 'rgba(74, 222, 128, 0.1)';
  recoveryDiv.style.border = '1px solid rgba(74, 222, 128, 0.3)';
  recoveryDiv.style.borderRadius = '4px';
  recoveryDiv.style.fontSize = '0.85em';
  recoveryDiv.style.display = 'none';

  const recoveryTitle = document.createElement('div');
  recoveryTitle.style.color = '#4ade80';
  recoveryTitle.style.fontWeight = 'bold';
  recoveryTitle.style.marginBottom = '0.25rem';
  recoveryTitle.textContent = 'Recovering — Docked';
  recoveryDiv.appendChild(recoveryTitle);

  const recoveryNextLine = document.createElement('div');
  recoveryNextLine.style.color = '#ccc';
  recoveryNextLine.style.display = 'none';
  recoveryDiv.appendChild(recoveryNextLine);

  const recoveryFullLine = document.createElement('div');
  recoveryFullLine.style.color = '#aaa';
  recoveryFullLine.style.marginTop = '0.15rem';
  recoveryDiv.appendChild(recoveryFullLine);

  exposureSection.appendChild(recoveryDiv);

  statsSection.appendChild(exposureSection);

  // ── Radiation Exposure section ──
  const radiationSection = document.createElement('div');
  radiationSection.className = 'radiation-exposure-section';
  radiationSection.style.marginTop = '1rem';
  radiationSection.style.padding = '0.5rem';
  radiationSection.style.border = '1px solid rgba(255,255,255,0.1)';
  radiationSection.style.borderRadius = '4px';

  const radTitle = document.createElement('div');
  radTitle.style.fontWeight = 'bold';
  radTitle.style.marginBottom = '0.5rem';
  radiationSection.appendChild(radTitle);

  const radContent = document.createElement('div');
  radiationSection.appendChild(radContent);

  statsSection.appendChild(radiationSection);

  detailPanel.appendChild(statsSection);

  // ── Training indicator ──
  const trainingDiv = document.createElement('div');
  trainingDiv.className = 'training-indicator';
  trainingDiv.style.padding = '0.5rem 0.75rem';
  trainingDiv.style.marginBottom = '0.5rem';
  trainingDiv.style.background = 'rgba(74, 222, 128, 0.1)';
  trainingDiv.style.border = '1px solid rgba(74, 222, 128, 0.3)';
  trainingDiv.style.borderRadius = '4px';
  trainingDiv.style.fontSize = '0.9rem';
  trainingDiv.style.color = '#4ade80';
  trainingDiv.style.display = 'none';
  detailPanel.appendChild(trainingDiv);

  // ── Level up button ──
  const levelUpBtn = document.createElement('button');
  levelUpBtn.className = 'level-up-button';
  levelUpBtn.style.display = 'none';
  levelUpBtn.addEventListener('click', () => {
    if (currentSelectedCrewId) {
      callbacks.onLevelUp(currentSelectedCrewId);
    }
  });
  detailPanel.appendChild(levelUpBtn);

  // ── Skills & Mastery section ──
  const skillsSection = document.createElement('div');
  skillsSection.className = 'crew-detail-section';

  const skillsHeader = document.createElement('div');
  skillsHeader.style.display = 'flex';
  skillsHeader.style.justifyContent = 'space-between';
  skillsHeader.style.alignItems = 'center';

  const skillsTitle = document.createElement('h3');
  skillsTitle.textContent = 'Skills & Mastery';
  skillsHeader.appendChild(skillsTitle);

  const specBadge = document.createElement('span');
  specBadge.style.fontSize = '0.8rem';
  specBadge.style.color = '#4ade80';
  specBadge.style.fontWeight = 'bold';
  specBadge.style.display = 'none';
  skillsHeader.appendChild(specBadge);

  skillsSection.appendChild(skillsHeader);

  const skillsDiv = document.createElement('div');
  skillsDiv.className = 'crew-skills';

  // Create 3 fixed skill rows + mastery sections
  const coreSkillIds: SkillId[] = ['piloting', 'mining', 'commerce'];
  const skillRowRefs: Record<SkillId, SkillRowRefs> = {} as Record<
    SkillId,
    SkillRowRefs
  >;
  const masterySectionRefs: Record<SkillId, MasterySectionRefs> = {} as Record<
    SkillId,
    MasterySectionRefs
  >;

  // These are created lazily in the first update to avoid needing crew data now
  let skillsInitialized = false;

  // Ranged combat row (shown when weapon equipped)
  const combatRow = document.createElement('div');
  combatRow.className = 'skill-row';
  combatRow.style.display = 'none';
  const combatLabel = document.createElement('span');
  combatLabel.className = 'skill-label';
  combatLabel.textContent = 'Ranged Combat:';
  const combatValue = document.createElement('span');
  combatValue.className = 'skill-value';
  combatValue.textContent = 'Equipped';
  combatValue.style.fontStyle = 'italic';
  combatValue.style.color = '#888';
  combatRow.appendChild(combatLabel);
  combatRow.appendChild(combatValue);

  skillsSection.appendChild(skillsDiv);

  // Specialization section
  const specSection = document.createElement('div');
  specSection.style.marginTop = '0.75rem';
  specSection.style.padding = '0.75rem';
  specSection.style.background = 'rgba(74, 222, 128, 0.1)';
  specSection.style.border = '1px solid rgba(74, 222, 128, 0.3)';
  specSection.style.borderRadius = '4px';
  specSection.style.display = 'none';

  const specLabel = document.createElement('div');
  specLabel.style.fontSize = '0.85rem';
  specLabel.style.marginBottom = '0.5rem';
  specLabel.style.color = '#4ade80';
  specLabel.textContent =
    'Specialization available! +50% training in chosen skill, -25% in others.';
  specSection.appendChild(specLabel);

  const specControls = document.createElement('div');
  specControls.style.display = 'flex';
  specControls.style.gap = '0.5rem';
  specControls.style.flexWrap = 'wrap';
  specSection.appendChild(specControls);

  skillsSection.appendChild(specSection);

  detailPanel.appendChild(skillsSection);

  // ── Equipment section ──
  const equipSection = document.createElement('div');
  equipSection.className = 'crew-detail-section';

  const equipTitle = document.createElement('h3');
  equipTitle.textContent = 'Equipment';
  equipSection.appendChild(equipTitle);

  const equipSlotsDiv = document.createElement('div');
  equipSlotsDiv.className = 'equipment-slots';

  const categories: Array<{
    id: 'weapon' | 'armor' | 'tool' | 'accessory';
    label: string;
  }> = [
    { id: 'weapon', label: 'Weapon' },
    { id: 'armor', label: 'Armor' },
    { id: 'tool', label: 'Tool' },
    { id: 'accessory', label: 'Accessory' },
  ];

  const equipSlots: EquipSlotRefs[] = [];

  for (const category of categories) {
    const slot = document.createElement('div');
    slot.className = 'equipment-slot';

    const slotLabel = document.createElement('div');
    slotLabel.className = 'equipment-slot-label';
    slotLabel.textContent = category.label;
    slot.appendChild(slotLabel);

    const itemDiv = document.createElement('div');
    itemDiv.className = 'equipped-item';
    itemDiv.style.display = 'none';
    slot.appendChild(itemDiv);

    const unequipBtn = document.createElement('button');
    unequipBtn.className = 'unequip-button';
    unequipBtn.textContent = 'Unequip';
    unequipBtn.style.display = 'none';
    unequipBtn.addEventListener('click', () => {
      // Find equipped item for this category from latest data
      const ship = getActiveShip(latestGameData);
      const crew = ship.crew.find((c) => c.id === currentSelectedCrewId);
      if (!crew) return;
      const equippedItem = crew.equipment.find((item) => {
        const def = getCrewEquipmentDefinition(item.definitionId);
        return def.category === category.id;
      });
      if (equippedItem) {
        callbacks.onUnequipItem(crew.id, equippedItem.id);
      }
    });
    slot.appendChild(unequipBtn);

    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'equipment-empty';
    emptyDiv.textContent = 'Empty';
    emptyDiv.style.display = 'none';
    slot.appendChild(emptyDiv);

    equipSlotsDiv.appendChild(slot);
    equipSlots.push({ slot, slotLabel, itemDiv, emptyDiv, unequipBtn });
  }

  equipSection.appendChild(equipSlotsDiv);
  detailPanel.appendChild(equipSection);

  // ── Cargo section ──
  const cargoSection = document.createElement('div');
  cargoSection.className = 'crew-detail-section';

  const cargoHeader = document.createElement('div');
  cargoHeader.style.display = 'flex';
  cargoHeader.style.justifyContent = 'space-between';
  cargoHeader.style.alignItems = 'center';

  const cargoTitle = document.createElement('h3');
  cargoTitle.textContent = 'Ship Cargo';
  cargoHeader.appendChild(cargoTitle);

  const cargoSpaceLabel = document.createElement('span');
  cargoSpaceLabel.className = 'cargo-space';
  cargoHeader.appendChild(cargoSpaceLabel);

  cargoSection.appendChild(cargoHeader);

  const cargoList = document.createElement('div');
  cargoList.className = 'cargo-list';

  const cargoEmptyMsg = document.createElement('div');
  cargoEmptyMsg.className = 'cargo-empty';
  cargoEmptyMsg.textContent = 'Cargo hold is empty';
  cargoEmptyMsg.style.display = 'none';
  cargoList.appendChild(cargoEmptyMsg);

  cargoSection.appendChild(cargoList);
  detailPanel.appendChild(cargoSection);

  const cargoItemMap = new Map<string, CargoItemRefs>();

  // ────────────────────────────────────────────────────────────────
  // UPDATE function
  // ────────────────────────────────────────────────────────────────

  function update(gameData: GameData): void {
    latestGameData = gameData;
    const selectedId = currentSelectedCrewId;

    const snap = snapshotCrewProps(gameData, selectedId);
    if (!crewPropsChanged(lastSnapshot, snap)) return;
    lastSnapshot = snap;

    const ship = getActiveShip(gameData);

    // ── Crew list reconciliation ──
    const currentCrewIds = new Set<string>();
    for (const crew of ship.crew) {
      currentCrewIds.add(crew.id);
      let refs = crewRowMap.get(crew.id);
      if (!refs) {
        refs = createCrewRow(crew);
        crewRowMap.set(crew.id, refs);
        crewListEl.appendChild(refs.row);
      }
      updateCrewRow(refs, crew);
    }

    // Remove departed crew
    for (const [id, refs] of crewRowMap) {
      if (!currentCrewIds.has(id)) {
        refs.row.remove();
        crewRowMap.delete(id);
      }
    }

    // ── Detail panel ──
    const selectedCrew = selectedId
      ? ship.crew.find((c) => c.id === selectedId)
      : ship.crew[0];

    if (selectedCrew) {
      noCrewMessage.style.display = 'none';
      detailPanel.style.display = '';
      updateDetailPanel(gameData, selectedCrew, ship);
    } else {
      noCrewMessage.style.display = '';
      detailPanel.style.display = 'none';
    }
  }

  function updateDetailPanel(
    gameData: GameData,
    crew: CrewMember,
    ship: Ship
  ): void {
    // ── Header ──
    nameTextNode.textContent = crew.name;
    if (crew.isCaptain) {
      captainBadge.style.display = '';
    } else {
      captainBadge.style.display = 'none';
    }
    // Show ranked title: e.g. "COMPETENT PILOT" or "OWNER-OPERATOR"
    if (crew.isCaptain) {
      detailRole.textContent = 'OWNER-OPERATOR';
    } else {
      const primarySkill = getPrimarySkillForRole(crew.role);
      const rankName = primarySkill
        ? getSkillRank(Math.floor(crew.skills[primarySkill])).name
        : '';
      const roleName = getCrewRoleName(crew.role);
      detailRole.textContent = rankName
        ? `${rankName} ${roleName}`.toUpperCase()
        : roleName.toUpperCase();
    }

    // ── Service record ──
    const jobSlotForService = getCrewJobSlot(ship, crew.id);
    if (jobSlotForService) {
      const jobDef = getJobSlotDefinition(jobSlotForService.type);
      const jobName = jobDef?.name ?? jobSlotForService.type;
      serviceAssignment.textContent = `Assigned to ${jobName} aboard ${ship.name}`;
    } else if (ship.location.status === 'docked') {
      serviceAssignment.textContent = `Stationed aboard ${ship.name}`;
    } else {
      serviceAssignment.textContent = `Aboard ${ship.name}`;
    }

    const shipTenure = gameData.gameTime - crew.boardedShipAt;
    serviceShipTenure.textContent =
      shipTenure > 0
        ? `Aboard since ${formatGameDate(crew.boardedShipAt)} — ${formatDualTime(shipTenure)}`
        : `Aboard since ${formatGameDate(crew.boardedShipAt)}`;

    if (crew.hiredAt !== crew.boardedShipAt) {
      const companyTenure = gameData.gameTime - crew.hiredAt;
      serviceCompanyTenure.textContent =
        companyTenure > 0
          ? `With the company since ${formatGameDate(crew.hiredAt)} — ${formatDualTime(companyTenure)}`
          : `With the company since ${formatGameDate(crew.hiredAt)}`;
      serviceCompanyTenure.style.display = '';
    } else {
      serviceCompanyTenure.style.display = 'none';
    }

    if (crew.isCaptain) {
      serviceOrigin.textContent = 'Company founder';
      serviceOrigin.style.fontStyle = 'italic';
      serviceOrigin.style.display = '';
    } else if (crew.hiredLocation) {
      const location = gameData.world.locations.find(
        (l) => l.id === crew.hiredLocation
      );
      serviceOrigin.textContent = location
        ? `Recruited at ${location.name}`
        : '';
      serviceOrigin.style.fontStyle = '';
      serviceOrigin.style.display = location ? '' : 'none';
    } else {
      serviceOrigin.style.display = 'none';
    }

    // ── Transfer section (always visible, shows context messages) ──
    transferSection.style.display = '';

    if (crew.isCaptain) {
      transferNoShipsMsg.textContent = 'Captains cannot be transferred.';
      transferNoShipsMsg.style.display = '';
      transferControls.style.display = 'none';
      transferSection.style.opacity = '0.4';
    } else if (gameData.ships.length <= 1) {
      transferNoShipsMsg.textContent =
        'Acquire additional ships to transfer crew between them.';
      transferNoShipsMsg.style.display = '';
      transferControls.style.display = 'none';
      transferSection.style.opacity = '0.4';
    } else if (ship.location.status !== 'docked') {
      transferNoShipsMsg.textContent =
        'Dock at a station to transfer crew between ships.';
      transferNoShipsMsg.style.display = '';
      transferControls.style.display = 'none';
      transferSection.style.opacity = '0.4';
    } else {
      transferSection.style.opacity = '';
      const dockedLocationId = ship.location.dockedAt;
      const otherDockedShips = gameData.ships.filter(
        (s) =>
          s.id !== ship.id &&
          s.location.status === 'docked' &&
          s.location.dockedAt === dockedLocationId
      );

      if (otherDockedShips.length === 0) {
        transferNoShipsMsg.textContent =
          'No other ships docked at this station.';
        transferNoShipsMsg.style.display = '';
        transferControls.style.display = 'none';
      } else {
        transferNoShipsMsg.style.display = 'none';
        transferControls.style.display = 'flex';

        // Sync transfer select options without destroying the element
        syncTransferOptions(otherDockedShips);
      }
    }

    // ── Stats ──
    healthValue.textContent = `${crew.health}/100`;
    attackValue.textContent = `${calculateAttackScore(crew)}`;

    const roleDef = getCrewRoleDefinition(crew.role);
    if (roleDef) {
      salaryRow.style.display = '';
      salaryValue.textContent =
        roleDef.salary > 0
          ? `${(roleDef.salary * TICKS_PER_DAY).toFixed(0)} cr/day`
          : 'None (Captain)';
    } else {
      salaryRow.style.display = 'none';
    }

    if (crew.unpaidTicks > 0 && !crew.isCaptain) {
      unpaidWarning.style.display = '';
      const unpaidDays = Math.ceil(crew.unpaidTicks / TICKS_PER_DAY);
      unpaidWarning.textContent = `⚠️ ${unpaidDays} unpaid day${unpaidDays > 1 ? 's' : ''} - will depart at next port!`;
    } else {
      unpaidWarning.style.display = 'none';
    }

    // ── Zero-G Exposure ──
    const exposureDays = formatExposureDays(crew.zeroGExposure);
    const exposureLevel = getGravityDegradationLevel(crew.zeroGExposure);
    const nextThreshold = getNextThreshold(crew.zeroGExposure);

    exposureTitle.textContent = `Zero-G Exposure: ${exposureDays} days`;

    const fillPercent = Math.min(100, (exposureDays / maxDays) * 100);
    exposureBarFill.style.width = `${fillPercent}%`;

    if (exposureLevel === 'none') {
      exposureBarFill.style.backgroundColor = '#4ade80';
    } else if (exposureLevel === 'minor') {
      exposureBarFill.style.backgroundColor = '#fbbf24';
    } else if (exposureLevel === 'moderate') {
      exposureBarFill.style.backgroundColor = '#fb923c';
    } else if (exposureLevel === 'severe') {
      exposureBarFill.style.backgroundColor = '#f87171';
    } else {
      exposureBarFill.style.backgroundColor = '#dc2626';
    }

    // Status text
    if (exposureLevel === 'none') {
      exposureStatusText.innerHTML = '';
      exposureStatusText.textContent = 'Status: Normal — No effects';
      exposureStatusText.style.color = '#4ade80';
    } else {
      const levelName = getDegradationLevelName(exposureLevel);
      const description = getDegradationDescription(exposureLevel);
      exposureStatusText.innerHTML = `Status: <span style="color: ${exposureLevel === 'minor' ? '#fbbf24' : exposureLevel === 'moderate' ? '#fb923c' : '#f87171'}">${levelName}</span> — ${description}`;
    }

    // Next threshold
    if (nextThreshold && ship.location.status !== 'docked') {
      exposureNextText.style.display = '';
      const nextDays = formatExposureDays(nextThreshold.threshold);
      const levelName = getDegradationLevelName(nextThreshold.level);
      const description = getDegradationDescription(nextThreshold.level);
      exposureNextText.textContent = `Next: ${levelName} at ${nextDays} days — ${description}`;
    } else {
      exposureNextText.style.display = 'none';
    }

    // Recovery
    if (ship.location.status === 'docked' && crew.zeroGExposure > 0) {
      recoveryDiv.style.display = '';
      const recovery = estimateRecoveryTime(crew.zeroGExposure);

      if (exposureLevel !== 'none') {
        recoveryNextLine.style.display = '';
        const nextLevelName = getDegradationLevelName(recovery.targetLevel);
        recoveryNextLine.textContent = `${nextLevelName}: ${formatDualTime(recovery.gameSecondsToNextLevel)}`;
      } else {
        recoveryNextLine.style.display = 'none';
      }

      recoveryFullLine.textContent = `Full recovery: ${formatDualTime(recovery.gameSecondsToFullRecovery)}`;
    } else {
      recoveryDiv.style.display = 'none';
    }

    // ── Radiation section ──
    updateRadiationSection(crew, ship);

    // ── Training indicator ──
    if (ship.location.status === 'in_flight') {
      const jobSlot = getCrewJobSlot(ship, crew.id);
      const trainingResult = calculateTickTraining(crew, jobSlot?.type ?? null);
      if (trainingResult) {
        trainingDiv.style.display = '';
        const skillName =
          trainingResult.skill.charAt(0).toUpperCase() +
          trainingResult.skill.slice(1);
        const jobDef = jobSlot ? getJobSlotDefinition(jobSlot.type) : null;
        const jobName = jobDef ? jobDef.name : 'Unknown';
        trainingDiv.textContent = `${jobName}: Training ${skillName}`;
      } else {
        trainingDiv.style.display = 'none';
      }
    } else {
      trainingDiv.style.display = 'none';
    }

    // ── Level up button ──
    const eligibleLevel = getLevelForXP(crew.xp);
    if (eligibleLevel > crew.level) {
      levelUpBtn.style.display = '';
      const levelsGained = eligibleLevel - crew.level;
      levelUpBtn.textContent = `Level Up! (+${levelsGained} skill point${levelsGained > 1 ? 's' : ''})`;
    } else {
      levelUpBtn.style.display = 'none';
    }

    // ── Skills & Mastery ──
    updateSkillsSection(gameData, crew);

    // ── Equipment ──
    updateEquipmentSection(crew);

    // ── Cargo ──
    updateCargoSection(gameData, crew);
  }

  function syncTransferOptions(otherDockedShips: Ship[]): void {
    const desiredIds = new Set(otherDockedShips.map((s) => s.id));

    // Remove options for ships no longer present (skip placeholder at index 0)
    for (let i = transferSelect.options.length - 1; i >= 1; i--) {
      if (!desiredIds.has(transferSelect.options[i].value)) {
        transferSelect.remove(i);
      }
    }

    // Add options for new ships
    const existingIds = new Set<string>();
    for (let i = 1; i < transferSelect.options.length; i++) {
      existingIds.add(transferSelect.options[i].value);
    }
    for (const otherShip of otherDockedShips) {
      if (!existingIds.has(otherShip.id)) {
        const opt = document.createElement('option');
        opt.value = otherShip.id;
        opt.textContent = otherShip.name;
        transferSelect.appendChild(opt);
      }
    }

    // Update names of existing options
    for (let i = 1; i < transferSelect.options.length; i++) {
      const opt = transferSelect.options[i];
      const ship = otherDockedShips.find((s) => s.id === opt.value);
      if (ship && opt.textContent !== ship.name) {
        opt.textContent = ship.name;
      }
    }

    // If the currently selected value is no longer valid, reset
    if (transferSelect.value && !desiredIds.has(transferSelect.value)) {
      transferSelect.value = '';
      transferBtn.disabled = true;
    }
  }

  function updateRadiationSection(crew: CrewMember, ship: Ship): void {
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    const engineRadiation = engineDef.radiationOutput || 0;

    // Clear the content area and rebuild (this is a contained sub-section,
    // not an interactive element, so clearing is acceptable here)
    while (radContent.firstChild) {
      radContent.removeChild(radContent.firstChild);
    }

    if (engineRadiation === 0) {
      radTitle.textContent = 'Radiation Exposure: N/A';
      radTitle.style.color = '#555';

      const inactiveNote = document.createElement('div');
      inactiveNote.style.fontSize = '0.9em';
      inactiveNote.style.color = '#555';
      inactiveNote.textContent =
        'Chemical engines produce no radiation. Higher-class drives require shielding.';
      radContent.appendChild(inactiveNote);
    } else {
      let totalShielding = 0;
      for (const eq of ship.equipment) {
        const eqDef = getEquipmentDefinition(eq.definitionId);
        if (eqDef?.radiationShielding) {
          const effectiveness = 1 - eq.degradation / 200;
          totalShielding += eqDef.radiationShielding * effectiveness;
        }
      }

      const netRadiation = Math.max(0, engineRadiation - totalShielding);

      if (ship.engine.state === 'online' && netRadiation > 0) {
        const crewJob = getCrewJobSlot(ship, crew.id);
        const isPatient = crewJob?.type === 'patient';
        const medbay = ship.rooms.find((r) => r.type === 'medbay');
        const damagePerTick = netRadiation / 100;
        const effectiveDamage =
          isPatient && medbay?.state === 'operational'
            ? damagePerTick * 0.5
            : damagePerTick;
        const damagePerDay = effectiveDamage * TICKS_PER_DAY;

        radTitle.textContent = 'Radiation Exposure: Active';
        radTitle.style.color = '#f87171';

        const radDetails = document.createElement('div');
        radDetails.style.fontSize = '0.9em';
        radDetails.style.lineHeight = '1.6';

        const netLine = document.createElement('div');
        netLine.innerHTML = `<span style="color: #888;">Net Radiation:</span> <span style="color: ${netRadiation > 30 ? '#f87171' : netRadiation > 15 ? '#fbbf24' : '#fb923c'}">${netRadiation.toFixed(0)} rad</span> <span style="color: #666;">(${engineRadiation} engine - ${totalShielding.toFixed(0)} shield)</span>`;
        radDetails.appendChild(netLine);

        const damageLine = document.createElement('div');
        damageLine.innerHTML = `<span style="color: #888;">Health Loss:</span> <span style="color: #f87171;">-${damagePerDay.toFixed(1)} HP/day</span>`;
        if (isPatient && medbay?.state === 'operational') {
          damageLine.innerHTML +=
            ' <span style="color: #4ade80; font-size: 0.85em;">(50% reduced — medbay)</span>';
        }
        radDetails.appendChild(damageLine);

        // Containment spike warning
        const confinementEq = ship.equipment.find(
          (eq) => eq.definitionId === 'mag_confinement'
        );
        if (confinementEq && confinementEq.degradation > 30) {
          const spikeLine = document.createElement('div');
          spikeLine.style.color = '#ff6b6b';
          spikeLine.style.fontWeight = 'bold';
          spikeLine.style.marginTop = '0.25rem';
          const integrity = (100 - confinementEq.degradation).toFixed(0);
          spikeLine.textContent = `Containment breach (${integrity}% integrity) — radiation spikes active!`;
          radDetails.appendChild(spikeLine);
        }

        radContent.appendChild(radDetails);
      } else if (ship.engine.state === 'online' && netRadiation === 0) {
        radTitle.textContent = 'Radiation Exposure: Shielded';
        radTitle.style.color = '#4ade80';

        const shieldedNote = document.createElement('div');
        shieldedNote.style.fontSize = '0.9em';
        shieldedNote.style.color = '#888';
        shieldedNote.textContent = `Engine output ${engineRadiation} rad fully absorbed by shielding (${totalShielding.toFixed(0)} capacity).`;
        radContent.appendChild(shieldedNote);
      } else {
        radTitle.textContent = 'Radiation Exposure: Engine Off';
        radTitle.style.color = '#888';

        const offNote = document.createElement('div');
        offNote.style.fontSize = '0.9em';
        offNote.style.color = '#666';
        offNote.textContent = `Engine emits ${engineRadiation} rad when online. Shielding capacity: ${totalShielding.toFixed(0)}.`;
        radContent.appendChild(offNote);
      }
    }
  }

  function updateSkillsSection(gameData: GameData, crew: CrewMember): void {
    // Specialization badge
    if (crew.specialization) {
      specBadge.style.display = '';
      const specName =
        crew.specialization.skillId.charAt(0).toUpperCase() +
        crew.specialization.skillId.slice(1);
      specBadge.textContent = `Specialized: ${specName}`;
    } else {
      specBadge.style.display = 'none';
    }

    // Initialize skill rows and mastery sections lazily
    if (!skillsInitialized) {
      for (const skillId of coreSkillIds) {
        const sr = createSkillRow(crew, skillId);
        skillRowRefs[skillId] = sr;
        skillsDiv.appendChild(sr.row);

        const ms = createMasterySection(
          skillId,
          crew.mastery[skillId],
          crew,
          gameData
        );
        masterySectionRefs[skillId] = ms;
        skillsDiv.appendChild(ms.container);
      }

      // Append combat row and mark initialized
      skillsDiv.appendChild(combatRow);
      skillsInitialized = true;
    } else {
      // Update existing
      for (const skillId of coreSkillIds) {
        updateSkillRow(skillRowRefs[skillId], crew, skillId);
        updateMasterySection(
          masterySectionRefs[skillId],
          skillId,
          crew.mastery[skillId],
          crew,
          gameData
        );
      }
    }

    // Ranged combat
    const hasWeapon = crew.equipment.some((item) => {
      const def = getCrewEquipmentDefinition(item.definitionId);
      return def.category === 'weapon';
    });
    combatRow.style.display = hasWeapon ? '' : 'none';

    // Specialization section
    if (!crew.specialization) {
      const eligibleSkills = coreSkillIds.filter(
        (s) => Math.floor(crew.skills[s]) >= SPECIALIZATION_THRESHOLD
      );
      if (eligibleSkills.length > 0) {
        specSection.style.display = '';

        // Rebuild specialization buttons (few elements, no interactivity concern)
        while (specControls.firstChild) {
          specControls.removeChild(specControls.firstChild);
        }

        for (const skillId of eligibleSkills) {
          const btn = document.createElement('button');
          const sName = skillId.charAt(0).toUpperCase() + skillId.slice(1);
          btn.textContent = `Specialize: ${sName}`;
          btn.style.padding = '0.4rem 0.8rem';
          btn.style.fontSize = '0.85rem';
          btn.addEventListener('click', () => {
            if (callbacks.onSpecializeCrew) {
              callbacks.onSpecializeCrew(crew.id, skillId);
            }
          });
          specControls.appendChild(btn);
        }
      } else {
        specSection.style.display = 'none';
      }
    } else {
      specSection.style.display = 'none';
    }
  }

  function updateEquipmentSection(crew: CrewMember): void {
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      const refs = equipSlots[i];

      const equippedItem = crew.equipment.find((item) => {
        const def = getCrewEquipmentDefinition(item.definitionId);
        return def.category === category.id;
      });

      if (equippedItem) {
        const def = getCrewEquipmentDefinition(equippedItem.definitionId);
        refs.itemDiv.textContent = `${def.icon} ${def.name}`;
        refs.itemDiv.style.display = '';
        refs.unequipBtn.style.display = '';
        refs.emptyDiv.style.display = 'none';
      } else {
        refs.itemDiv.style.display = 'none';
        refs.unequipBtn.style.display = 'none';
        refs.emptyDiv.style.display = '';
      }
    }
  }

  function updateCargoSection(gameData: GameData, crew: CrewMember): void {
    const ship = getActiveShip(gameData);

    // Cargo space
    let usedSpace = 0;
    for (const item of ship.cargo) {
      const def = getCrewEquipmentDefinition(item.definitionId);
      usedSpace += def.storageUnits;
    }
    const maxSpace = 20; // TODO: get from ship class
    cargoSpaceLabel.textContent = `${usedSpace}/${maxSpace} SU`;

    // Reconcile cargo items
    if (ship.cargo.length === 0) {
      cargoEmptyMsg.style.display = '';
    } else {
      cargoEmptyMsg.style.display = 'none';
    }

    const currentCargoIds = new Set<string>();
    for (const item of ship.cargo) {
      currentCargoIds.add(item.id);
      let refs = cargoItemMap.get(item.id);
      if (!refs) {
        refs = createCargoItem(item.id, item.definitionId);
        cargoItemMap.set(item.id, refs);
        cargoList.appendChild(refs.item);
      }
      updateCargoItem(refs, item.definitionId, crew);
    }

    // Remove departed cargo
    for (const [id, refs] of cargoItemMap) {
      if (!currentCargoIds.has(id)) {
        refs.item.remove();
        cargoItemMap.delete(id);
      }
    }
  }

  function createCargoItem(
    itemId: string,
    definitionId: CrewEquipmentId
  ): CargoItemRefs {
    const def = getCrewEquipmentDefinition(definitionId);
    const item = document.createElement('div');
    item.className = 'cargo-item';

    const itemInfo = document.createElement('div');
    itemInfo.className = 'cargo-item-info';
    itemInfo.textContent = `${def.icon} ${def.name}`;
    item.appendChild(itemInfo);

    const equipButton = document.createElement('button');
    equipButton.className = 'equip-button';
    equipButton.textContent = 'Equip';
    equipButton.addEventListener('click', () => {
      if (currentSelectedCrewId) {
        callbacks.onEquipItem(currentSelectedCrewId, itemId);
      }
    });
    item.appendChild(equipButton);

    return { item, itemInfo, equipButton };
  }

  function updateCargoItem(
    refs: CargoItemRefs,
    definitionId: CrewEquipmentId,
    crew: CrewMember
  ): void {
    const def = getCrewEquipmentDefinition(definitionId);
    refs.itemInfo.textContent = `${def.icon} ${def.name}`;

    const categoryOccupied = crew.equipment.some((equipped) => {
      const equippedDef = getCrewEquipmentDefinition(equipped.definitionId);
      return equippedDef.category === def.category;
    });

    refs.equipButton.disabled = categoryOccupied;
    if (categoryOccupied) {
      refs.equipButton.title = `${def.category} slot already occupied`;
    } else {
      refs.equipButton.title = '';
    }
  }

  // ── Initial render ──
  update(gameData);

  return {
    el: container,
    update,
    setSelectedCrewId(id: string | undefined) {
      currentSelectedCrewId = id;
    },
  };
}
