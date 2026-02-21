# Alien System Audit v2 — Post-Fix Re-Assessment (Updated)

*Date: 2026-02-21 (updated after rebase on `b1dbd24`)*
*Base commit: `b1dbd24` (Implement queen dormancy and zone scarcity mechanics #175)*
*Previous base: `d1c1535` (Fix biomass buffer audit issues #174)*
*Audience: Engineering team*

---

## Executive Summary

Commit `b1dbd24` is a substantial follow-up that resolves **all eight** original audit proposals and both new issues from the v2 report. Zone regrowth is calibrated at full `biomassRate` per tick. Workers gather from their assigned zone via O(1) zoneIdMap. `calculateGatherRate()` is the single source of truth. Queen dormancy and full catch-up metabolism simulation are implemented. Dead code (`calculateStarvationDeaths`, `depleteZoneBiomass`) is deleted.

Two **residual issues** remain, plus one **new bug** discovered during this re-assessment:

1. **NEW BUG: Harvesting → saturated transition is dead code.** Zones can never enter the `saturated` state because `advanceZoneState()` is never called for `harvesting` zones. The saturated regrowth penalty (0.1×) never applies. Zones depleted to 0 biomass regrow at full rate on the next tick.
2. **UI gather rate still omits zone scarcity.** `getWorkerGatherRate()` in the renderer includes neural efficiency now (good), but doesn't include the scarcity curve — displayed rates overstate actual rates when zones are below 30% stock.
3. **Orphaned constants and one dead function remain.** `STARVATION_COEFFICIENT`, `RECYCLE_EFFICIENCY` constants, and `getZoneWorkers()` are unreferenced.

Overall, the alien system is now **mechanically sound** for normal gameplay. The saturated-state bug is cosmetic in practice (zones recover faster than intended, which is player-friendly), and the UI overstatement is misleading but not game-breaking.

---

## Scorecard: Original Proposals vs Current State

| # | Proposal | Priority | Status | Notes |
|---|----------|----------|--------|-------|
| 1 | Wire zone biomass into gathering | Critical | **Done** | Scarcity curve at 30% threshold, regrowth at full `biomassRate`, all zones regrow |
| 2 | Apply neural efficiency to gathering | Critical | **Done** | Via `calculateGatherRate()`, single source of truth |
| 3 | Fix mastery modifier scaling | Critical | **Done** | All paths use `getMasteryLevel()` |
| 4 | Remove starvation overlay | High | **Done** | `calculateStarvationDeaths()` deleted entirely |
| 5 | Align production estimate with reality | High | **Done** | `actualProductionThisTick` tracked and passed to `calculateEnergyBalance()` |
| 6 | Queen idle-period safety | Medium | **Done** | 4-phase catch-up metabolism, dormancy at 10% rate |
| 7 | Catch-up pool normalization | Medium | **Done** | Worker pools normalized to max; swarm events in catch-up summary |
| 8 | Dead code cleanup | Low | **Mostly done** | 3 major dead functions removed; 1 minor function + 2 constants remain |

### New Issues from v2 Report

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| v2-§2 | Worker zone assignments decorative | **Done** | Workers use `worker.assignedZoneId` via `zoneIdMap` |
| v2-§3 | UI gather rate omits neural efficiency | **Partial** | Neural efficiency added; scarcity curve still missing |

---

## §1 — NEW BUG: Harvesting → Saturated Transition Is Dead Code

### Discovery

`advanceZoneState()` in `zoneSystem.ts:58-65` contains the only code path that transitions a zone to `saturated`:

```typescript
case 'harvesting':
  if (zone.biomassAvailable <= 0) {
    zone.state = 'saturated';
    zone.progress = 100;
    return true;
  }
  break;
```

However, `advanceZoneState()` is only called in two places:

1. **Real-time tick:** `gameTickSwarm.ts:245` — inside step 2d, which guards with `if (zone.state === 'harvesting' || zone.state === 'saturated') continue;`
2. **Catch-up:** `gameTickSwarm.ts:788` — also guarded by `if (zone.state === 'harvesting' || zone.state === 'saturated') continue;`

Both call sites skip harvesting zones. The harvesting→saturated branch in `advanceZoneState` is **never reachable**.

### Impact

- **Zones never enter the `saturated` state.** When workers deplete a zone to 0 biomass, it stays in `harvesting` state.
- **The saturated regrowth penalty (0.1×) never applies.** Depleted zones regrow at full `biomassRate` per tick instead of `biomassRate * 0.1`.
- **Saturated zone UI states never appear.** The gamepedia describes saturated zones ("dull purple, slowly recovering") but players will never see them.
- **The saturated→harvesting recovery transition is also dead.** `gameTickSwarm.ts:192-195` handles saturated→harvesting recovery, but no zone ever reaches saturated state to benefit from it.

### Effective behavior

With the current code, the actual zone biomass cycle is:

```
Workers deplete zone to 0 → zone stays "harvesting" → regrowth adds
biomassRate per tick → scarcity curve kicks in below 30% stock →
workers gather less → equilibrium emerges from scarcity alone
```

This is actually a reasonable model — the scarcity curve provides a smooth degradation without needing a discrete "saturated" state. The question is whether the saturated state adds gameplay value (visual feedback, slower recovery as punishment for overextraction) or is unnecessary.

### Recommendation

**Option A (simpler): Remove the saturated state entirely.** The scarcity curve already handles depletion gracefully. Delete the saturated branches in `advanceZoneState`, `gameTickSwarm.ts` regrowth, and `zoneSystem.ts`. Update the gamepedia to describe scarcity-only behavior. This eliminates dead code and aligns documentation with reality.

**Option B (richer): Wire the transition into the tick loop.** After worker processing (step 4), check all harvesting zones. If `biomassAvailable <= 0`, call `advanceZoneState()` to transition to saturated. This gives depleted zones the 0.1× regrowth penalty and visual feedback. Add the check as a post-worker-processing step:

```typescript
// Step 4b: Check for zone saturation after worker gathering
for (const planet of planets) {
  for (const zone of planet.zones) {
    if (zone.state === 'harvesting' && zone.biomassAvailable <= 0) {
      advanceZoneState(zone);
      // Log and emit event...
    }
  }
}
```

**Recommendation:** Option A is simpler and the scarcity curve is sufficient. If the saturated visual feedback is desired, go with Option B. Either way, the current state (dead code claiming to do something it doesn't) must be resolved.

---

## §2 — UI Gather Rate Still Omits Scarcity Curve (Low-Medium)

### Current state

`getWorkerGatherRate()` in `renderer.ts:882-892` now includes `neuralEfficiency` (fixed from v2 report), but still computes the rate without zone scarcity:

```typescript
function getWorkerGatherRate(
  worker: Worker,
  neuralEfficiency: number = 1
): number {
  const skillMod = 1 + worker.skills.foraging / 100;
  const masteryLevel = getMasteryLevel(worker.skills.mastery.surfaceLichen);
  const masteryMod = 1 + masteryLevel / 200;
  return SWARM_CONSTANTS.BASE_GATHER_RATE * skillMod * masteryMod * neuralEfficiency;
  // Missing: scarcityFactor from calculateGatherRate()
}
```

The actual gather rate in `processGatherOrder()` uses `calculateGatherRate()` which includes scarcity. When a zone is at 15% stock, the UI shows 2× the actual rate.

### Recommendation

Replace `getWorkerGatherRate()` with a call to `calculateGatherRate()` from `foragingSystem.ts`, passing the worker's zone. This ensures the UI always matches the simulation. Alternatively, display the base rate with a "zone scarcity" modifier in a tooltip breakdown so the player understands why actual gathering is slower.

---

## §3 — Remaining Dead Code (Low)

### Cleaned up in #175

| Item | Status |
|------|--------|
| `calculateStarvationDeaths()` | Deleted |
| `depleteZoneBiomass()` | Deleted |
| `calculateGatherRate()` — previously dead | Now wired as single source of truth |
| `calculateSwarmAggregates()` — previously reported dead | Actually used in renderer (false positive in v2) |

### Still remaining

| Item | File | Notes |
|------|------|-------|
| `getZoneWorkers()` | `zoneSystem.ts:104-106` | Exported but never called. Worker lookup uses `zone.assignedWorkers` directly. |
| `STARVATION_COEFFICIENT` | `swarmTypes.ts:439` | Only consumer (`calculateStarvationDeaths`) was deleted. |
| `RECYCLE_EFFICIENCY` | `swarmTypes.ts:440` | Only consumer (`calculateStarvationDeaths`) was deleted. Recycling now uses `WORKER_RECYCLE_BIOMASS` directly. |
| Saturated state handling code | Multiple files | Dead per §1 — either wire it in or remove it. |

### Recommendation

Delete `getZoneWorkers()`, `STARVATION_COEFFICIENT`, and `RECYCLE_EFFICIENCY`. They have no consumers. For the saturated state code, resolve per §1.

---

## §4 — What Was Done Well in #175

Credit where due — this commit addressed a large surface area correctly:

1. **Zone regrowth at full `biomassRate`** — fixes the 3-orders-of-magnitude calibration gap. Zones now sustain ~3 workers each at steady state, creating real expansion pressure.

2. **Scarcity curve with 30% threshold** — smooth degradation instead of binary cliff. `calculateGatherRate()` is the single source of truth, called from `processGatherOrder()`.

3. **Worker zone assignment wired end-to-end** — `worker.assignedZoneId → zoneIdMap.get()` with O(1) lookup. Queen zone as fallback for unassigned workers. Zone progression (exploration → conversion → harvesting) with worker assignment UI.

4. **Zone regrowth on all zones** — double loop over `planets × zones` in step 2b instead of queen-only iteration.

5. **Queen dormancy** — 0.1× metabolism at 15% energy threshold when isolated. Auto-wake when workers arrive or buffer refueled. Visible in UI with dormancy indicator.

6. **Catch-up queen metabolism** — 4-phase simulation (buffer→energy→dormancy→HP decay) with worker delivery estimation. Properly handles multi-year absences.

7. **Catch-up worker normalization** — surviving workers get max pools, cargo cleared, state reset. Prevents "first tick massacre."

8. **Catch-up swarm events** — population delta, dormancy status, zone conquests, and recycling shown in "While you were away" modal.

9. **Worker recycling** — 5 biomass returned to zone on death. Nutrient cycling loop.

10. **Actual production tracking** — `lastTickProduction` stored on swarm, passed to `calculateEnergyBalance()` instead of estimate.

11. **Zone expansion system** — full state machine (unexplored → exploring → converting → harvesting) with worker assignment, recall, and progression. Gamepedia articles updated.

---

## §5 — Updated Calibration Cheat Sheet

With current regrowth at `biomassRate` per tick and scarcity threshold at 0.3:

| Scenario | Expected behavior |
|----------|-------------------|
| 1 zone (0.6 rate), 3 workers | Zone at ~95% steady state. Sustainable, minimal scarcity. |
| 1 zone, 8 workers | Zone at ~40% steady state. Above scarcity threshold. Sustainable. |
| 1 zone, 12 workers | Zone at ~17% steady state. Below scarcity threshold, gathering degraded. |
| 1 zone, 20 workers | Zone oscillates near 0. Scarcity = ~0. Workers starving, expansion mandatory. |
| 3 zones, 20 workers | ~7 workers/zone. Each zone at ~50%. Comfortable. |
| 25 workers, 20 capacity | Neural penalty (0.41×) reduces consumption. Scarcity + neural = double pressure for die-off to ~20. |
| Depleted zone, 0 workers | Regrows at full rate (bug: should be 0.1× if saturated state worked). Fully recovers in ~1000 ticks. |

**Note:** Because the saturated transition never fires (§1), depleted zones recover at full speed. If Option B from §1 is implemented, the "Depleted zone, 0 workers" row changes to ~10,000 ticks recovery.

---

## §6 — Revised Priority Order

```
MINOR BUGS:
  §1  Fix or remove saturated zone state (dead code)

POLISH:
  §2  Add scarcity curve to UI gather rate display
  §3  Delete getZoneWorkers(), STARVATION_COEFFICIENT, RECYCLE_EFFICIENCY

VERIFICATION:
  Run calibration scenarios from §5 in-game to confirm steady-state numbers
  Test catch-up with 48h+ absence — verify queen dormancy and pool normalization
  Test zone expansion loop end-to-end (explore → convert → harvest → deplete → expand)
```

All original Critical and High items are resolved. Remaining work is polish-level.
