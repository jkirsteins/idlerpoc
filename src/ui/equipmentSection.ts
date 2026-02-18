/**
 * Equipment section component — mount-once / update-on-tick.
 *
 * Renders ship equipment with power mode toggles, degradation bars,
 * and power status indicators. Reconciles equipment list in-place
 * when items are added/removed or when the active ship changes.
 */

import type { GameData, EquipmentPowerMode, EquipmentId } from '../models';
import { getActiveShip } from '../models';
import { getShipClass } from '../shipClasses';
import { getEquipmentDefinition, getCategoryLabel } from '../equipment';
import { canSetPowerModeOn } from '../powerManagement';
import { getPowerRuleDescription } from '../powerPriorities';
import { renderStatBar } from './components/statBar';
import { attachDynamicTooltip, type TooltipHandle } from './components/tooltip';

// ── Types ───────────────────────────────────────────────────────

interface EquipmentItemRefs {
  container: HTMLElement;
  powerDot: HTMLElement;
  modeButtons: Record<EquipmentPowerMode, HTMLButtonElement>;
  modeTooltipHandle: TooltipHandle;
  degradationFill: HTMLElement | null;
  degradationLabel: HTMLElement | null;
  lastPowered: boolean;
  lastPowerMode: EquipmentPowerMode;
  lastDegradation: number;
}

