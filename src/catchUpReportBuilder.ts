import type {
  GameData,
  CatchUpReport,
  CatchUpContractInfo,
  CatchUpEncounterStats,
  CatchUpShipSummary,
  ContractSnapshot,
  EncounterResult,
  LogEntry,
  RouteSnapshot,
} from './models';

/** Snapshot each ship's automated route assignment before catch-up ticks run. */
export function snapshotRoutes(gameData: GameData): Map<string, RouteSnapshot> {
  const snapshots = new Map<string, RouteSnapshot>();
  for (const ship of gameData.ships) {
    if (ship.routeAssignment) {
      const origin = gameData.world.locations.find(
        (l) => l.id === ship.routeAssignment!.originId
      );
      const dest = gameData.world.locations.find(
        (l) => l.id === ship.routeAssignment!.destinationId
      );
      snapshots.set(ship.id, {
        type: 'trade',
        routeName: `${origin?.name ?? ship.routeAssignment.originId} ↔ ${dest?.name ?? ship.routeAssignment.destinationId}`,
      });
    } else if (ship.miningRoute) {
      const mine = gameData.world.locations.find(
        (l) => l.id === ship.miningRoute!.mineLocationId
      );
      const sell = gameData.world.locations.find(
        (l) => l.id === ship.miningRoute!.sellLocationId
      );
      snapshots.set(ship.id, {
        type: 'mining',
        routeName: `${mine?.name ?? ship.miningRoute.mineLocationId} → ${sell?.name ?? ship.miningRoute.sellLocationId}`,
      });
    }
  }
  return snapshots;
}

/** Snapshot each ship's active contract before catch-up ticks run. */
export function snapshotContracts(
  gameData: GameData
): Map<string, ContractSnapshot> {
  const snapshots = new Map<string, ContractSnapshot>();
  for (const ship of gameData.ships) {
    if (ship.activeContract) {
      snapshots.set(ship.id, {
        questTitle: ship.activeContract.quest.title,
        questId: ship.activeContract.quest.id,
      });
    }
  }
  return snapshots;
}

/**
 * Build a CatchUpReport summarising what happened during an absence.
 * Always returns a report (never null) so the modal is shown for every
 * long absence, even when no encounters occurred.
 */
