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
  canNegotiate,
  getCommandRallyBonus,
  RALLY_DEFENSE_BONUS,
  getFleetAuraBonus,
  areLocationsAdjacent,
  getCommandTrainingMultiplier,
  CAPTAIN_TRAINING_MULTIPLIER,
  FLEET_AURA_SAME_LOCATION,
  FLEET_AURA_ADJACENT,
  getShipLocationId,
  getCaptainLocationId,
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
    // Phase 3-5 fields
    expect(bd.canNegotiate).toBe(true);
    expect(bd.rallyBonus).toBe(RALLY_DEFENSE_BONUS);
    expect(bd.trainingMultiplier).toBe(CAPTAIN_TRAINING_MULTIPLIER);
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
    // Phase 3-5 fields for acting captain
    expect(bd.canNegotiate).toBe(false);
    expect(bd.rallyBonus).toBe(0);
    expect(bd.trainingMultiplier).toBe(1.0);
  });

  it('returns zero breakdown for empty crew', () => {
    const ship = createTestShip({ crew: [] });
    const bd = getCommandBonusBreakdown(ship);

    expect(bd.hasCaptain).toBe(false);
    expect(bd.commerceBonus).toBe(0);
    expect(bd.pilotingBonus).toBe(0);
    expect(bd.miningBonus).toBe(0);
    expect(bd.canNegotiate).toBe(false);
    expect(bd.rallyBonus).toBe(0);
    expect(bd.trainingMultiplier).toBe(1.0);
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

// ═══════════════════════════════════════════════════════════════════
// Phase 3: Captain-Only Encounter Outcomes
// ═══════════════════════════════════════════════════════════════════

describe('canNegotiate', () => {
  it('returns true when captain is aboard', () => {
    const ship = createTestShip();
    expect(canNegotiate(ship)).toBe(true);
  });

  it('returns false when no captain', () => {
    const ship = createTestShip({
      crew: [
        createTestCrew({
          isCaptain: false,
          skills: { piloting: 80, mining: 0, commerce: 60 },
        }),
      ],
    });
    expect(canNegotiate(ship)).toBe(false);
  });

  it('returns false when crew is empty', () => {
    const ship = createTestShip({ crew: [] });
    expect(canNegotiate(ship)).toBe(false);
  });
});

describe('getCommandRallyBonus', () => {
  it('returns RALLY_DEFENSE_BONUS when captain aboard', () => {
    const ship = createTestShip();
    expect(getCommandRallyBonus(ship)).toBe(RALLY_DEFENSE_BONUS);
  });

  it('returns 0 when no captain', () => {
    const ship = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
    });
    expect(getCommandRallyBonus(ship)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 4: Fleet Coordination Aura
// ═══════════════════════════════════════════════════════════════════

describe('getShipLocationId', () => {
  it('returns docked location', () => {
    const ship = createTestShip({
      location: { status: 'docked', dockedAt: 'earth' },
    });
    expect(getShipLocationId(ship)).toBe('earth');
  });

  it('returns orbiting location', () => {
    const ship = createTestShip({
      location: { status: 'orbiting', orbitingAt: 'nea_2247' },
    });
    expect(getShipLocationId(ship)).toBe('nea_2247');
  });

  it('returns null for in-flight ships', () => {
    const ship = createTestShip({
      location: { status: 'in_flight' },
    });
    expect(getShipLocationId(ship)).toBeNull();
  });
});

describe('getCaptainLocationId', () => {
  it('returns captain ship location', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'mars' },
    });
    const gd = createTestGameData({ ships: [captainShip] });
    expect(getCaptainLocationId(gd)).toBe('mars');
  });

  it('returns null when captain is in flight', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'in_flight' },
    });
    const gd = createTestGameData({ ships: [captainShip] });
    expect(getCaptainLocationId(gd)).toBeNull();
  });
});

