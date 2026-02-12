/**
 * Mining System
 *
 * Handles ore extraction during orbiting at mine-enabled locations.
 * Mining requires:
 *   1. Ship orbiting a location with 'mine' service
 *   2. Ship-mounted mining equipment installed (e.g. mining_laser)
 *   3. Available cargo space
 *
 * Crew assigned to mining_ops improves speed and unlocks higher-tier ores.
 * Without crew, equipment operates at a reduced base rate on tier-0 ores.
 *
 * Per-tick yield formula (with crew):
 *   orePerTick = BASE_RATE × equipmentRate × skillFactor × (1 + masteryYield) × (1 + poolYield) × captainBonus
 *
 * Per-tick yield formula (without crew):
 *   orePerTick = BASE_RATE × equipmentRate × CREWLESS_RATE_MULT
 *
 * Fractional ore accumulates in ship.miningAccumulator and converts to whole
 * units in ship.oreCargo when >= 1.0.
 */

import type { Ship, GameData, OreId, WorldLocation } from './models';
import { getShipCommander } from './models';
import {
  getCommandMiningBonus,
  getFleetAuraIncomeMultiplier,
} from './captainBonus';
import { getOreDefinition, type OreDefinition } from './oreTypes';
import { getEquipmentDefinition, type EquipmentDefinition } from './equipment';
import { getCrewForJobType } from './jobSlots';
import {
  awardMasteryXp,
  getOreMasteryYieldBonus,
  getMiningPoolYieldBonus,
  getMiningPoolDoubleChance,
  getMiningPoolWearReduction,
} from './masterySystem';
import { getAllOreDefinitions } from './oreTypes';
import { addLog } from './logSystem';
import { calculateAvailableCargoCapacity } from './flightPhysics';
import { getShipClass } from './shipClasses';
import { formatCredits } from './formatting';
import { GAME_SECONDS_PER_TICK, GAME_SECONDS_PER_HOUR } from './timeSystem';

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

/**
 * Base degradation applied to mining equipment per tick of active mining.
 * Same rate as heat-based wear (0.005 = 0.5%/tick).
 * At this rate, 100% degradation in 20,000 ticks of continuous mining
 * (~2.8 real minutes / ~16.7 game hours).
 */
const MINING_WEAR_PER_TICK = 0.005;

/**
 * Equipment effectiveness divisor — must match the value in equipment.ts.
 * At 100% degradation, effectiveness = 1 - 100/200 = 50%.
 */
const MINING_EFFECTIVENESS_DIVISOR = 200;

/**
 * Rate multiplier when mining without crew (equipment operates autonomously).
 * At 0.25x, crew-less mining is viable but significantly slower — a soft gate
 * encouraging players to assign crew without completely blocking progress.
 */
const CREWLESS_MINING_RATE_MULT = 0.25;

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
 * Select the ore to mine at a location for a given skill level.
 *
 * If selectedOreId is provided and the miner can access it at this location,
 * that ore is returned. Otherwise falls back to auto-selecting the
 * highest-value ore the miner can access.
 */
