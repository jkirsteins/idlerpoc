import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGameData } from './testHelpers';
import type { GameData, Ship } from '../models';
import {
  assignMiningRoute,
  cancelMiningRoute,
  checkMiningRouteDeparture,
  handleMiningRouteArrival,
  retryMiningRouteDeparture,
} from '../miningRoute';
import { getRemainingOreCapacity } from '../miningSystem';

// Use real world locations from generateWorld()
const MINE_LOCATION_ID = 'graveyard_drift'; // mine service, no trade
const TRADE_LOCATION_ID = 'earth'; // trade + refuel

describe('Mining Route System', () => {
  let gameData: GameData;
  let ship: Ship;

  beforeEach(() => {
    gameData = createTestGameData();
    ship = gameData.ships[0];
    // Place ship orbiting at mine location
    ship.location = {
      status: 'orbiting',
      orbitingAt: MINE_LOCATION_ID,
    };
    delete ship.activeFlightPlan;
    ship.activeContract = null;
    ship.miningRoute = null;
    // Ensure helm crew for flights
    const helmSlot = ship.jobSlots.find((s) => s.type === 'helm');
    const pilot = ship.crew.find((c) => c.role === 'pilot');
    if (helmSlot && pilot) {
      helmSlot.assignedCrewId = pilot.id;
    }
  });

  // ─── assignMiningRoute ──────────────────────────────────────

  describe('assignMiningRoute', () => {
    it('creates route when orbiting a mine location', () => {
      const result = assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      expect(result.success).toBe(true);
      expect(ship.miningRoute).not.toBeNull();
      expect(ship.miningRoute!.mineLocationId).toBe(MINE_LOCATION_ID);
      expect(ship.miningRoute!.sellLocationId).toBe(TRADE_LOCATION_ID);
      expect(ship.miningRoute!.status).toBe('mining');
      expect(ship.miningRoute!.totalTrips).toBe(0);
      expect(ship.miningRoute!.totalCreditsEarned).toBe(0);
    });

    it('fails if ship is docked, not orbiting', () => {
      ship.location = { status: 'docked', dockedAt: 'earth' };
      const result = assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('orbiting');
    });

    it('fails if orbiting a non-mine location', () => {
      ship.location = { status: 'orbiting', orbitingAt: 'earth' };
      const result = assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('mining');
    });

    it('fails if sell location has no trade service', () => {
      const result = assignMiningRoute(
        gameData,
        ship,
        MINE_LOCATION_ID // mine-only, no trade
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('trade');
    });

    it('fails if ship has active contract', () => {
      ship.activeContract = {
        quest: {} as GameData['availableQuests'][string][0],
        tripsCompleted: 0,
        cargoDelivered: 0,
        creditsEarned: 0,
        leg: 'outbound',
        paused: false,
      };
      const result = assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('contract');
    });

    it('logs mining route creation', () => {
      const logBefore = gameData.log.length;
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      expect(gameData.log.length).toBeGreaterThan(logBefore);
      const lastLog = gameData.log[gameData.log.length - 1];
      expect(lastLog.type).toBe('mining_route');
      expect(lastLog.message).toContain('Mining route established');
    });
  });

  // ─── cancelMiningRoute ──────────────────────────────────────

  describe('cancelMiningRoute', () => {
    it('removes mining route and logs summary', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.miningRoute!.totalTrips = 5;
      ship.miningRoute!.totalCreditsEarned = 12000;

      const logBefore = gameData.log.length;
      cancelMiningRoute(gameData, ship);

      expect(ship.miningRoute).toBeNull();
      expect(gameData.log.length).toBeGreaterThan(logBefore);
      const lastLog = gameData.log[gameData.log.length - 1];
      expect(lastLog.type).toBe('mining_route');
      expect(lastLog.message).toContain('5 trips');
      expect(lastLog.message).toContain('12,000');
    });

    it('does nothing if no route set', () => {
      const logBefore = gameData.log.length;
      cancelMiningRoute(gameData, ship);
      expect(gameData.log.length).toBe(logBefore);
    });

    it('preserves ore cargo when canceling during mining phase', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 100 });

      cancelMiningRoute(gameData, ship);

      expect(ship.miningRoute).toBeNull();
      expect(ship.oreCargo.length).toBe(1);
      expect(ship.oreCargo[0].oreId).toBe('iron_ore');
      expect(ship.oreCargo[0].quantity).toBe(100);
    });

    it('clears mining accumulator on cancel', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.miningAccumulator = {
        iron_ore: 0.75,
        _cargoFullLogged: 1,
      };

      cancelMiningRoute(gameData, ship);

      expect(ship.miningAccumulator).toEqual({});
    });

    it('logs ore retention info when cargo has ore', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 50 });

      cancelMiningRoute(gameData, ship);

      const lastLog = gameData.log[gameData.log.length - 1];
      expect(lastLog.message).toContain('retained in cargo');
    });

    it('does not mention ore retention when cargo is empty', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.oreCargo = [];

      cancelMiningRoute(gameData, ship);

      const lastLog = gameData.log[gameData.log.length - 1];
      expect(lastLog.message).not.toContain('retained');
    });
  });

  // ─── checkMiningRouteDeparture ──────────────────────────────

  describe('checkMiningRouteDeparture', () => {
    beforeEach(() => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
    });

    it('does not depart when cargo has space', () => {
      expect(getRemainingOreCapacity(ship)).toBeGreaterThan(0);
      const departed = checkMiningRouteDeparture(gameData, ship);
      expect(departed).toBe(false);
      expect(ship.location.status).toBe('orbiting');
    });

    it('departs to sell station when cargo is full', () => {
      // Fill cargo to capacity
      const capacity = getRemainingOreCapacity(ship);
      ship.oreCargo.push({
        oreId: 'iron_ore',
        quantity: Math.ceil(capacity / 5), // each ore weighs ~5kg
      });
      // Ensure truly full
      while (getRemainingOreCapacity(ship) > 0) {
        const existing = ship.oreCargo.find((c) => c.oreId === 'iron_ore');
        if (existing) existing.quantity++;
      }

      const departed = checkMiningRouteDeparture(gameData, ship);
      expect(departed).toBe(true);
      expect(ship.location.status).toBe('in_flight');
      expect(ship.miningRoute!.status).toBe('selling');
      expect(ship.activeFlightPlan).toBeDefined();
      expect(ship.activeFlightPlan!.destination).toBe(TRADE_LOCATION_ID);
      expect(ship.activeFlightPlan!.dockOnArrival).toBe(true);
    });

    it('does not depart without a mining route', () => {
      ship.miningRoute = null;
      // Fill cargo
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 99999 });
      const departed = checkMiningRouteDeparture(gameData, ship);
      expect(departed).toBe(false);
    });

    it('does not depart when route status is not mining', () => {
      ship.miningRoute!.status = 'selling';
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 99999 });
      const departed = checkMiningRouteDeparture(gameData, ship);
      expect(departed).toBe(false);
    });
  });

  // ─── handleMiningRouteArrival ───────────────────────────────

  describe('handleMiningRouteArrival', () => {
    it('auto-sells ore and departs back when arriving at sell station', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.miningRoute!.status = 'selling';

      // Add ore cargo to sell
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 10 });

      // Simulate arrival at sell station (docked)
      ship.location = { status: 'docked', dockedAt: TRADE_LOCATION_ID };
      delete ship.activeFlightPlan;

      const creditsBefore = gameData.credits;
      const handled = handleMiningRouteArrival(gameData, ship);

      expect(handled).toBe(true);
      // Ore should be sold
      expect(ship.oreCargo.length).toBe(0);
      expect(gameData.credits).toBeGreaterThan(creditsBefore);
      // Ship should be departing back
      expect(ship.location.status).toBe('in_flight');
      expect(ship.miningRoute!.status).toBe('returning');
      expect(ship.miningRoute!.totalTrips).toBe(1);
      expect(ship.miningRoute!.totalCreditsEarned).toBeGreaterThan(0);
    });

    it('resumes mining status when arriving back at mine location', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.miningRoute!.status = 'returning';

      // Simulate arrival at mine location (orbiting)
      ship.location = {
        status: 'orbiting',
        orbitingAt: MINE_LOCATION_ID,
      };
      delete ship.activeFlightPlan;

      const handled = handleMiningRouteArrival(gameData, ship);

      expect(handled).toBe(true);
      expect(ship.miningRoute!.status).toBe('mining');
    });

    it('does nothing without a mining route', () => {
      ship.miningRoute = null;
      const handled = handleMiningRouteArrival(gameData, ship);
      expect(handled).toBe(false);
    });

    it('does nothing when mining route is in mining phase', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      // status is 'mining' by default
      const handled = handleMiningRouteArrival(gameData, ship);
      expect(handled).toBe(false);
    });

    it('tracks cumulative credits across multiple trips', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.miningRoute!.status = 'selling';
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 5 });
      ship.location = { status: 'docked', dockedAt: TRADE_LOCATION_ID };
      delete ship.activeFlightPlan;

      handleMiningRouteArrival(gameData, ship);
      const firstTripCredits = ship.miningRoute!.totalCreditsEarned;
      expect(firstTripCredits).toBeGreaterThan(0);

      // Simulate return and second trip
      ship.miningRoute!.status = 'returning';
      ship.location = {
        status: 'orbiting',
        orbitingAt: MINE_LOCATION_ID,
      };
      delete ship.activeFlightPlan;
      handleMiningRouteArrival(gameData, ship);

      // Fill and sell again
      ship.miningRoute!.status = 'selling';
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 5 });
      ship.location = { status: 'docked', dockedAt: TRADE_LOCATION_ID };
      delete ship.activeFlightPlan;
      handleMiningRouteArrival(gameData, ship);

      expect(ship.miningRoute!.totalTrips).toBe(2);
      expect(ship.miningRoute!.totalCreditsEarned).toBeGreaterThan(
        firstTripCredits
      );
    });
  });

  // ─── Auto-refuel on sell arrival ────────────────────────────

  describe('auto-refuel during mining route', () => {
    it('auto-refuels when fuel is low at sell station', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.miningRoute!.status = 'selling';
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 5 });

      // Set fuel very low (below 30%) and give enough credits for refuel
      // NTR engine (3x fuel multiplier) at Earth (0.8x) = 4.8 cr/kg
      // 90% of 150K maxFuel = 135K kg needed, ~648K cr
      ship.fuelKg = ship.maxFuelKg * 0.1;
      gameData.credits = 1_000_000;
      ship.location = { status: 'docked', dockedAt: TRADE_LOCATION_ID };
      delete ship.activeFlightPlan;

      handleMiningRouteArrival(gameData, ship);

      // Should have been refueled to full
      expect(ship.fuelKg).toBe(ship.maxFuelKg);
    });

    it('cancels route if credits insufficient for refuel', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);
      ship.miningRoute!.status = 'selling';

      // Very low fuel + no credits
      ship.fuelKg = ship.maxFuelKg * 0.1;
      gameData.credits = 0;
      ship.location = { status: 'docked', dockedAt: TRADE_LOCATION_ID };
      delete ship.activeFlightPlan;

      handleMiningRouteArrival(gameData, ship);

      // Route should be cancelled due to no funds for refuel
      expect(ship.miningRoute).toBeNull();
    });
  });

  // ─── Helm unmanned edge case ────────────────────────────────

  describe('helm unmanned handling', () => {
    it('does not depart if helm is unmanned, logs warning', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID);

      // Unassign all helm crew
      for (const slot of ship.jobSlots) {
        if (slot.type === 'helm') slot.assignedCrewId = null;
      }

      // Fill cargo
      ship.oreCargo.push({ oreId: 'iron_ore', quantity: 99999 });

      const logBefore = gameData.log.length;
      const departed = checkMiningRouteDeparture(gameData, ship);

      expect(departed).toBe(false);
      expect(ship.location.status).toBe('orbiting'); // Still orbiting
      expect(ship.miningRoute).not.toBeNull(); // Route not cancelled

      // Should log helm warning
      const helmLog = gameData.log
        .slice(logBefore)
        .find((l) => l.message.includes('helm'));
      expect(helmLog).toBeDefined();
    });
  });

  // ─── Remote mining route start (from non-mine stations) ───

  describe('remote mining route start', () => {
    beforeEach(() => {
      // Place ship at a non-mine station (Earth Dock)
      ship.location = { status: 'docked', dockedAt: TRADE_LOCATION_ID };
      delete ship.activeFlightPlan;
    });

    it('creates route with status returning when mineLocationId is provided', () => {
      const result = assignMiningRoute(
        gameData,
        ship,
        TRADE_LOCATION_ID,
        MINE_LOCATION_ID
      );

      expect(result.success).toBe(true);
      expect(ship.miningRoute).not.toBeNull();
      expect(ship.miningRoute!.mineLocationId).toBe(MINE_LOCATION_ID);
      expect(ship.miningRoute!.sellLocationId).toBe(TRADE_LOCATION_ID);
      expect(ship.miningRoute!.status).toBe('returning');
      expect(ship.miningRoute!.totalTrips).toBe(0);
    });

    it('initiates flight to mine on remote start', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID, MINE_LOCATION_ID);

      // Ship should be in flight heading to the mine
      expect(ship.location.status).toBe('in_flight');
      expect(ship.activeFlightPlan).toBeDefined();
      expect(ship.activeFlightPlan!.destination).toBe(MINE_LOCATION_ID);
      expect(ship.activeFlightPlan!.dockOnArrival).toBe(false); // orbit on arrival
    });

    it('works when ship is orbiting a non-mine location', () => {
      ship.location = { status: 'orbiting', orbitingAt: TRADE_LOCATION_ID };

      const result = assignMiningRoute(
        gameData,
        ship,
        TRADE_LOCATION_ID,
        MINE_LOCATION_ID
      );

      expect(result.success).toBe(true);
      expect(ship.location.status).toBe('in_flight');
    });

    it('rejects when mineLocationId has no mine service', () => {
      const result = assignMiningRoute(
        gameData,
        ship,
        TRADE_LOCATION_ID,
        TRADE_LOCATION_ID // Earth has no mine service
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('mining');
    });

    it('rejects when ship has active contract', () => {
      ship.activeContract = {
        quest: {} as GameData['availableQuests'][string][0],
        tripsCompleted: 0,
        cargoDelivered: 0,
        creditsEarned: 0,
        leg: 'outbound',
        paused: false,
      };

      const result = assignMiningRoute(
        gameData,
        ship,
        TRADE_LOCATION_ID,
        MINE_LOCATION_ID
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('contract');
    });

    it('creates route even if helm is unmanned (for retry)', () => {
      // Unassign helm crew
      for (const slot of ship.jobSlots) {
        if (slot.type === 'helm') slot.assignedCrewId = null;
      }

      const result = assignMiningRoute(
        gameData,
        ship,
        TRADE_LOCATION_ID,
        MINE_LOCATION_ID
      );

      expect(result.success).toBe(true);
      expect(ship.miningRoute).not.toBeNull();
      // Ship should still be docked (flight didn't start)
      expect(ship.location.status).toBe('docked');
    });

    it('arrival at mine transitions to mining status', () => {
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID, MINE_LOCATION_ID);

      // Simulate arrival at mine (orbiting)
      ship.location = { status: 'orbiting', orbitingAt: MINE_LOCATION_ID };
      delete ship.activeFlightPlan;

      const handled = handleMiningRouteArrival(gameData, ship);

      expect(handled).toBe(true);
      expect(ship.miningRoute!.status).toBe('mining');
    });

    it('logs route creation for remote start', () => {
      const logBefore = gameData.log.length;
      assignMiningRoute(gameData, ship, TRADE_LOCATION_ID, MINE_LOCATION_ID);

      const newLogs = gameData.log.slice(logBefore);
      const routeLog = newLogs.find((l) => l.type === 'mining_route');
      expect(routeLog).toBeDefined();
      expect(routeLog!.message).toContain('Mining route established');
    });
  });

  // ─── retryMiningRouteDeparture (stalled initial departure) ─

  describe('retryMiningRouteDeparture for remote start', () => {
    it('retries departure when returning status but not at mine', () => {
      // Place ship docked at trade station with a returning route
      ship.location = { status: 'docked', dockedAt: TRADE_LOCATION_ID };
      delete ship.activeFlightPlan;

      ship.miningRoute = {
        mineLocationId: MINE_LOCATION_ID,
        sellLocationId: TRADE_LOCATION_ID,
        status: 'returning',
        totalTrips: 0,
        totalCreditsEarned: 0,
        assignedAt: 0,
      };

      const departed = retryMiningRouteDeparture(gameData, ship);

      expect(departed).toBe(true);
      expect(ship.location.status).toBe('in_flight');
      expect(ship.activeFlightPlan!.destination).toBe(MINE_LOCATION_ID);
    });

    it('does not retry when already at mine location', () => {
      // Ship is orbiting at the mine with returning status (normal return from sell)
      ship.location = { status: 'orbiting', orbitingAt: MINE_LOCATION_ID };
      delete ship.activeFlightPlan;

      ship.miningRoute = {
        mineLocationId: MINE_LOCATION_ID,
        sellLocationId: TRADE_LOCATION_ID,
        status: 'returning',
        totalTrips: 1,
        totalCreditsEarned: 500,
        assignedAt: 0,
      };

      const departed = retryMiningRouteDeparture(gameData, ship);

      // Should not retry — handleMiningRouteArrival handles this case
      expect(departed).toBe(false);
      expect(ship.location.status).toBe('orbiting');
    });

    it('does not retry when ship is in flight', () => {
      ship.location = { status: 'in_flight' };
      ship.miningRoute = {
        mineLocationId: MINE_LOCATION_ID,
        sellLocationId: TRADE_LOCATION_ID,
        status: 'returning',
        totalTrips: 0,
        totalCreditsEarned: 0,
        assignedAt: 0,
      };

      const departed = retryMiningRouteDeparture(gameData, ship);

      expect(departed).toBe(false);
    });
  });
});
