import { describe, it, expect } from 'vitest';
import {
  calculatePositionDanger,
  calculateHeatSignature,
  calculateCrewSkillFactor,
  isOnCooldown,
  calculateEncounterChance,
  getShipPositionKm,
  getThreatLevel,
  getThreatNarrative,
  ENCOUNTER_CONSTANTS,
} from '../encounterSystem';
import { getEngineDefinition } from '../engines';
import {
  createTestShip,
  createTestGameData,
  createTestWorld,
  createTestCrew,
  createTestFlight,
  assignCrewToJob,
  clearJobSlots,
} from './testHelpers';

describe('calculatePositionDanger', () => {
  const world = createTestWorld();

  it('returns minimum danger near Earth (0 km)', () => {
    const danger = calculatePositionDanger(0, world);
    expect(danger).toBeCloseTo(0.1, 1);
  });

  it('returns minimum danger near Mars (54.6M km)', () => {
    const danger = calculatePositionDanger(54_600_000, world);
    expect(danger).toBeCloseTo(0.1, 1);
  });

  it('returns minimum danger near Gateway Station (400 km)', () => {
    const danger = calculatePositionDanger(400, world);
    expect(danger).toBeCloseTo(0.1, 1);
  });

  it('returns maximum danger in deep space midway Earth-Mars', () => {
    // 27.3M km from Earth, nearest TA location is Mars at 54.6M = 27.3M away
    const danger = calculatePositionDanger(27_300_000, world);
    expect(danger).toBeGreaterThanOrEqual(ENCOUNTER_CONSTANTS.DANGER_MAX);
  });

  it('has elevated danger near Freeport (1.2M km, lawless zone)', () => {
    const dangerAtFreeport = calculatePositionDanger(1_200_000, world);
    const dangerFarFromLawless = calculatePositionDanger(384_400, world); // Forge Station (TA)
    expect(dangerAtFreeport).toBeGreaterThan(dangerFarFromLawless);
  });

  it('has elevated danger near The Scatter (2.5M km, lawless zone)', () => {
    const dangerAtScatter = calculatePositionDanger(2_500_000, world);
    // Should have both lawless bonus and moderate alliance distance
    expect(dangerAtScatter).toBeGreaterThan(0.5);
  });

  it('lawless bonus decays with distance from lawless locations', () => {
    const dangerAtScatter = calculatePositionDanger(2_500_000, world);
    const dangerFarFromScatter = calculatePositionDanger(5_000_000, world);
    // Both are far from alliance, but scatter has lawless proximity
    // At 5M km, scatter proximity would be max(0, 1 - |5M - 2.5M|/1M) = max(0, 1-2.5) = 0
    expect(dangerAtScatter).toBeGreaterThan(dangerFarFromScatter * 0.5);
  });

  it('near Jupiter Station (TA faction) danger is low', () => {
    const danger = calculatePositionDanger(628_000_000, world);
    expect(danger).toBeCloseTo(0.1, 1);
  });

  it('danger is always positive', () => {
    // Test various positions
    for (const km of [0, 100, 1000, 100_000, 1_000_000, 100_000_000]) {
      expect(calculatePositionDanger(km, world)).toBeGreaterThan(0);
    }
  });
});

describe('calculateHeatSignature', () => {
  it('chemical engine has baseline signature (1.0) when burning', () => {
    const engine = getEngineDefinition('chemical_bipropellant');
    expect(calculateHeatSignature(engine, 'accelerating')).toBe(1.0);
  });

  it('chemical engine has baseline signature when coasting', () => {
    const engine = getEngineDefinition('chemical_bipropellant');
    expect(calculateHeatSignature(engine, 'coasting')).toBe(1.0);
  });

  it('NTR stealth (10 kW) has low signature when burning', () => {
    const engine = getEngineDefinition('ntr_stealth');
    const sig = calculateHeatSignature(engine, 'accelerating');
    expect(sig).toBeCloseTo(1.05, 2);
  });

  it('NTR stealth has near-baseline when coasting', () => {
    const engine = getEngineDefinition('ntr_stealth');
    const sig = calculateHeatSignature(engine, 'coasting');
    expect(sig).toBeCloseTo(1.005, 3);
  });

  it('Fusion Sunfire (150 kW) is a bright beacon when burning', () => {
    const engine = getEngineDefinition('fdr_sunfire');
    const sig = calculateHeatSignature(engine, 'accelerating');
    expect(sig).toBeCloseTo(1.75, 2);
  });

  it('Fusion Sunfire drops significantly when coasting', () => {
    const engine = getEngineDefinition('fdr_sunfire');
    const sigBurn = calculateHeatSignature(engine, 'accelerating');
    const sigCoast = calculateHeatSignature(engine, 'coasting');
    expect(sigCoast).toBeLessThan(sigBurn);
    expect(sigCoast).toBeCloseTo(1.075, 2);
  });

  it('Hellion (250 kW) burning is very high', () => {
    const engine = getEngineDefinition('fdr_hellion');
    const sig = calculateHeatSignature(engine, 'accelerating');
    expect(sig).toBeCloseTo(2.25, 2);
  });

  it('Torch (400 kW) burning is extremely high', () => {
    const engine = getEngineDefinition('fdr_torch');
    const sig = calculateHeatSignature(engine, 'accelerating');
    expect(sig).toBeCloseTo(3.0, 1);
  });

  it('UNAS Colossus (800 kW) is the highest signature', () => {
    const engine = getEngineDefinition('unas_m1_colossus');
    const sig = calculateHeatSignature(engine, 'accelerating');
    expect(sig).toBeCloseTo(5.0, 1);
  });

  it('decelerating has same signature as accelerating', () => {
    const engine = getEngineDefinition('fdr_sunfire');
    const sigAccel = calculateHeatSignature(engine, 'accelerating');
    const sigDecel = calculateHeatSignature(engine, 'decelerating');
    expect(sigAccel).toBe(sigDecel);
  });
});

