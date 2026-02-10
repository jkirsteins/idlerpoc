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
import {
  getCrewEquipmentDefinition,
  getAllCrewEquipmentDefinitions,
} from '../crewEquipment';
import { getLevelForXP } from '../levelSystem';
import { getCrewRoleDefinition } from '../crewRoles';
import {
  getGravityDegradationLevel,
  getStrengthMultiplier,
  formatExposureDays,
  getDegradationLevelName,
  getDegradationDescription,
  getNextThreshold,
} from '../gravitySystem';
import { TICKS_PER_DAY } from '../timeSystem';
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

/** Snapshot the props the crew tab renders so we can shallow-compare. */
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
    // Crew roster identity + all rendered fields
    crew: ship.crew
      .map(
        (c) =>
          `${c.id},${c.health},${c.morale},${c.level},${c.xp},${c.unpaidTicks},${c.zeroGExposure},${c.equipment.length}`
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
    // Hireable crew at docked location
    hireable: ship.location.dockedAt
      ? (gameData.hireableCrewByLocation[ship.location.dockedAt] || [])
          .map((h) => h.id)
          .join()
      : '',
    // Job slot assignments (affects training indicator)
    slots: ship.jobSlots.map((s) => s.id + ':' + s.assignedCrewId).join(),
    // Other docked ships (affects transfer section)
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

export function createCrewTab(
  gameData: GameData,
  selectedCrewId: string | undefined,
  callbacks: TabbedViewCallbacks
): Component & { setSelectedCrewId(id: string | undefined): void } {
  const container = document.createElement('div');
  container.className = 'crew-tab';
  let currentSelectedCrewId = selectedCrewId;
  let lastSnapshot: CrewSnapshot | null = null;

  function rebuild(gameData: GameData) {
    const selectedCrewId = currentSelectedCrewId;
    const snap = snapshotCrewProps(gameData, selectedCrewId);
    if (!crewPropsChanged(lastSnapshot, snap)) return;
    lastSnapshot = snap;

    container.replaceChildren();
    const ship = getActiveShip(gameData);

    const layout = document.createElement('div');
    layout.className = 'crew-list-detail';

    // Left panel: crew list
    layout.appendChild(renderCrewList(gameData, selectedCrewId, callbacks));

    // Right panel: crew detail
    const selectedCrew = selectedCrewId
      ? ship.crew.find((c) => c.id === selectedCrewId)
      : ship.crew[0];

    if (selectedCrew) {
      layout.appendChild(renderCrewDetail(gameData, selectedCrew, callbacks));
    } else {
      layout.appendChild(renderNoCrewSelected());
    }

    container.appendChild(layout);

    // Add hiring section if docked at a hiring station
    if (ship.location.status === 'docked') {
      const dockedLocationId = ship.location.dockedAt;
      const location = gameData.world.locations.find(
        (l) => l.id === dockedLocationId
      );
      if (location && location.services.includes('hire')) {
        container.appendChild(renderHiringSection(gameData, callbacks));
      }

      // Add equipment shop if docked at a trade station
      if (location && location.services.includes('trade')) {
        container.appendChild(renderEquipmentShop(gameData, callbacks));
      }
    }
  }

  rebuild(gameData);
  return {
    el: container,
    update: rebuild,
    setSelectedCrewId(id: string | undefined) {
      currentSelectedCrewId = id;
    },
  };
}

function renderCrewList(
  gameData: GameData,
  selectedCrewId: string | undefined,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);

  const panel = document.createElement('div');
  panel.className = 'crew-list-panel';

  const title = document.createElement('h3');
  title.textContent = 'Crew Members';
  panel.appendChild(title);

  const list = document.createElement('div');
  list.className = 'crew-list';

  for (const crew of ship.crew) {
    const item = document.createElement('div');
    item.className =
      crew.id === selectedCrewId ? 'crew-list-item selected' : 'crew-list-item';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'crew-list-name';
    nameDiv.textContent = crew.isCaptain ? `CPT ${crew.name}` : crew.name;
    item.appendChild(nameDiv);

    const roleDiv = document.createElement('div');
    roleDiv.className = 'crew-list-role';
    roleDiv.textContent = crew.role.replace('_', ' ');
    item.appendChild(roleDiv);

    const levelDiv = document.createElement('div');
    levelDiv.className = 'crew-list-level';
    levelDiv.textContent = `Level ${crew.level}`;
    item.appendChild(levelDiv);

    // Show unpaid badge if crew has unpaid ticks
    if (crew.unpaidTicks > 0 && !crew.isCaptain) {
      const unpaidBadge = document.createElement('div');
      unpaidBadge.className = 'unpaid-badge';
      unpaidBadge.textContent = '⚠️ UNPAID';
      unpaidBadge.style.color = '#ff4444';
      unpaidBadge.style.fontSize = '0.75rem';
      unpaidBadge.style.fontWeight = 'bold';
      item.appendChild(unpaidBadge);
    }

    item.addEventListener('click', () => callbacks.onSelectCrew(crew.id));
    list.appendChild(item);
  }

  panel.appendChild(list);
  return panel;
}

function renderNoCrewSelected(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'crew-detail-panel';

  const message = document.createElement('p');
  message.textContent = 'Select a crew member to view details';
  message.style.textAlign = 'center';
  message.style.marginTop = '2rem';
  panel.appendChild(message);

  return panel;
}

