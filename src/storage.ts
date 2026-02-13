import type { GameData, WorldLocation } from './models';
import { generateWorld } from './worldGen';
import { generateJobSlotsForShip } from './jobSlots';
import { generateId } from './utils';
import {
  updateWorldPositions,
  lerpVec2,
  getLocationPosition,
} from './orbitalMechanics';

const STORAGE_KEY = 'spaceship_game_data';
const BACKUP_KEY = 'spaceship_game_data_backup';

/**
 * Current save format version. Bump this whenever a change to the persisted
 * GameData shape requires a migration (not needed for purely additive optional
 * fields that can be backfilled with safe defaults).
 *
 * See docs/save-migration.md for the full migration architecture.
 */
export const CURRENT_SAVE_VERSION = 10;

/** Whether the last save attempt failed (used for UI warnings). */
let _lastSaveFailed = false;

export function lastSaveFailed(): boolean {
  return _lastSaveFailed;
}

/**
 * Persist game state to localStorage.
 * Returns true on success, false if the write failed (e.g. quota exceeded,
 * private-browsing restrictions, or storage disabled).
 */
export function saveGame(gameData: GameData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameData));
    _lastSaveFailed = false;
    return true;
  } catch (e) {
    console.error('Failed to save game:', e);
    _lastSaveFailed = true;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Migration pipeline
// ---------------------------------------------------------------------------

/**
 * Each migration transforms the raw save object from version N to N+1.
 * Migrations are keyed by their *source* version (the version they migrate
 * FROM). For example, migrations[0] upgrades a v0 save to v1.
 *
 * The functions receive and return a loosely-typed record so they can reshape
 * fields freely. Type safety is restored after all migrations have run.
 */
type RawSave = Record<string, unknown>;
type MigrationFn = (data: RawSave) => RawSave;

const migrations: Record<number, MigrationFn> = {
  /**
   * v0 → v1: Codifies the existing backfill logic that was previously
   * scattered through loadGame(). v0 saves are those created before the
   * saveVersion field existed — they have the fleet architecture (ships,
   * activeShipId, credits) but no explicit version number.
   */
  0: (data: RawSave): RawSave => {
    // Backfill visitedLocations
    if (!data.visitedLocations) {
      data.visitedLocations = [];
    }

    // Backfill time system fields
    if (data.isPaused === undefined) {
      data.isPaused = false;
    }
    if (data.timeSpeed === undefined) {
      data.timeSpeed = 1;
    }
    if (!data.autoPauseSettings) {
      data.autoPauseSettings = {
        onArrival: true,
        onContractComplete: true,
        onCriticalAlert: true,
        onLowFuel: true,
      };
    }

    // Backfill per-ship fields
    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      for (const ship of ships) {
        if (!ship.metrics) {
          ship.metrics = {
            creditsEarned: 0,
            fuelCostsPaid: 0,
            crewCostsPaid: 0,
            repairCostsPaid: 0,
            contractsCompleted: 0,
            totalFlightTicks: 0,
            totalIdleTicks: 0,
            lastActivityTime: 0,
          };
        }
        if (ship.role === undefined) {
          ship.role = undefined;
        }
        if (ship.flightProfileBurnFraction === undefined) {
          ship.flightProfileBurnFraction = 1.0;
        }
        const plan = ship.activeFlightPlan as
          | Record<string, unknown>
          | undefined;
        if (plan && plan.burnFraction === undefined) {
          plan.burnFraction = 1.0;
        }
        if (ship.oxygenLevel === undefined) {
          ship.oxygenLevel = 100;
        }
      }
    }

    data.saveVersion = 1;
    return data;
  },

  /**
   * v1 → v2: Skill system revamp.
   * - 7 skills → 3 skills (piloting, mining, commerce)
   * - 8 crew roles → 4 (captain, pilot, miner, trader)
   * - Add mastery system to crew members
   * - Add oreCargo to ships
   * - Regenerate world (new mining locations, pilotingRequirement)
   * - Regenerate job slots (new mining_ops slot, changed skill assignments)
   */
  1: (data: RawSave): RawSave => {
    // Role mapping: old → new
    const ROLE_MAP: Record<string, string> = {
      captain: 'captain',
      pilot: 'pilot',
      navigator: 'pilot',
      engineer: 'miner',
      cook: 'trader',
      medic: 'trader',
      gunner: 'pilot',
      mechanic: 'miner',
    };

    // Empty mastery state factory (inline to avoid import cycle)
    const emptyMastery = () => ({
      piloting: { itemMasteries: {}, pool: { xp: 0, maxXp: 0 } },
      mining: { itemMasteries: {}, pool: { xp: 0, maxXp: 0 } },
      commerce: { itemMasteries: {}, pool: { xp: 0, maxXp: 0 } },
    });

    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      for (const ship of ships) {
        // Add oreCargo
        if (!ship.oreCargo) {
          ship.oreCargo = [];
        }

        // Migrate crew skills and roles
        const crew = ship.crew as Array<Record<string, unknown>> | undefined;
        if (crew) {
          for (const member of crew) {
            // Migrate skills: keep best of piloting/astrogation, start mining at 0
            const oldSkills = member.skills as
              | Record<string, number>
              | undefined;
            if (oldSkills) {
              const bestPiloting = Math.max(
                oldSkills.piloting ?? 0,
                oldSkills.astrogation ?? 0
              );
              const commerce = oldSkills.commerce ?? 0;
              member.skills = {
                piloting: bestPiloting,
                mining: 0,
                commerce,
              };
            }

            // Migrate role
            const oldRole = member.role as string;
            member.role = ROLE_MAP[oldRole] ?? 'pilot';

            // Add mastery
            if (!member.mastery) {
              member.mastery = emptyMastery();
            }
          }
        }

        // Regenerate job slots for new slot types
        // We need rooms and equipment to regenerate properly
        const rooms = ship.rooms as Array<Record<string, unknown>> | undefined;
        const equipment = ship.equipment as
          | Array<Record<string, unknown>>
          | undefined;
        if (rooms && equipment) {
          // Use the ship object directly - generateJobSlotsForShip reads rooms/equipment
          ship.jobSlots = generateJobSlotsForShip(
            ship as unknown as Parameters<typeof generateJobSlotsForShip>[0]
          );
        }
      }
    }

    // Regenerate world with new mining locations and pilotingRequirement
    data.world = generateWorld() as unknown as RawSave;

    data.saveVersion = 2;
    return data;
  },

  /**
   * v2 → v3: Crew service record fields.
   * - Add hiredAt (gameTime when hired) to all crew
   * - Add boardedShipAt (gameTime when joined current ship) to all crew
   * - hiredLocation left undefined for existing crew (unknown origin)
   */
  2: (data: RawSave): RawSave => {
    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      for (const ship of ships) {
        const crew = ship.crew as Array<Record<string, unknown>> | undefined;
        if (crew) {
          for (const member of crew) {
            if (member.hiredAt === undefined) {
              member.hiredAt = 0; // Assume game epoch for existing crew
            }
            if (member.boardedShipAt === undefined) {
              member.boardedShipAt = 0; // Assume game epoch for existing crew
            }
          }
        }
      }
    }

    // Also backfill hireable crew pools
    const pools = data.hireableCrewByLocation as
      | Record<string, Array<Record<string, unknown>>>
      | undefined;
    if (pools) {
      for (const locationId of Object.keys(pools)) {
        for (const member of pools[locationId]) {
          if (member.hiredAt === undefined) {
            member.hiredAt = 0;
          }
          if (member.boardedShipAt === undefined) {
            member.boardedShipAt = 0;
          }
        }
      }
    }

    data.saveVersion = 3;
    return data;
  },

  /**
   * v3 → v4: Crew salary multiplier for skill-based hiring costs.
   * - Add salaryMultiplier to all crew (1.0 = base rate for existing crew)
   * - Existing hired crew keep 1.0 (they were hired under the old flat rate)
   */
  3: (data: RawSave): RawSave => {
    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      for (const ship of ships) {
        const crew = ship.crew as Array<Record<string, unknown>> | undefined;
        if (crew) {
          for (const member of crew) {
            if (member.salaryMultiplier === undefined) {
              member.salaryMultiplier = 1.0;
            }
          }
        }
      }
    }

    // Also backfill hireable crew pools
    const pools = data.hireableCrewByLocation as
      | Record<string, Array<Record<string, unknown>>>
      | undefined;
    if (pools) {
      for (const locationId of Object.keys(pools)) {
        for (const member of pools[locationId]) {
          if (member.salaryMultiplier === undefined) {
            member.salaryMultiplier = 1.0;
          }
        }
      }
    }

    data.saveVersion = 4;
    return data;
  },

  /**
   * v4 → v5: Provisions system.
   * - Add provisionsKg to all ships, fully stocked (30 days per crew).
   * - Existing ships start with full provisions so crew won't starve on load.
   */
  4: (data: RawSave): RawSave => {
    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      // Matches PROVISIONS_KG_PER_CREW_PER_DAY * MAX_PROVISION_DAYS
      const KG_PER_CREW_PER_DAY = 30;
      const MAX_DAYS = 30;

      for (const ship of ships) {
        if (ship.provisionsKg === undefined) {
          const crew = ship.crew as Array<unknown> | undefined;
          const crewCount = crew?.length ?? 0;
          // Full 30-day supply for existing crew
          ship.provisionsKg = crewCount * KG_PER_CREW_PER_DAY * MAX_DAYS;
        }
      }
    }

    data.saveVersion = 5;
    return data;
  },

  /**
   * v5 → v6: World location reconfiguration.
   * - Regenerate world with 13 realistic locations (replaces 11 old ones)
   * - Relocate ships at removed locations (debris_field_alpha, scrapyard_ring,
   *   nea_2247, meo_depot) to earth (or geo_depot for meo_depot successor)
   * - Cancel flights, contracts, routes referencing removed locations
   * - Clean up quests, hireable crew, visited locations
   * - Clear selectedMiningOreId (ore distributions changed globally)
   */
  5: (data: RawSave): RawSave => {
    const REMOVED_LOCATIONS = new Set([
      'debris_field_alpha',
      'scrapyard_ring',
      'nea_2247',
      'meo_depot',
    ]);

    // meo_depot is renamed to geo_depot — redirect ships there instead of earth
    const REMAP: Record<string, string> = { meo_depot: 'geo_depot' };

    function relocateTarget(oldId: string): string {
      return REMAP[oldId] ?? 'earth';
    }

    // 1. Regenerate world
    data.world = generateWorld() as unknown as RawSave;

    // 2. Process ships
    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      for (const ship of ships) {
        const location = ship.location as Record<string, unknown> | undefined;

        // 2a. Relocate ships at removed locations
        if (location) {
          if (
            typeof location.dockedAt === 'string' &&
            REMOVED_LOCATIONS.has(location.dockedAt)
          ) {
            location.dockedAt = relocateTarget(location.dockedAt);
          }
          if (
            typeof location.orbitingAt === 'string' &&
            REMOVED_LOCATIONS.has(location.orbitingAt)
          ) {
            location.status = 'docked';
            const target = relocateTarget(location.orbitingAt);
            location.orbitingAt = undefined;
            location.dockedAt = target;
          }
        }

        // 2b. Cancel flights to/from removed locations
        const flight = ship.activeFlightPlan as
          | Record<string, unknown>
          | undefined;
        if (flight) {
          const origin = flight.origin as string;
          const dest = flight.destination as string;
          if (REMOVED_LOCATIONS.has(origin) || REMOVED_LOCATIONS.has(dest)) {
            ship.activeFlightPlan = undefined;
            if (location) {
              location.status = 'docked';
              location.dockedAt = 'earth';
              location.orbitingAt = undefined;
            }
          }
        }

        // 2c. Cancel contracts referencing removed locations
        const contract = ship.activeContract as Record<string, unknown> | null;
        if (contract) {
          const quest = contract.quest as Record<string, unknown> | undefined;
          if (quest) {
            const qOrigin = quest.origin as string;
            const qDest = quest.destination as string;
            if (
              REMOVED_LOCATIONS.has(qOrigin) ||
              REMOVED_LOCATIONS.has(qDest)
            ) {
              ship.activeContract = null;
            }
          }
        }

        // 2d. Cancel trade routes referencing removed locations
        const route = ship.routeAssignment as Record<string, unknown> | null;
        if (route) {
          const rOrigin = route.originId as string;
          const rDest = route.destinationId as string;
          if (REMOVED_LOCATIONS.has(rOrigin) || REMOVED_LOCATIONS.has(rDest)) {
            ship.routeAssignment = null;
          }
        }

        // 2e. Cancel mining routes referencing removed locations
        const mRoute = ship.miningRoute as Record<string, unknown> | null;
        if (mRoute) {
          const mineLoc = mRoute.mineLocationId as string;
          const sellLoc = mRoute.sellLocationId as string;
          if (
            REMOVED_LOCATIONS.has(mineLoc) ||
            REMOVED_LOCATIONS.has(sellLoc)
          ) {
            ship.miningRoute = null;
          }
        }

        // 2f. Clear selectedMiningOreId — ore distributions changed
        ship.selectedMiningOreId = undefined;
      }
    }

    // 3. Clean availableQuests for removed locations
    const quests = data.availableQuests as Record<string, unknown> | undefined;
    if (quests) {
      for (const locId of REMOVED_LOCATIONS) {
        delete quests[locId];
      }
    }

    // 4. Clean hireableCrewByLocation for removed locations
    const crews = data.hireableCrewByLocation as
      | Record<string, unknown>
      | undefined;
    if (crews) {
      for (const locId of REMOVED_LOCATIONS) {
        delete crews[locId];
      }
    }

    // 5. Clean visitedLocations — remove deleted IDs, remap meo_depot→geo_depot
    const visited = data.visitedLocations as string[] | undefined;
    if (visited) {
      const hadMeoDepot = visited.includes('meo_depot');
      const cleaned = visited.filter((id) => !REMOVED_LOCATIONS.has(id));
      if (hadMeoDepot && !cleaned.includes('geo_depot')) {
        cleaned.push('geo_depot');
      }
      data.visitedLocations = [...new Set(cleaned)];
    }

    data.saveVersion = 6;
    return data;
  },

  /**
   * v6 → v7: 2D orbital mechanics.
   * - Regenerate world with orbital params (merge by location ID to preserve player state)
   * - Compute initial 2D positions for all locations
   * - In-flight ships: synthesize 2D trajectory fields from progress ratio
   * - distanceFromEarth becomes a computed field (recalculated each tick)
   */
  6: (data: RawSave): RawSave => {
    const newWorld = generateWorld();
    const gameTime = (data.gameTime as number) ?? 0;

    // Build lookup of new locations by ID (with orbital params)
    const newLocMap = new Map<string, WorldLocation>();
    for (const loc of newWorld.locations) {
      newLocMap.set(loc.id, loc);
    }

    // Merge orbital params into existing world locations
    const oldWorld = data.world as
      | { locations: Array<Record<string, unknown>> }
      | undefined;
    if (oldWorld?.locations) {
      for (const oldLoc of oldWorld.locations) {
        const locId = oldLoc.id as string;
        const newLoc = newLocMap.get(locId);
        if (newLoc?.orbital) {
          oldLoc.orbital = newLoc.orbital;
        }
      }
    }

    // Compute initial positions at current gameTime
    // Use the new world's locations (with orbital data) and apply positions
    updateWorldPositions(newWorld, gameTime);

    // Update old world locations with computed positions
    if (oldWorld?.locations) {
      for (const oldLoc of oldWorld.locations) {
        const locId = oldLoc.id as string;
        const newLoc = newLocMap.get(locId);
        if (newLoc) {
          oldLoc.x = newLoc.x;
          oldLoc.y = newLoc.y;
          oldLoc.distanceFromEarth = newLoc.distanceFromEarth;
        }
      }
    }

    // Synthesize 2D trajectory fields for in-flight ships
    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships && oldWorld?.locations) {
      for (const ship of ships) {
        const location = ship.location as Record<string, unknown> | undefined;
        const flight = ship.activeFlightPlan as
          | Record<string, unknown>
          | undefined;

        if (location?.status !== 'in_flight' || !flight) continue;

        const originId = flight.origin as string;
        const destId = flight.destination as string;
        const totalDistance = flight.totalDistance as number;
        const distanceCovered = flight.distanceCovered as number;

        const originLoc = newLocMap.get(originId);
        const destLoc = newLocMap.get(destId);
        if (!originLoc || !destLoc) continue;

        // Get origin position at flight start time (approximate: current time minus elapsed)
        const elapsedTime = (flight.elapsedTime as number) ?? 0;
        const flightStartTime = Math.max(0, gameTime - elapsedTime);
        const originPos = getLocationPosition(
          originLoc,
          flightStartTime,
          newWorld
        );

        // Estimate remaining travel time to solve intercept
        const totalTime = (flight.totalTime as number) ?? 0;
        const remainingTime = Math.max(0, totalTime - elapsedTime);
        const arrivalGameTime = gameTime + remainingTime;

        // Get destination position at estimated arrival
        const interceptPos = getLocationPosition(
          destLoc,
          arrivalGameTime,
          newWorld
        );

        // Interpolate ship position based on progress
        const progress =
          totalDistance > 0 ? Math.min(1, distanceCovered / totalDistance) : 0;
        const shipPos = lerpVec2(originPos, interceptPos, progress);

        // Set 2D trajectory fields
        flight.originPos = originPos;
        flight.interceptPos = interceptPos;
        flight.shipPos = shipPos;
        flight.estimatedArrivalGameTime = arrivalGameTime;
      }
    }

    data.saveVersion = 7;
    return data;
  },

  /**
   * v7 → v8: Provisions rate rework + cantina removal.
   * - Provisions consumption changed from 30 to effective ~5 kg/crew/day
   *   (15 kg base minus 10 kg life support recycling).
   *   Scale existing provisionsKg by 5/30 to preserve survival days.
   * - Remove cantina rooms and galley job slots (feature removed).
   */
  7: (data: RawSave): RawSave => {
    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      const SCALE = 5 / 30;
      for (const ship of ships) {
        // Scale provisions to match new effective rate
        if (typeof ship.provisionsKg === 'number') {
          ship.provisionsKg = ship.provisionsKg * SCALE;
        }

        // Remove cantina rooms
        const rooms = ship.rooms as Array<Record<string, unknown>> | undefined;
        if (rooms) {
          ship.rooms = rooms.filter((r) => r.type !== 'cantina');
        }

        // Remove galley job slots
        const jobSlots = ship.jobSlots as
          | Array<Record<string, unknown>>
          | undefined;
        if (jobSlots) {
          ship.jobSlots = jobSlots.filter((j) => j.type !== 'galley');
        }
      }
    }

    data.saveVersion = 8;
    return data;
  },

  /**
   * v8 → v9: Fuel capacity decoupling.
   * - Fuel tanks are now independent of cargo capacity (shipClass.fuelCapacity).
   * - Update ship.maxFuelKg to match new dedicated fuel tank sizes.
   * - Refuel docked ships to new max; in-flight ships keep current fuel.
   */
  8: (data: RawSave): RawSave => {
    const FUEL_CAPACITIES: Record<string, number> = {
      station_keeper: 8_000,
      wayfarer: 150_000,
      corsair: 300_000,
      dreadnought: 500_000,
      phantom: 200_000,
      firebrand: 200_000,
      leviathan: 400_000,
    };

    const ships = data.ships as Array<Record<string, unknown>> | undefined;
    if (ships) {
      for (const ship of ships) {
        const classId = ship.classId as string;
        const newMax = FUEL_CAPACITIES[classId];
        if (newMax !== undefined) {
          ship.maxFuelKg = newMax;
          // Refuel docked ships generously; in-flight ships keep current fuel
          const loc = ship.location as Record<string, unknown> | undefined;
          if (loc?.status === 'docked') {
            ship.fuelKg = newMax;
          }
          // Cap in-flight fuel at new max (shouldn't exceed, but safety)
          if (typeof ship.fuelKg === 'number' && ship.fuelKg > newMax) {
            ship.fuelKg = newMax;
          }
        }
      }
    }

    data.saveVersion = 9;
    return data;
  },

  /**
   * v9 → v10: Ship roster and economy changes.
   * - Remove Corsair and Phantom ships (unimplemented combat/stealth mechanics).
   * - Dreadnought: replace armory with second mining_bay (industrial reframe).
   * - Leviathan: replace armory with second mining_bay.
   * - Regenerate world (Scatter ore update: rare_earth → platinum_ore).
   * - Regenerate job slots for DN/Lev (room changes).
   */
  9: (data: RawSave): RawSave => {
    const ships = data.ships as Array<Record<string, unknown>> | undefined;

    if (ships) {
      // Remove Corsair and Phantom ships
      const removedIds: string[] = [];
      data.ships = ships.filter((ship) => {
        const classId = ship.classId as string;
        if (classId === 'corsair' || classId === 'phantom') {
          removedIds.push(ship.id as string);
          return false;
        }
        return true;
      });

      // If active ship was removed, switch to first remaining ship
      if (removedIds.includes(data.activeShipId as string)) {
        const remaining = data.ships as Array<Record<string, unknown>>;
        data.activeShipId = remaining.length > 0 ? remaining[0].id : undefined;
      }

      // Clear selectedMiningOreId — ore distributions changed (Scatter: rare_earth → platinum_ore)
      for (const ship of data.ships as Array<Record<string, unknown>>) {
        ship.selectedMiningOreId = undefined;
      }

      // Update Dreadnought and Leviathan rooms: armory → mining_bay
      for (const ship of data.ships as Array<Record<string, unknown>>) {
        const classId = ship.classId as string;
        if (classId === 'dreadnought' || classId === 'leviathan') {
          const rooms = ship.rooms as
            | Array<Record<string, unknown>>
            | undefined;
          if (rooms) {
            // Find the armory room and change it to mining_bay
            const armoryRoom = rooms.find(
              (r) => (r.type as string) === 'armory'
            );
            if (armoryRoom) {
              armoryRoom.type = 'mining_bay';
            }
          }
        }
      }
    }

    // Regenerate world (picks up Scatter ore change + any location updates)
    data.world = generateWorld() as unknown as Record<string, unknown>;

    // Regenerate job slots for ships with changed rooms
    const gameDataTyped = data as unknown as GameData;
    if (gameDataTyped.ships) {
      for (const ship of gameDataTyped.ships) {
        if (ship.classId === 'dreadnought' || ship.classId === 'leviathan') {
          // Unassign all crew from old job slots before regeneration
          for (const crew of ship.crew) {
            const slot = ship.jobSlots.find(
              (s) => s.assignedCrewId === crew.id
            );
            if (slot) slot.assignedCrewId = null;
          }
          ship.jobSlots = generateJobSlotsForShip(ship);
        }
      }
    }

    data.saveVersion = 10;
    return data;
  },
};