describe('calculateCrewSkillFactor', () => {
  it('returns 1.0 when no crew in scanner/helm slots', () => {
    const ship = createTestShip();
    // Clear helm and scanner slots
    clearJobSlots(ship, 'helm');
    clearJobSlots(ship, 'scanner');

    expect(calculateCrewSkillFactor(ship)).toBe(1.0);
  });

  it('returns 1.0 when no bridge room exists', () => {
    const ship = createTestShip({
      rooms: [],
      jobSlots: [],
    });

    expect(calculateCrewSkillFactor(ship)).toBe(1.0);
  });

  it('reduces with astrogation skill 5', () => {
    const ship = createTestShip();
    // Default test ship has navigator (astrogation 5) on helm
    const factor = calculateCrewSkillFactor(ship);
    expect(factor).toBeCloseTo(1 / (1 + 5 * 0.08), 3);
    expect(factor).toBeCloseTo(0.714, 2);
  });

  it('reduces more with astrogation skill 10', () => {
    const crew = createTestCrew({
      skills: {
        piloting: 3,
        astrogation: 10,
        engineering: 2,
        strength: 2,
        charisma: 2,
        loyalty: 2,
      },
    });
    const ship = createTestShip();
    // Clear default crew assignment and assign new crew
    clearJobSlots(ship, 'helm');
    clearJobSlots(ship, 'scanner');
    ship.crew = [crew];
    assignCrewToJob(ship, crew.id, 'scanner');

    const factor = calculateCrewSkillFactor(ship);
    expect(factor).toBeCloseTo(1 / (1 + 10 * 0.08), 3);
    expect(factor).toBeCloseTo(0.556, 2);
  });

  it('uses best astrogation among scanner/helm crew', () => {
    const navigator = createTestCrew({
      skills: {
        piloting: 3,
        astrogation: 8,
        engineering: 2,
        strength: 2,
        charisma: 2,
        loyalty: 2,
      },
    });
    const pilot = createTestCrew({
      skills: {
        piloting: 7,
        astrogation: 3,
        engineering: 2,
        strength: 2,
        charisma: 2,
        loyalty: 2,
      },
    });
    const ship = createTestShip();
    clearJobSlots(ship, 'helm');
    clearJobSlots(ship, 'scanner');
    ship.crew = [navigator, pilot];
    assignCrewToJob(ship, navigator.id, 'scanner');
    assignCrewToJob(ship, pilot.id, 'helm');

    const factor = calculateCrewSkillFactor(ship);
    // Should use skill 8 (the best)
    expect(factor).toBeCloseTo(1 / (1 + 8 * 0.08), 3);
  });

  it('astrogation 0 gives no reduction', () => {
    const crew = createTestCrew({
      skills: {
        piloting: 5,
        astrogation: 0,
        engineering: 3,
        strength: 3,
        charisma: 3,
        loyalty: 3,
      },
    });
    const ship = createTestShip();
    clearJobSlots(ship, 'helm');
    clearJobSlots(ship, 'scanner');
    ship.crew = [crew];
    assignCrewToJob(ship, crew.id, 'helm');

    expect(calculateCrewSkillFactor(ship)).toBe(1.0);
  });
});

