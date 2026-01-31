import type { GameData, Room, CrewMember } from '../models';
import { getShipClass } from '../shipClasses';
import { getRoomDefinition } from '../rooms';
import { getCrewRoleName } from '../crewRoles';

export interface ShipViewCallbacks {
  onReset: () => void;
}

export function renderShipView(
  gameData: GameData,
  callbacks: ShipViewCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ship-view';

  // Ship header
  container.appendChild(renderShipHeader(gameData));

  // Room grid
  container.appendChild(
    renderRoomGrid(gameData.ship.rooms, gameData.ship.crew)
  );

  // Crew roster
  container.appendChild(renderCrewRoster(gameData));

  // Status bar
  container.appendChild(renderStatusBar(gameData));

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'danger';
  resetBtn.textContent = 'Abandon Ship';
  resetBtn.addEventListener('click', () => {
    if (
      confirm(
        'Are you sure you want to abandon your ship? All progress will be lost.'
      )
    ) {
      callbacks.onReset();
    }
  });
  container.appendChild(resetBtn);

  return container;
}

function renderShipHeader(gameData: GameData): HTMLElement {
  const header = document.createElement('div');
  header.className = 'ship-header';

  const shipName = document.createElement('h2');
  shipName.className = 'ship-name';
  shipName.textContent = gameData.ship.name;
  header.appendChild(shipName);

  const shipClass = getShipClass(gameData.ship.classId);
  const shipClassLabel = document.createElement('div');
  shipClassLabel.className = 'ship-class-label';
  shipClassLabel.textContent = `Class: ${shipClass?.name ?? gameData.ship.classId}`;
  header.appendChild(shipClassLabel);

  const captainLabel = document.createElement('div');
  captainLabel.className = 'captain-label';
  captainLabel.textContent = `Captain ${gameData.captain.name}`;
  header.appendChild(captainLabel);

  return header;
}

function renderRoomGrid(rooms: Room[], crew: CrewMember[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'room-grid';

  for (const room of rooms) {
    const roomDef = getRoomDefinition(room.type);
    const assignedCrew = room.assignedCrewId
      ? crew.find((c) => c.id === room.assignedCrewId)
      : undefined;

    const roomCard = document.createElement('div');
    roomCard.className = `room-card room-${room.state}`;

    const roomIcon = document.createElement('div');
    roomIcon.className = 'room-icon';
    roomIcon.textContent = roomDef?.icon ?? '?';
    roomCard.appendChild(roomIcon);

    const roomName = document.createElement('div');
    roomName.className = 'room-name';
    roomName.textContent = roomDef?.name ?? room.type;
    roomCard.appendChild(roomName);

    if (assignedCrew) {
      const crewName = document.createElement('div');
      crewName.className = 'room-crew';
      crewName.textContent = assignedCrew.name.split(' ')[0]; // First name only
      roomCard.appendChild(crewName);
    } else {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'room-crew empty';
      emptySlot.textContent = 'Empty';
      roomCard.appendChild(emptySlot);
    }

    grid.appendChild(roomCard);
  }

  return grid;
}

function renderCrewRoster(gameData: GameData): HTMLElement {
  const roster = document.createElement('div');
  roster.className = 'crew-roster';

  const title = document.createElement('h3');
  title.textContent = 'Crew Roster';
  roster.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'crew-list';

  // Captain first
  const captainItem = document.createElement('li');
  captainItem.className = 'crew-item captain';
  captainItem.innerHTML = `<span class="crew-name">${gameData.captain.name}</span><span class="crew-role">Captain</span>`;
  list.appendChild(captainItem);

  // Then crew members
  for (const member of gameData.ship.crew) {
    const item = document.createElement('li');
    item.className = 'crew-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'crew-name';
    nameSpan.textContent = member.name;
    item.appendChild(nameSpan);

    const roleSpan = document.createElement('span');
    roleSpan.className = 'crew-role';
    roleSpan.textContent = getCrewRoleName(member.role);
    item.appendChild(roleSpan);

    const statsSpan = document.createElement('span');
    statsSpan.className = 'crew-stats';
    statsSpan.innerHTML = `<span class="stat health">HP: ${member.health}</span><span class="stat morale">M: ${member.morale}</span>`;
    item.appendChild(statsSpan);

    list.appendChild(item);
  }

  roster.appendChild(list);

  return roster;
}

function renderStatusBar(gameData: GameData): HTMLElement {
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';

  const credits = document.createElement('div');
  credits.className = 'status-item';
  credits.innerHTML = `<span class="status-label">Credits:</span><span class="status-value">${gameData.ship.credits}</span>`;
  statusBar.appendChild(credits);

  const fuel = document.createElement('div');
  fuel.className = 'status-item';
  fuel.innerHTML = `<span class="status-label">Fuel:</span><span class="status-value">${gameData.ship.fuel}%</span>`;
  statusBar.appendChild(fuel);

  const crewCount = document.createElement('div');
  crewCount.className = 'status-item';
  const shipClass = getShipClass(gameData.ship.classId);
  const maxCrew = shipClass?.maxCrew ?? '?';
  crewCount.innerHTML = `<span class="status-label">Crew:</span><span class="status-value">${gameData.ship.crew.length + 1}/${maxCrew}</span>`;
  statusBar.appendChild(crewCount);

  return statusBar;
}
