import type { GameData, Room, CrewMember } from '../models';
import { getActiveShip } from '../models';
import { getShipClass } from '../shipClasses';
import { getRoomDefinition } from '../rooms';
import { getCrewRoleName, getCrewRoleDefinition } from '../crewRoles';
import { computePowerStatus } from '../powerSystem';
import { getEquipmentDefinition } from '../equipment';
import { getEngineDefinition } from '../engines';
import { renderNavigationView } from './navigationView';
import { getGravitySource } from '../gravitySystem';
import { computeMaxRange } from '../flightPhysics';
import { formatDualTime, GAME_SECONDS_PER_TICK } from '../timeSystem';

export interface ShipTabCallbacks {
  onCrewAssign: (crewId: string, roomId: string) => void;
  onCrewUnassign: (crewId: string, roomId: string) => void;
  onUndock: () => void;
  onDock: () => void;
  onEngineOn: () => void;
  onEngineOff: () => void;
  onToggleNavigation: () => void;
  onBuyFuel: () => void;
  onStartTrip: (destinationId: string) => void;
  onBuyShip?: (classId: string, shipName: string) => void;
}

export function renderShipTab(
  gameData: GameData,
  showNavigation: boolean,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ship-tab';

  // If navigation is open, show navigation view instead
  if (showNavigation) {
    return renderNavigationView(gameData, {
      onToggleNavigation: callbacks.onToggleNavigation,
      onStartTrip: callbacks.onStartTrip,
    });
  }

  // Fuel progress bar
  container.appendChild(renderFuelBar(gameData));

  // Power progress bar
  container.appendChild(renderPowerBar(gameData));

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

  // Ship stats panel
  container.appendChild(renderShipStatsPanel(gameData));

  // Room grid
  container.appendChild(renderRoomGrid(gameData, callbacks));

  // Gravity status panel
  container.appendChild(renderGravityStatus(gameData));

  // Equipment section
  container.appendChild(renderEquipmentSection(gameData));

  // Staging area (unassigned crew)
  container.appendChild(renderStagingArea(gameData, callbacks));

  return container;
}

function renderFuelBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const fuel = ship.fuel;
  let colorClass = 'bar-good';
  if (fuel <= 20) {
    colorClass = 'bar-danger';
  } else if (fuel <= 50) {
    colorClass = 'bar-warning';
  }

  return renderProgressBar('FUEL', fuel, `${fuel.toFixed(1)}%`, colorClass);
}

function renderPowerBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const powerStatus = computePowerStatus(ship);

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

  let colorClass = 'bar-good';
  if (powerStatus.isOverloaded) {
    colorClass = 'bar-danger';
  } else if (powerStatus.percentage >= 80) {
    colorClass = 'bar-warning';
  }

  const valueLabel =
    powerStatus.totalOutput > 0
      ? `${powerStatus.totalDraw}/${powerStatus.totalOutput} kW (${powerStatus.percentage.toFixed(0)}%)`
      : '0 kW (NO POWER)';

  return renderProgressBar(
    label,
    powerStatus.percentage,
    valueLabel,
    colorClass
  );
}

function renderRadiationBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const engineRadiation = engineDef.radiationOutput || 0;

  // Calculate total shielding
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

  return renderProgressBar('RADIATION', percentage, valueLabel, colorClass);
}

function renderHeatBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const engineHeat = engineDef.wasteHeatOutput || 0;

  // Calculate total heat dissipation
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

  return renderProgressBar('HEAT', percentage, valueLabel, colorClass);
}

