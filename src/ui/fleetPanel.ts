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
import { attachDynamicTooltip, type TooltipHandle } from './components/tooltip';

export interface FleetPanelCallbacks {
  onSelectShip: (shipId: string) => void;
}

export type FleetPanelMode = 'full' | 'compact';

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
  tooltipHandle?: TooltipHandle;
  /** Compact mode: row containers */
  compactRow2?: HTMLDivElement;
  compactRow3?: HTMLDivElement;
  compactActivityBadge?: HTMLSpanElement;
  compactLocationText?: Text;
  compactProgressBar?: HTMLDivElement;
  compactProgressFill?: HTMLDivElement;
  compactEtaText?: HTMLSpanElement;
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
      case 'trade_route':
        typeLabel = 'Trade Route';
        break;
      case 'rescue':
        typeLabel = 'Rescue';
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

/** Get concise activity label for compact mode */
function getShipActivityConcise(ship: Ship, _gd: GameData): ShipActivity {
  if (ship.miningRoute) {
    const phase = ship.miningRoute.status;
    if (phase === 'mining') {
      return { label: 'Mining', color: '#ffd700' };
    } else if (phase === 'selling') {
      return { label: 'Selling', color: '#4ade80' };
    } else {
      return { label: 'Returning', color: '#ffa500' };
    }
  }

  if (ship.activeContract) {
    const quest = ship.activeContract.quest;
    const isPaused = ship.activeContract.paused;

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
      case 'trade_route':
        typeLabel = 'Trading';
        break;
      case 'rescue':
        typeLabel = 'Rescue';
        break;
      default:
        typeLabel = 'Contract';
    }

    if (isPaused) {
      return { label: `${typeLabel} (paused)`, color: '#888' };
    }

    return { label: typeLabel, color: '#ff9f43' };
  }

  return { label: 'Idle', color: '#666' };
}

