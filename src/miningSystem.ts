/**
 * Mining System
 *
 * Handles ore extraction during orbiting at mine-enabled locations.
 * Mining requires:
 *   1. Ship orbiting a location with 'mine' service
 *   2. Crew assigned to mining_ops job slot (from mining_bay room)
 *   3. Ship-mounted mining equipment installed (e.g. mining_laser)
 *   4. Crew mining skill sufficient to operate the equipment
 *   5. Available cargo space
 *
 * Per-tick yield formula:
 *   orePerTick = BASE_RATE × equipmentRate × skillFactor × (1 + masteryYield) × (1 + poolYield)
 *
 * Fractional ore accumulates in ship.miningAccumulator and converts to whole
 * units in ship.oreCargo when >= 1.0.
 */

import type { Ship, GameData, OreId, WorldLocation } from './models';
import { getShipCommander } from './models';
import { getCommandMiningBonus } from './captainBonus';
import { getOreDefinition, type OreDefinition } from './oreTypes';
import { getEquipmentDefinition, type EquipmentDefinition } from './equipment';
import { getCrewForJobType } from './jobSlots';
import {
  awardMasteryXp,
  getOreMasteryYieldBonus,
  getMiningPoolYieldBonus,
  getMiningPoolDoubleChance,
} from './masterySystem';
import { getAllOreDefinitions } from './oreTypes';
import { addLog } from './logSystem';
import { calculateAvailableCargoCapacity } from './flightPhysics';
import { getShipClass } from './shipClasses';

// ─── Constants ──────────────────────────────────────────────────

/**
 * Base ore units extracted per tick before modifiers.
 *
 * At skill 0 with basic laser (1.0x), this produces ~0.12 units/tick.
 * Iron ore (5 cr/unit) yields ~36 cr/min — competitive but lower than
 * short trade routes, balanced by zero fuel cost while mining.
 */
const BASE_MINING_RATE = 0.12;

/**
 * Mastery XP awarded per whole ore unit extracted.
 * Calibrated so consistent mining of one ore type reaches mastery
 * level 10 in a few hours, mastery 25 in about a day.
 */
const MASTERY_XP_PER_ORE = 15;

// ─── Core Mining Logic ──────────────────────────────────────────

export interface MiningTickResult {
  /** Total ore units extracted this tick (across all miners). */
  oreExtracted: Record<OreId, number>;
  /** Whether cargo is full (mining was limited). */
  cargoFull: boolean;
  /** Mastery level-ups that occurred. */
  masteryLevelUps: { crewName: string; oreName: string; newLevel: number }[];
}

/**
 * Calculate the skill factor for mining yield.
 * Linear scaling: 1.0 at skill 0, 2.0 at skill 100.
 */
function getSkillFactor(miningSkill: number): number {
  return 1 + miningSkill / 100;
}

/**
 * Select the best ore to mine at a location for a given crew member.
 * Picks the highest-value ore the miner can access.
 */
function selectOreToMine(
  location: WorldLocation,
  miningSkill: number
): OreDefinition | null {
  if (!location.availableOres || location.availableOres.length === 0) {
    return null;
  }

  const minableAtLocation = location.availableOres
    .map((id) => getOreDefinition(id))
    .filter((ore) => Math.floor(miningSkill) >= ore.miningLevelRequired);

  if (minableAtLocation.length === 0) return null;

  // Pick highest value ore
  return minableAtLocation.reduce((best, ore) =>
    ore.baseValue > best.baseValue ? ore : best
  );
}

/**
 * Calculate the current ore cargo weight on a ship.
 */
export function getOreCargoWeight(ship: Ship): number {
  let weight = 0;
  for (const item of ship.oreCargo) {
    const ore = getOreDefinition(item.oreId);
    weight += ore.weightPerUnit * item.quantity;
  }
  return weight;
}

/**
 * Calculate remaining cargo capacity for ore (kg).
 */
export function getRemainingOreCapacity(ship: Ship): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 0;
  const maxCargo = calculateAvailableCargoCapacity(shipClass.cargoCapacity);

  // Account for crew equipment in cargo hold (rough estimate per item)
  const equipmentWeight = ship.cargo.length * 5;

  const oreWeight = getOreCargoWeight(ship);
  return Math.max(0, maxCargo - equipmentWeight - oreWeight);
}

/**
 * Apply one tick of mining for a ship orbiting a mine-enabled location.
 *
 * Returns null if the ship cannot mine (wrong location, no miners, no equipment).
 */
