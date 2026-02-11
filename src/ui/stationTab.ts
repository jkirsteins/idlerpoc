/**
 * Station Tab — consolidated interface for all docked-station services.
 *
 * Sections appear based on what services the docked location offers:
 *   - Fuel Depot    (refuel)
 *   - Ore Exchange   (trade + ore cargo)
 *   - Hiring Office  (hire)
 *   - Station Store   (trade) — crew gear, sell, ship equipment
 *
 * Mount-once / update-on-tick pattern: DOM is created once in the factory,
 * and update() patches refs in-place. No replaceChildren() or guardRebuild.
 */

import type { GameData, WorldLocation, Ship, CrewMember } from '../models';
import { getActiveShip } from '../models';
import type { TabbedViewCallbacks } from './types';
import type { Component } from './component';
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

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

// ── Ore row refs for Map reconciliation ──
interface OreRowRefs {
  row: HTMLDivElement;
  iconNameSpan: HTMLSpanElement;
  quantitySpan: HTMLSpanElement;
  priceSpan: HTMLSpanElement;
  valueLabel: HTMLSpanElement;
  sellBtn: HTMLButtonElement;
}

// ── Candidate row refs for Map reconciliation ──
interface CandidateRowRefs {
  candidateDiv: HTMLDivElement;
  nameDiv: HTMLDivElement;
  roleDiv: HTMLDivElement;
  skillsDiv: HTMLDivElement;
  costLabel: HTMLDivElement;
  salaryLabel: HTMLDivElement;
  hireButton: HTMLButtonElement;
}

// ── Buy list item refs ──
interface BuyItemRefs {
  buyButton: HTMLButtonElement;
}

// ── Sell list item refs ──
interface SellItemRefs {
  row: HTMLDivElement;
  nameDiv: HTMLDivElement;
  sourceDiv: HTMLDivElement;
  priceLabel: HTMLDivElement;
  sellButton: HTMLButtonElement;
}

// ── Ship equipment item refs ──
interface ShipEquipItemRefs {
  itemDiv: HTMLDivElement;
  nameDiv: HTMLDivElement;
  descDiv: HTMLDivElement;
  statsDiv: HTMLDivElement;
  /** Only present when not currently installed */
  buyDiv: HTMLDivElement | null;
  priceLabel: HTMLDivElement | null;
  tradeInLabel: HTMLDivElement | null;
  netLabel: HTMLDivElement | null;
  buyButton: HTMLButtonElement | null;
}

