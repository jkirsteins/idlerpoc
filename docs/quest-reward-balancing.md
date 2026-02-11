# Quest Reward Balancing: Active vs Passive Income

## Design Principle

**Active play must pay significantly more than passive automation.**

Finite contracts (delivery, passenger, freight, supply) require player attention: they have real expiry deadlines and must be manually accepted. This attention cost must be rewarded with meaningfully higher pay compared to infinite/automatable routes (trade routes, standing freight) that can be set and forgotten.

The inverse is also true: **passive income must be reliable but modest.** Trade routes and standing freight are the "background income" that keeps the operation running while the player is away. They should always be profitable but never so lucrative that active play feels unnecessary.

## Quest Expiry

Quests have real deadlines enforced by the `expiresAfterDays` field. Each quest is stamped with `generatedOnDay` when created. On each day boundary, expired quests are removed and new ones are generated to fill the empty slots. Quests that haven't expired yet **persist across days** — a 30-day supply contract stays on the board for 30 days, while a 3-day passenger contract cycles quickly.

| Quest Type       | Expiry  | Behavior                                                    |
| ---------------- | ------- | ----------------------------------------------------------- |
| Passenger        | 3 days  | Cycles fastest — check daily for high-pay opportunities     |
| Delivery         | 7 days  | Moderate turnover — usually available for a few days        |
| Freight          | 14 days | Stays on board long enough to plan multi-trip commitment    |
| Supply           | 30 days | Long-lived — big contracts worth planning around            |
| Standing Freight | Never   | Persists until location quests are structurally regenerated |
| Trade Route      | Never   | Permanent — always available at trade hubs                  |

**What happens when a deadline is missed**: Nothing punishing. The quest simply disappears from the board and a new random quest takes its slot. The player loses the _opportunity_ to earn that contract's premium pay, not money or progress. Expired quests are replaced, not subtracted.

## The Attention-Reward Spectrum

This follows an established pattern in idle/incremental games:

| Attention Level            | Quest Types         | Design Intent                                                     |
| -------------------------- | ------------------- | ----------------------------------------------------------------- |
| **High** (most rewarding)  | Passenger, Delivery | Short deadlines, one-shot — check board regularly for best deals  |
| **Medium**                 | Freight, Supply     | Multi-trip commitment with expiry — plan ahead, stay engaged      |
| **Low** (least rewarding)  | Standing Freight    | Automatable, no expiry — modest but always profitable             |
| **None** (baseline income) | Trade Routes        | Permanent, deterministic, fully automatable — pure passive income |

The pay gap between the top and bottom of this spectrum should be **2-3x** to make the attention cost feel worthwhile. A gap smaller than ~1.5x causes most players to default to passive play because the marginal effort isn't worth the marginal reward. A gap larger than ~4x makes passive play feel punishingly bad, which undermines the idle-game identity.

## Target Pay Ratios (per trip, relative to operating costs)

| Quest Type           | Old Multiplier | New Multiplier | Effective Pay Range   | Rationale                                                                   |
| -------------------- | -------------- | -------------- | --------------------- | --------------------------------------------------------------------------- |
| **Passenger**        | 1.0x           | **2.0x**       | 2.6-4.0x costs        | Highest attention: tightest deadline (3d), requires quarters room, one-shot |
| **Delivery**         | 1.0x           | **1.5x**       | 1.95-3.0x costs       | High attention: 7d deadline, one-shot, requires cargo capacity              |
| **Supply**           | 1.5x total     | **2.5x total** | 3.25-5.0x total costs | Medium-high: large commitment, 30d deadline, bulk reward                    |
| **Freight**          | 0.8x/trip      | **1.2x/trip**  | 1.56-2.4x costs       | Medium: multi-trip with deadline, repeat business                           |
| **Standing Freight** | 0.7x/trip      | **0.6x/trip**  | 0.78-1.2x costs       | Low: infinite, automatable — always profitable at minimum floor             |
| **Trade Route**      | 150% fixed     | **120% fixed** | ~1.2-1.6x costs       | Baseline: permanent, deterministic, zero-attention passive income           |

