import type { GameData, Ship } from '../models';
import { getShipClass, type ShipClassTier } from '../shipClasses';
import { getEngineDefinition } from '../engines';
import { computeMaxRange } from '../flightPhysics';
import { formatDualTime } from '../timeSystem';
import type { Component } from './component';
import {
  formatFuelMass,
  calculateFuelPercentage,
  getFuelColorHex,
} from './fuelFormatting';
import { getCommandCommerceBonus, getFleetAuraBonus } from '../captainBonus';
import { formatLargeNumber } from '../formatting';

export interface FleetPanelCallbacks {
  onSelectShip: (shipId: string) => void;
}

/** Refs kept per ship row so we can patch in-place. */
interface ShipRowRefs {
  row: HTMLDivElement;
  indicator: HTMLDivElement;
  tierBadge: HTMLSpanElement;
  nameSpan: HTMLSpanElement;
  activityBadge: HTMLSpanElement;
  locationSpan: HTMLSpanElement;
  /** Plain text node shown when docked/orbiting */
  locationPlainText: Text;
  /** Container for in-flight elements */
  flightContainer: HTMLSpanElement;
  flightText: HTMLSpanElement;
  miniBarFill: HTMLSpanElement;
  flightPercentText: HTMLSpanElement;
  fuelSpan: HTMLSpanElement;
  crewSpan: HTMLSpanElement;
  equipSpan: HTMLSpanElement;
  rangeSpan: HTMLSpanElement;
  commandBadge: HTMLSpanElement;
}

interface ShipActivity {
  label: string;
  color: string;
}

function getShipActivity(ship: Ship, gd: GameData): ShipActivity {
  if (ship.miningRoute) {
    const phase = ship.miningRoute.status;
    const mineLocation = gd.world.locations.find(
      (l) => l.id === ship.miningRoute!.mineLocationId
    );
    const mineName = mineLocation?.name ?? ship.miningRoute.mineLocationId;
    if (phase === 'mining') {
      return { label: `Mining at ${mineName}`, color: '#ffd700' };
    } else if (phase === 'selling') {
      return { label: 'Mining (selling ore)', color: '#ffd700' };
    } else {
      return { label: 'Mining (returning)', color: '#ffd700' };
    }
  }

  if (ship.routeAssignment) {
    const origin = gd.world.locations.find(
      (l) => l.id === ship.routeAssignment!.originId
    );
    const dest = gd.world.locations.find(
      (l) => l.id === ship.routeAssignment!.destinationId
    );
    const originName = origin?.name ?? ship.routeAssignment.originId;
    const destName = dest?.name ?? ship.routeAssignment.destinationId;
    return {
      label: `Trade Route: ${originName} ↔ ${destName}`,
      color: '#4a9eff',
    };
  }

  if (ship.activeContract) {
    const quest = ship.activeContract.quest;
    const dest = gd.world.locations.find((l) => l.id === quest.destination);
    const destName = dest?.name ?? quest.destination;

    let typeLabel: string;
    switch (quest.type) {
      case 'delivery':
        typeLabel = 'Delivery';
        break;
      case 'passenger':
        typeLabel = 'Passenger';
        break;
      case 'freight':
        typeLabel = 'Freight';
        break;
      case 'supply':
        typeLabel = 'Supply';
        break;
      case 'trade_route':
        typeLabel = 'Trade Route';
        break;
      default:
        typeLabel = 'Contract';
    }

    let progress = '';
    if (quest.tripsRequired > 0) {
      progress = ` (${ship.activeContract.tripsCompleted}/${quest.tripsRequired})`;
    }

    const pausedSuffix = ship.activeContract.paused ? ' — paused' : '';

    return {
      label: `${typeLabel}: ${destName}${progress}${pausedSuffix}`,
      color: '#ff9f43',
    };
  }

  return { label: 'Idle', color: '#666' };
}