function renderContainmentBar(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const confinementEq = ship.equipment.find(
    (eq) => eq.definitionId === 'mag_confinement'
  );

  if (!confinementEq) {
    return renderProgressBar(
      'CONTAINMENT',
      0,
      'NO CONFINEMENT UNIT',
      'bar-danger'
    );
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
    reactorRoom && reactorRoom.assignedCrewIds.length === 0
      ? ' [UNSTAFFED]'
      : '';

  const valueLabel = `${integrity.toFixed(0)}% integrity${staffingNote}`;

  return renderProgressBar('CONTAINMENT', integrity, valueLabel, colorClass);
}

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
  statsGrid.style.display = 'grid';
  statsGrid.style.gridTemplateColumns = '1fr 1fr';
  statsGrid.style.gap = '0.5rem';
  statsGrid.style.fontSize = '0.85rem';

  // Max Range
  const maxRangeKm = computeMaxRange(shipClass, engineDef);
  const rangeLabel = getRangeLabel(maxRangeKm);
  const rangeDiv = document.createElement('div');
  rangeDiv.innerHTML = `<span style="color: #888;">Max Range:</span> <span style="color: #4ade80; font-weight: bold;">${formatLargeNumber(maxRangeKm)} km</span><br><span style="font-size: 0.75rem; color: #aaa;">(${rangeLabel})</span>`;
  rangeDiv.title = `Derived from: Engine (${engineDef.name}) + Ship Mass (${(shipClass.mass / 1000).toFixed(0)}t) + Consumables`;
  statsGrid.appendChild(rangeDiv);

  // Max Acceleration
  const acceleration = engineDef.thrust / shipClass.mass;
  const accelerationG = acceleration / 9.81;
  const accelDiv = document.createElement('div');
  accelDiv.innerHTML = `<span style="color: #888;">Max Accel:</span> <span style="color: #4ade80;">${accelerationG.toFixed(4)}g</span><br><span style="font-size: 0.75rem; color: #aaa;">(${engineDef.thrust.toLocaleString()} N)</span>`;
  accelDiv.title = `Thrust (${engineDef.thrust} N) / Ship Mass (${shipClass.mass} kg)`;
  statsGrid.appendChild(accelDiv);

  // Equipment Slots
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

  // Ship Class & Tier
  const tierDiv = document.createElement('div');
  const tierColor = getTierColor(shipClass.tier);
  tierDiv.innerHTML = `<span style="color: #888;">Class:</span> <span style="color: ${tierColor}; font-weight: bold;">${shipClass.tier}</span><br><span style="font-size: 0.75rem; color: #aaa;">${shipClass.name}</span>`;
  statsGrid.appendChild(tierDiv);

  // Ship Mass
  const massDiv = document.createElement('div');
  massDiv.innerHTML = `<span style="color: #888;">Ship Mass:</span> <span style="color: #aaa;">${(shipClass.mass / 1000).toFixed(0)} tons</span><br><span style="font-size: 0.75rem; color: #aaa;">(${shipClass.mass.toLocaleString()} kg)</span>`;
  massDiv.title = 'Affects acceleration and fuel consumption';
  statsGrid.appendChild(massDiv);

  // Crew Capacity
  const assignedCrewCount = ship.crew.length;
  const crewDiv = document.createElement('div');
  crewDiv.innerHTML = `<span style="color: #888;">Crew:</span> <span style="color: #aaa;">${assignedCrewCount}/${shipClass.maxCrew}</span>`;
  statsGrid.appendChild(crewDiv);

  section.appendChild(statsGrid);
  return section;
}

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

function renderProgressBar(
  label: string,
  percentage: number,
  valueLabel: string,
  colorClass: string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'progress-bar-container';

  const header = document.createElement('div');
  header.className = 'progress-bar-header';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;

  const valueSpan = document.createElement('span');
  valueSpan.textContent = valueLabel;

  header.appendChild(labelSpan);
  header.appendChild(valueSpan);
  container.appendChild(header);

  const track = document.createElement('div');
  track.className = 'progress-bar-track';

  const fill = document.createElement('div');
  fill.className = `progress-bar-fill ${colorClass}`;
  fill.style.width = `${Math.min(100, percentage)}%`;

  track.appendChild(fill);
  container.appendChild(track);

  return container;
}

function renderRoomGrid(
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const grid = document.createElement('div');
  grid.className = 'room-grid';

  for (const room of ship.rooms) {
    grid.appendChild(renderRoomCard(room, gameData, callbacks));
  }

  return grid;
}

