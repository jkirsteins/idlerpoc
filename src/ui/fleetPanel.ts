import type { GameData } from '../models';
import { getShipClass, type ShipClassTier } from '../shipClasses';
import { getEngineDefinition } from '../engines';
import { computeMaxRange } from '../flightPhysics';
import { formatDualTime } from '../timeSystem';

export interface FleetPanelCallbacks {
  onSelectShip: (shipId: string) => void;
}

export function renderFleetPanel(
  gameData: GameData,
  callbacks: FleetPanelCallbacks
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'fleet-panel';
  panel.style.background = 'rgba(0, 0, 0, 0.3)';
  panel.style.border = '1px solid #444';
  panel.style.borderRadius = '4px';
  panel.style.padding = '0.5rem';
  panel.style.marginBottom = '0.5rem';

  const title = document.createElement('div');
  title.textContent = 'Fleet';
  title.style.fontSize = '0.9rem';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '0.5rem';
  title.style.color = '#aaa';
  panel.appendChild(title);

  for (const ship of gameData.ships) {
    const row = document.createElement('div');
    row.className =
      ship.id === gameData.activeShipId ? 'fleet-row active' : 'fleet-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '1rem';
    row.style.padding = '0.5rem';
    row.style.borderRadius = '4px';
    row.style.cursor = 'pointer';
    row.style.transition = 'background 0.2s';
    row.style.fontSize = '0.85rem';

    if (ship.id === gameData.activeShipId) {
      row.style.background = 'rgba(74, 158, 255, 0.2)';
      row.style.border = '1px solid #4a9eff';
    } else {
      row.style.background = 'rgba(0, 0, 0, 0.2)';
      row.style.border = '1px solid transparent';
    }

    row.addEventListener('mouseenter', () => {
      if (ship.id !== gameData.activeShipId) {
        row.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });
    row.addEventListener('mouseleave', () => {
      if (ship.id !== gameData.activeShipId) {
        row.style.background = 'rgba(0, 0, 0, 0.2)';
      }
    });

    row.addEventListener('click', () => callbacks.onSelectShip(ship.id));

    // Active indicator
    const indicator = document.createElement('div');
    indicator.style.width = '8px';
    indicator.style.height = '8px';
    indicator.style.borderRadius = '50%';
    indicator.style.background =
      ship.id === gameData.activeShipId ? '#4a9eff' : 'transparent';
    indicator.style.flexShrink = '0';
    row.appendChild(indicator);

    // Ship name with tier badge
    const nameContainer = document.createElement('div');
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';
    nameContainer.style.gap = '0.5rem';
    nameContainer.style.minWidth = '150px';

    const tierBadge = document.createElement('span');
    const shipClass = getShipClass(ship.classId);
    tierBadge.textContent = `[${shipClass?.tier ?? '?'}]`;
    tierBadge.style.fontSize = '0.75rem';
    tierBadge.style.fontWeight = 'bold';
    tierBadge.style.color = getTierColor(shipClass?.tier ?? 'I');
    tierBadge.style.opacity = '0.8';
    nameContainer.appendChild(tierBadge);

    const nameSpan = document.createElement('div');
    nameSpan.textContent = ship.name;
    nameSpan.style.fontWeight = 'bold';
    nameSpan.style.color =
      ship.id === gameData.activeShipId ? '#4a9eff' : '#fff';
    nameContainer.appendChild(nameSpan);

    row.appendChild(nameContainer);

    // Status
    const statusSpan = document.createElement('div');
    statusSpan.style.flex = '1';
    statusSpan.style.minWidth = '200px';
    statusSpan.style.color = '#aaa';

    if (ship.location.status === 'docked') {
      const dockedAt = ship.location.dockedAt;
      const location = gameData.world.locations.find((l) => l.id === dockedAt);
      statusSpan.textContent = `Docked at ${location?.name || dockedAt}`;
    } else if (ship.location.flight) {
      const destId = ship.location.flight.destination;
      const destination = gameData.world.locations.find((l) => l.id === destId);
      const progressPercent =
        (ship.location.flight.distanceCovered /
          ship.location.flight.totalDistance) *
        100;

      // Calculate remaining time
      const remainingTime =
        ship.location.flight.totalTime - ship.location.flight.elapsedTime;
      const timeLabel = formatDualTime(remainingTime);

      const statusText = document.createElement('span');
      statusText.textContent = `In Flight to ${destination?.name || destId} `;
      statusSpan.appendChild(statusText);

      // Mini progress bar
      const miniBar = document.createElement('span');
      miniBar.style.display = 'inline-block';
      miniBar.style.width = '60px';
      miniBar.style.height = '6px';
      miniBar.style.background = 'rgba(255, 255, 255, 0.1)';
      miniBar.style.borderRadius = '3px';
      miniBar.style.verticalAlign = 'middle';
      miniBar.style.marginRight = '4px';
      miniBar.style.overflow = 'hidden';

      const miniFill = document.createElement('span');
      miniFill.style.display = 'block';
      miniFill.style.height = '100%';
      miniFill.style.width = `${progressPercent}%`;
      miniFill.style.background = '#4a9eff';
      miniBar.appendChild(miniFill);

      statusSpan.appendChild(miniBar);

      const percentText = document.createElement('span');
      percentText.textContent = `${progressPercent.toFixed(0)}% - ${timeLabel} remaining`;
      percentText.style.fontSize = '0.8rem';
      statusSpan.appendChild(percentText);
    }
    row.appendChild(statusSpan);

    // Fuel
    const fuelSpan = document.createElement('div');
    fuelSpan.style.minWidth = '80px';
    fuelSpan.style.color = ship.fuel < 20 ? '#ff4444' : '#aaa';
    fuelSpan.textContent = `Fuel: ${Math.round(ship.fuel)}%`;
    row.appendChild(fuelSpan);

    // Crew
    const crewSpan = document.createElement('div');
    crewSpan.style.minWidth = '70px';
    crewSpan.style.color = '#aaa';
    crewSpan.textContent = `Crew: ${ship.crew.length}/${shipClass?.maxCrew ?? '?'}`;
    row.appendChild(crewSpan);

    // Equipment slots
    const equipSpan = document.createElement('div');
    equipSpan.style.minWidth = '70px';
    equipSpan.style.color = '#aaa';
    const maxSlots = shipClass?.equipmentSlotDefs.length ?? 0;
    const usedSlots = ship.equipment.length;
    equipSpan.textContent = `Equip: ${usedSlots}/${maxSlots}`;
    row.appendChild(equipSpan);

    // Range
    const rangeSpan = document.createElement('div');
    rangeSpan.style.minWidth = '90px';
    rangeSpan.style.color = '#aaa';
    rangeSpan.style.fontSize = '0.8rem';
    if (shipClass) {
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const maxRangeKm = computeMaxRange(shipClass, engineDef);
      const rangeLabel = formatLargeNumber(maxRangeKm);
      rangeSpan.textContent = `Range: ${rangeLabel}km`;
      rangeSpan.title = `Max range: ${maxRangeKm.toLocaleString()} km`;
    }
    row.appendChild(rangeSpan);

    panel.appendChild(row);
  }

  return panel;
}

function getTierColor(tier: ShipClassTier): string {
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

function formatLargeNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(0) + 'K';
  }
  return num.toFixed(0);
}