export function createFleetPanel(
  gameData: GameData,
  callbacks: FleetPanelCallbacks
): Component {
  const panel = document.createElement('div');
  panel.className = 'fleet-panel';

  // Title — created once, never changes
  const title = document.createElement('div');
  title.className = 'fleet-panel-title';
  title.textContent = 'Fleet';
  panel.appendChild(title);

  // Ship row pool keyed by ship.id
  const rowMap = new Map<string, ShipRowRefs>();

  // Mutable variable that update() refreshes so mouseenter/mouseleave
  // handlers always see the current activeShipId instead of a stale closure.
  let latestActiveShipId: string = gameData.activeShipId;

  function createShipRow(ship: Ship): ShipRowRefs {
    const row = document.createElement('div');
    row.className = 'fleet-row';

    row.addEventListener('mouseenter', () => {
      if (ship.id !== latestActiveShipId) {
        row.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });
    row.addEventListener('mouseleave', () => {
      if (ship.id !== latestActiveShipId) {
        row.style.background = '';
      }
    });
    row.addEventListener('click', () => callbacks.onSelectShip(ship.id));

    // Active indicator dot
    const indicator = document.createElement('div');
    indicator.className = 'fleet-row-indicator';
    row.appendChild(indicator);

    // Content area (takes remaining space)
    const content = document.createElement('div');
    content.className = 'fleet-row-content';

    // Top line: tier + name + activity badge
    const topLine = document.createElement('div');
    topLine.className = 'fleet-row-top';

    const tierBadge = document.createElement('span');
    tierBadge.className = 'fleet-row-tier';
    topLine.appendChild(tierBadge);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'fleet-row-name';
    topLine.appendChild(nameSpan);

    const commandBadge = document.createElement('span');
    commandBadge.style.cssText =
      'font-size: 0.75em; margin-left: 4px; font-weight: bold;';
    topLine.appendChild(commandBadge);

    const activityBadge = document.createElement('span');
    activityBadge.className = 'fleet-row-activity';
    topLine.appendChild(activityBadge);

    content.appendChild(topLine);

    // Bottom line: location/flight + stats
    const bottomLine = document.createElement('div');
    bottomLine.className = 'fleet-row-bottom';

    // Location / flight info
    const locationSpan = document.createElement('span');
    locationSpan.className = 'fleet-row-location';

    const locationPlainText = document.createTextNode('');
    locationSpan.appendChild(locationPlainText);

    const flightContainer = document.createElement('span');
    flightContainer.className = 'fleet-row-flight';
    flightContainer.style.display = 'none';

    const flightText = document.createElement('span');
    flightContainer.appendChild(flightText);

    // Mini progress bar
    const miniBar = document.createElement('span');
    miniBar.className = 'fleet-row-minibar';

    const miniBarFill = document.createElement('span');
    miniBarFill.className = 'fleet-row-minibar-fill';
    miniBar.appendChild(miniBarFill);

    flightContainer.appendChild(miniBar);

    const flightPercentText = document.createElement('span');
    flightPercentText.className = 'fleet-row-flight-pct';
    flightContainer.appendChild(flightPercentText);

    locationSpan.appendChild(flightContainer);
    bottomLine.appendChild(locationSpan);

    // Stats
    const fuelSpan = document.createElement('span');
    fuelSpan.className = 'fleet-row-stat';
    bottomLine.appendChild(fuelSpan);

    const crewSpan = document.createElement('span');
    crewSpan.className = 'fleet-row-stat';
    bottomLine.appendChild(crewSpan);

    const equipSpan = document.createElement('span');
    equipSpan.className = 'fleet-row-stat';
    bottomLine.appendChild(equipSpan);

    const rangeSpan = document.createElement('span');
    rangeSpan.className = 'fleet-row-stat';
    bottomLine.appendChild(rangeSpan);

    content.appendChild(bottomLine);
    row.appendChild(content);

    return {
      row,
      indicator,
      tierBadge,
      nameSpan,
      activityBadge,
      locationSpan,
      locationPlainText,
      flightContainer,
      flightText,
      miniBarFill,
      flightPercentText,
      fuelSpan,
      crewSpan,
      equipSpan,
      rangeSpan,
      commandBadge,
    };
  }

  function updateShipRow(refs: ShipRowRefs, ship: Ship, gd: GameData): void {
    const isActive = ship.id === gd.activeShipId;

    // Row class & style
    refs.row.className = isActive ? 'fleet-row active' : 'fleet-row';

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

    // Activity badge
    const activity = getShipActivity(ship, gd);
    if (refs.activityBadge.textContent !== activity.label) {
      refs.activityBadge.textContent = activity.label;
    }
    refs.activityBadge.style.background = activity.color + '22';
    refs.activityBadge.style.color = activity.color;
    refs.activityBadge.style.borderColor = activity.color + '44';

    // Command badge
    const hasCaptain = ship.crew.some((c) => c.isCaptain);
    const commandBonus = getCommandCommerceBonus(ship);
    const aura = getFleetAuraBonus(ship, gd);
    let cmdText: string;
    if (hasCaptain) {
      cmdText = `✦ +${Math.round(commandBonus * 100)}% CMD`;
    } else if (commandBonus > 0) {
      const auraSuffix = aura > 0 ? ` +${Math.round(aura * 100)}%⚡` : '';
      cmdText = `+${Math.round(commandBonus * 100)}% ACT${auraSuffix}`;
    } else {
      const auraSuffix = aura > 0 ? ` +${Math.round(aura * 100)}%⚡` : '';
      cmdText = `— CMD${auraSuffix}`;
    }
    if (refs.commandBadge.textContent !== cmdText) {
      refs.commandBadge.textContent = cmdText;
    }
    refs.commandBadge.style.color = hasCaptain
      ? '#fbbf24'
      : aura > 0
        ? '#60a5fa'
        : '#6b7280';

    // Location / flight status
    if (ship.location.status === 'docked') {
      const dockedAt = ship.location.dockedAt;
      const location = gd.world.locations.find((l) => l.id === dockedAt);
      const text = `Docked at ${location?.name || dockedAt}`;
      if (refs.locationPlainText.textContent !== text) {
        refs.locationPlainText.textContent = text;
      }
      refs.flightContainer.style.display = 'none';
    } else if (ship.location.status === 'orbiting') {
      const orbitingAt = ship.location.orbitingAt;
      const location = gd.world.locations.find((l) => l.id === orbitingAt);
      const text = `Orbiting ${location?.name || orbitingAt}`;
      if (refs.locationPlainText.textContent !== text) {
        refs.locationPlainText.textContent = text;
      }
      refs.flightContainer.style.display = 'none';
    } else if (ship.activeFlightPlan) {
      refs.locationPlainText.textContent = '';
      refs.flightContainer.style.display = '';

      const destId = ship.activeFlightPlan.destination;
      const destination = gd.world.locations.find((l) => l.id === destId);
      const flightLabel = `In Flight to ${destination?.name || destId} `;
      if (refs.flightText.textContent !== flightLabel) {
        refs.flightText.textContent = flightLabel;
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
      if (refs.flightPercentText.textContent !== percentText) {
        refs.flightPercentText.textContent = percentText;
      }
    } else {
      refs.locationPlainText.textContent = 'In Flight';
      refs.flightContainer.style.display = 'none';
    }

    // Fuel
    const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
    refs.fuelSpan.style.color =
      fuelPercentage <= 20 ? getFuelColorHex(fuelPercentage) : '';
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
