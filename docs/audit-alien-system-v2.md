# Alien System Audit v2 — Post-Fix Re-Assessment

*Date: 2026-02-20*
*Base commit: `d1c1535` (Fix biomass buffer audit issues: mastery scaling, zone depletion, neural efficiency)*
*Audience: Engineering team*

---

## Executive Summary

Commit `d1c1535` addressed three of the eight original proposals fully, two partially, and left three untouched. It also introduced two new issues: a **zone assignment bypass** (workers gather from queen's zone, not their assigned zone) and a **regrowth calibration gap** (zones deplete in ~150 ticks for 20 workers and can sustain ~0.03 workers on regrowth alone).

The metabolism cascade is now the sole death mechanism (correct). Neural efficiency constrains gathering (correct). Mastery scaling is fixed (correct). But the zone biomass loop — while wired in — is numerically broken, and offline/catch-up handling remains unaddressed.

---

## Scorecard: Original Proposals vs Current State

| # | Proposal | Priority | Status | Notes |
|---|----------|----------|--------|-------|
| 1 | Wire zone biomass into gathering | Critical | **Partial** | Wired but numerically broken (see §1) |
| 2 | Apply neural efficiency to gathering | Critical | **Done** | Correctly pre-computed and passed per tick |
| 3 | Fix mastery modifier scaling | Critical | **Done** | All 3 locations use `getMasteryLevel()` |
| 4 | Remove starvation overlay | High | **Done** | Step 6 removed; cascade is sole death path |
| 5 | Align production estimate with reality | High | **Partial** | Mastery added to estimate; still an estimate (see §5) |
| 6 | Queen idle-period safety | Medium | **Open** | No catch-up metabolism, no dormancy |
| 7 | Catch-up pool normalization | Medium | **Open** | No swarm events in catch-up report |
| 8 | Dead code cleanup | Low | **Partial** | `QUEEN_UPKEEP` removed, `Date.now()` fixed; 3 dead functions remain |

---

## §1 — Zone Biomass: Wired but Numerically Broken (Critical)

### What was fixed

Zone depletion is now inline in `processGatherOrder` (`swarmSystem.ts:542-545`):

```typescript
if (zone) {
  gatherRate = Math.min(gatherRate, zone.biomassAvailable);
  zone.biomassAvailable -= gatherRate;
}
```

Zone regrowth runs once per tick in `gameTickSwarm.ts:176-182`, before gathering.

### What remains broken

**The regrowth rate makes zones unsustainable for any meaningful population.**

Starting zone (Asimov) calibration:

| Parameter | Value | Source |
|-----------|-------|--------|
| `baseBiomassRate` | 0.5 | `trappist1Data.ts:84` |
| After env modifiers | ~0.6 | temperate × atmosphere × biome |
| `biomassAvailable` (initial) | 600 | `biomassRate * 1000` |
| Regrowth per tick | 0.006 | `biomassRate * 0.01` |
| Worker consumption per tick | 0.2 | `BASE_GATHER_RATE` (before modifiers) |

**Depletion timeline for 20 workers:**

- Total consumption: 20 × 0.2 = **4.0/tick** (minimum, before skill/mastery bonuses)
- Stock of 600 lasts: 600 / 4.0 = **150 ticks** (~2.5 minutes IRL)
- Regrowth can sustain: 0.006 / 0.2 = **0.03 workers**

Once depleted, the zone is essentially dead. Regrowth is three orders of magnitude too slow to support even a single worker. The "expansion pressure" that zones should create never manifests as a gradient — it's a cliff. Workers gather at full speed until the zone hits 0, then they all starve simultaneously.

### What to do

Two knobs need adjustment. Pick the approach that preserves existing data scale:

**Option A — Increase regrowth rate (recommended).** Change regrowth from `biomassRate * 0.01` to `biomassRate` (full rate per tick). This was the field's documented intent ("Surface lichen growth per tick"). With a 0.6 rate, the zone sustains 0.6/0.2 = 3 workers at full efficiency. With 3 zones, that's 9 workers — below neural cap, creating real expansion pressure.

**Option B — Decrease `BASE_GATHER_RATE`.** Reduce worker consumption so it matches the regrowth scale. This changes the gathering UX cadence (cargo fills more slowly).

**Additionally, add a scarcity curve.** The current model is binary: full gather rate until 0 biomass, then nothing. Add a scarcity factor so gathering degrades proportionally as the zone depletes:

```
scarcityFactor = min(1, biomassAvailable / (maxBiomass * SCARCITY_THRESHOLD))
```

With `SCARCITY_THRESHOLD = 0.3`, gathering runs at full speed while the zone is above 30% stock, then degrades linearly. This gives players a visible warning period before collapse.

**Calibration target:** Starting zone sustains ~10-15 workers at steady state. Neural cap (20) requires 2-3 harvesting zones. This makes zone expansion the gating factor for growth — a real gameplay loop, not a decorative number.

### Anti-pattern reminder

Do NOT "fix" this by adding a `zone.maxWorkers` cap or a `workerGatherCooldown`. The constraint must emerge from the biomass economy: regrowth rate vs consumption rate → carrying capacity. Hardcoded caps bypass the simulation.

---

## §2 — NEW ISSUE: Worker Zone Assignments Are Decorative

### Discovery

`gameTickSwarm.ts:270` resolves each worker's gathering zone via `queenZoneCache.get(queen.id)`:

```typescript
// Look up the queen's zone (reuses cache built in step 2b)
const zone = queenZoneCache.get(queen.id);
const tickResult = processWorkerTick(worker, queen, zone, efficiency);
```

This means **all workers under a queen gather from the queen's `locationZoneId`**, regardless of `worker.assignedZoneId`. The entire zone assignment system (`assignWorkerToZone`, `unassignWorkerFromZone`, `worker.assignedZoneId`, `zone.assignedWorkers[]`) is operational plumbing that does nothing.

### Impact

- The UI lets players assign workers to zones, but assignments have no effect on gathering
- Zone depletion is concentrated on a single zone (the queen's) instead of distributed
- The expansion loop (explore → convert → assign workers → harvest) is broken at the last step
- Zone regrowth only runs for the queen's zone (step 2b iterates queens, not zones), so non-queen zones never regrow even if they somehow got depleted

### What to do

**Workers should gather from their assigned zone, not the queen's zone.** Change the zone lookup in step 4 from:

```typescript
const zone = queenZoneCache.get(queen.id);
```

to:

```typescript
const zone = worker.assignedZoneId
  ? findZoneById(planets, worker.assignedZoneId)
  : queenZoneCache.get(queen.id);  // fallback for unassigned workers
```

**Regrowth must run on all harvesting zones, not just queen zones.** Replace the queen-iteration loop in step 2b with a loop over all zones in `harvesting` state across all planets:

```typescript
for (const planet of planets) {
  for (const zone of planet.zones) {
    if (zone.state === 'harvesting' && zone.biomassRate > 0) {
      // regrowth logic
    }
  }
}
```

Build a `Map<string, Zone>` (zone ID → zone) for O(1) lookup during worker processing.

### Anti-pattern reminder

Do NOT skip the zone lookup for "performance" and keep using the queen's zone. The per-worker zone lookup is O(zones) per worker per tick. If this is a concern, build a zone-ID map once per tick (O(zones)) and do O(1) lookups per worker. Do NOT optimize by removing the feature.

---

## §3 — NEW ISSUE: UI Gather Rate Omits Neural Efficiency

### Discovery

`renderer.ts:880-885` displays gather rate per worker:

```typescript
function getWorkerGatherRate(worker: Worker): number {
  const skillMod = 1 + worker.skills.foraging / 100;
  const masteryLevel = getMasteryLevel(worker.skills.mastery.surfaceLichen);
  const masteryMod = 1 + masteryLevel / 200;
  return SWARM_CONSTANTS.BASE_GATHER_RATE * skillMod * masteryMod;
  // Missing: * neuralEfficiency
}
```

The actual gather rate in `processGatherOrder` includes `* neuralEfficiency`. With 25 workers and 20 neural capacity, efficiency = 1/(1.25^4) ≈ 0.41. The UI shows 0.2/tick but the worker actually gathers 0.08/tick — a 2.4× overstatement.

### What to do

Pass the current `neuralEfficiency` value into the renderer (it's already computed per tick in `processSingleTick`). Either:

- Add it to swarm aggregates / game state so the renderer can read it, or
- Compute it in the renderer from `workers.length / neuralCapacity`

Display format should show the base rate and the efficiency penalty separately so the player understands why their workers are slower. Per CLAUDE.md tooltip guidelines, the breakdown should be visible.

---

## §4 — Dead Code Inventory (Low Priority, but Growing)

The fix commit addressed some dead code but introduced new dead code via bypass. Current inventory:

| Function | File | Status | Notes |
|----------|------|--------|-------|
| `calculateGatherRate()` | `foragingSystem.ts` | Dead | Never called. `processGatherOrder` computes inline. |
| `depleteZoneBiomass()` | `zoneSystem.ts` | Dead | Never called. `processGatherOrder` depletes inline. |
| `calculateStarvationDeaths()` | `populationSystem.ts` | Dead | Never called. Starvation overlay removed. |
| `getZoneWorkers()` | `zoneSystem.ts` | Dead* | Only meaningful if zone assignments are wired in. |
| `calculateSwarmAggregates()` | `swarmSystem.ts` | Dead | Was `void`-called, now removed from imports. |

**Recommendation:** Either delete these or wire them in. Specifically:

- `calculateGatherRate()` should **replace** the inline calculation in `processGatherOrder` — it already includes zone efficiency and neural efficiency with proper modifier breakdown. This is the single-source-of-truth fix from the original audit.
- `depleteZoneBiomass()` should **replace** the inline depletion — but first strip the regrowth from it (regrowth belongs in the tick loop, not in the depletion function).
- `calculateStarvationDeaths()` should be **deleted**. The overlay is gone and should not return.

---

## §5 — Production Estimate Still Diverges From Reality (Medium)

`calculateWorkerProduction()` in `populationSystem.ts:91-102` now includes mastery (good), and `calculateEnergyBalance()` multiplies by neural efficiency (good). But it still **doesn't account for zone scarcity**. When the zone is 10% full, real production is ~10% of the estimate. The energy balance display tells the player the swarm is healthy when it's actually starving.

**Recommendation (unchanged):** Track actual biomass gathered per tick as a running sum during worker processing, instead of estimating from a formula. Each `processWorkerTick` returns `biomassGathered` — accumulate it:

```typescript
let actualProduction = 0;
for (const worker of swarm.workers) {
  const tickResult = processWorkerTick(worker, queen, zone, efficiency);
  actualProduction += tickResult.biomassGathered;
}
```

Use `actualProduction` for the energy balance display. This eliminates the estimate-vs-reality gap permanently and automatically reflects any future modifier changes.

---

## §6 — Queen Catch-Up Safety (Still Open, Medium)

`processBatchedCatchUp()` (`gameTickSwarm.ts:344-472`) does not simulate queen metabolism during offline periods. Queen energy, buffer, and health remain at their pre-offline values. After 48 hours offline, the queen has the same energy as when the player left — which violates the simulation model.

Conversely, the queen can survive ~97 hours on reserves alone (200 total / 0.000571 metabolism per tick). For a long-weekend absence, the queen survives but the simulation is dishonest — pools should reflect time passed.

**Catch-up report (`catchUpReportBuilder.ts`) has zero swarm event handling.** Worker deaths, egg hatches, population changes — none of these appear in the "While you were away..." modal. The player returns from offline with no idea what happened to their swarm.

**Recommendation (unchanged from v1):**

1. **Simulate queen metabolism in batch catch-up.** Compute: `energyConsumed = metabolismPerTick * elapsedTicks`. Run the cascade equation on the queen's pools. If workers were alive pre-offline, compute biomass deliveries proportional to worker count × net delivery rate × efficiency.

2. **Add a dormancy mechanic** for the extreme case (queen alone, no workers). Below an energy threshold with 0 workers alive, queen enters hibernation at reduced metabolism. This is biologically plausible, idle-friendly, and should be an explicit state visible in the UI.

3. **Add swarm events to the catch-up report builder.** Scan logs for `worker_died`, `egg_laid`, `worker_hatched`, and summarize: "Your swarm grew from 12 to 18 workers. 3 workers died of starvation. The queen laid 9 eggs."

4. **Normalize surviving organism pools after catch-up.** Workers that survived the batch model should have pools set to equilibrium values (full energy/health), since they evidently had enough food. This prevents the "first tick massacre" where stale pre-offline pools cause instant deaths.

---

## §7 — Revised Priority Order

```
IMMEDIATE (blocks correct gameplay):
  §1  Recalibrate zone regrowth rate (biomassRate * 1.0, not * 0.01)
  §1  Add scarcity curve to gathering
  §2  Wire worker.assignedZoneId into gathering (not queen's zone)
  §2  Run regrowth on all harvesting zones, not just queen zones

SHORT-TERM (misleading player information):
  §3  Add neural efficiency to UI gather rate display
  §5  Replace production estimate with actual tracked production
  §4  Wire calculateGatherRate() as single source of truth
  §4  Delete calculateStarvationDeaths()

MEDIUM-TERM (idle safety):
  §6  Queen metabolism in batch catch-up
  §6  Swarm events in catch-up report
  §6  Dormancy mechanic for isolated queen
  §6  Pool normalization after catch-up

CLEANUP:
  §4  Delete depleteZoneBiomass() (after extracting any needed logic)
  §4  Delete other dead functions
```

---

## Calibration Cheat Sheet

After implementing zone regrowth at full `biomassRate` per tick:

| Scenario | Expected behavior |
|----------|-------------------|
| 1 zone, 5 workers | Zone at ~80% steady state. Sustainable. |
| 1 zone, 15 workers | Zone at ~20% steady state. Scarcity pressure visible. |
| 1 zone, 20 workers | Zone depleted. Workers starving. Expansion mandatory. |
| 2 zones, 20 workers | Split gathering. Each zone at ~50%. Sustainable. |
| 3 zones, 20 workers | Comfortable surplus. Room for growth to neural cap. |
| 25 workers, 20 capacity | Neural penalty (0.41×) + zone scarcity. Rapid die-off to ~20. |

If any scenario doesn't match, adjust the ratio of `biomassRate` to `BASE_GATHER_RATE`.

**Test with extreme values:** 0 biomassRate zones, max-skill workers (100 foraging, level 99 mastery), 40+ worker populations. Ensure no division by zero, no negative biomass, no infinite gather rates.
