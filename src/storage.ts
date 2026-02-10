import type { GameData } from './models';

const STORAGE_KEY = 'spaceship_game_data';

/**
 * Current save format version. Bump this whenever a change to the persisted
 * GameData shape requires a migration (not needed for purely additive optional
 * fields that can be backfilled with safe defaults).
 *
 * See docs/save-migration.md for the full migration architecture.
 */
export const CURRENT_SAVE_VERSION = 1;

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

  // Future migrations go here:
  // 1: (data) => { /* v1 → v2 */ data.saveVersion = 2; return data; },
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

    const migrated = runMigrations(raw);
    if (!migrated) {
      console.error('Save migration failed. Clearing save.');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return migrated;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}
