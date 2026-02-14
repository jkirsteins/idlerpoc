import type {
  GameData,
  CrewMember,
  CrewEquipmentId,
  SkillId,
  SkillMasteryState,
  Ship,
} from '../models';
import { getActiveShip } from '../models';
import type { TabbedViewCallbacks } from './types';
import { getCrewEquipmentDefinition } from '../crewEquipment';
import {
  getCrewRoleName,
  getPrimarySkillForRole,
  getCrewSalaryPerTick,
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
import { getPoolFillPercent, getCheckpointBonuses } from '../masterySystem';
import type { Component } from './component';
import {
  createMasterySection,
  updateMasterySection,
} from './crewMasterySection';
import type { MasterySectionRefs } from './crewMasterySection';

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
          `${c.id},${c.health},${c.morale},${c.unpaidTicks},${c.zeroGExposure},${c.equipment.length},${c.hiredAt},${c.boardedShipAt}`
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
        const poolSummary = (
          ['piloting', 'mining', 'commerce', 'repairs'] as const
        )
          .map((s) => `${s}:${m[s].pool.xp}/${m[s].pool.maxXp}`)
          .join(',');
        const itemCount = (
          ['piloting', 'mining', 'commerce', 'repairs'] as const
        )
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

// ─── Collapsible Skill Block ─────────────────────────────────────

function createSkillBlock(
  crew: CrewMember,
  skillId: SkillId,
  gameData: GameData,
  onSpendPoolXp:
    | ((crewId: string, skillId: SkillId, itemId: string) => void)
    | undefined,
  skillExpandedState: Map<SkillId, boolean>
): SkillBlockRefs {
  const container = document.createElement('div');
  container.style.marginBottom = '0.5rem';

  // Header click target (skill row + chevron)
  const headerClickTarget = document.createElement('div');
  headerClickTarget.className = 'skill-block-header';
  headerClickTarget.style.display = 'flex';
  headerClickTarget.style.alignItems = 'center';
  headerClickTarget.style.justifyContent = 'space-between';
  headerClickTarget.style.cursor = 'pointer';
  headerClickTarget.style.minHeight = '44px';
  headerClickTarget.style.padding = '0 0.5rem';
  headerClickTarget.style.borderRadius = '4px';
  headerClickTarget.style.transition = 'background 0.2s';

  // Embed skill row
  const skillRow = createSkillRow(crew, skillId);
  skillRow.row.style.flex = '1';
  skillRow.row.style.padding = '0';
  skillRow.row.style.background = 'none';
  headerClickTarget.appendChild(skillRow.row);

  // Chevron
  const chevron = document.createElement('span');
  chevron.textContent = '▶';
  chevron.style.fontSize = '0.8rem';
  chevron.style.color = 'var(--text-muted)';
  chevron.style.transition = 'transform 0.2s';
  chevron.style.flexShrink = '0';
  chevron.style.marginLeft = '0.5rem';
  headerClickTarget.appendChild(chevron);

  container.appendChild(headerClickTarget);

  // Summary line
  const summaryLine = document.createElement('div');
  summaryLine.style.fontSize = '0.8rem';
  summaryLine.style.color = 'var(--text-muted)';
  summaryLine.style.marginTop = '0.25rem';
  summaryLine.style.marginLeft = '0.5rem';
  summaryLine.style.display = 'flex';
  summaryLine.style.gap = '1rem';
  summaryLine.style.flexWrap = 'wrap';

  const summaryPoolPct = document.createElement('span');
  summaryLine.appendChild(summaryPoolPct);

  const summaryItemCount = document.createElement('span');
  summaryLine.appendChild(summaryItemCount);

  const summaryHighestLevel = document.createElement('span');
  summaryLine.appendChild(summaryHighestLevel);

  const summaryActiveCheckpoints = document.createElement('span');
  summaryLine.appendChild(summaryActiveCheckpoints);

  container.appendChild(summaryLine);

  // Mastery section (initially hidden)
  const masterySection = createMasterySection(
    skillId,
    crew.mastery[skillId],
    crew,
    gameData,
    onSpendPoolXp
  );
  masterySection.container.style.display = 'none';
  container.appendChild(masterySection.container);

  const refs: SkillBlockRefs = {
    container,
    headerClickTarget,
    chevron,
    skillRow,
    summaryLine,
    summaryPoolPct,
    summaryItemCount,
    summaryHighestLevel,
    summaryActiveCheckpoints,
    masterySection,
  };

  // Click handler (after refs declaration)
  headerClickTarget.addEventListener('click', () => {
    const expanded = skillExpandedState.get(skillId) || false;
    skillExpandedState.set(skillId, !expanded);
    syncSkillExpansion(refs, skillId, skillExpandedState);
  });

  return refs;
}

function syncSkillExpansion(
  refs: SkillBlockRefs,
  skillId: SkillId,
  skillExpandedState: Map<SkillId, boolean>
): void {
  const expanded = skillExpandedState.get(skillId) || false;

  // Toggle chevron rotation and text
  refs.chevron.style.transform = expanded ? 'rotate(90deg)' : '';
  refs.chevron.textContent = expanded ? '▼' : '▶';

  // Show/hide mastery section
  refs.masterySection.container.style.display = expanded ? '' : 'none';
}

function updateMasterySummary(
  refs: SkillBlockRefs,
  skillId: SkillId,
  state: SkillMasteryState
): void {
  const fillPct = getPoolFillPercent(state.pool);
  const itemCount = Object.keys(state.itemMasteries).length;
  const checkpoints = getCheckpointBonuses(skillId, state.pool);
  const activeCheckpoints = checkpoints.filter((cp) => cp.active).length;

  // Find highest mastery level
  let highestLevel = 0;
  for (const mastery of Object.values(state.itemMasteries)) {
    if (mastery && mastery.level > highestLevel) {
      highestLevel = mastery.level;
    }
  }

  // Pool percentage
  if (state.pool.maxXp === 0) {
    refs.summaryPoolPct.textContent = 'No items discovered';
    refs.summaryPoolPct.style.color = 'var(--text-disabled)';
    refs.summaryItemCount.textContent = '';
    refs.summaryHighestLevel.textContent = '';
    refs.summaryActiveCheckpoints.textContent = '';
  } else {
    const displayPct = Math.floor(fillPct * 10) / 10;
    refs.summaryPoolPct.textContent = `Pool: ${displayPct.toFixed(1)}%`;
    refs.summaryPoolPct.style.color = fillPct >= 95 ? '#fbbf24' : '#888';

    // Item count
    refs.summaryItemCount.textContent = `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
    refs.summaryItemCount.style.color = 'var(--text-muted)';

    // Highest level
    refs.summaryHighestLevel.textContent = `Best: Lv ${highestLevel}`;
    if (highestLevel >= 99) {
      refs.summaryHighestLevel.style.color = 'var(--yellow-bright)';
    } else if (highestLevel >= 50) {
      refs.summaryHighestLevel.style.color = 'var(--positive-green)';
    } else {
      refs.summaryHighestLevel.style.color = 'var(--text-muted)';
    }

    // Active checkpoints
    refs.summaryActiveCheckpoints.textContent = `${activeCheckpoints}/${checkpoints.length} checkpoints`;
    refs.summaryActiveCheckpoints.style.color =
      activeCheckpoints === checkpoints.length ? '#fbbf24' : '#888';
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

// ─── Skill block refs (collapsible skill + mastery) ──────────────

interface SkillBlockRefs {
  container: HTMLDivElement;
  headerClickTarget: HTMLDivElement;
  chevron: HTMLSpanElement;
  skillRow: SkillRowRefs;
  summaryLine: HTMLDivElement;
  summaryPoolPct: HTMLSpanElement;
  summaryItemCount: HTMLSpanElement;
  summaryHighestLevel: HTMLSpanElement;
  summaryActiveCheckpoints: HTMLSpanElement;
  masterySection: MasterySectionRefs;
}

function createSkillRow(crew: CrewMember, skillId: SkillId): SkillRowRefs {
  const row = document.createElement('div');
  row.className = 'skill-row';

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
  unpaidBadge: HTMLDivElement;
}

// ─── Cargo item refs ──────────────────────────────────────────────

interface CargoItemRefs {
  item: HTMLDivElement;
  itemInfo: HTMLDivElement;
  equipButton: HTMLButtonElement;
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

  // Skill expansion state (persists across crew selection)
  const skillExpandedState = new Map<SkillId, boolean>();

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

    const unpaidBadge = document.createElement('div');
    unpaidBadge.className = 'unpaid-badge';
    unpaidBadge.style.color = 'var(--red-bright)';
    unpaidBadge.style.fontSize = '0.75rem';
    unpaidBadge.style.fontWeight = 'bold';
    unpaidBadge.style.display = 'none';
    row.appendChild(unpaidBadge);

    row.addEventListener('click', () => callbacks.onSelectCrew(crew.id));

    return { row, nameDiv, roleDiv, unpaidBadge };
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

  // ── Header section (Row 1) ──
  const headerSection = document.createElement('div');
  headerSection.className = 'crew-detail-header';

  const detailName = document.createElement('h2');
  detailName.style.whiteSpace = 'nowrap';
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
  detailRole.style.whiteSpace = 'nowrap';
  detailRole.style.flexShrink = '0';
  headerSection.appendChild(detailRole);

  detailPanel.appendChild(headerSection);

  // ── Service record section (Row 2) ──
  const serviceSection = document.createElement('div');
  serviceSection.className = 'crew-service-record';
  serviceSection.style.display = 'flex';
  serviceSection.style.gap = '0.75rem';
  serviceSection.style.flexWrap = 'wrap';
  serviceSection.style.fontSize = '0.85rem';
  serviceSection.style.color = 'var(--text-secondary)';

  const serviceAssignment = document.createElement('span');
  serviceAssignment.style.whiteSpace = 'nowrap';
  serviceAssignment.style.color = 'var(--text-light-gray)';
  serviceSection.appendChild(serviceAssignment);

  const serviceSeparator1 = document.createElement('span');
  serviceSeparator1.textContent = '·';
  serviceSeparator1.style.color = 'var(--text-disabled)';
  serviceSection.appendChild(serviceSeparator1);

  const serviceShipTenure = document.createElement('span');
  serviceShipTenure.style.whiteSpace = 'nowrap';
  serviceSection.appendChild(serviceShipTenure);

  const serviceSeparator2 = document.createElement('span');
  serviceSeparator2.textContent = '·';
  serviceSeparator2.style.color = 'var(--text-disabled)';
  serviceSeparator2.style.display = 'none';
  serviceSection.appendChild(serviceSeparator2);

  const serviceCompanyTenure = document.createElement('span');
  serviceCompanyTenure.style.whiteSpace = 'nowrap';
  serviceCompanyTenure.style.display = 'none';
  serviceSection.appendChild(serviceCompanyTenure);

  const serviceSeparator3 = document.createElement('span');
  serviceSeparator3.textContent = '·';
  serviceSeparator3.style.color = 'var(--text-disabled)';
  serviceSection.appendChild(serviceSeparator3);

  const serviceOrigin = document.createElement('span');
  serviceOrigin.style.whiteSpace = 'nowrap';
  serviceOrigin.style.color = 'var(--text-muted)';
  serviceSection.appendChild(serviceOrigin);

  detailPanel.appendChild(serviceSection);

  // Transfer section created later after training div

  // ── Stats section (Row 3) ──
  const statsSection = document.createElement('div');
  statsSection.style.display = 'flex';
  statsSection.style.flexWrap = 'wrap';
  statsSection.style.gap = '0.75rem';
  statsSection.style.fontSize = '0.85rem';
  statsSection.style.alignItems = 'center';

  const statsTitle = document.createElement('h3');
  statsTitle.textContent = 'Stats';
  statsTitle.style.display = 'none';

  // Health stat
  const healthRow = document.createElement('div');
  healthRow.style.display = 'inline-flex';
  healthRow.style.gap = '0.25rem';
  healthRow.style.whiteSpace = 'nowrap';
  const healthLabel = document.createElement('span');
  healthLabel.textContent = 'HP:';
  healthLabel.style.color = 'var(--text-muted)';
  const healthValue = document.createElement('span');
  healthValue.style.color = 'var(--text-primary)';
  healthRow.appendChild(healthLabel);
  healthRow.appendChild(healthValue);
  statsSection.appendChild(healthRow);

  // Attack stat
  const attackRow = document.createElement('div');
  attackRow.style.display = 'inline-flex';
  attackRow.style.gap = '0.25rem';
  attackRow.style.whiteSpace = 'nowrap';
  const attackLabel = document.createElement('span');
  attackLabel.textContent = 'ATK:';
  attackLabel.style.color = 'var(--text-muted)';
  const attackValue = document.createElement('span');
  attackValue.style.color = 'var(--text-primary)';
  attackRow.appendChild(attackLabel);
  attackRow.appendChild(attackValue);
  statsSection.appendChild(attackRow);

  // Salary stat
  const salaryRow = document.createElement('div');
  salaryRow.style.display = 'none';
  salaryRow.style.gap = '0.25rem';
  salaryRow.style.whiteSpace = 'nowrap';
  const salaryLabel = document.createElement('span');
  salaryLabel.textContent = 'Salary:';
  salaryLabel.style.color = 'var(--text-muted)';
  const salaryValue = document.createElement('span');
  salaryValue.style.color = 'var(--text-primary)';
  salaryRow.appendChild(salaryLabel);
  salaryRow.appendChild(salaryValue);
  statsSection.appendChild(salaryRow);

  // Unpaid warning (inline)
  const unpaidWarning = document.createElement('span');
  unpaidWarning.className = 'unpaid-warning';
  unpaidWarning.style.color = 'var(--red-bright)';
  unpaidWarning.style.fontWeight = 'bold';
  unpaidWarning.style.whiteSpace = 'nowrap';
  unpaidWarning.style.display = 'none';
  statsSection.appendChild(unpaidWarning);

  detailPanel.appendChild(statsSection);

  // ── Zero-G Exposure section (Row 4 left) ──
  const exposureSection = document.createElement('div');
  exposureSection.className = 'exposure-section';
  exposureSection.style.display = 'flex';
  exposureSection.style.gap = '0.5rem';
  exposureSection.style.alignItems = 'center';
  exposureSection.style.fontSize = '0.85rem';

  const exposureTitle = document.createElement('span');
  exposureTitle.style.whiteSpace = 'nowrap';
  exposureTitle.style.color = 'var(--text-secondary)';
  exposureSection.appendChild(exposureTitle);

  // Exposure progress bar container (compact)
  const exposureBarContainer = document.createElement('div');
  exposureBarContainer.style.position = 'relative';
  exposureBarContainer.style.width = '80px';
  exposureBarContainer.style.height = '8px';
  exposureBarContainer.style.backgroundColor = 'rgba(0,0,0,0.3)';
  exposureBarContainer.style.borderRadius = '4px';
  exposureBarContainer.style.overflow = 'visible';

  const exposureBarFill = document.createElement('div');
  exposureBarFill.style.width = '0%';
  exposureBarFill.style.height = '100%';
  exposureBarFill.style.transition = 'width 0.3s ease';
  exposureBarFill.style.borderRadius = '4px';
  exposureBarContainer.appendChild(exposureBarFill);

  // Threshold markers (thin lines only, no labels)
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
    marker.style.width = '1px';
    marker.style.backgroundColor = 'rgba(255,255,255,0.3)';
    exposureBarContainer.appendChild(marker);
  }

  exposureSection.appendChild(exposureBarContainer);

  // Status text (single word colored)
  const exposureStatusText = document.createElement('span');
  exposureStatusText.style.whiteSpace = 'nowrap';
  exposureStatusText.style.fontSize = '0.85rem';
  exposureSection.appendChild(exposureStatusText);

  // Hidden elements (data stored but not shown)
  const exposureNextText = document.createElement('div');
  exposureNextText.style.display = 'none';

  const recoveryDiv = document.createElement('div');
  recoveryDiv.style.display = 'none';

  const recoveryTitle = document.createElement('div');
  recoveryDiv.appendChild(recoveryTitle);

  const recoveryNextLine = document.createElement('div');
  recoveryDiv.appendChild(recoveryNextLine);

  const recoveryFullLine = document.createElement('div');
  recoveryDiv.appendChild(recoveryFullLine);

  // ── Radiation Exposure section (Row 4 right) ──
  const radiationSection = document.createElement('div');
  radiationSection.className = 'radiation-exposure-section';
  radiationSection.style.display = 'inline-flex';
  radiationSection.style.gap = '0.5rem';
  radiationSection.style.alignItems = 'center';
  radiationSection.style.fontSize = '0.85rem';

  const radTitle = document.createElement('span');
  radTitle.style.whiteSpace = 'nowrap';
  radTitle.style.color = 'var(--text-secondary)';
  radiationSection.appendChild(radTitle);

  const radContent = document.createElement('div');
  radContent.style.display = 'none';
  radiationSection.appendChild(radContent);

  // ── Combine exposure and radiation into one visual row (Row 4) ──
  const exposureRow = document.createElement('div');
  exposureRow.style.display = 'flex';
  exposureRow.style.gap = '1.5rem';
  exposureRow.style.alignItems = 'center';
  exposureRow.style.flexWrap = 'wrap';
  exposureRow.appendChild(exposureSection);
  exposureRow.appendChild(radiationSection);

  detailPanel.appendChild(statsSection);
  detailPanel.appendChild(exposureRow);

  // ── Training indicator (Row 5) ──
  const trainingDiv = document.createElement('div');
  trainingDiv.className = 'training-indicator';
  trainingDiv.style.borderLeft = '3px solid rgba(74, 222, 128, 0.3)';
  trainingDiv.style.padding = '2px 6px';
  trainingDiv.style.margin = '0';
  trainingDiv.style.background = 'none';
  trainingDiv.style.fontSize = '0.85rem';
  trainingDiv.style.color = 'var(--positive-green)';
  trainingDiv.style.display = 'none';
  detailPanel.appendChild(trainingDiv);

  // ── Transfer crew section (Row 6) ──
  const transferSection = document.createElement('div');
  transferSection.className = 'transfer-crew-section';
  transferSection.style.display = 'flex';
  transferSection.style.gap = '0.5rem';
  transferSection.style.alignItems = 'center';
  transferSection.style.fontSize = '0.85rem';

  const transferTitle = document.createElement('span');
  transferTitle.textContent = 'Transfer:';
  transferTitle.style.color = 'var(--text-secondary)';
  transferTitle.style.whiteSpace = 'nowrap';
  transferSection.appendChild(transferTitle);

  const transferNoShipsMsg = document.createElement('span');
  transferNoShipsMsg.style.color = 'var(--text-muted)';
  transferNoShipsMsg.style.whiteSpace = 'nowrap';
  transferNoShipsMsg.textContent = 'Dock to transfer';
  transferNoShipsMsg.style.display = 'none';
  transferSection.appendChild(transferNoShipsMsg);

  const transferControls = document.createElement('div');
  transferControls.style.display = 'none';
  transferControls.style.gap = '0.5rem';
  transferControls.style.alignItems = 'center';

  const transferSelect = document.createElement('select');
  transferSelect.style.padding = '2px 4px';
  transferSelect.style.background = 'rgba(0, 0, 0, 0.5)';
  transferSelect.style.border = '1px solid #666';
  transferSelect.style.borderRadius = '4px';
  transferSelect.style.color = 'var(--text-white)';
  transferSelect.style.fontSize = '0.85rem';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = '-- Select ship --';
  transferSelect.appendChild(placeholderOption);

  transferControls.appendChild(transferSelect);

  const transferBtn = document.createElement('button');
  transferBtn.textContent = 'Transfer';
  transferBtn.style.padding = '2px 8px';
  transferBtn.style.fontSize = '0.85rem';
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
  specBadge.style.color = 'var(--positive-green)';
  specBadge.style.fontWeight = 'bold';
  specBadge.style.display = 'none';
  skillsHeader.appendChild(specBadge);

  skillsSection.appendChild(skillsHeader);

  const skillsDiv = document.createElement('div');
  skillsDiv.className = 'crew-skills';

  // Create collapsible skill blocks for each skill
  const coreSkillIds: SkillId[] = ['piloting', 'mining', 'commerce', 'repairs'];
  const skillBlockMap: Record<SkillId, SkillBlockRefs> = {} as Record<
    SkillId,
    SkillBlockRefs
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
  combatValue.style.color = 'var(--text-muted)';
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
  specLabel.style.color = 'var(--positive-green)';
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

    // ── Service record (Row 2) ──
    const jobSlotForService = getCrewJobSlot(ship, crew.id);
    if (jobSlotForService) {
      const jobDef = getJobSlotDefinition(jobSlotForService.type);
      const jobName = jobDef?.name ?? jobSlotForService.type;
      serviceAssignment.textContent = `${jobName} on ${ship.name}`;
    } else if (ship.location.status === 'docked') {
      serviceAssignment.textContent = `Stationed on ${ship.name}`;
    } else {
      serviceAssignment.textContent = `Aboard ${ship.name}`;
    }

    const shipTenure = gameData.gameTime - crew.boardedShipAt;
    const shipTenureDay = Math.floor(
      (gameData.gameTime - crew.boardedShipAt) / TICKS_PER_DAY
    );
    serviceShipTenure.textContent = `Aboard Day ${shipTenureDay}`;
    serviceShipTenure.title =
      shipTenure > 0
        ? `Aboard since ${formatGameDate(crew.boardedShipAt)} — ${formatDualTime(shipTenure)}`
        : `Aboard since ${formatGameDate(crew.boardedShipAt)}`;

    if (crew.hiredAt !== crew.boardedShipAt) {
      const companyTenure = gameData.gameTime - crew.hiredAt;
      const companyTenureText =
        companyTenure > 0
          ? `With the company since ${formatGameDate(crew.hiredAt)} — ${formatDualTime(companyTenure)}`
          : `With the company since ${formatGameDate(crew.hiredAt)}`;
      serviceShipTenure.title += `\n${companyTenureText}`;
      serviceSeparator2.style.display = 'none';
      serviceCompanyTenure.style.display = 'none';
    } else {
      serviceSeparator2.style.display = 'none';
      serviceCompanyTenure.style.display = 'none';
    }

    if (crew.isCaptain) {
      serviceOrigin.textContent = 'Company founder';
      serviceSeparator3.style.display = '';
    } else if (crew.hiredLocation) {
      const location = gameData.world.locations.find(
        (l) => l.id === crew.hiredLocation
      );
      if (location) {
        serviceOrigin.textContent = `Recruited at ${location.name}`;
        serviceSeparator3.style.display = '';
      } else {
        serviceOrigin.textContent = '';
        serviceSeparator3.style.display = 'none';
      }
    } else {
      serviceOrigin.textContent = '';
      serviceSeparator3.style.display = 'none';
    }

    // ── Transfer section (Row 6) ──
    if (gameData.ships.length <= 1) {
      transferNoShipsMsg.textContent = 'Acquire more ships';
      transferNoShipsMsg.style.display = '';
      transferControls.style.display = 'none';
      transferSection.style.opacity = '0.6';
    } else if (ship.location.status !== 'docked') {
      transferNoShipsMsg.textContent = 'Dock to transfer';
      transferNoShipsMsg.style.display = '';
      transferControls.style.display = 'none';
      transferSection.style.opacity = '0.6';
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
        transferNoShipsMsg.textContent = 'No other ships here';
        transferNoShipsMsg.style.display = '';
        transferControls.style.display = 'none';
      } else {
        transferNoShipsMsg.style.display = 'none';
        transferControls.style.display = 'flex';

        // Sync transfer select options without destroying the element
        syncTransferOptions(otherDockedShips);
      }
    }

    // ── Stats (Row 3) ──
    healthValue.textContent = `${crew.health}/100`;
    attackValue.textContent = `${calculateAttackScore(crew)}`;

    const crewSalaryPerTick = getCrewSalaryPerTick(crew);
    if (crewSalaryPerTick > 0) {
      salaryRow.style.display = 'inline-flex';
      salaryValue.textContent = `${(crewSalaryPerTick * TICKS_PER_DAY).toFixed(0)} cr/day`;
    } else if (crew.isCaptain) {
      salaryRow.style.display = 'inline-flex';
      salaryValue.textContent = 'None (Captain)';
    } else {
      salaryRow.style.display = 'none';
    }

    if (crew.unpaidTicks > 0 && !crew.isCaptain) {
      unpaidWarning.style.display = 'inline';
      const unpaidDays = Math.ceil(crew.unpaidTicks / TICKS_PER_DAY);
      unpaidWarning.textContent = `!${unpaidDays}d unpaid`;
      unpaidWarning.title = `${unpaidDays} unpaid day${unpaidDays > 1 ? 's' : ''} - will depart at next port!`;
    } else {
      unpaidWarning.style.display = 'none';
    }

    // ── Zero-G Exposure (Row 4 left) ──
    const exposureDays = formatExposureDays(crew.zeroGExposure);
    const exposureLevel = getGravityDegradationLevel(crew.zeroGExposure);
    const nextThreshold = getNextThreshold(crew.zeroGExposure);

    exposureTitle.textContent = `Zero-G: ${exposureDays}d`;

    const fillPercent = Math.min(100, (exposureDays / maxDays) * 100);
    exposureBarFill.style.width = `${fillPercent}%`;

    if (exposureLevel === 'none') {
      exposureBarFill.style.backgroundColor = 'var(--green-bright)';
      exposureStatusText.textContent = 'Normal';
      exposureStatusText.style.color = 'var(--positive-green)';
    } else if (exposureLevel === 'minor') {
      exposureBarFill.style.backgroundColor = 'var(--yellow-bright)';
      exposureStatusText.textContent = 'Minor';
      exposureStatusText.style.color = 'var(--yellow-bright)';
    } else if (exposureLevel === 'moderate') {
      exposureBarFill.style.backgroundColor = 'var(--orange-medium)';
      exposureStatusText.textContent = 'Moderate';
      exposureStatusText.style.color = 'var(--orange-medium)';
    } else if (exposureLevel === 'severe') {
      exposureBarFill.style.backgroundColor = 'var(--red-light)';
      exposureStatusText.textContent = 'Severe';
      exposureStatusText.style.color = 'var(--red-light)';
    } else {
      exposureBarFill.style.backgroundColor = 'var(--red-critical)';
      exposureStatusText.textContent = 'Critical';
      exposureStatusText.style.color = 'var(--red-critical)';
    }

    // Build comprehensive tooltip
    const tooltipParts: string[] = [];

    if (exposureLevel === 'none') {
      tooltipParts.push('Status: Normal — No effects');
    } else {
      const levelName = getDegradationLevelName(exposureLevel);
      const description = getDegradationDescription(exposureLevel);
      tooltipParts.push(`Status: ${levelName} — ${description}`);
    }

    if (nextThreshold && ship.location.status !== 'docked') {
      const nextDays = formatExposureDays(nextThreshold.threshold);
      const levelName = getDegradationLevelName(nextThreshold.level);
      const description = getDegradationDescription(nextThreshold.level);
      tooltipParts.push(
        `Next: ${levelName} at ${nextDays} days — ${description}`
      );
    }

    if (ship.location.status === 'docked' && crew.zeroGExposure > 0) {
      const recovery = estimateRecoveryTime(crew.zeroGExposure);
      tooltipParts.push('Recovering — Docked');
      if (exposureLevel !== 'none') {
        const nextLevelName = getDegradationLevelName(recovery.targetLevel);
        tooltipParts.push(
          `${nextLevelName}: ${formatDualTime(recovery.gameSecondsToNextLevel)}`
        );
      }
      tooltipParts.push(
        `Full recovery: ${formatDualTime(recovery.gameSecondsToFullRecovery)}`
      );
    }

    exposureSection.title = tooltipParts.join('\n');

    // ── Radiation section ──
    updateRadiationSection(crew, ship);

    // ── Training indicator ──
    // Training occurs during flight and orbiting; mining_ops is gated to mine locations
    const isTrainingState =
      ship.location.status === 'in_flight' ||
      ship.location.status === 'orbiting';
    const jobSlot = isTrainingState ? getCrewJobSlot(ship, crew.id) : null;
    const jobSlotType = jobSlot?.type ?? null;
    const isGated =
      jobSlotType === 'mining_ops' &&
      !(
        ship.location.status === 'orbiting' &&
        ship.location.orbitingAt != null &&
        gameData.world.locations.some(
          (l) =>
            l.id === ship.location.orbitingAt && l.services.includes('mine')
        )
      );
    const trainingResult =
      isTrainingState && !isGated
        ? calculateTickTraining(crew, jobSlotType)
        : null;
    if (trainingResult) {
      const skillName =
        trainingResult.skill.charAt(0).toUpperCase() +
        trainingResult.skill.slice(1);
      const jobDef = jobSlot ? getJobSlotDefinition(jobSlot.type) : null;
      trainingDiv.textContent = `${jobDef?.name ?? 'Unknown'}: Training ${skillName}`;
      trainingDiv.style.display = '';
    } else {
      trainingDiv.style.display = 'none';
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

    const tooltipParts: string[] = [];

    if (engineRadiation === 0) {
      radTitle.textContent = 'Rad: N/A';
      radTitle.style.color = 'var(--text-dark-gray)';
      tooltipParts.push(
        'Chemical engines produce no radiation. Higher-class drives require shielding.'
      );
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

        radTitle.textContent = `Rad: -${damagePerDay.toFixed(1)} HP/d`;
        radTitle.style.color = 'var(--red-light)';

        tooltipParts.push(
          `Net Radiation: ${netRadiation.toFixed(0)} rad (${engineRadiation} engine - ${totalShielding.toFixed(0)} shield)`
        );
        if (isPatient && medbay?.state === 'operational') {
          tooltipParts.push('Health Loss: 50% reduced — medbay');
        }

        // Containment spike warning
        const confinementEq = ship.equipment.find(
          (eq) => eq.definitionId === 'mag_confinement'
        );
        if (confinementEq && confinementEq.degradation > 30) {
          const integrity = (100 - confinementEq.degradation).toFixed(0);
          tooltipParts.push(
            `Containment breach (${integrity}% integrity) — radiation spikes active!`
          );
        }
      } else if (ship.engine.state === 'online' && netRadiation === 0) {
        radTitle.textContent = 'Rad: Shielded';
        radTitle.style.color = 'var(--positive-green)';

        tooltipParts.push(
          `Engine output ${engineRadiation} rad fully absorbed by shielding (${totalShielding.toFixed(0)} capacity).`
        );
      } else {
        radTitle.textContent = 'Rad: Off';
        radTitle.style.color = 'var(--text-muted)';

        tooltipParts.push(
          `Engine emits ${engineRadiation} rad when online. Shielding capacity: ${totalShielding.toFixed(0)}.`
        );
      }
    }

    radiationSection.title = tooltipParts.join('\n');
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

    // Initialize skill blocks lazily
    if (!skillsInitialized) {
      for (const skillId of coreSkillIds) {
        const block = createSkillBlock(
          crew,
          skillId,
          gameData,
          callbacks.onSpendPoolXp,
          skillExpandedState
        );
        skillBlockMap[skillId] = block;
        skillsDiv.appendChild(block.container);
      }

      // Append combat row and mark initialized
      skillsDiv.appendChild(combatRow);
      skillsInitialized = true;
    } else {
      // Update existing skill blocks
      for (const skillId of coreSkillIds) {
        const block = skillBlockMap[skillId];
        updateSkillRow(block.skillRow, crew, skillId);
        updateMasterySection(
          block.masterySection,
          skillId,
          crew.mastery[skillId],
          crew,
          gameData
        );
        updateMasterySummary(block, skillId, crew.mastery[skillId]);
        syncSkillExpansion(block, skillId, skillExpandedState);
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

  // updateCargoItem extracted to module scope to reduce function length

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