describe('areLocationsAdjacent', () => {
  it('earth and debris_field_alpha are adjacent', () => {
    const gd = createTestGameData();
    expect(areLocationsAdjacent('earth', 'debris_field_alpha', gd.world)).toBe(
      true
    );
  });

  it('debris_field_alpha and leo_station are adjacent', () => {
    const gd = createTestGameData();
    expect(
      areLocationsAdjacent('debris_field_alpha', 'leo_station', gd.world)
    ).toBe(true);
  });

  it('earth and leo_station are NOT adjacent (debris between them)', () => {
    const gd = createTestGameData();
    expect(areLocationsAdjacent('earth', 'leo_station', gd.world)).toBe(false);
  });

  it('earth and mars are NOT adjacent', () => {
    const gd = createTestGameData();
    expect(areLocationsAdjacent('earth', 'mars', gd.world)).toBe(false);
  });

  it('returns false for unknown location id', () => {
    const gd = createTestGameData();
    expect(areLocationsAdjacent('earth', 'unknown', gd.world)).toBe(false);
  });
});

describe('getFleetAuraBonus', () => {
  it('returns 0 for captain own ship (gets direct bonuses)', () => {
    const captain = createTestCrew({ isCaptain: true });
    const ship = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const gd = createTestGameData({ ships: [ship] });
    expect(getFleetAuraBonus(ship, gd)).toBe(0);
  });

  it('returns FLEET_AURA_SAME_LOCATION for ships at same location', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const otherShip = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const gd = createTestGameData({ ships: [captainShip, otherShip] });
    expect(getFleetAuraBonus(otherShip, gd)).toBe(FLEET_AURA_SAME_LOCATION);
  });

  it('returns FLEET_AURA_ADJACENT for ships one hop away', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    // debris_field_alpha is adjacent to earth
    const otherShip = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
      location: { status: 'docked', dockedAt: 'debris_field_alpha' },
    });
    const gd = createTestGameData({ ships: [captainShip, otherShip] });
    expect(getFleetAuraBonus(otherShip, gd)).toBe(FLEET_AURA_ADJACENT);
  });

  it('returns 0 for ships far from captain', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const otherShip = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
      location: { status: 'docked', dockedAt: 'mars' },
    });
    const gd = createTestGameData({ ships: [captainShip, otherShip] });
    expect(getFleetAuraBonus(otherShip, gd)).toBe(0);
  });

  it('returns 0 when ship is in flight', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const otherShip = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
      location: { status: 'in_flight' },
    });
    const gd = createTestGameData({ ships: [captainShip, otherShip] });
    expect(getFleetAuraBonus(otherShip, gd)).toBe(0);
  });

  it('returns 0 when captain is in flight', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'in_flight' },
    });
    const otherShip = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const gd = createTestGameData({ ships: [captainShip, otherShip] });
    expect(getFleetAuraBonus(otherShip, gd)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 5: Training Speed Aura
// ═══════════════════════════════════════════════════════════════════

describe('getCommandTrainingMultiplier', () => {
  it('returns CAPTAIN_TRAINING_MULTIPLIER for captain ship', () => {
    const captain = createTestCrew({ isCaptain: true });
    const ship = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const gd = createTestGameData({ ships: [ship] });
    expect(getCommandTrainingMultiplier(ship, gd)).toBe(
      CAPTAIN_TRAINING_MULTIPLIER
    );
  });

  it('returns 1.0 + aura for ships near captain', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const otherShip = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const gd = createTestGameData({ ships: [captainShip, otherShip] });
    expect(getCommandTrainingMultiplier(otherShip, gd)).toBe(
      1.0 + FLEET_AURA_SAME_LOCATION
    );
  });

  it('returns 1.0 for ships far from captain', () => {
    const captain = createTestCrew({ isCaptain: true });
    const captainShip = createTestShip({
      crew: [captain],
      location: { status: 'docked', dockedAt: 'earth' },
    });
    const otherShip = createTestShip({
      crew: [createTestCrew({ isCaptain: false })],
      location: { status: 'docked', dockedAt: 'mars' },
    });
    const gd = createTestGameData({ ships: [captainShip, otherShip] });
    expect(getCommandTrainingMultiplier(otherShip, gd)).toBe(1.0);
  });
});
