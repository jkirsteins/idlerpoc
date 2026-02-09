import type { GameData, Room, JobSlot } from '../models';
import { getActiveShip } from '../models';
import { getShipClass } from '../shipClasses';
import { getRoomDefinition } from '../rooms';
import { getCrewRoleName } from '../crewRoles';
import { computePowerStatus } from '../powerSystem';
import { computeOxygenStatus } from '../lifeSupportSystem';
import { getEquipmentDefinition } from '../equipment';
import { getEngineDefinition } from '../engines';
import { createNavigationView } from './navigationView';
import { getGravitySource } from '../gravitySystem';
import {
  calculateAvailableCargoCapacity,
  computeMaxRange,
} from '../flightPhysics';
import { formatDualTime, GAME_SECONDS_PER_TICK } from '../timeSystem';
import { renderStatBar } from './components/statBar';
import { attachTooltip, formatPowerTooltip } from './components/tooltip';
import type { Component } from './component';
import {
  formatFuelMass,
  calculateFuelPercentage,
  getFuelColorClass,
} from './fuelFormatting';
import { renderFlightStrip } from './flightStatus';
import {
  getRoomJobSlots,
  getRoomCrewCount,
  getUnassignedCrew,
  getJobSlotDefinition,
  isRoomStaffed,
  isHelmManned,
} from '../jobSlots';

export interface ShipTabCallbacks {
  onJobAssign: (crewId: string, jobSlotId: string) => void;
  onJobUnassign: (crewId: string) => void;
  onAutoAssignCrew: () => void;
  onUndock: () => void;
  onDock: () => void;
  onEngineOn: () => void;
  onEngineOff: () => void;
  onToggleNavigation: () => void;
  onBuyFuel: () => void;
  onStartTrip: (destinationId: string) => void;
  onBuyShip?: (classId: string, shipName: string) => void;
}

/** Snapshot the props the ship tab renders so we can shallow-compare. */
function snapshotShipProps(gameData: GameData, showNav: boolean) {
  const ship = getActiveShip(gameData);
  return {
    showNav,
    shipId: ship.id,
    fuelKg: ship.fuelKg,
    maxFuelKg: ship.maxFuelKg,
    engineState: ship.engine.state,
    warmupProgress: ship.engine.warmupProgress,
    engineDef: ship.engine.definitionId,
    locationStatus: ship.location.status,
    dockedAt: ship.location.dockedAt,
    orbitingAt: ship.location.orbitingAt,
    flightDist: ship.activeFlightPlan?.distanceCovered,
    flightTotal: ship.activeFlightPlan?.totalDistance,
    flightDest: ship.activeFlightPlan?.destination,
    crewCount: ship.crew.length,
    cargoCount: ship.cargo.length,
    equipCount: ship.equipment.length,
    // Crew roster identity + stats that affect the rendered UI
    crew: ship.crew.map((c) => c.id + c.name + c.level + c.isCaptain).join(),
    crewSkills: ship.crew
      .map(
        (c) =>
          `${c.skills.piloting}${c.skills.astrogation}${c.skills.engineering}${c.skills.strength}`
      )
      .join(),
    // Job slot assignments drive the assign/remove buttons
    slots: ship.jobSlots.map((s) => s.id + ':' + s.assignedCrewId).join(),
    // Equipment degradation drives the wear bars
    equipDeg: ship.equipment
      .map((eq) => eq.definitionId + eq.degradation.toFixed(1))
      .join(),
    // Room states
    rooms: ship.rooms.map((r) => r.id + r.state).join(),
  };
}

type ShipSnapshot = ReturnType<typeof snapshotShipProps>;

function shipPropsChanged(a: ShipSnapshot | null, b: ShipSnapshot): boolean {
  if (!a) return true;
  for (const key of Object.keys(b) as Array<keyof ShipSnapshot>) {
    if (a[key] !== b[key]) return true;
  }
  return false;
}

export function createShipTab(
  gameData: GameData,
  showNavigation: boolean,
  callbacks: ShipTabCallbacks
): Component & { setShowNavigation(v: boolean): void } {
  const container = document.createElement('div');
  container.className = 'ship-tab';
  let currentShowNav = showNavigation;
  let lastSnapshot: ShipSnapshot | null = null;

  function rebuild(gameData: GameData) {
    const snap = snapshotShipProps(gameData, currentShowNav);
    if (!shipPropsChanged(lastSnapshot, snap)) return;
    lastSnapshot = snap;

    container.replaceChildren();

    if (currentShowNav) {
      container.appendChild(
        createNavigationView(gameData, {
          onToggleNavigation: callbacks.onToggleNavigation,
          onStartTrip: callbacks.onStartTrip,
        }).el
      );
      return;
    }

    // Fuel progress bar
    container.appendChild(renderFuelBar(gameData));

    // Power progress bar
    container.appendChild(renderPowerBar(gameData));

    // Oxygen progress bar
    container.appendChild(renderOxygenBar(gameData));

    // Torch ship status bars (Class III+)
    const ship = getActiveShip(gameData);
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    if (engineDef.radiationOutput > 0) {
      container.appendChild(renderRadiationBar(gameData));
    }
    if (engineDef.wasteHeatOutput > 0) {
      container.appendChild(renderHeatBar(gameData));
    }
    if (engineDef.containmentComplexity > 0) {
      container.appendChild(renderContainmentBar(gameData));
    }

    // Flight status strip (shown when in flight)
    if (ship.location.status === 'in_flight') {
      const strip = renderFlightStrip(gameData);
      if (strip) container.appendChild(strip);
    }

    // Ship stats panel
    container.appendChild(renderShipStatsPanel(gameData));

    // Job slots grid (organized by room + ship-wide)
    container.appendChild(renderJobSlotsGrid(gameData, callbacks));

    // Gravity status panel
    container.appendChild(renderGravityStatus(gameData));

    // Equipment section
    container.appendChild(renderEquipmentSection(gameData));

    // Unassigned crew
    container.appendChild(renderUnassignedCrew(gameData, callbacks));
  }

  rebuild(gameData);
  return {
    el: container,
    update: rebuild,
    setShowNavigation(v: boolean) {
      currentShowNav = v;
    },
  };
}

