import type { GameData, Room, JobSlot, EquipmentPowerMode } from '../models';
import { getActiveShip } from '../models';
import { getShipClass } from '../shipClasses';
import { getRoomDefinition } from '../rooms';
import { getCrewRoleName, getPrimarySkillForRole } from '../crewRoles';
import { getSkillRank } from '../skillRanks';
import { computePowerStatus } from '../powerSystem';
import { computeOxygenStatus } from '../lifeSupportSystem';
import {
  getEquipmentDefinition,
  getCategoryLabel,
  getEffectiveRadiationShielding,
  getEffectiveHeatDissipation,
} from '../equipment';
import { canSetPowerModeOn } from '../powerManagement';
import { getPowerRuleDescription } from '../powerPriorities';
import { calculateRepairPoints } from '../crewRoles';
import { calculateDefenseScore } from '../combatSystem';
import { getCommandBonusBreakdown } from '../captainBonus';
import { getEngineDefinition } from '../engines';
import { createNavigationView } from './navigationView';
import { getGravitySource } from '../gravitySystem';
import { computeMaxRange, getCargoUsedKg } from '../flightPhysics';
import { getOreDefinition } from '../oreTypes';
import {
  formatDualTime,
  GAME_SECONDS_PER_TICK,
  TICKS_PER_DAY,
} from '../timeSystem';
import {
  formatLargeNumber,
  getRangeLabel,
  formatMass,
  formatCredits,
} from '../formatting';
import {
  getMaxProvisionsKg,
  getProvisionsSurvivalDays,
} from '../provisionsSystem';
import { getShipPerformance } from '../fleetAnalytics';

/** Ticks per game hour (used to convert per-tick rates to per-hour for display) */
const TICKS_PER_HOUR = TICKS_PER_DAY / 24;
import { renderStatBar } from './components/statBar';
import { attachTooltip, formatPowerTooltip } from './components/tooltip';
import type { Component } from './component';
import {
  formatRangeTooltip,
  formatAccelerationTooltip,
  formatEquipmentSlotsTooltip,
  formatShipMassTooltip,
  formatCrewCountTooltip,
} from './shipStatsTooltips';
import {
  formatFuelMass,
  calculateFuelPercentage,
  getFuelColorClass,
} from './fuelFormatting';
import { getProvisionsColorClass } from './provisionsFormatting';
import { createFlightStatusComponent } from './flightStatus';
import {
  getRoomJobSlots,
  getRoomCrewCount,
  getUnassignedCrew,
  getJobSlotDefinition,
  isRoomStaffed,
  isHelmManned,
} from '../jobSlots';
import {
  createFlightProfileControl,
  updateFlightProfileControl,
} from './flightProfileControl';

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
  onDockAtNearestPort: () => void;
  onCancelPause: () => void;
  onRequestAbandon: () => void;
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
    flightVelocity: ship.activeFlightPlan?.currentVelocity,
    flightPhase: ship.activeFlightPlan?.phase,
    burnFraction: ship.flightProfileBurnFraction,
    crewCount: ship.crew.length,
    cargoCount: ship.cargo.length,
    oreCargoKey: ship.oreCargo.map((o) => `${o.oreId}:${o.quantity}`).join(','),
    equipCount: ship.equipment.length,
    // Crew roster identity + stats that affect the rendered UI
    crew: ship.crew.map((c) => c.id + c.name + c.isCaptain).join(),
    crewSkills: ship.crew
      .map((c) => `${c.skills.piloting}${c.skills.mining}${c.skills.commerce}`)
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

// ── Refs for job slot rows (have interactive <select> dropdowns) ──

interface JobSlotRowRefs {
  row: HTMLDivElement;
  jobLabel: HTMLSpanElement;
  skillBadge: HTMLSpanElement | null;
  /** Container for the assigned crew or assignment dropdown */
  contentArea: HTMLDivElement;
}

// ── Refs for room cards ──

interface RoomCardRefs {
  card: HTMLDivElement;
  roomIcon: HTMLDivElement;
  roomName: HTMLDivElement;
  powerBadge: HTMLDivElement | null;
  engineSlot: HTMLDivElement | null;
  cargoSection: HTMLDivElement | null;
  cargoCapacity: HTMLDivElement | null;
  cargoFill: HTMLDivElement | null;
  oreBreakdown: HTMLDivElement | null;
  crewCount: HTMLDivElement | null;
  crewList: HTMLDivElement | null;
  bridgeActions: HTMLDivElement | null;
  navBtn: HTMLButtonElement | null;
  slotRowMap: Map<string, JobSlotRowRefs>;
}

// ── Refs for unassigned crew rows ──

interface UnassignedCrewRowRefs {
  row: HTMLDivElement;
  nameEl: HTMLDivElement;
  roleEl: HTMLDivElement;
  statsEl: HTMLDivElement;
  assignSection: HTMLDivElement;
}

// ── Refs for ship jobs card ──

interface ShipJobsCardRefs {
  card: HTMLDivElement;
  crewCount: HTMLDivElement;
  repairInfo: HTMLDivElement;
  crewList: HTMLDivElement;
  slotRowMap: Map<string, JobSlotRowRefs>;
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

  // Persistent flight profile slider — survives rebuilds (interactive element)
  const profileControl = createFlightProfileControl(gameData);

  // ── Navigation view slot ──
  const navSlot = document.createElement('div');
  let navComponent: Component | null = null;

  // ── Ship content container (everything except nav) ──
  const shipContent = document.createElement('div');

  // ── Profitability section slot ──
  const profitabilitySlot = document.createElement('div');

  // ── Stat bar slots (leaf helpers, re-rendered via slot pattern) ──
  const fuelBarSlot = document.createElement('div');
  const provisionsBarSlot = document.createElement('div');
  const powerBarSlot = document.createElement('div');
  const oxygenBarSlot = document.createElement('div');
  const radiationBarSlot = document.createElement('div');
  const heatBarSlot = document.createElement('div');
  const containmentBarSlot = document.createElement('div');
  const commandBarSlot = document.createElement('div');

  // ── Flight status component (includes flight info + station action radio) ──
  const flightStatusComponent = createFlightStatusComponent(gameData, {
    onContinue: () => callbacks.onCancelPause(),
    onPause: () => callbacks.onDockAtNearestPort(),
    onAbandon: () => callbacks.onRequestAbandon(),
  });

  // ── Ship stats panel slot ──
  const shipStatsPanelSlot = document.createElement('div');

  // ── Job slots grid ──
  const jobSlotsGrid = document.createElement('div');
  jobSlotsGrid.className = 'room-grid';
  const roomCardMap = new Map<string, RoomCardRefs>();
  let shipJobsCardRefs: ShipJobsCardRefs | null = null;

  // ── Gravity status slot ──
  const gravityStatusSlot = document.createElement('div');

  // ── Equipment section slot ──
  const equipmentSectionSlot = document.createElement('div');

