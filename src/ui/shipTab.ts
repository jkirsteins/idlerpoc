import type { GameData, Room, CrewMember } from '../models';
import { getShipClass } from '../shipClasses';
import { getRoomDefinition } from '../rooms';
import { getCrewRoleName, getCrewRoleDefinition } from '../crewRoles';
import { computePowerStatus } from '../powerSystem';
import { getEquipmentDefinition } from '../equipment';
import { getEngineDefinition } from '../engines';
import { renderNavigationView } from './navigationView';

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

  // Ship status banner
  container.appendChild(renderStatusBanner(gameData, callbacks));

  // Ship specs panel
  container.appendChild(renderShipSpecs(gameData));

  // Status bar (credits, crew)
  container.appendChild(renderStatusBar(gameData));

  // Fuel progress bar
  container.appendChild(renderFuelBar(gameData));

  // Power progress bar
  container.appendChild(renderPowerBar(gameData));

  // Room grid
  container.appendChild(renderRoomGrid(gameData, callbacks));

  // Equipment section
  container.appendChild(renderEquipmentSection(gameData));

  // Staging area (unassigned crew)
  container.appendChild(renderStagingArea(gameData, callbacks));

  return container;
}

function renderStatusBanner(
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'ship-status-banner';

  const statusText = document.createElement('div');
  statusText.className = 'status-text';

  if (gameData.ship.location.status === 'docked') {
    const dockedAt = gameData.ship.location.dockedAt;
    const location = gameData.world.locations.find((l) => l.id === dockedAt);
    const locationName = location?.name || dockedAt;
    statusText.textContent = `Docked at ${locationName}`;
  } else {
    // Show destination if we have flight data
    if (gameData.ship.location.flight) {
      const destId = gameData.ship.location.flight.destination;
      const destLocation = gameData.world.locations.find(
        (l) => l.id === destId
      );
      const destName = destLocation?.name || destId;
      statusText.textContent = `In flight to ${destName}`;
    } else {
      statusText.textContent = 'In flight';
    }
  }

  banner.appendChild(statusText);

  const actionBtn = document.createElement('button');
  actionBtn.className = 'status-action-btn';

  if (gameData.ship.location.status === 'docked') {
    actionBtn.textContent = 'Undock';
    actionBtn.addEventListener('click', callbacks.onUndock);
  } else {
    actionBtn.textContent = 'Dock';
    actionBtn.addEventListener('click', callbacks.onDock);
  }

  banner.appendChild(actionBtn);

  // Add Buy Fuel button when docked at a refuel station
  if (gameData.ship.location.status === 'docked') {
    const dockedAt = gameData.ship.location.dockedAt;
    const location = gameData.world.locations.find((l) => l.id === dockedAt);

    if (location?.services.includes('refuel') && gameData.ship.fuel < 100) {
      const refuelBtn = document.createElement('button');
      refuelBtn.className = 'refuel-btn';
      refuelBtn.textContent = `Buy Fuel (${Math.round(100 - gameData.ship.fuel)}% → 500 credits)`;
      refuelBtn.addEventListener('click', callbacks.onBuyFuel);
      banner.appendChild(refuelBtn);
    }
  }

  return banner;
}

function renderShipSpecs(gameData: GameData): HTMLElement {
  const shipClass = getShipClass(gameData.ship.classId);
  if (!shipClass) {
    return document.createElement('div');
  }

  const engineDef = getEngineDefinition(gameData.ship.engine.definitionId);

  const specs = document.createElement('div');
  specs.className = 'ship-specs';

  const specItems = [
    { label: 'Engine', value: engineDef.name },
    { label: 'Engine Type', value: engineDef.type },
    { label: 'Fuel Type', value: engineDef.fuelType },
    { label: 'Max Range', value: shipClass.maxRange },
    { label: 'Cargo Capacity', value: `${shipClass.cargoCapacity} SU` },
    { label: 'Equipment Slots', value: `${shipClass.equipmentSlots}` },
  ];

  for (const item of specItems) {
    const specItem = document.createElement('div');
    specItem.className = 'spec-item';

    const label = document.createElement('div');
    label.className = 'spec-label';
    label.textContent = item.label;

    const value = document.createElement('div');
    value.className = 'spec-value';
    value.textContent = item.value;

    specItem.appendChild(label);
    specItem.appendChild(value);
    specs.appendChild(specItem);
  }

  return specs;
}

