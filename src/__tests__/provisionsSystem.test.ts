import { describe, it, expect, beforeEach } from 'vitest';
import {
  PROVISIONS_KG_PER_CREW_PER_DAY,
  PROVISIONS_PRICE_PER_KG,
  getEffectiveConsumptionPerCrewPerDay,
  getEffectiveConsumptionPerCrewPerTick,
  getMaxProvisionsKg,
  getProvisionsPricePerKg,
  getProvisionsSurvivalTicks,
  getStarvationHealthDamage,
  getCrewHealthEfficiency,
  applyProvisionsTick,
  autoResupplyProvisions,
  STARVATION_DAYS,
} from '../provisionsSystem';
import { TICKS_PER_DAY } from '../timeSystem';
import type { Ship, GameData, WorldLocation } from '../models';
import {
  createTestShip,
  createTestGameData,
  createTestEquipment,
} from './testHelpers';

// ── Test Helpers ──────────────────────────────────────────────────

function createTradeLocation(
  overrides: Partial<WorldLocation> = {}
): WorldLocation {
  return {
    id: 'earth',
    name: 'Earth',
    type: 'planet',
    description: 'Home planet.',
    distanceFromEarth: 0,
    x: 10,
    y: 50,
    services: ['refuel', 'trade', 'repair', 'hire'],
    size: 5,
    pilotingRequirement: 0,
    ...overrides,
  };
}

function createMineLocation(
  overrides: Partial<WorldLocation> = {}
): WorldLocation {
  return {
    id: 'asteroid_belt',
    name: 'Graveyard Drift',
    type: 'asteroid_belt',
    description: 'Asteroid belt.',
    distanceFromEarth: 80_000,
    x: 30,
    y: 50,
    services: ['mine'],
    size: 1,
    pilotingRequirement: 10,
    ...overrides,
  };
}

// ── getEffectiveConsumptionPerCrewPerDay ──────────────────────────

describe('getEffectiveConsumptionPerCrewPerDay', () => {
  it('returns base rate with no recycling equipment', () => {
    const ship = createTestShip({ equipment: [] });
    expect(getEffectiveConsumptionPerCrewPerDay(ship)).toBe(
      PROVISIONS_KG_PER_CREW_PER_DAY
    );
  });

  it('reduces consumption with powered life support', () => {
    const ship = createTestShip();
    expect(getEffectiveConsumptionPerCrewPerDay(ship)).toBe(5);
  });

  it('ignores unpowered recycling equipment', () => {
    const ship = createTestShip({
      equipment: [
        createTestEquipment({ definitionId: 'life_support', powered: false }),
      ],
    });
    expect(getEffectiveConsumptionPerCrewPerDay(ship)).toBe(
      PROVISIONS_KG_PER_CREW_PER_DAY
    );
  });

  it('applies equipment degradation to recycling', () => {
    // degradation=100, divisor=200 → effectiveness=0.5 → recycling=5 → net=10
    const ship = createTestShip({
      equipment: [
        createTestEquipment({
          definitionId: 'life_support',
          degradation: 100,
        }),
      ],
    });
    expect(getEffectiveConsumptionPerCrewPerDay(ship)).toBe(10);
  });
});

// ── getProvisionsPricePerKg ──────────────────────────────────────

describe('getProvisionsPricePerKg', () => {
  it('applies distance-based price tiers', () => {
    expect(getProvisionsPricePerKg({ distanceFromEarth: 0 })).toBe(
      PROVISIONS_PRICE_PER_KG
    );
    expect(getProvisionsPricePerKg({ distanceFromEarth: 500_000 })).toBe(
      PROVISIONS_PRICE_PER_KG * 1.5
    );
    expect(getProvisionsPricePerKg({ distanceFromEarth: 2_000_000 })).toBe(
      PROVISIONS_PRICE_PER_KG * 2.5
    );
  });
});

// ── getProvisionsSurvivalTicks ───────────────────────────────────

describe('getProvisionsSurvivalTicks', () => {
  it('returns Infinity for empty crew', () => {
    const ship = createTestShip({ crew: [] });
    expect(getProvisionsSurvivalTicks(ship)).toBe(Infinity);
  });

  it('calculates ticks from provisions and consumption', () => {
    // 2 crew × 5 kg/day effective ÷ 480 ticks/day = 0.02083 kg/tick
    // 300 kg / 0.02083 = 14400 ticks = 30 days
    const ship = createTestShip();
    expect(getProvisionsSurvivalTicks(ship)).toBe(14400);
  });
});

// ── getStarvationHealthDamage ────────────────────────────────────