  // ── Unassigned crew section ──
  const stagingArea = document.createElement('div');
  stagingArea.className = 'staging-area';
  const stagingHeaderRow = document.createElement('div');
  stagingHeaderRow.style.display = 'flex';
  stagingHeaderRow.style.alignItems = 'center';
  stagingHeaderRow.style.justifyContent = 'space-between';
  const stagingTitle = document.createElement('h3');
  stagingHeaderRow.appendChild(stagingTitle);
  const autoAssignBtn = document.createElement('button');
  autoAssignBtn.className = 'small-button';
  autoAssignBtn.textContent = 'Auto-Assign All';
  autoAssignBtn.addEventListener('click', callbacks.onAutoAssignCrew);
  stagingHeaderRow.appendChild(autoAssignBtn);
  stagingArea.appendChild(stagingHeaderRow);
  const stagingEmptyMsg = document.createElement('p');
  stagingEmptyMsg.className = 'staging-empty';
  stagingEmptyMsg.textContent = 'All crew members are assigned to jobs.';
  stagingArea.appendChild(stagingEmptyMsg);
  const stagingCrewList = document.createElement('div');
  stagingCrewList.className = 'staging-crew-list';
  stagingArea.appendChild(stagingCrewList);
  const unassignedCrewMap = new Map<string, UnassignedCrewRowRefs>();

  // Assemble ship content
  shipContent.append(
    profitabilitySlot,
    fuelBarSlot,
    provisionsBarSlot,
    powerBarSlot,
    oxygenBarSlot,
    radiationBarSlot,
    heatBarSlot,
    containmentBarSlot,
    commandBarSlot,
    flightStatusComponent.el,
    shipStatsPanelSlot,
    jobSlotsGrid,
    gravityStatusSlot,
    equipmentSectionSlot,
    stagingArea
  );

  // Assemble container
  container.append(profileControl.el, navSlot, shipContent);

  // ── Helper: create a job slot row ──
  function createJobSlotRow(slot: JobSlot, gameData: GameData): JobSlotRowRefs {
    const def = getJobSlotDefinition(slot.type);

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

    let skillBadge: HTMLSpanElement | null = null;
    if (def?.skill) {
      skillBadge = document.createElement('span');
      skillBadge.style.fontSize = '0.7rem';
      skillBadge.style.color = '#666';
      skillBadge.style.marginLeft = '4px';
      skillBadge.textContent = `(${def.skill})`;
      jobLabel.appendChild(skillBadge);
    }
    row.appendChild(jobLabel);

    // Content area for assigned crew or assignment dropdown
    const contentArea = document.createElement('div');
    contentArea.style.display = 'contents';
    row.appendChild(contentArea);

    const refs: JobSlotRowRefs = { row, jobLabel, skillBadge, contentArea };

    updateJobSlotRowContent(refs, slot, gameData);

    return refs;
  }

  // ── Helper: update job slot row content ──
  function updateJobSlotRowContent(
    refs: JobSlotRowRefs,
    slot: JobSlot,
    gameData: GameData
  ): void {
    const ship = getActiveShip(gameData);
    const def = getJobSlotDefinition(slot.type);
    const crew = slot.assignedCrewId
      ? (ship.crew.find((c) => c.id === slot.assignedCrewId) ?? null)
      : null;

    // Clear the content area
    while (refs.contentArea.firstChild) {
      refs.contentArea.removeChild(refs.contentArea.firstChild);
    }

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
        const skillVal = Math.floor(crew.skills[def.skill]);
        const lvl = document.createElement('span');
        lvl.style.fontSize = '0.75rem';
        lvl.style.color = '#4a9eff';
        lvl.style.marginLeft = '4px';
        lvl.textContent = `[${skillVal}]`;
        crewSpan.appendChild(lvl);
      }