/**
 * Detect the version of a raw save object. Saves created before the
 * versioning system have no `saveVersion` field — we inspect their shape to
 * determine whether they are migratable (v0) or too old to recover.
 *
 * Returns the version number, or -1 if the save is unrecoverable.
 */
function detectVersion(raw: RawSave): number {
  if (typeof raw.saveVersion === 'number') {
    return raw.saveVersion;
  }

  // No saveVersion field — check if this matches the v0 shape (fleet
  // architecture with required top-level fields and record-based quests).
  const hasFleet =
    Array.isArray(raw.ships) &&
    typeof raw.activeShipId === 'string' &&
    raw.credits !== undefined;
  const hasTopLevel =
    raw.gameTime !== undefined &&
    raw.availableQuests !== undefined &&
    raw.log !== undefined &&
    raw.lastTickTimestamp !== undefined &&
    raw.lastQuestRegenDay !== undefined;
  const hasRecordQuests =
    raw.availableQuests !== undefined && !Array.isArray(raw.availableQuests);

  if (hasFleet && hasTopLevel && hasRecordQuests) {
    return 0; // migratable v0
  }

  // Save is too old / structurally incompatible to migrate.
  return -1;
}

/**
 * Run the migration pipeline, upgrading the raw save from its detected
 * version to CURRENT_SAVE_VERSION.
 *
 * Returns null if the save cannot be migrated (version -1 or missing
 * migration step).
 */