export function createFleetPanel(
  gameData: GameData,
  callbacks: FleetPanelCallbacks,
  mode: FleetPanelMode = 'full'
): Component {
  const panel = document.createElement('div');
  panel.className =
    mode === 'compact' ? 'fleet-panel fleet-panel--compact' : 'fleet-panel';

  // Title — created once, never changes (hidden in compact mode via CSS)
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

    // In compact mode, attach a dynamic tooltip for full ship details
    let tooltipHandle: TooltipHandle | undefined;
    if (mode === 'compact') {
      tooltipHandle = attachDynamicTooltip(row, 'Click to select ship');
    }

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
    commandBadge.className = 'fleet-row-command';
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
    fuelSpan.className = 'fleet-row-stat fleet-row-stat-fuel';
    bottomLine.appendChild(fuelSpan);

    const crewSpan = document.createElement('span');
    crewSpan.className = 'fleet-row-stat fleet-row-stat-crew';
    bottomLine.appendChild(crewSpan);

    const equipSpan = document.createElement('span');
    equipSpan.className = 'fleet-row-stat fleet-row-stat-equip';
    bottomLine.appendChild(equipSpan);

    const rangeSpan = document.createElement('span');
    rangeSpan.className = 'fleet-row-stat fleet-row-stat-range';
    bottomLine.appendChild(rangeSpan);

    content.appendChild(bottomLine);

    // Compact mode: Row 2 (activity + location)
    let compactRow2: HTMLDivElement | undefined;
    let compactLocationText: Text | undefined;
    let compactActivityBadge: HTMLSpanElement | undefined;
    if (mode === 'compact') {
      compactRow2 = document.createElement('div');
      compactRow2.className = 'fleet-row-compact-2';

      // Create activity badge for Row 2
      compactActivityBadge = document.createElement('span');
      compactActivityBadge.className = 'fleet-row-activity';
      compactRow2.appendChild(compactActivityBadge);

      compactLocationText = document.createTextNode('');
      compactRow2.appendChild(compactLocationText);
      content.appendChild(compactRow2);
    }

    // Compact mode: Row 3 (progress bar - only shown when in flight)
    let compactRow3: HTMLDivElement | undefined;
    let compactProgressBar: HTMLDivElement | undefined;
    let compactProgressFill: HTMLDivElement | undefined;
    let compactEtaText: HTMLSpanElement | undefined;
    if (mode === 'compact') {
      compactRow3 = document.createElement('div');
      compactRow3.className = 'fleet-row-compact-3';
      compactRow3.style.display = 'none';

      compactProgressBar = document.createElement('div');
      compactProgressBar.className = 'fleet-row-progress-bar';

      compactProgressFill = document.createElement('div');
      compactProgressFill.className = 'fleet-row-progress-fill';
      compactProgressBar.appendChild(compactProgressFill);

      compactRow3.appendChild(compactProgressBar);

      compactEtaText = document.createElement('span');
      compactEtaText.className = 'fleet-row-eta';
      compactRow3.appendChild(compactEtaText);

      content.appendChild(compactRow3);
    }

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
      tooltipHandle,
      compactRow2,
      compactRow3,
      compactActivityBadge,
      compactLocationText,
      compactProgressBar,
      compactProgressFill,
      compactEtaText,
    };
  }

  function updateShipRow(refs: ShipRowRefs, ship: Ship, gd: GameData): void {
    const isActive = ship.id === gd.activeShipId;

    // Row class & style
    const compactClass = mode === 'compact' ? ' fleet-row--compact' : '';
    refs.row.className = isActive
      ? `fleet-row active${compactClass}`
      : `fleet-row${compactClass}`;

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

    // Activity badge (full mode uses full label, compact mode uses concise label)
    const activity = getShipActivity(ship, gd);
    if (refs.activityBadge.textContent !== activity.label) {
      refs.activityBadge.textContent = activity.label;
    }
    refs.activityBadge.style.background = activity.color + '22';
    refs.activityBadge.style.color = activity.color;
    refs.activityBadge.style.borderColor = activity.color + '44';

    // Compact mode: separate activity badge with concise label
    if (mode === 'compact' && refs.compactActivityBadge) {
      const activityConcise = getShipActivityConcise(ship, gd);
      if (refs.compactActivityBadge.textContent !== activityConcise.label) {
        refs.compactActivityBadge.textContent = activityConcise.label;
      }
      refs.compactActivityBadge.style.background = activityConcise.color + '22';
      refs.compactActivityBadge.style.color = activityConcise.color;
      refs.compactActivityBadge.style.borderColor =
        activityConcise.color + '44';
    }

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

    // Compact mode: Row 2 (location) and Row 3 (progress)
    if (mode === 'compact' && refs.compactLocationText && refs.compactRow3) {
      if (ship.location.status === 'docked') {
        const dockedAt = ship.location.dockedAt;
        const location = gd.world.locations.find((l) => l.id === dockedAt);
        const compactText = `at ${location?.name || dockedAt}`;
        if (refs.compactLocationText.textContent !== compactText) {
          refs.compactLocationText.textContent = compactText;
        }
        refs.compactRow3.style.display = 'none';
      } else if (ship.location.status === 'orbiting') {
        const orbitingAt = ship.location.orbitingAt;
        const location = gd.world.locations.find((l) => l.id === orbitingAt);
        const compactText = `orbiting ${location?.name || orbitingAt}`;
        if (refs.compactLocationText.textContent !== compactText) {
          refs.compactLocationText.textContent = compactText;
        }
        refs.compactRow3.style.display = 'none';
      } else if (ship.activeFlightPlan) {
        const destId = ship.activeFlightPlan.destination;
        const destination = gd.world.locations.find((l) => l.id === destId);
        const compactText = `→ ${destination?.name || destId}`;
        if (refs.compactLocationText.textContent !== compactText) {
          refs.compactLocationText.textContent = compactText;
        }

        // Show progress bar (Row 3)
        refs.compactRow3.style.display = 'flex';

        const progressPercent =
          (ship.activeFlightPlan.distanceCovered /
            ship.activeFlightPlan.totalDistance) *
          100;

        if (refs.compactProgressFill) {
          refs.compactProgressFill.style.width = `${progressPercent}%`;
        }

        if (refs.compactEtaText) {
          const remainingTime =
            ship.activeFlightPlan.totalTime - ship.activeFlightPlan.elapsedTime;
          const timeLabel = formatDualTime(remainingTime);
          const etaText = `${timeLabel}`;
          if (refs.compactEtaText.textContent !== etaText) {
            refs.compactEtaText.textContent = etaText;
          }
        }
      } else {
        refs.compactLocationText.textContent = 'in flight';
        refs.compactRow3.style.display = 'none';
      }
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

    // Compact mode: build comprehensive rich HTML tooltip
    if (mode === 'compact' && refs.tooltipHandle) {
      const tooltipParts: string[] = [];

      // Location/flight status
      if (ship.location.status === 'docked') {
        const dockedAt = ship.location.dockedAt;
        const location = gd.world.locations.find((l) => l.id === dockedAt);
        tooltipParts.push(
          `<div><strong>Location:</strong> Docked at ${location?.name || dockedAt}</div>`
        );
      } else if (ship.location.status === 'orbiting') {
        const orbitingAt = ship.location.orbitingAt;
        const location = gd.world.locations.find((l) => l.id === orbitingAt);
        tooltipParts.push(
          `<div><strong>Location:</strong> Orbiting ${location?.name || orbitingAt}</div>`
        );
      } else if (ship.activeFlightPlan) {
        const destId = ship.activeFlightPlan.destination;
        const destination = gd.world.locations.find((l) => l.id === destId);
        const progressPercent =
          (ship.activeFlightPlan.distanceCovered /
            ship.activeFlightPlan.totalDistance) *
          100;
        tooltipParts.push(
          `<div><strong>In Flight:</strong> ${destination?.name || destId} (${progressPercent.toFixed(0)}%)</div>`
        );
      } else {
        tooltipParts.push(`<div><strong>Status:</strong> In Flight</div>`);
      }

      // Stats
      tooltipParts.push(
        `<div><strong>Fuel:</strong> ${formatFuelMass(ship.fuelKg)} / ${formatFuelMass(ship.maxFuelKg)}</div>`
      );
      tooltipParts.push(
        `<div><strong>Crew:</strong> ${ship.crew.length}/${shipClass?.maxCrew ?? '?'}</div>`
      );
      const maxSlots2 = shipClass?.equipmentSlotDefs.length ?? 0;
      tooltipParts.push(
        `<div><strong>Equipment:</strong> ${ship.equipment.length}/${maxSlots2}</div>`
      );
      if (shipClass) {
        const engineDef = getEngineDefinition(ship.engine.definitionId);
        const maxRangeKm = computeMaxRange(shipClass, engineDef);
        tooltipParts.push(
          `<div><strong>Range:</strong> ${formatLargeNumber(maxRangeKm)} km</div>`
        );
      }

      refs.tooltipHandle.updateContent(tooltipParts.join(''));
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