export function applyMiningTick(
  ship: Ship,
  location: WorldLocation
): MiningTickResult | null {
  // Verify location has mine service
  if (!location.services.includes('mine')) return null;

  // Get miners assigned to mining_ops
  const miners = getCrewForJobType(ship, 'mining_ops');
  if (miners.length === 0) return null;

  const result: MiningTickResult = {
    oreExtracted: {} as Record<OreId, number>,
    cargoFull: false,
    masteryLevelUps: [],
  };

  // Initialize accumulator if missing
  if (!ship.miningAccumulator) {
    ship.miningAccumulator = {};
  }

  // Calculate remaining capacity
  const remainingCapacityKg = getRemainingOreCapacity(ship);
  if (remainingCapacityKg <= 0) {
    result.cargoFull = true;
    return result;
  }

  // Track weight added this tick to enforce cargo limit
  let weightAddedThisTick = 0;

  const totalOreCount = getAllOreDefinitions().length;

  // Get all mining equipment installed on the ship
  const shipMiningGear = ship.equipment
    .map((eq) => getEquipmentDefinition(eq.definitionId))
    .filter(
      (def): def is EquipmentDefinition =>
        def !== undefined && def.category === 'mining'
    );

  if (shipMiningGear.length === 0) return null; // No ship mining equipment

  for (const miner of miners) {
    // Find the best ship mining equipment this miner can operate
    const usableGear = shipMiningGear.filter(
      (def) => Math.floor(miner.skills.mining) >= (def.miningLevelRequired ?? 0)
    );
    if (usableGear.length === 0) continue; // Skill too low for all equipment

    const miningEquip = usableGear.reduce((best, current) =>
      (current.miningRate ?? 0) > (best.miningRate ?? 0) ? current : best
    );

    // Select best ore for this miner
    const ore = selectOreToMine(location, miner.skills.mining);
    if (!ore) continue;

    // Calculate yield
    const equipRate = miningEquip.miningRate ?? 1.0;
    const skillFactor = getSkillFactor(miner.skills.mining);

    // Mastery bonuses
    const masteryState = miner.mastery?.mining;
    const itemMastery = masteryState?.itemMasteries[ore.id];
    const masteryLevel = itemMastery?.level ?? 0;
    const masteryYieldBonus = getOreMasteryYieldBonus(masteryLevel);

    // Pool bonuses
    const pool = masteryState?.pool ?? { xp: 0, maxXp: 0 };
    const poolYieldBonus = getMiningPoolYieldBonus(pool);
    const doubleDropChance = getMiningPoolDoubleChance(pool);

    // Captain command bonus (ship-wide multiplier from captain's mining skill)
    const captainMiningMultiplier = 1 + getCommandMiningBonus(ship);

    // Final yield per tick
    const oreYield =
      BASE_MINING_RATE *
      equipRate *
      skillFactor *
      (1 + masteryYieldBonus) *
      (1 + poolYieldBonus) *
      captainMiningMultiplier;

    // Accumulate fractional ore
    const prevAccum = ship.miningAccumulator[ore.id] ?? 0;
    let newAccum = prevAccum + oreYield;

    // Convert whole units
    let wholeUnits = Math.floor(newAccum);
    newAccum -= wholeUnits;

    // Double drop chance (per whole unit, iterate over the original count)
    if (doubleDropChance > 0 && wholeUnits > 0) {
      const originalUnits = wholeUnits;
      for (let i = 0; i < originalUnits; i++) {
        if (Math.random() < doubleDropChance) {
          wholeUnits++;
        }
      }
    }

    // Enforce cargo capacity
    if (wholeUnits > 0) {
      const weightPerUnit = ore.weightPerUnit;
      const maxUnitsFromCapacity = Math.floor(
        (remainingCapacityKg - weightAddedThisTick) / weightPerUnit
      );

      if (maxUnitsFromCapacity <= 0) {
        result.cargoFull = true;
        ship.miningAccumulator[ore.id] = prevAccum; // Don't accumulate
        continue;
      }

      if (wholeUnits > maxUnitsFromCapacity) {
        wholeUnits = maxUnitsFromCapacity;
        newAccum = 0; // Reset accumulator — cargo is full
        result.cargoFull = true;
      }

      // Add to ore cargo
      const existing = ship.oreCargo.find((c) => c.oreId === ore.id);
      if (existing) {
        existing.quantity += wholeUnits;
      } else {
        ship.oreCargo.push({ oreId: ore.id, quantity: wholeUnits });
      }

      weightAddedThisTick += wholeUnits * weightPerUnit;

      // Track extraction
      result.oreExtracted[ore.id] =
        (result.oreExtracted[ore.id] ?? 0) + wholeUnits;

      // Award mastery XP
      if (masteryState) {
        const xpPerUnit = MASTERY_XP_PER_ORE;
        const totalXp = xpPerUnit * wholeUnits;
        const masteryResult = awardMasteryXp(
          masteryState,
          ore.id,
          totalXp,
          Math.floor(miner.skills.mining),
          totalOreCount
        );

        if (masteryResult.leveledUp) {
          result.masteryLevelUps.push({
            crewName: miner.name,
            oreName: ore.name,
            newLevel: masteryResult.newLevel,
          });
        }
      }
    }

    ship.miningAccumulator[ore.id] = newAccum;
  }

  return result;
}

