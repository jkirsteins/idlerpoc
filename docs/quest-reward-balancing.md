# Quest Reward Balancing: Active vs Passive Income

## Design Principle

**Active play must pay significantly more than passive automation.**

Finite contracts (delivery, passenger, freight) require player attention: they have real completion deadlines once accepted and must be manually selected from the daily board. This attention cost must be rewarded with meaningfully higher pay compared to trade routes that can be set and forgotten.

The inverse is also true: **passive income must be reliable but modest.** Trade routes are the "background income" that keeps the operation running while the player is away. They should always be profitable but never so lucrative that active play feels unnecessary.

## Deadline System

Deadlines apply to **accepted contracts**, not board listings. Unaccepted quests refresh daily (the full board is regenerated every day). Once a player accepts a contract, the clock starts:

| Quest Type  | Deadline    | Consequence of Expiry                                          |
| ----------- | ----------- | -------------------------------------------------------------- |
| Passenger   | 3 days      | Contract lost. No payment (single-leg, nothing to keep).       |
| Delivery    | 7 days      | Contract lost. No payment (single-leg, nothing to keep).       |
| Freight     | 14 days     | Contract lost. Credits from completed trips are kept.          |
| Trade Route | No deadline | Permanent, automated — runs indefinitely until player cancels. |

**What happens when a deadline is missed**: The contract expires on the next arrival after the deadline day. The player keeps any per-trip credits already earned (freight) but loses the remaining payout. They dock and can immediately accept a new contract. No money is deducted — the cost is forfeited opportunity, not punishment.

This creates meaningful pressure: a 3-day passenger contract on a long route is genuinely risky. A 14-day freight contract gives breathing room but still has a horizon. Players must weigh pay vs deadline vs route distance.

## The Attention-Reward Spectrum

This follows an established pattern in idle/incremental games:

| Attention Level            | Quest Types         | Design Intent                                                  |
| -------------------------- | ------------------- | -------------------------------------------------------------- |
| **High** (most rewarding)  | Passenger, Delivery | Short deadlines, one-shot — must complete quickly for high pay |
| **Medium**                 | Freight             | Multi-trip commitment with moderate deadline — plan ahead      |
| **None** (baseline income) | Trade Routes        | Permanent, deterministic, fully automatable — passive income   |

The pay gap between active and passive should be **2-3x** to make the attention cost feel worthwhile. A gap smaller than ~1.5x causes most players to default to passive play because the marginal effort isn't worth the marginal reward. A gap larger than ~4x makes passive play feel punishingly bad, which undermines the idle-game identity.

## Target Pay Ratios (per trip, relative to operating costs)

| Quest Type      | Multiplier     | Effective Pay Range  | Rationale                                                           |
| --------------- | -------------- | -------------------- | ------------------------------------------------------------------- |
| **Passenger**   | **2.0x**       | 2.6-4.0x costs/trip  | Highest pay: tightest deadline (3d), requires quarters, one-shot    |
| **Delivery**    | **1.5x**       | 1.95-3.0x costs/trip | High pay: 7d deadline, one-shot, requires cargo capacity            |
| **Freight**     | **1.25x/trip** | 1.63-2.5x costs/trip | Good per-trip: multi-trip with 14d deadline, credits kept on expire |
| **Trade Route** | **120% fixed** | ~1.2-1.6x costs/trip | Baseline: permanent, deterministic, zero-attention passive income   |

### Resulting Hierarchy (average cr/trip at same operating cost)

```
Passenger (2.0x)  ████████████████████  ← Active: highest reward, tightest deadline
Delivery  (1.5x)  ███████████████       ← Active: high reward
Freight  (1.25x)  ██████████            ← Semi-active: good per-trip, multi-trip
Trade Rte (120%)  ████                  ← Passive: reliable baseline
```

Active quests average ~2-3x costs per trip. Trade routes average ~1.2-1.3x costs. The gap is approximately **2x**, hitting the sweet spot.

## Why Each Quest Type Pays What It Does

### Passenger (2.0x) — Highest Active Reward

- **3-day deadline** — tightest of any contract; long routes genuinely risky
- **Quarters required** — not every ship can take passengers, creating opportunity cost
- **One-shot** — single trip, all-or-nothing payout
- **Narrative weight** — passengers feel like important jobs; they deserve premium pay

### Delivery (1.5x) — High Active Reward

- **7-day deadline** — moderate pressure, most routes completable
- **One-shot** — single trip, single payout
- **Cargo flexibility** — random cargo type and amount adds variety
- The bread-and-butter active contract — always available, always worth doing

### Freight (1.25x per trip) — Semi-Active Reward

- **14-day deadline** — generous but still finite
- **Multi-trip** — 2-7 trips create a planning horizon
- **Per-trip payment** — already-earned credits survive expiry
- Sits between active and passive: commit for a while, get reliable income
- The only multi-trip finite contract — fills the middle of the attention spectrum

### Trade Routes (120% of costs) — Baseline Passive Income

- **No deadline** — runs forever once assigned
- **Permanent** — always available at every trade hub
- **Deterministic** — exact same pay every trip, no variance
- **Fully automatable** — set and literally forget
- The floor of the income spectrum — keeps your operation solvent while you're away

## Cargo Scaling with Ship Capacity

All contract types scale cargo amounts with the accepting ship's available cargo
hold, ensuring bigger ships haul more per trip and earn proportionally more through
the cargo premium (`1 + cargoKg/10000 × 0.5`).

| Quest Type      | Cargo per Trip           | Notes                          |
| --------------- | ------------------------ | ------------------------------ |
| **Delivery**    | 30-80% of available hold | Variable load size for variety |
| **Freight**     | 50-80% of available hold | Freight loads heavy            |
| **Trade Route** | 80% of available hold    | Always fills the ship          |
| **Passenger**   | N/A (no cargo)           | Payment from operating costs   |

This means upgrading to a larger ship class immediately increases income on all cargo-hauling
contracts. A Class II ship earning 8x the cargo premium of a Class I ship is the primary
reward signal for ship progression.

## Interaction with Other Systems

### Commerce Skill Feedback Loop

Commerce skill (trained by completing trade routes) provides up to +20% payment bonus. This benefits all quest types equally, but the **absolute credit gain** is highest on active quests. A +20% bonus on a 2.0x passenger contract adds ~0.4x costs. A +20% bonus on a 1.2x trade route adds ~0.24x costs. Active players benefit more from investing in commerce skill.

### Crew Skill Bonuses

Skilled scanner/helm/drive ops crew provide payment bonuses. Same principle: the bonus is a percentage, so it's worth more on higher-paying active quests.

### Route Danger Premium (Trade Routes Only)

Trade routes still receive danger premium (up to 1.5x for critical routes) and location factor (0.9-1.4x). This means dangerous trade routes can approach freight pay levels, which is intentional — dangerous routes deserve compensation even for passive play.

## Anti-Patterns to Avoid

1. **Never let passive routes exceed active quest pay.** If trade route danger/location bonuses push effective pay above delivery quests, the incentive structure breaks.

2. **Never make passive routes unprofitable.** Players must always be able to set up a trade route and walk away knowing they won't lose money. The idle identity of the game depends on this.

3. **Don't over-complicate the gap.** Players should intuitively feel that "one-time contracts pay well, trade routes pay steady." The math should reinforce gut feeling, not require spreadsheet analysis.

4. **Deadlines should create tension, not punishment.** Expiry costs the player a _missed opportunity_, not deducted credits. Per-trip earnings from freight are kept. The worst case is wasted time, not negative balance.
