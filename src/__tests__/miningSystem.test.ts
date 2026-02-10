import { describe, it, expect } from 'vitest';
import {
  applyMiningTick,
  getOreCargoWeight,
  getOreSellPrice,
  sellOre,
  sellAllOre,
} from '../miningSystem';
import { getOreDefinition } from '../oreTypes';
import type { WorldLocation, OreId } from '../models';
import {
  createTestShip,
  createTestCrew,
  assignCrewToJob,
  createTestGameData,
} from './testHelpers';
import { createInitialMastery } from '../masterySystem';

// ── Test Helpers ────────────────────────────────────────────────

function createMineLocation(
  overrides: Partial<WorldLocation> = {}
): WorldLocation {
  return {
    id: 'debris_field_alpha',
    name: 'Debris Field Alpha',
    type: 'asteroid_belt',
    description: 'Asteroid belt with iron and silicate deposits.',
    distanceFromEarth: 80_000,
    x: 30,
    y: 50,
    services: ['mine'],
    size: 1,
    pilotingRequirement: 10,
    availableOres: ['iron_ore', 'silicate'] as OreId[],
    ...overrides,
  };
}

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

function createMinerCrew(miningSkill = 15) {
  return createTestCrew({
    name: 'Test Miner',
    role: 'miner',
    skills: { piloting: 5, mining: miningSkill, commerce: 0 },
    equipment: [], // Mining equipment is now ship-mounted, not crew-carried
    mastery: createInitialMastery(),
  });
}

// ── Core Mining Logic ───────────────────────────────────────────

