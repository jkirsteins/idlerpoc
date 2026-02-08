import type { GameData, Ship } from '../models';
import { getActiveShip } from '../models';
import { getShipClass, SHIP_CLASSES } from '../shipClasses';
import { getEngineDefinition } from '../engines';
import { computeMaxRange } from '../flightPhysics';
import { getCrewRoleDefinition } from '../crewRoles';
import { renderFleetPanel } from './fleetPanel';
import { formatDualTime, TICKS_PER_DAY } from '../timeSystem';

export interface FleetTabCallbacks {
  onSelectShip: (shipId: string) => void;
  onBuyShip: (classId: string, shipName: string) => void;
}

export function renderFleetTab(
  gameData: GameData,
  callbacks: FleetTabCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'fleet-tab';
  container.style.padding = '1rem';

  // Show fleet panel and stats only if there are multiple ships
  if (gameData.ships.length > 1) {
    // Enhanced Fleet Panel
    const panelSection = document.createElement('div');
    panelSection.style.marginBottom = '1.5rem';

    const panelTitle = document.createElement('h3');
    panelTitle.textContent = 'Your Fleet';
    panelTitle.style.marginBottom = '0.75rem';
    panelSection.appendChild(panelTitle);

    panelSection.appendChild(
      renderFleetPanel(gameData, { onSelectShip: callbacks.onSelectShip })
    );

    container.appendChild(panelSection);

    // Fleet Statistics
    container.appendChild(renderFleetStats(gameData));

    // Ship Comparison View
    container.appendChild(renderShipComparison(gameData));
  } else {
    // Single ship - show welcome message
    const welcomeSection = document.createElement('div');
    welcomeSection.style.marginBottom = '1.5rem';
    welcomeSection.style.padding = '1rem';
    welcomeSection.style.background = 'rgba(0, 0, 0, 0.3)';
    welcomeSection.style.border = '1px solid #444';
    welcomeSection.style.borderRadius = '4px';

    const title = document.createElement('h3');
    title.textContent = 'Fleet Management';
    title.style.marginBottom = '0.5rem';
    welcomeSection.appendChild(title);

    const message = document.createElement('p');
    message.style.color = '#aaa';
    message.style.fontSize = '0.9rem';
    message.style.lineHeight = '1.6';
    message.textContent =
      'Welcome to Fleet Management! Expand your operations by purchasing additional ships. Each ship can operate independently, running separate contracts and exploring different regions of space.';
    welcomeSection.appendChild(message);

    container.appendChild(welcomeSection);
  }

  // Ship Purchase Section (only when docked)
  const activeShip = getActiveShip(gameData);
  if (activeShip.location.status === 'docked') {
    container.appendChild(renderShipPurchase(gameData, callbacks));
  } else {
    const dockedHint = document.createElement('div');
    dockedHint.style.marginTop = '1.5rem';
    dockedHint.style.padding = '1rem';
    dockedHint.style.background = 'rgba(0, 0, 0, 0.3)';
    dockedHint.style.border = '1px solid #444';
    dockedHint.style.borderRadius = '4px';
    dockedHint.style.color = '#aaa';
    dockedHint.style.fontSize = '0.9rem';
    dockedHint.textContent =
      '💡 Dock at a station to purchase additional ships.';
    container.appendChild(dockedHint);
  }

  return container;
}