describe('isOnCooldown', () => {
  it('returns false when no previous encounter', () => {
    const ship = createTestShip();
    expect(isOnCooldown(ship, 1_000_000)).toBe(false);
  });

  it('returns true when within cooldown window', () => {
    const ship = createTestShip();
    ship.lastEncounterTime = 1_000_000;

    // Just after the encounter
    expect(isOnCooldown(ship, 1_000_001)).toBe(true);

    // Still within cooldown (500 ticks * 180 seconds = 90,000 seconds)
    expect(isOnCooldown(ship, 1_050_000)).toBe(true);
  });

  it('returns false when cooldown has expired', () => {
    const ship = createTestShip();
    ship.lastEncounterTime = 1_000_000;

    // Well past cooldown (90,000 seconds later)
    expect(isOnCooldown(ship, 1_100_000)).toBe(false);
  });

  it('returns false at exactly the cooldown boundary', () => {
    const ship = createTestShip();
    ship.lastEncounterTime = 0;

    // Exactly at cooldown duration
    expect(isOnCooldown(ship, ENCOUNTER_CONSTANTS.COOLDOWN_SECONDS)).toBe(
      false
    );
  });
});

describe('getShipPositionKm', () => {
  const world = createTestWorld();

  it('returns 0 for docked ships', () => {
    const ship = createTestShip({
      location: { status: 'docked', dockedAt: 'earth' },
    });
    expect(getShipPositionKm(ship, world)).toBe(0);
  });

  it('returns origin distance at start of flight', () => {
    const ship = createTestShip({
      location: {
        status: 'in_flight',
      },
      activeFlightPlan: createTestFlight({
        origin: 'earth',
        destination: 'mars',
        distanceCovered: 0,
        totalDistance: 54_600_000_000,
      }),
    });
    const posKm = getShipPositionKm(ship, world);
    expect(posKm).toBeCloseTo(0, 0); // Earth is at 0 km
  });

  it('returns destination distance at end of flight', () => {
    const ship = createTestShip({
      location: {
        status: 'in_flight',
      },
      activeFlightPlan: createTestFlight({
        origin: 'earth',
        destination: 'mars',
        distanceCovered: 54_600_000_000,
        totalDistance: 54_600_000_000,
      }),
    });
    const posKm = getShipPositionKm(ship, world);
    expect(posKm).toBeCloseTo(54_600_000, 0); // Mars is at 54.6M km
  });

  it('returns midpoint at halfway through flight', () => {
    const ship = createTestShip({
      location: {
        status: 'in_flight',
      },
      activeFlightPlan: createTestFlight({
        origin: 'earth',
        destination: 'mars',
        distanceCovered: 27_300_000_000,
        totalDistance: 54_600_000_000,
      }),
    });
    const posKm = getShipPositionKm(ship, world);
    expect(posKm).toBeCloseTo(27_300_000, 0);
  });

  it('handles reverse routes (Mars to Earth)', () => {
    const ship = createTestShip({
      location: {
        status: 'in_flight',
      },
      activeFlightPlan: createTestFlight({
        origin: 'mars',
        destination: 'earth',
        distanceCovered: 27_300_000_000,
        totalDistance: 54_600_000_000,
      }),
    });
    const posKm = getShipPositionKm(ship, world);
    // Midpoint of Mars(54.6M) → Earth(0): 54.6M + (0 - 54.6M) * 0.5 = 27.3M
    expect(posKm).toBeCloseTo(27_300_000, 0);
  });
});