function calculateAttackScore(crew: CrewMember): number {
  // Base attack from piloting skill
  const level = getGravityDegradationLevel(crew.zeroGExposure);
  const multiplier = getStrengthMultiplier(level);
  let attack = Math.floor(crew.skills.piloting * multiplier);

  // Add weapon bonus
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

function renderCrewDetail(
  gameData: GameData,
  crew: CrewMember,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'crew-detail-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'crew-detail-header';

  const name = document.createElement('h2');
  name.textContent = crew.name;
  if (crew.isCaptain) {
    const badge = document.createElement('span');
    badge.className = 'captain-badge';
    badge.textContent = 'CPT';
    name.prepend(badge);
    name.prepend(document.createTextNode(' '));
  }
  header.appendChild(name);

  const role = document.createElement('div');
  role.className = 'crew-detail-role';
  role.textContent = crew.role.replace('_', ' ').toUpperCase();
  header.appendChild(role);

  panel.appendChild(header);

  // Transfer crew option (when docked with multiple ships)
  const ship = getActiveShip(gameData);
  if (
    !crew.isCaptain &&
    ship.location.status === 'docked' &&
    gameData.ships.length > 1
  ) {
    panel.appendChild(renderTransferCrewSection(gameData, crew, callbacks));
  }

  // Stats section
  panel.appendChild(renderStatsSection(crew));

  // Job training indicator (show what skill is being trained)
  if (ship.location.status === 'in_flight') {
    const jobSlot = getCrewJobSlot(ship, crew.id);
    const trainingResult = calculateTickTraining(crew, jobSlot?.type ?? null);
    if (trainingResult) {
      const trainingDiv = document.createElement('div');
      trainingDiv.className = 'training-indicator';
      trainingDiv.style.padding = '0.5rem 0.75rem';
      trainingDiv.style.marginBottom = '0.5rem';
      trainingDiv.style.background = 'rgba(74, 222, 128, 0.1)';
      trainingDiv.style.border = '1px solid rgba(74, 222, 128, 0.3)';
      trainingDiv.style.borderRadius = '4px';
      trainingDiv.style.fontSize = '0.9rem';
      trainingDiv.style.color = '#4ade80';
      const skillName =
        trainingResult.skill.charAt(0).toUpperCase() +
        trainingResult.skill.slice(1);
      const jobDef = jobSlot ? getJobSlotDefinition(jobSlot.type) : null;
      const jobName = jobDef ? jobDef.name : 'Unknown';
      trainingDiv.textContent = `${jobName}: Training ${skillName}`;
      panel.appendChild(trainingDiv);
    }
  }

  // Level up button
  const eligibleLevel = getLevelForXP(crew.xp);
  if (eligibleLevel > crew.level) {
    panel.appendChild(renderLevelUpButton(crew, eligibleLevel, callbacks));
  }

  // Skills section
  panel.appendChild(renderSkillsSection(gameData, crew, callbacks));

  // Equipment section
  panel.appendChild(renderEquipmentSection(crew, callbacks));

  // Cargo section
  panel.appendChild(renderCargoSection(gameData, crew, callbacks));

  return panel;
}

function renderStatsSection(crew: CrewMember): HTMLElement {
  const section = document.createElement('div');
  section.className = 'crew-detail-section';

  const title = document.createElement('h3');
  title.textContent = 'Stats';
  section.appendChild(title);

  const stats = document.createElement('div');
  stats.className = 'crew-stats';

  // Health
  const healthRow = document.createElement('div');
  healthRow.className = 'stat-row';
  const healthLabel = document.createElement('span');
  healthLabel.textContent = 'Health:';
  const healthValue = document.createElement('span');
  healthValue.textContent = `${crew.health}/100`;
  healthRow.appendChild(healthLabel);
  healthRow.appendChild(healthValue);
  stats.appendChild(healthRow);

  // Attack score
  const attackRow = document.createElement('div');
  attackRow.className = 'stat-row';
  const attackLabel = document.createElement('span');
  attackLabel.textContent = 'Attack:';
  const attackValue = document.createElement('span');
  attackValue.textContent = `${calculateAttackScore(crew)}`;
  attackRow.appendChild(attackLabel);
  attackRow.appendChild(attackValue);
  stats.appendChild(attackRow);

  // Salary
  const roleDef = getCrewRoleDefinition(crew.role);
  if (roleDef) {
    const salaryRow = document.createElement('div');
    salaryRow.className = 'stat-row';
    const salaryLabel = document.createElement('span');
    salaryLabel.textContent = 'Salary:';
    const salaryValue = document.createElement('span');
    salaryValue.textContent =
      roleDef.salary > 0
        ? `${(roleDef.salary * TICKS_PER_DAY).toFixed(0)} cr/day`
        : 'None (Captain)';
    salaryRow.appendChild(salaryLabel);
    salaryRow.appendChild(salaryValue);
    stats.appendChild(salaryRow);
  }

  // Unpaid warning
  if (crew.unpaidTicks > 0 && !crew.isCaptain) {
    const unpaidWarning = document.createElement('div');
    unpaidWarning.className = 'unpaid-warning';
    unpaidWarning.style.color = '#ff4444';
    unpaidWarning.style.marginTop = '0.5rem';
    unpaidWarning.style.fontWeight = 'bold';
    const unpaidDays = Math.ceil(crew.unpaidTicks / TICKS_PER_DAY);
    unpaidWarning.textContent = `⚠️ ${unpaidDays} unpaid day${unpaidDays > 1 ? 's' : ''} - will depart at next port!`;
    stats.appendChild(unpaidWarning);
  }

  section.appendChild(stats);

  // Zero-G Exposure section
  const exposureDays = formatExposureDays(crew.zeroGExposure);
  const exposureLevel = getGravityDegradationLevel(crew.zeroGExposure);
  const nextThreshold = getNextThreshold(crew.zeroGExposure);

  const exposureSection = document.createElement('div');
  exposureSection.className = 'exposure-section';
  exposureSection.style.marginTop = '1rem';
  exposureSection.style.padding = '0.5rem';
  exposureSection.style.border = '1px solid rgba(255,255,255,0.1)';
  exposureSection.style.borderRadius = '4px';

  const exposureTitle = document.createElement('div');
  exposureTitle.style.fontWeight = 'bold';
  exposureTitle.style.marginBottom = '0.5rem';
  exposureTitle.textContent = `Zero-G Exposure: ${exposureDays} days`;
  exposureSection.appendChild(exposureTitle);

  // Progress bar
  const barContainer = document.createElement('div');
  barContainer.style.position = 'relative';
  barContainer.style.width = '100%';
  barContainer.style.height = '20px';
  barContainer.style.backgroundColor = 'rgba(0,0,0,0.3)';
  barContainer.style.borderRadius = '4px';
  barContainer.style.overflow = 'hidden';
  barContainer.style.marginBottom = '0.5rem';

  // Calculate fill percentage (0-365+ days)
  const maxDays = 365;
  const fillPercent = Math.min(100, (exposureDays / maxDays) * 100);

  const barFill = document.createElement('div');
  barFill.style.width = `${fillPercent}%`;
  barFill.style.height = '100%';
  barFill.style.transition = 'width 0.3s ease';

  // Color based on level
  if (exposureLevel === 'none') {
    barFill.style.backgroundColor = '#4ade80'; // green
  } else if (exposureLevel === 'minor') {
    barFill.style.backgroundColor = '#fbbf24'; // yellow
  } else if (exposureLevel === 'moderate') {
    barFill.style.backgroundColor = '#fb923c'; // orange
  } else if (exposureLevel === 'severe') {
    barFill.style.backgroundColor = '#f87171'; // red
  } else {
    barFill.style.backgroundColor = '#dc2626'; // dark red
  }

  barContainer.appendChild(barFill);

  // Threshold markers
  const thresholds = [
    { days: 14, label: '14d' },
    { days: 60, label: '60d' },
    { days: 180, label: '180d' },
    { days: 365, label: '365d' },
  ];

  for (const threshold of thresholds) {
    const marker = document.createElement('div');
    marker.style.position = 'absolute';
    marker.style.left = `${(threshold.days / maxDays) * 100}%`;
    marker.style.top = '0';
    marker.style.bottom = '0';
    marker.style.width = '2px';
    marker.style.backgroundColor = 'rgba(255,255,255,0.3)';
    barContainer.appendChild(marker);

    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.left = `${(threshold.days / maxDays) * 100}%`;
    label.style.bottom = '-18px';
    label.style.transform = 'translateX(-50%)';
    label.style.fontSize = '0.7em';
    label.style.color = 'rgba(255,255,255,0.5)';
    label.textContent = threshold.label;
    barContainer.appendChild(label);
  }

  exposureSection.appendChild(barContainer);

  // Status text
  const statusText = document.createElement('div');
  statusText.style.fontSize = '0.9em';
  statusText.style.marginTop = '1rem';

  if (exposureLevel === 'none') {
    statusText.textContent = 'Status: Normal — No effects';
    statusText.style.color = '#4ade80';
  } else {
    const levelName = getDegradationLevelName(exposureLevel);
    const description = getDegradationDescription(exposureLevel);
    statusText.innerHTML = `Status: <span style="color: ${exposureLevel === 'minor' ? '#fbbf24' : exposureLevel === 'moderate' ? '#fb923c' : '#f87171'}">${levelName}</span> — ${description}`;
  }

  exposureSection.appendChild(statusText);

  // Next threshold warning
  if (nextThreshold) {
    const nextDays = formatExposureDays(nextThreshold.threshold);
    const nextText = document.createElement('div');
    nextText.style.fontSize = '0.85em';
    nextText.style.marginTop = '0.25rem';
    nextText.style.opacity = '0.7';
    const levelName = getDegradationLevelName(nextThreshold.level);
    const description = getDegradationDescription(nextThreshold.level);
    nextText.textContent = `Next: ${levelName} at ${nextDays} days — ${description}`;
    exposureSection.appendChild(nextText);
  }

  section.appendChild(exposureSection);

  return section;
}

function renderLevelUpButton(
  crew: CrewMember,
  eligibleLevel: number,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const button = document.createElement('button');
  button.className = 'level-up-button';
  const levelsGained = eligibleLevel - crew.level;
  button.textContent = `Level Up! (+${levelsGained} skill point${levelsGained > 1 ? 's' : ''})`;
  button.addEventListener('click', () => callbacks.onLevelUp(crew.id));
  return button;
}

function renderSkillRow(crew: CrewMember, skillId: SkillId): HTMLElement {
  const skillRow = document.createElement('div');
  skillRow.className = 'skill-row';
  skillRow.style.marginBottom = '0.5rem';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.justifyContent = 'space-between';
  topRow.style.alignItems = 'center';
  topRow.style.marginBottom = '2px';

  const skillLabel = document.createElement('span');
  skillLabel.className = 'skill-label';
  const skillName = skillId.charAt(0).toUpperCase() + skillId.slice(1);

  const rawValue = crew.skills[skillId];
  const intValue = Math.floor(rawValue);
  const rank = getSkillRank(intValue);
  const isSpecialized = crew.specialization?.skillId === skillId;

  skillLabel.textContent = `${skillName}:`;
  topRow.appendChild(skillLabel);

  const rightSpan = document.createElement('span');
  rightSpan.style.display = 'flex';
  rightSpan.style.alignItems = 'center';
  rightSpan.style.gap = '0.5rem';

  // Rank label
  const rankSpan = document.createElement('span');
  rankSpan.style.fontSize = '0.8rem';
  rankSpan.style.color =
    rank.index >= 8 ? '#fbbf24' : rank.index >= 6 ? '#4ade80' : '#888';
  rankSpan.textContent = rank.name;
  if (isSpecialized) {
    rankSpan.style.fontWeight = 'bold';
    rankSpan.textContent += ' *';
  }
  rightSpan.appendChild(rankSpan);

  // Numeric value
  const skillValue = document.createElement('span');
  skillValue.className = 'skill-value';

  skillValue.textContent = `${intValue}`;

  rightSpan.appendChild(skillValue);
  topRow.appendChild(rightSpan);
  skillRow.appendChild(topRow);

  // Progress bar toward next rank
  const nextRank = getNextRank(intValue);
  if (nextRank) {
    const progress = getRankProgress(rawValue);
    const barContainer = document.createElement('div');
    barContainer.style.width = '100%';
    barContainer.style.height = '4px';
    barContainer.style.backgroundColor = 'rgba(255,255,255,0.1)';
    barContainer.style.borderRadius = '2px';
    barContainer.style.overflow = 'hidden';

    const barFill = document.createElement('div');
    barFill.style.width = `${progress}%`;
    barFill.style.height = '100%';
    barFill.style.backgroundColor = isSpecialized ? '#4ade80' : '#4a90e2';
    barFill.style.borderRadius = '2px';
    barFill.style.transition = 'width 0.3s ease';
    barContainer.appendChild(barFill);

    skillRow.appendChild(barContainer);
  }

  return skillRow;
}

function renderSkillsSection(
  gameData: GameData,
  crew: CrewMember,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'crew-detail-section';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  const title = document.createElement('h3');
  title.textContent = 'Skills & Mastery';
  header.appendChild(title);

  // Specialization indicator
  if (crew.specialization) {
    const specBadge = document.createElement('span');
    specBadge.style.fontSize = '0.8rem';
    specBadge.style.color = '#4ade80';
    specBadge.style.fontWeight = 'bold';
    const specName =
      crew.specialization.skillId.charAt(0).toUpperCase() +
      crew.specialization.skillId.slice(1);
    specBadge.textContent = `Specialized: ${specName}`;
    header.appendChild(specBadge);
  }

  section.appendChild(header);

  const skills = document.createElement('div');
  skills.className = 'crew-skills';

  const coreSkillIds: SkillId[] = ['piloting', 'mining', 'commerce'];

  for (const skillId of coreSkillIds) {
    skills.appendChild(renderSkillRow(crew, skillId));
    // Mastery section expanded by default under each skill
    skills.appendChild(
      renderSkillMastery(skillId, crew.mastery[skillId], crew, gameData)
    );
  }

  // Show "Ranged Combat" attribute if weapon equipped
  const hasWeapon = crew.equipment.some((item) => {
    const def = getCrewEquipmentDefinition(item.definitionId);
    return def.category === 'weapon';
  });

  if (hasWeapon) {
    const combatRow = document.createElement('div');
    combatRow.className = 'skill-row';
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
    skills.appendChild(combatRow);
  }

  section.appendChild(skills);

  // Specialization button (if eligible and not yet specialized)
  if (!crew.specialization) {
    const eligibleSkills = coreSkillIds.filter(
      (s) => Math.floor(crew.skills[s]) >= SPECIALIZATION_THRESHOLD
    );
    if (eligibleSkills.length > 0) {
      const specSection = document.createElement('div');
      specSection.style.marginTop = '0.75rem';
      specSection.style.padding = '0.75rem';
      specSection.style.background = 'rgba(74, 222, 128, 0.1)';
      specSection.style.border = '1px solid rgba(74, 222, 128, 0.3)';
      specSection.style.borderRadius = '4px';

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

      specSection.appendChild(specControls);
      section.appendChild(specSection);
    }
  }

  return section;
}

// ─── Mastery UI Helpers ─────────────────────────────────────────

/** Get the item label mapping for a skill's mastery items. */
function getMasteryItemLabel(
  skillId: SkillId,
  itemId: string,
  world: World
): string {
  if (skillId === 'mining') {
    const ore = getAllOreDefinitions().find((o) => o.id === itemId);
    return ore ? `${ore.icon} ${ore.name}` : itemId;
  }
  // Routes: "earth->mars" or "earth<=>mars" → "Earth → Mars"
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

/** Get the bonus table for a skill. */
function getBonusTable(skillId: SkillId): MasteryBonus[] {
  if (skillId === 'piloting') return ROUTE_MASTERY_BONUSES;
  if (skillId === 'mining') return ORE_MASTERY_BONUSES;
  return TRADE_MASTERY_BONUSES;
}

/** Get the current active bonus label for a mastery level. */
function getCurrentBonusLabel(skillId: SkillId, level: number): string | null {
  const table = getBonusTable(skillId);
  let best: MasteryBonus | null = null;
  for (const bonus of table) {
    if (level >= bonus.level) best = bonus;
  }
  return best ? best.label : null;
}

/** Get the next upcoming bonus for a mastery level. */
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

/** Skill-specific item type label. */
function getMasteryItemTypeName(skillId: SkillId): string {
  if (skillId === 'piloting') return 'Routes';
  if (skillId === 'mining') return 'Ores';
  return 'Trade Routes';
}

/** Render the full mastery panel for one skill, expanded by default. */
function renderSkillMastery(
  skillId: SkillId,
  state: SkillMasteryState,
  crew: CrewMember,
  gameData: GameData
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'mastery-section';
  container.style.marginLeft = '0.5rem';
  container.style.marginBottom = '1rem';
  container.style.padding = '0.5rem 0.75rem';
  container.style.background = 'rgba(255,255,255,0.03)';
  container.style.borderLeft = '2px solid rgba(255,255,255,0.1)';
  container.style.fontSize = '0.85rem';

  // ── Mastery Pool Bar ──────────────────────────────────────────
  container.appendChild(renderMasteryPool(skillId, state));

  // ── Item Mastery List ─────────────────────────────────────────
  container.appendChild(renderMasteryItems(skillId, state, crew, gameData));

  return container;
}

/** Render the mastery pool bar with checkpoint markers. */
function renderMasteryPool(
  skillId: SkillId,
  state: SkillMasteryState
): HTMLElement {
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

  const fillPct = getPoolFillPercent(state.pool);
  const poolValue = document.createElement('span');
  poolValue.style.color = fillPct >= 95 ? '#fbbf24' : '#ccc';
  poolValue.style.fontWeight = fillPct >= 95 ? 'bold' : 'normal';
  poolValue.textContent =
    state.pool.maxXp > 0 ? `${fillPct.toFixed(1)}%` : 'No items discovered';
  poolHeader.appendChild(poolValue);

  poolSection.appendChild(poolHeader);

  if (state.pool.maxXp === 0) return poolSection;

  // Pool progress bar with checkpoint markers
  const barOuter = document.createElement('div');
  barOuter.style.position = 'relative';
  barOuter.style.width = '100%';
  barOuter.style.height = '14px';
  barOuter.style.backgroundColor = 'rgba(0,0,0,0.4)';
  barOuter.style.borderRadius = '3px';
  barOuter.style.overflow = 'visible';

  const barFill = document.createElement('div');
  barFill.style.width = `${Math.min(fillPct, 100)}%`;
  barFill.style.height = '100%';
  barFill.style.borderRadius = '3px';
  barFill.style.transition = 'width 0.3s ease';
  // Color gradient based on fill
  if (fillPct >= 95) {
    barFill.style.backgroundColor = '#fbbf24'; // gold
  } else if (fillPct >= 50) {
    barFill.style.backgroundColor = '#4ade80'; // green
  } else if (fillPct >= 25) {
    barFill.style.backgroundColor = '#60a5fa'; // blue
  } else {
    barFill.style.backgroundColor = '#6b7280'; // gray
  }
  barOuter.appendChild(barFill);

  // Checkpoint markers on the bar
  const checkpoints = getCheckpointBonuses(skillId, state.pool);
  for (const cp of checkpoints) {
    const pct = cp.threshold * 100;

    // Vertical line marker
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
    barOuter.appendChild(marker);

    // Percentage label below bar
    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.left = `${pct}%`;
    label.style.top = '16px';
    label.style.transform = 'translateX(-50%)';
    label.style.fontSize = '0.65rem';
    label.style.color = cp.active ? '#fbbf24' : 'rgba(255,255,255,0.4)';
    label.style.whiteSpace = 'nowrap';
    label.textContent = `${Math.round(pct)}%`;
    barOuter.appendChild(label);
  }

  poolSection.appendChild(barOuter);

  // Checkpoint bonus list
  const bonusList = document.createElement('div');
  bonusList.style.marginTop = '1.2rem';
  bonusList.style.display = 'flex';
  bonusList.style.flexDirection = 'column';
  bonusList.style.gap = '2px';

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

    bonusList.appendChild(row);
  }

  poolSection.appendChild(bonusList);
  return poolSection;
}

/**
 * Generate routes from the ship's current location to all other destinations.
 * Uses the central canShipAccessLocation gate for lock status.
 */
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

/** Render the per-item mastery list for a skill. */
function renderMasteryItems(
  skillId: SkillId,
  state: SkillMasteryState,
  crew: CrewMember,
  gameData: GameData
): HTMLElement {
  const world = gameData.world;
  const container = document.createElement('div');
  container.style.marginTop = '0.5rem';

  const itemHeader = document.createElement('div');
  itemHeader.style.color = '#aaa';
  itemHeader.style.marginBottom = '4px';
  itemHeader.textContent = getMasteryItemTypeName(skillId);
  container.appendChild(itemHeader);

  // Build the full item catalog for this skill
  type MasteryItemEntry = {
    id: string;
    label: string;
    mastery: ItemMastery | null;
    locked: boolean;
    lockReason: string;
  };

  const entries: MasteryItemEntry[] = [];

  if (skillId === 'mining') {
    // Mining: show all 8 ore types — locked ones grayed by level requirement
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
    // Piloting routes / Commerce trade routes: show routes from current location
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
        skillId as 'piloting' | 'commerce'
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
      if (entries.some((e) => e.id === itemId)) continue; // Already listed
      entries.push({
        id: itemId,
        label: getMasteryItemLabel(skillId, itemId, world),
        mastery: itemMastery,
        locked: false,
        lockReason: '',
      });
    }
  }

  // Render each item
  const itemList = document.createElement('div');
  itemList.style.display = 'flex';
  itemList.style.flexDirection = 'column';
  itemList.style.gap = '4px';

  for (const entry of entries) {
    itemList.appendChild(renderMasteryItemRow(skillId, entry));
  }

  container.appendChild(itemList);
  return container;
}