### Resulting Hierarchy (average cr/trip at same operating cost)

```
Passenger (2.0x)  ████████████████████  ← Active: highest reward
Delivery  (1.5x)  ███████████████       ← Active: high reward
Supply    (2.5x)  ████████████████████████ ← Active: very high total (but many trips)
Freight   (1.2x)  ████████████          ← Semi-active: decent per-trip
St.Freight(0.6x)  ██████                ← Passive: modest per-trip
Trade Rte (120%)  ████                  ← Passive: reliable baseline
```

Active quests average ~2.5-3x costs per trip. Passive routes average ~1.2-1.3x costs per trip. The gap is approximately **2x**, hitting the sweet spot.

## Why Each Quest Type Pays What It Does

### Passenger (2.0x) — Highest Active Reward

- **3-day expiry** — tightest deadline, cycles fastest on the board
- **Quarters required** — not every ship can take passengers, creating opportunity cost
- **One-shot** — if you miss it, it's gone in 3 days
- **Narrative weight** — passengers feel like important jobs; they deserve premium pay
- Players who actively watch for passenger contracts and snap them up should be visibly richer than passive traders

### Delivery (1.5x) — High Active Reward

- **7-day expiry** — moderate deadline pressure
- **One-shot** — single trip, single payout
- **Cargo flexibility** — random cargo type and amount adds variety
- The bread-and-butter active contract — always available, always worth doing

### Freight (1.2x per trip) — Semi-Active Reward

- **14-day expiry** — long deadline but still finite
- **Multi-trip** — 2-5 trips create a planning horizon
- **Volume discount** — repeated same-route trips are operationally easier
- Sits between active and passive: you commit to a route for a while but must re-accept when done

### Supply (2.5x total) — High Commitment Reward

- **30-day expiry** — longest deadline, stays on board a long time
- **Large total cargo** — 20,000-50,000 kg requires many trips
- **Lump sum** — all payment on completion, not per trip, so you take the risk
- Rewards planning and dedication: tie up your ship for a major contract, get a major payday

### Standing Freight (0.6x per trip) — Modest Passive Income

- **No expiry, infinite trips** — pure convenience
- **Automatable** — can assign ships to run automatically
- **Randomly generated** — unlike trade routes, may not exist for every pair
- **Always profitable** — 0.6x of the 130-200% cost floor = 0.78-1.2x costs, never a loss
- The "lazy" option — reliably profitable but thin margins reward active players who switch to better contracts when they appear

### Trade Routes (120% of costs) — Baseline Passive Income

- **Permanent** — always available at every trade hub
- **Deterministic** — exact same pay every trip, no variance
- **Fully automatable** — set and literally forget
- The floor of the income spectrum — keeps your operation solvent while you're away, but active play is clearly better

## Interaction with Other Systems

### Commerce Skill Feedback Loop

Commerce skill (trained by completing trade routes) provides up to +20% payment bonus. This benefits all quest types equally, but the **absolute credit gain** is highest on active quests. A +20% bonus on a 2.0x passenger contract adds ~0.4x costs. A +20% bonus on a 1.2x trade route adds ~0.24x costs. Active players benefit more from investing in commerce skill.

### Crew Skill Bonuses

Skilled scanner/helm/drive ops crew provide payment bonuses. Same principle: the bonus is a percentage, so it's worth more on higher-paying active quests.

### Route Danger Premium (Trade Routes Only)

Trade routes still receive danger premium (up to 1.5x for critical routes) and location factor (0.9-1.4x). This means dangerous trade routes can approach standing freight pay levels, which is intentional — dangerous routes deserve compensation even for passive play.

### Standing Freight Distance Multiplier (Future)

Per BACKLOG.md, standing freight could receive distance-based multiplier adjustments (0.6x short → 0.8x long). This would reward players who seek out longer standing freight routes while keeping short-haul standing freight firmly below active quest pay.

## Before/After Examples

All examples use the same base operating cost for a given ship+route so the multiplier impact is clear.

