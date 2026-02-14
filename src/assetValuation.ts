import type { GameData } from './models';
import { getShipClass } from './shipClasses';
import { getEquipmentDefinition } from './equipment';
import { getCrewEquipmentDefinition } from './crewEquipment';
import { getOreDefinition } from './oreTypes';
import { PROVISIONS_PRICE_PER_KG } from './provisionsSystem';

// Base fuel price for asset valuation (simplified, not location/engine-specific)
const FUEL_BASE_PRICE_PER_KG = 2;

export interface AssetBreakdown {
  cash: number;
  ships: number; // sum of ShipClass.price
  shipEquipment: number; // sum of EquipmentDefinition.value (where defined)
  crewEquipment: number; // sum of CrewEquipmentDefinition.value (cargo + equipped)
  fuel: number; // fuelKg * base fuel price
  provisions: number; // provisionsKg * base provisions price
  ore: number; // quantity * OreDefinition.baseValue
  totalAssets: number;
}

/**
 * Calculate total asset breakdown for the player's fleet.
 * Uses base market rates (not location-specific) for simplicity and determinism.
 */
export function calculateAssetBreakdown(gameData: GameData): AssetBreakdown {
  const breakdown: AssetBreakdown = {
    cash: gameData.credits,
    ships: 0,
    shipEquipment: 0,
    crewEquipment: 0,
    fuel: 0,
    provisions: 0,
    ore: 0,
    totalAssets: 0,
  };

  for (const ship of gameData.ships) {
    // Ship hull value
    const shipClass = getShipClass(ship.classId);
    if (shipClass) {
      breakdown.ships += shipClass.price;
    }

    // Ship equipment value
    for (const eq of ship.equipment) {
      const equipDef = getEquipmentDefinition(eq.definitionId);
      if (equipDef?.value !== undefined) {
        breakdown.shipEquipment += equipDef.value;
      }
    }

    // Crew equipment value (cargo)
    for (const item of ship.cargo) {
      const equipDef = getCrewEquipmentDefinition(item.definitionId);
      breakdown.crewEquipment += equipDef.value;
    }

    // Crew equipment value (equipped on crew)
    for (const crew of ship.crew) {
      for (const item of crew.equipment) {
        const equipDef = getCrewEquipmentDefinition(item.definitionId);
        breakdown.crewEquipment += equipDef.value;
      }
    }

    // Fuel value (base rate)
    breakdown.fuel += ship.fuelKg * FUEL_BASE_PRICE_PER_KG;

    // Provisions value (base rate)
    breakdown.provisions += ship.provisionsKg * PROVISIONS_PRICE_PER_KG;

    // Ore cargo value
    for (const cargo of ship.oreCargo) {
      const oreDef = getOreDefinition(cargo.oreId);
      breakdown.ore += cargo.quantity * oreDef.baseValue;
    }
  }

  breakdown.totalAssets =
    breakdown.cash +
    breakdown.ships +
    breakdown.shipEquipment +
    breakdown.crewEquipment +
    breakdown.fuel +
    breakdown.provisions +
    breakdown.ore;

  return breakdown;
}
