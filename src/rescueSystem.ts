import type { Quest, Ship, GameData } from './models';
import { getStrandedShips, type StrandedShipInfo } from './strandedSystem';
import {
  calculateOneLegFuelKg,
  calculateShipAvailableCargo,
} from './flightPhysics';
import { getDistanceBetween } from './utils';
import { formatMass } from './formatting';
import { addLog } from './logSystem';

/**
 * Rescue Quest System
 *
 * When a ship is stranded, rescue quests are generated at all OTHER
 * locations in the fleet. A rescuing ship must carry fuel as cargo
 * for the stranded ship and have enough of its own fuel for the round trip.
 */

/** Fuel buffer multiplier — deliver 20% extra to avoid stranding the rescued ship immediately. */
const RESCUE_FUEL_BUFFER = 1.2;

/**
 * Generate rescue quests for a stranded ship.
 * Returns quests that should appear at all other fleet locations.
 */
export function generateRescueQuests(strandedInfo: StrandedShipInfo): Quest[] {
  const {
    ship: strandedShip,
    location: strandedLoc,
    nearestRefuel,
  } = strandedInfo;

  // Need a refuel station to calculate how much fuel the stranded ship needs
  if (!nearestRefuel) return [];

  // Fuel payload = what the stranded ship needs to reach nearest refuel station (+ buffer)
  const rescueFuelKg = Math.ceil(
    nearestRefuel.fuelNeededKg * RESCUE_FUEL_BUFFER
  );

  const survivalDays = strandedInfo.survivalDays;
  const urgency =
    survivalDays < 7 ? 'URGENT' : survivalDays < 14 ? 'Priority' : 'Standard';

  const quest: Quest = {
    id: `rescue_${strandedShip.id}`,
    type: 'rescue',
    title: `${urgency}: Rescue ${strandedShip.name}`,
    description: `Deliver ${formatMass(rescueFuelKg)} of fuel to ${strandedShip.name} stranded at ${strandedLoc.name}. Crew has ${Math.ceil(survivalDays)} days of provisions remaining.`,
    origin: '', // Resolved per-ship (any location)
    destination: strandedLoc.id,
    cargoRequired: rescueFuelKg, // Fuel payload takes cargo space
    totalCargoRequired: 0,
    tripsRequired: 1,
    paymentPerTrip: 0, // Fleet self-rescue — no payment
    paymentOnCompletion: 0,
    expiresAfterDays: 0, // Never expires (but urgency from provisions)
    estimatedFuelPerTrip: 0, // Resolved per-ship
    estimatedTripTicks: 0, // Resolved per-ship
    cargoFraction: 0, // Not using fraction — fixed cargo amount
    rescueShipId: strandedShip.id,
    rescueFuelKg,
  };

  return [quest];
}

/**
 * Generate all rescue quests for the current game state.
 * Merges with existing available quests.
 */
export function generateFleetRescueQuests(gameData: GameData): Quest[] {
  const strandedShips = getStrandedShips(gameData);
  const rescueQuests: Quest[] = [];

  for (const info of strandedShips) {
    rescueQuests.push(...generateRescueQuests(info));
  }

  return rescueQuests;
}

/**
 * Check if a ship can accept a rescue quest.
 * Additional validation beyond standard canAcceptQuest:
 * - Rescuer must have cargo space for fuel payload
 * - Rescuer must have enough of its OWN fuel for round trip
 *   (the fuel payload is cargo, not usable by the rescuer's engines)
 */
export function canAcceptRescueQuest(
  rescuer: Ship,
  quest: Quest,
  world: GameData['world']
): { canAccept: boolean; reason?: string } {
  if (quest.type !== 'rescue' || !quest.rescueFuelKg) {
    return { canAccept: false, reason: 'Not a rescue quest' };
  }

  const destLoc = world.locations.find((l) => l.id === quest.destination);
  if (!destLoc) {
    return { canAccept: false, reason: 'Unknown destination' };
  }

  // Rescuer's current location
  const rescuerLocId = rescuer.location.dockedAt || rescuer.location.orbitingAt;
  if (!rescuerLocId) {
    return { canAccept: false, reason: 'Rescuer must be docked or orbiting' };
  }
  const rescuerLoc = world.locations.find((l) => l.id === rescuerLocId);
  if (!rescuerLoc) {
    return { canAccept: false, reason: 'Unknown rescuer location' };
  }

  // Can't rescue yourself
  if (quest.rescueShipId === rescuer.id) {
    return { canAccept: false, reason: 'A ship cannot rescue itself' };
  }

  // Check cargo space for fuel payload (after provisions)
  const availableCargo = calculateShipAvailableCargo(rescuer);
  if (quest.rescueFuelKg > availableCargo) {
    return {
      canAccept: false,
      reason: `Insufficient cargo space for fuel payload (need ${formatMass(quest.rescueFuelKg)}, have ${formatMass(Math.floor(availableCargo))})`,
    };
  }

  // Check rescuer's own fuel for round trip
  const distanceKm = getDistanceBetween(rescuerLoc, destLoc);
  const oneLegFuel = calculateOneLegFuelKg(rescuer, distanceKm);
  const roundTripFuel = oneLegFuel * 2;
  if (roundTripFuel > rescuer.fuelKg) {
    return {
      canAccept: false,
      reason: `Insufficient fuel for rescue round trip (need ${formatMass(Math.ceil(roundTripFuel))}, have ${formatMass(rescuer.fuelKg)})`,
    };
  }

  return { canAccept: true };
}

/**
 * Complete a rescue delivery — transfer fuel to the stranded ship.
 * Called when a rescue contract's outbound leg completes.
 */
export function completeRescueDelivery(
  gameData: GameData,
  rescuer: Ship,
  quest: Quest
): boolean {
  if (!quest.rescueShipId || !quest.rescueFuelKg) return false;

  const strandedShip = gameData.ships.find((s) => s.id === quest.rescueShipId);
  if (!strandedShip) return false;

  // Transfer fuel to stranded ship (capped at tank capacity)
  const fuelToTransfer = Math.min(
    quest.rescueFuelKg,
    strandedShip.maxFuelKg - strandedShip.fuelKg
  );
  strandedShip.fuelKg += fuelToTransfer;

  addLog(
    gameData.log,
    gameData.gameTime,
    'rescue',
    `${rescuer.name} delivered ${formatMass(fuelToTransfer)} of fuel to ${strandedShip.name}. Rescue complete!`,
    rescuer.name
  );

  addLog(
    gameData.log,
    gameData.gameTime,
    'rescue',
    `${strandedShip.name} received emergency fuel delivery from ${rescuer.name}.`,
    strandedShip.name
  );

  return true;
}
