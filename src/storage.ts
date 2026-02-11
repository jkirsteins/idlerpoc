import type { GameData } from './models';
import { generateWorld } from './worldGen';
import { generateJobSlotsForShip } from './jobSlots';
import { generateId } from './utils';

const STORAGE_KEY = 'spaceship_game_data';
const BACKUP_KEY = 'spaceship_game_data_backup';

/**
 * Current save format version. Bump this whenever a change to the persisted
 * GameData shape requires a migration (not needed for purely additive optional
 * fields that can be backfilled with safe defaults).
 *
 * See docs/save-migration.md for the full migration architecture.
 */
export const CURRENT_SAVE_VERSION = 4;

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

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(BACKUP_KEY);
}