function renderRoomCard(
  room: Room,
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const roomDef = getRoomDefinition(room.type);
  const assignedCrew = room.assignedCrewIds
    .map((id) => ship.crew.find((c) => c.id === id))
    .filter((c): c is CrewMember => c !== undefined);

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

  // Engine room shows equipped engine
  if (room.type === 'engine_room') {
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

    // Engine specs
    const engineSpecs = document.createElement('div');
    engineSpecs.className = 'equipment-item-specs';
    engineSpecs.style.fontSize = '0.75rem';
    engineSpecs.style.color = '#888';
    engineSpecs.style.marginTop = '0.25rem';
    const shipClass = getShipClass(ship.classId);
    const acceleration = shipClass ? engineDef.thrust / shipClass.mass : 0;
    const accelerationG = acceleration / 9.81;
    engineSpecs.innerHTML = `Thrust: ${(engineDef.thrust / 1000).toFixed(1)}kN | Accel: ${accelerationG.toFixed(4)}g | ΔV: ${(engineDef.maxDeltaV / 1000).toFixed(0)}km/s`;
    engineSpecs.title = `Thrust: ${engineDef.thrust.toLocaleString()} N\nAcceleration on this ship: ${accelerationG.toFixed(4)}g\nDelta-V Budget: ${engineDef.maxDeltaV.toLocaleString()} m/s`;
    engineInfo.appendChild(engineSpecs);

    // Engine state indicator
    const engineState = document.createElement('div');
    engineState.className = 'equipment-item-state';
    if (ship.engine.state === 'off') {
      engineState.textContent = '⚫ OFF';
      engineState.style.color = '#ff6b6b';
    } else if (ship.engine.state === 'warming_up') {
      engineState.textContent = `🟡 WARMING ${ship.engine.warmupProgress.toFixed(0)}%`;
      engineState.style.color = '#ffc107';
    } else {
      engineState.textContent = '🟢 ONLINE';
      engineState.style.color = '#4caf50';
    }
    engineInfo.appendChild(engineState);

    engineItem.appendChild(engineInfo);
    equipmentSlot.appendChild(engineItem);

    // Engine controls (on/off button)
    const isDocked = ship.location.status === 'docked';
    const bridgeRoom = ship.rooms.find((r) => r.type === 'bridge');
    const hasControlCrew =
      assignedCrew.length > 0 ||
      (bridgeRoom && bridgeRoom.assignedCrewIds.length > 0);

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
      warning.textContent = 'Bridge or Engine Room must be staffed';
      equipmentSlot.appendChild(warning);
    }

    roomCard.appendChild(equipmentSlot);

    // Show warmup progress bar if warming up
    if (ship.engine.state === 'warming_up') {
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const remainingPercent = 100 - ship.engine.warmupProgress;
      const ticksRemaining = remainingPercent / engineDef.warmupRate;
      const gameSecondsRemaining = ticksRemaining * GAME_SECONDS_PER_TICK;
      const timeLabel = formatDualTime(gameSecondsRemaining);

      const warmupBar = renderProgressBar(
        'WARMUP',
        ship.engine.warmupProgress,
        `${ship.engine.warmupProgress.toFixed(0)}% - ${timeLabel} remaining`,
        'bar-good'
      );
      warmupBar.style.fontSize = '0.85em';
      warmupBar.style.marginTop = '0.5em';
      roomCard.appendChild(warmupBar);
    }
  }

  // Cargo hold is automated
  if (room.type === 'cargo_hold') {
    const automatedMsg = document.createElement('div');
    automatedMsg.className = 'room-automated';
    automatedMsg.textContent = 'Automated';
    roomCard.appendChild(automatedMsg);

    const shipClass = getShipClass(ship.classId);
    const maxCapacity = shipClass?.cargoCapacity ?? 0;

    // For now, estimate cargo weight: assume each item is ~100 kg
    // TODO: Add actual weight property to equipment definitions
    const currentCargo = ship.cargo.length * 100;
    const cargoPercent =
      maxCapacity > 0 ? (currentCargo / maxCapacity) * 100 : 0;

    const capacity = document.createElement('div');
    capacity.className = 'room-cargo-capacity';
    capacity.textContent = `Cargo: ${currentCargo.toLocaleString()} / ${maxCapacity.toLocaleString()} kg`;
    roomCard.appendChild(capacity);

    // Progress bar
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
  crewCount.textContent = `${assignedCrew.length}/${roomDef?.maxCrew ?? 0}`;
  roomCard.appendChild(crewCount);

  // Assigned crew list
  const crewList = document.createElement('div');
  crewList.className = 'room-crew-list';

  if (assignedCrew.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'room-crew-empty';
    emptyMsg.textContent = 'No crew assigned';
    crewList.appendChild(emptyMsg);
  } else {
    for (const crew of assignedCrew) {
      const crewItem = document.createElement('div');
      crewItem.className = 'room-crew-item';

      const crewName = document.createElement('span');
      crewName.className = 'crew-name-short';

      // Add captain badge if applicable
      if (crew.isCaptain) {
        const captainBadge = document.createElement('span');
        captainBadge.className = 'captain-badge';
        captainBadge.textContent = 'CPT ';
        crewName.appendChild(captainBadge);
      }

      const nameText = document.createTextNode(crew.name.split(' ')[0]);
      crewName.appendChild(nameText);

      // Check if crew is in preferred room
      const crewRoleDef = getCrewRoleDefinition(crew.role);
      const isPreferred = crewRoleDef?.preferredRoom === room.type;
      if (isPreferred) {
        const star = document.createElement('span');
        star.className = 'preferred-star';
        star.textContent = ' ★';
        star.title = 'Crew in preferred room';
        crewName.appendChild(star);
      }

      crewItem.appendChild(crewName);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'small-button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () =>
        callbacks.onCrewUnassign(crew.id, room.id)
      );
      crewItem.appendChild(removeBtn);

      crewList.appendChild(crewItem);
    }
  }

  roomCard.appendChild(crewList);

  // Add crew dropdown (only if below max capacity)
  if (roomDef && assignedCrew.length < roomDef.maxCrew) {
    const unassignedCrew = getUnassignedCrew(gameData);
    if (unassignedCrew.length > 0) {
      const addCrewSection = document.createElement('div');
      addCrewSection.className = 'room-add-crew';

      const select = document.createElement('select');
      select.className = 'crew-select';

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Assign crew...';
      select.appendChild(defaultOption);

      for (const crew of unassignedCrew) {
        const option = document.createElement('option');
        option.value = crew.id;
        const captainPrefix = crew.isCaptain ? 'CPT ' : '';
        option.textContent = `${captainPrefix}${crew.name} (${getCrewRoleName(crew.role)})`;
        select.appendChild(option);
      }

      select.addEventListener('change', (e) => {
        const crewId = (e.target as HTMLSelectElement).value;
        if (crewId) {
          callbacks.onCrewAssign(crewId, room.id);
        }
      });

      addCrewSection.appendChild(select);
      roomCard.appendChild(addCrewSection);
    }
  }

  // Bridge-specific actions: Navigation
  if (room.type === 'bridge') {
    const bridgeActions = document.createElement('div');
    bridgeActions.className = 'room-actions';

    const navBtn = document.createElement('button');
    navBtn.className = 'room-action-btn';
    navBtn.textContent = '🗺️ Navigation';
    navBtn.disabled = assignedCrew.length === 0;
    if (assignedCrew.length === 0) {
      navBtn.title = 'Bridge must be staffed to access navigation';
    }
    navBtn.addEventListener('click', callbacks.onToggleNavigation);
    bridgeActions.appendChild(navBtn);

    roomCard.appendChild(bridgeActions);
  }

  return roomCard;
}