// ── Status bars (fuel, power, radiation, heat, containment) ──────

function renderFuelBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  const colorClass = getFuelColorClass(fuelPercentage);

  return renderStatBar({
    label: 'FUEL',
    percentage: fuelPercentage,
    valueLabel: `${formatFuelMass(ship.fuelKg)} / ${formatFuelMass(ship.maxFuelKg)}`,
    colorClass,
    mode: 'full',
  });
}

function renderPowerBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const powerStatus = computePowerStatus(ship);
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  let label = 'POWER';
  switch (powerStatus.powerSource) {
    case 'berth':
      label = 'POWER (DOCKING BERTH)';
      break;
    case 'drives':
      label = 'POWER (DRIVES)';
      break;
    case 'warming_up':
      label = 'POWER (DRIVES WARMING UP)';
      break;
    case 'none':
      label = 'POWER (ENGINE OFF)';
      break;
  }

  const valueLabel =
    powerStatus.totalOutput > 0
      ? `${powerStatus.totalDraw}/${powerStatus.totalOutput} kW (${powerStatus.percentage.toFixed(0)}%)`
      : '0 kW (NO POWER)';

  const drawItems: Array<{ name: string; draw: number }> = [];

  for (const room of ship.rooms) {
    const roomDef = getRoomDefinition(room.type);
    if (!roomDef) continue;
    const isActive =
      roomDef.alwaysPowered ||
      (isRoomStaffed(ship, room.id) && room.state === 'operational');
    if (isActive && roomDef.powerDraw > 0) {
      drawItems.push({ name: roomDef.name, draw: roomDef.powerDraw });
    }
  }

  for (const equipment of ship.equipment) {
    const equipDef = getEquipmentDefinition(equipment.definitionId);
    if (equipDef && equipDef.powerDraw > 0) {
      drawItems.push({ name: equipDef.name, draw: equipDef.powerDraw });
    }
  }

  if (ship.engine.state === 'online' && engineDef.selfPowerDraw > 0) {
    drawItems.push({
      name: `${engineDef.name} (self)`,
      draw: engineDef.selfPowerDraw,
    });
  }

  const available = powerStatus.totalOutput - powerStatus.totalDraw;
  const tooltipContent = formatPowerTooltip(
    available,
    powerStatus.totalOutput,
    drawItems
  );

  const basePercentage =
    powerStatus.powerSource === 'berth' || powerStatus.powerSource === 'drives'
      ? 100
      : 0;

  let overlayColorClass = 'bar-warning';
  if (powerStatus.isOverloaded) {
    overlayColorClass = 'bar-danger';
  }

  const drawnPercentage = powerStatus.percentage;

  const statBar = renderStatBar({
    label,
    percentage: basePercentage,
    valueLabel,
    colorClass: 'bar-good',
    mode: 'full',
    overlay:
      basePercentage > 0
        ? {
            percentage: drawnPercentage,
            colorClass: overlayColorClass,
          }
        : undefined,
  });

  attachTooltip(statBar, {
    content: tooltipContent,
    followMouse: false,
  });

  return statBar;
}

function renderOxygenBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const oxygenStatus = computeOxygenStatus(ship);

  // Build label based on state
  let label = 'OXYGEN';
  if (!oxygenStatus.isPowered && ship.location.status !== 'docked') {
    label = 'OXYGEN (NO POWER)';
  } else if (oxygenStatus.isDepressurizing) {
    label = 'OXYGEN (DEPRESSURIZING)';
  }

  // Value label shows level and net change rate
  let valueLabel: string;
  if (ship.location.status === 'docked') {
    valueLabel = `${oxygenStatus.oxygenLevel.toFixed(0)}% (Station Supply)`;
  } else {
    const sign = oxygenStatus.netChange >= 0 ? '+' : '';
    valueLabel = `${oxygenStatus.oxygenLevel.toFixed(1)}% (${sign}${oxygenStatus.netChange.toFixed(1)} O2/tick)`;
  }

  // Color based on oxygen level
  let colorClass = 'bar-good';
  if (oxygenStatus.oxygenLevel < 10) {
    colorClass = 'bar-danger';
  } else if (oxygenStatus.oxygenLevel < 25) {
    colorClass = 'bar-danger';
  } else if (oxygenStatus.oxygenLevel < 50) {
    colorClass = 'bar-warning';
  }

  // Build the bar showing oxygen level
  const basePercentage = oxygenStatus.oxygenLevel;

  // Overlay shows consumption as a proportion of generation (like power bar)
  let overlay: { percentage: number; colorClass: string } | undefined;
  if (
    oxygenStatus.isPowered &&
    oxygenStatus.totalGeneration > 0 &&
    ship.location.status !== 'docked'
  ) {
    const drawPercentage =
      (oxygenStatus.totalConsumption / oxygenStatus.totalGeneration) * 100;
    overlay = {
      percentage: Math.min(100, drawPercentage),
      colorClass: oxygenStatus.isDepressurizing ? 'bar-danger' : 'bar-warning',
    };
  }

  const statBar = renderStatBar({
    label,
    percentage: basePercentage,
    valueLabel,
    colorClass,
    mode: 'full',
    overlay,
  });

  // Build tooltip with generation/consumption breakdown
  const tooltipParts: string[] = [];

  tooltipParts.push(
    `<div><span class="custom-tooltip-label">Oxygen Level:</span> <span class="custom-tooltip-value">${oxygenStatus.oxygenLevel.toFixed(1)}%</span></div>`
  );

  if (oxygenStatus.generationItems.length > 0) {
    tooltipParts.push(
      '<div class="custom-tooltip-section">O2 Generation:</div>'
    );
    for (const item of oxygenStatus.generationItems) {
      tooltipParts.push(
        `<div class="custom-tooltip-item">${item.name}: ${item.output.toFixed(1)} O2/tick</div>`
      );
    }
    tooltipParts.push(
      `<div><span class="custom-tooltip-label">Total Generation:</span> <span class="custom-tooltip-value">${oxygenStatus.totalGeneration.toFixed(1)} O2/tick</span></div>`
    );
  }

  tooltipParts.push(
    `<div><span class="custom-tooltip-label">Crew Consumption:</span> <span class="custom-tooltip-value">${oxygenStatus.totalConsumption.toFixed(1)} O2/tick (${ship.crew.length} crew)</span></div>`
  );

  const sign = oxygenStatus.netChange >= 0 ? '+' : '';
  tooltipParts.push(
    `<div><span class="custom-tooltip-label">Net Change:</span> <span class="custom-tooltip-value">${sign}${oxygenStatus.netChange.toFixed(1)} O2/tick</span></div>`
  );

  if (!oxygenStatus.isPowered && ship.location.status !== 'docked') {
    tooltipParts.push(
      '<div class="custom-tooltip-item" style="color: #ff6b6b;">Life support unpowered!</div>'
    );
  }

  attachTooltip(statBar, {
    content: tooltipParts.join(''),
    followMouse: false,
  });

  return statBar;
}

function renderRadiationBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const engineRadiation = engineDef.radiationOutput || 0;

  let totalShielding = 0;
  for (const eq of ship.equipment) {
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (eqDef?.radiationShielding) {
      const effectiveness = 1 - eq.degradation / 200;
      totalShielding += eqDef.radiationShielding * effectiveness;
    }
  }

  const netRadiation = Math.max(0, engineRadiation - totalShielding);
  const percentage =
    engineRadiation > 0 ? (netRadiation / engineRadiation) * 100 : 0;

  let colorClass = 'bar-good';
  if (netRadiation > 30) {
    colorClass = 'bar-danger';
  } else if (netRadiation > 15) {
    colorClass = 'bar-warning';
  }

  const valueLabel =
    ship.engine.state === 'online'
      ? `${netRadiation.toFixed(0)} rad (${engineRadiation.toFixed(0)} - ${totalShielding.toFixed(0)} shield)`
      : 'ENGINE OFF';

  return renderStatBar({
    label: 'RADIATION',
    percentage,
    valueLabel,
    colorClass,
    mode: 'full',
  });
}

function renderHeatBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const engineHeat = engineDef.wasteHeatOutput || 0;

  let totalDissipation = 0;
  for (const eq of ship.equipment) {
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (eqDef?.heatDissipation) {
      const effectiveness = 1 - eq.degradation / 200;
      totalDissipation += eqDef.heatDissipation * effectiveness;
    }
  }

  const excessHeat = Math.max(0, engineHeat - totalDissipation);
  const percentage = engineHeat > 0 ? (excessHeat / engineHeat) * 100 : 0;

  let colorClass = 'bar-good';
  if (excessHeat > 100) {
    colorClass = 'bar-danger';
  } else if (excessHeat > 50) {
    colorClass = 'bar-warning';
  }

  const valueLabel =
    ship.engine.state === 'online'
      ? `${excessHeat.toFixed(0)} kW excess (${engineHeat.toFixed(0)} - ${totalDissipation.toFixed(0)} cooling)`
      : 'ENGINE OFF';

  return renderStatBar({
    label: 'HEAT',
    percentage,
    valueLabel,
    colorClass,
    mode: 'full',
  });
}

function renderContainmentBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const confinementEq = ship.equipment.find(
    (eq) => eq.definitionId === 'mag_confinement'
  );

  if (!confinementEq) {
    return renderStatBar({
      label: 'CONTAINMENT',
      percentage: 0,
      valueLabel: 'NO CONFINEMENT UNIT',
      colorClass: 'bar-danger',
      mode: 'full',
    });
  }

  const degradationPercent = confinementEq.degradation;
  const integrity = 100 - degradationPercent;

  let colorClass = 'bar-good';
  if (degradationPercent > 70) {
    colorClass = 'bar-danger';
  } else if (degradationPercent > 30) {
    colorClass = 'bar-warning';
  }

  const reactorRoom = ship.rooms.find((r) => r.type === 'reactor_room');
  const staffingNote =
    reactorRoom && !isRoomStaffed(ship, reactorRoom.id) ? ' [UNSTAFFED]' : '';

  const valueLabel = `${integrity.toFixed(0)}% integrity${staffingNote}`;

  return renderStatBar({
    label: 'CONTAINMENT',
    percentage: integrity,
    valueLabel,
    colorClass,
    mode: 'full',
  });
}

// ── Ship stats panel ─────────────────────────────────────────────

