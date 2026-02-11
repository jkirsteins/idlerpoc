/**
 * Station Tab — consolidated interface for all docked-station services.
 *
 * Sections appear based on what services the docked location offers:
 *   - Fuel Depot    (refuel)
 *   - Ore Exchange   (trade + ore cargo)
 *   - Hiring Office  (hire)
 *   - Station Store   (trade) — crew gear, sell, ship equipment
 */

import type { GameData, WorldLocation, Ship } from '../models';
import { getActiveShip } from '../models';
import type { TabbedViewCallbacks } from './types';
import type { Component } from './component';
import { guardRebuild } from './component';
import {
  getCrewEquipmentDefinition,
  getAllCrewEquipmentDefinitions,
  type CrewEquipmentCategory,
} from '../crewEquipment';
import {
  getMiningEquipmentDefinitions,
  getBestShipMiningEquipment,
} from '../equipment';
import { getOreDefinition } from '../oreTypes';
import { getOreSellPrice } from '../miningSystem';
import { formatFuelMass, calculateFuelPercentage } from './fuelFormatting';
import { getFuelPricePerKg } from './refuelDialog';
import { getCrewRoleDefinition } from '../crewRoles';
import { GAME_SECONDS_PER_DAY } from '../timeSystem';

// ═══════════════════════════════════════════════════════════
// FLAVOR TEXT
// ═══════════════════════════════════════════════════════════

const FLAVOR_TEXT: Record<string, string[]> = {
  planet: [
    'Gravity tugs at your limbs as the gangway extends. After weeks in zero-g, even standard gravity feels like a luxury.',
    'Port authority chatter fills the comms as the ship settles into the berth. The hum of a thousand vessels permeates the dock.',
    'The docking clamps engage with a heavy thud. Through the viewport, the sprawling lights of the port stretch to the horizon.',
    'Heat radiates from the landing pad as the engines spool down. Ground crew are already approaching with fuel lines and cargo loaders.',
    'A customs drone buzzes past the airlock, scanning your hull registration. The smell of real atmosphere — soil, rain, industry — drifts in.',
  ],
  space_station: [
    'The airlock cycles open to the familiar cacophony of a busy station — vendors hawking, maintenance drones buzzing, the ever-present hiss of recycled air.',
    'A wall of sound hits you as the airlock opens. Traders shout over each other in the crowded market ring while cargo loaders rumble past.',
    "The station's spin-gravity is just enough to keep your coffee in the cup. Through the observation ring, ships queue for berths in the busy approach lanes.",
    'Docking clamps lock with a satisfying clunk. The status board by the airlock flickers with departure schedules and commodity prices.',
    'The corridor lights flicker to a warmer tone as you cross from your ship into the station proper. Someone nearby is frying something that smells incredible.',
  ],
  asteroid_belt: [
    'Docking lights guide you into the hollowed-out asteroid. Inside, the cramped depot smells of ozone and machine oil.',
    'The small outpost clings to the rock face like a barnacle. A handful of miners wave from the observation bubble.',
    'Dust from the last blast still hangs in the floodlights as the docking arm reels you in. The outpost vibrates with distant drilling.',
    "Rock walls close in as your ship slides into the carved-out berth. It's tight, but the mag-clamps hold steady.",
    'The depot is little more than a fuel cache and a repair bay bolted to an asteroid. Still, any port in a storm.',
  ],
  moon: [
    'The low gravity makes the docking sequence feel dreamlike. Your boots barely touch the gangway as you cross into the facility.',
    'Through the dome overhead, the parent planet looms enormous and serene. The colony beneath it hums with quiet industry.',
    'Regolith crunches under the landing struts. The small colony has that frontier feel — prefab modules and jury-rigged antennae.',
  ],
  default: [
    'The docking sequence completes without incident. Time to see what this place has to offer.',
    'Warning lights flash amber as the docking ring pressurizes. The outpost crew looks glad to see a fresh face.',
    'The berth is snug but serviceable. Somewhere nearby a welder sparks, and the PA system crackles with an unintelligible announcement.',
    'Your ship groans as the umbilicals connect — power, air, data. For a moment, everything is still.',
  ],
};