/** Render a single mastery item row with level, progress bar, and bonus hint. */
function renderMasteryItemRow(
  skillId: SkillId,
  entry: {
    id: string;
    label: string;
    mastery: ItemMastery | null;
    locked: boolean;
    lockReason: string;
  }
): HTMLElement {
  const row = document.createElement('div');
  row.style.padding = '3px 6px';
  row.style.borderRadius = '3px';
  row.style.background = entry.locked
    ? 'rgba(0,0,0,0.2)'
    : 'rgba(255,255,255,0.02)';

  // Top line: name + level
  const topLine = document.createElement('div');
  topLine.style.display = 'flex';
  topLine.style.justifyContent = 'space-between';
  topLine.style.alignItems = 'center';

  const nameSpan = document.createElement('span');
  nameSpan.style.color = entry.locked ? '#555' : '#ccc';
  nameSpan.textContent = entry.label;
  topLine.appendChild(nameSpan);

  const rightSpan = document.createElement('span');
  rightSpan.style.display = 'flex';
  rightSpan.style.alignItems = 'center';
  rightSpan.style.gap = '0.4rem';

  if (entry.locked) {
    const lockSpan = document.createElement('span');
    lockSpan.style.color = '#665522';
    lockSpan.style.fontSize = '0.75rem';
    lockSpan.textContent = `🔒 ${entry.lockReason}`;
    rightSpan.appendChild(lockSpan);
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
    rightSpan.appendChild(levelSpan);
  } else {
    const undiscovered = document.createElement('span');
    undiscovered.style.color = '#555';
    undiscovered.style.fontSize = '0.75rem';
    undiscovered.textContent = 'Lv 0';
    rightSpan.appendChild(undiscovered);
  }

  topLine.appendChild(rightSpan);
  row.appendChild(topLine);

  // Progress bar (only for unlocked items)
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

      const barOuter = document.createElement('div');
      barOuter.style.width = '100%';
      barOuter.style.height = '3px';
      barOuter.style.backgroundColor = 'rgba(255,255,255,0.08)';
      barOuter.style.borderRadius = '2px';
      barOuter.style.overflow = 'hidden';
      barOuter.style.marginTop = '2px';

      const barFill = document.createElement('div');
      barFill.style.width = `${Math.min(progress, 100)}%`;
      barFill.style.height = '100%';
      barFill.style.backgroundColor = level >= 50 ? '#4ade80' : '#4a90e2';
      barFill.style.borderRadius = '2px';
      barOuter.appendChild(barFill);

      row.appendChild(barOuter);
    }

    // Bonus hint line
    const currentBonus = getCurrentBonusLabel(skillId, level);
    const nextBonus = getNextBonusLabel(skillId, level);

    if (currentBonus || nextBonus) {
      const hintLine = document.createElement('div');
      hintLine.style.fontSize = '0.7rem';
      hintLine.style.marginTop = '2px';
      hintLine.style.lineHeight = '1.3';

      if (currentBonus) {
        const activeSpan = document.createElement('span');
        activeSpan.style.color = '#4ade80';
        activeSpan.textContent = currentBonus;
        hintLine.appendChild(activeSpan);
      }

      if (nextBonus) {
        if (currentBonus) {
          const sep = document.createTextNode(' · ');
          hintLine.appendChild(sep);
        }
        const nextSpan = document.createElement('span');
        nextSpan.style.color = '#666';
        nextSpan.textContent = `Next Lv ${nextBonus.level}: ${nextBonus.label}`;
        hintLine.appendChild(nextSpan);
      }

      row.appendChild(hintLine);
    }
  }

  return row;
}