function renderFleetStats(gameData: GameData): HTMLElement {
  const section = document.createElement('div');
  section.className = 'fleet-stats-section';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.background = 'rgba(0, 0, 0, 0.3)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = 'Fleet Overview';
  title.style.marginBottom = '0.75rem';
  section.appendChild(title);

  const statsGrid = document.createElement('div');
  statsGrid.style.display = 'grid';
  statsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
  statsGrid.style.gap = '1rem';

  // Calculate fleet-wide stats
  let totalFleetValue = 0;
  let totalCrew = 0;
  let totalCrewCost = 0;
  let totalFuel = 0;
  let activeContracts = 0;
  let dockedShips = 0;
  let inFlightShips = 0;

  for (const ship of gameData.ships) {
    const shipClass = getShipClass(ship.classId);
    if (shipClass) {
      totalFleetValue += shipClass.price;
    }
    totalCrew += ship.crew.length;
    totalFuel += ship.fuel;

    for (const crew of ship.crew) {
      const roleDef = getCrewRoleDefinition(crew.role);
      if (roleDef) {
        totalCrewCost += roleDef.salary;
      }
    }

    if (ship.activeContract) {
      activeContracts++;
    }

    if (ship.location.status === 'docked') {
      dockedShips++;
    } else {
      inFlightShips++;
    }
  }

  const avgFuel =
    gameData.ships.length > 0 ? totalFuel / gameData.ships.length : 0;

  // Total Fleet Value
  const valueCard = createStatCard(
    'Total Fleet Value',
    `${totalFleetValue.toLocaleString()} cr`,
    '#4a9eff'
  );
  statsGrid.appendChild(valueCard);

  // Total Crew
  const crewCard = createStatCard('Total Crew', `${totalCrew}`, '#fff');
  statsGrid.appendChild(crewCard);

  // Daily Crew Cost
  const costCard = createStatCard(
    'Daily Crew Cost',
    `${(totalCrewCost * TICKS_PER_DAY).toFixed(0)} cr/day`,
    '#ffa500'
  );
  statsGrid.appendChild(costCard);

  // Average Fuel
  const fuelColor =
    avgFuel < 20 ? '#ff4444' : avgFuel < 50 ? '#fbbf24' : '#4ade80';
  const fuelCard = createStatCard(
    'Average Fuel',
    `${avgFuel.toFixed(0)}%`,
    fuelColor
  );
  statsGrid.appendChild(fuelCard);

  // Active Contracts
  const contractsCard = createStatCard(
    'Active Contracts',
    `${activeContracts}`,
    activeContracts > 0 ? '#4ade80' : '#888'
  );
  statsGrid.appendChild(contractsCard);

  // Fleet Status
  const statusCard = createStatCard(
    'Fleet Status',
    `${dockedShips} docked, ${inFlightShips} in flight`,
    '#aaa'
  );
  statsGrid.appendChild(statusCard);

  section.appendChild(statsGrid);

  return section;
}

function createStatCard(
  label: string,
  value: string,
  color: string
): HTMLElement {
  const card = document.createElement('div');
  card.style.padding = '0.75rem';
  card.style.background = 'rgba(0, 0, 0, 0.4)';
  card.style.border = '1px solid #555';
  card.style.borderRadius = '4px';

  const labelDiv = document.createElement('div');
  labelDiv.style.fontSize = '0.85rem';
  labelDiv.style.color = '#888';
  labelDiv.style.marginBottom = '0.25rem';
  labelDiv.textContent = label;
  card.appendChild(labelDiv);

  const valueDiv = document.createElement('div');
  valueDiv.style.fontSize = '1.25rem';
  valueDiv.style.fontWeight = 'bold';
  valueDiv.style.color = color;
  valueDiv.textContent = value;
  card.appendChild(valueDiv);

  return card;
}

function renderShipComparison(gameData: GameData): HTMLElement {
  const section = document.createElement('div');
  section.className = 'ship-comparison-section';
  section.style.marginBottom = '1.5rem';

  const title = document.createElement('h3');
  title.textContent = 'Ship Comparison';
  title.style.marginBottom = '0.75rem';
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
  grid.style.gap = '1rem';

  for (const ship of gameData.ships) {
    grid.appendChild(renderShipComparisonCard(gameData, ship));
  }

  section.appendChild(grid);

  return section;
}

