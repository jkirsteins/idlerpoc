import { SWARM_CONSTANTS } from './models/swarmTypes';

export type AlienTypeId = 'founder-queen';

export interface QueenAlienTypeDefinition {
  id: AlienTypeId;
  name: string;
  energyToZeroYears: number;
  hpToZeroYearsAtZeroEnergy: number;
}

export interface QueenMetabolismProfile {
  metabolismPerTick: number;
  hpDecayPerTickAtZeroEnergy: number;
}

export const DEFAULT_QUEEN_ALIEN_TYPE_ID: AlienTypeId = 'founder-queen';

export const QUEEN_ALIEN_TYPES: Record<AlienTypeId, QueenAlienTypeDefinition> =
  {
    'founder-queen': {
      id: 'founder-queen',
      name: 'Founder Queen',
      energyToZeroYears: 1,
      hpToZeroYearsAtZeroEnergy: 7,
    },
  };

export function getQueenMetabolismProfile(
  alienTypeId: string,
  energyMax: number,
  hpMax: number,
  yearTicks: number
): QueenMetabolismProfile {
  const definition =
    QUEEN_ALIEN_TYPES[alienTypeId as AlienTypeId] ??
    QUEEN_ALIEN_TYPES[DEFAULT_QUEEN_ALIEN_TYPE_ID];
  const safeYearTicks = Math.max(1, yearTicks || SWARM_CONSTANTS.TICKS_PER_DAY);

  const metabolismPerTick =
    energyMax / Math.max(1, definition.energyToZeroYears * safeYearTicks);
  const hpDecayPerTickAtZeroEnergy =
    hpMax / Math.max(1, definition.hpToZeroYearsAtZeroEnergy * safeYearTicks);

  return {
    metabolismPerTick,
    hpDecayPerTickAtZeroEnergy,
  };
}