export function buildCatchUpReport(
  totalTicks: number,
  elapsedRealSeconds: number,
  encounterResults: EncounterResult[],
  gameData: GameData,
  prevCredits: number,
  prevGameTime: number,
  snapshots?: {
    routes?: Map<string, RouteSnapshot>;
    contracts?: Map<string, ContractSnapshot>;
  }
): CatchUpReport {
  // --- Encounter stats per ship ---
  const encounterMap = new Map<string, CatchUpEncounterStats>();

  for (const result of encounterResults) {
    if (!gameData.ships.find((s) => s.id === result.shipId)) continue;

    let stats = encounterMap.get(result.shipId);
    if (!stats) {
      stats = {
        evaded: 0,
        negotiated: 0,
        victories: 0,
        harassments: 0,
        fled: 0,
        creditsDelta: 0,
        avgHealthLost: 0,
      };
      encounterMap.set(result.shipId, stats);
    }

    const addHealthLoss = (hl: Record<string, number> | undefined) => {
      if (!hl) return;
      const losses = Object.values(hl);
      if (losses.length > 0)
        stats.avgHealthLost +=
          losses.reduce((a, b) => a + b, 0) / losses.length;
    };

    switch (result.type) {
      case 'evaded':
        stats.evaded++;
        break;
      case 'negotiated':
        stats.negotiated++;
        stats.creditsDelta -= result.creditsLost || 0;
        break;
      case 'victory':
        stats.victories++;
        stats.creditsDelta += result.creditsGained || 0;
        break;
      case 'harassment':
        stats.harassments++;
        addHealthLoss(result.healthLost);
        break;
      case 'boarding':
        stats.creditsDelta -= result.creditsLost || 0;
        addHealthLoss(result.healthLost);
        break;
      case 'fled':
        stats.fled++;
        addHealthLoss(result.healthLost);
        break;
    }
  }

  // --- General progress from log entries added during catch-up ---
  const newLogs = gameData.log.filter((e) => e.gameTime > prevGameTime);

  const contractsCompleted = newLogs.filter(
    (e) => e.type === 'contract_complete'
  ).length;

  // Count trips per ship — both 'trip_complete' and 'payment' entries represent trip completions
  const tripsByShip = new Map<string, number>();
  for (const entry of newLogs) {
    if (
      (entry.type === 'trip_complete' || entry.type === 'payment') &&
      entry.shipName
    ) {
      tripsByShip.set(
        entry.shipName,
        (tripsByShip.get(entry.shipName) ?? 0) + 1
      );
    }
  }

  // Count mining route trips per ship — "trip #N" in mining_route log entries
  const miningTripsByShip = new Map<string, number>();
  for (const entry of newLogs) {
    if (entry.type === 'mining_route' && entry.shipName) {
      const match = entry.message.match(/trip #(\d+)/);
      if (match) {
        const tripNum = parseInt(match[1], 10);
        const prev = miningTripsByShip.get(entry.shipName) ?? 0;
        if (tripNum > prev) {
          miningTripsByShip.set(entry.shipName, tripNum);
        }
      }
    }
  }

  // --- Track contract events per ship for the report ---
  const contractCompletedByShip = new Set<string>();
  const contractExpiredByShip = new Set<string>();
  const contractAbandonedByShip = new Set<string>();
  for (const entry of newLogs) {
    if (!entry.shipName) continue;
    if (entry.type === 'contract_complete')
      contractCompletedByShip.add(entry.shipName);
    if (entry.type === 'contract_expired')
      contractExpiredByShip.add(entry.shipName);
    if (entry.type === 'contract_abandoned')
      contractAbandonedByShip.add(entry.shipName);
  }

  // --- Build one summary per ship ---
  const shipSummaries: CatchUpShipSummary[] = [];

  for (const ship of gameData.ships) {
    const trips = tripsByShip.get(ship.name) ?? 0;
    const encounters = encounterMap.get(ship.id);

    let activity: CatchUpShipSummary['activity'];

    // Use route snapshot (pre-catch-up state) or current state to identify route ships
    const snapshot = snapshots?.routes?.get(ship.id);

    if (snapshot?.type === 'trade' || ship.routeAssignment) {
      // Trade route ship — use snapshot route name (survives route cancellation during catch-up)
      const routeName =
        snapshot?.routeName ??
        (() => {
          const origin = gameData.world.locations.find(
            (l) => l.id === ship.routeAssignment!.originId
          );
          const dest = gameData.world.locations.find(
            (l) => l.id === ship.routeAssignment!.destinationId
          );
          return `${origin?.name ?? ship.routeAssignment!.originId} ↔ ${dest?.name ?? ship.routeAssignment!.destinationId}`;
        })();
      activity = { type: 'trade_route', routeName, tripsCompleted: trips };
    } else if (snapshot?.type === 'mining' || ship.miningRoute) {
      // Mining route ship — count mining trips from log entries
      const routeName =
        snapshot?.routeName ??
        (() => {
          const mine = gameData.world.locations.find(
            (l) => l.id === ship.miningRoute!.mineLocationId
          );
          const sell = gameData.world.locations.find(
            (l) => l.id === ship.miningRoute!.sellLocationId
          );
          return `${mine?.name ?? ship.miningRoute!.mineLocationId} → ${sell?.name ?? ship.miningRoute!.sellLocationId}`;
        })();
      const miningTrips = miningTripsByShip.get(ship.name) ?? 0;
      activity = {
        type: 'mining_route',
        routeName,
        tripsCompleted: miningTrips,
      };
    } else if (trips > 0) {
      // Non-route ship that completed trips
      activity = {
        type: 'completed_trips',
        tripsCompleted: trips,
      };
    } else if (ship.location.status === 'in_flight' && ship.activeFlightPlan) {
      // Ship still in flight
      const destLoc = gameData.world.locations.find(
        (l) => l.id === ship.activeFlightPlan!.destination
      );
      activity = {
        type: 'en_route',
        destination: destLoc?.name ?? ship.activeFlightPlan.destination,
      };
    } else {
      // Idle / docked or orbiting
      const locId = ship.location.dockedAt ?? ship.location.orbitingAt;
      const loc = locId
        ? gameData.world.locations.find((l) => l.id === locId)
        : undefined;
      activity = { type: 'idle', location: loc?.name ?? locId ?? 'Unknown' };
    }

    // --- Determine contract status for this ship ---
    let contractInfo: CatchUpContractInfo | undefined;
    const contractSnap = snapshots?.contracts?.get(ship.id);

    if (contractSnap) {
      // Ship had a contract before catch-up
      if (contractCompletedByShip.has(ship.name)) {
        contractInfo = { title: contractSnap.questTitle, status: 'completed' };
      } else if (contractExpiredByShip.has(ship.name)) {
        contractInfo = { title: contractSnap.questTitle, status: 'expired' };
      } else if (contractAbandonedByShip.has(ship.name)) {
        contractInfo = { title: contractSnap.questTitle, status: 'abandoned' };
      } else if (ship.activeContract) {
        // Still has the same (or a new) contract — ongoing
        contractInfo = {
          title: ship.activeContract.quest.title,
          status: 'ongoing',
        };
      }
    } else if (ship.activeContract) {
      // Ship picked up a contract during catch-up — show as ongoing
      contractInfo = {
        title: ship.activeContract.quest.title,
        status: 'ongoing',
      };
    }

    // Skip idle ships with no encounters and no contract — they did nothing interesting
    if (activity.type === 'idle' && !encounters && !contractInfo) continue;

    shipSummaries.push({
      shipId: ship.id,
      shipName: ship.name,
      activity,
      encounters,
      contractInfo,
    });
  }

  // Sort: trade routes first, then mining routes, then active ships, then en-route, then idle-with-encounters
  const activityOrder: Record<string, number> = {
    trade_route: 0,
    mining_route: 1,
    completed_trips: 2,
    en_route: 3,
    idle: 4,
  };
  shipSummaries.sort(
    (a, b) =>
      (activityOrder[a.activity.type] ?? 9) -
      (activityOrder[b.activity.type] ?? 9)
  );

  // --- Collect notable log entries (skill-ups, crew hires/departures, gravity warnings) ---
  const otherHighlightTypes: Set<string> = new Set([
    'crew_hired',
    'crew_departed',
    'gravity_warning',
  ]);
  const otherHighlights = newLogs.filter((e) =>
    otherHighlightTypes.has(e.type)
  );

  // Aggregate crew_level_up entries by crew+skill into "Name's Skill: 0 → 5"
  const skillUpGroups = new Map<
    string,
    {
      crewName: string;
      skill: string;
      levels: number[];
      rank: string | null;
      shipName?: string;
      gameTime: number;
    }
  >();
  for (const entry of newLogs) {
    if (entry.type !== 'crew_level_up') continue;

    // "Name's Skill has reached N"
    const reachMatch = entry.message.match(/^(.+?)'s (\w+) has reached (\d+)$/);
    // "Name has become Rank in Skill (N)!"
    const rankMatch = entry.message.match(
      /^(.+?) has become (.+?) in (\w+) \((\d+)\)!$/
    );

    let crewName: string;
    let skill: string;
    let level: number;
    let rank: string | null = null;

    if (reachMatch) {
      crewName = reachMatch[1];
      skill = reachMatch[2];
      level = parseInt(reachMatch[3], 10);
    } else if (rankMatch) {
      crewName = rankMatch[1];
      rank = rankMatch[2];
      skill = rankMatch[3];
      level = parseInt(rankMatch[4], 10);
    } else {
      // Specialization or unknown format — pass through as-is
      otherHighlights.push(entry);
      continue;
    }

    const key = `${crewName}|${skill}`;
    const existing = skillUpGroups.get(key);
    if (existing) {
      existing.levels.push(level);
      if (rank) existing.rank = rank;
      existing.gameTime = Math.max(existing.gameTime, entry.gameTime);
    } else {
      skillUpGroups.set(key, {
        crewName,
        skill,
        levels: [level],
        rank,
        shipName: entry.shipName,
        gameTime: entry.gameTime,
      });
    }
  }

  const aggregatedSkillUps: LogEntry[] = [];
  for (const [, group] of skillUpGroups) {
    const minLevel = Math.min(...group.levels);
    const maxLevel = Math.max(...group.levels);
    const startLevel = minLevel - 1; // infer: one below the first level reached

    let message: string;
    if (group.rank) {
      message = `${group.crewName}'s ${group.skill}: ${startLevel} → ${maxLevel} (${group.rank})`;
    } else {
      message = `${group.crewName}'s ${group.skill}: ${startLevel} → ${maxLevel}`;
    }

    aggregatedSkillUps.push({
      gameTime: group.gameTime,
      type: 'crew_level_up',
      message,
      shipName: group.shipName,
    });
  }

  const logHighlights = [...aggregatedSkillUps, ...otherHighlights];

  return {
    totalTicks,
    elapsedRealSeconds,
    creditsDelta: Math.round(gameData.credits - prevCredits),
    contractsCompleted,
    shipSummaries,
    logHighlights,
  };
}