function renderGravityStatus(gameData: GameData): HTMLElement {
  const ship = getActiveShip(gameData);
  const section = document.createElement('div');
  section.className = 'gravity-status-section';

  const title = document.createElement('h3');
  title.textContent = 'Gravity Status';
  section.appendChild(title);

  const gravitySource = getGravitySource(ship);

  // Source line
  const sourceLine = document.createElement('div');
  sourceLine.className = 'gravity-line';

  const sourceLabel = document.createElement('span');
  sourceLabel.textContent = 'Source: ';
  sourceLine.appendChild(sourceLabel);

  const sourceValue = document.createElement('span');
  if (gravitySource.type === 'rotating_habitat') {
    sourceValue.textContent = 'Rotating Habitat';
    sourceValue.style.color = '#4ade80'; // green
  } else if (gravitySource.type === 'centrifuge') {
    sourceValue.textContent = 'Centrifuge Pod';
    sourceValue.style.color = '#4ade80'; // green
  } else if (gravitySource.type === 'thrust' && gravitySource.thrustG) {
    sourceValue.textContent = `Thrust (${gravitySource.thrustG.toFixed(2)}g)`;
    sourceValue.style.color = '#fbbf24'; // yellow
  } else {
    sourceValue.textContent = 'None';
    sourceValue.style.color = '#f87171'; // red
  }
  sourceLine.appendChild(sourceValue);
  section.appendChild(sourceLine);

  // Exposure rate line
  const exposureLine = document.createElement('div');
  exposureLine.className = 'gravity-line';

  const exposureLabel = document.createElement('span');
  exposureLabel.textContent = 'Exposure Rate: ';
  exposureLine.appendChild(exposureLabel);

  const exposureValue = document.createElement('span');

  // Calculate exposure rate
  let rate = 100; // base 100%

  if (
    gravitySource.type === 'rotating_habitat' ||
    gravitySource.type === 'centrifuge'
  ) {
    rate = 0;
    exposureValue.textContent = '0%';
    exposureValue.style.color = '#4ade80'; // green
  } else {
    // Check for thrust reduction
    if (gravitySource.type === 'thrust' && gravitySource.thrustG) {
      const reduction = Math.min(100, gravitySource.thrustG * 100);
      rate = Math.max(0, 100 - reduction);
    }

    // Check for exercise module
    const hasExerciseModule = ship.equipment.some((eq) => {
      const def = getEquipmentDefinition(eq.definitionId);
      return def?.id === 'exercise_module';
    });

    if (hasExerciseModule) {
      rate *= 0.5;
    }

    // Count crew with g_seats (just for display info)
    const crewWithGSeats = ship.crew.filter((crew) =>
      crew.equipment.some((eq) => eq.definitionId === 'g_seat')
    ).length;

    exposureValue.textContent = `${rate.toFixed(0)}%`;

    if (rate === 0) {
      exposureValue.style.color = '#4ade80'; // green
    } else if (rate <= 50) {
      exposureValue.style.color = '#fbbf24'; // yellow
    } else {
      exposureValue.style.color = '#f87171'; // red
    }

    // Add modifiers note
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

    // Degradation bar (if applicable)
    if (equipDef.hasDegradation) {
      const degradationBar = renderProgressBar(
        'Wear',
        equipment.degradation,
        `${equipment.degradation.toFixed(1)}%`,
        equipment.degradation >= 75
          ? 'bar-danger'
          : equipment.degradation >= 50
            ? 'bar-warning'
            : 'bar-good'
      );
      degradationBar.style.fontSize = '0.85em';
      degradationBar.style.marginTop = '0.5em';
      item.appendChild(degradationBar);
    }

    equipmentList.appendChild(item);
  }

  section.appendChild(equipmentList);

  return section;
}