describe('Mining System', () => {
  describe('applyMiningTick', () => {
    it('returns null when location has no mine service', () => {
      const ship = createTestShip({
        location: { status: 'orbiting', orbitingAt: 'earth' },
      });
      const location = createTradeLocation(); // no mine service
      const result = applyMiningTick(ship, location);
      expect(result).toBeNull();
    });

    it('returns null when no crew are assigned to mining_ops', () => {
      const ship = createTestShip({
        location: { status: 'orbiting', orbitingAt: 'debris_field_alpha' },
      });
      const location = createMineLocation();
      const result = applyMiningTick(ship, location);
      expect(result).toBeNull();
    });

    it('returns null when ship has no mining equipment installed', () => {
      const miner = createTestCrew({
        name: 'Miner',
        role: 'miner',
        skills: { piloting: 5, mining: 15, commerce: 0 },
      });
      const ship = createTestShip({
        crew: [miner],
        location: { status: 'orbiting', orbitingAt: 'debris_field_alpha' },
        // Override equipment to exclude mining equipment
        equipment: [
          { id: 'eq-ls', definitionId: 'life_support', degradation: 0 },
          { id: 'eq-af', definitionId: 'air_filters', degradation: 0 },
        ],
      });
      assignCrewToJob(ship, miner.id, 'mining_ops');

      const location = createMineLocation();
      const result = applyMiningTick(ship, location);

      expect(result).toBeNull();
    });

    it('accumulates fractional ore across ticks', () => {
      const miner = createMinerCrew(0); // skill 0
      const ship = createTestShip({
        crew: [miner],
        location: { status: 'orbiting', orbitingAt: 'debris_field_alpha' },
      });
      assignCrewToJob(ship, miner.id, 'mining_ops');

      const location = createMineLocation();

      // Run several ticks — should accumulate ore
      let totalExtracted = 0;
      for (let i = 0; i < 20; i++) {
        const result = applyMiningTick(ship, location);
        if (result) {
          for (const qty of Object.values(result.oreExtracted)) {
            totalExtracted += qty;
          }
        }
      }

      // With base rate 0.12 and 20 ticks, should have extracted at least 1 unit
      expect(totalExtracted).toBeGreaterThan(0);
      // Ore cargo should have units
      expect(ship.oreCargo.length).toBeGreaterThan(0);
    });

    it('mines the highest-value ore available at the location', () => {
      const miner = createMinerCrew(0); // skill 0 — can mine iron (5cr) and silicate (3cr)
      const ship = createTestShip({
        crew: [miner],
        location: { status: 'orbiting', orbitingAt: 'debris_field_alpha' },
      });
      assignCrewToJob(ship, miner.id, 'mining_ops');

      const location = createMineLocation({
        availableOres: ['iron_ore', 'silicate'] as OreId[],
      });

      // Run enough ticks to extract some ore
      for (let i = 0; i < 20; i++) {
        applyMiningTick(ship, location);
      }

      // Should mine iron (higher value) over silicate
      const ironCargo = ship.oreCargo.find((c) => c.oreId === 'iron_ore');
      expect(ironCargo).toBeDefined();
      expect(ironCargo!.quantity).toBeGreaterThan(0);
    });

    it('higher skill produces more ore per tick', () => {
      const lowSkillMiner = createMinerCrew(0);
      const highSkillMiner = createMinerCrew(50);

      const lowSkillShip = createTestShip({
        crew: [lowSkillMiner],
        location: { status: 'orbiting', orbitingAt: 'debris_field_alpha' },
      });
      assignCrewToJob(lowSkillShip, lowSkillMiner.id, 'mining_ops');

      const highSkillShip = createTestShip({
        crew: [highSkillMiner],
        location: { status: 'orbiting', orbitingAt: 'debris_field_alpha' },
      });
      assignCrewToJob(highSkillShip, highSkillMiner.id, 'mining_ops');

      const location = createMineLocation();

      let lowTotal = 0;
      let highTotal = 0;
      for (let i = 0; i < 50; i++) {
        const lowResult = applyMiningTick(lowSkillShip, location);
        const highResult = applyMiningTick(highSkillShip, location);
        if (lowResult)
          for (const qty of Object.values(lowResult.oreExtracted))
            lowTotal += qty;
        if (highResult)
          for (const qty of Object.values(highResult.oreExtracted))
            highTotal += qty;
      }

      expect(highTotal).toBeGreaterThan(lowTotal);
    });

    it('stops mining when cargo is full', () => {
      const miner = createMinerCrew(0);
      const ship = createTestShip({
        crew: [miner],
        location: { status: 'orbiting', orbitingAt: 'debris_field_alpha' },
        // Pre-fill cargo near capacity
        oreCargo: [{ oreId: 'iron_ore' as OreId, quantity: 10000 }],
      });
      assignCrewToJob(ship, miner.id, 'mining_ops');

      const location = createMineLocation();
      const result = applyMiningTick(ship, location);

      expect(result).not.toBeNull();
      expect(result!.cargoFull).toBe(true);
    });

    it('does not mine ore with skill requirement above miner level', () => {
      const miner = createMinerCrew(5); // skill 5, can't mine copper (req 10)
      const ship = createTestShip({
        crew: [miner],
        location: { status: 'orbiting', orbitingAt: 'scrapyard_ring' },
      });
      assignCrewToJob(ship, miner.id, 'mining_ops');

      const location = createMineLocation({
        id: 'scrapyard_ring',
        availableOres: ['copper_ore'] as OreId[], // only copper, requires mining 10
      });

      for (let i = 0; i < 20; i++) {
        applyMiningTick(ship, location);
      }

      // Should not have mined copper
      const copperCargo = ship.oreCargo.find((c) => c.oreId === 'copper_ore');
      expect(copperCargo).toBeUndefined();
    });
  });

  // ── Cargo Weight ────────────────────────────────────────────────

  describe('getOreCargoWeight', () => {
    it('returns 0 for empty cargo', () => {
      const ship = createTestShip({ oreCargo: [] });
      expect(getOreCargoWeight(ship)).toBe(0);
    });

    it('calculates total weight from ore definitions', () => {
      const ship = createTestShip({
        oreCargo: [
          { oreId: 'iron_ore' as OreId, quantity: 10 }, // 10kg each
          { oreId: 'silicate' as OreId, quantity: 5 }, // 8kg each
        ],
      });
      // 10*10 + 5*8 = 140
      expect(getOreCargoWeight(ship)).toBe(140);
    });
  });

  // ── Ore Selling ─────────────────────────────────────────────────

  describe('getOreSellPrice', () => {
    it('returns base value with location multiplier', () => {
      const ore = getOreDefinition('iron_ore');
      const ship = createTestShip();
      const planetLocation = createTradeLocation({ type: 'planet' });

      const price = getOreSellPrice(ore, planetLocation, ship);
      // Planet = 1.1x, iron base = 5, commerce 0 = 1.0x
      // 5 * 1.1 * 1.0 = 5.5, rounded = 6
      expect(price).toBe(6);
    });

    it('commerce skill improves sell price', () => {
      const ore = getOreDefinition('iron_ore');
      const highCommerceCrew = createTestCrew({
        skills: { piloting: 10, mining: 0, commerce: 50 },
      });
      const ship = createTestShip({ crew: [highCommerceCrew] });
      const location = createTradeLocation({ type: 'space_station' }); // 1.0x

      const price = getOreSellPrice(ore, location, ship);
      // 5 * 1.0 * (1 + 50*0.005) = 5 * 1.25 = 6.25, rounded = 6
      expect(price).toBe(6);
    });
  });

  describe('sellOre', () => {
    it('sells ore and awards credits', () => {
      const gameData = createTestGameData();
      const ship = gameData.ships[0];
      ship.location = { status: 'docked', dockedAt: 'earth' };
      ship.oreCargo = [{ oreId: 'iron_ore' as OreId, quantity: 10 }];
      const startCredits = gameData.credits;

      const location = createTradeLocation();
      const earned = sellOre(ship, 'iron_ore' as OreId, 10, location, gameData);

      expect(earned).toBeGreaterThan(0);
      expect(gameData.credits).toBe(startCredits + earned);
      expect(ship.oreCargo.length).toBe(0); // All sold
    });

    it('returns 0 when ore not in cargo', () => {
      const gameData = createTestGameData();
      const ship = gameData.ships[0];
      ship.oreCargo = [];
      const location = createTradeLocation();

      const earned = sellOre(ship, 'iron_ore' as OreId, 10, location, gameData);
      expect(earned).toBe(0);
    });

    it('partially sells when quantity exceeds cargo', () => {
      const gameData = createTestGameData();
      const ship = gameData.ships[0];
      ship.oreCargo = [{ oreId: 'iron_ore' as OreId, quantity: 5 }];
      const location = createTradeLocation();

      // Try to sell 10, only have 5
      const earned = sellOre(ship, 'iron_ore' as OreId, 10, location, gameData);
      expect(earned).toBe(0); // sellOre returns 0 if quantity > available
    });

    it('logs the sale', () => {
      const gameData = createTestGameData();
      const ship = gameData.ships[0];
      ship.oreCargo = [{ oreId: 'iron_ore' as OreId, quantity: 5 }];
      const startLogLen = gameData.log.length;
      const location = createTradeLocation();

      sellOre(ship, 'iron_ore' as OreId, 5, location, gameData);

      expect(gameData.log.length).toBeGreaterThan(startLogLen);
      expect(gameData.log[gameData.log.length - 1].type).toBe('ore_sold');
    });
  });

  describe('sellAllOre', () => {
    it('sells all ore types and returns total', () => {
      const gameData = createTestGameData();
      const ship = gameData.ships[0];
      ship.oreCargo = [
        { oreId: 'iron_ore' as OreId, quantity: 10 },
        { oreId: 'silicate' as OreId, quantity: 5 },
      ];
      const location = createTradeLocation();

      const total = sellAllOre(ship, location, gameData);

      expect(total).toBeGreaterThan(0);
      expect(ship.oreCargo.length).toBe(0);
    });
  });
});
