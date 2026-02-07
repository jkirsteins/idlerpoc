import type { GameData, CrewMember, CrewEquipmentId } from '../models';
import { getActiveShip } from '../models';
import type { TabbedViewCallbacks } from './tabbedView';
import {
  getCrewEquipmentDefinition,
  getAllCrewEquipmentDefinitions,
} from '../crewEquipment';
import {
  getLevelForXP,
  getLevelProgress,
  getXPForNextLevel,
} from '../levelSystem';
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
import { calculateTickXP } from '../skillProgression';

export function renderCrewTab(
  gameData: GameData,
  selectedCrewId: string | undefined,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'crew-tab';

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

  return container;
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

    // Show skill points badge if crew has unspent points
    if (crew.unspentSkillPoints > 0) {
      const skillBadge = document.createElement('div');
      skillBadge.className = 'skill-badge';
      skillBadge.textContent = `+${crew.unspentSkillPoints} skill pt${crew.unspentSkillPoints > 1 ? 's' : ''}`;
      skillBadge.style.color = '#4ade80';
      skillBadge.style.fontSize = '0.75rem';
      skillBadge.style.fontWeight = 'bold';
      item.appendChild(skillBadge);
    }

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
  // Base attack from strength skill
  const level = getGravityDegradationLevel(crew.zeroGExposure);
  const multiplier = getStrengthMultiplier(level);
  let attack = Math.floor(crew.skills.strength * multiplier);

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

  // Room training indicator (show what skill is being trained)
  if (ship.location.status === 'in_flight') {
    const assignedRoom = ship.rooms.find((r) =>
      r.assignedCrewIds.includes(crew.id)
    );
    const xpResult = calculateTickXP(crew, assignedRoom ?? null);
    if (xpResult) {
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
        xpResult.skill.charAt(0).toUpperCase() + xpResult.skill.slice(1);
      trainingDiv.textContent = `Training: ${skillName} (+${xpResult.xp} XP/tick)`;
      panel.appendChild(trainingDiv);
    }
  }

  // Level up button
  const eligibleLevel = getLevelForXP(crew.xp);
  if (eligibleLevel > crew.level) {
    panel.appendChild(renderLevelUpButton(crew, eligibleLevel, callbacks));
  }

  // Skills section
  panel.appendChild(renderSkillsSection(crew, callbacks));

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

  // Morale
  const moraleRow = document.createElement('div');
  moraleRow.className = 'stat-row';
  const moraleLabel = document.createElement('span');
  moraleLabel.textContent = 'Morale:';
  const moraleValue = document.createElement('span');
  moraleValue.textContent = `${crew.morale}/100`;
  moraleRow.appendChild(moraleLabel);
  moraleRow.appendChild(moraleValue);
  stats.appendChild(moraleRow);

  // Level
  const levelRow = document.createElement('div');
  levelRow.className = 'stat-row';
  const levelLabel = document.createElement('span');
  levelLabel.textContent = 'Level:';
  const levelValue = document.createElement('span');
  levelValue.textContent = `${crew.level}`;
  levelRow.appendChild(levelLabel);
  levelRow.appendChild(levelValue);
  stats.appendChild(levelRow);

  // XP Progress
  const xpRow = document.createElement('div');
  xpRow.className = 'stat-row';
  const xpLabel = document.createElement('span');
  xpLabel.textContent = 'XP:';
  const xpValue = document.createElement('span');
  const nextLevelXP = getXPForNextLevel(crew.level);
  if (nextLevelXP !== null) {
    xpValue.textContent = `${crew.xp}/${nextLevelXP}`;
  } else {
    xpValue.textContent = `${crew.xp} (MAX)`;
  }
  xpRow.appendChild(xpLabel);
  xpRow.appendChild(xpValue);
  stats.appendChild(xpRow);

  // XP Progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'xp-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'xp-progress-fill';
  progressFill.style.width = `${getLevelProgress(crew.xp, crew.level)}%`;
  progressBar.appendChild(progressFill);
  stats.appendChild(progressBar);

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

function renderSkillsSection(
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
  title.textContent = 'Skills';
  header.appendChild(title);

  if (crew.unspentSkillPoints > 0) {
    const pointsLabel = document.createElement('span');
    pointsLabel.className = 'unspent-points';
    pointsLabel.textContent = `${crew.unspentSkillPoints} point${crew.unspentSkillPoints > 1 ? 's' : ''} available`;
    header.appendChild(pointsLabel);
  }

  section.appendChild(header);

  const skills = document.createElement('div');
  skills.className = 'crew-skills';

  // Render each skill
  const skillIds: Array<keyof typeof crew.skills> = [
    'piloting',
    'astrogation',
    'engineering',
    'strength',
    'charisma',
    'loyalty',
  ];

  for (const skillId of skillIds) {
    const skillRow = document.createElement('div');
    skillRow.className = 'skill-row';

    const skillLabel = document.createElement('span');
    skillLabel.className = 'skill-label';
    skillLabel.textContent =
      skillId.charAt(0).toUpperCase() + skillId.slice(1) + ':';
    skillRow.appendChild(skillLabel);

    const skillValue = document.createElement('span');
    skillValue.className = 'skill-value';

    // Show effective strength if degraded
    if (skillId === 'strength') {
      const level = getGravityDegradationLevel(crew.zeroGExposure);
      const multiplier = getStrengthMultiplier(level);
      const effectiveStrength = Math.floor(crew.skills.strength * multiplier);

      if (level !== 'none') {
        skillValue.innerHTML = `${crew.skills.strength} <span style="opacity: 0.6">(eff: ${effectiveStrength})</span>`;
      } else {
        skillValue.textContent = `${crew.skills[skillId]}`;
      }
    } else {
      skillValue.textContent = `${crew.skills[skillId]}`;
    }

    skillRow.appendChild(skillValue);

    // +1 button
    if (crew.unspentSkillPoints > 0 && crew.skills[skillId] < 10) {
      const plusButton = document.createElement('button');
      plusButton.className = 'skill-plus-button';
      plusButton.textContent = '+1';
      plusButton.addEventListener('click', () =>
        callbacks.onAssignSkillPoint(crew.id, skillId)
      );
      skillRow.appendChild(plusButton);
    }

    skills.appendChild(skillRow);
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
  return section;
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
    skills.textContent = `Skills: Pilot ${candidate.skills.piloting} | Nav ${candidate.skills.astrogation} | Eng ${candidate.skills.engineering} | Str ${candidate.skills.strength}`;
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

  const buyTab = document.createElement('button');
  buyTab.textContent = 'Buy Equipment';
  buyTab.className = 'shop-tab active';
  buyTab.addEventListener('click', () => {
    buyTab.classList.add('active');
    sellTab.classList.remove('active');
    itemsDiv.innerHTML = '';
    itemsDiv.appendChild(renderBuyList(gameData, callbacks));
  });
  tabs.appendChild(buyTab);

  const sellTab = document.createElement('button');
  sellTab.textContent = 'Sell Equipment';
  sellTab.className = 'shop-tab';
  sellTab.addEventListener('click', () => {
    sellTab.classList.add('active');
    buyTab.classList.remove('active');
    itemsDiv.innerHTML = '';
    itemsDiv.appendChild(renderSellList(gameData, callbacks));
  });
  tabs.appendChild(sellTab);

  section.appendChild(tabs);

  const itemsDiv = document.createElement('div');
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
