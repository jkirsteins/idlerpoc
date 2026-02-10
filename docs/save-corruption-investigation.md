# Save Data Corruption Investigation

Investigation of the codebase for potential save data corruption and state consistency bugs.
Severity ratings: **CRITICAL** (data loss/corruption likely), **HIGH** (corruption possible under specific conditions), **MEDIUM** (minor data inconsistency), **LOW** (theoretical/unlikely).

---

## BUG 1: Partial state mutation persists after tick errors (HIGH)

**Files:** `src/main.ts:1786-1802`, `src/main.ts:1641-1654`

When a tick throws an exception during `processPendingTicks()`, the error is caught and the save is correctly skipped. However, the in-memory `state.gameData` has already been partially mutated by the ticks that succeeded before the error. The `lastTickTimestamp` is also NOT updated (line 1804 is skipped by the early return at line 1801).

On the next interval (1 second later), `processPendingTicks()` runs again on the already-corrupted in-memory state. If subsequent ticks succeed, the corrupted state IS saved to localStorage, cementing the corruption.

**Reproduction:** Any tick exception (e.g., a null dereference in flight physics, missing world location) followed by a successful tick cycle.

**Impact:** Partially-mutated game state becomes the new save. Could manifest as ships with inconsistent location/contract state, missing flight plans, or NaN values in numeric fields.

**Fix:** Either (a) deep-clone `gameData` before each tick batch and revert on error, or (b) update `lastTickTimestamp` on error too (accepting the loss of failed ticks but preventing re-processing of already-mutated state).

---

## BUG 2: `onAdvanceDay` does not update `lastTickTimestamp` (HIGH)

**File:** `src/main.ts:771-884`

When the player clicks "Advance Day", up to 480 ticks are processed via `applyTick()` directly (line 826-828), but `lastTickTimestamp` is never updated. The save at line 883 persists the advanced `gameTime` with the stale `lastTickTimestamp`.

If the user closes the tab within the 1-second interval before `processPendingTicks` has a chance to run:
1. Saved state has `lastTickTimestamp` from before the day advance
2. On reload, `fastForwardTicks` computes elapsed real seconds from the stale timestamp
3. This produces catch-up ticks that overlap with the already-processed 480 ticks
4. Result: ~480 duplicate ticks (extra salary deductions, extra flight progress, extra encounters)

**Reproduction:** Click "Advance Day" → close tab immediately (within 1 second). This is especially likely on mobile (iOS Safari gesture navigation, pull-to-refresh).

**Impact:** Duplicate salary deductions (credits drained faster), duplicate flight progress, duplicate encounter rolls.

**Fix:** Add `state.gameData.lastTickTimestamp = Date.now()` in `onAdvanceDay` after processing the ticks (before the save at line 883).

---

## BUG 3: `onAdvanceDay` can advance game time by more than 1 day (MEDIUM)

**File:** `src/main.ts:825-835`

When an in-flight ship exists, `onAdvanceDay` runs 480 ticks (advancing `gameTime` by 86,400 game-seconds = 1 day), then calls `advanceToNextDayStart(gameData.gameTime)`. If the game time wasn't perfectly aligned to a day boundary before the advance, the combination overshoots:

- If `gameTime` was at day 5 + 12 hours, the 480 ticks advance to day 6 + 12 hours
- `advanceToNextDayStart` then rounds up to day 7 + 0 hours
- Total: 1.5 days advanced, but salary was only deducted for 1 day (480 ticks)

**Impact:** 0-1 extra days of game time without corresponding salary deduction. Minor economy imbalance that compounds over many day-advance clicks.

**Fix:** Either (a) skip `advanceToNextDayStart` when ticks are processed (ticks already advanced time), or (b) compute the remaining ticks needed to reach the next day boundary instead of a fixed 480.

---

## BUG 4: NaN/Infinity infection via JSON round-trip (HIGH)

**File:** `src/flightPhysics.ts:389-412`

`initializeFlight()` has a sanity check for `totalTime` (line 392-396) but does NOT validate `acceleration`, `burnTime`, `coastTime`, `currentVelocity`, or `distanceCovered`. If any flight state field becomes `NaN` or `Infinity`:

1. `JSON.stringify(NaN)` → `null` in JSON
2. `JSON.stringify(Infinity)` → `null` in JSON
3. On reload, these become `null` in the parsed object
4. Arithmetic with `null` produces `NaN` (e.g., `null + 180 = NaN`)
5. NaN propagates through all flight physics calculations
6. Ship becomes permanently stuck in flight with NaN position/velocity

The `advanceFlight()` function (line 514-584) performs arithmetic on all flight state fields without any NaN guards.

**Reproduction:** While unlikely in normal gameplay (since `currentMass` is always > 0 due to dry mass), edge cases like equipment removal during flight or migration bugs could produce degenerate values.

**Impact:** Permanent flight corruption — ship can never complete its flight, NaN persists through save/load cycles. Game becomes unplayable for that ship.

**Fix:** Add `Number.isFinite()` guards on all flight state fields in `initializeFlight()`, and add a NaN check at the start of `advanceFlight()` that force-completes corrupted flights.

---

## BUG 5: Double-drop mining loop is theoretically unbounded (LOW)

**File:** `src/miningSystem.ts:218-224`

```typescript
if (doubleDropChance > 0 && wholeUnits > 0) {
  for (let i = 0; i < wholeUnits; i++) {
    if (Math.random() < doubleDropChance) {
      wholeUnits++;
    }
  }
}
```

The loop condition checks `i < wholeUnits` each iteration, but `wholeUnits` is incremented inside the loop. Each successful double-drop extends the loop by 1 iteration. Mathematically, this is a geometric random variable with no upper bound.

