import type { GameData } from '../models';
import { getActiveShip } from '../models';
import type { PlayingTab } from './renderer';
import { computePowerStatus } from '../powerSystem';
import { getEngineDefinition } from '../engines';
import { getEquipmentDefinition } from '../equipment';
import { getShipClass } from '../shipClasses';
import { getCrewRoleDefinition } from '../crewRoles';
import { formatGameDate, TICKS_PER_DAY } from '../timeSystem';
import { getRoomDefinition } from '../rooms';
import { renderStatBar } from './components/statBar';
import { attachTooltip, formatPowerTooltip } from './components/tooltip';

interface SidebarCallbacks {
  onBuyFuel?: () => void;
  onToggleNavigation?: () => void;
  onUndock?: () => void;
  onDock?: () => void;
  onAdvanceDay?: () => void;
  onTogglePause?: () => void;
  onSetSpeed?: (speed: 1 | 2 | 5) => void;
  onTabChange?: (tab: PlayingTab) => void;
}

export function renderLeftSidebar(
  gameData: GameData,
  callbacks: SidebarCallbacks
): HTMLElement {
  const sidebar = document.createElement('div');
  sidebar.className = 'left-sidebar';

  // TIME CONTROLS SECTION (at TOP)
  const timeControlsSection = document.createElement('div');
  timeControlsSection.className = 'sidebar-section time-controls';
  timeControlsSection.style.borderBottom = '1px solid #444';
  timeControlsSection.style.paddingBottom = '12px';
  timeControlsSection.style.marginBottom = '16px';

  // Game time display
  const timeDisplay = document.createElement('div');
  timeDisplay.style.fontSize = '13px';
  timeDisplay.style.color = '#4a9eff';
  timeDisplay.style.marginBottom = '8px';
  timeDisplay.style.fontWeight = 'bold';
  timeDisplay.textContent = formatGameDate(gameData.gameTime);
  timeControlsSection.appendChild(timeDisplay);

  // Play/Pause Toggle Button
  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'time-control-btn play-pause';
  playPauseBtn.innerHTML = gameData.isPaused
    ? '▶ <span>Resume</span>'
    : '⏸ <span>Pause</span>';
  playPauseBtn.style.width = '100%';
  playPauseBtn.style.marginBottom = '8px';
  playPauseBtn.addEventListener('click', () => {
    if (callbacks.onTogglePause) callbacks.onTogglePause();
  });
  timeControlsSection.appendChild(playPauseBtn);

  // Speed status display
  const speedStatus = document.createElement('div');
  speedStatus.style.fontSize = '11px';
  speedStatus.style.color = '#aaa';
  speedStatus.style.marginBottom = '6px';
  const currentSpeed = gameData.timeSpeed ?? 1;
  speedStatus.textContent = gameData.isPaused
    ? 'Speed: -- (paused)'
    : `Speed: ${currentSpeed}x`;
  timeControlsSection.appendChild(speedStatus);

  // Speed Controls Row
  const speedRow = document.createElement('div');
  speedRow.className = 'time-speed-controls';
  speedRow.style.display = 'flex';
  speedRow.style.gap = '4px';

  for (const speed of [1, 2, 5] as const) {
    const speedBtn = document.createElement('button');
    speedBtn.className = 'time-speed-btn';
    speedBtn.textContent = `${speed}x`;
    speedBtn.disabled = gameData.isPaused;

    const currentSpeed = gameData.timeSpeed ?? 1;
    if (currentSpeed === speed && !gameData.isPaused) {
      speedBtn.classList.add('active');
    }

    speedBtn.addEventListener('click', () => {
      if (callbacks.onSetSpeed) callbacks.onSetSpeed(speed);
    });
    speedRow.appendChild(speedBtn);
  }

  timeControlsSection.appendChild(speedRow);
  sidebar.appendChild(timeControlsSection);

  // Credits section
  const creditsSection = document.createElement('div');
  creditsSection.className = 'sidebar-section';

  const creditsLabel = document.createElement('h3');
  creditsLabel.textContent = 'Credits';
  creditsSection.appendChild(creditsLabel);

  const creditsValue = document.createElement('div');
  creditsValue.style.fontSize = '24px';
  creditsValue.style.fontWeight = 'bold';
  creditsValue.style.color = '#4a9eff';
  creditsValue.textContent = Math.round(gameData.credits).toLocaleString();
  creditsSection.appendChild(creditsValue);

  sidebar.appendChild(creditsSection);

  // Location section
  const locationSection = document.createElement('div');
  locationSection.className = 'sidebar-section';

  const locationLabel = document.createElement('h3');
  locationLabel.textContent = 'Location';
  locationSection.appendChild(locationLabel);

  const ship = getActiveShip(gameData);
  const locationValue = document.createElement('div');
  locationValue.style.fontSize = '14px';
  locationValue.style.color = '#eee';

  if (ship.location.status === 'in_flight' && ship.activeFlightPlan) {
    const origin = gameData.world.locations.find(
      (l) => l.id === ship.activeFlightPlan!.origin
    );
    const destination = gameData.world.locations.find(
      (l) => l.id === ship.activeFlightPlan!.destination
    );
    locationValue.textContent = `${origin?.name || '?'} → ${destination?.name || '?'}`;
  } else if (ship.location.status === 'orbiting' && ship.location.orbitingAt) {
    const location = gameData.world.locations.find(
      (l) => l.id === ship.location.orbitingAt
    );
    locationValue.textContent = `Orbiting ${location?.name || 'Unknown'}`;
  } else if (ship.location.dockedAt) {
    const location = gameData.world.locations.find(
      (l) => l.id === ship.location.dockedAt
    );
    locationValue.textContent = location?.name || 'Unknown';
  } else {
    locationValue.textContent = 'In Space';
  }
  locationSection.appendChild(locationValue);

  sidebar.appendChild(locationSection);

  // Fuel section
  const fuelSection = document.createElement('div');
  fuelSection.className = 'sidebar-section';

  const fuelLabel = document.createElement('h3');
  fuelLabel.textContent = 'Fuel';
  fuelSection.appendChild(fuelLabel);

  fuelSection.appendChild(
    renderStatBar({
      label: `${ship.fuel.toFixed(1)}%`,
      percentage: ship.fuel,
      colorClass: getFuelColorClass(ship.fuel),
      mode: 'compact',
    })
  );

  sidebar.appendChild(fuelSection);

  // Power section
  const powerSection = document.createElement('div');
  powerSection.className = 'sidebar-section';

  const powerLabel = document.createElement('h3');
  powerLabel.textContent = 'Power';
  powerSection.appendChild(powerLabel);

  const powerStatus = computePowerStatus(ship);
  const powerValueLabel =
    powerStatus.totalOutput > 0
      ? `${powerStatus.totalDraw}/${powerStatus.totalOutput} kW`
      : 'NO POWER';

  // Build tooltip showing power draw breakdown
  const drawItems: Array<{ name: string; draw: number }> = [];
  const engineDef = getEngineDefinition(ship.engine.definitionId);

  // Rooms
  for (const room of ship.rooms) {
    const roomDef = getRoomDefinition(room.type);
    if (!roomDef) continue;
    const isActive =
      roomDef.alwaysPowered ||
      (room.assignedCrewIds.length > 0 && room.state === 'operational');
    if (isActive && roomDef.powerDraw > 0) {
      drawItems.push({ name: roomDef.name, draw: roomDef.powerDraw });
    }
  }

  // Equipment
  for (const equipment of ship.equipment) {
    const equipDef = getEquipmentDefinition(equipment.definitionId);
    if (equipDef && equipDef.powerDraw > 0) {
      drawItems.push({ name: equipDef.name, draw: equipDef.powerDraw });
    }
  }

  // Engine self-draw
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

  // Show full capacity when power is available, with draw as overlay
  const basePercentage =
    powerStatus.powerSource === 'berth' || powerStatus.powerSource === 'drives'
      ? 100
      : 0;

  // Determine overlay color based on power draw
  let overlayColorClass = 'bar-warning';
  if (powerStatus.isOverloaded) {
    overlayColorClass = 'bar-danger';
  }

  // powerStatus.percentage is (draw/output)*100
  // Overlay should show this drawn percentage
  const drawnPercentage = powerStatus.percentage;

  const powerBar = renderStatBar({
    label: powerValueLabel,
    percentage: basePercentage,
    colorClass: 'bar-good',
    mode: 'compact',
    overlay:
      basePercentage > 0
        ? {
            percentage: drawnPercentage,
            colorClass: overlayColorClass,
          }
        : undefined,
  });

  // Attach custom tooltip
  attachTooltip(powerBar, {
    content: tooltipContent,
    followMouse: false,
  });

  powerSection.appendChild(powerBar);

  sidebar.appendChild(powerSection);

  // Quick actions section
  const actionsSection = document.createElement('div');
  actionsSection.className = 'sidebar-section';

  const actionsLabel = document.createElement('h3');
  actionsLabel.textContent = 'Quick Actions';
  actionsSection.appendChild(actionsLabel);

  let hasActions = false;

  // Navigation button (when docked or orbiting)
  if (
    callbacks.onTabChange &&
    (ship.location.status === 'docked' || ship.location.status === 'orbiting')
  ) {
    const navBtn = document.createElement('button');
    navBtn.textContent = '🗺️ Navigate';
    navBtn.className = 'small-button';
    navBtn.style.width = '100%';
    navBtn.style.marginBottom = '8px';
    navBtn.addEventListener('click', () => callbacks.onTabChange!('nav'));
    actionsSection.appendChild(navBtn);
    hasActions = true;
  }

  // Refuel button (when docked and not full)
  if (
    callbacks.onBuyFuel &&
    ship.location.status === 'docked' &&
    ship.fuel < 100
  ) {
    const refuelBtn = document.createElement('button');
    refuelBtn.textContent = 'Refuel';
    refuelBtn.className = 'small-button';
    refuelBtn.style.width = '100%';
    refuelBtn.style.marginBottom = '8px';
    refuelBtn.addEventListener('click', callbacks.onBuyFuel);
    actionsSection.appendChild(refuelBtn);
    hasActions = true;
  }

  // Undock button (when docked)
  if (callbacks.onUndock && ship.location.status === 'docked') {
    const undockBtn = document.createElement('button');
    undockBtn.textContent = 'Undock';
    undockBtn.className = 'small-button';
    undockBtn.style.width = '100%';
    undockBtn.style.marginBottom = '8px';
    undockBtn.addEventListener('click', callbacks.onUndock);
    actionsSection.appendChild(undockBtn);
    hasActions = true;
  }

  // Dock button (when in flight or orbiting)
  if (
    callbacks.onDock &&
    (ship.location.status === 'in_flight' ||
      ship.location.status === 'orbiting')
  ) {
    const dockBtn = document.createElement('button');
    dockBtn.textContent =
      ship.location.status === 'orbiting' ? 'Dock' : 'Dock at Nearest Port';
    dockBtn.className = 'small-button';
    dockBtn.style.width = '100%';
    dockBtn.style.marginBottom = '8px';
    dockBtn.addEventListener('click', callbacks.onDock);
    actionsSection.appendChild(dockBtn);
    hasActions = true;
  }

  if (hasActions) {
    sidebar.appendChild(actionsSection);
  }

  return sidebar;
}