function renderEquipmentSection(
  crew: CrewMember,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'crew-detail-section';

  const title = document.createElement('h3');
  title.textContent = 'Equipment';
  section.appendChild(title);

  const slots = document.createElement('div');
  slots.className = 'equipment-slots';

  const categories: Array<{
    id: 'weapon' | 'armor' | 'tool' | 'accessory';
    label: string;
  }> = [
    { id: 'weapon', label: 'Weapon' },
    { id: 'armor', label: 'Armor' },
    { id: 'tool', label: 'Tool' },
    { id: 'accessory', label: 'Accessory' },
  ];

  for (const category of categories) {
    const slot = document.createElement('div');
    slot.className = 'equipment-slot';

    const slotLabel = document.createElement('div');
    slotLabel.className = 'equipment-slot-label';
    slotLabel.textContent = category.label;
    slot.appendChild(slotLabel);

    const equippedItem = crew.equipment.find((item) => {
      const def = getCrewEquipmentDefinition(item.definitionId);
      return def.category === category.id;
    });

    if (equippedItem) {
      const def = getCrewEquipmentDefinition(equippedItem.definitionId);
      const itemDiv = document.createElement('div');
      itemDiv.className = 'equipped-item';
      itemDiv.textContent = `${def.icon} ${def.name}`;
      slot.appendChild(itemDiv);

      const unequipButton = document.createElement('button');
      unequipButton.className = 'unequip-button';
      unequipButton.textContent = 'Unequip';
      unequipButton.addEventListener('click', () =>
        callbacks.onUnequipItem(crew.id, equippedItem.id)
      );
      slot.appendChild(unequipButton);
    } else {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'equipment-empty';
      emptyDiv.textContent = 'Empty';
      slot.appendChild(emptyDiv);
    }

    slots.appendChild(slot);
  }

  section.appendChild(slots);
  return section;
}