/** Deterministic hash for selecting flavor text. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getFlavorText(location: WorldLocation, gameTime: number): string {
  const pool = FLAVOR_TEXT[location.type] ?? FLAVOR_TEXT.default;
  // Changes each game-day you're docked, but stable within a day
  const gameDay = Math.floor(gameTime / GAME_SECONDS_PER_DAY);
  const index = simpleHash(location.id + ':' + gameDay) % pool.length;
  return pool[index];
}

// ═══════════════════════════════════════════════════════════
// LOCATION TYPE LABELS
// ═══════════════════════════════════════════════════════════

const LOCATION_TYPE_LABELS: Record<string, string> = {
  planet: 'Planet',
  space_station: 'Space Station',
  asteroid_belt: 'Asteroid Belt',
  moon: 'Moon',
  outpost: 'Outpost',
};

const SERVICE_LABELS: Record<string, { icon: string; label: string }> = {
  refuel: { icon: '⛽', label: 'Fuel Depot' },
  trade: { icon: '🛒', label: 'Market' },
  repair: { icon: '🔧', label: 'Repair Bay' },
  hire: { icon: '👤', label: 'Hiring Office' },
  mine: { icon: '⛏️', label: 'Mining' },
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function createStationTab(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'station-tab';

  function rebuild(gameData: GameData) {
    container.replaceChildren();
    const ship = getActiveShip(gameData);

    if (ship.location.status !== 'docked') {
      const msg = document.createElement('div');
      msg.style.cssText =
        'padding: 2rem; text-align: center; color: #888; font-size: 1.1rem;';
      msg.textContent =
        'Not currently docked. Dock at a station to access services.';
      container.appendChild(msg);
      return;
    }

    const location = gameData.world.locations.find(
      (l) => l.id === ship.location.dockedAt
    );
    if (!location) return;

    // Location header + flavor text
    container.appendChild(renderLocationHeader(location, gameData));

    // Service sections — order: fuel, ore exchange, store, hiring
    if (location.services.includes('refuel')) {
      container.appendChild(
        renderFuelSection(gameData, ship, location, callbacks)
      );
    }

    if (location.services.includes('trade') && ship.oreCargo.length > 0) {
      container.appendChild(
        renderOreSelling(gameData, ship, location, callbacks)
      );
    }

    if (location.services.includes('trade')) {
      container.appendChild(renderEquipmentShop(gameData, callbacks));
    }

    if (location.services.includes('hire')) {
      container.appendChild(renderHiringSection(gameData, callbacks));
    }
  }

  const { guardedRebuild } = guardRebuild(container, rebuild);

  guardedRebuild(gameData);
  return {
    el: container,
    update: guardedRebuild,
  };
}

// ═══════════════════════════════════════════════════════════
// LOCATION HEADER
// ═══════════════════════════════════════════════════════════

function renderLocationHeader(
  location: WorldLocation,
  gameData: GameData
): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText =
    'margin-bottom: 1.5rem; padding: 1rem; background: rgba(74, 158, 255, 0.06); border: 1px solid #2a4a6e; border-radius: 6px;';

  // Name + type
  const nameRow = document.createElement('div');
  nameRow.style.cssText =
    'display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;';

  const name = document.createElement('h3');
  name.style.cssText = 'margin: 0; color: #4a9eff; font-size: 1.3rem;';
  name.textContent = location.name;
  nameRow.appendChild(name);

  const typeLabel = document.createElement('span');
  typeLabel.style.cssText = 'font-size: 0.85rem; color: #888;';
  typeLabel.textContent = LOCATION_TYPE_LABELS[location.type] ?? location.type;
  nameRow.appendChild(typeLabel);

  section.appendChild(nameRow);

  // Description
  if (location.description) {
    const desc = document.createElement('div');
    desc.style.cssText =
      'color: #aaa; font-size: 0.85rem; margin-bottom: 0.5rem;';
    desc.textContent = location.description;
    section.appendChild(desc);
  }

  // Services badges
  const badges = document.createElement('div');
  badges.style.cssText =
    'display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;';
  for (const svc of location.services) {
    const info = SERVICE_LABELS[svc];
    if (!info) continue;
    const badge = document.createElement('span');
    badge.style.cssText =
      'font-size: 0.75rem; padding: 2px 8px; border-radius: 3px; background: rgba(255,255,255,0.06); color: #ccc; border: 1px solid #444;';
    badge.textContent = `${info.icon} ${info.label}`;
    badges.appendChild(badge);
  }
  section.appendChild(badges);

  // Flavor text
  const flavor = document.createElement('div');
  flavor.style.cssText =
    'color: #777; font-style: italic; font-size: 0.85rem; line-height: 1.4;';
  flavor.textContent = getFlavorText(location, gameData.gameTime);
  section.appendChild(flavor);

  return section;
}

// ═══════════════════════════════════════════════════════════
// FUEL DEPOT
// ═══════════════════════════════════════════════════════════

function renderFuelSection(
  gameData: GameData,
  ship: Ship,
  location: WorldLocation,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #444; border-radius: 4px;';

  const header = document.createElement('h4');
  header.style.cssText = 'margin: 0 0 0.5rem 0; color: #4a9eff;';
  header.textContent = '⛽ Fuel Depot';
  section.appendChild(header);

  const fuelPercent = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
  const isFull = ship.fuelKg >= ship.maxFuelKg;

  const statusLine = document.createElement('div');
  statusLine.style.cssText = 'font-size: 0.9rem; margin-bottom: 0.5rem;';
  statusLine.innerHTML = `Fuel: <strong>${formatFuelMass(ship.fuelKg)}</strong> / ${formatFuelMass(ship.maxFuelKg)} (${fuelPercent}%)`;
  section.appendChild(statusLine);

  // Fuel bar
  const barBg = document.createElement('div');
  barBg.style.cssText =
    'height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem;';
  const barFill = document.createElement('div');
  const fuelColor =
    fuelPercent > 50 ? '#4caf50' : fuelPercent > 20 ? '#ffc107' : '#e94560';
  barFill.style.cssText = `height: 100%; width: ${fuelPercent}%; background: ${fuelColor}; border-radius: 4px;`;
  barBg.appendChild(barFill);
  section.appendChild(barBg);

  // Price info
  const pricePerKg = getFuelPricePerKg(location, ship);
  const priceInfo = document.createElement('div');
  priceInfo.style.cssText =
    'font-size: 0.8rem; color: #888; margin-bottom: 0.5rem;';
  priceInfo.textContent = `Price: ${pricePerKg.toFixed(2)} cr/kg at ${location.name}`;
  section.appendChild(priceInfo);

  if (isFull) {
    const fullLabel = document.createElement('div');
    fullLabel.style.cssText = 'color: #4caf50; font-size: 0.85rem;';
    fullLabel.textContent = 'Tank is full.';
    section.appendChild(fullLabel);
  } else {
    const neededKg = ship.maxFuelKg - ship.fuelKg;
    const fillCost = Math.round(neededKg * pricePerKg);

    const buyBtn = document.createElement('button');
    buyBtn.textContent = `Buy Fuel (${formatFuelMass(neededKg)} needed · ~${fillCost.toLocaleString()} cr to fill)`;
    buyBtn.disabled = gameData.credits < Math.round(100 * pricePerKg); // at least 100kg worth
    buyBtn.addEventListener('click', () => callbacks.onBuyFuel());
    section.appendChild(buyBtn);
  }

  return section;
}

// ═══════════════════════════════════════════════════════════
// ORE EXCHANGE
// ═══════════════════════════════════════════════════════════

function renderOreSelling(
  _gameData: GameData,
  ship: Ship,
  location: WorldLocation,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; background: rgba(76, 175, 80, 0.08); border: 1px solid #4caf50; border-radius: 4px;';

  // Header with sell all button
  const header = document.createElement('div');
  header.style.cssText =
    'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';

  const title = document.createElement('span');
  title.style.cssText = 'font-weight: bold; font-size: 1rem; color: #4caf50;';
  title.textContent = '💰 Ore Exchange';
  header.appendChild(title);

  // Sell All button
  const totalValue = ship.oreCargo.reduce((sum, item) => {
    const ore = getOreDefinition(item.oreId);
    return sum + getOreSellPrice(ore, location, ship) * item.quantity;
  }, 0);

  const sellAllBtn = document.createElement('button');
  sellAllBtn.style.cssText =
    'padding: 4px 12px; font-size: 0.85rem; cursor: pointer; background: #4caf50; color: white; border: none; border-radius: 3px;';
  sellAllBtn.textContent = `Sell All (${totalValue.toLocaleString()} cr)`;
  sellAllBtn.addEventListener('click', () => callbacks.onSellAllOre());
  header.appendChild(sellAllBtn);

  panel.appendChild(header);

  // Location price info
  const priceInfo = document.createElement('div');
  priceInfo.style.cssText =
    'font-size: 0.8rem; color: #888; margin-bottom: 0.5rem;';
  priceInfo.textContent = `Selling at ${location.name}. Commerce skill improves prices.`;
  panel.appendChild(priceInfo);

  // Ore items
  for (const item of ship.oreCargo) {
    const ore = getOreDefinition(item.oreId);
    const pricePerUnit = getOreSellPrice(ore, location, ship);
    const itemTotal = pricePerUnit * item.quantity;

    const row = document.createElement('div');
    row.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #333;';

    const info = document.createElement('div');
    info.style.cssText = 'font-size: 0.85rem;';
    info.innerHTML = `
      <span style="color: #ccc;">${ore.icon} ${ore.name}</span>
      <span style="color: #888;"> × ${item.quantity}</span>
      <span style="color: #4caf50; margin-left: 8px;">${pricePerUnit} cr/unit</span>
    `;
    row.appendChild(info);

    const rightSide = document.createElement('div');
    rightSide.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const valueLabel = document.createElement('span');
    valueLabel.style.cssText =
      'font-size: 0.85rem; color: #4caf50; font-weight: bold;';
    valueLabel.textContent = `${itemTotal.toLocaleString()} cr`;
    rightSide.appendChild(valueLabel);

    const sellBtn = document.createElement('button');
    sellBtn.style.cssText =
      'padding: 2px 8px; font-size: 0.8rem; cursor: pointer; background: #2e7d32; color: white; border: none; border-radius: 3px;';
    sellBtn.textContent = 'Sell';
    sellBtn.addEventListener('click', () =>
      callbacks.onSellOre(item.oreId, item.quantity)
    );
    rightSide.appendChild(sellBtn);

    row.appendChild(rightSide);
    panel.appendChild(row);
  }

  return panel;
}

// ═══════════════════════════════════════════════════════════
// HIRING OFFICE
// ═══════════════════════════════════════════════════════════

function renderHiringSection(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #444; border-radius: 4px;';

  const header = document.createElement('h4');
  header.style.cssText = 'margin: 0 0 0.5rem 0; color: #4a9eff;';
  header.textContent = '👤 Hiring Office';
  section.appendChild(header);

  const ship = getActiveShip(gameData);
  const dockedAt =
    ship.location.status === 'docked' ? ship.location.dockedAt : null;
  if (!dockedAt) return section;

  const candidates = gameData.hireableCrewByLocation[dockedAt] ?? [];

  if (candidates.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color: #888; font-size: 0.85rem;';
    empty.textContent = 'No candidates available for hire at this station.';
    section.appendChild(empty);
    return section;
  }

  const candidatesList = document.createElement('div');
  candidatesList.style.cssText =
    'display: flex; flex-direction: column; gap: 0.5rem;';

  for (const candidate of candidates) {
    const candidateDiv = document.createElement('div');
    candidateDiv.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid #333; border-radius: 4px;';

    const infoDiv = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.textContent = candidate.name;
    infoDiv.appendChild(nameDiv);

    const roleDef = getCrewRoleDefinition(candidate.role);
    const roleDiv = document.createElement('div');
    roleDiv.style.cssText = 'font-size: 0.85rem; color: #aaa;';
    roleDiv.textContent = `${roleDef?.name ?? candidate.role} · Level ${candidate.level}`;
    infoDiv.appendChild(roleDiv);

    // Skills summary
    const skillsDiv = document.createElement('div');
    skillsDiv.style.cssText = 'font-size: 0.8rem; color: #888;';
    const skillParts: string[] = [];
    for (const skillId of ['piloting', 'mining', 'commerce'] as const) {
      const value = candidate.skills[skillId];
      if (value > 0) {
        skillParts.push(`${skillId} ${Math.floor(value)}`);
      }
    }
    if (skillParts.length > 0) {
      skillsDiv.textContent = skillParts.join(' · ');
    } else {
      skillsDiv.textContent = 'Untrained';
    }
    infoDiv.appendChild(skillsDiv);

    candidateDiv.appendChild(infoDiv);

    // Hire button
    const hireDiv = document.createElement('div');
    hireDiv.style.cssText =
      'display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;';

    const costLabel = document.createElement('div');
    costLabel.style.cssText = 'font-size: 0.85rem; color: #4a9eff;';
    costLabel.textContent = `${candidate.hireCost} cr`;
    hireDiv.appendChild(costLabel);

    if (roleDef) {
      const salaryLabel = document.createElement('div');
      salaryLabel.style.cssText = 'font-size: 0.75rem; color: #888;';
      salaryLabel.textContent = `Salary: ${roleDef.salary} cr/day`;
      hireDiv.appendChild(salaryLabel);
    }

    const hireButton = document.createElement('button');
    hireButton.textContent = 'Hire';
    hireButton.disabled = gameData.credits < candidate.hireCost;
    hireButton.addEventListener('click', () =>
      callbacks.onHireCrew(candidate.id)
    );
    hireDiv.appendChild(hireButton);

    candidateDiv.appendChild(hireDiv);
    candidatesList.appendChild(candidateDiv);
  }

  section.appendChild(candidatesList);
  return section;
}

// ═══════════════════════════════════════════════════════════
// STATION STORE
// ═══════════════════════════════════════════════════════════

function renderEquipmentShop(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'equipment-shop';
  section.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #444; border-radius: 4px;';

  const title = document.createElement('h4');
  title.style.cssText = 'margin: 0 0 0.5rem 0; color: #4a9eff;';
  title.textContent = '🛒 Station Store';
  section.appendChild(title);

  const tabs = document.createElement('div');
  tabs.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 1rem;';

  const itemsDiv = document.createElement('div');

  const allTabs: HTMLButtonElement[] = [];
  function setActiveTab(activeBtn: HTMLButtonElement, renderFn: () => void) {
    for (const t of allTabs) t.classList.remove('active');
    activeBtn.classList.add('active');
    itemsDiv.innerHTML = '';
    renderFn();
  }

  const buyTab = document.createElement('button');
  buyTab.textContent = 'Buy Crew Gear';
  buyTab.className = 'shop-tab active';
  buyTab.addEventListener('click', () =>
    setActiveTab(buyTab, () =>
      itemsDiv.appendChild(renderBuyList(gameData, callbacks))
    )
  );
  allTabs.push(buyTab);
  tabs.appendChild(buyTab);

  const sellTab = document.createElement('button');
  sellTab.textContent = 'Sell';
  sellTab.className = 'shop-tab';
  sellTab.addEventListener('click', () =>
    setActiveTab(sellTab, () =>
      itemsDiv.appendChild(renderSellList(gameData, callbacks))
    )
  );
  allTabs.push(sellTab);
  tabs.appendChild(sellTab);

  const shipTab = document.createElement('button');
  shipTab.textContent = 'Ship Equipment';
  shipTab.className = 'shop-tab';
  shipTab.addEventListener('click', () =>
    setActiveTab(shipTab, () =>
      itemsDiv.appendChild(renderShipEquipmentList(gameData, callbacks))
    )
  );
  allTabs.push(shipTab);
  tabs.appendChild(shipTab);

  section.appendChild(tabs);

  itemsDiv.appendChild(renderBuyList(gameData, callbacks));
  section.appendChild(itemsDiv);

  return section;
}

// ── Store sub-lists ──────────────────────────────────────────

const CATEGORY_LABELS: Record<
  CrewEquipmentCategory,
  { icon: string; label: string }
> = {
  weapon: { icon: '🔫', label: 'Weapons' },
  tool: { icon: '🔧', label: 'Tools' },
  armor: { icon: '🛡️', label: 'Armor' },
  accessory: { icon: '📟', label: 'Accessories' },
};

const CATEGORY_ORDER: CrewEquipmentCategory[] = [
  'weapon',
  'armor',
  'tool',
  'accessory',
];

function renderBuyList(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem;';

  const allEquip = getAllCrewEquipmentDefinitions();

  for (const category of CATEGORY_ORDER) {
    const items = allEquip.filter((e) => e.category === category);
    if (items.length === 0) continue;

    const catInfo = CATEGORY_LABELS[category];
    const header = document.createElement('div');
    header.style.cssText =
      'font-weight: bold; font-size: 0.9rem; color: #aaa; border-bottom: 1px solid #333; padding-bottom: 0.25rem;';
    header.textContent = `${catInfo.icon} ${catInfo.label}`;
    list.appendChild(header);

    for (const equipDef of items) {
      const itemDiv = document.createElement('div');
      itemDiv.style.cssText =
        'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid #333; border-radius: 4px;';

      const infoDiv = document.createElement('div');

      const nameDiv = document.createElement('div');
      nameDiv.style.fontWeight = 'bold';
      nameDiv.textContent = `${equipDef.icon} ${equipDef.name}`;
      infoDiv.appendChild(nameDiv);

      const descDiv = document.createElement('div');
      descDiv.style.cssText = 'font-size: 0.85rem; color: #888;';
      descDiv.textContent = equipDef.description;
      infoDiv.appendChild(descDiv);

      itemDiv.appendChild(infoDiv);

      const buyDiv = document.createElement('div');
      buyDiv.style.cssText =
        'display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;';

      const priceLabel = document.createElement('div');
      priceLabel.style.color = '#4a9eff';
      priceLabel.textContent = `${equipDef.value.toLocaleString()} cr`;
      buyDiv.appendChild(priceLabel);

      const buyButton = document.createElement('button');
      buyButton.textContent = 'Buy';
      buyButton.disabled = gameData.credits < equipDef.value;
      buyButton.addEventListener('click', () =>
        callbacks.onBuyEquipment(equipDef.id)
      );
      buyDiv.appendChild(buyButton);

      itemDiv.appendChild(buyDiv);
      list.appendChild(itemDiv);
    }
  }

  return list;
}

function renderSellList(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

  const ship = getActiveShip(gameData);

  // Collect all sellable items: cargo + crew equipment
  interface SellableItem {
    id: string;
    definitionId: string;
    source: string;
  }
  const items: SellableItem[] = [];

  for (const cargoItem of ship.cargo) {
    items.push({
      id: cargoItem.id,
      definitionId: cargoItem.definitionId,
      source: 'Cargo',
    });
  }

  for (const crew of ship.crew) {
    for (const eq of crew.equipment) {
      items.push({
        id: eq.id,
        definitionId: eq.definitionId,
        source: `Equipped by ${crew.name}`,
      });
    }
  }

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color: #888; font-size: 0.85rem;';
    empty.textContent = 'Nothing to sell.';
    list.appendChild(empty);
    return list;
  }

  for (const item of items) {
    const equipDef = getCrewEquipmentDefinition(
      item.definitionId as Parameters<typeof getCrewEquipmentDefinition>[0]
    );
    const sellPrice = Math.floor(equipDef.value * 0.5);

    const itemDiv = document.createElement('div');
    itemDiv.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid #333; border-radius: 4px;';

    const infoDiv = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.textContent = `${equipDef.icon} ${equipDef.name}`;
    infoDiv.appendChild(nameDiv);

    const sourceDiv = document.createElement('div');
    sourceDiv.style.cssText = 'font-size: 0.8rem; color: #888;';
    sourceDiv.textContent = item.source;
    infoDiv.appendChild(sourceDiv);

    itemDiv.appendChild(infoDiv);

    const sellDiv = document.createElement('div');
    sellDiv.style.cssText =
      'display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;';

    const priceLabel = document.createElement('div');
    priceLabel.style.color = '#4caf50';
    priceLabel.textContent = `${sellPrice.toLocaleString()} cr`;
    sellDiv.appendChild(priceLabel);

    const sellButton = document.createElement('button');
    sellButton.textContent = 'Sell';
    sellButton.addEventListener('click', () =>
      callbacks.onSellEquipment(item.id)
    );
    sellDiv.appendChild(sellButton);

    itemDiv.appendChild(sellDiv);
    list.appendChild(itemDiv);
  }

  return list;
}

function renderShipEquipmentList(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): HTMLElement {
  const ship = getActiveShip(gameData);
  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem;';

  // Current ship mining equipment
  const currentMiningEquip = getBestShipMiningEquipment(ship);
  if (currentMiningEquip) {
    const currentSection = document.createElement('div');
    currentSection.style.cssText =
      'padding: 0.75rem; background: rgba(76,175,80,0.1); border: 1px solid #4caf50; border-radius: 4px; margin-bottom: 0.5rem;';
    const currentLabel = document.createElement('div');
    currentLabel.style.cssText =
      'font-size: 0.85rem; color: #4caf50; margin-bottom: 0.25rem;';
    currentLabel.textContent = 'Currently Installed:';
    currentSection.appendChild(currentLabel);
    const currentName = document.createElement('div');
    currentName.style.cssText = 'font-weight: bold;';
    currentName.textContent = `${currentMiningEquip.icon} ${currentMiningEquip.name} (${currentMiningEquip.miningRate}x rate)`;
    currentSection.appendChild(currentName);
    list.appendChild(currentSection);
  }

  // Mining equipment header
  const header = document.createElement('div');
  header.style.cssText =
    'font-weight: bold; font-size: 0.9rem; color: #aaa; border-bottom: 1px solid #333; padding-bottom: 0.25rem;';
  header.textContent = '⛏️ Mining Equipment';
  list.appendChild(header);

  const hasMiningBay = ship.rooms.some((r) => r.type === 'mining_bay');
  if (!hasMiningBay) {
    const noRoom = document.createElement('div');
    noRoom.style.cssText = 'color: #888; font-size: 0.85rem;';
    noRoom.textContent =
      'This ship has no mining bay. Mining equipment requires a mining bay room.';
    list.appendChild(noRoom);
    return list;
  }

  const miningEquipDefs = getMiningEquipmentDefinitions();
  for (const equipDef of miningEquipDefs) {
    const isCurrentlyInstalled = currentMiningEquip?.id === equipDef.id;
    const isUpgrade =
      !isCurrentlyInstalled &&
      (currentMiningEquip
        ? (equipDef.miningRate ?? 0) > (currentMiningEquip.miningRate ?? 0)
        : true);
    const isDowngrade =
      !isCurrentlyInstalled &&
      currentMiningEquip !== undefined &&
      (equipDef.miningRate ?? 0) <= (currentMiningEquip.miningRate ?? 0);

    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = `display: flex; justify-content: space-between; align-items: center;
      padding: 0.5rem; border: 1px solid ${isCurrentlyInstalled ? '#4caf50' : '#333'}; border-radius: 4px;
      ${isCurrentlyInstalled ? 'background: rgba(76,175,80,0.05);' : ''}`;

    const infoDiv = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.textContent = `${equipDef.icon} ${equipDef.name}`;
    if (isCurrentlyInstalled) {
      nameDiv.textContent += ' (installed)';
      nameDiv.style.color = '#4caf50';
    }
    infoDiv.appendChild(nameDiv);

    const descDiv = document.createElement('div');
    descDiv.style.cssText = 'font-size: 0.85rem; color: #888;';
    descDiv.textContent = equipDef.description;
    infoDiv.appendChild(descDiv);

    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'font-size: 0.8rem; color: #6c6;';
    const levelReq = equipDef.miningLevelRequired ?? 0;
    statsDiv.textContent = `Mining rate: ${equipDef.miningRate}x · Power: ${equipDef.powerDraw} kW`;
    if (levelReq > 0) {
      statsDiv.textContent += ` · Requires Mining ${levelReq}`;
    }
    infoDiv.appendChild(statsDiv);

    itemDiv.appendChild(infoDiv);

    if (!isCurrentlyInstalled) {
      const buyDiv = document.createElement('div');
      buyDiv.style.cssText =
        'display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;';

      const price = equipDef.value ?? 0;
      const tradeIn = currentMiningEquip
        ? Math.floor((currentMiningEquip.value ?? 0) * 0.5)
        : 0;
      const netCost = price - tradeIn;

      const priceLabel = document.createElement('div');
      priceLabel.style.color = '#4a9eff';
      priceLabel.textContent = `${price.toLocaleString()} cr`;
      buyDiv.appendChild(priceLabel);

      if (tradeIn > 0) {
        const tradeInLabel = document.createElement('div');
        tradeInLabel.style.cssText = 'font-size: 0.75rem; color: #6c6;';
        tradeInLabel.textContent = `Trade-in: -${tradeIn.toLocaleString()} cr`;
        buyDiv.appendChild(tradeInLabel);

        const netLabel = document.createElement('div');
        netLabel.style.cssText =
          'font-size: 0.8rem; font-weight: bold; color: #4a9eff;';
        netLabel.textContent = `Net: ${netCost.toLocaleString()} cr`;
        buyDiv.appendChild(netLabel);
      }

      const buyButton = document.createElement('button');
      buyButton.textContent = isUpgrade
        ? 'Upgrade'
        : isDowngrade
          ? 'Downgrade'
          : 'Buy';
      buyButton.disabled = gameData.credits < netCost;
      buyButton.addEventListener('click', () =>
        callbacks.onBuyShipEquipment(equipDef.id)
      );
      buyDiv.appendChild(buyButton);

      itemDiv.appendChild(buyDiv);
    }

    list.appendChild(itemDiv);
  }

  return list;
}