function runMigrations(raw: RawSave): GameData | null {
  let version = detectVersion(raw);
  if (version === -1) {
    return null;
  }

  while (version < CURRENT_SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      console.error(
        `No migration defined for save version ${version} → ${version + 1}`
      );
      return null;
    }
    console.log(`Migrating save v${version} → v${version + 1}`);
    raw = migrate(raw);
    version = detectVersion(raw);
  }

  return raw as unknown as GameData;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadGame(): GameData | null {
  let data: string | null;
  try {
    data = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to read save from localStorage:', e);
    return null;
  }
  if (!data) return null;

  try {
    const raw = JSON.parse(data) as RawSave;
    const version = detectVersion(raw);

    if (version === -1) {
      console.warn(
        'Save data is from an ancient format that predates the migration ' +
          'system and cannot be recovered. Clearing save.'
      );
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Stash a backup of the raw save BEFORE running migrations.
    // If a migration bug corrupts data, the player can recover by
    // manually copying BACKUP_KEY → STORAGE_KEY in dev tools.
    if (version < CURRENT_SAVE_VERSION) {
      try {
        localStorage.setItem(BACKUP_KEY, data);
      } catch {
        // Quota exceeded — non-critical, proceed without backup.
      }
    }

    const migrated = runMigrations(raw);
    if (!migrated) {
      console.error('Save migration failed. Clearing save.');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Additive backfills (no version bump needed)
    backfillMiningData(migrated);
    backfillLedgerSnapshots(migrated);
    backfillRepairsSkill(migrated);
    backfillCrewFields(migrated);
    backfillGameDataFields(migrated);
    backfillFlightOriginBodyId(migrated);

    return migrated;
  } catch (e) {
    console.error('Failed to parse or migrate save data:', e);
    return null;
  }
}

/**
 * Additive backfill for mining-related data.
 * Adds miningAccumulator, miningRoute, mining_bay room, mining_ops job slots,
 * and ship mining equipment if missing.
 * No version bump needed — these are optional fields with safe defaults.
 */
function backfillMiningData(gameData: GameData): void {
  // Ship classes that should have mining_bay
  const MINING_BAY_CLASSES = new Set([
    'wayfarer',
    'corsair',
    'dreadnought',
    'firebrand',
    'leviathan',
  ]);

  for (const ship of gameData.ships) {
    // Backfill miningAccumulator
    if (!ship.miningAccumulator) {
      ship.miningAccumulator = {};
    }
    // Remove stale sentinel key that was incorrectly persisted in earlier versions
    delete (ship.miningAccumulator as Record<string, unknown>)[
      '_cargoFullLogged'
    ];

    // Backfill miningRoute
    if (ship.miningRoute === undefined) {
      ship.miningRoute = null;
    }

    // Backfill mining_bay room if this ship class should have one
    if (MINING_BAY_CLASSES.has(ship.classId)) {
      const hasMiningBay = ship.rooms.some((r) => r.type === 'mining_bay');
      if (!hasMiningBay) {
        ship.rooms.push({
          id: generateId(),
          type: 'mining_bay',
          state: 'operational',
        });
      }

      // Backfill ship mining equipment (mining_laser for wayfarer default)
      const hasShipMiningEquip = ship.equipment.some((eq) => {
        const MINING_IDS = [
          'mining_laser',
          'mining_rig',
          'deep_core_mining',
          'quantum_mining',
        ];
        return MINING_IDS.includes(eq.definitionId);
      });
      if (!hasShipMiningEquip) {
        ship.equipment.push({
          id: generateId(),
          definitionId: 'mining_laser',
          degradation: 0,
        });
      }
    }

    // Regenerate job slots to pick up mining_bay → mining_ops
    const hasMiningOps = ship.jobSlots.some((s) => s.type === 'mining_ops');
    if (!hasMiningOps && MINING_BAY_CLASSES.has(ship.classId)) {
      // Add mining_ops slots sourced from mining_bay room
      const miningBayRoom = ship.rooms.find((r) => r.type === 'mining_bay');
      if (miningBayRoom) {
        for (let i = 0; i < 2; i++) {
          ship.jobSlots.push({
            id: generateId(),
            type: 'mining_ops',
            assignedCrewId: null,
            sourceRoomId: miningBayRoom.id,
          });
        }
      }
    }

    // Remove any old crew mining equipment (from pre-refactor saves)
    const CREW_MINING_IDS = [
      'basic_mining_laser',
      'plasma_cutter',
      'sonic_drill',
      'fusion_excavator',
      'quantum_resonance_drill',
      'zero_point_extractor',
    ];
    for (const crew of ship.crew) {
      crew.equipment = crew.equipment.filter(
        (eq) => !CREW_MINING_IDS.includes(eq.definitionId)
      );
    }
    // Also remove from ship cargo
    ship.cargo = ship.cargo.filter(
      (item) => !CREW_MINING_IDS.includes(item.definitionId)
    );
  }
}

/**
 * Import game state from a JSON string (e.g. uploaded file).
 * Parses, migrates, backfills, persists, and returns the resulting GameData.
 * Returns null if the JSON is invalid or migration fails.
 */
export function importGame(json: string): GameData | null {
  let raw: RawSave;
  try {
    raw = JSON.parse(json) as RawSave;
  } catch {
    return null;
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const version = detectVersion(raw);
  if (version === -1) {
    return null;
  }

  const migrated = runMigrations(raw);
  if (!migrated) {
    return null;
  }

  backfillMiningData(migrated);
  backfillLedgerSnapshots(migrated);
  backfillRepairsSkill(migrated);
  backfillCrewFields(migrated);
  backfillGameDataFields(migrated);
  backfillFlightOriginBodyId(migrated);

  // Reset timestamp so the game doesn't try to catch up for offline time
  migrated.lastTickTimestamp = Date.now();

  saveGame(migrated);
  return migrated;
}

/**
 * Additive backfill for daily ledger snapshots.
 * No version bump needed — purely additive optional field.
 */
function backfillLedgerSnapshots(gameData: GameData): void {
  if (!gameData.dailyLedgerSnapshots) {
    gameData.dailyLedgerSnapshots = [];
  }
}

/**
 * Additive backfill for repairs skill.
 * Adds repairs: 0 to skills and repairs mastery state to all crew.
 * No version bump needed — additive with safe defaults.
 */
function backfillRepairsSkill(gameData: GameData): void {
  function backfillCrew(crew: GameData['ships'][0]['crew'][0]): void {
    // Backfill repairs skill (old saves won't have it)
    if (crew.skills.repairs === undefined) {
      // Safe mutation of deserialized JSON — the field simply doesn't exist yet
      (crew.skills as unknown as Record<string, number>).repairs = 0;
    }
    // Backfill repairs mastery
    if (!crew.mastery?.repairs) {
      if (!crew.mastery) {
        (crew as unknown as Record<string, unknown>).mastery = {};
      }
      (crew.mastery as unknown as Record<string, unknown>).repairs = {
        itemMasteries: {},
        pool: { xp: 0, maxXp: 0 },
      };
    }
  }

  for (const ship of gameData.ships) {
    for (const crew of ship.crew) {
      backfillCrew(crew);
    }
    // Backfill hireable crew too (stored on ship in older saves)
    const rawShip = ship as unknown as Record<string, unknown>;
    if (Array.isArray(rawShip.hireableCrew)) {
      for (const crew of rawShip.hireableCrew as GameData['ships'][0]['crew']) {
        backfillCrew(crew);
      }
    }
  }

  // Also backfill location-based hireable crew pools
  if (gameData.hireableCrewByLocation) {
    for (const crewList of Object.values(gameData.hireableCrewByLocation)) {
      for (const crew of crewList) {
        backfillCrew(crew);
      }
    }
  }
}

/**
 * Additive backfill for crew fields that may be missing in older saves.
 * Backfills zeroGExposure, unpaidTicks, and hireCost to prevent NaN propagation.
 * No version bump needed — additive with safe defaults.
 */
function backfillCrewFields(gameData: GameData): void {
  function backfillCrew(crew: GameData['ships'][0]['crew'][0]): void {
    if (crew.zeroGExposure === undefined || crew.zeroGExposure === null) {
      (crew as unknown as Record<string, unknown>).zeroGExposure = 0;
    }
    if (crew.unpaidTicks === undefined || crew.unpaidTicks === null) {
      (crew as unknown as Record<string, unknown>).unpaidTicks = 0;
    }
    if (crew.hireCost === undefined || crew.hireCost === null) {
      (crew as unknown as Record<string, unknown>).hireCost = 0;
    }
  }

  for (const ship of gameData.ships) {
    for (const crew of ship.crew) {
      backfillCrew(crew);
    }
  }

  if (gameData.hireableCrewByLocation) {
    for (const crewList of Object.values(gameData.hireableCrewByLocation)) {
      for (const crew of crewList) {
        backfillCrew(crew);
      }
    }
  }
}

/**
 * Additive backfill for GameData-level fields that may be missing in older saves.
 * Backfills lifetimeCreditsEarned to prevent NaN propagation.
 * No version bump needed — additive with safe defaults.
 */
function backfillGameDataFields(gameData: GameData): void {
  if (
    gameData.lifetimeCreditsEarned === undefined ||
    gameData.lifetimeCreditsEarned === null
  ) {
    (gameData as unknown as Record<string, unknown>).lifetimeCreditsEarned = 0;
  }
  // Fix NaN that may have already propagated from the missing field
  if (Number.isNaN(gameData.lifetimeCreditsEarned)) {
    (gameData as unknown as Record<string, unknown>).lifetimeCreditsEarned = 0;
  }
}

/**
 * Additive backfill for FlightState.originBodyId.
 * Determines whether each in-flight ship is a body-origin or redirect flight
 * by comparing the stored originPos against the origin body's position at the
 * estimated arrival time. For body-origin flights, these should nearly match
 * (since originPos was computed from the body at arrival time). For redirects,
 * the ship is mid-flight and far from the origin body.
 * No version bump needed — additive optional field.
 */
function backfillFlightOriginBodyId(gameData: GameData): void {
  for (const ship of gameData.ships) {
    const fp = ship.activeFlightPlan;
    if (fp && fp.originBodyId === undefined) {
      if (fp.originPos && fp.estimatedArrivalGameTime !== undefined) {
        const originLoc = gameData.world.locations.find(
          (l) => l.id === fp.origin
        );
        if (originLoc) {
          const bodyPos = getLocationPosition(
            originLoc,
            fp.estimatedArrivalGameTime,
            gameData.world
          );
          const dx = fp.originPos.x - bodyPos.x;
          const dy = fp.originPos.y - bodyPos.y;
          const distKm = Math.sqrt(dx * dx + dy * dy);
          // Body-origin flights: originPos was derived from this body at
          // arrival time, so positions should nearly match.
          // Redirects: ship is mid-flight, far from the origin body.
          if (distKm < 10_000) {
            fp.originBodyId = fp.origin;
          }
          // else: leave undefined — redirect flight (fixed origin point)
        } else {
          fp.originBodyId = fp.origin; // body not found — best effort
        }
      } else {
        // No 2D data (pre-orbital save) — default to body-origin
        fp.originBodyId = fp.origin;
      }
    }
  }
}

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(BACKUP_KEY);
}