At the current max `doubleDropChance` of 0.10 (mining pool 95% checkpoint), the expected extra units are ~11% of original, and the probability of the loop running more than 100 extra iterations is ~10^-100. In practice, this will never cause issues.

**Impact:** Theoretical infinite loop causing tab freeze. Probability is astronomically low with current tuning constants.

**Fix:** Cap the loop iterations: `const originalUnits = wholeUnits;` then `for (let i = 0; i < originalUnits; i++)`.

---

## BUG 6: `getActiveShip` non-null assertion can cascade to tick failure (MEDIUM)

**File:** `src/models/index.ts:520-522`

```typescript
export function getActiveShip(gameData: GameData): Ship {
  return gameData.ships.find((s) => s.id === gameData.activeShipId)!;
}
```

If `activeShipId` points to a non-existent ship (e.g., after a migration bug, or if ship deletion is ever added), this returns `undefined` cast as `Ship`. Any subsequent property access throws, triggering BUG 1 (partial state mutation).

`getActiveShip` is called extensively in UI code and in `onAdvanceDay`. A mismatch between `activeShipId` and the actual ships array would make the game unplayable.

**Impact:** Cascading TypeError that triggers partial state corruption (BUG 1).

**Fix:** Add a fallback: `return gameData.ships.find(...) ?? gameData.ships[0]` with a guard for empty fleet.

---

## BUG 7: Catch-up batch error double-counts ticksProcessed (LOW)

**File:** `src/main.ts:1641-1655`

When a tick fails during `processCatchUpBatch()`:
```typescript
activeCatchUp.ticksProcessed = activeCatchUp.totalTicks; // Jump to end
break;
// ... then:
activeCatchUp.ticksProcessed += processed; // Adds on top!
```

`ticksProcessed` becomes `totalTicks + processed`, overshooting the total. The `>=` check on line 1657 still terminates correctly, so the loop ends. But the catch-up report would contain incorrect tick counts.

**Impact:** Incorrect catch-up report statistics. No data corruption, but misleading UI.

**Fix:** Move the `+= processed` inside an `if (!tickError)` guard, or skip the `+= processed` when `ticksProcessed` was already jumped to `totalTicks`.

---

## BUG 8: Log entries bypass trimming via direct `push` (LOW)

**File:** `src/gameTick.ts:354-375, 408-413`

Several places in `applyShipTick` push log entries directly to `gameData.log` instead of using `addLog()`:
- Oxygen warnings (lines 354-375)
- Gravity threshold crossings (lines 408-413)

`addLog()` enforces the 200-entry cap with trimming. Direct pushes bypass this. During normal gameplay, these threshold events fire rarely (only when crossing specific oxygen/gravity levels), so the impact is minimal. But in pathological cases (rapid oxygen cycling), the log could grow slightly beyond the cap.

**Impact:** Log array grows slightly beyond MAX_LOG_ENTRIES between trim cycles. Minimal localStorage impact since `addLog` is called frequently enough by other systems to trigger trimming.

**Fix:** Replace `gameData.log.push({...})` with `addLog(gameData.log, ...)` calls.

---

## BUG 9: `orbiting` status doesn't clear `dockedAt` (LOW)

**File:** `src/contractExec.ts:307-309`

When a manual flight completes and `dockOnArrival` is false:
```typescript
ship.location.status = 'orbiting';
ship.location.orbitingAt = destination.id;
// Note: dockedAt is NOT explicitly deleted
```

In practice, `startShipFlight()` already deletes both `dockedAt` and `orbitingAt` when the flight starts (line 434-435), so `dockedAt` is already absent by the time `completeLeg` runs. However, if a future code path sets a ship to orbiting without going through `startShipFlight`, stale `dockedAt` data could persist.

**Impact:** No current impact due to `startShipFlight` cleanup. Latent risk for future changes.

**Fix:** Add `delete ship.location.dockedAt;` when setting orbiting status in `completeLeg`.

---

## NOT A BUG: World regeneration in v1→v2 migration

**File:** `src/storage.ts:209`

The v1→v2 migration calls `generateWorld()` to replace the world. Initial concern was that this could orphan ship location references. However, `worldGen.ts` uses hardcoded deterministic location IDs (e.g., `'earth'`, `'leo_station'`, `'mars'`), so regeneration produces identical IDs. Ship references remain valid.

---

## NOT A BUG: `backfillMiningData` runs on every load

**File:** `src/storage.ts:326, 341-432`

This function runs on every load, not just after migrations. However, it's idempotent — it only adds missing data and uses `if (!hasX)` guards. The old crew mining equipment removal (`CREW_MINING_IDS`) doesn't overlap with any valid crew equipment IDs. Safe.

---

## Summary by Severity

| # | Bug | Severity | User Impact |
|---|-----|----------|-------------|
| 1 | Partial state mutation persists after tick errors | HIGH | Corrupted save after any tick exception |
| 2 | `onAdvanceDay` stale `lastTickTimestamp` | HIGH | Duplicate ticks on reload after day advance |
| 4 | NaN/Infinity infection via JSON round-trip | HIGH | Permanently stuck ships |
| 3 | `onAdvanceDay` overshoots game time | MEDIUM | Minor economy imbalance |
| 6 | `getActiveShip` non-null assertion cascade | MEDIUM | Cascading crash → triggers BUG 1 |
| 5 | Unbounded double-drop mining loop | LOW | Theoretical tab freeze |
| 7 | Catch-up batch double-counts ticks | LOW | Wrong catch-up report stats |
| 8 | Log entries bypass trimming | LOW | Slight log overgrowth |
| 9 | `orbiting` status doesn't clear `dockedAt` | LOW | Latent risk, no current impact |
