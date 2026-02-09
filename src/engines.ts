import type { EngineId } from './models';

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
  thrust: number; // Newtons
  maxDeltaV: number; // m/s (total delta-v budget)
  radiationOutput: number; // 0-120+ radiation emitted
  wasteHeatOutput: number; // kW-thermal
  maxThrust: number; // milli-g max sustained accel
  containmentComplexity: number; // 0-8 engineering skill demand
}

export const ENGINE_DEFINITIONS: EngineDefinition[] = [
  {
    id: 'chemical_bipropellant',
    name: 'RS-44 Bipropellant',
    type: 'Chemical Bipropellant',
    description:
      'Basic chemical rocket engine. Quick warmup but limited power output and high fuel consumption.',
    icon: '🔥',
    powerOutput: 60,
    fuelType: 'LOX/LH2',
    fuelConsumptionRate: 0.5,
    warmupRate: 33.3, // 3 ticks to warm up
    selfPowerDraw: 5,
    thrust: 1500, // 0.003g on 50t Station Keeper
    maxDeltaV: 1000, // m/s
    radiationOutput: 0,
    wasteHeatOutput: 0,
    maxThrust: 10, // milli-g
    containmentComplexity: 0,
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
    warmupRate: 20, // 5 ticks to warm up
    selfPowerDraw: 8,
    thrust: 4000, // 0.002g on 200t Wayfarer
    maxDeltaV: 20000, // m/s
    radiationOutput: 5,
    wasteHeatOutput: 10,
    maxThrust: 5, // milli-g
    containmentComplexity: 1,
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
    warmupRate: 20, // 5 ticks to warm up
    selfPowerDraw: 10,
    thrust: 10000, // 0.0029g on 350t Corsair
    maxDeltaV: 30000, // m/s
    radiationOutput: 8,
    wasteHeatOutput: 15,
    maxThrust: 5, // milli-g
    containmentComplexity: 1,
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
    warmupRate: 12.5, // 8 ticks to warm up
    selfPowerDraw: 15,
    thrust: 20000, // 0.004g on 500t Dreadnought
    maxDeltaV: 40000, // m/s
    radiationOutput: 15,
    wasteHeatOutput: 30,
    maxThrust: 5, // milli-g
    containmentComplexity: 1,
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
    warmupRate: 25, // 4 ticks to warm up
    selfPowerDraw: 8,
    thrust: 7500, // 0.003g on 250t Phantom
    maxDeltaV: 25000, // m/s
    radiationOutput: 5,
    wasteHeatOutput: 10,
    maxThrust: 5, // milli-g
    containmentComplexity: 1,
  },
  // Class III: Fusion Drives
  {
    id: 'fdr_sunfire',
    name: 'FDR-100 "Sunfire"',
    type: 'Fusion (D-D)',
    description:
      'Entry-level fusion torch drive. Deuterium-deuterium reaction. Continuous burn capability for weeks.',
    icon: '☀️',
    powerOutput: 400,
    fuelType: 'Deuterium',
    fuelConsumptionRate: 0.08,
    warmupRate: 10, // 10 ticks to warm up
    selfPowerDraw: 20,
    thrust: 50000, // 0.05g on typical torch ship
    maxDeltaV: 150000, // m/s
    radiationOutput: 40,
    wasteHeatOutput: 150,
    maxThrust: 100, // milli-g
    containmentComplexity: 3,
  },
  {
    id: 'fdr_hellion',
    name: 'FDR-300 "Hellion"',
    type: 'Fusion (D-He3)',
    description:
      'Mid-range fusion drive. D-He3 reaction for improved efficiency. Serious torch capability.',
    icon: '🔆',
    powerOutput: 600,
    fuelType: 'D-He3 Mix',
    fuelConsumptionRate: 0.1,
    warmupRate: 8.33, // 12 ticks to warm up
    selfPowerDraw: 30,
    thrust: 80000, // 0.08g on typical torch ship
    maxDeltaV: 300000, // m/s
    radiationOutput: 60,
    wasteHeatOutput: 250,
    maxThrust: 100, // milli-g
    containmentComplexity: 4,
  },
  {
    id: 'fdr_torch',
    name: 'FDR-500 "Torch"',
    type: 'Fusion (D-He3)',
    description:
      'High-performance fusion torch. Maximum sustained acceleration. Expensive to operate.',
    icon: '💫',
    powerOutput: 800,
    fuelType: 'D-He3 Mix',
    fuelConsumptionRate: 0.12,
    warmupRate: 6.67, // 15 ticks to warm up
    selfPowerDraw: 40,
    thrust: 100000, // 0.1g on typical torch ship
    maxDeltaV: 500000, // m/s
    radiationOutput: 80,
    wasteHeatOutput: 400,
    maxThrust: 100, // milli-g
    containmentComplexity: 5,
  },
  // Class IV: Advanced Fusion (Military)
  {
    id: 'unas_m1_colossus',
    name: 'UNAS M-1 "Colossus"',
    type: 'Advanced Fusion (Military)',
    description:
      'Military-grade advanced fusion drive. Extreme acceleration capability. G-forces are lethal without countermeasures.',
    icon: '⚡',
    powerOutput: 1200,
    fuelType: 'D-He3 Mix',
    fuelConsumptionRate: 0.15,
    warmupRate: 5.0, // 20 ticks to warm up
    selfPowerDraw: 60,
    thrust: 500000, // 5g+ on cruiser-class vessels
    maxDeltaV: 1000000, // m/s
    radiationOutput: 120,
    wasteHeatOutput: 800,
    maxThrust: 10000, // milli-g (10g)
    containmentComplexity: 8,
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