function renderShipComparisonCard(gameData: GameData, ship: Ship): HTMLElement {
  const card = document.createElement('div');
  card.className = 'ship-comparison-card';
  card.style.padding = '1rem';
  card.style.background = 'rgba(0, 0, 0, 0.3)';
  card.style.border = '1px solid #444';
  card.style.borderRadius = '4px';

  if (ship.id === gameData.activeShipId) {
    card.style.borderColor = '#4a9eff';
    card.style.boxShadow = '0 0 10px rgba(74, 158, 255, 0.3)';
  }

  // Header: Ship name + tier
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '0.75rem';

  const nameDiv = document.createElement('div');
  nameDiv.style.fontWeight = 'bold';
  nameDiv.style.fontSize = '1.1rem';
  nameDiv.style.color = ship.id === gameData.activeShipId ? '#4a9eff' : '#fff';
  nameDiv.textContent = ship.name;
  header.appendChild(nameDiv);

  const shipClass = getShipClass(ship.classId);
  if (shipClass) {
    const tierBadge = document.createElement('span');
    tierBadge.textContent = `Tier ${shipClass.tier}`;
    tierBadge.style.fontSize = '0.75rem';
    tierBadge.style.fontWeight = 'bold';
    tierBadge.style.padding = '2px 6px';
    tierBadge.style.borderRadius = '3px';
    tierBadge.style.background = `${getTierColor(shipClass.tier)}33`;
    tierBadge.style.color = getTierColor(shipClass.tier);
    header.appendChild(tierBadge);
  }

  card.appendChild(header);

  // Ship class
  const classDiv = document.createElement('div');
  classDiv.style.fontSize = '0.9rem';
  classDiv.style.color = '#aaa';
  classDiv.style.marginBottom = '0.5rem';
  classDiv.textContent = shipClass?.name || ship.classId;
  card.appendChild(classDiv);

  // Location
  const locationDiv = document.createElement('div');
  locationDiv.style.fontSize = '0.85rem';
  locationDiv.style.color = '#888';
  locationDiv.style.marginBottom = '0.75rem';
  if (ship.location.status === 'docked') {
    const dockedAt = ship.location.dockedAt;
    const location = gameData.world.locations.find((l) => l.id === dockedAt);
    locationDiv.innerHTML = `<span style="color: #4ade80;">●</span> Docked at ${location?.name || dockedAt}`;
  } else if (ship.location.flight) {
    const destId = ship.location.flight.destination;
    const destination = gameData.world.locations.find((l) => l.id === destId);
    const remainingTime =
      ship.location.flight.totalTime - ship.location.flight.elapsedTime;
    const timeLabel = formatDualTime(remainingTime);
    locationDiv.innerHTML = `<span style="color: #fbbf24;">●</span> In flight to ${destination?.name || destId} - ${timeLabel} remaining`;
  }
  card.appendChild(locationDiv);

  // Stats
  const statsDiv = document.createElement('div');
  statsDiv.style.fontSize = '0.85rem';
  statsDiv.style.color = '#aaa';
  statsDiv.style.display = 'flex';
  statsDiv.style.flexDirection = 'column';
  statsDiv.style.gap = '0.25rem';

  // Crew
  const crewLine = document.createElement('div');
  crewLine.innerHTML = `<span style="color: #888;">Crew:</span> ${ship.crew.length}/${shipClass?.maxCrew ?? '?'}`;
  statsDiv.appendChild(crewLine);

  // Fuel
  const fuelColor =
    ship.fuel < 20 ? '#ff4444' : ship.fuel < 50 ? '#fbbf24' : '#4ade80';
  const fuelLine = document.createElement('div');
  fuelLine.innerHTML = `<span style="color: #888;">Fuel:</span> <span style="color: ${fuelColor};">${Math.round(ship.fuel)}%</span>`;
  statsDiv.appendChild(fuelLine);

  // Equipment
  const equipLine = document.createElement('div');
  const maxSlots = shipClass?.equipmentSlotDefs.length ?? 0;
  equipLine.innerHTML = `<span style="color: #888;">Equipment:</span> ${ship.equipment.length}/${maxSlots} slots`;
  statsDiv.appendChild(equipLine);

  // Range
  if (shipClass) {
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    const maxRangeKm = computeMaxRange(shipClass, engineDef);
    const rangeLabel = formatLargeNumber(maxRangeKm);
    const rangeLine = document.createElement('div');
    rangeLine.innerHTML = `<span style="color: #888;">Range:</span> ${rangeLabel} km`;
    rangeLine.title = `Max range: ${maxRangeKm.toLocaleString()} km`;
    statsDiv.appendChild(rangeLine);
  }

  // Active Contract
  if (ship.activeContract) {
    const contractLine = document.createElement('div');
    contractLine.innerHTML = `<span style="color: #888;">Contract:</span> <span style="color: #4ade80;">Active</span>`;
    statsDiv.appendChild(contractLine);
  }

  // Daily Crew Cost
  let shipCrewCost = 0;
  for (const crew of ship.crew) {
    const roleDef = getCrewRoleDefinition(crew.role);
    if (roleDef) {
      shipCrewCost += roleDef.salary;
    }
  }
  if (shipCrewCost > 0) {
    const costLine = document.createElement('div');
    costLine.innerHTML = `<span style="color: #888;">Daily Cost:</span> <span style="color: #ffa500;">${(shipCrewCost * TICKS_PER_DAY).toFixed(0)} cr/day</span>`;
    statsDiv.appendChild(costLine);
  }

  card.appendChild(statsDiv);

  return card;
}

