/**
 * Fuel Pricing Module
 *
 * Centralized fuel pricing with engine-type and location-based multipliers.
 * Engine-type multipliers from WORLDRULES.md:
 *   Chemical (1x) < Fission (3x) < Fusion D-D (10x) < Fusion D-He3 (30x)
 */

import type { WorldLocation, Ship } from './models';
import { getShipCommander } from './models';
import { getEngineDefinition } from './engines';
import { getCommerceFuelDiscount } from './skillRanks';

const BASE_PRICE_PER_KG = 2; // credits per kg

/**
 * Engine-type fuel cost multiplier.
 * Reflects the real cost of different fuel types:
 * - LOX/LH2 is cheap and abundant
 * - Liquid hydrogen for NTR requires cryogenic processing
 * - Deuterium is refined from water (expensive)
 * - D-He3 mix requires rare helium-3 (very expensive)
 */
function getEngineTypeMultiplier(engineType: string): number {
  switch (engineType) {
    case 'Chemical Bipropellant':
      return 1.0;
    case 'Nuclear Fission':
      return 3.0;
    case 'Fusion (D-D)':
      return 10.0;
    case 'Fusion (D-He3)':
      return 30.0;
    case 'Advanced Fusion (Military)':
      return 30.0; // Same as D-He3 (uses D-He3 Mix fuel)
    default:
      return 1.0;
  }
}

/**
 * Location-based fuel availability multiplier.
 * Closer to Earth = cheaper (supply chain proximity).
 */
function getLocationMultiplier(distanceFromEarth: number): number {
  if (distanceFromEarth < 1_000) {
    return 0.8; // Earth/LEO — abundant fuel infrastructure
  } else if (distanceFromEarth < 500_000) {
    return 1.0; // Cislunar — standard pricing
  } else if (distanceFromEarth < 5_000_000) {
    return 1.5; // Deep cislunar / NEA — moderate premium
  } else if (distanceFromEarth < 100_000_000) {
    return 2.0; // Mars — significant logistics cost
  } else {
    return 2.5; // Belt / Jupiter — expensive, scarce
  }
}

/**
 * Get fuel price per kg at a given location for a specific ship.
 *
 * Formula: basePricePerKg × locationMult × engineTypeMult × (1 - commerceDiscount)
 *
 * When no ship is provided, returns the base location price without engine
 * or commerce modifiers (useful for display/estimation).
 */
export function getFuelPricePerKg(
  location: WorldLocation,
  ship?: Ship
): number {
  const locationMult = getLocationMultiplier(location.distanceFromEarth);

  let engineMult = 1.0;
  if (ship) {
    const engineDef = getEngineDefinition(ship.engine.definitionId);
    engineMult = getEngineTypeMultiplier(engineDef.type);
  }

  let price = BASE_PRICE_PER_KG * locationMult * engineMult;

  // Commerce discount from ship commander's trading experience
  if (ship) {
    const commander = getShipCommander(ship);
    if (commander) {
      const discount = getCommerceFuelDiscount(commander.skills.commerce);
      price *= 1 - discount;
    }
  }

  return price;
}