export interface EquipmentSectionRefs {
  el: HTMLElement;
  title: HTMLElement;
  listEl: HTMLElement;
  itemMap: Map<string, EquipmentItemRefs>;
  lastShipId: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function getModeTooltipContent(
  powerMode: EquipmentPowerMode,
  definitionId: EquipmentId
): string {
  if (powerMode === 'auto') {
    return `Auto: ${getPowerRuleDescription(definitionId)}`;
  }
  return powerMode === 'on' ? 'Forced on (manual)' : 'Forced off (manual)';
}

const MODE_ACTIVE_BG: Record<EquipmentPowerMode, string> = {
  off: '#666',
  auto: '#0f3460',
  on: '#2e7d32',
};

function applyModeButtonStyle(
  btn: HTMLButtonElement,
  mode: EquipmentPowerMode,
  currentMode: EquipmentPowerMode
): void {
  if (currentMode === mode) {
    btn.style.background = MODE_ACTIVE_BG[mode];
    btn.style.color = '#eee';
    btn.style.fontWeight = 'bold';
  } else {
    btn.style.background = 'rgba(0,0,0,0.3)';
    btn.style.color = '#888';
    btn.style.fontWeight = '';
  }
}

function getDegradationColorClass(degradation: number): string {
  return degradation >= 75
    ? 'bar-danger'
    : degradation >= 50
      ? 'bar-warning'
      : 'bar-good';
}

// ── Per-item create / update ────────────────────────────────────

function createEquipmentItem(
  equipment: {
    id: string;
    definitionId: EquipmentId;
    powered: boolean;
    powerMode: EquipmentPowerMode;
    degradation: number;
  },
  gameData: GameData
): EquipmentItemRefs | null {
  const equipDef = getEquipmentDefinition(equipment.definitionId);
  if (!equipDef) return null;
  const ship = getActiveShip(gameData);

  const item = document.createElement('div');
  item.className = 'equipment-item';
  item.style.opacity = equipment.powered ? '' : '0.6';

  const icon = document.createElement('div');
  icon.className = 'equipment-icon';
  icon.textContent = equipDef.icon;
  item.appendChild(icon);

  const info = document.createElement('div');
  info.className = 'equipment-info';

  // Name row: power dot + name + category tag
  const nameRow = document.createElement('div');
  nameRow.className = 'equipment-name';
  nameRow.style.display = 'flex';
  nameRow.style.alignItems = 'center';
  nameRow.style.gap = '0.4em';

  const powerDot = document.createElement('span');
  powerDot.style.cssText =
    'display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0';
  powerDot.style.backgroundColor = equipment.powered ? '#4caf50' : '#666';
  nameRow.appendChild(powerDot);

  const nameText = document.createElement('span');
  nameText.textContent = equipDef.name;
  nameRow.appendChild(nameText);

  const categoryTag = document.createElement('span');
  categoryTag.textContent = getCategoryLabel(equipDef.category);
  categoryTag.style.fontSize = '0.65em';
  categoryTag.style.padding = '0.1em 0.4em';
  categoryTag.style.borderRadius = '3px';
  categoryTag.style.fontWeight = 'bold';
  if (equipDef.category === 'defense') {
    categoryTag.style.background = 'rgba(248, 113, 113, 0.2)';
    categoryTag.style.color = '#f87171';
  } else {
    categoryTag.style.background = 'rgba(255, 255, 255, 0.1)';
    categoryTag.style.color = '#888';
  }
  nameRow.appendChild(categoryTag);
  info.appendChild(nameRow);

  // Power draw + mode toggle row
  const powerRow = document.createElement('div');
  powerRow.style.cssText =
    'display:flex;align-items:center;gap:0.5em;margin-top:0.15em';

  const power = document.createElement('span');
  power.className = 'equipment-power';
  power.textContent = `${equipDef.powerDraw} kW`;
  powerRow.appendChild(power);

  // 3-state power mode toggle: Off / Auto / On
  const modeToggle = document.createElement('div');
  modeToggle.style.cssText =
    'display:inline-flex;border-radius:3px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);font-size:0.7em;margin-left:auto';

  const modes: { label: string; value: EquipmentPowerMode }[] = [
    { label: 'Off', value: 'off' },
    { label: 'Auto', value: 'auto' },
    { label: 'On', value: 'on' },
  ];

  const modeButtons = {} as Record<EquipmentPowerMode, HTMLButtonElement>;
  for (const mode of modes) {
    const btn = document.createElement('button');
    btn.textContent = mode.label;
    btn.style.cssText =
      'border:none;padding:2px 6px;cursor:pointer;font-size:inherit;min-width:32px';
    applyModeButtonStyle(btn, mode.value, equipment.powerMode);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mode.value === 'on') {
        const check = canSetPowerModeOn(ship, gameData, equipment.id);
        if (!check.allowed) {
          btn.style.background = '#8b0000';
          btn.title = check.reason ?? 'Insufficient power';
          setTimeout(() => {
            applyModeButtonStyle(btn, mode.value, equipment.powerMode);
          }, 600);
          return;
        }
      }
      equipment.powerMode = mode.value;
    });

    modeButtons[mode.value] = btn;
    modeToggle.appendChild(btn);
  }

  const modeTooltipHandle = attachDynamicTooltip(
    modeToggle,
    getModeTooltipContent(equipment.powerMode, equipment.definitionId),
    { followMouse: false }
  );

  powerRow.appendChild(modeToggle);
  info.appendChild(powerRow);
  item.appendChild(info);

  // Degradation bar (only for degradable equipment)
  let degradationFill: HTMLElement | null = null;
  let degradationLabel: HTMLElement | null = null;
  if (equipDef.hasDegradation) {
    const degradationBarEl = renderStatBar({
      label: 'Wear',
      percentage: equipment.degradation,
      valueLabel: `${equipment.degradation.toFixed(1)}%`,
      colorClass: getDegradationColorClass(equipment.degradation),
      mode: 'full',
    });
    degradationBarEl.style.fontSize = '0.85em';
    degradationBarEl.style.marginTop = '0.25em';
    degradationFill = degradationBarEl.querySelector('.bar-fill');
    degradationLabel = degradationBarEl.querySelector('.bar-label');
    info.appendChild(degradationBarEl);
  }

  return {
    container: item,
    powerDot,
    modeButtons,
    modeTooltipHandle,
    degradationFill,
    degradationLabel,
    lastPowered: equipment.powered,
    lastPowerMode: equipment.powerMode,
    lastDegradation: equipment.degradation,
  };
}