function renderStagingArea(
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const unassignedCrew = getUnassignedCrew(gameData);

  const staging = document.createElement('div');
  staging.className = 'staging-area';

  const title = document.createElement('h3');
  title.textContent = 'Unassigned Crew';
  staging.appendChild(title);

  if (unassignedCrew.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'staging-empty';
    emptyMsg.textContent = 'All crew members are assigned to rooms.';
    staging.appendChild(emptyMsg);
  } else {
    const crewList = document.createElement('div');
    crewList.className = 'staging-crew-list';

    for (const crew of unassignedCrew) {
      const crewRow = document.createElement('div');
      crewRow.className = 'staging-crew-row';

      const crewInfo = document.createElement('div');
      crewInfo.className = 'staging-crew-info';

      const name = document.createElement('div');
      name.className = 'staging-crew-name';
      if (crew.isCaptain) {
        const captainBadge = document.createElement('span');
        captainBadge.className = 'captain-badge';
        captainBadge.textContent = 'CPT ';
        name.appendChild(captainBadge);
      }
      name.appendChild(document.createTextNode(crew.name));
      crewInfo.appendChild(name);

      const role = document.createElement('div');
      role.className = 'staging-crew-role';
      role.textContent = getCrewRoleName(crew.role);
      crewInfo.appendChild(role);

      const stats = document.createElement('div');
      stats.className = 'staging-crew-stats';
      stats.innerHTML = `<span class="stat health">HP: ${crew.health}</span><span class="stat morale">M: ${crew.morale}</span><span class="stat level">Lv: ${crew.level}</span>`;
      crewInfo.appendChild(stats);

      const skills = document.createElement('div');
      skills.className = 'staging-crew-skills';
      skills.innerHTML = `<span class="skill">STR: ${crew.skills.strength}</span><span class="skill">LOY: ${crew.skills.loyalty}</span><span class="skill">CHA: ${crew.skills.charisma}</span>`;
      crewInfo.appendChild(skills);

      crewRow.appendChild(crewInfo);

      // Room assignment dropdown
      const assignSection = document.createElement('div');
      assignSection.className = 'staging-crew-assign';

      const select = document.createElement('select');
      select.className = 'crew-select';

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Assign to room...';
      select.appendChild(defaultOption);

      for (const room of ship.rooms) {
        const roomDef = getRoomDefinition(room.type);
        if (!roomDef) continue;

        // Skip cargo hold (maxCrew is 0)
        if (roomDef.maxCrew === 0) continue;

        const assignedCount = room.assignedCrewIds.length;
        if (assignedCount >= roomDef.maxCrew) continue; // Room full

        const option = document.createElement('option');
        option.value = room.id;
        option.textContent = `${roomDef.name} (${assignedCount}/${roomDef.maxCrew})`;
        select.appendChild(option);
      }

      select.addEventListener('change', (e) => {
        const roomId = (e.target as HTMLSelectElement).value;
        if (roomId) {
          callbacks.onCrewAssign(crew.id, roomId);
        }
      });

      assignSection.appendChild(select);
      crewRow.appendChild(assignSection);

      crewList.appendChild(crewRow);
    }

    staging.appendChild(crewList);
  }

  return staging;
}

function getUnassignedCrew(gameData: GameData): CrewMember[] {
  const ship = getActiveShip(gameData);
  const assignedIds = new Set<string>();
  for (const room of ship.rooms) {
    for (const crewId of room.assignedCrewIds) {
      assignedIds.add(crewId);
    }
  }

  return ship.crew.filter((crew) => !assignedIds.has(crew.id));
}
