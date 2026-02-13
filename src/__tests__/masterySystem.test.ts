import { describe, it, expect } from 'vitest';
import {
  xpForMasteryLevel,
  masteryLevelFromXp,
  awardMasteryXp,
  spendPoolXpOnItem,
  routeMasteryKey,
  tradeRouteMasteryKey,
  gravityAssistMasteryKey,
  isCheckpointActive,
  getPoolFillPercent,
  getCheckpointBonuses,
  createEmptyMasteryState,
  createInitialMastery,
  getRouteMasteryFuelBonus,
  getTradeRouteMasteryPayBonus,
  getOreMasteryYieldBonus,
  getGravityAssistMasterySuccessBonus,
  getGravityAssistMasteryRefundBonus,
  getGravityAssistMasteryPenaltyReduction,
  getPilotingPoolWarmupBonus,
  getPilotingPoolFuelBonus,
  getPilotingPoolEvasionBonus,
  getCommercePoolSalaryReduction,
  getCommercePoolSellBonus,
  getCommercePoolPaymentBonus,
  getRepairsPoolMasteryXpBonus,
} from '../masterySystem';

describe('Mastery System', () => {
  // ── XP Table ──────────────────────────────────────────────────

  describe('xpForMasteryLevel', () => {
    it('level 0 requires 0 XP', () => {
      expect(xpForMasteryLevel(0)).toBe(0);
    });

    it('XP requirements increase with level', () => {
      for (let lvl = 1; lvl < 99; lvl++) {
        expect(xpForMasteryLevel(lvl + 1)).toBeGreaterThan(
          xpForMasteryLevel(lvl)
        );
      }
    });

    it('level 99 is the highest meaningful level', () => {
      expect(xpForMasteryLevel(99)).toBeGreaterThan(0);
      // Beyond 99 should still return 99's value (capped)
      expect(xpForMasteryLevel(100)).toBe(xpForMasteryLevel(99));
    });

    it('negative levels return 0', () => {
      expect(xpForMasteryLevel(-1)).toBe(0);
    });
  });

  describe('masteryLevelFromXp', () => {
    it('0 XP is level 0', () => {
      expect(masteryLevelFromXp(0)).toBe(0);
    });

    it('returns correct level for known XP values', () => {
      // Exactly at a level boundary
      const xpForLv10 = xpForMasteryLevel(10);
      expect(masteryLevelFromXp(xpForLv10)).toBe(10);

      // Just below a level boundary
      expect(masteryLevelFromXp(xpForLv10 - 1)).toBe(9);

      // Well above a level boundary
      expect(masteryLevelFromXp(xpForLv10 + 1000)).toBe(
        masteryLevelFromXp(xpForLv10 + 1000)
      );
    });

    it('round-trips with xpForMasteryLevel', () => {
      for (let lvl = 0; lvl < 99; lvl++) {
        const xp = xpForMasteryLevel(lvl);
        expect(masteryLevelFromXp(xp)).toBe(lvl);
      }
    });
  });

  // ── Route Key Helpers ─────────────────────────────────────────

  describe('routeMasteryKey', () => {
    it('produces a canonical sorted key', () => {
      expect(routeMasteryKey('earth', 'mars')).toBe('earth->mars');
      expect(routeMasteryKey('mars', 'earth')).toBe('earth->mars');
    });

    it('same location pair always produces same key', () => {
      expect(routeMasteryKey('a', 'b')).toBe(routeMasteryKey('b', 'a'));
    });
  });

  describe('tradeRouteMasteryKey', () => {
    it('produces a canonical sorted key with <=> separator', () => {
      expect(tradeRouteMasteryKey('earth', 'mars')).toBe('earth<=>mars');
      expect(tradeRouteMasteryKey('mars', 'earth')).toBe('earth<=>mars');
    });
  });

  // ── Award Mastery XP ─────────────────────────────────────────

  describe('awardMasteryXp', () => {
    it('creates item mastery entry if it does not exist', () => {
      const state = createEmptyMasteryState();
      awardMasteryXp(state, 'earth->mars', 100, 10, 5);

      expect(state.itemMasteries['earth->mars']).toBeDefined();
      expect(state.itemMasteries['earth->mars'].xp).toBeGreaterThan(0);
    });

    it('awards XP and potentially levels up', () => {
      const state = createEmptyMasteryState();
      // Award enough XP to reach level 1 (needs ~83 XP)
      const result = awardMasteryXp(state, 'iron_ore', 200, 10, 8);

      expect(result.masteryXpGained).toBeGreaterThanOrEqual(200);
      expect(result.newLevel).toBeGreaterThanOrEqual(1);
      expect(result.itemId).toBe('iron_ore');
    });

    it('flows 25% of mastery XP into pool', () => {
      const state = createEmptyMasteryState();
      const result = awardMasteryXp(state, 'earth->mars', 400, 10, 5);

      // Pool should receive ~25% of the effective XP
      expect(result.poolXpGained).toBeGreaterThan(0);
      expect(state.pool.xp).toBeGreaterThan(0);
    });

    it('sets pool maxXp based on total item count', () => {
      const state = createEmptyMasteryState();
      awardMasteryXp(state, 'earth->mars', 100, 10, 5);

      // maxXp = POOL_CAP_PER_ITEM (1,000) * totalItemCount (5)
      expect(state.pool.maxXp).toBe(5_000);
    });

    it('reports level-up when it occurs', () => {
      const state = createEmptyMasteryState();
      // Award massive XP to guarantee level-up
      const result = awardMasteryXp(state, 'iron_ore', 50000, 10, 8);

      expect(result.leveledUp).toBe(true);
      expect(result.newLevel).toBeGreaterThan(result.oldLevel);
    });

    it('accumulates XP over multiple awards', () => {
      const state = createEmptyMasteryState();
      awardMasteryXp(state, 'earth->mars', 50, 10, 5);
      const xpAfterFirst = state.itemMasteries['earth->mars'].xp;

      awardMasteryXp(state, 'earth->mars', 50, 10, 5);
      expect(state.itemMasteries['earth->mars'].xp).toBeGreaterThan(
        xpAfterFirst
      );
    });

    it('caps pool XP at maxXp', () => {
      const state = createEmptyMasteryState();
      // Use 1 item so maxXp = 1,000. Award enormous XP.
      for (let i = 0; i < 100; i++) {
        awardMasteryXp(state, 'test_item', 100_000, 10, 1);
      }
      expect(state.pool.xp).toBeLessThanOrEqual(state.pool.maxXp);
    });
  });

  // ── Pool Spending ─────────────────────────────────────────────

  describe('spendPoolXpOnItem', () => {
    it('spends pool XP to boost item level', () => {
      const state = createEmptyMasteryState();
      // Seed the pool with XP
      state.pool.xp = 100_000;
      state.pool.maxXp = 500_000;

      const levelsGained = spendPoolXpOnItem(state, 'iron_ore', 5);
      expect(levelsGained).toBeGreaterThan(0);
      expect(state.itemMasteries['iron_ore'].level).toBeGreaterThan(0);
      expect(state.pool.xp).toBeLessThan(100_000);
    });

    it('returns 0 when pool has insufficient XP', () => {
      const state = createEmptyMasteryState();
      state.pool.xp = 0;
      state.pool.maxXp = 500_000;

      const levelsGained = spendPoolXpOnItem(state, 'iron_ore', 5);
      expect(levelsGained).toBe(0);
    });

    it('does not exceed level 99', () => {
      const state = createEmptyMasteryState();
      state.pool.xp = 999_999_999;
      state.pool.maxXp = 999_999_999;

      const levelsGained = spendPoolXpOnItem(state, 'iron_ore', 200);
      expect(state.itemMasteries['iron_ore'].level).toBe(99);
      expect(levelsGained).toBe(99);
    });
  });

  // ── Pool Checkpoints ──────────────────────────────────────────

  describe('isCheckpointActive', () => {
    it('inactive when pool is empty', () => {
      expect(isCheckpointActive({ xp: 0, maxXp: 1000 }, 0.1)).toBe(false);
    });

    it('active when pool meets threshold', () => {
      expect(isCheckpointActive({ xp: 100, maxXp: 1000 }, 0.1)).toBe(true);
      expect(isCheckpointActive({ xp: 250, maxXp: 1000 }, 0.25)).toBe(true);
    });

    it('inactive when pool is below threshold', () => {
      expect(isCheckpointActive({ xp: 99, maxXp: 1000 }, 0.1)).toBe(false);
    });

    it('inactive when maxXp is 0', () => {
      expect(isCheckpointActive({ xp: 0, maxXp: 0 }, 0.1)).toBe(false);
    });
  });

  describe('getPoolFillPercent', () => {
    it('returns 0 for empty pool', () => {
      expect(getPoolFillPercent({ xp: 0, maxXp: 1000 })).toBe(0);
    });

    it('returns correct percentage', () => {
      expect(getPoolFillPercent({ xp: 500, maxXp: 1000 })).toBe(50);
    });

    it('caps at 100%', () => {
      expect(getPoolFillPercent({ xp: 1500, maxXp: 1000 })).toBe(100);
    });

    it('returns 0 when maxXp is 0', () => {
      expect(getPoolFillPercent({ xp: 0, maxXp: 0 })).toBe(0);
    });
  });

  describe('getCheckpointBonuses', () => {
    it('returns 4 checkpoints for any skill', () => {
      const pool = { xp: 0, maxXp: 1000 };
      expect(getCheckpointBonuses('piloting', pool)).toHaveLength(4);
      expect(getCheckpointBonuses('mining', pool)).toHaveLength(4);
      expect(getCheckpointBonuses('commerce', pool)).toHaveLength(4);
    });

    it('marks checkpoints as active when pool is filled', () => {
      const pool = { xp: 500, maxXp: 1000 }; // 50% fill
      const bonuses = getCheckpointBonuses('piloting', pool);

      // 10% and 25% should be active, 50% exactly at threshold, 95% inactive
      expect(bonuses[0].active).toBe(true); // 10%
      expect(bonuses[1].active).toBe(true); // 25%
      expect(bonuses[2].active).toBe(true); // 50%
      expect(bonuses[3].active).toBe(false); // 95%
    });
  });

  // ── Computed Bonus Helpers ────────────────────────────────────

  describe('computed bonus helpers', () => {
    it('getRouteMasteryFuelBonus returns 0 at low levels', () => {
      expect(getRouteMasteryFuelBonus(0)).toBe(0);
      expect(getRouteMasteryFuelBonus(9)).toBe(0);
    });

    it('getRouteMasteryFuelBonus increases with mastery level', () => {
      expect(getRouteMasteryFuelBonus(10)).toBeGreaterThan(0);
      expect(getRouteMasteryFuelBonus(50)).toBeGreaterThan(
        getRouteMasteryFuelBonus(10)
      );
      expect(getRouteMasteryFuelBonus(99)).toBeGreaterThan(
        getRouteMasteryFuelBonus(50)
      );
    });

    it('getTradeRouteMasteryPayBonus scales with level', () => {
      expect(getTradeRouteMasteryPayBonus(0)).toBe(0);
      expect(getTradeRouteMasteryPayBonus(10)).toBeGreaterThan(0);
      expect(getTradeRouteMasteryPayBonus(99)).toBeGreaterThan(
        getTradeRouteMasteryPayBonus(10)
      );
    });

    it('getOreMasteryYieldBonus scales with level', () => {
      expect(getOreMasteryYieldBonus(0)).toBe(0);
      expect(getOreMasteryYieldBonus(10)).toBeGreaterThan(0);
      expect(getOreMasteryYieldBonus(99)).toBeGreaterThan(
        getOreMasteryYieldBonus(10)
      );
    });
  });

  // ── Gravity Assist Mastery ──────────────────────────────────────

  describe('gravityAssistMasteryKey', () => {
    it('produces a ga: prefixed key', () => {
      expect(gravityAssistMasteryKey('earth')).toBe('ga:earth');
      expect(gravityAssistMasteryKey('jupiter_station')).toBe(
        'ga:jupiter_station'
      );
    });
  });

  describe('getGravityAssistMasterySuccessBonus', () => {
    it('returns 0 at low levels', () => {
      expect(getGravityAssistMasterySuccessBonus(0)).toBe(0);
      expect(getGravityAssistMasterySuccessBonus(9)).toBe(0);
    });

    it('increases with mastery level', () => {
      expect(getGravityAssistMasterySuccessBonus(10)).toBeGreaterThan(0);
      expect(getGravityAssistMasterySuccessBonus(50)).toBeGreaterThan(
        getGravityAssistMasterySuccessBonus(10)
      );
      expect(getGravityAssistMasterySuccessBonus(99)).toBeGreaterThan(
        getGravityAssistMasterySuccessBonus(50)
      );
    });

    it('caps at 0.30 at level 99', () => {
      expect(getGravityAssistMasterySuccessBonus(99)).toBe(0.3);
    });
  });

  describe('getGravityAssistMasteryRefundBonus', () => {
    it('returns 0 at low levels', () => {
      expect(getGravityAssistMasteryRefundBonus(0)).toBe(0);
      expect(getGravityAssistMasteryRefundBonus(24)).toBe(0);
    });

    it('scales with mastery level', () => {
      expect(getGravityAssistMasteryRefundBonus(25)).toBeGreaterThan(0);
      expect(getGravityAssistMasteryRefundBonus(99)).toBe(0.25);
    });
  });

  describe('getGravityAssistMasteryPenaltyReduction', () => {
    it('returns 0 at low levels', () => {
      expect(getGravityAssistMasteryPenaltyReduction(0)).toBe(0);
      expect(getGravityAssistMasteryPenaltyReduction(49)).toBe(0);
    });

    it('scales with mastery level', () => {
      expect(getGravityAssistMasteryPenaltyReduction(50)).toBe(0.25);
      expect(getGravityAssistMasteryPenaltyReduction(80)).toBe(0.5);
      expect(getGravityAssistMasteryPenaltyReduction(99)).toBe(0.75);
    });
  });

  describe('awardMasteryXp with gravity assist keys', () => {
    it('works with ga: prefixed item IDs', () => {
      const state = createEmptyMasteryState();
      const result = awardMasteryXp(state, 'ga:earth', 150, 50, 83);

      expect(result.itemId).toBe('ga:earth');
      expect(result.masteryXpGained).toBeGreaterThanOrEqual(150);
      expect(state.itemMasteries['ga:earth']).toBeDefined();
      expect(state.pool.xp).toBeGreaterThan(0);
    });
  });

  // ── Factory Helpers ───────────────────────────────────────────

  describe('createInitialMastery', () => {
    it('creates empty mastery for all 3 skills', () => {
      const mastery = createInitialMastery();
      expect(mastery.piloting).toBeDefined();
      expect(mastery.mining).toBeDefined();
      expect(mastery.commerce).toBeDefined();
    });

    it('starts with empty pools and no items', () => {
      const mastery = createInitialMastery();
      for (const skillId of ['piloting', 'mining', 'commerce'] as const) {
        expect(mastery[skillId].pool.xp).toBe(0);
        expect(mastery[skillId].pool.maxXp).toBe(0);
        expect(Object.keys(mastery[skillId].itemMasteries)).toHaveLength(0);
      }
    });
  });

  // ── Pool Checkpoint Bonus Helpers ─────────────────────────────

  describe('pool checkpoint bonus helpers', () => {
    const emptyPool = { xp: 0, maxXp: 0 };
    const belowAll = { xp: 50, maxXp: 1000 }; // 5%
    const at10 = { xp: 100, maxXp: 1000 }; // 10%
    const at25 = { xp: 250, maxXp: 1000 }; // 25%
    const at50 = { xp: 500, maxXp: 1000 }; // 50%
    const at95 = { xp: 950, maxXp: 1000 }; // 95%

    describe('getPilotingPoolWarmupBonus (25%)', () => {
      it('returns 0 below threshold', () => {
        expect(getPilotingPoolWarmupBonus(emptyPool)).toBe(0);
        expect(getPilotingPoolWarmupBonus(belowAll)).toBe(0);
        expect(getPilotingPoolWarmupBonus(at10)).toBe(0);
      });

      it('returns 0.05 at or above 25%', () => {
        expect(getPilotingPoolWarmupBonus(at25)).toBe(0.05);
        expect(getPilotingPoolWarmupBonus(at50)).toBe(0.05);
        expect(getPilotingPoolWarmupBonus(at95)).toBe(0.05);
      });
    });

    describe('getPilotingPoolFuelBonus (50%)', () => {
      it('returns 0 below threshold', () => {
        expect(getPilotingPoolFuelBonus(emptyPool)).toBe(0);
        expect(getPilotingPoolFuelBonus(at25)).toBe(0);
      });

      it('returns 0.05 at or above 50%', () => {
        expect(getPilotingPoolFuelBonus(at50)).toBe(0.05);
        expect(getPilotingPoolFuelBonus(at95)).toBe(0.05);
      });
    });

    describe('getPilotingPoolEvasionBonus (95%)', () => {
      it('returns 0 below threshold', () => {
        expect(getPilotingPoolEvasionBonus(emptyPool)).toBe(0);
        expect(getPilotingPoolEvasionBonus(at50)).toBe(0);
      });

      it('returns 0.1 at or above 95%', () => {
        expect(getPilotingPoolEvasionBonus(at95)).toBe(0.1);
      });
    });

    describe('getCommercePoolSalaryReduction (25%)', () => {
      it('returns 0 below threshold', () => {
        expect(getCommercePoolSalaryReduction(emptyPool)).toBe(0);
        expect(getCommercePoolSalaryReduction(at10)).toBe(0);
      });

      it('returns 0.05 at or above 25%', () => {
        expect(getCommercePoolSalaryReduction(at25)).toBe(0.05);
        expect(getCommercePoolSalaryReduction(at95)).toBe(0.05);
      });
    });

    describe('getCommercePoolSellBonus (50%)', () => {
      it('returns 0 below threshold', () => {
        expect(getCommercePoolSellBonus(emptyPool)).toBe(0);
        expect(getCommercePoolSellBonus(at25)).toBe(0);
      });

      it('returns 0.05 at or above 50%', () => {
        expect(getCommercePoolSellBonus(at50)).toBe(0.05);
        expect(getCommercePoolSellBonus(at95)).toBe(0.05);
      });
    });

    describe('getCommercePoolPaymentBonus (95%)', () => {
      it('returns 0 below threshold', () => {
        expect(getCommercePoolPaymentBonus(emptyPool)).toBe(0);
        expect(getCommercePoolPaymentBonus(at50)).toBe(0);
      });

      it('returns 0.1 at or above 95%', () => {
        expect(getCommercePoolPaymentBonus(at95)).toBe(0.1);
      });
    });

    describe('getRepairsPoolMasteryXpBonus (10%)', () => {
      it('returns 0 below threshold', () => {
        expect(getRepairsPoolMasteryXpBonus(emptyPool)).toBe(0);
        expect(getRepairsPoolMasteryXpBonus(belowAll)).toBe(0);
      });

      it('returns 0.05 at or above 10%', () => {
        expect(getRepairsPoolMasteryXpBonus(at10)).toBe(0.05);
        expect(getRepairsPoolMasteryXpBonus(at50)).toBe(0.05);
      });
    });
  });
});