function renderCargoSection(
  gameData: GameData,
  crew: CrewMember,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);

  const section = document.createElement('div');
  section.className = 'crew-detail-section';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  const title = document.createElement('h3');
  title.textContent = 'Ship Cargo';
  header.appendChild(title);

  // Calculate cargo space
  let usedSpace = 0;
  for (const item of ship.cargo) {
    const def = getCrewEquipmentDefinition(item.definitionId);
    usedSpace += def.storageUnits;
  }
  const maxSpace = 20; // TODO: get from ship class

  const spaceLabel = document.createElement('span');
  spaceLabel.className = 'cargo-space';
  spaceLabel.textContent = `${usedSpace}/${maxSpace} SU`;
  header.appendChild(spaceLabel);

  section.appendChild(header);

  const cargoList = document.createElement('div');
  cargoList.className = 'cargo-list';

  if (ship.cargo.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cargo-empty';
    empty.textContent = 'Cargo hold is empty';
    cargoList.appendChild(empty);
  } else {
    for (const item of ship.cargo) {
      const def = getCrewEquipmentDefinition(item.definitionId);
      const cargoItem = document.createElement('div');
      cargoItem.className = 'cargo-item';

      const itemInfo = document.createElement('div');
      itemInfo.className = 'cargo-item-info';
      itemInfo.textContent = `${def.icon} ${def.name}`;
      cargoItem.appendChild(itemInfo);

      // Check if this category slot is already occupied
      const categoryOccupied = crew.equipment.some((equipped) => {
        const equippedDef = getCrewEquipmentDefinition(equipped.definitionId);
        return equippedDef.category === def.category;
      });

      const equipButton = document.createElement('button');
      equipButton.className = 'equip-button';
      equipButton.textContent = 'Equip';
      equipButton.disabled = categoryOccupied;
      if (categoryOccupied) {
        equipButton.title = `${def.category} slot already occupied`;
      }
      equipButton.addEventListener('click', () =>
        callbacks.onEquipItem(crew.id, item.id)
      );
      cargoItem.appendChild(equipButton);

      cargoList.appendChild(cargoItem);
    }
  }

  section.appendChild(cargoList);
  return section;
}

