import type { GameData, Ship } from '../models';
import { getShipClass, type ShipClassTier } from '../shipClasses';
import { getEngineDefinition } from '../engines';
import { computeMaxRange } from '../flightPhysics';
import { formatDualTime } from '../timeSystem';
import type { Component } from './component';
import { formatFuelMass, calculateFuelPercentage } from './fuelFormatting';

export interface FleetPanelCallbacks {
  onSelectShip: (shipId: string) => void;
}

/** Refs kept per ship row so we can patch in-place. */
interface ShipRowRefs {
  row: HTMLDivElement;
  indicator: HTMLDivElement;
  tierBadge: HTMLSpanElement;
  nameSpan: HTMLDivElement;
  statusSpan: HTMLDivElement;
  /** Plain text node shown when docked/orbiting */
  statusPlainText: Text;
  /** Container for in-flight elements */
  statusFlightContainer: HTMLSpanElement;
  statusFlightText: HTMLSpanElement;
  miniBarFill: HTMLSpanElement;
  statusPercentText: HTMLSpanElement;
  fuelSpan: HTMLDivElement;
  crewSpan: HTMLDivElement;
  equipSpan: HTMLDivElement;
  rangeSpan: HTMLDivElement;
}

export function createFleetPanel(
  gameData: GameData,
  callbacks: FleetPanelCallbacks
): Component {
  const panel = document.createElement('div');
  panel.className = 'fleet-panel';
  panel.style.background = 'rgba(0, 0, 0, 0.3)';
  panel.style.border = '1px solid #444';
  panel.style.borderRadius = '4px';
  panel.style.padding = '0.5rem';
  panel.style.marginBottom = '0.5rem';

  // Title — created once, never changes
  const title = document.createElement('div');
  title.textContent = 'Fleet';
  title.style.fontSize = '0.9rem';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '0.5rem';
  title.style.color = '#aaa';
  panel.appendChild(title);

  // Ship row pool keyed by ship.id
  const rowMap = new Map<string, ShipRowRefs>();

  // Mutable variable that update() refreshes so mouseenter/mouseleave
  // handlers always see the current activeShipId instead of a stale closure.
  let latestActiveShipId: string = gameData.activeShipId;

  function createShipRow(ship: Ship): ShipRowRefs {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '1rem';
    row.style.padding = '0.5rem';
    row.style.borderRadius = '4px';
    row.style.cursor = 'pointer';
    row.style.transition = 'background 0.2s';
    row.style.fontSize = '0.85rem';

    row.addEventListener('mouseenter', () => {
      if (ship.id !== latestActiveShipId) {
        row.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });
    row.addEventListener('mouseleave', () => {
      if (ship.id !== latestActiveShipId) {
        row.style.background = 'rgba(0, 0, 0, 0.2)';
      }
    });
    row.addEventListener('click', () => callbacks.onSelectShip(ship.id));

    // Active indicator dot
    const indicator = document.createElement('div');
    indicator.style.width = '8px';
    indicator.style.height = '8px';
    indicator.style.borderRadius = '50%';
    indicator.style.flexShrink = '0';
    row.appendChild(indicator);

    // Name container
    const nameContainer = document.createElement('div');
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';
    nameContainer.style.gap = '0.5rem';
    nameContainer.style.minWidth = '150px';

    const tierBadge = document.createElement('span');
    tierBadge.style.fontSize = '0.75rem';
    tierBadge.style.fontWeight = 'bold';
    tierBadge.style.opacity = '0.8';
    nameContainer.appendChild(tierBadge);

    const nameSpan = document.createElement('div');
    nameSpan.style.fontWeight = 'bold';
    nameContainer.appendChild(nameSpan);

    row.appendChild(nameContainer);

    // Status
    const statusSpan = document.createElement('div');
    statusSpan.style.flex = '1';
    statusSpan.style.minWidth = '200px';
    statusSpan.style.color = '#aaa';

    // Plain text node for docked/orbiting
    const statusPlainText = document.createTextNode('');
    statusSpan.appendChild(statusPlainText);

    // In-flight container (hidden when not in flight)
    const statusFlightContainer = document.createElement('span');
    statusFlightContainer.style.display = 'none';

    const statusFlightText = document.createElement('span');
    statusFlightContainer.appendChild(statusFlightText);

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

    const miniBarFill = document.createElement('span');
    miniBarFill.style.display = 'block';
    miniBarFill.style.height = '100%';
    miniBarFill.style.background = '#4a9eff';
    miniBar.appendChild(miniBarFill);

    statusFlightContainer.appendChild(miniBar);

    const statusPercentText = document.createElement('span');
    statusPercentText.style.fontSize = '0.8rem';
    statusFlightContainer.appendChild(statusPercentText);

    statusSpan.appendChild(statusFlightContainer);

    row.appendChild(statusSpan);

    // Fuel
    const fuelSpan = document.createElement('div');
    fuelSpan.style.minWidth = '100px';
    row.appendChild(fuelSpan);

    // Crew
    const crewSpan = document.createElement('div');
    crewSpan.style.minWidth = '70px';
    crewSpan.style.color = '#aaa';
    row.appendChild(crewSpan);

    // Equipment slots
    const equipSpan = document.createElement('div');
    equipSpan.style.minWidth = '70px';
    equipSpan.style.color = '#aaa';
    row.appendChild(equipSpan);

    // Range
    const rangeSpan = document.createElement('div');
    rangeSpan.style.minWidth = '90px';
    rangeSpan.style.color = '#aaa';
    rangeSpan.style.fontSize = '0.8rem';
    row.appendChild(rangeSpan);

    return {
      row,
      indicator,
      tierBadge,
      nameSpan,
      statusSpan,
      statusPlainText,
      statusFlightContainer,
      statusFlightText,
      miniBarFill,
      statusPercentText,
      fuelSpan,
      crewSpan,
      equipSpan,
      rangeSpan,
    };
  }

  function updateShipRow(refs: ShipRowRefs, ship: Ship, gd: GameData): void {
    const isActive = ship.id === gd.activeShipId;

    // Row class & style
    refs.row.className = isActive ? 'fleet-row active' : 'fleet-row';
    if (isActive) {
      refs.row.style.background = 'rgba(74, 158, 255, 0.2)';
      refs.row.style.border = '1px solid #4a9eff';
    } else {
      refs.row.style.background = 'rgba(0, 0, 0, 0.2)';
      refs.row.style.border = '1px solid transparent';
    }

    // Indicator dot
    refs.indicator.style.background = isActive ? '#4a9eff' : 'transparent';

    // Tier badge
    const shipClass = getShipClass(ship.classId);
    const tierText = `[${shipClass?.tier ?? '?'}]`;
    if (refs.tierBadge.textContent !== tierText) {
      refs.tierBadge.textContent = tierText;
    }
    refs.tierBadge.style.color = getTierColor(shipClass?.tier ?? 'I');

    // Ship name
    if (refs.nameSpan.textContent !== ship.name) {
      refs.nameSpan.textContent = ship.name;
    }
    refs.nameSpan.style.color = isActive ? '#4a9eff' : '#fff';

    // Status
    if (ship.location.status === 'docked') {
      const dockedAt = ship.location.dockedAt;
      const location = gd.world.locations.find((l) => l.id === dockedAt);
      const text = `Docked at ${location?.name || dockedAt}`;
      if (refs.statusPlainText.textContent !== text) {
        refs.statusPlainText.textContent = text;
      }
      refs.statusFlightContainer.style.display = 'none';
    } else if (ship.location.status === 'orbiting') {
      const orbitingAt = ship.location.orbitingAt;
      const location = gd.world.locations.find((l) => l.id === orbitingAt);
      const text = `Orbiting ${location?.name || orbitingAt}`;
      if (refs.statusPlainText.textContent !== text) {
        refs.statusPlainText.textContent = text;
      }
      refs.statusFlightContainer.style.display = 'none';
    } else if (ship.activeFlightPlan) {
      // In flight — hide plain text, show flight container
      refs.statusPlainText.textContent = '';
      refs.statusFlightContainer.style.display = '';

      const destId = ship.activeFlightPlan.destination;
      const destination = gd.world.locations.find((l) => l.id === destId);
      const flightText = `In Flight to ${destination?.name || destId} `;
      if (refs.statusFlightText.textContent !== flightText) {
        refs.statusFlightText.textContent = flightText;
      }

      const progressPercent =
        (ship.activeFlightPlan.distanceCovered /
          ship.activeFlightPlan.totalDistance) *
        100;
      refs.miniBarFill.style.width = `${progressPercent}%`;

      const remainingTime =
        ship.activeFlightPlan.totalTime - ship.activeFlightPlan.elapsedTime;
      const timeLabel = formatDualTime(remainingTime);
      const percentText = `${progressPercent.toFixed(0)}% - ${timeLabel} remaining`;
      if (refs.statusPercentText.textContent !== percentText) {
        refs.statusPercentText.textContent = percentText;
      }
    } else {
      // Fallback: in_flight but no active flight plan
      refs.statusPlainText.textContent = 'In Flight';
      refs.statusFlightContainer.style.display = 'none';
    }

    // Fuel
    const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
    refs.fuelSpan.style.color = fuelPercentage < 20 ? '#ff4444' : '#aaa';
    const fuelText = `Fuel: ${formatFuelMass(ship.fuelKg)}`;
    if (refs.fuelSpan.textContent !== fuelText) {
      refs.fuelSpan.textContent = fuelText;
    }

    // Crew
    const crewText = `Crew: ${ship.crew.length}/${shipClass?.maxCrew ?? '?'}`;
    if (refs.crewSpan.textContent !== crewText) {
      refs.crewSpan.textContent = crewText;
    }

    // Equipment
    const maxSlots = shipClass?.equipmentSlotDefs.length ?? 0;
    const usedSlots = ship.equipment.length;
    const equipText = `Equip: ${usedSlots}/${maxSlots}`;
    if (refs.equipSpan.textContent !== equipText) {
      refs.equipSpan.textContent = equipText;
    }

    // Range
    if (shipClass) {
      const engineDef = getEngineDefinition(ship.engine.definitionId);
      const maxRangeKm = computeMaxRange(shipClass, engineDef);
      const rangeLabel = formatLargeNumber(maxRangeKm);
      const rangeText = `Range: ${rangeLabel}km`;
      if (refs.rangeSpan.textContent !== rangeText) {
        refs.rangeSpan.textContent = rangeText;
      }
      refs.rangeSpan.title = `Max range: ${maxRangeKm.toLocaleString()} km`;
    }
  }

  function update(gd: GameData): void {
    // Refresh the mutable activeShipId so event handlers see the latest value.
    latestActiveShipId = gd.activeShipId;

    const currentShipIds = new Set<string>();

    for (const ship of gd.ships) {
      currentShipIds.add(ship.id);

      let refs = rowMap.get(ship.id);
      if (!refs) {
        // New ship — create row and append to panel
        refs = createShipRow(ship);
        rowMap.set(ship.id, refs);
        panel.appendChild(refs.row);
      }

      updateShipRow(refs, ship, gd);
    }

    // Remove rows for ships no longer present
    for (const [id, refs] of rowMap) {
      if (!currentShipIds.has(id)) {
        refs.row.remove();
        rowMap.delete(id);
      }
    }
  }

  // Initial render
  update(gameData);

  return { el: panel, update };
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