export function renderRightSidebar(gameData: GameData): HTMLElement {
  const sidebar = document.createElement('div');
  sidebar.className = 'right-sidebar';

  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const shipClass = getShipClass(ship.classId);

  // Date section
  const dateSection = document.createElement('div');
  dateSection.className = 'sidebar-section';
  dateSection.style.fontSize = '13px';
  dateSection.style.color = '#4a9eff';
  dateSection.style.fontWeight = 'bold';
  dateSection.style.textAlign = 'center';
  dateSection.style.padding = '8px 0';
  dateSection.textContent = formatGameDate(gameData.gameTime);
  sidebar.appendChild(dateSection);

  // Ship info section
  const shipInfoSection = document.createElement('div');
  shipInfoSection.className = 'sidebar-section';

  const shipName = document.createElement('div');
  shipName.style.fontSize = '16px';
  shipName.style.fontWeight = 'bold';
  shipName.style.color = '#e94560';
  shipName.style.marginBottom = '4px';
  shipName.textContent = ship.name;
  shipInfoSection.appendChild(shipName);

  const shipClassInfo = document.createElement('div');
  shipClassInfo.style.fontSize = '11px';
  shipClassInfo.style.color = '#888';
  shipClassInfo.textContent = shipClass?.name || ship.classId;
  shipInfoSection.appendChild(shipClassInfo);

  sidebar.appendChild(shipInfoSection);

  // Captain section
  const captain = ship.crew.find((c) => c.role === 'captain');
  if (captain) {
    const captainSection = document.createElement('div');
    captainSection.className = 'sidebar-section';

    const captainLabel = document.createElement('h3');
    captainLabel.textContent = 'Captain';
    captainSection.appendChild(captainLabel);

    const captainName = document.createElement('div');
    captainName.style.fontSize = '13px';
    captainName.style.color = '#eee';
    captainName.textContent = captain.name;
    captainSection.appendChild(captainName);

    sidebar.appendChild(captainSection);
  }

  // Crew section
  const crewSection = document.createElement('div');
  crewSection.className = 'sidebar-section';

  const crewLabel = document.createElement('h3');
  crewLabel.textContent = 'Crew';
  crewSection.appendChild(crewLabel);

  const maxCrew = shipClass?.maxCrew ?? '?';
  const crewInfo = document.createElement('div');
  crewInfo.style.fontSize = '12px';
  crewInfo.style.lineHeight = '1.6';

  // Calculate fleet-wide crew cost per tick
  let totalCrewCostPerTick = 0;
  for (const s of gameData.ships) {
    for (const crewMember of s.crew) {
      const roleDef = getCrewRoleDefinition(crewMember.role);
      if (roleDef) {
        totalCrewCostPerTick += roleDef.salary;
      }
    }
  }

  // Convert to per-day cost
  const totalCrewCostPerDay = totalCrewCostPerTick * TICKS_PER_DAY;

  crewInfo.innerHTML = `
    <div><span style="color: #888;">This Ship:</span> ${ship.crew.length}/${maxCrew}</div>
    <div><span style="color: #888;">Crew Cost:</span> ${totalCrewCostPerDay} cr/day</div>
  `;
  crewSection.appendChild(crewInfo);

  sidebar.appendChild(crewSection);

  // Engine section
  const engineSection = document.createElement('div');
  engineSection.className = 'sidebar-section';

  const engineLabel = document.createElement('h3');
  engineLabel.textContent = 'Engine';
  engineSection.appendChild(engineLabel);

  const engineInfo = document.createElement('div');
  engineInfo.style.fontSize = '12px';
  engineInfo.textContent = engineDef.name;
  engineSection.appendChild(engineInfo);

  sidebar.appendChild(engineSection);

  // Torch systems section (if applicable)
  if (engineDef.radiationOutput || engineDef.wasteHeatOutput) {
    const torchSection = document.createElement('div');
    torchSection.className = 'sidebar-section';

    const torchLabel = document.createElement('h3');
    torchLabel.textContent = 'Torch Systems';
    torchSection.appendChild(torchLabel);

    if (engineDef.radiationOutput) {
      const radiationDiv = document.createElement('div');
      radiationDiv.className = 'sidebar-item';
      radiationDiv.innerHTML =
        '<div style="font-size: 11px; margin-bottom: 4px;">Radiation</div>';

      const radiationData = getRadiationData(gameData);
      radiationDiv.appendChild(
        renderStatBar({
          label: radiationData.label,
          percentage: radiationData.percentage,
          colorClass: radiationData.colorClass,
          mode: 'compact',
        })
      );

      torchSection.appendChild(radiationDiv);
    }

    if (engineDef.wasteHeatOutput) {
      const heatDiv = document.createElement('div');
      heatDiv.className = 'sidebar-item';
      heatDiv.innerHTML =
        '<div style="font-size: 11px; margin-bottom: 4px;">Heat</div>';

      const heatData = getHeatData(gameData);
      heatDiv.appendChild(
        renderStatBar({
          label: heatData.label,
          percentage: heatData.percentage,
          colorClass: heatData.colorClass,
          mode: 'compact',
        })
      );

      torchSection.appendChild(heatDiv);
    }

    sidebar.appendChild(torchSection);
  }

  // Active quest section
  if (ship.activeContract) {
    const questSection = document.createElement('div');
    questSection.className = 'sidebar-section';

    const questLabel = document.createElement('h3');
    questLabel.textContent = 'Active Quest';
    questSection.appendChild(questLabel);

    const questInfo = document.createElement('div');
    questInfo.style.fontSize = '12px';
    questInfo.style.lineHeight = '1.6';

    const contract = ship.activeContract;
    const totalPayment =
      contract.quest.paymentPerTrip + contract.quest.paymentOnCompletion;
    questInfo.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">${contract.quest.title}</div>
      <div><span style="color: #888;">Reward:</span> ${totalPayment.toLocaleString()}</div>
    `;
    questSection.appendChild(questInfo);

    sidebar.appendChild(questSection);
  }

  return sidebar;
}

// Helper functions

function getFuelColorClass(fuel: number): string {
  if (fuel <= 20) return 'bar-danger';
  if (fuel <= 50) return 'bar-warning';
  return 'bar-good';
}

function getRadiationData(gameData: GameData): {
  percentage: number;
  label: string;
  colorClass: string;
} {
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
  if (netRadiation > 30) colorClass = 'bar-danger';
  else if (netRadiation > 15) colorClass = 'bar-warning';

  const label =
    ship.engine.state === 'online' ? `${netRadiation.toFixed(0)} rad` : 'OFF';

  return { percentage, label, colorClass };
}

function getHeatData(gameData: GameData): {
  percentage: number;
  label: string;
  colorClass: string;
} {
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

  const netHeat = Math.max(0, engineHeat - totalDissipation);
  const percentage = engineHeat > 0 ? (netHeat / engineHeat) * 100 : 0;

  let colorClass = 'bar-good';
  if (netHeat > 30) colorClass = 'bar-danger';
  else if (netHeat > 15) colorClass = 'bar-warning';

  const label =
    ship.engine.state === 'online' ? `${netHeat.toFixed(0)} kW` : 'OFF';

  return { percentage, label, colorClass };
}