// ─── Ore Selling ────────────────────────────────────────────────

/**
 * Location-based price multiplier for ore sales.
 * Trade hubs pay more; remote stations pay less.
 */
function getOrePriceMultiplier(location: WorldLocation): number {
  // Larger, more connected locations offer better prices
  if (location.type === 'planet') return 1.1;
  if (location.type === 'space_station') return 1.0;
  if (location.type === 'orbital') return 0.85;
  if (location.type === 'moon') return 0.9;
  return 0.8; // asteroid belts, planetoids
}

/**
 * Get the sell price for one unit of ore at a location, factoring in
 * commerce skill of the best trader on the ship.
 */
export function getOreSellPrice(
  ore: OreDefinition,
  location: WorldLocation,
  ship: Ship
): number {
  const basePrice = ore.baseValue;
  const locationMult = getOrePriceMultiplier(location);

  // Commerce skill bonus: best commerce skill on ship (captain + crew)
  let bestCommerce = 0;
  for (const crew of ship.crew) {
    if (crew.skills.commerce > bestCommerce) {
      bestCommerce = crew.skills.commerce;
    }
  }
  // Commerce bonus: +0.5% per skill point (max +50% at skill 100)
  const commerceMult = 1 + bestCommerce * 0.005;

  return Math.round(basePrice * locationMult * commerceMult);
}

/**
 * Sell ore from ship cargo at the current docked location.
 * Returns credits earned.
 */
export function sellOre(
  ship: Ship,
  oreId: OreId,
  quantity: number,
  location: WorldLocation,
  gameData: GameData
): number {
  const cargoItem = ship.oreCargo.find((c) => c.oreId === oreId);
  if (!cargoItem || cargoItem.quantity < quantity) return 0;

  const ore = getOreDefinition(oreId);
  const pricePerUnit = getOreSellPrice(ore, location, ship);
  const totalCredits = pricePerUnit * quantity;

  // Remove ore from cargo
  cargoItem.quantity -= quantity;
  if (cargoItem.quantity <= 0) {
    ship.oreCargo = ship.oreCargo.filter((c) => c.oreId !== oreId);
  }

  // Award credits
  gameData.credits += totalCredits;
  gameData.lifetimeCreditsEarned += totalCredits;
  ship.metrics.creditsEarned += totalCredits;

  // Award commerce mastery XP to ship commander (captain or acting CO)
  const captain = getShipCommander(ship);
  if (captain?.mastery?.commerce) {
    const tradeKey = `ore_sale_${location.id}`;
    awardMasteryXp(
      captain.mastery.commerce,
      tradeKey,
      quantity * 5, // Commerce XP per ore sold
      Math.floor(captain.skills.commerce),
      getAllOreDefinitions().length
    );
  }

  // Log the sale
  addLog(
    gameData.log,
    gameData.gameTime,
    'ore_sold',
    `${ship.name} sold ${quantity} ${ore.icon} ${ore.name} for ${totalCredits.toLocaleString()} cr at ${location.name}`,
    ship.name
  );

  return totalCredits;
}

/**
 * Sell all ore cargo from a ship at the current location.
 * Returns total credits earned.
 */
export function sellAllOre(
  ship: Ship,
  location: WorldLocation,
  gameData: GameData
): number {
  let totalCredits = 0;
  // Copy array since sellOre modifies it
  const oreItems = [...ship.oreCargo];
  for (const item of oreItems) {
    totalCredits += sellOre(
      ship,
      item.oreId,
      item.quantity,
      location,
      gameData
    );
  }
  return totalCredits;
}