function renderHiringSection(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const dockedAt = ship.location.dockedAt;
  const hireableCrew = dockedAt
    ? gameData.hireableCrewByLocation[dockedAt] || []
    : [];

  const section = document.createElement('div');
  section.className = 'hiring-section';
  section.style.marginTop = '2rem';
  section.style.padding = '1rem';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = '🤝 Hire Crew';
  section.appendChild(title);

  if (hireableCrew.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No crew available for hire at this station.';
    section.appendChild(empty);
    return section;
  }

  const candidatesList = document.createElement('div');
  candidatesList.style.display = 'flex';
  candidatesList.style.flexDirection = 'column';
  candidatesList.style.gap = '1rem';

  for (const candidate of hireableCrew) {
    const candidateDiv = document.createElement('div');
    candidateDiv.style.display = 'flex';
    candidateDiv.style.justifyContent = 'space-between';
    candidateDiv.style.alignItems = 'center';
    candidateDiv.style.padding = '0.75rem';
    candidateDiv.style.border = '1px solid #333';
    candidateDiv.style.borderRadius = '4px';

    const infoDiv = document.createElement('div');

    const nameRole = document.createElement('div');
    nameRole.style.fontWeight = 'bold';
    const roleDef = getCrewRoleDefinition(candidate.role);
    nameRole.textContent = `${candidate.name} - ${roleDef?.name || candidate.role}`;
    infoDiv.appendChild(nameRole);

    const levelSalary = document.createElement('div');
    levelSalary.style.fontSize = '0.9rem';
    levelSalary.style.color = '#aaa';
    levelSalary.textContent = `Level ${candidate.level} • Salary: ${((roleDef?.salary || 0) * TICKS_PER_DAY).toFixed(0)} cr/day`;
    infoDiv.appendChild(levelSalary);

    const skills = document.createElement('div');
    skills.style.fontSize = '0.85rem';
    skills.style.color = '#888';
    skills.textContent = `Skills: Pilot ${Math.floor(candidate.skills.piloting)} | Mining ${Math.floor(candidate.skills.mining)} | Commerce ${Math.floor(candidate.skills.commerce)}`;
    infoDiv.appendChild(skills);

    candidateDiv.appendChild(infoDiv);

    const hireDiv = document.createElement('div');
    hireDiv.style.display = 'flex';
    hireDiv.style.flexDirection = 'column';
    hireDiv.style.alignItems = 'flex-end';
    hireDiv.style.gap = '0.5rem';

    const costLabel = document.createElement('div');
    costLabel.style.fontSize = '0.9rem';
    costLabel.style.color = '#4a9eff';
    costLabel.textContent = `${candidate.hireCost} cr`;
    hireDiv.appendChild(costLabel);

    const hireButton = document.createElement('button');
    hireButton.textContent = 'Hire';
    hireButton.disabled = gameData.credits < candidate.hireCost;
    hireButton.addEventListener('click', () =>
      callbacks.onHireCrew(candidate.id)
    );
    hireDiv.appendChild(hireButton);

    candidateDiv.appendChild(hireDiv);
    candidatesList.appendChild(candidateDiv);
  }

  section.appendChild(candidatesList);
  return section;
}

