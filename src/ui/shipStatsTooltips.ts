import { formatMass } from '../formatting';
import {
  calculateDeltaV,
  getSpecificImpulse,
  calculateFuelTankCapacity,
  calculateDryMass,
  CREW_MASS_KG,
  getCargoUsedKg,
} from '../flightPhysics';
import { getEquipmentDefinition } from '../equipment';
import type { Ship } from '../models';
import type { ShipClass } from '../shipClasses';
import type { EngineDefinition } from '../engines';

export function formatRangeTooltip(
  engineDef: EngineDefinition,
  shipClass: ShipClass,
  maxRangeKm: number
): string {
  const isp = getSpecificImpulse(engineDef);
  const dryMass = shipClass.mass;
  const fuelCap = calculateFuelTankCapacity(shipClass);
  const wetMass = dryMass + fuelCap;
  const maxDv = calculateDeltaV(wetMass, dryMass, isp);
  const allocDv = maxDv * 0.5;
  const vCruise = allocDv / 2;

  const parts: string[] = [];
  parts.push(
    `<div><span class="custom-tooltip-label">Engine:</span> <span class="custom-tooltip-value">${engineDef.name}</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Specific Impulse:</span> <span class="custom-tooltip-value">${isp.toLocaleString()} s</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Dry Mass:</span> <span class="custom-tooltip-value">${formatMass(dryMass)}</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Fuel Capacity:</span> <span class="custom-tooltip-value">${formatMass(fuelCap)}</span></div>`
  );
  parts.push(
    '<div class="custom-tooltip-section">Tsiolkovsky Derivation:</div>'
  );
  parts.push(
    `<div class="custom-tooltip-item">Δv = Isp × g₀ × ln(wet/dry) = ${(maxDv / 1000).toFixed(1)} km/s</div>`
  );
  parts.push(
    `<div class="custom-tooltip-item">Trip budget (50%): ${(allocDv / 1000).toFixed(1)} km/s</div>`
  );
  parts.push(
    `<div class="custom-tooltip-item">Cruise velocity: ${(vCruise / 1000).toFixed(1)} km/s</div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Max Range:</span> <span class="custom-tooltip-value">${maxRangeKm.toLocaleString()} km</span></div>`
  );

  return parts.join('');
}

export function formatAccelerationTooltip(
  engineDef: EngineDefinition,
  shipMass: number
): string {
  const acceleration = engineDef.thrust / shipMass;
  const accelerationG = acceleration / 9.81;

  const parts: string[] = [];
  parts.push(
    `<div><span class="custom-tooltip-label">Thrust:</span> <span class="custom-tooltip-value">${engineDef.thrust.toLocaleString()} N</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Ship Mass:</span> <span class="custom-tooltip-value">${formatMass(shipMass)}</span></div>`
  );
  parts.push('<div class="custom-tooltip-section">Calculation:</div>');
  parts.push(
    `<div class="custom-tooltip-item">${engineDef.thrust.toLocaleString()} N / ${formatMass(shipMass)} = ${acceleration.toFixed(4)} m/s²</div>`
  );
  parts.push(
    `<div class="custom-tooltip-item">${acceleration.toFixed(4)} / 9.81 = ${accelerationG.toFixed(4)}g</div>`
  );

  return parts.join('');
}

export function formatEquipmentSlotsTooltip(
  ship: Ship,
  standardSlots: number,
  structuralSlots: number
): string {
  const parts: string[] = [];
  parts.push(
    `<div><span class="custom-tooltip-label">Standard Slots:</span> <span class="custom-tooltip-value">${standardSlots}</span></div>`
  );
  parts.push(
    `<div class="custom-tooltip-item" style="color: #aaa; font-size: 0.85em;">General-purpose slots for equipment</div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Structural Slots:</span> <span class="custom-tooltip-value">${structuralSlots}</span></div>`
  );
  parts.push(
    `<div class="custom-tooltip-item" style="color: #aaa; font-size: 0.85em;">Hull-integrated slots for armor/shielding</div>`
  );

  if (ship.equipment.length > 0) {
    parts.push('<div class="custom-tooltip-section">Equipped:</div>');
    for (const eq of ship.equipment) {
      const eqDef = getEquipmentDefinition(eq.definitionId);
      if (eqDef) {
        parts.push(`<div class="custom-tooltip-item">${eqDef.name}</div>`);
      }
    }
  } else {
    parts.push(
      '<div class="custom-tooltip-item" style="color: #ff6b6b;">No equipment installed</div>'
    );
  }

  return parts.join('');
}

export function formatShipMassTooltip(
  ship: Ship,
  shipClass: ShipClass
): string {
  const hullMass = shipClass.mass;
  const crewMass = ship.crew.length * CREW_MASS_KG;
  const cargoMass = getCargoUsedKg(ship);
  const fuelMass = ship.fuelKg;
  const dryMass = calculateDryMass(ship);
  const wetMass = dryMass + fuelMass;

  const parts: string[] = [];
  parts.push(
    `<div><span class="custom-tooltip-label">Hull Mass:</span> <span class="custom-tooltip-value">${formatMass(hullMass)}</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Crew Mass:</span> <span class="custom-tooltip-value">${formatMass(crewMass)} (${ship.crew.length} × ${CREW_MASS_KG} kg)</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Cargo:</span> <span class="custom-tooltip-value">${formatMass(cargoMass)}</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Fuel:</span> <span class="custom-tooltip-value">${formatMass(fuelMass)}</span></div>`
  );
  parts.push('<div class="custom-tooltip-section">Total:</div>');
  parts.push(
    `<div class="custom-tooltip-item">${formatMass(dryMass)} dry + ${formatMass(fuelMass)} fuel = ${formatMass(wetMass)}</div>`
  );

  return parts.join('');
}

export function formatCrewCountTooltip(
  ship: Ship,
  shipClass: ShipClass
): string {
  const crewCount = ship.crew.length;
  const crewCapacity = shipClass.maxCrew;
  const crewMass = crewCount * CREW_MASS_KG;

  // Provisions: 2kg per crew per day (from provisionsSystem.ts)
  const provisionsPerDay = crewCount * 2;

  // O2: 0.84 kg per crew per day = 0.035 kg/hr (from lifeSupportSystem.ts)
  const o2PerHour = crewCount * 0.035;

  const parts: string[] = [];
  parts.push(
    `<div><span class="custom-tooltip-label">Crew Capacity:</span> <span class="custom-tooltip-value">${crewCapacity}</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Mass Contribution:</span> <span class="custom-tooltip-value">${formatMass(crewMass)} (${crewCount} × ${CREW_MASS_KG}kg)</span></div>`
  );
  parts.push('<div class="custom-tooltip-section">Resource Consumption:</div>');
  parts.push(
    `<div class="custom-tooltip-item">Provisions: ${formatMass(provisionsPerDay)}/day</div>`
  );
  parts.push(
    `<div class="custom-tooltip-item">O₂: ${o2PerHour.toFixed(2)} kg/hr</div>`
  );

  return parts.join('');
}