function renderShipStatsPanel(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const shipClass = getShipClass(ship.classId);
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  if (!shipClass) {
    return document.createElement('div');
  }

  const section = document.createElement('div');
  section.className = 'ship-stats-section';
  section.style.marginBottom = '1rem';
  section.style.padding = '0.75rem';
  section.style.background = 'rgba(0, 0, 0, 0.2)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = 'SHIP CAPABILITIES';
  title.style.marginBottom = '0.5rem';
  title.style.fontSize = '0.9rem';
  title.style.color = '#4a9eff';
  section.appendChild(title);

  const statsGrid = document.createElement('div');
  statsGrid.className = 'ship-capabilities-grid';

  const maxRangeKm = computeMaxRange(shipClass, engineDef);
  const rangeLabel = getRangeLabel(maxRangeKm);
  const rangeDiv = document.createElement('div');
  rangeDiv.innerHTML = `<span style="color: #888;">Max Range:</span> <span style="color: #4ade80; font-weight: bold;">${formatLargeNumber(maxRangeKm)} km</span><br><span style="font-size: 0.75rem; color: #aaa;">(${rangeLabel})</span>`;
  rangeDiv.title = `Derived from: Engine (${engineDef.name}) + Ship Mass (${(shipClass.mass / 1000).toFixed(0)}t) + Consumables`;
  statsGrid.appendChild(rangeDiv);

  const acceleration = engineDef.thrust / shipClass.mass;
  const accelerationG = acceleration / 9.81;
  const accelDiv = document.createElement('div');
  accelDiv.innerHTML = `<span style="color: #888;">Max Accel:</span> <span style="color: #4ade80;">${accelerationG.toFixed(4)}g</span><br><span style="font-size: 0.75rem; color: #aaa;">(${engineDef.thrust.toLocaleString()} N)</span>`;
  statsGrid.appendChild(accelDiv);

  const maxSlots = shipClass.equipmentSlotDefs.length;
  const usedSlots = ship.equipment.length;
  const standardSlots = shipClass.equipmentSlotDefs.filter((s) =>
    s.tags.includes('standard')
  ).length;
  const structuralSlots = shipClass.equipmentSlotDefs.filter((s) =>
    s.tags.includes('structural')
  ).length;
  const slotsDiv = document.createElement('div');
  slotsDiv.innerHTML = `<span style="color: #888;">Equipment Slots:</span> <span style="color: #4ade80;">${usedSlots}/${maxSlots}</span><br><span style="font-size: 0.75rem; color: #aaa;">${standardSlots} Standard, ${structuralSlots} Structural</span>`;
  statsGrid.appendChild(slotsDiv);

  const tierDiv = document.createElement('div');
  const tierColor = getTierColor(shipClass.tier);
  tierDiv.innerHTML = `<span style="color: #888;">Class:</span> <span style="color: ${tierColor}; font-weight: bold;">${shipClass.tier}</span><br><span style="font-size: 0.75rem; color: #aaa;">${shipClass.name}</span>`;
  statsGrid.appendChild(tierDiv);

  const massDiv = document.createElement('div');
  massDiv.innerHTML = `<span style="color: #888;">Ship Mass:</span> <span style="color: #aaa;">${(shipClass.mass / 1000).toFixed(0)} tons</span>`;
  statsGrid.appendChild(massDiv);

  const crewDiv = document.createElement('div');
  crewDiv.innerHTML = `<span style="color: #888;">Crew:</span> <span style="color: #aaa;">${ship.crew.length}/${shipClass.maxCrew}</span>`;
  statsGrid.appendChild(crewDiv);

  section.appendChild(statsGrid);
  return section;
}

// ── Job slots grid ───────────────────────────────────────────────

function renderJobSlotsGrid(
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const grid = document.createElement('div');
  grid.className = 'room-grid';

  // Room-based cards with their job slots
  for (const room of ship.rooms) {
    grid.appendChild(renderRoomCard(room, gameData, callbacks));
  }

  // Ship-wide jobs section (repair)
  const shipJobs = ship.jobSlots.filter((s) => !s.sourceRoomId);
  if (shipJobs.length > 0) {
    grid.appendChild(renderShipJobsCard(shipJobs, gameData, callbacks));
  }

  return grid;
}