export function createStationTab(
  gameData: GameData,
  callbacks: TabbedViewCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'station-tab';

  // Mutable ref so event handlers always see current game state
  let latestGameData = gameData;

  // ── Not-docked message ──
  const notDockedMessage = document.createElement('div');
  notDockedMessage.style.cssText =
    'padding: 2rem; text-align: center; color: #888; font-size: 1.1rem;';
  notDockedMessage.textContent =
    'Not currently docked. Dock at a station to access services.';
  container.appendChild(notDockedMessage);

  // ── Docked content wrapper ──
  const dockedContent = document.createElement('div');
  container.appendChild(dockedContent);

  // ── Location header ──
  const headerSection = document.createElement('div');
  headerSection.style.cssText =
    'margin-bottom: 1.5rem; padding: 1rem; background: rgba(74, 158, 255, 0.06); border: 1px solid #2a4a6e; border-radius: 6px;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText =
    'display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;';
  const locationName = document.createElement('h3');
  locationName.style.cssText = 'margin: 0; color: #4a9eff; font-size: 1.3rem;';
  nameRow.appendChild(locationName);
  const typeLabel = document.createElement('span');
  typeLabel.style.cssText = 'font-size: 0.85rem; color: #888;';
  nameRow.appendChild(typeLabel);
  headerSection.appendChild(nameRow);

  const descriptionDiv = document.createElement('div');
  descriptionDiv.style.cssText =
    'color: #aaa; font-size: 0.85rem; margin-bottom: 0.5rem;';
  headerSection.appendChild(descriptionDiv);

  const badgesContainer = document.createElement('div');
  badgesContainer.style.cssText =
    'display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;';
  headerSection.appendChild(badgesContainer);

  const flavorDiv = document.createElement('div');
  flavorDiv.style.cssText =
    'color: #777; font-style: italic; font-size: 0.85rem; line-height: 1.4;';
  headerSection.appendChild(flavorDiv);

  dockedContent.appendChild(headerSection);

  // Track which location was last rendered for the header so we know when to
  // rebuild badges and update static text
  let prevLocationId = '';
  let prevLocationServices: string[] = [];
  let prevGameDay = -1;

  // ═══════════════════════════════════════════════════════════
  // FUEL SECTION
  // ═══════════════════════════════════════════════════════════

  const fuelSection = document.createElement('div');
  fuelSection.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #444; border-radius: 4px;';

  const fuelHeader = document.createElement('h4');
  fuelHeader.style.cssText = 'margin: 0 0 0.5rem 0; color: #4a9eff;';
  fuelHeader.textContent = '⛽ Fuel Depot';
  fuelSection.appendChild(fuelHeader);

  const fuelStatusLine = document.createElement('div');
  fuelStatusLine.style.cssText = 'font-size: 0.9rem; margin-bottom: 0.5rem;';
  fuelSection.appendChild(fuelStatusLine);

  const fuelBarBg = document.createElement('div');
  fuelBarBg.style.cssText =
    'height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem;';
  const fuelBarFill = document.createElement('div');
  fuelBarFill.style.cssText = 'height: 100%; border-radius: 4px;';
  fuelBarBg.appendChild(fuelBarFill);
  fuelSection.appendChild(fuelBarBg);

  const fuelPriceInfo = document.createElement('div');
  fuelPriceInfo.style.cssText =
    'font-size: 0.8rem; color: #888; margin-bottom: 0.5rem;';
  fuelSection.appendChild(fuelPriceInfo);

  const fuelFullLabel = document.createElement('div');
  fuelFullLabel.style.cssText = 'color: #4caf50; font-size: 0.85rem;';
  fuelFullLabel.textContent = 'Tank is full.';
  fuelSection.appendChild(fuelFullLabel);

  const fuelBuyBtn = document.createElement('button');
  fuelBuyBtn.addEventListener('click', () => callbacks.onBuyFuel());
  fuelSection.appendChild(fuelBuyBtn);

  dockedContent.appendChild(fuelSection);

  // ═══════════════════════════════════════════════════════════
  // ORE EXCHANGE SECTION
  // ═══════════════════════════════════════════════════════════

  const oreSection = document.createElement('div');
  oreSection.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; background: rgba(76, 175, 80, 0.08); border: 1px solid #4caf50; border-radius: 4px;';

  const oreHeader = document.createElement('div');
  oreHeader.style.cssText =
    'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';

  const oreTitle = document.createElement('span');
  oreTitle.style.cssText =
    'font-weight: bold; font-size: 1rem; color: #4caf50;';
  oreTitle.textContent = '💰 Ore Exchange';
  oreHeader.appendChild(oreTitle);

  const sellAllBtn = document.createElement('button');
  sellAllBtn.style.cssText =
    'padding: 4px 12px; font-size: 0.85rem; cursor: pointer; background: #4caf50; color: white; border: none; border-radius: 3px;';
  sellAllBtn.addEventListener('click', () => callbacks.onSellAllOre());
  oreHeader.appendChild(sellAllBtn);

  oreSection.appendChild(oreHeader);

  const orePriceInfo = document.createElement('div');
  orePriceInfo.style.cssText =
    'font-size: 0.8rem; color: #888; margin-bottom: 0.5rem;';
  oreSection.appendChild(orePriceInfo);

  // Container for ore item rows, managed via Map
  const oreItemsContainer = document.createElement('div');
  oreSection.appendChild(oreItemsContainer);

  const oreRowMap = new Map<string, OreRowRefs>();

  dockedContent.appendChild(oreSection);

  // ═══════════════════════════════════════════════════════════
  // STATION STORE SECTION
  // ═══════════════════════════════════════════════════════════

  const shopSection = document.createElement('div');
  shopSection.className = 'equipment-shop';
  shopSection.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #444; border-radius: 4px;';

  const shopTitle = document.createElement('h4');
  shopTitle.style.cssText = 'margin: 0 0 0.5rem 0; color: #4a9eff;';
  shopTitle.textContent = '🛒 Station Store';
  shopSection.appendChild(shopTitle);

  const shopTabs = document.createElement('div');
  shopTabs.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 1rem;';

  const buyTabBtn = document.createElement('button');
  buyTabBtn.textContent = 'Buy Crew Gear';
  buyTabBtn.className = 'shop-tab active';

  const sellTabBtn = document.createElement('button');
  sellTabBtn.textContent = 'Sell';
  sellTabBtn.className = 'shop-tab';

  const shipEquipTabBtn = document.createElement('button');
  shipEquipTabBtn.textContent = 'Ship Equipment';
  shipEquipTabBtn.className = 'shop-tab';

  const allShopTabBtns = [buyTabBtn, sellTabBtn, shipEquipTabBtn];

  shopTabs.appendChild(buyTabBtn);
  shopTabs.appendChild(sellTabBtn);
  shopTabs.appendChild(shipEquipTabBtn);
  shopSection.appendChild(shopTabs);

  // Three content areas — created once, toggled with style.display
  const buyListContainer = document.createElement('div');
  buyListContainer.style.cssText =
    'display: flex; flex-direction: column; gap: 0.75rem;';

  const sellListContainer = document.createElement('div');
  sellListContainer.style.cssText =
    'display: flex; flex-direction: column; gap: 0.5rem;';

  const shipEquipListContainer = document.createElement('div');
  shipEquipListContainer.style.cssText =
    'display: flex; flex-direction: column; gap: 0.75rem;';

  shopSection.appendChild(buyListContainer);
  shopSection.appendChild(sellListContainer);
  shopSection.appendChild(shipEquipListContainer);

  function setActiveShopTab(tab: 'buy' | 'sell' | 'ship') {
    for (const btn of allShopTabBtns) btn.classList.remove('active');
    if (tab === 'buy') {
      buyTabBtn.classList.add('active');
      buyListContainer.style.display = '';
      sellListContainer.style.display = 'none';
      shipEquipListContainer.style.display = 'none';
    } else if (tab === 'sell') {
      sellTabBtn.classList.add('active');
      buyListContainer.style.display = 'none';
      sellListContainer.style.display = '';
      shipEquipListContainer.style.display = 'none';
    } else {
      shipEquipTabBtn.classList.add('active');
      buyListContainer.style.display = 'none';
      sellListContainer.style.display = 'none';
      shipEquipListContainer.style.display = '';
    }
  }

  buyTabBtn.addEventListener('click', () => setActiveShopTab('buy'));
  sellTabBtn.addEventListener('click', () => setActiveShopTab('sell'));
  shipEquipTabBtn.addEventListener('click', () => setActiveShopTab('ship'));

  // ── Buy list: items are static (all crew equipment defs) ──
  // Create all item rows once, just update disabled/price state on tick
  const buyItemRefs: BuyItemRefs[] = [];

  const allEquip = getAllCrewEquipmentDefinitions();
  for (const category of CATEGORY_ORDER) {
    const items = allEquip.filter((e) => e.category === category);
    if (items.length === 0) continue;

    const catInfo = CATEGORY_LABELS[category];
    const catHeader = document.createElement('div');
    catHeader.style.cssText =
      'font-weight: bold; font-size: 0.9rem; color: #aaa; border-bottom: 1px solid #333; padding-bottom: 0.25rem;';
    catHeader.textContent = `${catInfo.icon} ${catInfo.label}`;
    buyListContainer.appendChild(catHeader);

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
      buyButton.addEventListener('click', () =>
        callbacks.onBuyEquipment(equipDef.id)
      );
      buyDiv.appendChild(buyButton);

      itemDiv.appendChild(buyDiv);
      buyListContainer.appendChild(itemDiv);

      buyItemRefs.push({ buyButton });
    }
  }

  // ── Sell list: items change based on cargo + crew equipment ──
  const sellRowMap = new Map<string, SellItemRefs>();
  const sellEmptyMessage = document.createElement('div');
  sellEmptyMessage.style.cssText = 'color: #888; font-size: 0.85rem;';
  sellEmptyMessage.textContent = 'Nothing to sell.';
  sellListContainer.appendChild(sellEmptyMessage);

  // ── Ship equipment list ──
  // Current installed section
  const shipEquipCurrentSection = document.createElement('div');
  shipEquipCurrentSection.style.cssText =
    'padding: 0.75rem; background: rgba(76,175,80,0.1); border: 1px solid #4caf50; border-radius: 4px; margin-bottom: 0.5rem;';
  const shipEquipCurrentLabel = document.createElement('div');
  shipEquipCurrentLabel.style.cssText =
    'font-size: 0.85rem; color: #4caf50; margin-bottom: 0.25rem;';
  shipEquipCurrentLabel.textContent = 'Currently Installed:';
  shipEquipCurrentSection.appendChild(shipEquipCurrentLabel);
  const shipEquipCurrentName = document.createElement('div');
  shipEquipCurrentName.style.cssText = 'font-weight: bold;';
  shipEquipCurrentSection.appendChild(shipEquipCurrentName);
  shipEquipListContainer.appendChild(shipEquipCurrentSection);

  const shipEquipHeader = document.createElement('div');
  shipEquipHeader.style.cssText =
    'font-weight: bold; font-size: 0.9rem; color: #aaa; border-bottom: 1px solid #333; padding-bottom: 0.25rem;';
  shipEquipHeader.textContent = '⛏️ Mining Equipment';
  shipEquipListContainer.appendChild(shipEquipHeader);

  const noMiningBayMessage = document.createElement('div');
  noMiningBayMessage.style.cssText = 'color: #888; font-size: 0.85rem;';
  noMiningBayMessage.textContent =
    'This ship has no mining bay. Mining equipment requires a mining bay room.';
  shipEquipListContainer.appendChild(noMiningBayMessage);

  // Mining equipment items — static list, created once
  const miningEquipDefs = getMiningEquipmentDefinitions();
  const shipEquipItemRefs: ShipEquipItemRefs[] = [];
  const miningItemsContainer = document.createElement('div');
  miningItemsContainer.style.cssText =
    'display: flex; flex-direction: column; gap: 0.5rem;';

  for (const equipDef of miningEquipDefs) {
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-radius: 4px;';

    const infoDiv = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    infoDiv.appendChild(nameDiv);

    const descDiv = document.createElement('div');
    descDiv.style.cssText = 'font-size: 0.85rem; color: #888;';
    descDiv.textContent = equipDef.description;
    infoDiv.appendChild(descDiv);

    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'font-size: 0.8rem; color: #6c6;';
    infoDiv.appendChild(statsDiv);

    itemDiv.appendChild(infoDiv);

    // Buy area — always created, toggled via display when installed
    const buyDiv = document.createElement('div');
    buyDiv.style.cssText =
      'display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;';

    const priceLabel = document.createElement('div');
    priceLabel.style.color = '#4a9eff';
    buyDiv.appendChild(priceLabel);

    const tradeInLabel = document.createElement('div');
    tradeInLabel.style.cssText = 'font-size: 0.75rem; color: #6c6;';
    buyDiv.appendChild(tradeInLabel);

    const netLabel = document.createElement('div');
    netLabel.style.cssText =
      'font-size: 0.8rem; font-weight: bold; color: #4a9eff;';
    buyDiv.appendChild(netLabel);

    const buyButton = document.createElement('button');
    buyButton.addEventListener('click', () =>
      callbacks.onBuyShipEquipment(equipDef.id)
    );
    buyDiv.appendChild(buyButton);

    itemDiv.appendChild(buyDiv);
    miningItemsContainer.appendChild(itemDiv);

    shipEquipItemRefs.push({
      itemDiv,
      nameDiv,
      descDiv,
      statsDiv,
      buyDiv,
      priceLabel,
      tradeInLabel,
      netLabel,
      buyButton,
    });
  }

  shipEquipListContainer.appendChild(miningItemsContainer);

  // Set initial shop tab visibility
  setActiveShopTab('buy');

  dockedContent.appendChild(shopSection);

  // ═══════════════════════════════════════════════════════════
  // HIRING SECTION
  // ═══════════════════════════════════════════════════════════

  const hiringSection = document.createElement('div');
  hiringSection.style.cssText =
    'margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #444; border-radius: 4px;';

  const hiringHeader = document.createElement('h4');
  hiringHeader.style.cssText = 'margin: 0 0 0.5rem 0; color: #4a9eff;';
  hiringHeader.textContent = '👤 Hiring Office';
  hiringSection.appendChild(hiringHeader);

  const hiringEmpty = document.createElement('div');
  hiringEmpty.style.cssText = 'color: #888; font-size: 0.85rem;';
  hiringEmpty.textContent = 'No candidates available for hire at this station.';
  hiringSection.appendChild(hiringEmpty);

  const candidatesContainer = document.createElement('div');
  candidatesContainer.style.cssText =
    'display: flex; flex-direction: column; gap: 0.5rem;';
  hiringSection.appendChild(candidatesContainer);

  const candidateRowMap = new Map<string, CandidateRowRefs>();

  dockedContent.appendChild(hiringSection);

  // ═══════════════════════════════════════════════════════════
  // UPDATE HELPERS
  // ═══════════════════════════════════════════════════════════

  function updateLocationHeader(location: WorldLocation, gd: GameData): void {
    const locationChanged = location.id !== prevLocationId;
    const gameDay = Math.floor(gd.gameTime / GAME_SECONDS_PER_DAY);
    const gameDayChanged = gameDay !== prevGameDay;

    if (locationChanged) {
      locationName.textContent = location.name;
      typeLabel.textContent =
        LOCATION_TYPE_LABELS[location.type] ?? location.type;

      if (location.description) {
        descriptionDiv.textContent = location.description;
        descriptionDiv.style.display = '';
      } else {
        descriptionDiv.textContent = '';
        descriptionDiv.style.display = 'none';
      }

      // Rebuild service badges only when location changes
      const servicesChanged =
        location.services.length !== prevLocationServices.length ||
        location.services.some((s, i) => s !== prevLocationServices[i]);

      if (servicesChanged) {
        // Remove old badges
        while (badgesContainer.lastChild) {
          badgesContainer.removeChild(badgesContainer.lastChild);
        }
        // Add new badges
        for (const svc of location.services) {
          const info = SERVICE_LABELS[svc];
          if (!info) continue;
          const badge = document.createElement('span');
          badge.style.cssText =
            'font-size: 0.75rem; padding: 2px 8px; border-radius: 3px; background: rgba(255,255,255,0.06); color: #ccc; border: 1px solid #444;';
          badge.textContent = `${info.icon} ${info.label}`;
          badgesContainer.appendChild(badge);
        }
        prevLocationServices = [...location.services];
      }

      prevLocationId = location.id;
    }

    if (locationChanged || gameDayChanged) {
      flavorDiv.textContent = getFlavorText(location, gd.gameTime);
      prevGameDay = gameDay;
    }
  }

  function updateFuelSection(
    ship: Ship,
    location: WorldLocation,
    gd: GameData
  ): void {
    const fuelPercent = calculateFuelPercentage(ship.fuelKg, ship.maxFuelKg);
    const isFull = ship.fuelKg >= ship.maxFuelKg;

    // Status line
    fuelStatusLine.innerHTML = `Fuel: <strong>${formatFuelMass(ship.fuelKg)}</strong> / ${formatFuelMass(ship.maxFuelKg)} (${fuelPercent}%)`;

    // Fuel bar
    const fuelColor =
      fuelPercent > 50 ? '#4caf50' : fuelPercent > 20 ? '#ffc107' : '#e94560';
    fuelBarFill.style.width = `${fuelPercent}%`;
    fuelBarFill.style.background = fuelColor;

    // Price info
    const pricePerKg = getFuelPricePerKg(location, ship);
    fuelPriceInfo.textContent = `Price: ${pricePerKg.toFixed(2)} cr/kg at ${location.name}`;

    // Full label vs buy button
    if (isFull) {
      fuelFullLabel.style.display = '';
      fuelBuyBtn.style.display = 'none';
    } else {
      fuelFullLabel.style.display = 'none';
      fuelBuyBtn.style.display = '';

      const neededKg = ship.maxFuelKg - ship.fuelKg;
      const fillCost = Math.round(neededKg * pricePerKg);
      fuelBuyBtn.textContent = `Buy Fuel (${formatFuelMass(neededKg)} needed · ~${fillCost.toLocaleString()} cr to fill)`;
      fuelBuyBtn.disabled = gd.credits < Math.round(100 * pricePerKg);
    }
  }

  function updateOreSection(ship: Ship, location: WorldLocation): void {
    orePriceInfo.textContent = `Selling at ${location.name}. Commerce skill improves prices.`;

    // Calculate total value for sell-all button
    const totalValue = ship.oreCargo.reduce((sum, item) => {
      const ore = getOreDefinition(item.oreId);
      return sum + getOreSellPrice(ore, location, ship) * item.quantity;
    }, 0);
    sellAllBtn.textContent = `Sell All (${totalValue.toLocaleString()} cr)`;

    // Reconcile ore rows
    const currentOreIds = new Set<string>();

    for (const item of ship.oreCargo) {
      const oreId = item.oreId;
      currentOreIds.add(oreId);

      const ore = getOreDefinition(oreId);
      const pricePerUnit = getOreSellPrice(ore, location, ship);
      const itemTotal = pricePerUnit * item.quantity;

      let refs = oreRowMap.get(oreId);
      if (!refs) {
        // Create new ore row
        const row = document.createElement('div');
        row.style.cssText =
          'display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #333;';

        const info = document.createElement('div');
        info.style.cssText =
          'font-size: 0.85rem; display: flex; align-items: center; gap: 4px;';

        const iconNameSpan = document.createElement('span');
        iconNameSpan.style.color = '#ccc';
        info.appendChild(iconNameSpan);

        const quantitySpan = document.createElement('span');
        quantitySpan.style.color = '#888';
        info.appendChild(quantitySpan);

        const priceSpan = document.createElement('span');
        priceSpan.style.cssText = 'color: #4caf50; margin-left: 8px;';
        info.appendChild(priceSpan);

        row.appendChild(info);

        const rightSide = document.createElement('div');
        rightSide.style.cssText =
          'display: flex; align-items: center; gap: 8px;';

        const valueLabel = document.createElement('span');
        valueLabel.style.cssText =
          'font-size: 0.85rem; color: #4caf50; font-weight: bold;';
        rightSide.appendChild(valueLabel);

        const sellBtn = document.createElement('button');
        sellBtn.style.cssText =
          'padding: 2px 8px; font-size: 0.8rem; cursor: pointer; background: #2e7d32; color: white; border: none; border-radius: 3px;';
        sellBtn.textContent = 'Sell';
        sellBtn.addEventListener('click', () => {
          const currentShip = getActiveShip(latestGameData);
          const currentItem = currentShip.oreCargo.find(
            (o) => o.oreId === oreId
          );
          if (currentItem) {
            callbacks.onSellOre(currentItem.oreId, currentItem.quantity);
          }
        });
        rightSide.appendChild(sellBtn);

        row.appendChild(rightSide);

        refs = {
          row,
          iconNameSpan,
          quantitySpan,
          priceSpan,
          valueLabel,
          sellBtn,
        };
        oreRowMap.set(oreId, refs);
        oreItemsContainer.appendChild(row);
      }

      // Update in-place
      refs.iconNameSpan.textContent = `${ore.icon} ${ore.name}`;
      refs.quantitySpan.textContent = ` \u00d7 ${item.quantity}`;
      refs.priceSpan.textContent = `${pricePerUnit} cr/unit`;
      refs.valueLabel.textContent = `${itemTotal.toLocaleString()} cr`;
    }

    // Remove departed ore rows
    for (const [oreId, refs] of oreRowMap) {
      if (!currentOreIds.has(oreId)) {
        refs.row.remove();
        oreRowMap.delete(oreId);
      }
    }
  }

  function updateBuyList(gd: GameData): void {
    let idx = 0;
    for (const category of CATEGORY_ORDER) {
      const items = allEquip.filter((e) => e.category === category);
      for (const equipDef of items) {
        const refs = buyItemRefs[idx];
        refs.buyButton.disabled = gd.credits < equipDef.value;
        idx++;
      }
    }
  }

  function updateSellList(ship: Ship): void {
    // Collect all sellable items
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

    // Show/hide empty message
    if (items.length === 0) {
      sellEmptyMessage.style.display = '';
    } else {
      sellEmptyMessage.style.display = 'none';
    }

    // Reconcile sell rows by item id
    const currentItemIds = new Set<string>();

    for (const item of items) {
      currentItemIds.add(item.id);

      const equipDef = getCrewEquipmentDefinition(
        item.definitionId as Parameters<typeof getCrewEquipmentDefinition>[0]
      );
      const sellPrice = Math.floor(equipDef.value * 0.5);

      let refs = sellRowMap.get(item.id);
      if (!refs) {
        const row = document.createElement('div');
        row.style.cssText =
          'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid #333; border-radius: 4px;';

        const infoDiv = document.createElement('div');
        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = 'bold';
        infoDiv.appendChild(nameDiv);

        const sourceDiv = document.createElement('div');
        sourceDiv.style.cssText = 'font-size: 0.8rem; color: #888;';
        infoDiv.appendChild(sourceDiv);

        row.appendChild(infoDiv);

        const sellDiv = document.createElement('div');
        sellDiv.style.cssText =
          'display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;';

        const priceLabel = document.createElement('div');
        priceLabel.style.color = '#4caf50';
        sellDiv.appendChild(priceLabel);

        const sellButton = document.createElement('button');
        sellButton.textContent = 'Sell';
        const capturedItemId = item.id;
        sellButton.addEventListener('click', () =>
          callbacks.onSellEquipment(capturedItemId)
        );
        sellDiv.appendChild(sellButton);

        row.appendChild(sellDiv);

        refs = { row, nameDiv, sourceDiv, priceLabel, sellButton };
        sellRowMap.set(item.id, refs);
        sellListContainer.appendChild(row);
      }

      // Update in-place
      refs.nameDiv.textContent = `${equipDef.icon} ${equipDef.name}`;
      refs.sourceDiv.textContent = item.source;
      refs.priceLabel.textContent = `${sellPrice.toLocaleString()} cr`;
    }

    // Remove departed items
    for (const [id, refs] of sellRowMap) {
      if (!currentItemIds.has(id)) {
        refs.row.remove();
        sellRowMap.delete(id);
      }
    }
  }

  function updateShipEquipmentList(ship: Ship, gd: GameData): void {
    const currentMiningEquip = getBestShipMiningEquipment(ship);
    const hasMiningBay = ship.rooms.some((r) => r.type === 'mining_bay');

    // Current installed section
    if (currentMiningEquip) {
      shipEquipCurrentSection.style.display = '';
      shipEquipCurrentName.textContent = `${currentMiningEquip.icon} ${currentMiningEquip.name} (${currentMiningEquip.miningRate}x rate)`;
    } else {
      shipEquipCurrentSection.style.display = 'none';
    }

    // No mining bay message
    if (!hasMiningBay) {
      noMiningBayMessage.style.display = '';
      miningItemsContainer.style.display = 'none';
      return;
    } else {
      noMiningBayMessage.style.display = 'none';
      miningItemsContainer.style.display = '';
    }

    // Update each mining equipment row
    for (let i = 0; i < miningEquipDefs.length; i++) {
      const equipDef = miningEquipDefs[i];
      const refs = shipEquipItemRefs[i];
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

      // Update border/background for installed state
      refs.itemDiv.style.border = `1px solid ${isCurrentlyInstalled ? '#4caf50' : '#333'}`;
      refs.itemDiv.style.background = isCurrentlyInstalled
        ? 'rgba(76,175,80,0.05)'
        : '';

      // Name
      let nameText = `${equipDef.icon} ${equipDef.name}`;
      if (isCurrentlyInstalled) {
        nameText += ' (installed)';
        refs.nameDiv.style.color = '#4caf50';
      } else {
        refs.nameDiv.style.color = '';
      }
      refs.nameDiv.textContent = nameText;

      // Stats
      const levelReq = equipDef.miningLevelRequired ?? 0;
      let statsText = `Mining rate: ${equipDef.miningRate}x · Power: ${equipDef.powerDraw} kW`;
      if (levelReq > 0) {
        statsText += ` · Requires Mining ${levelReq}`;
      }
      refs.statsDiv.textContent = statsText;

      // Buy div visibility
      if (isCurrentlyInstalled) {
        if (refs.buyDiv) refs.buyDiv.style.display = 'none';
      } else {
        if (refs.buyDiv) refs.buyDiv.style.display = '';

        const price = equipDef.value ?? 0;
        const tradeIn = currentMiningEquip
          ? Math.floor((currentMiningEquip.value ?? 0) * 0.5)
          : 0;
        const netCost = price - tradeIn;

        if (refs.priceLabel) {
          refs.priceLabel.textContent = `${price.toLocaleString()} cr`;
        }

        if (refs.tradeInLabel) {
          if (tradeIn > 0) {
            refs.tradeInLabel.textContent = `Trade-in: -${tradeIn.toLocaleString()} cr`;
            refs.tradeInLabel.style.display = '';
          } else {
            refs.tradeInLabel.style.display = 'none';
          }
        }

        if (refs.netLabel) {
          if (tradeIn > 0) {
            refs.netLabel.textContent = `Net: ${netCost.toLocaleString()} cr`;
            refs.netLabel.style.display = '';
          } else {
            refs.netLabel.style.display = 'none';
          }
        }

        if (refs.buyButton) {
          refs.buyButton.textContent = isUpgrade
            ? 'Upgrade'
            : isDowngrade
              ? 'Downgrade'
              : 'Buy';
          refs.buyButton.disabled = gd.credits < netCost;
        }
      }
    }
  }

  function updateHiringSection(gd: GameData, dockedAt: string): void {
    const candidates = gd.hireableCrewByLocation[dockedAt] ?? [];

    if (candidates.length === 0) {
      hiringEmpty.style.display = '';
      candidatesContainer.style.display = 'none';
    } else {
      hiringEmpty.style.display = 'none';
      candidatesContainer.style.display = '';
    }

    // Reconcile candidate rows
    const currentCandidateIds = new Set<string>();

    for (const candidate of candidates) {
      currentCandidateIds.add(candidate.id);

      let refs = candidateRowMap.get(candidate.id);
      if (!refs) {
        refs = createCandidateRow(candidate);
        candidateRowMap.set(candidate.id, refs);
        candidatesContainer.appendChild(refs.candidateDiv);
      }

      updateCandidateRow(refs, candidate, gd);
    }

    // Remove departed candidates
    for (const [id, refs] of candidateRowMap) {
      if (!currentCandidateIds.has(id)) {
        refs.candidateDiv.remove();
        candidateRowMap.delete(id);
      }
    }
  }

  function createCandidateRow(candidate: CrewMember): CandidateRowRefs {
    const candidateDiv = document.createElement('div');
    candidateDiv.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid #333; border-radius: 4px;';

    const infoDiv = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    infoDiv.appendChild(nameDiv);

    const roleDiv = document.createElement('div');
    roleDiv.style.cssText = 'font-size: 0.85rem; color: #aaa;';
    infoDiv.appendChild(roleDiv);

    const skillsDiv = document.createElement('div');
    skillsDiv.style.cssText = 'font-size: 0.8rem; color: #888;';
    infoDiv.appendChild(skillsDiv);

    candidateDiv.appendChild(infoDiv);

    const hireDiv = document.createElement('div');
    hireDiv.style.cssText =
      'display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;';

    const costLabel = document.createElement('div');
    costLabel.style.cssText = 'font-size: 0.85rem; color: #4a9eff;';
    hireDiv.appendChild(costLabel);

    const salaryLabel = document.createElement('div');
    salaryLabel.style.cssText = 'font-size: 0.75rem; color: #888;';
    hireDiv.appendChild(salaryLabel);

    const hireButton = document.createElement('button');
    hireButton.textContent = 'Hire';
    const capturedId = candidate.id;
    hireButton.addEventListener('click', () =>
      callbacks.onHireCrew(capturedId)
    );
    hireDiv.appendChild(hireButton);

    candidateDiv.appendChild(hireDiv);

    return {
      candidateDiv,
      nameDiv,
      roleDiv,
      skillsDiv,
      costLabel,
      salaryLabel,
      hireButton,
    };
  }

  function updateCandidateRow(
    refs: CandidateRowRefs,
    candidate: CrewMember,
    gd: GameData
  ): void {
    refs.nameDiv.textContent = candidate.name;

    const roleDef = getCrewRoleDefinition(candidate.role);
    refs.roleDiv.textContent = `${roleDef?.name ?? candidate.role} · Level ${candidate.level}`;

    const skillParts: string[] = [];
    for (const skillId of ['piloting', 'mining', 'commerce'] as const) {
      const value = candidate.skills[skillId];
      if (value > 0) {
        skillParts.push(`${skillId} ${Math.floor(value)}`);
      }
    }
    refs.skillsDiv.textContent =
      skillParts.length > 0 ? skillParts.join(' · ') : 'Untrained';

    refs.costLabel.textContent = `${candidate.hireCost} cr`;

    if (roleDef) {
      refs.salaryLabel.textContent = `Salary: ${roleDef.salary} cr/day`;
      refs.salaryLabel.style.display = '';
    } else {
      refs.salaryLabel.style.display = 'none';
    }

    refs.hireButton.disabled = gd.credits < candidate.hireCost;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN UPDATE
  // ═══════════════════════════════════════════════════════════

  function update(gd: GameData): void {
    latestGameData = gd;
    const ship = getActiveShip(gd);

    if (ship.location.status !== 'docked') {
      notDockedMessage.style.display = '';
      dockedContent.style.display = 'none';
      return;
    }

    notDockedMessage.style.display = 'none';
    dockedContent.style.display = '';

    const location = gd.world.locations.find(
      (l) => l.id === ship.location.dockedAt
    );
    if (!location) return;

    // Location header
    updateLocationHeader(location, gd);

    // Fuel section
    const hasRefuel = location.services.includes('refuel');
    fuelSection.style.display = hasRefuel ? '' : 'none';
    if (hasRefuel) {
      updateFuelSection(ship, location, gd);
    }

    // Ore section
    const hasTrade = location.services.includes('trade');
    const hasOre = ship.oreCargo.length > 0;
    oreSection.style.display = hasTrade && hasOre ? '' : 'none';
    if (hasTrade && hasOre) {
      updateOreSection(ship, location);
    }

    // Shop section
    shopSection.style.display = hasTrade ? '' : 'none';
    if (hasTrade) {
      updateBuyList(gd);
      updateSellList(ship);
      updateShipEquipmentList(ship, gd);
    }

    // Hiring section
    const hasHire = location.services.includes('hire');
    hiringSection.style.display = hasHire ? '' : 'none';
    if (hasHire) {
      const dockedAt =
        ship.location.status === 'docked' ? ship.location.dockedAt : null;
      if (dockedAt) {
        updateHiringSection(gd, dockedAt);
      }
    }
  }

  // Initial render
  update(gameData);

  return { el: container, update };
}
