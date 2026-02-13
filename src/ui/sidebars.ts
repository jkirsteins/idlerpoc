import type { GameData } from '../models';
import { getActiveShip } from '../models';
import type { PlayingTab } from './types';
import { computePowerStatus } from '../powerSystem';
import { getEngineDefinition } from '../engines';
import {
  getEquipmentDefinition,
  getEffectiveRadiationShielding,
  getEffectiveHeatDissipation,
} from '../equipment';
import { getShipClass } from '../shipClasses';
import { formatGameDate } from '../timeSystem';
import { formatCredits, formatMass } from '../formatting';
import { calculateDailyLedger } from '../dailyLedger';
import { getRoomDefinition } from '../rooms';
import { renderStatBar } from './components/statBar';
import { attachTooltip, formatPowerTooltip } from './components/tooltip';
import type { Component } from './component';
import {
  formatFuelMass,
  calculateFuelPercentage,
  getFuelColorClass,
} from './fuelFormatting';
import { getProvisionsColorClass } from './provisionsFormatting';
import {
  getMaxProvisionsKg,
  getProvisionsSurvivalDays,
} from '../provisionsSystem';
import { isHelmManned } from '../jobSlots';
import { getFeaturedArc } from '../arcDetector';

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

export function createLeftSidebar(
  gameData: GameData,
  callbacks: SidebarCallbacks
): Component {
  const sidebar = document.createElement('div');
  sidebar.className = 'left-sidebar';

  // ── TIME CONTROLS SECTION ──
  const timeControlsSection = document.createElement('div');
  timeControlsSection.className = 'sidebar-section time-controls';
  timeControlsSection.style.borderBottom = '1px solid #444';
  timeControlsSection.style.paddingBottom = '12px';
  timeControlsSection.style.marginBottom = '16px';

  const timeDisplay = document.createElement('div');
  timeDisplay.style.fontSize = '13px';
  timeDisplay.style.color = '#4a9eff';
  timeDisplay.style.marginBottom = '8px';
  timeDisplay.style.fontWeight = 'bold';
  timeControlsSection.appendChild(timeDisplay);

  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'time-control-btn play-pause';
  playPauseBtn.style.width = '100%';
  playPauseBtn.style.marginBottom = '8px';
  // Stable child elements for the play/pause button content
  const playPauseIcon = document.createTextNode('');
  const playPauseLabel = document.createElement('span');
  playPauseBtn.appendChild(playPauseIcon);
  playPauseBtn.appendChild(document.createTextNode(' '));
  playPauseBtn.appendChild(playPauseLabel);
  playPauseBtn.addEventListener('click', () => {
    if (callbacks.onTogglePause) callbacks.onTogglePause();
  });
  timeControlsSection.appendChild(playPauseBtn);

  sidebar.appendChild(timeControlsSection);

  // ── CREDITS SECTION ──
  const creditsSection = document.createElement('div');
  creditsSection.className = 'sidebar-section';

  const creditsLabel = document.createElement('h3');
  creditsLabel.textContent = 'Credits';
  creditsSection.appendChild(creditsLabel);

  const creditsValue = document.createElement('div');
  creditsValue.style.fontSize = '24px';
  creditsValue.style.fontWeight = 'bold';
  creditsValue.style.color = '#4a9eff';
  creditsSection.appendChild(creditsValue);

  sidebar.appendChild(creditsSection);

  // ── LOCATION SECTION ──
  const locationSection = document.createElement('div');
  locationSection.className = 'sidebar-section';

  const locationLabel = document.createElement('h3');
  locationLabel.textContent = 'Location';
  locationSection.appendChild(locationLabel);

  const locationValue = document.createElement('div');
  locationValue.style.fontSize = '14px';
  locationValue.style.color = '#eee';
  locationSection.appendChild(locationValue);

  sidebar.appendChild(locationSection);

  // ── FUEL SECTION ──
  const fuelSection = document.createElement('div');
  fuelSection.className = 'sidebar-section';

  const fuelLabel = document.createElement('h3');
  fuelLabel.textContent = 'Fuel';
  fuelSection.appendChild(fuelLabel);

  const fuelBarSlot = document.createElement('div');
  fuelSection.appendChild(fuelBarSlot);

  sidebar.appendChild(fuelSection);

  // ── PROVISIONS SECTION ──
  const provisionsSection = document.createElement('div');
  provisionsSection.className = 'sidebar-section';

  const provisionsLabel = document.createElement('h3');
  provisionsLabel.textContent = 'Provisions';
  provisionsSection.appendChild(provisionsLabel);

  const provisionsBarSlot = document.createElement('div');
  provisionsSection.appendChild(provisionsBarSlot);

  sidebar.appendChild(provisionsSection);

  // ── POWER SECTION ──
  const powerSection = document.createElement('div');
  powerSection.className = 'sidebar-section';

  const powerLabel = document.createElement('h3');
  powerLabel.textContent = 'Power';
  powerSection.appendChild(powerLabel);

  const powerBarSlot = document.createElement('div');
  powerSection.appendChild(powerBarSlot);

  sidebar.appendChild(powerSection);

  // ── QUICK ACTIONS SECTION ──
  const actionsSection = document.createElement('div');
  actionsSection.className = 'sidebar-section';

  const actionsLabel = document.createElement('h3');
  actionsLabel.textContent = 'Quick Actions';
  actionsSection.appendChild(actionsLabel);

  // Navigation button
  const navBtn = document.createElement('button');
  navBtn.textContent = '\u{1F5FA}\uFE0F Navigate';
  navBtn.className = 'small-button';
  navBtn.style.width = '100%';
  navBtn.style.marginBottom = '8px';
  navBtn.addEventListener('click', () => {
    if (callbacks.onTabChange) callbacks.onTabChange('nav');
  });
  actionsSection.appendChild(navBtn);

  // Refuel button
  const refuelBtn = document.createElement('button');
  refuelBtn.textContent = 'Refuel';
  refuelBtn.className = 'small-button';
  refuelBtn.style.width = '100%';
  refuelBtn.style.marginBottom = '8px';
  refuelBtn.addEventListener('click', () => {
    if (callbacks.onBuyFuel) callbacks.onBuyFuel();
  });
  actionsSection.appendChild(refuelBtn);

  // Undock button
  const undockBtn = document.createElement('button');
  undockBtn.textContent = 'Undock';
  undockBtn.className = 'small-button';
  undockBtn.style.width = '100%';
  undockBtn.style.marginBottom = '8px';
  undockBtn.addEventListener('click', () => {
    if (callbacks.onUndock) callbacks.onUndock();
  });
  actionsSection.appendChild(undockBtn);

  // Dock button
  const dockBtn = document.createElement('button');
  dockBtn.className = 'small-button';
  dockBtn.style.width = '100%';
  dockBtn.style.marginBottom = '8px';
  dockBtn.addEventListener('click', () => {
    if (callbacks.onDock) callbacks.onDock();
  });
  actionsSection.appendChild(dockBtn);

  sidebar.appendChild(actionsSection);

  // ── UPDATE FUNCTION ──
  function update(gameData: GameData): void {
    const ship = getActiveShip(gameData);

    // Time display
    timeDisplay.textContent = formatGameDate(gameData.gameTime);

    // Play/Pause button
    if (gameData.isPaused) {
      playPauseIcon.textContent = '\u25B6';
      playPauseLabel.textContent = 'Resume';
    } else {
      playPauseIcon.textContent = '\u23F8';
      playPauseLabel.textContent = 'Pause';
    }

    // Credits
    creditsValue.textContent = Math.round(gameData.credits).toLocaleString();

    // Location
    if (ship.location.status === 'in_flight' && ship.activeFlightPlan) {
      const origin = gameData.world.locations.find(
        (l) => l.id === ship.activeFlightPlan!.origin
      );
      const destination = gameData.world.locations.find(
        (l) => l.id === ship.activeFlightPlan!.destination
      );
      locationValue.textContent = `${origin?.name || '?'} \u2192 ${destination?.name || '?'}`;
    } else if (
      ship.location.status === 'orbiting' &&
      ship.location.orbitingAt
    ) {
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

    // Fuel bar
    const fuelPercentage = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
    const newFuelBar = renderStatBar({
      label: formatFuelMass(ship.fuelKg),
      percentage: fuelPercentage,
      colorClass: getFuelColorClass(fuelPercentage),
      mode: 'compact',
    });
    if (fuelBarSlot.firstChild) fuelBarSlot.removeChild(fuelBarSlot.firstChild);
    fuelBarSlot.appendChild(newFuelBar);

    // Provisions bar
    const maxProvisions = getMaxProvisionsKg(ship);
    const provisionsPercentage =
      maxProvisions > 0
        ? Math.min(100, (ship.provisionsKg / maxProvisions) * 100)
        : 0;
    const provisionsSurvivalDays = getProvisionsSurvivalDays(ship);

    let provisionsLabelText: string;
    if (ship.crew.length === 0) {
      provisionsLabelText = formatMass(Math.round(ship.provisionsKg));
    } else if (provisionsSurvivalDays < Infinity) {
      provisionsLabelText = `${formatMass(Math.round(ship.provisionsKg))} (${Math.ceil(provisionsSurvivalDays)}d)`;
    } else {
      provisionsLabelText = formatMass(Math.round(ship.provisionsKg));
    }

    const provisionsColorClass =
      ship.crew.length === 0
        ? 'bar-inactive'
        : getProvisionsColorClass(provisionsPercentage);

    const newProvisionsBar = renderStatBar({
      label: provisionsLabelText,
      percentage: provisionsPercentage,
      colorClass: provisionsColorClass,
      mode: 'compact',
    });
    if (provisionsBarSlot.firstChild)
      provisionsBarSlot.removeChild(provisionsBarSlot.firstChild);
    provisionsBarSlot.appendChild(newProvisionsBar);

    // Power bar
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
        (ship.jobSlots.some(
          (s) => s.sourceRoomId === room.id && s.assignedCrewId !== null
        ) &&
          room.state === 'operational');
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

    const basePercentage =
      powerStatus.powerSource === 'berth' ||
      powerStatus.powerSource === 'drives'
        ? 100
        : 0;

    let overlayColorClass = 'bar-warning';
    if (powerStatus.isOverloaded) {
      overlayColorClass = 'bar-danger';
    }

    const drawnPercentage = powerStatus.percentage;

    const newPowerBar = renderStatBar({
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

    attachTooltip(newPowerBar, {
      content: tooltipContent,
      followMouse: false,
    });

    if (powerBarSlot.firstChild)
      powerBarSlot.removeChild(powerBarSlot.firstChild);
    powerBarSlot.appendChild(newPowerBar);

    // Quick actions visibility
    const isDocked = ship.location.status === 'docked';
    const isOrbiting = ship.location.status === 'orbiting';
    const isInFlight = ship.location.status === 'in_flight';

    // Nav button: show when docked or orbiting
    const showNav = !!(callbacks.onTabChange && (isDocked || isOrbiting));
    navBtn.style.display = showNav ? '' : 'none';

    // Refuel button: show when docked and not full
    const showRefuel = !!(
      callbacks.onBuyFuel &&
      isDocked &&
      ship.fuelKg < ship.maxFuelKg
    );
    refuelBtn.style.display = showRefuel ? '' : 'none';

    // Undock button: show when docked, disable when helm unmanned
    const showUndock = !!(callbacks.onUndock && isDocked);
    undockBtn.style.display = showUndock ? '' : 'none';
    if (showUndock) {
      const helmOk = isHelmManned(ship);
      undockBtn.disabled = !helmOk;
      undockBtn.title = helmOk
        ? ''
        : 'Helm is unmanned — assign crew to the helm before undocking';
    }

    // Dock button: show when in flight or orbiting
    const showDock = !!(callbacks.onDock && (isInFlight || isOrbiting));
    dockBtn.style.display = showDock ? '' : 'none';
    dockBtn.textContent = isOrbiting ? 'Dock' : 'Dock at Nearest Port';

    // Show/hide whole actions section
    const hasActions = showNav || showRefuel || showUndock || showDock;
    actionsSection.style.display = hasActions ? '' : 'none';
  }

  // Initial render
  update(gameData);
  return { el: sidebar, update };
}

export function createRightSidebar(gameData: GameData): Component {
  const sidebar = document.createElement('div');
  sidebar.className = 'right-sidebar';

  // ── DATE SECTION ──
  const dateSection = document.createElement('div');
  dateSection.className = 'sidebar-section';
  dateSection.style.fontSize = '13px';
  dateSection.style.color = '#4a9eff';
  dateSection.style.fontWeight = 'bold';
  dateSection.style.textAlign = 'center';
  dateSection.style.padding = '8px 0';
  sidebar.appendChild(dateSection);

  // ── SHIP INFO SECTION ──
  const shipInfoSection = document.createElement('div');
  shipInfoSection.className = 'sidebar-section';

  const shipNameEl = document.createElement('div');
  shipNameEl.style.fontSize = '16px';
  shipNameEl.style.fontWeight = 'bold';
  shipNameEl.style.color = '#e94560';
  shipNameEl.style.marginBottom = '4px';
  shipInfoSection.appendChild(shipNameEl);

  const shipClassInfo = document.createElement('div');
  shipClassInfo.style.fontSize = '11px';
  shipClassInfo.style.color = '#888';
  shipInfoSection.appendChild(shipClassInfo);

  sidebar.appendChild(shipInfoSection);

  // ── CAPTAIN SECTION ──
  const captainSection = document.createElement('div');
  captainSection.className = 'sidebar-section';

  const captainLabel = document.createElement('h3');
  captainLabel.textContent = 'Captain';
  captainSection.appendChild(captainLabel);

  const captainNameEl = document.createElement('div');
  captainNameEl.style.fontSize = '13px';
  captainNameEl.style.color = '#eee';
  captainSection.appendChild(captainNameEl);

  sidebar.appendChild(captainSection);

  // ── CREW SECTION ──
  const crewSection = document.createElement('div');
  crewSection.className = 'sidebar-section';

  const crewLabel = document.createElement('h3');
  crewLabel.textContent = 'Crew';
  crewSection.appendChild(crewLabel);

  const crewInfo = document.createElement('div');
  crewInfo.style.fontSize = '12px';
  crewInfo.style.lineHeight = '1.6';

  // Ship crew line
  const shipCrewLine = document.createElement('div');
  const shipCrewLabelSpan = document.createElement('span');
  shipCrewLabelSpan.style.color = '#888';
  shipCrewLabelSpan.textContent = 'This Ship: ';
  const shipCrewCount = document.createElement('span');
  shipCrewLine.appendChild(shipCrewLabelSpan);
  shipCrewLine.appendChild(shipCrewCount);
  crewInfo.appendChild(shipCrewLine);

  crewSection.appendChild(crewInfo);
  sidebar.appendChild(crewSection);

  // ── DAILY LEDGER SECTION ──
  const ledgerSection = document.createElement('div');
  ledgerSection.className = 'sidebar-section';

  const ledgerLabel = document.createElement('h3');
  ledgerLabel.textContent = 'Daily Ledger';
  ledgerSection.appendChild(ledgerLabel);

  const ledgerInfo = document.createElement('div');
  ledgerInfo.style.fontSize = '12px';
  ledgerInfo.style.lineHeight = '1.6';

  // Income line
  const incomeLine = document.createElement('div');
  const incomeLabelSpan = document.createElement('span');
  incomeLabelSpan.style.color = '#888';
  incomeLabelSpan.textContent = 'Income: ';
  const incomeValue = document.createElement('span');
  incomeValue.style.color = '#4ade80';
  incomeLine.appendChild(incomeLabelSpan);
  incomeLine.appendChild(incomeValue);
  ledgerInfo.appendChild(incomeLine);

  // Crew cost line
  const ledgerCrewLine = document.createElement('div');
  const ledgerCrewLabelSpan = document.createElement('span');
  ledgerCrewLabelSpan.style.color = '#888';
  ledgerCrewLabelSpan.textContent = 'Crew: ';
  const ledgerCrewValue = document.createElement('span');
  ledgerCrewValue.style.color = '#ffa500';
  ledgerCrewLine.appendChild(ledgerCrewLabelSpan);
  ledgerCrewLine.appendChild(ledgerCrewValue);
  ledgerInfo.appendChild(ledgerCrewLine);

  // Fuel cost line
  const ledgerFuelLine = document.createElement('div');
  const ledgerFuelLabelSpan = document.createElement('span');
  ledgerFuelLabelSpan.style.color = '#888';
  ledgerFuelLabelSpan.textContent = 'Fuel: ';
  const ledgerFuelValue = document.createElement('span');
  ledgerFuelValue.style.color = '#ffa500';
  ledgerFuelLine.appendChild(ledgerFuelLabelSpan);
  ledgerFuelLine.appendChild(ledgerFuelValue);
  ledgerInfo.appendChild(ledgerFuelLine);

  // Separator
  const ledgerSep = document.createElement('div');
  ledgerSep.style.borderTop = '1px solid #444';
  ledgerSep.style.margin = '4px 0';
  ledgerInfo.appendChild(ledgerSep);

  // Net line
  const netLine = document.createElement('div');
  const netLabelSpan = document.createElement('span');
  netLabelSpan.style.color = '#888';
  netLabelSpan.textContent = 'Net: ';
  const netValue = document.createElement('span');
  netValue.style.fontWeight = 'bold';
  netLine.appendChild(netLabelSpan);
  netLine.appendChild(netValue);
  ledgerInfo.appendChild(netLine);

  // Runway line
  const runwayLine = document.createElement('div');
  const runwayLabelSpan = document.createElement('span');
  runwayLabelSpan.style.color = '#888';
  runwayLabelSpan.textContent = 'Runway: ';
  const runwayValue = document.createElement('span');
  runwayLine.appendChild(runwayLabelSpan);
  runwayLine.appendChild(runwayValue);
  ledgerInfo.appendChild(runwayLine);

  ledgerSection.appendChild(ledgerInfo);
  sidebar.appendChild(ledgerSection);

  // ── ENGINE SECTION ──
  const engineSection = document.createElement('div');
  engineSection.className = 'sidebar-section';

  const engineLabel = document.createElement('h3');
  engineLabel.textContent = 'Engine';
  engineSection.appendChild(engineLabel);

  const engineInfo = document.createElement('div');
  engineInfo.style.fontSize = '12px';
  engineSection.appendChild(engineInfo);

  sidebar.appendChild(engineSection);

  // ── TORCH SYSTEMS SECTION ──
  const torchSection = document.createElement('div');
  torchSection.className = 'sidebar-section';

  const torchLabel = document.createElement('h3');
  torchLabel.textContent = 'Torch Systems';
  torchSection.appendChild(torchLabel);

  // Radiation
  const radiationDiv = document.createElement('div');
  radiationDiv.className = 'sidebar-item';

  const radiationTitle = document.createElement('div');
  radiationTitle.style.fontSize = '11px';
  radiationTitle.style.marginBottom = '4px';
  radiationTitle.textContent = 'Radiation';
  radiationDiv.appendChild(radiationTitle);

  const radiationBarSlot = document.createElement('div');
  radiationDiv.appendChild(radiationBarSlot);

  torchSection.appendChild(radiationDiv);

  // Heat
  const heatDiv = document.createElement('div');
  heatDiv.className = 'sidebar-item';

  const heatTitle = document.createElement('div');
  heatTitle.style.fontSize = '11px';
  heatTitle.style.marginBottom = '4px';
  heatTitle.textContent = 'Heat';
  heatDiv.appendChild(heatTitle);

  const heatBarSlot = document.createElement('div');
  heatDiv.appendChild(heatBarSlot);

  torchSection.appendChild(heatDiv);

  sidebar.appendChild(torchSection);

  // ── ACTIVE QUEST SECTION ──
  const questSection = document.createElement('div');
  questSection.className = 'sidebar-section';

  const questLabel = document.createElement('h3');
  questLabel.textContent = 'Active Quest';
  questSection.appendChild(questLabel);

  const questInfo = document.createElement('div');
  questInfo.style.fontSize = '12px';
  questInfo.style.lineHeight = '1.6';

  const questTitle = document.createElement('div');
  questTitle.style.fontWeight = 'bold';
  questTitle.style.marginBottom = '4px';
  questInfo.appendChild(questTitle);

  const questRewardLine = document.createElement('div');
  const questRewardLabelSpan = document.createElement('span');
  questRewardLabelSpan.style.color = '#888';
  questRewardLabelSpan.textContent = 'Reward: ';
  const questRewardValue = document.createElement('span');
  questRewardLine.appendChild(questRewardLabelSpan);
  questRewardLine.appendChild(questRewardValue);
  questInfo.appendChild(questRewardLine);

  questSection.appendChild(questInfo);

  sidebar.appendChild(questSection);

  // ── FEATURED STORY SECTION ──
  const storySection = document.createElement('div');
  storySection.className = 'sidebar-section';
  storySection.style.display = 'none';

  const storyLabel = document.createElement('h3');
  storyLabel.textContent = 'Featured Story';
  storySection.appendChild(storyLabel);

  const storyCard = document.createElement('div');
  storyCard.style.cssText =
    'padding:0.4rem;border-left:2px solid #e94560;background:#16162a;border-radius:3px;';

  const storyTitleEl = document.createElement('div');
  storyTitleEl.style.cssText =
    'color:#e94560;font-weight:bold;font-size:0.85rem;';
  storyCard.appendChild(storyTitleEl);

  const storyActorEl = document.createElement('div');
  storyActorEl.style.cssText = 'color:#888;font-size:0.8rem;';
  storyCard.appendChild(storyActorEl);

  const storyRatingEl = document.createElement('div');
  storyRatingEl.style.cssText = 'color:#ffc107;font-size:0.85rem;';
  storyCard.appendChild(storyRatingEl);

  storySection.appendChild(storyCard);
  sidebar.appendChild(storySection);

  // ── UPDATE FUNCTION ──
  function update(gameData: GameData): void {
    const ship = getActiveShip(gameData);
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    const shipClass = getShipClass(ship.classId);

    // Date
    dateSection.textContent = formatGameDate(gameData.gameTime);

    // Ship info
    shipNameEl.textContent = ship.name;
    shipClassInfo.textContent = shipClass?.name || ship.classId;

    // Captain
    const captain = ship.crew.find((c) => c.isCaptain);
    if (captain) {
      captainNameEl.textContent = captain.name;
      captainSection.style.opacity = '';
    } else {
      captainNameEl.textContent = 'None';
      captainSection.style.opacity = '0.4';
    }

    // Crew
    const maxCrew = shipClass?.maxCrew ?? '?';
    shipCrewCount.textContent = `${ship.crew.length}/${maxCrew}`;

    // Daily ledger
    const ledger = calculateDailyLedger(gameData);

    if (ledger.incomeDays > 0) {
      incomeValue.textContent = `+${formatCredits(Math.round(ledger.incomePerDay))}/day`;
      incomeValue.style.color = '#4caf50';
    } else {
      incomeValue.textContent = 'collecting data\u2026';
      incomeValue.style.color = '#666';
    }

    ledgerCrewValue.textContent = `-${formatCredits(Math.round(ledger.crewCostPerDay))}/day`;
    ledgerFuelValue.textContent = `-${formatCredits(Math.round(ledger.fuelCostPerDay))}/day`;

    const netRounded = Math.round(ledger.netPerDay);
    const netSign = netRounded >= 0 ? '+' : '';
    netValue.textContent = `${netSign}${formatCredits(netRounded)}/day`;
    netValue.style.color = netRounded >= 0 ? '#4ade80' : '#ff4444';

    if (ledger.incomeDays === 0) {
      runwayValue.textContent = 'collecting data\u2026';
      runwayValue.style.color = '#666';
    } else if (ledger.runwayDays !== null) {
      runwayValue.textContent = `${ledger.runwayDays.toFixed(1)} days`;
      runwayValue.style.color = ledger.runwayDays < 3 ? '#ff4444' : '#ffa500';
    } else {
      runwayValue.textContent = 'Stable';
      runwayValue.style.color = '#4ade80';
    }

    // Dim the whole ledger section if no economic activity at all
    ledgerSection.style.opacity =
      ledger.totalExpensePerDay > 0 || ledger.incomePerDay > 0 ? '' : '0.4';

    // Engine
    engineInfo.textContent = engineDef.name;

    // Radiation bar
    const radiationData = getRadiationData(gameData);
    if (radiationBarSlot.firstChild)
      radiationBarSlot.removeChild(radiationBarSlot.firstChild);
    radiationBarSlot.appendChild(
      renderStatBar({
        label: radiationData.label,
        percentage: radiationData.percentage,
        colorClass: radiationData.colorClass,
        mode: 'compact',
      })
    );

    // Heat bar
    const heatData = getHeatData(gameData);
    if (heatBarSlot.firstChild) heatBarSlot.removeChild(heatBarSlot.firstChild);
    heatBarSlot.appendChild(
      renderStatBar({
        label: heatData.label,
        percentage: heatData.percentage,
        colorClass: heatData.colorClass,
        mode: 'compact',
      })
    );

    // Active quest
    if (ship.activeContract) {
      const contract = ship.activeContract;
      const totalPayment =
        contract.quest.paymentPerTrip + contract.quest.paymentOnCompletion;
      questTitle.textContent = contract.quest.title;
      questRewardValue.textContent = totalPayment.toLocaleString();
      questSection.style.opacity = '';
    } else {
      questTitle.textContent = 'No active quest';
      questRewardValue.textContent = '—';
      questSection.style.opacity = '0.4';
    }

    // Featured story
    const featured = getFeaturedArc(gameData);
    if (featured) {
      storySection.style.display = '';
      storyTitleEl.textContent = featured.title;
      storyActorEl.textContent = featured.actorName;
      storyRatingEl.textContent =
        '\u2605'.repeat(featured.rating) + '\u2606'.repeat(5 - featured.rating);
    } else {
      storySection.style.display = 'none';
    }
  }

  // Initial render
  update(gameData);
  return { el: sidebar, update };
}

// Helper functions

function getRadiationData(gameData: GameData): {
  percentage: number;
  label: string;
  colorClass: string;
} {
  const ship = getActiveShip(gameData);
  const engineDef = getEngineDefinition(ship.engine.definitionId);
  const engineRadiation = engineDef.radiationOutput || 0;

  if (engineRadiation === 0) {
    return { percentage: 0, label: 'N/A', colorClass: 'bar-inactive' };
  }

  const totalShielding = getEffectiveRadiationShielding(ship);
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

  if (engineHeat === 0) {
    return { percentage: 0, label: 'N/A', colorClass: 'bar-inactive' };
  }

  const totalDissipation = getEffectiveHeatDissipation(ship);
  const netHeat = Math.max(0, engineHeat - totalDissipation);
  const percentage = engineHeat > 0 ? (netHeat / engineHeat) * 100 : 0;

  let colorClass = 'bar-good';
  if (netHeat > 30) colorClass = 'bar-danger';
  else if (netHeat > 15) colorClass = 'bar-warning';

  const label =
    ship.engine.state === 'online' ? `${netHeat.toFixed(0)} kW` : 'OFF';

  return { percentage, label, colorClass };
}