function updateEquipmentItem(
  refs: EquipmentItemRefs,
  equipment: {
    powered: boolean;
    powerMode: EquipmentPowerMode;
    degradation: number;
    definitionId: EquipmentId;
  }
): void {
  if (refs.lastPowered !== equipment.powered) {
    refs.powerDot.style.backgroundColor = equipment.powered
      ? '#4caf50'
      : '#666';
    refs.container.style.opacity = equipment.powered ? '' : '0.6';
    refs.lastPowered = equipment.powered;
  }

  if (refs.lastPowerMode !== equipment.powerMode) {
    for (const mode of ['off', 'auto', 'on'] as EquipmentPowerMode[]) {
      applyModeButtonStyle(refs.modeButtons[mode], mode, equipment.powerMode);
    }
    refs.modeTooltipHandle.updateContent(
      getModeTooltipContent(equipment.powerMode, equipment.definitionId)
    );
    refs.lastPowerMode = equipment.powerMode;
  }

  if (
    refs.degradationFill &&
    refs.degradationLabel &&
    Math.abs(refs.lastDegradation - equipment.degradation) > 0.05
  ) {
    refs.degradationFill.style.width = `${equipment.degradation}%`;
    const newClass = getDegradationColorClass(equipment.degradation);
    const oldClass = getDegradationColorClass(refs.lastDegradation);
    if (newClass !== oldClass) {
      refs.degradationFill.classList.remove(oldClass);
      refs.degradationFill.classList.add(newClass);
    }
    refs.degradationLabel.textContent = `Wear ${equipment.degradation.toFixed(1)}%`;
    refs.lastDegradation = equipment.degradation;
  }
}

// ── Section-level create / update ───────────────────────────────

export function createEquipmentSection(
  gameData: GameData
): EquipmentSectionRefs {
  const ship = getActiveShip(gameData);
  const shipClass = getShipClass(ship.classId);

  const el = document.createElement('div');
  el.className = 'equipment-section';

  const title = document.createElement('h3');
  const maxSlots = shipClass?.equipmentSlotDefs.length ?? 0;
  title.textContent = `Equipment (${ship.equipment.length}/${maxSlots} slots)`;
  el.appendChild(title);

  const listEl = document.createElement('div');
  listEl.className = 'equipment-list';
  el.appendChild(listEl);

  const itemMap = new Map<string, EquipmentItemRefs>();
  for (const eq of ship.equipment) {
    const refs = createEquipmentItem(eq, gameData);
    if (refs) {
      itemMap.set(eq.id, refs);
      listEl.appendChild(refs.container);
    }
  }

  return { el, title, listEl, itemMap, lastShipId: ship.id };
}

export function updateEquipmentSection(
  refs: EquipmentSectionRefs,
  gameData: GameData
): void {
  const ship = getActiveShip(gameData);
  const shipClass = getShipClass(ship.classId);
  const maxSlots = shipClass?.equipmentSlotDefs.length ?? 0;

  if (refs.lastShipId !== ship.id) {
    refs.itemMap.clear();
    refs.listEl.textContent = '';
    for (const eq of ship.equipment) {
      const itemRefs = createEquipmentItem(eq, gameData);
      if (itemRefs) {
        refs.itemMap.set(eq.id, itemRefs);
        refs.listEl.appendChild(itemRefs.container);
      }
    }
    refs.lastShipId = ship.id;
  } else {
    const currentIds = new Set(ship.equipment.map((eq) => eq.id));

    for (const [id, itemRefs] of refs.itemMap) {
      if (!currentIds.has(id)) {
        itemRefs.container.remove();
        refs.itemMap.delete(id);
      }
    }

    for (const eq of ship.equipment) {
      const existing = refs.itemMap.get(eq.id);
      if (existing) {
        updateEquipmentItem(existing, eq);
      } else {
        const itemRefs = createEquipmentItem(eq, gameData);
        if (itemRefs) {
          refs.itemMap.set(eq.id, itemRefs);
          refs.listEl.appendChild(itemRefs.container);
        }
      }
    }
  }

  refs.title.textContent = `Equipment (${ship.equipment.length}/${maxSlots} slots)`;
}
