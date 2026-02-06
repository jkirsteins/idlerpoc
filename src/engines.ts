export type EngineId =
  | 'chemical_bipropellant'
  | 'ntr_mk1'
  | 'ntr_mk2'
  | 'ntr_heavy'
  | 'ntr_stealth';

export interface EngineDefinition {
  id: EngineId;
  name: string;
  type: string; // e.g. "Chemical Bipropellant", "Nuclear Thermal Rocket"
  description: string;
  icon: string;
  powerOutput: number; // kW when online
  fuelType: string; // e.g. "LOX/LH2", "Liquid Hydrogen"
  fuelConsumptionRate: number; // fuel % per tick
  warmupRate: number; // % per tick (so 100/warmupRate = ticks to warm up)
  selfPowerDraw: number; // kW the engine itself consumes (from its own output)
}

export const ENGINE_DEFINITIONS: EngineDefinition[] = [
  {
    id: 'chemical_bipropellant',
    name: 'RS-44 Bipropellant',
    type: 'Chemical Bipropellant',
    description:
      'Basic chemical rocket engine. Quick warmup but limited power output and high fuel consumption.',
    icon: '🔥',
    powerOutput: 50,
    fuelType: 'LOX/LH2',
    fuelConsumptionRate: 0.5,
    warmupRate: 20, // 5 ticks to warm up
    selfPowerDraw: 5,
  },
  {
    id: 'ntr_mk1',
    name: 'NTR-200 Fission Drive',
    type: 'Nuclear Fission',
    description:
      'Entry-level nuclear thermal rocket. Reliable power output with moderate fuel efficiency.',
    icon: '⚛️',
    powerOutput: 120,
    fuelType: 'Liquid Hydrogen',
    fuelConsumptionRate: 0.1,
    warmupRate: 10, // 10 ticks to warm up
    selfPowerDraw: 8,
  },
  {
    id: 'ntr_mk2',
    name: 'NTR-450 Fission Drive',
    type: 'Nuclear Fission',
    description:
      'Upgraded fission drive with improved power output and similar efficiency.',
    icon: '⚛️',
    powerOutput: 150,
    fuelType: 'Liquid Hydrogen',
    fuelConsumptionRate: 0.12,
    warmupRate: 10, // 10 ticks to warm up
    selfPowerDraw: 10,
  },
  {
    id: 'ntr_heavy',
    name: 'NTR-800 Heavy Reactor',
    type: 'Nuclear Fission',
    description:
      'Heavy-duty reactor for maximum power output. Longer warmup time and higher fuel consumption.',
    icon: '☢️',
    powerOutput: 200,
    fuelType: 'Liquid Hydrogen',
    fuelConsumptionRate: 0.15,
    warmupRate: 6.67, // ~15 ticks to warm up
    selfPowerDraw: 15,
  },
  {
    id: 'ntr_stealth',
    name: 'NTR-300S Low-Sig Drive',
    type: 'Nuclear Fission',
    description:
      'Low-signature stealth drive. Good power output with minimal heat signature and fast warmup.',
    icon: '🌑',
    powerOutput: 140,
    fuelType: 'Liquid Hydrogen',
    fuelConsumptionRate: 0.1,
    warmupRate: 12.5, // 8 ticks to warm up
    selfPowerDraw: 8,
  },
];

export function getEngineDefinition(id: EngineId): EngineDefinition {
  const engine = ENGINE_DEFINITIONS.find((e) => e.id === id);
  if (!engine) {
    throw new Error(`Engine definition not found: ${id}`);
  }
  return engine;
}

export function getAllEngineDefinitions(): EngineDefinition[] {
  return ENGINE_DEFINITIONS;
}
