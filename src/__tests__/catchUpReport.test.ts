import { describe, it, expect, afterEach } from 'vitest';
import {
  buildCatchUpReport,
  snapshotRoutes,
  createCatchUpAccumulator,
} from '../catchUpReportBuilder';
import { addLog, setLogListener } from '../logSystem';
import { createTestGameData, createTestShip } from './testHelpers';
import type { LogEntryType } from '../models';

/**
 * Helper: push N non-combinable droppable filler entries to overflow the log.
 * These pile up without being aggregated, forcing Phase 2 trimming to drop
 * oldest droppable entries — including mining_route / trip_complete.
 */
function pushFillerEntries(
  log: ReturnType<typeof createTestGameData>['log'],
  count: number,
  gameTime: number,
  shipName: string
): void {
  const fillerTypes: LogEntryType[] = ['departure', 'arrival', 'day_advanced'];
  for (let i = 0; i < count; i++) {
    addLog(
      log,
      gameTime + i,
      fillerTypes[i % fillerTypes.length],
      `Filler entry ${i}`,
      shipName
    );
  }
}

describe('catch-up report trip counts', () => {
  const MINE_LOCATION_ID = 'belt-ceres';
  const SELL_LOCATION_ID = 'ceres-station';

  afterEach(() => {
    // Clean up any registered listener between tests
    setLogListener(null);
  });

  function setupMiningShip() {
    const gameData = createTestGameData();
    const ship = createTestShip({
      name: 'Silver Destiny',
      location: { status: 'orbiting', orbitingAt: MINE_LOCATION_ID },
      miningRoute: {
        mineLocationId: MINE_LOCATION_ID,
        sellLocationId: SELL_LOCATION_ID,
        status: 'mining',
        totalTrips: 10,
        totalCreditsEarned: 50_000,
        assignedAt: 0,
      },
    });
    gameData.ships = [ship];
    gameData.activeShipId = ship.id;
    return { gameData, ship };
  }

  function setupContractShip() {
    const gameData = createTestGameData();
    const ship = createTestShip({
      name: 'Trade Runner',
      location: { status: 'docked', dockedAt: 'earth' },
      activeContract: {
        quest: {
          id: 'quest-1',
          title: 'Supply Run',
          description: 'Deliver supplies',
          type: 'delivery',
          origin: 'earth',
          destination: 'mars',
          cargoRequired: 0,
          totalCargoRequired: 0,
          tripsRequired: -1,
          paymentPerTrip: 5000,
          paymentOnCompletion: 0,
          expiresAfterDays: 0,
          estimatedFuelPerTrip: 0,
          estimatedTripTicks: 100,
        },
        tripsCompleted: 8,
        cargoDelivered: 0,
        creditsEarned: 40_000,
        leg: 'outbound',
        paused: false,
      },
    });
    gameData.ships = [ship];
    gameData.activeShipId = ship.id;
    return { gameData, ship };
  }

  it('mining trip count survives log overflow', () => {
    const { gameData, ship } = setupMiningShip();
    const prevGameTime = gameData.gameTime;
    const prevCredits = gameData.credits;
    const routeSnaps = snapshotRoutes(gameData);

    // Wire accumulator + listener (same as main.ts catch-up flow)
    const accumulator = createCatchUpAccumulator();
    setLogListener(accumulator.onLog);

    // Simulate realistic catch-up: trips complete early, then get buried
    // by hundreds of later entries (ore_mined, departures, arrivals, etc.)
    for (let trip = 1; trip <= 10; trip++) {
      addLog(
        gameData.log,
        prevGameTime + trip * 10,
        'mining_route',
        `Returning to mine to resume mining (trip #${trip})`,
        ship.name
      );
    }

    // Flood with 500 filler entries AFTER the trips to trigger trimming.
    pushFillerEntries(gameData.log, 500, prevGameTime + 10_000, ship.name);

    setLogListener(null);

    // Verify the log was actually trimmed (proves the scenario is valid)
    expect(gameData.log.length).toBeLessThanOrEqual(250);

    const report = buildCatchUpReport(
      5000,
      300,
      [],
      gameData,
      prevCredits,
      prevGameTime,
      { routes: routeSnaps, accumulator }
    );

    const summary = report.shipSummaries.find(
      (s) => s.shipName === 'Silver Destiny'
    );
    expect(summary).toBeDefined();
    expect(summary!.activity.type).toBe('mining_route');
    if (summary!.activity.type === 'mining_route') {
      expect(summary!.activity.tripsCompleted).toBe(10);
    }
  });

  it('trade trip count survives log overflow', () => {
    const { gameData, ship } = setupContractShip();
    const prevGameTime = gameData.gameTime;
    const prevCredits = gameData.credits;

    // Wire accumulator + listener
    const accumulator = createCatchUpAccumulator();
    setLogListener(accumulator.onLog);

    // Add all 8 trip entries first (oldest in log)
    for (let trip = 1; trip <= 8; trip++) {
      addLog(
        gameData.log,
        prevGameTime + trip * 10,
        'trip_complete',
        `Trip ${trip} complete`,
        ship.name
      );
    }

    // Flood with filler to push trip entries out
    pushFillerEntries(gameData.log, 500, prevGameTime + 10_000, ship.name);

    setLogListener(null);

    expect(gameData.log.length).toBeLessThanOrEqual(250);

    const report = buildCatchUpReport(
      5000,
      300,
      [],
      gameData,
      prevCredits,
      prevGameTime,
      { accumulator }
    );

    const summary = report.shipSummaries.find(
      (s) => s.shipName === 'Trade Runner'
    );
    expect(summary).toBeDefined();
    const activity = summary!.activity;
    if ('tripsCompleted' in activity) {
      expect(activity.tripsCompleted).toBe(8);
    } else {
      expect.unreachable('Expected activity to have tripsCompleted field');
    }
  });

  it('trip counts are accurate without log overflow (baseline)', () => {
    const { gameData, ship } = setupMiningShip();
    const prevGameTime = gameData.gameTime;
    const prevCredits = gameData.credits;
    const routeSnaps = snapshotRoutes(gameData);

    // Only 5 entries — well under the 200 cap, no trimming
    for (let trip = 1; trip <= 5; trip++) {
      addLog(
        gameData.log,
        prevGameTime + trip * 100,
        'mining_route',
        `Returning to mine to resume mining (trip #${trip})`,
        ship.name
      );
    }

    const report = buildCatchUpReport(
      1000,
      60,
      [],
      gameData,
      prevCredits,
      prevGameTime,
      { routes: routeSnaps }
    );

    const summary = report.shipSummaries.find(
      (s) => s.shipName === 'Silver Destiny'
    );
    expect(summary).toBeDefined();
    expect(summary!.activity.type).toBe('mining_route');
    if (summary!.activity.type === 'mining_route') {
      expect(summary!.activity.tripsCompleted).toBe(5);
    }
  });
});
