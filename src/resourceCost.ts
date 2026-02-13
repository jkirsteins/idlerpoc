/**
 * Resource Cost Module
 *
 * Handles checking and deducting mined ore for ship purchases.
 * Ships may require specific ores in addition to credits.
 */

import type { Ship, OreId, GameData } from './models';
import type { ShipClass } from './shipClasses';
import { getOreDefinition } from './oreTypes';

/**
 * Get the total quantity of a specific ore across all ships in the fleet.
 */
export function getFleetOreTotal(ships: Ship[], oreId: OreId): number {
  let total = 0;
  for (const ship of ships) {
    for (const cargo of ship.oreCargo) {
      if (cargo.oreId === oreId) {
        total += cargo.quantity;
      }
    }
  }
  return total;
}

/**
 * Check if the fleet has enough ore to cover a ship's resource cost.
 * Returns an array of shortfalls (empty array = all requirements met).
 */
export function checkResourceCost(
  ships: Ship[],
  shipClass: ShipClass
): { oreId: OreId; required: number; available: number; name: string }[] {
  if (!shipClass.resourceCost) return [];

  const shortfalls: {
    oreId: OreId;
    required: number;
    available: number;
    name: string;
  }[] = [];

  for (const cost of shipClass.resourceCost) {
    const available = getFleetOreTotal(ships, cost.oreId);
    const oreDef = getOreDefinition(cost.oreId);
    if (available < cost.amount) {
      shortfalls.push({
        oreId: cost.oreId,
        required: cost.amount,
        available,
        name: oreDef?.name ?? cost.oreId,
      });
    }
  }

  return shortfalls;
}

/**
 * Check if all resource costs are met for a ship purchase.
 */
export function canAffordResources(
  ships: Ship[],
  shipClass: ShipClass
): boolean {
  return checkResourceCost(ships, shipClass).length === 0;
}

/**
 * Deduct ore from fleet ships to pay resource costs.
 * Distributes deduction across ships that have the ore.
 * Assumes canAffordResources() has already been checked.
 */
export function deductResourceCost(
  gameData: GameData,
  shipClass: ShipClass
): void {
  if (!shipClass.resourceCost) return;

  for (const cost of shipClass.resourceCost) {
    let remaining = cost.amount;

    for (const ship of gameData.ships) {
      if (remaining <= 0) break;

      const cargoItem = ship.oreCargo.find((c) => c.oreId === cost.oreId);
      if (!cargoItem || cargoItem.quantity <= 0) continue;

      const deduct = Math.min(cargoItem.quantity, remaining);
      cargoItem.quantity -= deduct;
      remaining -= deduct;

      // Clean up empty entries
      if (cargoItem.quantity <= 0) {
        ship.oreCargo = ship.oreCargo.filter((c) => c.quantity > 0);
      }
    }
  }
}

/**
 * Format resource cost for display.
 * Returns array of "{amount} {name}" strings, e.g. ["200 Titanium", "50 Platinum"].
 */
export function formatResourceCost(
  shipClass: ShipClass
): { oreId: OreId; amount: number; name: string; icon: string }[] {
  if (!shipClass.resourceCost) return [];

  return shipClass.resourceCost.map((cost) => {
    const oreDef = getOreDefinition(cost.oreId);
    return {
      oreId: cost.oreId,
      amount: cost.amount,
      name: oreDef?.name ?? cost.oreId,
      icon: oreDef?.icon ?? '',
    };
  });
}