function selectOreToMine(
  location: WorldLocation,
  miningSkill: number,
  selectedOreId?: OreId
): OreDefinition | null {
  if (!location.availableOres || location.availableOres.length === 0) {
    return null;
  }

  // If player selected a specific ore, try to honour it
  if (selectedOreId && location.availableOres.includes(selectedOreId)) {
    const ore = getOreDefinition(selectedOreId);
    if (Math.floor(miningSkill) >= ore.miningLevelRequired) {
      return ore;
    }
    // Miner can't mine the selected ore — sit idle (don't fallback)
    return null;
  }

  // Auto-select: pick highest-value ore the miner can access
  const minableAtLocation = location.availableOres
    .map((id) => getOreDefinition(id))
    .filter((ore) => Math.floor(miningSkill) >= ore.miningLevelRequired);

  if (minableAtLocation.length === 0) return null;

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
 * Returns null if the ship cannot mine (wrong location, no equipment).
 * Mining works without crew at a reduced base rate (CREWLESS_MINING_RATE_MULT),
 * restricted to tier-0 ores.
 */
export function applyMiningTick(
  ship: Ship,
  location: WorldLocation
): MiningTickResult | null {
  // Verify location has mine service
  if (!location.services.includes('mine')) return null;

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

  // Get all mining equipment instances with their definitions
  const shipMiningGear = ship.equipment
    .map((eq) => ({
      instance: eq,
      def: getEquipmentDefinition(eq.definitionId),
    }))
    .filter(
      (
        item
      ): item is { instance: typeof item.instance; def: EquipmentDefinition } =>
        item.def !== undefined && item.def.category === 'mining'
    );

  if (shipMiningGear.length === 0) return null; // No ship mining equipment

  // Track which equipment instances were actively used this tick (for wear)
  const usedEquipmentIds = new Set<string>();

  // Get miners assigned to mining_ops
  const miners = getCrewForJobType(ship, 'mining_ops');
  const selectedOreId = ship.selectedMiningOreId;

  if (miners.length === 0) {
    // ── Crew-less base-rate mining ──────────────────────────────
    // Equipment operates autonomously at reduced rate, only tier-0 ores
    const bestGear = shipMiningGear.reduce((best, current) =>
      (current.def.miningRate ?? 0) > (best.def.miningRate ?? 0)
        ? current
        : best
    );

    // Crew-less mining uses skill 0 — only tier-0 ores accessible
    const ore = selectOreToMine(location, 0, selectedOreId);
    if (!ore) return result; // Selected ore needs crew, or no tier-0 ores here

    const baseEquipRate = bestGear.def.miningRate ?? 1.0;
    const equipEffectiveness =
      1 - bestGear.instance.degradation / MINING_EFFECTIVENESS_DIVISOR;
    const equipRate = baseEquipRate * equipEffectiveness;

    usedEquipmentIds.add(bestGear.instance.id);

    // Reduced yield: no skill factor, no mastery, no captain bonus
    const oreYield = BASE_MINING_RATE * equipRate * CREWLESS_MINING_RATE_MULT;

    const prevAccum = ship.miningAccumulator[ore.id] ?? 0;
    let newAccum = prevAccum + oreYield;
    let wholeUnits = Math.floor(newAccum);
    newAccum -= wholeUnits;

    if (wholeUnits > 0) {
      const weightPerUnit = ore.weightPerUnit;
      const maxUnitsFromCapacity = Math.floor(
        (remainingCapacityKg - weightAddedThisTick) / weightPerUnit
      );
      if (maxUnitsFromCapacity <= 0) {
        result.cargoFull = true;
        ship.miningAccumulator[ore.id] = prevAccum;
      } else {
        if (wholeUnits > maxUnitsFromCapacity) {
          wholeUnits = maxUnitsFromCapacity;
          newAccum = 0;
          result.cargoFull = true;
        }
        const existing = ship.oreCargo.find((c) => c.oreId === ore.id);
        if (existing) {
          existing.quantity += wholeUnits;
        } else {
          ship.oreCargo.push({ oreId: ore.id, quantity: wholeUnits });
        }
        weightAddedThisTick += wholeUnits * weightPerUnit;
        result.oreExtracted[ore.id] =
          (result.oreExtracted[ore.id] ?? 0) + wholeUnits;
        ship.miningAccumulator[ore.id] = newAccum;
      }
    } else {
      ship.miningAccumulator[ore.id] = newAccum;
    }
  } else {
    // ── Crew-operated mining ─────────────────────────────────────
    for (const miner of miners) {
      // Find the best ship mining equipment this miner can operate
      const usableGear = shipMiningGear.filter(
        (item) =>
          Math.floor(miner.skills.mining) >= (item.def.miningLevelRequired ?? 0)
      );
      if (usableGear.length === 0) continue; // Skill too low for all equipment

      const bestGear = usableGear.reduce((best, current) =>
        (current.def.miningRate ?? 0) > (best.def.miningRate ?? 0)
          ? current
          : best
      );

      // Select ore for this miner (respects player selection)
      const ore = selectOreToMine(location, miner.skills.mining, selectedOreId);
      if (!ore) continue;

      // Calculate yield — degradation reduces mining equipment effectiveness
      const baseEquipRate = bestGear.def.miningRate ?? 1.0;
      const equipEffectiveness =
        1 - bestGear.instance.degradation / MINING_EFFECTIVENESS_DIVISOR;
      const equipRate = baseEquipRate * equipEffectiveness;

      // Mark this equipment as actively used
      usedEquipmentIds.add(bestGear.instance.id);
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
  }

  // Apply wear to mining equipment that was actively used this tick
  if (usedEquipmentIds.size > 0) {
    // Mining pool mastery can reduce wear (only with crew)
    let wearReduction = 0;
    if (miners.length > 0) {
      const bestMiner = miners.reduce((best, m) =>
        m.skills.mining > best.skills.mining ? m : best
      );
      const pool = bestMiner.mastery?.mining?.pool ?? { xp: 0, maxXp: 0 };
      wearReduction = getMiningPoolWearReduction(pool);
    }

    const wearRate = MINING_WEAR_PER_TICK * (1 - wearReduction);

    for (const gear of shipMiningGear) {
      if (
        usedEquipmentIds.has(gear.instance.id) &&
        gear.instance.degradation < 100
      ) {
        gear.instance.degradation = Math.min(
          100,
          gear.instance.degradation + wearRate
        );
      }
    }
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

  // Award credits (with fleet coordination aura multiplier)
  const auraMultiplier = getFleetAuraIncomeMultiplier(ship, gameData);
  const boostedCredits = Math.round(totalCredits * auraMultiplier);
  gameData.credits += boostedCredits;
  gameData.lifetimeCreditsEarned += boostedCredits;
  ship.metrics.creditsEarned += boostedCredits;

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
    `${ship.name} sold ${quantity} ${ore.icon} ${ore.name} for ${formatCredits(boostedCredits)} at ${location.name}`,
    ship.name
  );

  return boostedCredits;
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

// ─── Mining Rate Calculation Helpers ─────────────────────────────

/**
 * Get the maximum ore cargo capacity in kg (total minus crew equipment weight).
 */
export function getMaxOreCargoCapacity(ship: Ship): number {
  const shipClass = getShipClass(ship.classId);
  if (!shipClass) return 0;
  const maxCargo = calculateAvailableCargoCapacity(shipClass.cargoCapacity);
  const equipmentWeight = ship.cargo.length * 5;
  return Math.max(0, maxCargo - equipmentWeight);
}

/**
 * Estimate the mining yield in ore units per game hour for a specific ore,
 * given the current ship state (crew, equipment, mastery, captain bonus).
 *
 * Returns 0 if the ship cannot mine that ore.
 */
export function getMiningYieldPerHour(
  ship: Ship,
  location: WorldLocation,
  ore: OreDefinition
): number {
  // Ore must be available at this location
  if (location.availableOres && !location.availableOres.includes(ore.id)) {
    return 0;
  }

  const ticksPerHour = GAME_SECONDS_PER_HOUR / GAME_SECONDS_PER_TICK;

  const shipMiningGear = ship.equipment
    .map((eq) => ({
      instance: eq,
      def: getEquipmentDefinition(eq.definitionId),
    }))
    .filter(
      (
        item
      ): item is { instance: typeof item.instance; def: EquipmentDefinition } =>
        item.def !== undefined && item.def.category === 'mining'
    );

  if (shipMiningGear.length === 0) return 0;

  const miners = getCrewForJobType(ship, 'mining_ops');

  if (miners.length === 0) {
    // Crew-less base rate — only tier-0 ores
    if (ore.miningLevelRequired > 0) return 0;

    const bestGear = shipMiningGear.reduce((best, current) =>
      (current.def.miningRate ?? 0) > (best.def.miningRate ?? 0)
        ? current
        : best
    );
    const baseEquipRate = bestGear.def.miningRate ?? 1.0;
    const equipEffectiveness =
      1 - bestGear.instance.degradation / MINING_EFFECTIVENESS_DIVISOR;
    const yieldPerTick =
      BASE_MINING_RATE *
      baseEquipRate *
      equipEffectiveness *
      CREWLESS_MINING_RATE_MULT;
    return yieldPerTick * ticksPerHour;
  }

  // Sum yield across all miners that can mine this ore
  let totalYieldPerTick = 0;
  for (const miner of miners) {
    if (Math.floor(miner.skills.mining) < ore.miningLevelRequired) continue;

    const usableGear = shipMiningGear.filter(
      (item) =>
        Math.floor(miner.skills.mining) >= (item.def.miningLevelRequired ?? 0)
    );
    if (usableGear.length === 0) continue;

    const bestGear = usableGear.reduce((best, current) =>
      (current.def.miningRate ?? 0) > (best.def.miningRate ?? 0)
        ? current
        : best
    );

    const baseEquipRate = bestGear.def.miningRate ?? 1.0;
    const equipEffectiveness =
      1 - bestGear.instance.degradation / MINING_EFFECTIVENESS_DIVISOR;
    const equipRate = baseEquipRate * equipEffectiveness;
    const skillFactor = getSkillFactor(miner.skills.mining);

    const masteryState = miner.mastery?.mining;
    const itemMastery = masteryState?.itemMasteries[ore.id];
    const masteryLevel = itemMastery?.level ?? 0;
    const masteryYieldBonus = getOreMasteryYieldBonus(masteryLevel);
    const pool = masteryState?.pool ?? { xp: 0, maxXp: 0 };
    const poolYieldBonus = getMiningPoolYieldBonus(pool);

    const captainMiningMultiplier = 1 + getCommandMiningBonus(ship);

    totalYieldPerTick +=
      BASE_MINING_RATE *
      equipRate *
      skillFactor *
      (1 + masteryYieldBonus) *
      (1 + poolYieldBonus) *
      captainMiningMultiplier;
  }

  return totalYieldPerTick * ticksPerHour;
}

/**
 * Estimate game seconds to fill remaining cargo capacity at current mining rate.
 * Returns Infinity if mining rate is 0.
 */
export function getTimeToFillCargo(
  ship: Ship,
  location: WorldLocation,
  ore: OreDefinition
): number {
  const yieldPerHour = getMiningYieldPerHour(ship, location, ore);
  if (yieldPerHour <= 0) return Infinity;

  const remainingKg = getRemainingOreCapacity(ship);
  const remainingUnits = remainingKg / ore.weightPerUnit;
  const hoursToFill = remainingUnits / yieldPerHour;
  return hoursToFill * GAME_SECONDS_PER_HOUR;
}