function renderJobSlotRow(
  slot: JobSlot,
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const def = getJobSlotDefinition(slot.type);
  const crew = slot.assignedCrewId
    ? (ship.crew.find((c) => c.id === slot.assignedCrewId) ?? null)
    : null;

  const row = document.createElement('div');
  row.className = 'room-crew-item';
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '0.5rem';

  // Job icon + name
  const jobLabel = document.createElement('span');
  jobLabel.style.fontSize = '0.85rem';
  jobLabel.style.minWidth = '90px';
  jobLabel.style.color = def?.required ? '#fbbf24' : '#aaa';
  jobLabel.textContent = `${def?.icon ?? '?'} ${def?.name ?? slot.type}`;
  if (def?.skill) {
    const skillBadge = document.createElement('span');
    skillBadge.style.fontSize = '0.7rem';
    skillBadge.style.color = '#666';
    skillBadge.style.marginLeft = '4px';
    skillBadge.textContent = `(${def.skill})`;
    jobLabel.appendChild(skillBadge);
  }
  row.appendChild(jobLabel);

  if (crew) {
    // Show assigned crew
    const crewSpan = document.createElement('span');
    crewSpan.className = 'crew-name-short';
    crewSpan.style.flex = '1';

    if (crew.isCaptain) {
      const badge = document.createElement('span');
      badge.className = 'captain-badge';
      badge.textContent = 'CPT ';
      crewSpan.appendChild(badge);
    }

    crewSpan.appendChild(document.createTextNode(crew.name.split(' ')[0]));

    // Show skill level for this job
    if (def?.skill) {
      const skillVal = crew.skills[def.skill];
      const lvl = document.createElement('span');
      lvl.style.fontSize = '0.75rem';
      lvl.style.color = '#4a9eff';
      lvl.style.marginLeft = '4px';
      lvl.textContent = `[${skillVal}]`;
      crewSpan.appendChild(lvl);
    }

    row.appendChild(crewSpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'small-button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => callbacks.onJobUnassign(crew.id));
    row.appendChild(removeBtn);
  } else {
    // Empty slot — show dropdown to assign
    const unassigned = getUnassignedCrew(ship);
    if (unassigned.length > 0) {
      const select = document.createElement('select');
      select.className = 'crew-select';
      select.style.flex = '1';

      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- assign --';
      select.appendChild(defaultOpt);

      // Sort by affinity: highest relevant skill first
      const sorted = [...unassigned].sort((a, b) => {
        if (!def?.skill) return 0;
        return b.skills[def.skill] - a.skills[def.skill];
      });

      for (const c of sorted) {
        const opt = document.createElement('option');
        opt.value = c.id;
        const prefix = c.isCaptain ? 'CPT ' : '';
        const skillInfo = def?.skill
          ? ` [${def.skill}: ${c.skills[def.skill]}]`
          : '';
        opt.textContent = `${prefix}${c.name} (${getCrewRoleName(c.role)})${skillInfo}`;
        select.appendChild(opt);
      }

      select.addEventListener('change', (e) => {
        const crewId = (e.target as HTMLSelectElement).value;
        if (crewId) {
          callbacks.onJobAssign(crewId, slot.id);
        }
      });

      row.appendChild(select);
    } else {
      const emptyLabel = document.createElement('span');
      emptyLabel.style.color = '#555';
      emptyLabel.style.flex = '1';
      emptyLabel.textContent = '(empty)';
      row.appendChild(emptyLabel);
    }
  }

  return row;
}

function renderRoomCard(
  room: Room,
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const roomDef = getRoomDefinition(room.type);
  const slots = getRoomJobSlots(ship, room.id);
  const assignedCount = getRoomCrewCount(ship, room.id);

  const roomCard = document.createElement('div');
  roomCard.className = `room-card room-${room.state}`;

  // Icon
  const roomIcon = document.createElement('div');
  roomIcon.className = 'room-icon';
  roomIcon.textContent = roomDef?.icon ?? '?';
  roomCard.appendChild(roomIcon);

  // Name
  const roomName = document.createElement('div');
  roomName.className = 'room-name';
  roomName.textContent = roomDef?.name ?? room.type;
  roomCard.appendChild(roomName);

  // Power badge
  if (roomDef) {
    const powerBadge = document.createElement('div');
    powerBadge.className = 'room-power-badge';

    if (room.type === 'engine_room') {
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      powerBadge.textContent = `+${engineDef.powerOutput} kW / -${roomDef.powerDraw} kW`;
    } else {
      powerBadge.textContent = `${roomDef.powerDraw} kW`;
    }

    roomCard.appendChild(powerBadge);
  }

  // Engine room special: show equipped engine + controls
  if (room.type === 'engine_room') {
    roomCard.appendChild(renderEngineSlot(gameData, callbacks));
  }

  // Cargo hold is automated — no job slots
  if (room.type === 'cargo_hold') {
    const automatedMsg = document.createElement('div');
    automatedMsg.className = 'room-automated';
    automatedMsg.textContent = 'Automated';
    roomCard.appendChild(automatedMsg);

    const shipClass = getShipClass(ship.classId);
    const maxCapacity = shipClass
      ? Math.floor(calculateAvailableCargoCapacity(shipClass.cargoCapacity))
      : 0;

    const currentCargo = ship.cargo.length * 100;
    const cargoPercent =
      maxCapacity > 0 ? (currentCargo / maxCapacity) * 100 : 0;

    const capacity = document.createElement('div');
    capacity.className = 'room-cargo-capacity';
    capacity.textContent = `Cargo: ${currentCargo.toLocaleString()} / ${maxCapacity.toLocaleString()} kg`;
    roomCard.appendChild(capacity);

    const progressBar = document.createElement('div');
    progressBar.className = 'cargo-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'cargo-progress-fill';
    progressFill.style.width = `${Math.min(100, cargoPercent)}%`;
    progressBar.appendChild(progressFill);
    roomCard.appendChild(progressBar);

    return roomCard;
  }

  // Crew count
  const crewCount = document.createElement('div');
  crewCount.className = 'room-crew-count';
  crewCount.textContent = `${assignedCount}/${slots.length}`;
  roomCard.appendChild(crewCount);

  // Job slot list
  const crewList = document.createElement('div');
  crewList.className = 'room-crew-list';

  if (slots.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'room-crew-empty';
    emptyMsg.textContent = 'No job slots';
    crewList.appendChild(emptyMsg);
  } else {
    for (const slot of slots) {
      crewList.appendChild(renderJobSlotRow(slot, gameData, callbacks));
    }
  }

  roomCard.appendChild(crewList);

  // Bridge-specific: Navigation button (requires helm to be manned)
  if (room.type === 'bridge') {
    const bridgeActions = document.createElement('div');
    bridgeActions.className = 'room-actions';

    const navBtn = document.createElement('button');
    navBtn.className = 'room-action-btn';
    navBtn.textContent = '\uD83D\uDDFA\uFE0F Navigation';
    navBtn.disabled = !isHelmManned(ship);
    if (!isHelmManned(ship)) {
      navBtn.title = 'Helm must be manned to access navigation';
    }
    navBtn.addEventListener('click', callbacks.onToggleNavigation);
    bridgeActions.appendChild(navBtn);

    roomCard.appendChild(bridgeActions);
  }

  return roomCard;
}

function renderEngineSlot(
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  const equipmentSlot = document.createElement('div');
  equipmentSlot.className = 'room-equipment-slot';

  const slotLabel = document.createElement('div');
  slotLabel.className = 'equipment-slot-label';
  slotLabel.textContent = 'Engine Slot (1/1)';
  equipmentSlot.appendChild(slotLabel);

  const engineItem = document.createElement('div');
  engineItem.className = 'room-equipment-item';

  const engineIcon = document.createElement('div');
  engineIcon.className = 'equipment-item-icon';
  engineIcon.textContent = engineDef.icon;
  engineItem.appendChild(engineIcon);

  const engineInfo = document.createElement('div');
  engineInfo.className = 'equipment-item-info';

  const engineName = document.createElement('div');
  engineName.className = 'equipment-item-name';
  engineName.textContent = engineDef.name;
  engineInfo.appendChild(engineName);

  const engineType = document.createElement('div');
  engineType.className = 'equipment-item-type';
  engineType.textContent = engineDef.type;
  engineInfo.appendChild(engineType);

  const shipClass = getShipClass(ship.classId);
  const acceleration = shipClass ? engineDef.thrust / shipClass.mass : 0;
  const accelerationG = acceleration / 9.81;

  const engineSpecs = document.createElement('div');
  engineSpecs.className = 'equipment-item-specs';
  engineSpecs.style.fontSize = '0.75rem';
  engineSpecs.style.color = '#888';
  engineSpecs.style.marginTop = '0.25rem';
  engineSpecs.innerHTML = `Thrust: ${(engineDef.thrust / 1000).toFixed(1)}kN | Accel: ${accelerationG.toFixed(4)}g | \u0394V: ${(engineDef.maxDeltaV / 1000).toFixed(0)}km/s`;
  engineInfo.appendChild(engineSpecs);

  const engineState = document.createElement('div');
  engineState.className = 'equipment-item-state';
  if (ship.engine.state === 'off') {
    engineState.textContent = '\u26AB OFF';
    engineState.style.color = '#ff6b6b';
  } else if (ship.engine.state === 'warming_up') {
    engineState.textContent = `\uD83D\uDFE1 WARMING ${ship.engine.warmupProgress.toFixed(0)}%`;
    engineState.style.color = '#ffc107';
  } else {
    engineState.textContent = '\uD83D\uDFE2 ONLINE';
    engineState.style.color = '#4caf50';
  }
  engineInfo.appendChild(engineState);

  engineItem.appendChild(engineInfo);
  equipmentSlot.appendChild(engineItem);

  // Engine controls
  const isDocked = ship.location.status === 'docked';
  const hasHelm = isHelmManned(ship);
  const hasEngineerRoom = isRoomStaffed(
    ship,
    ship.rooms.find((r) => r.type === 'engine_room')?.id ?? ''
  );
  const hasControlCrew = hasHelm || hasEngineerRoom;

  if (!isDocked && hasControlCrew) {
    const controls = document.createElement('div');
    controls.className = 'room-equipment-controls';

    if (ship.engine.state === 'off') {
      const onBtn = document.createElement('button');
      onBtn.className = 'small-button';
      onBtn.textContent = 'Turn On';
      onBtn.addEventListener('click', callbacks.onEngineOn);
      controls.appendChild(onBtn);
    } else {
      const offBtn = document.createElement('button');
      offBtn.className = 'small-button';
      offBtn.textContent = 'Turn Off';
      offBtn.addEventListener('click', callbacks.onEngineOff);
      controls.appendChild(offBtn);
    }

    equipmentSlot.appendChild(controls);
  } else if (!isDocked && !hasControlCrew) {
    const warning = document.createElement('div');
    warning.className = 'equipment-warning';
    warning.textContent = 'Helm or Engine Room must be staffed';
    equipmentSlot.appendChild(warning);
  }

  // Warmup progress bar
  if (ship.engine.state === 'warming_up') {
    const remainingPercent = 100 - ship.engine.warmupProgress;
    const ticksRemaining = remainingPercent / engineDef.warmupRate;
    const gameSecondsRemaining = ticksRemaining * GAME_SECONDS_PER_TICK;
    const timeLabel = formatDualTime(gameSecondsRemaining);

    const warmupBar = renderStatBar({
      label: 'WARMUP',
      percentage: ship.engine.warmupProgress,
      valueLabel: `${ship.engine.warmupProgress.toFixed(0)}% - ${timeLabel} remaining`,
      colorClass: 'bar-good',
      mode: 'full',
    });
    warmupBar.style.fontSize = '0.85em';
    warmupBar.style.marginTop = '0.5em';
    equipmentSlot.appendChild(warmupBar);
  }

  return equipmentSlot;
}

function renderShipJobsCard(
  shipJobs: JobSlot[],
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'room-card room-operational';

  const icon = document.createElement('div');
  icon.className = 'room-icon';
  icon.textContent = '\uD83D\uDD27';
  card.appendChild(icon);

  const name = document.createElement('div');
  name.className = 'room-name';
  name.textContent = 'Ship Jobs';
  card.appendChild(name);

  const ship = getActiveShip(gameData);
  const filledCount = shipJobs.filter((s) => s.assignedCrewId !== null).length;
  const crewCount = document.createElement('div');
  crewCount.className = 'room-crew-count';
  crewCount.textContent = `${filledCount}/${shipJobs.length}`;
  card.appendChild(crewCount);

  // Show repair points if any engineers assigned
  const repairSlots = shipJobs.filter(
    (s) => s.type === 'repair' && s.assignedCrewId !== null
  );
  if (repairSlots.length > 0) {
    let totalRepairPts = 0;
    for (const slot of repairSlots) {
      const crew = ship.crew.find((c) => c.id === slot.assignedCrewId);
      if (crew) {
        totalRepairPts += crew.skills.engineering * 0.5;
      }
    }
    const degradedCount = ship.equipment.filter(
      (eq) => eq.degradation > 0
    ).length;

    const repairInfo = document.createElement('div');
    repairInfo.style.fontSize = '0.8rem';
    repairInfo.style.color = '#4ade80';
    repairInfo.style.padding = '0.25rem 0';
    repairInfo.textContent = `Repair: ${totalRepairPts.toFixed(1)} pts/tick${degradedCount > 0 ? ` \u2192 ${degradedCount} items` : ''}`;
    card.appendChild(repairInfo);
  }

  const crewList = document.createElement('div');
  crewList.className = 'room-crew-list';

  for (const slot of shipJobs) {
    crewList.appendChild(renderJobSlotRow(slot, gameData, callbacks));
  }

  card.appendChild(crewList);

  return card;
}

// ── Unassigned crew (staging area) ───────────────────────────────

function renderUnassignedCrew(
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const unassigned = getUnassignedCrew(ship);

  const staging = document.createElement('div');
  staging.className = 'staging-area';

  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.justifyContent = 'space-between';

  const title = document.createElement('h3');
  title.textContent = `Unassigned Crew (${unassigned.length})`;
  headerRow.appendChild(title);

  // Auto-assign button
  if (ship.crew.length > 0) {
    const autoBtn = document.createElement('button');
    autoBtn.className = 'small-button';
    autoBtn.textContent = 'Auto-Assign All';
    autoBtn.addEventListener('click', callbacks.onAutoAssignCrew);
    headerRow.appendChild(autoBtn);
  }

  staging.appendChild(headerRow);

  if (unassigned.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'staging-empty';
    emptyMsg.textContent = 'All crew members are assigned to jobs.';
    staging.appendChild(emptyMsg);
  } else {
    const crewList = document.createElement('div');
    crewList.className = 'staging-crew-list';

    // Collect all empty slots for the dropdown
    const emptySlots = ship.jobSlots.filter((s) => s.assignedCrewId === null);

    for (const crew of unassigned) {
      const crewRow = document.createElement('div');
      crewRow.className = 'staging-crew-row';

      const crewInfo = document.createElement('div');
      crewInfo.className = 'staging-crew-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'staging-crew-name';
      if (crew.isCaptain) {
        const captainBadge = document.createElement('span');
        captainBadge.className = 'captain-badge';
        captainBadge.textContent = 'CPT ';
        nameEl.appendChild(captainBadge);
      }
      nameEl.appendChild(document.createTextNode(crew.name));
      crewInfo.appendChild(nameEl);

      const role = document.createElement('div');
      role.className = 'staging-crew-role';
      role.textContent = getCrewRoleName(crew.role);
      crewInfo.appendChild(role);

      const stats = document.createElement('div');
      stats.className = 'staging-crew-stats';
      stats.innerHTML = `<span class="stat health">HP: ${crew.health}</span><span class="stat morale">M: ${crew.morale}</span><span class="stat level">Lv: ${crew.level}</span>`;
      crewInfo.appendChild(stats);

      crewRow.appendChild(crewInfo);

      // Job slot assignment dropdown
      if (emptySlots.length > 0) {
        const assignSection = document.createElement('div');
        assignSection.className = 'staging-crew-assign';

        const select = document.createElement('select');
        select.className = 'crew-select';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Assign to job...';
        select.appendChild(defaultOption);

        for (const slot of emptySlots) {
          const slotDef = getJobSlotDefinition(slot.type);
          if (!slotDef) continue;

          // Find room name for context
          let locationLabel = '';
          if (slot.sourceRoomId) {
            const room = ship.rooms.find((r) => r.id === slot.sourceRoomId);
            const roomDef = room ? getRoomDefinition(room.type) : null;
            locationLabel = roomDef ? ` (${roomDef.name})` : '';
          } else {
            locationLabel = ' (Ship)';
          }

          const skillInfo = slotDef.skill
            ? ` [${slotDef.skill}: ${crew.skills[slotDef.skill]}]`
            : '';

          const option = document.createElement('option');
          option.value = slot.id;
          option.textContent = `${slotDef.name}${locationLabel}${skillInfo}`;
          select.appendChild(option);
        }

        select.addEventListener('change', (e) => {
          const slotId = (e.target as HTMLSelectElement).value;
          if (slotId) {
            callbacks.onJobAssign(crew.id, slotId);
          }
        });

        assignSection.appendChild(select);
        crewRow.appendChild(assignSection);
      }

      crewList.appendChild(crewRow);
    }

    staging.appendChild(crewList);
  }

  return staging;
}

// ── Gravity status ───────────────────────────────────────────────

function renderGravityStatus(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const section = document.createElement('div');
  section.className = 'gravity-status-section';

  const title = document.createElement('h3');
  title.textContent = 'Gravity Status';
  section.appendChild(title);

  const gravitySource = getGravitySource(ship);

  const sourceLine = document.createElement('div');
  sourceLine.className = 'gravity-line';

  const sourceLabel = document.createElement('span');
  sourceLabel.textContent = 'Source: ';
  sourceLine.appendChild(sourceLabel);

  const sourceValue = document.createElement('span');
  if (gravitySource.type === 'rotating_habitat') {
    sourceValue.textContent = 'Rotating Habitat';
    sourceValue.style.color = '#4ade80';
  } else if (gravitySource.type === 'centrifuge') {
    sourceValue.textContent = 'Centrifuge Pod';
    sourceValue.style.color = '#4ade80';
  } else if (gravitySource.type === 'thrust' && gravitySource.thrustG) {
    sourceValue.textContent = `Thrust (${gravitySource.thrustG.toFixed(2)}g)`;
    sourceValue.style.color = '#fbbf24';
  } else {
    sourceValue.textContent = 'None';
    sourceValue.style.color = '#f87171';
  }
  sourceLine.appendChild(sourceValue);
  section.appendChild(sourceLine);

  const exposureLine = document.createElement('div');
  exposureLine.className = 'gravity-line';

  const exposureLabel = document.createElement('span');
  exposureLabel.textContent = 'Exposure Rate: ';
  exposureLine.appendChild(exposureLabel);

  const exposureValue = document.createElement('span');

  let rate = 100;

  if (
    gravitySource.type === 'rotating_habitat' ||
    gravitySource.type === 'centrifuge'
  ) {
    rate = 0;
    exposureValue.textContent = '0%';
    exposureValue.style.color = '#4ade80';
  } else {
    if (gravitySource.type === 'thrust' && gravitySource.thrustG) {
      const reduction = Math.min(100, gravitySource.thrustG * 100);
      rate = Math.max(0, 100 - reduction);
    }

    const hasExerciseModule = ship.equipment.some((eq) => {
      const def = getEquipmentDefinition(eq.definitionId);
      return def?.id === 'exercise_module';
    });

    if (hasExerciseModule) {
      rate *= 0.5;
    }

    const crewWithGSeats = ship.crew.filter((crew) =>
      crew.equipment.some((eq) => eq.definitionId === 'g_seat')
    ).length;

    exposureValue.textContent = `${rate.toFixed(0)}%`;

    if (rate === 0) {
      exposureValue.style.color = '#4ade80';
    } else if (rate <= 50) {
      exposureValue.style.color = '#fbbf24';
    } else {
      exposureValue.style.color = '#f87171';
    }

    const modifiers: string[] = [];
    if (gravitySource.type === 'thrust') {
      modifiers.push('thrust burn');
    }
    if (hasExerciseModule) {
      modifiers.push('exercise module');
    }
    if (crewWithGSeats > 0) {
      modifiers.push(`${crewWithGSeats} crew with g-seats`);
    }

    if (modifiers.length > 0) {
      const modNote = document.createElement('span');
      modNote.textContent = ` (${modifiers.join(', ')})`;
      modNote.style.fontSize = '0.9em';
      modNote.style.opacity = '0.8';
      exposureValue.appendChild(modNote);
    }
  }

  exposureLine.appendChild(exposureValue);
  section.appendChild(exposureLine);

  return section;
}

// ── Equipment section ────────────────────────────────────────────

function renderEquipmentSection(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const shipClass = getShipClass(ship.classId);
  const section = document.createElement('div');
  section.className = 'equipment-section';

  const title = document.createElement('h3');
  const maxSlots = shipClass?.equipmentSlotDefs.length ?? 0;
  const usedSlots = ship.equipment.length;
  title.textContent = `Equipment (${usedSlots}/${maxSlots} slots)`;
  section.appendChild(title);

  const equipmentList = document.createElement('div');
  equipmentList.className = 'equipment-list';

  for (const equipment of ship.equipment) {
    const equipDef = getEquipmentDefinition(equipment.definitionId);
    if (!equipDef) continue;

    const item = document.createElement('div');
    item.className = 'equipment-item';

    const icon = document.createElement('div');
    icon.className = 'equipment-icon';
    icon.textContent = equipDef.icon;
    item.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'equipment-info';

    const name = document.createElement('div');
    name.className = 'equipment-name';
    name.textContent = equipDef.name;
    info.appendChild(name);

    const power = document.createElement('div');
    power.className = 'equipment-power';
    power.textContent = `${equipDef.powerDraw} kW`;
    info.appendChild(power);

    item.appendChild(info);

    if (equipDef.hasDegradation) {
      const degradationBar = renderStatBar({
        label: 'Wear',
        percentage: equipment.degradation,
        valueLabel: `${equipment.degradation.toFixed(1)}%`,
        colorClass:
          equipment.degradation >= 75
            ? 'bar-danger'
            : equipment.degradation >= 50
              ? 'bar-warning'
              : 'bar-good',
        mode: 'full',
      });
      degradationBar.style.fontSize = '0.85em';
      degradationBar.style.marginTop = '0.5em';
      item.appendChild(degradationBar);
    }

    equipmentList.appendChild(item);
  }

  section.appendChild(equipmentList);

  return section;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatLargeNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(0) + 'K';
  }
  return num.toFixed(0);
}

function getRangeLabel(rangeKm: number): string {
  if (rangeKm < 50_000) return 'LEO/MEO';
  if (rangeKm < 1_000_000) return 'GEO/Cislunar';
  if (rangeKm < 10_000_000) return 'Inner System';
  if (rangeKm < 100_000_000) return 'Mars';
  if (rangeKm < 500_000_000) return 'Jupiter';
  return 'Outer System';
}

function getTierColor(tier: string): string {
  switch (tier) {
    case 'I':
      return '#888';
    case 'II':
      return '#4a9eff';
    case 'III':
      return '#ff9f43';
    case 'IV':
      return '#ff6b6b';
    case 'V':
      return '#a29bfe';
    default:
      return '#fff';
  }
}
