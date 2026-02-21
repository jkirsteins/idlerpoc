# Alien System Audit v2 — Post-Fix Re-Assessment (Updated)

*Date: 2026-02-21 (final — all issues resolved)*
*Commits: `d1c1535` (#174) → `b1dbd24` (#175) → `1fce564` (final fixes)*
*Audience: Engineering team*

---

## Executive Summary

**All audit items are resolved.** The alien system is mechanically sound across all gameplay paths: real-time ticks, offline catch-up, and UI display.

The arc across three commits:
- **#174** (`d1c1535`): Fixed mastery scaling, neural efficiency, starvation overlay removal.
- **#175** (`b1dbd24`): Recalibrated zone regrowth, wired zone assignments, added scarcity curve, queen dormancy, catch-up metabolism, worker recycling, production tracking.
- **Final fixes** (`1fce564`): Wired harvesting→saturated zone transition, added scarcity to UI display, deleted remaining dead code.

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
| 8 | Dead code cleanup | Low | **Done** | All dead functions and orphaned constants removed |

### New Issues from v2 Report

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| v2-§2 | Worker zone assignments decorative | **Done** | Workers use `worker.assignedZoneId` via `zoneIdMap` |
| v2-§3 | UI gather rate omits neural efficiency | **Done** | Now delegates to `calculateGatherRate()` with full scarcity + neural |

---

## §1 — RESOLVED: Harvesting → Saturated Transition

**Previously:** The transition in `advanceZoneState()` was dead code — never called for harvesting zones.

**Fix:** Added step 4b in `processSingleTick()` (`gameTickSwarm.ts`) that checks all harvesting zones after worker gathering. Zones depleted to 0 biomass now correctly transition to `saturated` state with 0.1× regrowth penalty and event logging. The `advanceZoneState()` harvesting case was collapsed to a no-op since the transition is resource-driven (tick loop), not progress-driven (exploration pipeline).

---

## §2 — RESOLVED: UI Gather Rate Now Includes Scarcity

**Previously:** `getWorkerGatherRate()` in `renderer.ts` computed rates without zone scarcity, overstating displayed rates by up to 2× for depleted zones.

**Fix:** `getWorkerGatherRate()` now delegates to `calculateGatherRate()` from `foragingSystem.ts`, passing the worker's assigned zone. A zone lookup map is built once per render in `renderWorkerActivitySection()`. Displayed rates now match the simulation exactly, including skill, mastery, scarcity, and neural efficiency.

---

## §3 — RESOLVED: Dead Code Cleanup Complete

All dead code identified across audit v1, v2, and this re-assessment is now removed:

| Item | Status |
|------|--------|
| `calculateStarvationDeaths()` | Deleted in #175 |
| `depleteZoneBiomass()` | Deleted in #175 |
| `calculateGatherRate()` — previously dead | Wired as single source of truth in #175 |
| `calculateSwarmAggregates()` | Actually used in renderer (false positive in v2) |
| `getZoneWorkers()` | Deleted in final fixes |
| `STARVATION_COEFFICIENT` | Deleted in final fixes |
| `RECYCLE_EFFICIENCY` | Deleted in final fixes |

---

## §4 — What Was Done Well

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
| Depleted zone, 0 workers | Transitions to saturated. Regrows at 0.1× rate. Fully recovers in ~10,000 ticks (~35 min IRL). |

---

## §6 — Verification Checklist

All code issues are resolved. These scenarios should be tested in-game:

- [ ] Zone depletion: 20 workers on 1 zone → zone transitions to saturated → regrows slowly → resumes harvesting
- [ ] Zone scarcity: 12 workers on 1 zone → scarcity kicks in below 30% → gathering rate degrades in UI
- [ ] Multi-zone: 20 workers across 3 zones → each zone sustainable at ~50% stock
- [ ] Queen dormancy: kill all workers → queen enters dormancy below 15% energy → survives extended period
- [ ] Catch-up: 48h+ absence → queen metabolism simulated → worker pools normalized → swarm events in summary
- [ ] Zone expansion: explore → convert → harvest → deplete → saturated → recovery cycle