      refs.contentArea.appendChild(crewSpan);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'small-button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () =>
        callbacks.onJobUnassign(crew.id)
      );
      refs.contentArea.appendChild(removeBtn);
    } else {
      // Empty slot -- show dropdown to assign
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
            ? ` [${def.skill}: ${Math.floor(c.skills[def.skill])}]`
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

        refs.contentArea.appendChild(select);
      } else {
        const emptyLabel = document.createElement('span');
        emptyLabel.style.color = '#555';
        emptyLabel.style.flex = '1';
        emptyLabel.textContent = '(empty)';
        refs.contentArea.appendChild(emptyLabel);
      }
    }
  }

  // ── Helper: create a room card ──
  function createRoomCard(room: Room, gameData: GameData): RoomCardRefs {
    const ship = getActiveShip(gameData);
    const roomDef = getRoomDefinition(room.type);
    const slots = getRoomJobSlots(ship, room.id);

    const card = document.createElement('div');
    card.className = `room-card room-${room.state}`;

    // Icon
    const roomIcon = document.createElement('div');
    roomIcon.className = 'room-icon';
    roomIcon.textContent = roomDef?.icon ?? '?';
    card.appendChild(roomIcon);

    // Name
    const roomName = document.createElement('div');
    roomName.className = 'room-name';
    roomName.textContent = roomDef?.name ?? room.type;
    card.appendChild(roomName);

    // Power badge
    let powerBadge: HTMLDivElement | null = null;
    if (roomDef) {
      powerBadge = document.createElement('div');
      powerBadge.className = 'room-power-badge';
      card.appendChild(powerBadge);
    }

    // Engine slot (engine room only)
    let engineSlot: HTMLDivElement | null = null;
    if (room.type === 'engine_room') {
      engineSlot = document.createElement('div');
      card.appendChild(engineSlot);
    }

    // Cargo hold special section
    let cargoSection: HTMLDivElement | null = null;
    let cargoCapacity: HTMLDivElement | null = null;
    let cargoFill: HTMLDivElement | null = null;
    let oreBreakdown: HTMLDivElement | null = null;
    if (room.type === 'cargo_hold') {
      cargoSection = document.createElement('div');

      const automatedMsg = document.createElement('div');
      automatedMsg.className = 'room-automated';
      automatedMsg.textContent = 'Automated';
      cargoSection.appendChild(automatedMsg);

      cargoCapacity = document.createElement('div');
      cargoCapacity.className = 'room-cargo-capacity';
      cargoSection.appendChild(cargoCapacity);

      const progressBar = document.createElement('div');
      progressBar.className = 'cargo-progress-bar';
      cargoFill = document.createElement('div');
      cargoFill.className = 'cargo-progress-fill';
      progressBar.appendChild(cargoFill);
      cargoSection.appendChild(progressBar);

      // Ore cargo breakdown (always present, hidden when empty)
      oreBreakdown = document.createElement('div');
      oreBreakdown.style.cssText =
        'margin-top: 0.35rem; font-size: 0.8rem; color: #aaa;';
      cargoSection.appendChild(oreBreakdown);

      card.appendChild(cargoSection);
    }

    // Crew count (non-cargo rooms)
    let crewCountEl: HTMLDivElement | null = null;
    let crewList: HTMLDivElement | null = null;
    const slotRowMap = new Map<string, JobSlotRowRefs>();

    if (room.type !== 'cargo_hold') {
      crewCountEl = document.createElement('div');
      crewCountEl.className = 'room-crew-count';
      card.appendChild(crewCountEl);

      // Job slot list
      crewList = document.createElement('div');
      crewList.className = 'room-crew-list';

      if (slots.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'room-crew-empty';
        emptyMsg.textContent = 'No job slots';
        crewList.appendChild(emptyMsg);
      } else {
        for (const slot of slots) {
          const rowRefs = createJobSlotRow(slot, gameData);
          slotRowMap.set(slot.id, rowRefs);
          crewList.appendChild(rowRefs.row);
        }
      }

      card.appendChild(crewList);
    }

    // Bridge-specific: Navigation button
    let bridgeActions: HTMLDivElement | null = null;
    let navBtn: HTMLButtonElement | null = null;
    if (room.type === 'bridge') {
      bridgeActions = document.createElement('div');
      bridgeActions.className = 'room-actions';

      navBtn = document.createElement('button');
      navBtn.className = 'room-action-btn';
      navBtn.textContent = '\uD83D\uDDFA\uFE0F Navigation';
      navBtn.addEventListener('click', callbacks.onToggleNavigation);
      bridgeActions.appendChild(navBtn);

      card.appendChild(bridgeActions);
    }

    const refs: RoomCardRefs = {
      card,
      roomIcon,
      roomName,
      powerBadge,
      engineSlot,
      cargoSection,
      cargoCapacity,
      cargoFill,
      oreBreakdown,
      crewCount: crewCountEl,
      crewList,
      bridgeActions,
      navBtn,
      slotRowMap,
    };

    // Initial data fill
    updateRoomCard(refs, room, gameData);

    return refs;
  }

  // ── Helper: update room card in-place ──
  function updateRoomCard(
    refs: RoomCardRefs,
    room: Room,
    gameData: GameData
  ): void {
    const ship = getActiveShip(gameData);
    const roomDef = getRoomDefinition(room.type);
    const slots = getRoomJobSlots(ship, room.id);
    const assignedCount = getRoomCrewCount(ship, room.id);

    // Update card class for room state
    refs.card.className = `room-card room-${room.state}`;

    // Power badge
    if (refs.powerBadge && roomDef) {
      if (room.type === 'engine_room') {
        const engineDef = getEngineDefinition(ship.engine.definitionId);
        refs.powerBadge.textContent = `+${engineDef.powerOutput} kW / -${roomDef.powerDraw} kW`;
      } else {
        refs.powerBadge.textContent = `${roomDef.powerDraw} kW`;
      }
    }

    // Engine slot
    if (refs.engineSlot) {
      if (refs.engineSlot.firstChild)
        refs.engineSlot.removeChild(refs.engineSlot.firstChild);
      refs.engineSlot.appendChild(renderEngineSlot(gameData, callbacks));
    }

    // Cargo section
    if (refs.cargoCapacity && refs.cargoFill) {
      const shipClass = getShipClass(ship.classId);
      const maxCapacity = shipClass ? shipClass.cargoCapacity : 0;
      const currentCargo = getCargoUsedKg(ship);
      const cargoPercent =
        maxCapacity > 0 ? (currentCargo / maxCapacity) * 100 : 0;
      refs.cargoCapacity.textContent = `Cargo: ${formatMass(currentCargo)} / ${formatMass(maxCapacity)}`;
      refs.cargoFill.style.width = `${Math.min(100, cargoPercent)}%`;
      refs.cargoFill.style.backgroundColor =
        cargoPercent >= 90 ? '#e94560' : cargoPercent >= 70 ? '#ffa500' : '';
    }

    // Ore cargo breakdown
    if (refs.oreBreakdown) {
      if (ship.oreCargo.length > 0) {
        refs.oreBreakdown.style.display = '';
        // Reconcile ore lines in-place
        const lines: string[] = [];
        for (const item of ship.oreCargo) {
          const ore = getOreDefinition(item.oreId);
          lines.push(`${ore.icon} ${ore.name}: ${item.quantity} units`);
        }
        const content = lines.join('\n');
        if (refs.oreBreakdown.textContent !== content) {
          refs.oreBreakdown.textContent = '';
          for (const line of lines) {
            const div = document.createElement('div');
            div.textContent = line;
            refs.oreBreakdown.appendChild(div);
          }
        }
      } else {
        refs.oreBreakdown.style.display = 'none';
      }
    }

    // Crew count
    if (refs.crewCount) {
      refs.crewCount.textContent = `${assignedCount}/${slots.length}`;
    }

    // Reconcile job slot rows
    if (refs.crewList) {
      const currentSlotIds = new Set<string>();

      for (const slot of slots) {
        currentSlotIds.add(slot.id);

        const existing = refs.slotRowMap.get(slot.id);
        if (existing) {
          updateJobSlotRowContent(existing, slot, gameData);
        } else {
          const rowRefs = createJobSlotRow(slot, gameData);
          refs.slotRowMap.set(slot.id, rowRefs);
          refs.crewList.appendChild(rowRefs.row);
        }
      }

      // Remove departed slots
      for (const [id, rowRefs] of refs.slotRowMap) {
        if (!currentSlotIds.has(id)) {
          rowRefs.row.remove();
          refs.slotRowMap.delete(id);
        }
      }
    }

    // Bridge nav button
    if (refs.navBtn) {
      refs.navBtn.disabled = !isHelmManned(ship);
      if (!isHelmManned(ship)) {
        refs.navBtn.title = 'Helm must be manned to access navigation';
      } else {
        refs.navBtn.title = '';
      }
    }
  }

  // ── Helper: create ship jobs card ──
  function createShipJobsCard(
    shipJobs: JobSlot[],
    gameData: GameData
  ): ShipJobsCardRefs {
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

    const crewCount = document.createElement('div');
    crewCount.className = 'room-crew-count';
    card.appendChild(crewCount);

    const repairInfo = document.createElement('div');
    repairInfo.style.fontSize = '0.8rem';
    repairInfo.style.color = '#4ade80';
    repairInfo.style.padding = '0.25rem 0';
    card.appendChild(repairInfo);

    const crewList = document.createElement('div');
    crewList.className = 'room-crew-list';
    card.appendChild(crewList);

    const slotRowMap = new Map<string, JobSlotRowRefs>();
    for (const slot of shipJobs) {
      const rowRefs = createJobSlotRow(slot, gameData);
      slotRowMap.set(slot.id, rowRefs);
      crewList.appendChild(rowRefs.row);
    }

    const refs: ShipJobsCardRefs = {
      card,
      crewCount,
      repairInfo,
      crewList,
      slotRowMap,
    };

    updateShipJobsCard(refs, shipJobs, gameData);

    return refs;
  }

  // ── Helper: update ship jobs card in-place ──
  function updateShipJobsCard(
    refs: ShipJobsCardRefs,
    shipJobs: JobSlot[],
    gameData: GameData
  ): void {
    const ship = getActiveShip(gameData);
    const filledCount = shipJobs.filter(
      (s) => s.assignedCrewId !== null
    ).length;
    refs.crewCount.textContent = `${filledCount}/${shipJobs.length}`;

    // Repair points info
    const repairSlots = shipJobs.filter(
      (s) => s.type === 'repair' && s.assignedCrewId !== null
    );
    if (repairSlots.length > 0) {
      let totalRepairPts = 0;
      for (const slot of repairSlots) {
        const crew = ship.crew.find((c) => c.id === slot.assignedCrewId);
        if (crew) {
          totalRepairPts += calculateRepairPoints(crew);
        }
      }
      const degradedCount = ship.equipment.filter(
        (eq) => eq.degradation > 0
      ).length;
      refs.repairInfo.textContent = `Repair: ${totalRepairPts.toFixed(1)} pts/tick${degradedCount > 0 ? ` \u2192 ${degradedCount} items` : ''}`;
      refs.repairInfo.style.display = '';
    } else {
      refs.repairInfo.style.display = 'none';
    }

    // Reconcile slot rows
    const currentSlotIds = new Set<string>();
    for (const slot of shipJobs) {
      currentSlotIds.add(slot.id);
      const existing = refs.slotRowMap.get(slot.id);
      if (existing) {
        updateJobSlotRowContent(existing, slot, gameData);
      } else {
        const rowRefs = createJobSlotRow(slot, gameData);
        refs.slotRowMap.set(slot.id, rowRefs);
        refs.crewList.appendChild(rowRefs.row);
      }
    }
    for (const [id, rowRefs] of refs.slotRowMap) {
      if (!currentSlotIds.has(id)) {
        rowRefs.row.remove();
        refs.slotRowMap.delete(id);
      }
    }
  }

  // ── Helper: create unassigned crew row ──
  function createUnassignedCrewRow(
    crewId: string,
    gameData: GameData
  ): UnassignedCrewRowRefs {
    const row = document.createElement('div');
    row.className = 'staging-crew-row';

    const crewInfo = document.createElement('div');
    crewInfo.className = 'staging-crew-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'staging-crew-name';
    crewInfo.appendChild(nameEl);

    const roleEl = document.createElement('div');
    roleEl.className = 'staging-crew-role';
    crewInfo.appendChild(roleEl);

    const statsEl = document.createElement('div');
    statsEl.className = 'staging-crew-stats';
    crewInfo.appendChild(statsEl);

    row.appendChild(crewInfo);

    const assignSection = document.createElement('div');
    assignSection.className = 'staging-crew-assign';
    row.appendChild(assignSection);

    const refs: UnassignedCrewRowRefs = {
      row,
      nameEl,
      roleEl,
      statsEl,
      assignSection,
    };

    updateUnassignedCrewRow(refs, crewId, gameData);

    return refs;
  }

  // ── Helper: update unassigned crew row in-place ──
  function updateUnassignedCrewRow(
    refs: UnassignedCrewRowRefs,
    crewId: string,
    gameData: GameData
  ): void {
    const ship = getActiveShip(gameData);
    const crew = ship.crew.find((c) => c.id === crewId);
    if (!crew) return;

    // Name
    while (refs.nameEl.firstChild) {
      refs.nameEl.removeChild(refs.nameEl.firstChild);
    }
    if (crew.isCaptain) {
      const captainBadge = document.createElement('span');
      captainBadge.className = 'captain-badge';
      captainBadge.textContent = 'CPT ';
      refs.nameEl.appendChild(captainBadge);
    }
    refs.nameEl.appendChild(document.createTextNode(crew.name));

    // Role
    refs.roleEl.textContent = getCrewRoleName(crew.role);

    // Stats
    const primarySkill = getPrimarySkillForRole(crew.role);
    const rankAbbr = primarySkill
      ? getSkillRank(Math.floor(crew.skills[primarySkill])).name
      : '';
    refs.statsEl.innerHTML = `<span class="stat health">HP: ${crew.health}</span><span class="stat morale">M: ${crew.morale}</span><span class="stat level">${rankAbbr}</span>`;

    // Assignment dropdown
    while (refs.assignSection.firstChild) {
      refs.assignSection.removeChild(refs.assignSection.firstChild);
    }

    const emptySlots = ship.jobSlots.filter((s) => s.assignedCrewId === null);
    if (emptySlots.length > 0) {
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
          ? ` [${slotDef.skill}: ${Math.floor(crew.skills[slotDef.skill])}]`
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

      refs.assignSection.appendChild(select);
    }
  }

  // ── Main update function ──
  function update(gameData: GameData): void {
    const snap = snapshotShipProps(gameData, currentShowNav);
    if (!shipPropsChanged(lastSnapshot, snap)) return;
    lastSnapshot = snap;

    const ship = getActiveShip(gameData);

    // Show flight profile slider when docked or orbiting (not in flight) and not in nav view
    const showSlider =
      !currentShowNav &&
      (ship.location.status === 'docked' ||
        ship.location.status === 'orbiting');
    profileControl.el.style.display = showSlider ? '' : 'none';
    if (showSlider) {
      updateFlightProfileControl(profileControl, ship);
    }

    // Toggle navigation view vs ship content
    if (currentShowNav) {
      shipContent.style.display = 'none';
      navSlot.style.display = '';

      if (!navComponent) {
        navComponent = createNavigationView(gameData, {
          onToggleNavigation: callbacks.onToggleNavigation,
          onStartTrip: callbacks.onStartTrip,
        });
        navSlot.appendChild(navComponent.el);
      } else {
        navComponent.update(gameData);
      }
      return;
    } else {
      navSlot.style.display = 'none';
      shipContent.style.display = '';
      // Destroy nav component when leaving nav view so it re-creates fresh next time
      if (navComponent) {
        if (navSlot.firstChild) navSlot.removeChild(navSlot.firstChild);
        navComponent = null;
      }
    }

    // ── Profitability section (leaf helper via slot) ──
    if (profitabilitySlot.firstChild)
      profitabilitySlot.removeChild(profitabilitySlot.firstChild);
    profitabilitySlot.appendChild(renderProfitabilitySection(gameData));

    // ── Stat bars (leaf helpers via slot divs) ──
    if (fuelBarSlot.firstChild) fuelBarSlot.removeChild(fuelBarSlot.firstChild);
    fuelBarSlot.appendChild(renderFuelBar(gameData));

    if (provisionsBarSlot.firstChild)
      provisionsBarSlot.removeChild(provisionsBarSlot.firstChild);
    provisionsBarSlot.appendChild(renderProvisionsBar(gameData));

    if (powerBarSlot.firstChild)
      powerBarSlot.removeChild(powerBarSlot.firstChild);
    powerBarSlot.appendChild(renderPowerBar(gameData));

    if (oxygenBarSlot.firstChild)
      oxygenBarSlot.removeChild(oxygenBarSlot.firstChild);
    oxygenBarSlot.appendChild(renderOxygenBar(gameData));

    if (radiationBarSlot.firstChild)
      radiationBarSlot.removeChild(radiationBarSlot.firstChild);
    radiationBarSlot.appendChild(renderRadiationBar(gameData));

    if (heatBarSlot.firstChild) heatBarSlot.removeChild(heatBarSlot.firstChild);
    heatBarSlot.appendChild(renderHeatBar(gameData));

    if (containmentBarSlot.firstChild)
      containmentBarSlot.removeChild(containmentBarSlot.firstChild);
    containmentBarSlot.appendChild(renderContainmentBar(gameData));

    if (commandBarSlot.firstChild)
      commandBarSlot.removeChild(commandBarSlot.firstChild);
    commandBarSlot.appendChild(renderCommandBar(gameData));

    // ── Flight status component (handles its own visibility) ──
    flightStatusComponent.update(gameData);

    // ── Ship stats panel (leaf helper via slot) ──
    if (shipStatsPanelSlot.firstChild)
      shipStatsPanelSlot.removeChild(shipStatsPanelSlot.firstChild);
    shipStatsPanelSlot.appendChild(renderShipStatsPanel(gameData));

    // ── Job slots grid (reconciled with Maps) ──
    const currentRoomIds = new Set<string>();

    for (const room of ship.rooms) {
      currentRoomIds.add(room.id);

      const existing = roomCardMap.get(room.id);
      if (existing) {
        updateRoomCard(existing, room, gameData);
      } else {
        const cardRefs = createRoomCard(room, gameData);
        roomCardMap.set(room.id, cardRefs);
        // Insert before ship jobs card if it exists
        if (shipJobsCardRefs) {
          jobSlotsGrid.insertBefore(cardRefs.card, shipJobsCardRefs.card);
        } else {
          jobSlotsGrid.appendChild(cardRefs.card);
        }
      }
    }

    // Remove departed rooms
    for (const [id, cardRefs] of roomCardMap) {
      if (!currentRoomIds.has(id)) {
        cardRefs.card.remove();
        roomCardMap.delete(id);
      }
    }

    // Ship-wide jobs section (repair)
    const shipJobs = ship.jobSlots.filter((s) => !s.sourceRoomId);
    if (shipJobs.length > 0) {
      if (!shipJobsCardRefs) {
        shipJobsCardRefs = createShipJobsCard(shipJobs, gameData);
        jobSlotsGrid.appendChild(shipJobsCardRefs.card);
      } else {
        updateShipJobsCard(shipJobsCardRefs, shipJobs, gameData);
      }
      shipJobsCardRefs.card.style.display = '';
    } else if (shipJobsCardRefs) {
      shipJobsCardRefs.card.style.display = 'none';
    }

    // ── Gravity status (leaf helper via slot) ──
    if (gravityStatusSlot.firstChild)
      gravityStatusSlot.removeChild(gravityStatusSlot.firstChild);
    gravityStatusSlot.appendChild(renderGravityStatus(gameData));

    // ── Equipment section (leaf helper via slot) ──
    if (equipmentSectionSlot.firstChild)
      equipmentSectionSlot.removeChild(equipmentSectionSlot.firstChild);
    equipmentSectionSlot.appendChild(renderEquipmentSection(gameData));

    // ── Unassigned crew section (reconciled with Map) ──
    const unassigned = getUnassignedCrew(ship);

    stagingTitle.textContent = `Unassigned Crew (${unassigned.length})`;
    autoAssignBtn.style.display = ship.crew.length > 0 ? '' : 'none';

    if (unassigned.length === 0) {
      stagingEmptyMsg.style.display = '';
      stagingCrewList.style.display = 'none';
    } else {
      stagingEmptyMsg.style.display = 'none';
      stagingCrewList.style.display = '';

      const currentCrewIds = new Set<string>();

      for (const crew of unassigned) {
        currentCrewIds.add(crew.id);

        const existing = unassignedCrewMap.get(crew.id);
        if (existing) {
          updateUnassignedCrewRow(existing, crew.id, gameData);
        } else {
          const rowRefs = createUnassignedCrewRow(crew.id, gameData);
          unassignedCrewMap.set(crew.id, rowRefs);
          stagingCrewList.appendChild(rowRefs.row);
        }
      }

      // Remove departed crew
      for (const [id, rowRefs] of unassignedCrewMap) {
        if (!currentCrewIds.has(id)) {
          rowRefs.row.remove();
          unassignedCrewMap.delete(id);
        }
      }
    }
  }

  // Initial render
  update(gameData);

  return {
    el: container,
    update,
    setShowNavigation(v: boolean) {
      currentShowNav = v;
    },
  };
}

