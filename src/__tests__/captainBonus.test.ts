import { describe, it, expect } from 'vitest';
import {
  getCaptainOnShip,
  getActingCaptain,
  getCommandCommerceBonus,
  getCommandPilotingBonus,
  getCommandMiningBonus,
  getCommandBonusBreakdown,
  getCommandBonusCreditAttribution,
  getHypotheticalCaptainBonus,
} from '../captainBonus';
import {
  createTestShip,
  createTestCrew,
  createTestGameData,
} from './testHelpers';

describe('getCaptainOnShip', () => {
  it('returns the captain when aboard', () => {
    const ship = createTestShip();
    const captain = getCaptainOnShip(ship);
    expect(captain).toBeDefined();
    expect(captain!.isCaptain).toBe(true);
  });

  it('returns undefined when no captain aboard', () => {
    const ship = createTestShip({
      crew: [
        createTestCrew({
          isCaptain: false,
          skills: { piloting: 0, mining: 0, commerce: 50 },
        }),
      ],
    });
    expect(getCaptainOnShip(ship)).toBeUndefined();
  });
});

describe('getActingCaptain', () => {
  it('returns highest commerce crew excluding captain', () => {
    const lowCommerce = createTestCrew({
      name: 'Low',
      skills: { piloting: 0, mining: 0, commerce: 10 },
    });
    const highCommerce = createTestCrew({
      name: 'High',
      skills: { piloting: 0, mining: 0, commerce: 60 },
    });
    const captain = createTestCrew({
      name: 'Captain',
      isCaptain: true,
      skills: { piloting: 0, mining: 0, commerce: 80 },
    });
    const ship = createTestShip({ crew: [captain, lowCommerce, highCommerce] });
    const acting = getActingCaptain(ship);
    expect(acting).toBeDefined();
    expect(acting!.name).toBe('High');
  });

  it('returns undefined when only captain aboard', () => {
    const captain = createTestCrew({ isCaptain: true });
    const ship = createTestShip({ crew: [captain] });
    expect(getActingCaptain(ship)).toBeUndefined();
  });

  it('returns undefined when no crew', () => {
    const ship = createTestShip({ crew: [] });
    expect(getActingCaptain(ship)).toBeUndefined();
  });
});

describe('getCommandCommerceBonus', () => {
  it('returns 0 for captain with skill 0', () => {
    const captain = createTestCrew({
      isCaptain: true,
      skills: { piloting: 0, mining: 0, commerce: 0 },
    });
    const ship = createTestShip({ crew: [captain] });
    expect(getCommandCommerceBonus(ship)).toBe(0);
  });

  it('returns 0.5 for captain with commerce 50', () => {
    const captain = createTestCrew({
      isCaptain: true,
      skills: { piloting: 0, mining: 0, commerce: 50 },
    });
    const ship = createTestShip({ crew: [captain] });
    expect(getCommandCommerceBonus(ship)).toBe(0.5);
  });

  it('returns 1.0 for captain with commerce 100', () => {
    const captain = createTestCrew({
      isCaptain: true,
      skills: { piloting: 0, mining: 0, commerce: 100 },
    });
    const ship = createTestShip({ crew: [captain] });
    expect(getCommandCommerceBonus(ship)).toBe(1.0);
  });

  it('returns 25% of acting captain bonus when no real captain', () => {
    const acting = createTestCrew({
      isCaptain: false,
      skills: { piloting: 0, mining: 0, commerce: 48 },
    });
    const ship = createTestShip({ crew: [acting] });
    // 48/100 * 0.25 = 0.12
    expect(getCommandCommerceBonus(ship)).toBe(0.12);
  });

  it('returns 0 for empty crew', () => {
    const ship = createTestShip({ crew: [] });
    expect(getCommandCommerceBonus(ship)).toBe(0);
  });
});

describe('getCommandPilotingBonus', () => {
  it('returns captain piloting / 200', () => {
    const captain = createTestCrew({
      isCaptain: true,
      skills: { piloting: 50, mining: 0, commerce: 0 },
    });
    const ship = createTestShip({ crew: [captain] });
    expect(getCommandPilotingBonus(ship)).toBe(0.25);
  });

  it('returns 0 for acting captain (no piloting bonus)', () => {
    const acting = createTestCrew({
      isCaptain: false,
      skills: { piloting: 80, mining: 0, commerce: 0 },
    });
    const ship = createTestShip({ crew: [acting] });
    expect(getCommandPilotingBonus(ship)).toBe(0);
  });
});