function renderEquipmentShop(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'equipment-shop';
  section.style.marginTop = '2rem';
  section.style.padding = '1rem';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = '🛒 Station Store';
  section.appendChild(title);

  const tabs = document.createElement('div');
  tabs.style.display = 'flex';
  tabs.style.gap = '1rem';
  tabs.style.marginBottom = '1rem';

  const itemsDiv = document.createElement('div');

  const sellTab = document.createElement('button');
  sellTab.textContent = 'Sell Equipment';
  sellTab.className = 'shop-tab';

  const buyTab = document.createElement('button');
  buyTab.textContent = 'Buy Equipment';
  buyTab.className = 'shop-tab active';
  buyTab.addEventListener('click', () => {
    buyTab.classList.add('active');
    sellTab.classList.remove('active');
    itemsDiv.innerHTML = '';
    itemsDiv.appendChild(renderBuyList(gameData, callbacks));
  });
  sellTab.addEventListener('click', () => {
    sellTab.classList.add('active');
    buyTab.classList.remove('active');
    itemsDiv.innerHTML = '';
    itemsDiv.appendChild(renderSellList(gameData, callbacks));
  });
  tabs.appendChild(sellTab);

  section.appendChild(tabs);

  itemsDiv.appendChild(renderBuyList(gameData, callbacks));
  section.appendChild(itemsDiv);

  return section;
}