// ── Status bars (fuel, power, radiation, heat, containment) ──────

/**
 * Render per-ship profitability metrics section
 * Compact single-row layout to prevent vertical expansion
 */
function renderProfitabilitySection(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const performance = getShipPerformance(ship);

  const section = document.createElement('div');
  section.className = 'profitability-section';
  section.style.padding = '0.5rem 0.75rem';
  section.style.marginBottom = '1rem';
  section.style.background = 'rgba(0, 0, 0, 0.3)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';
  section.style.display = 'flex';
  section.style.alignItems = 'center';
  section.style.gap = '1.5rem';
  section.style.flexWrap = 'wrap';
  section.style.fontSize = '0.85rem';

  // Title
  const title = document.createElement('div');
  title.textContent = '📊 Profitability:';
  title.style.fontWeight = 'bold';
  title.style.color = '#4a9eff';
  title.style.whiteSpace = 'nowrap';
  section.appendChild(title);

  // Net Profit (most important metric)
  const profitColor = performance.netProfit >= 0 ? '#4ade80' : '#ff4444';
  const profitSign = performance.netProfit >= 0 ? '+' : '';
  const profitMargin =
    ship.metrics.creditsEarned > 0
      ? (performance.netProfit / ship.metrics.creditsEarned) * 100
      : 0;
  const profitDiv = document.createElement('div');
  profitDiv.style.display = 'flex';
  profitDiv.style.gap = '0.35rem';
  profitDiv.style.alignItems = 'baseline';
  profitDiv.innerHTML = `
    <span style="color: #888; white-space: nowrap;">Net:</span>
    <span style="color: ${profitColor}; font-weight: bold; white-space: nowrap;">
      ${profitSign}${formatCredits(performance.netProfit)}
    </span>
    <span style="color: #666; font-size: 0.8rem; white-space: nowrap;">
      (${profitSign}${profitMargin.toFixed(0)}%)
    </span>
  `;
  section.appendChild(profitDiv);

  // Efficiency
  const effDiv = document.createElement('div');
  effDiv.style.display = 'flex';
  effDiv.style.gap = '0.35rem';
  effDiv.style.alignItems = 'baseline';
  effDiv.innerHTML = `
    <span style="color: #888; white-space: nowrap;">Rate:</span>
    <span style="font-weight: bold; white-space: nowrap;">
      ${formatCredits(Math.round(performance.creditsPerDay))}/day
    </span>
  `;
  section.appendChild(effDiv);

  // Uptime
  const uptimeDiv = document.createElement('div');
  uptimeDiv.style.display = 'flex';
  uptimeDiv.style.gap = '0.35rem';
  uptimeDiv.style.alignItems = 'baseline';
  uptimeDiv.innerHTML = `
    <span style="color: #888; white-space: nowrap;">Uptime:</span>
    <span style="white-space: nowrap;">${performance.uptime.toFixed(0)}%</span>
  `;
  section.appendChild(uptimeDiv);

  // Contracts
  const contractsDiv = document.createElement('div');
  contractsDiv.style.display = 'flex';
  contractsDiv.style.gap = '0.35rem';
  contractsDiv.style.alignItems = 'baseline';
  contractsDiv.innerHTML = `
    <span style="color: #888; white-space: nowrap;">Contracts:</span>
    <span style="white-space: nowrap;">${ship.metrics.contractsCompleted}</span>
  `;
  section.appendChild(contractsDiv);

  return section;
}

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

function renderProvisionsBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const maxProvisions = getMaxProvisionsKg(ship);
  const percentage =
    maxProvisions > 0
      ? Math.min(100, (ship.provisionsKg / maxProvisions) * 100)
      : 0;

  const colorClass = getProvisionsColorClass(percentage);

  const survivalDays = getProvisionsSurvivalDays(ship);
  const survivalLabel =
    ship.crew.length === 0
      ? ''
      : survivalDays < Infinity
        ? ` (${Math.ceil(survivalDays)} days)`
        : '';

  return renderStatBar({
    label: 'PROVISIONS',
    percentage,
    valueLabel: `${formatMass(Math.round(ship.provisionsKg))} / ${formatMass(Math.round(maxProvisions))}${survivalLabel}`,
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
    const netPerHour = oxygenStatus.netChange * TICKS_PER_HOUR;
    const sign = netPerHour >= 0 ? '+' : '';
    valueLabel = `${oxygenStatus.oxygenLevel.toFixed(1)}% (${sign}${netPerHour.toFixed(1)} O2/hr)`;
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
      const itemPerHour = item.output * TICKS_PER_HOUR;
      tooltipParts.push(
        `<div class="custom-tooltip-item">${item.name}: ${itemPerHour.toFixed(1)} O2/hr</div>`
      );
    }
    const genPerHour = oxygenStatus.totalGeneration * TICKS_PER_HOUR;
    tooltipParts.push(
      `<div><span class="custom-tooltip-label">Total Generation:</span> <span class="custom-tooltip-value">${genPerHour.toFixed(1)} O2/hr</span></div>`
    );
  }

  const consumePerHour = oxygenStatus.totalConsumption * TICKS_PER_HOUR;
  tooltipParts.push(
    `<div><span class="custom-tooltip-label">Crew Consumption:</span> <span class="custom-tooltip-value">${consumePerHour.toFixed(1)} O2/hr (${ship.crew.length} crew)</span></div>`
  );

  const tooltipNetPerHour = oxygenStatus.netChange * TICKS_PER_HOUR;
  const sign = tooltipNetPerHour >= 0 ? '+' : '';
  tooltipParts.push(
    `<div><span class="custom-tooltip-label">Net Change:</span> <span class="custom-tooltip-value">${sign}${tooltipNetPerHour.toFixed(1)} O2/hr</span></div>`
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

  if (engineRadiation === 0) {
    return renderStatBar({
      label: 'RADIATION',
      percentage: 0,
      valueLabel: 'N/A',
      colorClass: 'bar-inactive',
      mode: 'full',
    });
  }

  const totalShielding = getEffectiveRadiationShielding(ship);

  // Collect per-item breakdown for tooltip
  const shieldItems: {
    name: string;
    baseShielding: number;
    effective: number;
  }[] = [];
  for (const eq of ship.equipment) {
    const eqDef = getEquipmentDefinition(eq.definitionId);
    if (eqDef?.radiationShielding) {
      const effectiveness = 1 - eq.degradation / 200;
      const effective = eqDef.radiationShielding * effectiveness;
      shieldItems.push({
        name: eqDef.name,
        baseShielding: eqDef.radiationShielding,
        effective,
      });
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

  const statBar = renderStatBar({
    label: 'RADIATION',
    percentage,
    valueLabel,
    colorClass,
    mode: 'full',
  });

  // Build tooltip with radiation breakdown
  const tooltipParts: string[] = [];

  tooltipParts.push(
    `<div><span class="custom-tooltip-label">Engine Output:</span> <span class="custom-tooltip-value">${engineRadiation} rad</span></div>`
  );

  if (shieldItems.length > 0) {
    tooltipParts.push('<div class="custom-tooltip-section">Shielding:</div>');
    for (const item of shieldItems) {
      tooltipParts.push(
        `<div class="custom-tooltip-item">${item.name}: -${item.effective.toFixed(0)} rad (${item.baseShielding} base)</div>`
      );
    }
  } else {
    tooltipParts.push(
      '<div class="custom-tooltip-item" style="color: #ff6b6b;">No radiation shielding installed!</div>'
    );
  }

  tooltipParts.push(
    `<div><span class="custom-tooltip-label">Net Radiation:</span> <span class="custom-tooltip-value" style="color: ${netRadiation > 0 ? '#ff6b6b' : '#4ade80'}">${netRadiation.toFixed(0)} rad</span></div>`
  );

  if (netRadiation > 0 && ship.engine.state === 'online') {
    const dmgPerTick = netRadiation / 100;
    const dmgPerDay = dmgPerTick * TICKS_PER_DAY;
    tooltipParts.push(
      `<div><span class="custom-tooltip-label">Crew Damage:</span> <span class="custom-tooltip-value" style="color: #ff6b6b;">-${dmgPerDay.toFixed(1)} HP/day per crew</span></div>`
    );
    tooltipParts.push(
      '<div class="custom-tooltip-item" style="color: #aaa; font-size: 0.85em;">Medbay patients take 50% reduced damage</div>'
    );
  }

  // Containment status
  const confinementEq = ship.equipment.find(
    (eq) => eq.definitionId === 'mag_confinement'
  );
  if (confinementEq && engineDef.containmentComplexity > 0) {
    const integrity = 100 - confinementEq.degradation;
    const integrityColor =
      confinementEq.degradation > 70
        ? '#ff6b6b'
        : confinementEq.degradation > 30
          ? '#fbbf24'
          : '#4ade80';
    tooltipParts.push(
      `<div style="margin-top: 4px;"><span class="custom-tooltip-label">Containment:</span> <span class="custom-tooltip-value" style="color: ${integrityColor}">${integrity.toFixed(0)}% integrity</span></div>`
    );
    if (confinementEq.degradation > 30) {
      tooltipParts.push(
        '<div class="custom-tooltip-item" style="color: #ff6b6b;">Radiation spikes active! Staff reactor room to slow degradation.</div>'
      );
    }
  }

  attachTooltip(statBar, {
    content: tooltipParts.join(''),
    followMouse: false,
  });

  return statBar;
}

function renderHeatBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const engineHeat = engineDef.wasteHeatOutput || 0;

  if (engineHeat === 0) {
    return renderStatBar({
      label: 'HEAT',
      percentage: 0,
      valueLabel: 'N/A',
      colorClass: 'bar-inactive',
      mode: 'full',
    });
  }

  const totalDissipation = getEffectiveHeatDissipation(ship);
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
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  if (engineDef.containmentComplexity === 0) {
    return renderStatBar({
      label: 'CONTAINMENT',
      percentage: 0,
      valueLabel: 'N/A',
      colorClass: 'bar-inactive',
      mode: 'full',
    });
  }

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

// ── Command bar (captain command bonus) ─────────────────────────

function renderCommandBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const breakdown = getCommandBonusBreakdown(ship, gameData);

  const maxBonus = Math.max(
    breakdown.commerceBonus,
    breakdown.pilotingBonus,
    breakdown.miningBonus
  );
  const percentage = Math.min(100, maxBonus * 100);

  let valueLabel: string;
  let colorClass: string;

  if (breakdown.hasCaptain) {
    valueLabel = `+${Math.round(breakdown.commerceBonus * 100)}% CMD`;
    colorClass = 'bar-command';
  } else if (breakdown.actingCaptainName) {
    valueLabel = `Acting +${Math.round(breakdown.commerceBonus * 100)}%`;
    colorClass = 'bar-command-inactive';
  } else {
    valueLabel = 'No Captain';
    colorClass = 'bar-command-inactive';
  }

  const bar = renderStatBar({
    label: 'COMMAND',
    percentage,
    valueLabel,
    colorClass,
    mode: 'full',
  });

  // Build tooltip content
  let tooltipHtml: string;
  if (breakdown.hasCaptain) {
    tooltipHtml =
      `<b>Captain's Command Bonus</b><br>` +
      `────────────────────────<br>` +
      `Commerce: +${Math.round(breakdown.commerceBonus * 100)}% income (skill ${Math.round(breakdown.commerceBonus * 100)})<br>` +
      `Piloting: +${Math.round(breakdown.pilotingBonus * 100)}% evasion (skill ${Math.round(breakdown.pilotingBonus * 200)})<br>` +
      `Mining: +${Math.round(breakdown.miningBonus * 100)}% extraction (skill ${Math.round(breakdown.miningBonus * 100)})<br>` +
      `────────────────────────<br>` +
      `Training: ${breakdown.trainingMultiplier}× speed<br>` +
      `Negotiate: Available<br>` +
      `Rally: +${breakdown.rallyBonus} defense`;
  } else if (breakdown.actingCaptainName) {
    const auraLabel =
      breakdown.fleetAura > 0
        ? `+${Math.round(breakdown.fleetAura * 100)}%`
        : 'None';
    tooltipHtml =
      `<b>Acting Captain: ${breakdown.actingCaptainName}</b><br>` +
      `────────────────────────<br>` +
      `Commerce: +${Math.round(breakdown.commerceBonus * 100)}% income (25% of full bonus)<br>` +
      `No piloting or mining bonus without captain.<br>` +
      `────────────────────────<br>` +
      `Training: ${breakdown.trainingMultiplier}× speed<br>` +
      `Negotiate: Unavailable<br>` +
      `Rally: —<br>` +
      `Fleet Aura: ${auraLabel}`;
  } else {
    tooltipHtml = `<b>No Command Bonus</b><br>No captain or crew aboard.`;
  }

  attachTooltip(bar, { content: tooltipHtml });

  return bar;
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
  attachTooltip(rangeDiv, {
    content: formatRangeTooltip(engineDef, shipClass, maxRangeKm),
    followMouse: false,
  });
  statsGrid.appendChild(rangeDiv);

  const acceleration = engineDef.thrust / shipClass.mass;
  const accelerationG = acceleration / 9.81;
  const accelDiv = document.createElement('div');
  accelDiv.innerHTML = `<span style="color: #888;">Max Accel:</span> <span style="color: #4ade80;">${accelerationG.toFixed(4)}g</span><br><span style="font-size: 0.75rem; color: #aaa;">(${engineDef.thrust.toLocaleString()} N)</span>`;
  attachTooltip(accelDiv, {
    content: formatAccelerationTooltip(engineDef, shipClass.mass),
    followMouse: false,
  });
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
  attachTooltip(slotsDiv, {
    content: formatEquipmentSlotsTooltip(ship, standardSlots, structuralSlots),
    followMouse: false,
  });
  statsGrid.appendChild(slotsDiv);

  const tierDiv = document.createElement('div');
  const tierColor = getTierColor(shipClass.tier);
  tierDiv.innerHTML = `<span style="color: #888;">Class:</span> <span style="color: ${tierColor}; font-weight: bold;">${shipClass.tier}</span><br><span style="font-size: 0.75rem; color: #aaa;">${shipClass.name}</span>`;
  statsGrid.appendChild(tierDiv);

  const massDiv = document.createElement('div');
  massDiv.innerHTML = `<span style="color: #888;">Ship Mass:</span> <span style="color: #aaa;">${(shipClass.mass / 1000).toFixed(0)} tons</span>`;
  attachTooltip(massDiv, {
    content: formatShipMassTooltip(ship, shipClass),
    followMouse: false,
  });
  statsGrid.appendChild(massDiv);

  const crewDiv = document.createElement('div');
  crewDiv.innerHTML = `<span style="color: #888;">Crew:</span> <span style="color: #aaa;">${ship.crew.length}/${shipClass.maxCrew}</span>`;
  attachTooltip(crewDiv, {
    content: formatCrewCountTooltip(ship, shipClass),
    followMouse: false,
  });
  statsGrid.appendChild(crewDiv);

  // Defense readiness derived from equipment, crew, and mass
  const defenseScore = calculateDefenseScore(ship);
  const defenseColor =
    defenseScore >= 20 ? '#4ade80' : defenseScore >= 10 ? '#facc15' : '#f87171';
  const defenseBreakdown: string[] = [];
  const pdLaser = ship.equipment.find(
    (eq) => eq.definitionId === 'point_defense_laser'
  );
  const pd = ship.equipment.find((eq) => eq.definitionId === 'point_defense');
  const microDefl = ship.equipment.find(
    (eq) => eq.definitionId === 'micro_deflector'
  );
  const deflector = ship.equipment.find(
    (eq) => eq.definitionId === 'deflector_shield'
  );
  if (pd) defenseBreakdown.push('PD-40 Flak Turret');
  if (pdLaser) defenseBreakdown.push('PD-10 Laser');
  if (deflector) defenseBreakdown.push('Debris Deflector');
  if (microDefl) defenseBreakdown.push('Micro Deflector');
  const defenseDiv = document.createElement('div');
  const defenseTooltip =
    defenseBreakdown.length > 0
      ? defenseBreakdown.join(', ') +
        ` + hull mass (${(shipClass.mass / 1000).toFixed(0)}t)`
      : 'No defense equipment installed';
  defenseDiv.innerHTML = `<span style="color: #888;">Defense:</span> <span style="color: ${defenseColor}; font-weight: bold;">${defenseScore.toFixed(1)}</span><br><span style="font-size: 0.75rem; color: #aaa;">${defenseBreakdown.length > 0 ? defenseBreakdown.join(' + ') : 'None'}</span>`;
  defenseDiv.title = defenseTooltip;
  statsGrid.appendChild(defenseDiv);

  // Command bonus card
  const cmdBreakdown = getCommandBonusBreakdown(ship, gameData);
  const cmdDiv = document.createElement('div');
  if (cmdBreakdown.hasCaptain) {
    const cPct = Math.round(cmdBreakdown.commerceBonus * 100);
    const pPct = Math.round(cmdBreakdown.pilotingBonus * 100);
    const mPct = Math.round(cmdBreakdown.miningBonus * 100);
    cmdDiv.innerHTML =
      `<span style="color: #888;">Command:</span> <span style="color: #fbbf24; font-weight: bold;">CPT ${cmdBreakdown.captainName} ✦</span><br>` +
      `<span style="font-size: 0.75rem; color: #fbbf24;">+${cPct}% income · +${pPct}% evasion · +${mPct}% yield</span><br>` +
      `<span style="font-size: 0.75rem; color: #fbbf24;">${cmdBreakdown.trainingMultiplier}× training · Rally +${cmdBreakdown.rallyBonus} · Negotiate ✓</span>`;
    cmdDiv.title = `Captain's Command Bonus: Commerce +${cPct}%, Piloting +${pPct}%, Mining +${mPct}%, Training ${cmdBreakdown.trainingMultiplier}×, Rally +${cmdBreakdown.rallyBonus}, Negotiate ✓`;
  } else if (cmdBreakdown.actingCaptainName) {
    const cPct = Math.round(cmdBreakdown.commerceBonus * 100);
    const auraLabel =
      cmdBreakdown.fleetAura > 0
        ? `Aura +${Math.round(cmdBreakdown.fleetAura * 100)}%`
        : 'No aura';
    const trainLabel =
      cmdBreakdown.trainingMultiplier > 1.0
        ? `${cmdBreakdown.trainingMultiplier}× training`
        : '1× training';
    cmdDiv.innerHTML =
      `<span style="color: #888;">Command:</span> <span style="color: #6b7280;">ACT ${cmdBreakdown.actingCaptainName}</span><br>` +
      `<span style="font-size: 0.75rem; color: #6b7280;">+${cPct}% income · Piloting — · Mining —</span><br>` +
      `<span style="font-size: 0.75rem; color: #6b7280;">${trainLabel} · Rally — · Negotiate ✗ · ${auraLabel}</span>`;
    cmdDiv.title = `Acting Captain provides reduced commerce bonus only. ${auraLabel} from captain proximity.`;
  } else {
    cmdDiv.innerHTML =
      `<span style="color: #888;">Command:</span> <span style="color: #6b7280;">None</span><br>` +
      `<span style="font-size: 0.75rem; color: #6b7280;">No command bonus active</span>`;
    cmdDiv.title = 'No captain or crew aboard to provide command bonuses';
  }
  statsGrid.appendChild(cmdDiv);

  section.appendChild(statsGrid);
  return section;
}

// ── Engine slot (leaf helper, rendered via slot pattern in room card) ──

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
    if (!equipment.powered) {
      item.style.opacity = '0.6';
    }

    const icon = document.createElement('div');
    icon.className = 'equipment-icon';
    icon.textContent = equipDef.icon;
    item.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'equipment-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'equipment-name';
    nameRow.style.display = 'flex';
    nameRow.style.alignItems = 'center';
    nameRow.style.gap = '0.4em';

    // Power indicator dot
    const powerDot = document.createElement('span');
    powerDot.style.display = 'inline-block';
    powerDot.style.width = '8px';
    powerDot.style.height = '8px';
    powerDot.style.borderRadius = '50%';
    powerDot.style.flexShrink = '0';
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
    powerRow.style.display = 'flex';
    powerRow.style.alignItems = 'center';
    powerRow.style.gap = '0.5em';
    powerRow.style.marginTop = '0.15em';

    const power = document.createElement('span');
    power.className = 'equipment-power';
    power.textContent = `${equipDef.powerDraw} kW`;
    powerRow.appendChild(power);

    // 3-state power mode toggle: Off / Auto / On
    const modeToggle = document.createElement('div');
    modeToggle.style.display = 'inline-flex';
    modeToggle.style.borderRadius = '3px';
    modeToggle.style.overflow = 'hidden';
    modeToggle.style.border = '1px solid rgba(255,255,255,0.15)';
    modeToggle.style.fontSize = '0.7em';
    modeToggle.style.marginLeft = 'auto';

    const modes: { label: string; value: EquipmentPowerMode }[] = [
      { label: 'Off', value: 'off' },
      { label: 'Auto', value: 'auto' },
      { label: 'On', value: 'on' },
    ];

    for (const mode of modes) {
      const btn = document.createElement('button');
      btn.textContent = mode.label;
      btn.style.border = 'none';
      btn.style.padding = '2px 6px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = 'inherit';
      btn.style.minWidth = '32px';

      if (equipment.powerMode === mode.value) {
        btn.style.background =
          mode.value === 'off'
            ? '#666'
            : mode.value === 'auto'
              ? '#0f3460'
              : '#2e7d32';
        btn.style.color = '#eee';
        btn.style.fontWeight = 'bold';
      } else {
        btn.style.background = 'rgba(0,0,0,0.3)';
        btn.style.color = '#888';
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mode.value === 'on') {
          const check = canSetPowerModeOn(ship, gameData, equipment.id);
          if (!check.allowed) {
            // Brief visual feedback — flash the button red
            btn.style.background = '#8b0000';
            btn.title = check.reason ?? 'Insufficient power';
            setTimeout(() => {
              btn.style.background = 'rgba(0,0,0,0.3)';
            }, 600);
            return;
          }
        }
        equipment.powerMode = mode.value;
      });

      modeToggle.appendChild(btn);
    }

    // Tooltip showing the AI rule description
    const ruleDesc = getPowerRuleDescription(equipment.definitionId);
    const modeLabel =
      equipment.powerMode === 'auto'
        ? `Auto: ${ruleDesc}`
        : equipment.powerMode === 'on'
          ? 'Forced on (manual)'
          : 'Forced off (manual)';
    attachTooltip(modeToggle, { content: modeLabel, followMouse: false });

    powerRow.appendChild(modeToggle);
    info.appendChild(powerRow);

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
      degradationBar.style.marginTop = '0.25em';
      info.appendChild(degradationBar);
    }

    equipmentList.appendChild(item);
  }

  section.appendChild(equipmentList);

  return section;
}

// ── Helpers ──────────────────────────────────────────────────────

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