### Station Keeper: Earth → Gateway (400 km)

Operating cost: ~4,578 cr (crew + fuel round trip)

| Quest Type            | BEFORE                  | AFTER                     | Change    |
| --------------------- | ----------------------- | ------------------------- | --------- |
| Delivery              | 5,951 - 9,156 cr (1.0x) | 8,927 - 13,734 cr (1.5x)  | **+50%**  |
| Passenger             | 5,951 - 9,156 cr (1.0x) | 11,902 - 18,312 cr (2.0x) | **+100%** |
| Freight/trip          | 4,761 - 7,325 cr (0.8x) | 7,141 - 10,987 cr (1.2x)  | **+50%**  |
| Standing Freight/trip | 4,166 - 6,409 cr (0.7x) | 3,571 - 5,494 cr (0.6x)   | **-14%**  |
| Trade Route/trip      | ~6,867 cr (150% fixed)  | ~5,494 cr (120% fixed)    | **-20%**  |

**What this means**: A player actively taking delivery/passenger contracts from the daily board earns roughly 2-3x per trip compared to running an automated trade route. Before this change, the trade route actually paid _more_ than some active contracts.

### Wayfarer: Earth → Gateway (400 km)

Operating cost: ~34,400 cr

| Quest Type            | BEFORE             | AFTER               | Change    |
| --------------------- | ------------------ | ------------------- | --------- |
| Delivery              | 44,720 - 68,800 cr | 67,080 - 103,200 cr | **+50%**  |
| Passenger             | 44,720 - 68,800 cr | 89,440 - 137,600 cr | **+100%** |
| Freight/trip          | 35,776 - 55,040 cr | 53,664 - 82,560 cr  | **+50%**  |
| Standing Freight/trip | 31,304 - 48,160 cr | 26,832 - 41,280 cr  | **-14%**  |
| Trade Route/trip      | ~51,600 cr         | ~41,280 cr          | **-20%**  |

### Firebrand: Earth → Meridian (20,000 km)

Operating cost: ~818,000 cr

| Quest Type            | BEFORE                   | AFTER                    | Change    |
| --------------------- | ------------------------ | ------------------------ | --------- |
| Delivery              | 1,063k - 1,636k cr       | 1,595k - 2,454k cr       | **+50%**  |
| Passenger             | 1,063k - 1,636k cr       | 2,127k - 3,272k cr       | **+100%** |
| Freight/trip          | 851k - 1,309k cr         | 1,276k - 1,963k cr       | **+50%**  |
| Supply (35k kg total) | 1,595k - 2,454k cr total | 2,659k - 4,090k cr total | **+67%**  |
| Standing Freight/trip | 744k - 1,145k cr         | 638k - 982k cr           | **-14%**  |
| Trade Route/trip      | ~1,227k cr               | ~982k cr                 | **-20%**  |

### Key Takeaway

**Before**: A Firebrand running an automated trade route on Earth→Meridian earned ~1,227k cr/trip. A delivery contract on the same route paid 1,063k-1,636k cr — the trade route was _competitive with or better than_ a finite delivery contract half the time.

**After**: The same trade route pays ~982k cr/trip. A delivery contract pays 1,595k-2,454k cr. The active contract now pays **1.6-2.5x more** than the passive route on every roll. A passenger contract pays **2.2-3.3x more**. The player is clearly rewarded for paying attention.

## Anti-Patterns to Avoid

1. **Never let passive routes exceed active quest pay.** If trade route danger/location bonuses push effective pay above delivery quests, the incentive structure breaks.

2. **Never make passive routes unprofitable.** Players must always be able to set up a trade route and walk away knowing they won't lose money. The idle identity of the game depends on this.

3. **Don't over-complicate the gap.** Players should intuitively feel that "one-time contracts pay well, trade routes pay steady." The math should reinforce gut feeling, not require spreadsheet analysis.

4. **Don't add time pressure that feels punishing.** Expiry deadlines create urgency, not punishment. Expired quests are replaced by new ones. The player never loses money for missing a deadline — they just lose the opportunity to earn more.