describe('getStarvationHealthDamage', () => {
  it('returns 0 when provisions remain, damage when depleted', () => {
    expect(getStarvationHealthDamage(1)).toBe(0);
    expect(getStarvationHealthDamage(0)).toBeCloseTo(
      100 / (STARVATION_DAYS * TICKS_PER_DAY)
    );
  });
});

// ── getCrewHealthEfficiency ──────────────────────────────────────

describe('getCrewHealthEfficiency', () => {
  it('follows sqrt curve and clamps at boundaries', () => {
    expect(getCrewHealthEfficiency(100)).toBe(1.0);
    expect(getCrewHealthEfficiency(25)).toBe(0.5);
    expect(getCrewHealthEfficiency(0)).toBe(0);
    expect(getCrewHealthEfficiency(150)).toBe(1.0); // clamp above
    expect(getCrewHealthEfficiency(-10)).toBe(0); // clamp below
  });
});

// ── applyProvisionsTick ──────────────────────────────────────────

describe('applyProvisionsTick', () => {
  let gameData: GameData;
  let ship: Ship;

  beforeEach(() => {
    gameData = createTestGameData();
    ship = gameData.ships[0];
    ship.location.status = 'in_flight';
  });

  it('consumes provisions in flight', () => {
    const before = ship.provisionsKg;
    applyProvisionsTick(ship, gameData);
    expect(ship.provisionsKg).toBeLessThan(before);
  });

  it('skips consumption when docked at trade station', () => {
    const tradeLoc = createTradeLocation();
    gameData.world.locations.push(tradeLoc);
    ship.location.status = 'docked';
    ship.location.dockedAt = tradeLoc.id;
    ship.provisionsKg = getMaxProvisionsKg(ship);
    const before = ship.provisionsKg;

    applyProvisionsTick(ship, gameData);
    expect(ship.provisionsKg).toBe(before);
  });

  it('still consumes at mine-only stations', () => {
    const mineLoc = createMineLocation();
    gameData.world.locations.push(mineLoc);
    ship.location.status = 'docked';
    ship.location.dockedAt = mineLoc.id;
    const before = ship.provisionsKg;

    applyProvisionsTick(ship, gameData);
    expect(ship.provisionsKg).toBeLessThan(before);
  });

  it('applies starvation damage at zero provisions', () => {
    ship.provisionsKg = 0;
    const before = ship.crew[0].health;
    applyProvisionsTick(ship, gameData);
    expect(ship.crew[0].health).toBeLessThan(before);
  });

  it('logs critical warning when provisions deplete', () => {
    const perTick =
      ship.crew.length * getEffectiveConsumptionPerCrewPerTick(ship);
    ship.provisionsKg = perTick * 0.5;

    applyProvisionsTick(ship, gameData);

    expect(
      gameData.log.some(
        (e) => e.type === 'provisions_warning' && e.message.includes('run out')
      )
    ).toBe(true);
  });
});

// ── autoResupplyProvisions ───────────────────────────────────────

describe('autoResupplyProvisions', () => {
  let gameData: GameData;
  let ship: Ship;

  beforeEach(() => {
    gameData = createTestGameData();
    ship = gameData.ships[0];
    ship.location.status = 'docked';
  });

  it('buys full provisions when affordable', () => {
    const tradeLoc = createTradeLocation();
    gameData.world.locations.push(tradeLoc);
    ship.provisionsKg = 0;
    gameData.credits = 100_000;

    expect(autoResupplyProvisions(gameData, ship, tradeLoc.id)).toBe(true);
    expect(ship.provisionsKg).toBe(getMaxProvisionsKg(ship));
  });

  it('buys partial provisions when credits are short', () => {
    const tradeLoc = createTradeLocation();
    gameData.world.locations.push(tradeLoc);
    ship.provisionsKg = 0;
    gameData.credits = 10;

    expect(autoResupplyProvisions(gameData, ship, tradeLoc.id)).toBe(true);
    expect(ship.provisionsKg).toBeGreaterThan(0);
    expect(ship.provisionsKg).toBeLessThan(getMaxProvisionsKg(ship));
  });

  it('returns false for non-trade locations or zero credits', () => {
    const mineLoc = createMineLocation();
    gameData.world.locations.push(mineLoc);
    ship.provisionsKg = 0;

    expect(autoResupplyProvisions(gameData, ship, mineLoc.id)).toBe(false);

    const tradeLoc = createTradeLocation();
    gameData.world.locations.push(tradeLoc);
    gameData.credits = 0;
    expect(autoResupplyProvisions(gameData, ship, tradeLoc.id)).toBe(false);
  });
});