function renderShipPurchase(
  gameData: GameData,
  callbacks: FleetTabCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'ship-purchase-section';
  section.style.padding = '1rem';
  section.style.background = 'rgba(0, 0, 0, 0.3)';
  section.style.border = '1px solid #444';
  section.style.borderRadius = '4px';

  const title = document.createElement('h3');
  title.textContent = 'Purchase Ships';
  title.style.marginBottom = '0.5rem';
  section.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent =
    'Expand your fleet by purchasing additional ships. Each ship operates independently and can run separate contracts.';
  intro.style.marginBottom = '1rem';
  intro.style.color = '#aaa';
  intro.style.fontSize = '0.9rem';
  section.appendChild(intro);

  const shipList = document.createElement('div');
  shipList.style.display = 'flex';
  shipList.style.flexDirection = 'column';
  shipList.style.gap = '0.75rem';

  for (const shipClass of SHIP_CLASSES) {
    const card = document.createElement('div');
    card.style.padding = '0.75rem';
    card.style.background = 'rgba(0, 0, 0, 0.4)';
    card.style.border = '1px solid #555';
    card.style.borderRadius = '4px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '0.5rem';

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.textContent = shipClass.name;
    header.appendChild(nameDiv);

    const priceDiv = document.createElement('div');
    priceDiv.style.color = '#4a9eff';
    priceDiv.style.fontWeight = 'bold';
    priceDiv.textContent = `${shipClass.price.toLocaleString()} cr`;
    header.appendChild(priceDiv);

    card.appendChild(header);

    const desc = document.createElement('div');
    desc.style.fontSize = '0.85rem';
    desc.style.color = '#aaa';
    desc.style.marginBottom = '0.5rem';
    desc.textContent = shipClass.description;
    card.appendChild(desc);

    const specs = document.createElement('div');
    specs.style.fontSize = '0.8rem';
    specs.style.color = '#888';
    specs.style.marginBottom = '0.5rem';

    // Compute max range for this ship class with its default engine
    const defaultEngine = getEngineDefinition(shipClass.defaultEngineId);
    const maxRangeKm = computeMaxRange(shipClass, defaultEngine);
    const rangeLabel = getRangeLabel(maxRangeKm);
    const rangeFormatted = formatLargeNumber(maxRangeKm);

    specs.innerHTML = `Crew: ${shipClass.maxCrew} | Cargo: ${shipClass.cargoCapacity.toLocaleString()} kg | Equipment: ${shipClass.equipmentSlotDefs.length} slots<br>Range: <span style="color: #4ade80; font-weight: bold;">${rangeFormatted} km</span> <span style="color: #aaa;">(${rangeLabel})</span>`;
    specs.title = `Max range with default engine: ${maxRangeKm.toLocaleString()} km`;
    card.appendChild(specs);

    // Buy button or reason
    const isUnlocked =
      gameData.lifetimeCreditsEarned >= shipClass.unlockThreshold;
    const canAfford = gameData.credits >= shipClass.price;

    if (!isUnlocked) {
      const lockMsg = document.createElement('div');
      lockMsg.style.fontSize = '0.85rem';
      lockMsg.style.color = '#ff4444';
      lockMsg.textContent = `🔒 Unlock at ${shipClass.unlockThreshold.toLocaleString()} lifetime credits earned`;
      card.appendChild(lockMsg);
    } else if (!canAfford) {
      const affordMsg = document.createElement('div');
      affordMsg.style.fontSize = '0.85rem';
      affordMsg.style.color = '#ffa500';
      affordMsg.textContent = `Insufficient funds (need ${(shipClass.price - gameData.credits).toLocaleString()} more credits)`;
      card.appendChild(affordMsg);
    } else {
      const buyContainer = document.createElement('div');
      buyContainer.style.display = 'flex';
      buyContainer.style.gap = '0.5rem';
      buyContainer.style.alignItems = 'center';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Ship name...';
      nameInput.style.flex = '1';
      nameInput.style.padding = '0.5rem';
      nameInput.style.background = 'rgba(0, 0, 0, 0.5)';
      nameInput.style.border = '1px solid #666';
      nameInput.style.borderRadius = '4px';
      nameInput.style.color = '#fff';
      buyContainer.appendChild(nameInput);

      const buyBtn = document.createElement('button');
      buyBtn.textContent = 'Buy Ship';
      buyBtn.style.padding = '0.5rem 1rem';
      buyBtn.addEventListener('click', () => {
        const shipName = nameInput.value.trim() || `${shipClass.name}`;
        callbacks.onBuyShip(shipClass.id, shipName);
      });
      buyContainer.appendChild(buyBtn);

      card.appendChild(buyContainer);
    }

    shipList.appendChild(card);
  }

  section.appendChild(shipList);
  return section;
}

// Helper functions

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