function renderStatusBar(gameData: GameData): HTMLElement {
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';

  const credits = document.createElement('div');
  credits.className = 'status-item';
  credits.innerHTML = `<span class="status-label">Credits:</span><span class="status-value">${gameData.ship.credits}</span>`;
  statusBar.appendChild(credits);

  const crewCount = document.createElement('div');
  crewCount.className = 'status-item';
  const shipClass = getShipClass(gameData.ship.classId);
  const maxCrew = shipClass?.maxCrew ?? '?';
  crewCount.innerHTML = `<span class="status-label">Crew:</span><span class="status-value">${gameData.ship.crew.length}/${maxCrew}</span>`;
  statusBar.appendChild(crewCount);

  return statusBar;
}

function renderFuelBar(gameData: GameData): HTMLElement {
  const fuel = gameData.ship.fuel;
  let colorClass = 'bar-good';
  if (fuel <= 20) {
    colorClass = 'bar-danger';
  } else if (fuel <= 50) {
    colorClass = 'bar-warning';
  }

  return renderProgressBar('FUEL', fuel, `${fuel.toFixed(1)}%`, colorClass);
}

function renderPowerBar(gameData: GameData): HTMLElement {
  const powerStatus = computePowerStatus(gameData.ship);

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
  const grid = document.createElement('div');
  grid.className = 'room-grid';

  for (const room of gameData.ship.rooms) {
    grid.appendChild(renderRoomCard(room, gameData, callbacks));
  }

  return grid;
}

function renderRoomCard(
  room: Room,
  gameData: GameData,
  callbacks: ShipTabCallbacks
): HTMLElement {
  const roomDef = getRoomDefinition(room.type);
  const assignedCrew = room.assignedCrewIds
    .map((id) => gameData.ship.crew.find((c) => c.id === id))
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
      const engineDef = getEngineDefinition(gameData.ship.engine.definitionId);
      powerBadge.textContent = `+${engineDef.powerOutput} kW / -${roomDef.powerDraw} kW`;
    } else {
      powerBadge.textContent = `${roomDef.powerDraw} kW`;
    }

    roomCard.appendChild(powerBadge);
  }

  // Engine room shows equipped engine
  if (room.type === 'engine_room') {
    const engineDef = getEngineDefinition(gameData.ship.engine.definitionId);

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

    // Engine state indicator
    const engineState = document.createElement('div');
    engineState.className = 'equipment-item-state';
    if (gameData.ship.engine.state === 'off') {
      engineState.textContent = '⚫ OFF';
      engineState.style.color = '#ff6b6b';
    } else if (gameData.ship.engine.state === 'warming_up') {
      engineState.textContent = `🟡 WARMING ${gameData.ship.engine.warmupProgress.toFixed(0)}%`;
      engineState.style.color = '#ffc107';
    } else {
      engineState.textContent = '🟢 ONLINE';
      engineState.style.color = '#4caf50';
    }
    engineInfo.appendChild(engineState);

    engineItem.appendChild(engineInfo);
    equipmentSlot.appendChild(engineItem);

    // Engine controls (on/off button)
    const isDocked = gameData.ship.location.status === 'docked';
    const bridgeRoom = gameData.ship.rooms.find((r) => r.type === 'bridge');
    const hasControlCrew =
      assignedCrew.length > 0 ||
      (bridgeRoom && bridgeRoom.assignedCrewIds.length > 0);

    if (!isDocked && hasControlCrew) {
      const controls = document.createElement('div');
      controls.className = 'room-equipment-controls';

      if (gameData.ship.engine.state === 'off') {
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
    if (gameData.ship.engine.state === 'warming_up') {
      const warmupBar = renderProgressBar(
        'WARMUP',
        gameData.ship.engine.warmupProgress,
        `${gameData.ship.engine.warmupProgress.toFixed(0)}%`,
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

    const shipClass = getShipClass(gameData.ship.classId);
    const maxCapacity = shipClass?.cargoCapacity ?? 0;

    // For now, estimate cargo weight: assume each item is ~100 kg
    // TODO: Add actual weight property to equipment definitions
    const currentCargo = gameData.ship.cargo.length * 100;
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

function renderEquipmentSection(gameData: GameData): HTMLElement {
  const section = document.createElement('div');
  section.className = 'equipment-section';

  const title = document.createElement('h3');
  title.textContent = 'Equipment';
  section.appendChild(title);

  const equipmentList = document.createElement('div');
  equipmentList.className = 'equipment-list';

  for (const equipment of gameData.ship.equipment) {
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

      for (const room of gameData.ship.rooms) {
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
  const assignedIds = new Set<string>();
  for (const room of gameData.ship.rooms) {
    for (const crewId of room.assignedCrewIds) {
      assignedIds.add(crewId);
    }
  }

  return gameData.ship.crew.filter((crew) => !assignedIds.has(crew.id));
}
