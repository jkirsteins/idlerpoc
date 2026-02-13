import type { Ship, GameData } from './models';
import { TICKS_PER_DAY } from './timeSystem';
import { addLog } from './logSystem';
import { formatMass, formatCredits } from './formatting';
import { getEffectiveProvisionsRecycling } from './equipment';

// ── Constants ────────────────────────────────────────────────────

/** Base kg of provisions consumed per crew member per game day (before recycling). */
export const PROVISIONS_KG_PER_CREW_PER_DAY = 15;

/** Maximum days of provisions auto-purchased when docked. */
export const MAX_PROVISION_DAYS = 30;

/** Base price per kg of provisions at trade stations. */
export const PROVISIONS_PRICE_PER_KG = 0.5;

// ── Helpers ──────────────────────────────────────────────────────

/** Effective consumption per crew per day, accounting for recycling equipment. */
export function getEffectiveConsumptionPerCrewPerDay(ship: Ship): number {
  const recycling = getEffectiveProvisionsRecycling(ship);
  return Math.max(
    PROVISIONS_KG_PER_CREW_PER_DAY - recycling,
    PROVISIONS_KG_PER_CREW_PER_DAY * 0.05
  );
}

/** Effective provisions consumed per crew member per tick. */
export function getEffectiveConsumptionPerCrewPerTick(ship: Ship): number {
  return getEffectiveConsumptionPerCrewPerDay(ship) / TICKS_PER_DAY;
}

/** Max provisions a ship should carry (based on current crew and recycling). */
export function getMaxProvisionsKg(ship: Ship): number {
  return (
    ship.crew.length *
    getEffectiveConsumptionPerCrewPerDay(ship) *
    MAX_PROVISION_DAYS
  );
}

/** Provisions price at a location. Outer-system locations charge more. */
export function getProvisionsPricePerKg(location: {
  distanceFromEarth: number;
}): number {
  if (location.distanceFromEarth > 1_000_000)
    return PROVISIONS_PRICE_PER_KG * 2.5;
  if (location.distanceFromEarth > 100_000)
    return PROVISIONS_PRICE_PER_KG * 1.5;
  return PROVISIONS_PRICE_PER_KG;
}

/** How many ticks of provisions remain for a ship. */
export function getProvisionsSurvivalTicks(ship: Ship): number {
  if (ship.crew.length === 0) return Infinity;
  const consumptionPerTick =
    ship.crew.length * getEffectiveConsumptionPerCrewPerTick(ship);
  if (consumptionPerTick <= 0) return Infinity;
  return Math.floor(ship.provisionsKg / consumptionPerTick);
}

/** How many game days of provisions remain for a ship. */
export function getProvisionsSurvivalDays(ship: Ship): number {
  return getProvisionsSurvivalTicks(ship) / TICKS_PER_DAY;
}

/** Health damage per tick from starvation (no provisions). */
export function getStarvationHealthDamage(provisionsKg: number): number {
  if (provisionsKg > 0) return 0;
  // Aggressive damage — starvation is serious
  return 3.0;
}

// ── Tick Logic ───────────────────────────────────────────────────

/**
 * Apply one tick of provisions consumption.
 * When docked at a trade station, auto-resupplies first (like oxygen refill).
 * Returns true if provisions level changed.
 */
export function applyProvisionsTick(ship: Ship, gameData: GameData): boolean {
  if (ship.crew.length === 0) return false;

  // Auto-resupply when docked at a trade station (runs every tick, but
  // only actually purchases when provisions are below max)
  if (ship.location.status === 'docked' && ship.location.dockedAt) {
    autoResupplyProvisions(gameData, ship, ship.location.dockedAt);
  }

  const consumptionPerTick =
    ship.crew.length * getEffectiveConsumptionPerCrewPerTick(ship);
  if (consumptionPerTick <= 0) return false;

  const oldLevel = ship.provisionsKg;
  ship.provisionsKg = Math.max(0, ship.provisionsKg - consumptionPerTick);

  // Starvation health damage
  const damage = getStarvationHealthDamage(ship.provisionsKg);
  if (damage > 0) {
    for (const crew of ship.crew) {
      crew.health = Math.max(0, crew.health - damage);
    }
  }

  // Log warnings at thresholds
  const survivalDays = getProvisionsSurvivalDays(ship);

  if (oldLevel > 0 && ship.provisionsKg <= 0) {
    addLog(
      gameData.log,
      gameData.gameTime,
      'provisions_warning',
      `Critical: ${ship.name} has run out of provisions! Crew is starving.`,
      ship.name
    );
  } else if (survivalDays <= 3 && survivalDays > 0) {
    // Only log once when crossing the 3-day threshold
    const prevSurvivalDays = oldLevel / consumptionPerTick / TICKS_PER_DAY;
    if (prevSurvivalDays > 3) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'provisions_warning',
        `Warning: ${ship.name} provisions critically low — ${Math.ceil(survivalDays)} days remaining.`,
        ship.name
      );
    }
  } else if (survivalDays <= 7 && survivalDays > 3) {
    const prevSurvivalDays = oldLevel / consumptionPerTick / TICKS_PER_DAY;
    if (prevSurvivalDays > 7) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'provisions_warning',
        `${ship.name} provisions running low — ${Math.ceil(survivalDays)} days remaining.`,
        ship.name
      );
    }
  }

  return ship.provisionsKg !== oldLevel;
}

/**
 * Auto-resupply provisions when docked at a location with trade service.
 * Buys up to max provisions, limited by credits and cargo space.
 */
export function autoResupplyProvisions(
  gameData: GameData,
  ship: Ship,
  locationId: string
): boolean {
  const location = gameData.world.locations.find((l) => l.id === locationId);
  if (!location || !location.services.includes('trade')) return false;

  const maxProvisions = getMaxProvisionsKg(ship);
  const needed = maxProvisions - ship.provisionsKg;
  if (needed <= 0) return false;

  const pricePerKg = getProvisionsPricePerKg(location);
  const totalCost = Math.round(needed * pricePerKg);

  if (gameData.credits >= totalCost) {
    ship.provisionsKg = maxProvisions;
    gameData.credits -= totalCost;
    if (totalCost > 0) {
      addLog(
        gameData.log,
        gameData.gameTime,
        'refueled',
        `Resupplied ${ship.name} provisions at ${location.name}: ${formatMass(needed)} (${formatCredits(totalCost)})`,
        ship.name
      );
    }
    return true;
  }

  // Buy what we can afford
  const affordableKg = Math.floor(gameData.credits / pricePerKg);
  if (affordableKg > 0) {
    const cost = Math.round(affordableKg * pricePerKg);
    ship.provisionsKg += affordableKg;
    gameData.credits -= cost;
    addLog(
      gameData.log,
      gameData.gameTime,
      'refueled',
      `Partially resupplied ${ship.name} provisions at ${location.name}: ${formatMass(affordableKg)} (${formatCredits(cost)}) — insufficient credits for full resupply`,
      ship.name
    );
    return true;
  }

  return false;
}