describe('getCommandMiningBonus', () => {
  it('returns captain mining / 100', () => {
    const captain = createTestCrew({
      isCaptain: true,
      skills: { piloting: 0, mining: 50, commerce: 0 },
    });
    const ship = createTestShip({ crew: [captain] });
    expect(getCommandMiningBonus(ship)).toBe(0.5);
  });

  it('returns 0 for acting captain (no mining bonus)', () => {
    const acting = createTestCrew({
      isCaptain: false,
      skills: { piloting: 0, mining: 80, commerce: 0 },
    });
    const ship = createTestShip({ crew: [acting] });
    expect(getCommandMiningBonus(ship)).toBe(0);
  });
});

describe('getCommandBonusBreakdown', () => {
  it('provides full breakdown when captain aboard', () => {
    const captain = createTestCrew({
      name: 'Nakamura',
      isCaptain: true,
      skills: { piloting: 47, mining: 12, commerce: 47 },
    });
    const acting = createTestCrew({
      name: 'Reyes',
      isCaptain: false,
      skills: { piloting: 0, mining: 0, commerce: 48 },
    });
    const ship = createTestShip({ crew: [captain, acting] });
    const bd = getCommandBonusBreakdown(ship);

    expect(bd.hasCaptain).toBe(true);
    expect(bd.captainName).toBe('Nakamura');
    expect(bd.commerceBonus).toBeCloseTo(0.47);
    expect(bd.pilotingBonus).toBeCloseTo(0.235);
    expect(bd.miningBonus).toBeCloseTo(0.12);
    expect(bd.actingCaptainName).toBe('Reyes');
    expect(bd.actingCommerceBonus).toBeCloseTo(0.12);
  });

  it('provides acting captain breakdown when no real captain', () => {
    const acting = createTestCrew({
      name: 'Reyes',
      isCaptain: false,
      skills: { piloting: 0, mining: 0, commerce: 48 },
    });
    const ship = createTestShip({ crew: [acting] });
    const bd = getCommandBonusBreakdown(ship);

    expect(bd.hasCaptain).toBe(false);
    expect(bd.captainName).toBe('');
    expect(bd.commerceBonus).toBeCloseTo(0.12);
    expect(bd.pilotingBonus).toBe(0);
    expect(bd.miningBonus).toBe(0);
    expect(bd.actingCaptainName).toBe('Reyes');
  });

  it('returns zero breakdown for empty crew', () => {
    const ship = createTestShip({ crew: [] });
    const bd = getCommandBonusBreakdown(ship);

    expect(bd.hasCaptain).toBe(false);
    expect(bd.commerceBonus).toBe(0);
    expect(bd.pilotingBonus).toBe(0);
    expect(bd.miningBonus).toBe(0);
  });
});

describe('getCommandBonusCreditAttribution', () => {
  it('returns 0 when no command bonus', () => {
    const ship = createTestShip({ crew: [] });
    expect(getCommandBonusCreditAttribution(1000, ship)).toBe(0);
  });

  it('computes captain bonus credits from total payment', () => {
    const captain = createTestCrew({
      isCaptain: true,
      skills: { piloting: 0, mining: 0, commerce: 50 },
    });
    const ship = createTestShip({ crew: [captain] });
    // commandBonus = 0.5
    // bonusCredits = 1500 - 1500 / 1.5 = 1500 - 1000 = 500
    expect(getCommandBonusCreditAttribution(1500, ship)).toBe(500);
  });

  it('returns smaller amount for acting captain', () => {
    const acting = createTestCrew({
      isCaptain: false,
      skills: { piloting: 0, mining: 0, commerce: 50 },
    });
    const ship = createTestShip({ crew: [acting] });
    // commandBonus = 0.5 * 0.25 = 0.125
    // bonusCredits = 1000 - 1000 / 1.125 = 1000 - 889 = 111
    expect(getCommandBonusCreditAttribution(1000, ship)).toBe(111);
  });
});

describe('getHypotheticalCaptainBonus', () => {
  it('returns 0 when captain is already on this ship', () => {
    const gd = createTestGameData();
    const ship = gd.ships[0];
    expect(getHypotheticalCaptainBonus(ship, gd)).toBe(0);
  });

  it('returns captain commerce bonus from other ship', () => {
    const captain = createTestCrew({
      isCaptain: true,
      skills: { piloting: 0, mining: 0, commerce: 60 },
    });
    const shipWithCaptain = createTestShip({ crew: [captain] });
    const shipWithoutCaptain = createTestShip({
      crew: [
        createTestCrew({
          isCaptain: false,
          skills: { piloting: 0, mining: 0, commerce: 20 },
        }),
      ],
    });
    const gd = createTestGameData({
      ships: [shipWithCaptain, shipWithoutCaptain],
    });
    // Captain commerce = 60, so hypothetical = 60/100 = 0.6
    expect(getHypotheticalCaptainBonus(shipWithoutCaptain, gd)).toBe(0.6);
  });
});
