# Save Data Migration Architecture

Save data must never be lost or corrupted. When the persisted `GameData` shape changes, a migration function upgrades old saves to the new format.

## Versioning scheme

- Every save carries a `saveVersion: number` field.
- `CURRENT_SAVE_VERSION` in `src/storage.ts` is the version that new games are created with and that `loadGame()` expects after all migrations have run.
- Saves created before the versioning system (no `saveVersion` field) are detected by structural inspection and assigned version 0 if they match the known v0 shape.

## How migrations work

1. `loadGame()` parses the raw JSON from localStorage.
2. `detectVersion()` determines the save's version (explicit field, or structural detection for legacy saves).
3. `runMigrations()` loops from the detected version up to `CURRENT_SAVE_VERSION`, applying one migration function per step.
4. Each migration is a pure function `(RawSave) => RawSave` keyed by its **source** version in the `migrations` record.

## Adding a new migration

When a change alters the persisted shape in a non-additive way:

1. **Bump** `CURRENT_SAVE_VERSION` (e.g. 1 → 2).
2. **Add** a migration entry keyed by the old version:
   ```ts
   1: (data: RawSave): RawSave => {
     // transform data from v1 shape to v2 shape
     data.saveVersion = 2;
     return data;
   },
   ```
3. **Test** by loading a save at the old version and verifying it round-trips correctly.

## When a version bump is NOT needed

Purely additive optional fields with safe defaults can be backfilled without a version bump. For example, adding `ship.newOptionalField?: string` and defaulting it to `undefined` on load doesn't require a migration — just add a backfill check inside the latest migration or as a post-migration step.

## Pre-versioning saves

Saves that predate the fleet architecture (no `ships` array, no `activeShipId`, array-format quests, etc.) are too structurally different to migrate. These return version -1 from `detectVersion()` and are cleared with a console warning. This only affects saves from the earliest PoC iterations before the migration system was introduced.

## Version history

| Version | Description                                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0       | Implicit. Fleet architecture saves with no `saveVersion` field. Backfills time system, ship metrics, oxygen, flight profile, and visited locations.                   |
| 1       | First explicit version. Identical shape to migrated v0 but with `saveVersion: 1` stamped on save.                                                                     |
| 2       | Skill revamp: 7 skills → 3 (piloting, mining, commerce), 8 roles → 4, mastery system, oreCargo, world regeneration with mining destinations.                          |
| 3       | Crew service records: adds `hiredAt`, `boardedShipAt`, and optional `hiredLocation` to all crew members. Existing crew backfilled with epoch (0).                     |
| 4       | Crew salary multiplier: adds `salaryMultiplier` to all crew members. Existing crew backfilled with 1.0 (base rate). Enables skill-based salary scaling for new hires. |