describe('calculateEncounterChance', () => {
  it('returns 0 for docked ships', () => {
    const gameData = createTestGameData();
    const ship = gameData.ships[0];
    ship.location = { status: 'docked', dockedAt: 'earth' };

    expect(calculateEncounterChance(ship, gameData)).toBe(0);
  });

  it('returns 0 when on cooldown', () => {
    const gameData = createTestGameData();
    const ship = gameData.ships[0];
    ship.lastEncounterTime = gameData.gameTime - 1000; // very recent

    expect(calculateEncounterChance(ship, gameData)).toBe(0);
  });

  it('returns positive value for in-flight ship off cooldown', () => {
    const gameData = createTestGameData();
    const ship = gameData.ships[0];
    // Ensure in flight with valid flight state
    ship.location = {
      status: 'in_flight',
    };
    ship.activeFlightPlan = createTestFlight();
    ship.lastEncounterTime = undefined;

    const chance = calculateEncounterChance(ship, gameData);
    expect(chance).toBeGreaterThan(0);
  });

  it('higher near lawless zones than near Earth', () => {
    const gameData = createTestGameData();
    const ship = gameData.ships[0];
    ship.lastEncounterTime = undefined;

    // Near Earth
    ship.location = {
      status: 'in_flight',
    };
    ship.activeFlightPlan = createTestFlight({
      origin: 'earth',
      destination: 'leo_station',
      distanceCovered: 0,
      totalDistance: 400_000,
    });
    const chanceNearEarth = calculateEncounterChance(ship, gameData);

    // Near The Scatter
    ship.location = {
      status: 'in_flight',
    };
    ship.activeFlightPlan = createTestFlight({
      origin: 'freeport_station',
      destination: 'the_scatter',
      distanceCovered: 650_000_000, // midpoint between freeport and scatter
      totalDistance: 1_300_000_000,
    });
    const chanceNearScatter = calculateEncounterChance(ship, gameData);

    expect(chanceNearScatter).toBeGreaterThan(chanceNearEarth);
  });

  it('higher for fusion engines than stealth engines', () => {
    const gameData = createTestGameData();
    const ship = gameData.ships[0];
    ship.lastEncounterTime = undefined;
    ship.location = {
      status: 'in_flight',
    };
    ship.activeFlightPlan = createTestFlight({ phase: 'accelerating' });

    // Stealth engine
    ship.engine.definitionId = 'ntr_stealth';
    const chanceStealth = calculateEncounterChance(ship, gameData);

    // Fusion engine
    ship.engine.definitionId = 'fdr_sunfire';
    const chanceFusion = calculateEncounterChance(ship, gameData);

    expect(chanceFusion).toBeGreaterThan(chanceStealth);
  });

  it('lower during coasting than burning', () => {
    const gameData = createTestGameData();
    const ship = gameData.ships[0];
    ship.lastEncounterTime = undefined;
    ship.engine.definitionId = 'fdr_sunfire';

    ship.location = {
      status: 'in_flight',
    };
    ship.activeFlightPlan = createTestFlight({ phase: 'accelerating' });
    const chanceBurning = calculateEncounterChance(ship, gameData);

    ship.location = {
      status: 'in_flight',
    };
    ship.activeFlightPlan = createTestFlight({ phase: 'coasting' });
    const chanceCoasting = calculateEncounterChance(ship, gameData);

    expect(chanceCoasting).toBeLessThan(chanceBurning);
  });

  it('lower with skilled navigator', () => {
    const gameData = createTestGameData();
    const ship = gameData.ships[0];
    ship.lastEncounterTime = undefined;
    ship.location = {
      status: 'in_flight',
    };
    ship.activeFlightPlan = createTestFlight();

    // Low skill navigator
    clearJobSlots(ship, 'helm');
    clearJobSlots(ship, 'scanner');
    const lowSkillCrew = createTestCrew({
      skills: {
        piloting: 3,
        astrogation: 1,
        engineering: 2,
        strength: 2,
        charisma: 2,
        loyalty: 2,
      },
    });
    ship.crew = [lowSkillCrew];
    assignCrewToJob(ship, lowSkillCrew.id, 'helm');
    const chanceLowSkill = calculateEncounterChance(ship, gameData);

    // High skill navigator
    clearJobSlots(ship, 'helm');
    const highSkillCrew = createTestCrew({
      skills: {
        piloting: 3,
        astrogation: 10,
        engineering: 2,
        strength: 2,
        charisma: 2,
        loyalty: 2,
      },
    });
    ship.crew = [highSkillCrew];
    assignCrewToJob(ship, highSkillCrew.id, 'helm');
    const chanceHighSkill = calculateEncounterChance(ship, gameData);

    expect(chanceHighSkill).toBeLessThan(chanceLowSkill);
  });
});

describe('getThreatLevel', () => {
  it('classifies < 5% as clear', () => {
    expect(getThreatLevel(0)).toBe('clear');
    expect(getThreatLevel(0.02)).toBe('clear');
    expect(getThreatLevel(0.049)).toBe('clear');
  });

  it('classifies 5-15% as caution', () => {
    expect(getThreatLevel(0.05)).toBe('caution');
    expect(getThreatLevel(0.1)).toBe('caution');
    expect(getThreatLevel(0.149)).toBe('caution');
  });

  it('classifies 15-30% as danger', () => {
    expect(getThreatLevel(0.15)).toBe('danger');
    expect(getThreatLevel(0.2)).toBe('danger');
    expect(getThreatLevel(0.299)).toBe('danger');
  });

  it('classifies > 30% as critical', () => {
    expect(getThreatLevel(0.3)).toBe('critical');
    expect(getThreatLevel(0.5)).toBe('critical');
    expect(getThreatLevel(1.0)).toBe('critical');
  });
});

describe('getThreatNarrative', () => {
  it('returns narrative for each level', () => {
    expect(getThreatNarrative('clear')).toBe('Patrolled space');
    expect(getThreatNarrative('caution')).toBe('Contested territory');
    expect(getThreatNarrative('danger')).toBe('Lawless region');
    expect(getThreatNarrative('critical')).toBe('Pirate hunting grounds');
  });
});