function renderBuyList(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '0.75rem';

  const allEquipment = getAllCrewEquipmentDefinitions();

  for (const equipDef of allEquipment) {
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.justifyContent = 'space-between';
    itemDiv.style.alignItems = 'center';
    itemDiv.style.padding = '0.5rem';
    itemDiv.style.border = '1px solid #333';
    itemDiv.style.borderRadius = '4px';

    const infoDiv = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.textContent = `${equipDef.icon} ${equipDef.name}`;
    infoDiv.appendChild(nameDiv);

    const descDiv = document.createElement('div');
    descDiv.style.fontSize = '0.85rem';
    descDiv.style.color = '#888';
    descDiv.textContent = equipDef.description;
    infoDiv.appendChild(descDiv);

    itemDiv.appendChild(infoDiv);

    const buyDiv = document.createElement('div');
    buyDiv.style.display = 'flex';
    buyDiv.style.flexDirection = 'column';
    buyDiv.style.alignItems = 'flex-end';
    buyDiv.style.gap = '0.5rem';

    const priceLabel = document.createElement('div');
    priceLabel.style.color = '#4a9eff';
    priceLabel.textContent = `${equipDef.value} cr`;
    buyDiv.appendChild(priceLabel);

    const buyButton = document.createElement('button');
    buyButton.textContent = 'Buy';
    buyButton.disabled = gameData.credits < equipDef.value;
    buyButton.addEventListener('click', () =>
      callbacks.onBuyEquipment(equipDef.id)
    );
    buyDiv.appendChild(buyButton);

    itemDiv.appendChild(buyDiv);
    list.appendChild(itemDiv);
  }

  return list;
}

function renderSellList(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '0.75rem';

  // Collect all sellable items (cargo + crew equipment)
  const sellableItems: Array<{
    id: string;
    definitionId: CrewEquipmentId;
    source: string;
  }> = [];

  // Add cargo items
  for (const item of ship.cargo) {
    sellableItems.push({
      id: item.id,
      definitionId: item.definitionId,
      source: 'cargo',
    });
  }

  // Add crew equipment
  for (const crew of ship.crew) {
    for (const item of crew.equipment) {
      sellableItems.push({
        id: item.id,
        definitionId: item.definitionId,
        source: `equipped by ${crew.name}`,
      });
    }
  }

  if (sellableItems.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No items available to sell.';
    list.appendChild(empty);
    return list;
  }

  for (const item of sellableItems) {
    const equipDef = getCrewEquipmentDefinition(item.definitionId);
    const sellPrice = Math.floor(equipDef.value * 0.5);

    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.justifyContent = 'space-between';
    itemDiv.style.alignItems = 'center';
    itemDiv.style.padding = '0.5rem';
    itemDiv.style.border = '1px solid #333';
    itemDiv.style.borderRadius = '4px';

    const infoDiv = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.textContent = `${equipDef.icon} ${equipDef.name}`;
    infoDiv.appendChild(nameDiv);

    const sourceDiv = document.createElement('div');
    sourceDiv.style.fontSize = '0.85rem';
    sourceDiv.style.color = '#888';
    sourceDiv.textContent = `Source: ${item.source}`;
    infoDiv.appendChild(sourceDiv);

    itemDiv.appendChild(infoDiv);

    const sellDiv = document.createElement('div');
    sellDiv.style.display = 'flex';
    sellDiv.style.flexDirection = 'column';
    sellDiv.style.alignItems = 'flex-end';
    sellDiv.style.gap = '0.5rem';

    const priceLabel = document.createElement('div');
    priceLabel.style.color = '#6c6';
    priceLabel.textContent = `${sellPrice} cr (50%)`;
    sellDiv.appendChild(priceLabel);

    const sellButton = document.createElement('button');
    sellButton.textContent = 'Sell';
    sellButton.addEventListener('click', () =>
      callbacks.onSellEquipment(item.id)
    );
    sellDiv.appendChild(sellButton);

    itemDiv.appendChild(sellDiv);
    list.appendChild(itemDiv);
  }

  return list;
}

function renderTransferCrewSection(
  gameData: GameData,
  crew: CrewMember,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'transfer-crew-section';
  section.style.padding = '0.75rem';
  section.style.background = 'rgba(74, 158, 255, 0.1)';
  section.style.border = '1px solid #4a9eff';
  section.style.borderRadius = '4px';
  section.style.marginBottom = '1rem';

  const title = document.createElement('div');
  title.textContent = 'Transfer Crew';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '0.5rem';
  title.style.color = '#4a9eff';
  section.appendChild(title);

  const ship = getActiveShip(gameData);
  const dockedLocationId = ship.location.dockedAt;

  // Find other ships docked at the same location
  const otherDockedShips = gameData.ships.filter(
    (s) =>
      s.id !== ship.id &&
      s.location.status === 'docked' &&
      s.location.dockedAt === dockedLocationId
  );

  if (otherDockedShips.length === 0) {
    const noShips = document.createElement('div');
    noShips.style.color = '#aaa';
    noShips.style.fontSize = '0.85rem';
    noShips.textContent = 'No other ships docked at this station.';
    section.appendChild(noShips);
    return section;
  }

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '0.5rem';
  controls.style.alignItems = 'center';

  const label = document.createElement('span');
  label.textContent = 'Transfer to:';
  label.style.fontSize = '0.9rem';
  controls.appendChild(label);

  const select = document.createElement('select');
  select.style.flex = '1';
  select.style.padding = '0.5rem';
  select.style.background = 'rgba(0, 0, 0, 0.5)';
  select.style.border = '1px solid #666';
  select.style.borderRadius = '4px';
  select.style.color = '#fff';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = '-- Select ship --';
  select.appendChild(placeholderOption);

  for (const otherShip of otherDockedShips) {
    const option = document.createElement('option');
    option.value = otherShip.id;
    option.textContent = otherShip.name;
    select.appendChild(option);
  }

  controls.appendChild(select);

  const transferBtn = document.createElement('button');
  transferBtn.textContent = 'Transfer';
  transferBtn.style.padding = '0.5rem 1rem';
  transferBtn.disabled = true;

  select.addEventListener('change', () => {
    transferBtn.disabled = select.value === '';
  });

  transferBtn.addEventListener('click', () => {
    const targetShipId = select.value;
    if (targetShipId && callbacks.onTransferCrew) {
      callbacks.onTransferCrew(crew.id, ship.id, targetShipId);
    }
  });

  controls.appendChild(transferBtn);
  section.appendChild(controls);

  return section;
}
