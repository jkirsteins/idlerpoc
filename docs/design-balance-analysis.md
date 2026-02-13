# Design Balance Analysis

Comprehensive analysis of game system balance, identifying issues and opportunities across economy, progression, combat, and ship design.

---

## Executive Summary

The game's emergent systems are generally well-designed, with the cost-floor quest payment model and physics-based flight system creating natural balance. However, several significant balance issues exist:

1. **Mining dominates endgame income** — trade route margins collapse at distance while mining scales linearly
2. **Skill system over-concentrates on piloting** — 8 of 12 job slots train piloting; other skills are starved
3. **Combat defense scaling is flat** while pirate attack scales linearly with threat level
4. **Class II ships have an extremely narrow operating range** — only Gateway is reliably reachable
5. **Captain is a massive single point of failure** — losing captain's ship cripples entire fleet
6. **Crew salaries are trivially cheap** — salary costs never create meaningful economic pressure

---

## 1. Economy Balance

### 1.1 Trade Route Margin Collapse (CRITICAL)

**Issue:** Distance-scaled quest margins intentionally squeeze long-route trade profits:

| Distance | Cost Floor | Margin |
|---|---|---|
| < 50K km | 1.3-2.0x | 30-100% |
| 50K-5M km | 1.2-1.5x | 20-50% |
| 5M-100M km | 1.1-1.3x | 10-30% |
| > 100M km | 1.05-1.15x | 5-15% |

Trade routes use the *low end* (`base` only, no `range` randomness) of these brackets. A Leviathan running Earth→Mars trade earns only 5-10% profit margin, while fuel costs are enormous (D-He3 at 30x base price × 2.0-2.5x location multiplier = 120-150 cr/kg).

**Impact:** At endgame, trade routes become nearly break-even. Players are economically forced to mine, which may feel punitive for players who prefer trading/hauling gameplay.

**Recommendation:** Consider a trade route danger premium ramp that provides meaningful bonus for risky long-haul routes. Currently `dangerPremium` caps at 1.5x, which doesn't sufficiently offset the margin squeeze.

### 1.2 Mining Income Scales Without Bound

**Issue:** Mining income scales multiplicatively with no ceiling:

```
yield = BASE_RATE(0.2) × equipRate(1-5x) × skillFactor(1-2x) × masteryYield(1+bonus)
        × poolYield(1+bonus) × captainBonus(1+skill/100) × locationYield
```

With a Quantum Resonance Array (5x), mining skill 80 (1.8x), captain mining 80 (+80%), and mastery bonuses, a single miner produces ~2.9 ore/tick. Exotic Matter at 500 cr/unit = ~1,450 cr/tick per miner. With 2 mining bay slots (4 miners on Leviathan), that's ~5,800 cr/tick.

**Comparison to trade:** A Leviathan trade route to Mars may earn ~300K cr/round trip over ~4,000 ticks = ~75 cr/tick. Mining is **77x more profitable per tick** than deep-space trading at endgame.

**Impact:** Mining completely dominates the economy. Trade becomes irrelevant except as a way to train commerce skill.

**Recommendation:** Consider diminishing returns on mining yield (e.g., log-scale equipment tiers), ore market saturation mechanics, or better trade scaling.

### 1.3 Crew Salaries Are Negligibly Cheap (MODERATE)

**Issue:** Base crew salary is 0.1 cr/tick. Even with `salaryMultiplier` of 7x (elite hire), that's 0.7 cr/tick = 336 cr/day = ~2,700 cr/8-day week.

A Station Keeper earns 5,900-9,200 cr per Gateway trip (~20 min real time). A single trip pays an entire crew for weeks.

The salary system documentation targets are:
- Skill 0: 48 cr/day
- Skill 45: 333 cr/day ("luxury hire")

But even the "luxury hire" at 333 cr/day is trivial when a single Wayfarer trade trip earns 44K-68K cr.

**Impact:** Crew salary never creates meaningful economic pressure. The "unpaid crew depart" mechanic exists but is practically impossible to trigger after the first few minutes of play. There's no tension in crew management costs.

**Recommendation:** Either scale salaries more aggressively (10x current values) or accept that salaries are flavor rather than a balancing mechanism.

### 1.4 Fuel Costs Are the Only Real Money Sink

Fuel pricing creates the primary economic pressure:

| Engine Type | Multiplier | Full Refuel at Earth |
|---|---|---|
| Chemical | 1x | ~12,800 cr (Station Keeper) |
| Fission | 3x | ~720K cr (Wayfarer: 150K × 4.8) |
| Fusion D-D | 10x | ~3.2M cr (Firebrand: 200K × 16) |
| Fusion D-He3 | 30x | ~19.2M cr (Leviathan: 400K × 48) |

This is good — fuel creates real strategic decisions. But combined with 1.2 above, it means: mining to pay for fuel to do more mining. Trade doesn't contribute meaningfully to covering fuel costs at endgame.

### 1.5 Provisions Are Cheap and Auto-Managed

**Issue:** Provisions at 0.5-1.25 cr/kg with life support recycling reducing 15 kg/crew/day to ~5 kg/crew/day means a 16-crew Leviathan costs ~80 kg/day = ~40-100 cr/day. This is completely negligible.

**Impact:** Provisions are a survival mechanic (starvation kills) but not an economic one. They never influence route planning decisions.

---

## 2. Skill System Balance

### 2.1 Piloting Skill Monopoly (CRITICAL)

**Issue:** 8 of 12 trainable job slots train piloting:

| Slot | Skill Trained | Rate |
|---|---|---|
| Helm | Piloting | 0.00004 |
| Comms | Piloting | 0.00002 |
| Drive Ops (×3) | Piloting | 0.00004 |
| Containment (×2) | Piloting | 0.00006 |
| Arms Maint (×2) | Piloting | 0.00002 |
| Fire Control | Piloting | 0.00004 |
| Scanner | Piloting | 0.00004 |
| Targeting | Piloting | 0.00004 |
| **Mining Ops (×2-4)** | **Mining** | **0.00004** |
| **Repair (×3)** | **Repairs** | **0.00004** |
| **Commerce** | **None (no slot)** | **0** |

Commerce has **zero** passive training sources. The only way to train commerce is via event grants from contract completion (1.0 + 0.5 × trips), which is tiny at high skill levels due to flat gain vs. diminishing returns in passive training.

**Impact:**
- All crew rapidly become pilots regardless of role
- Commerce is nearly impossible to train to high levels
- Captain's commerce skill (which drives income bonuses) progresses extremely slowly
- Engineers/miners who sit in drive_ops or containment slots train piloting instead of their primary skill

**Recommendation:**
- Make drive_ops train repairs (engine maintenance)
- Make containment train repairs (reactor expertise)
- Make comms train commerce (negotiations, trade coordination)
- Add a dedicated commerce training slot (e.g., "Trade Ops" from bridge)

### 2.2 Commerce Training Bottleneck (HIGH)

**Issue:** Commerce provides the captain's primary income multiplier (+1% per skill point). But commerce can only be trained by:
1. Captain/first officer completing contracts (flat 1.0 + 0.5×trips gain)
2. No passive training slot exists

At skill 50, the power-law diminishing returns formula gives passive training gain of:
```
gain = 1724 × 0.00004 / (1 + 50/5)^3.2 = extremely tiny
```

But event-based gains are flat (not diminished), making them increasingly valuable. However, 1.5 commerce points per contract completion is still slow — reaching commerce 50 requires ~200+ contract completions from scratch.

**Impact:** The captain's most important skill (commerce) is the hardest to level. Players must grind contracts for weeks to get meaningful commerce bonuses.

### 2.3 Specialization Penalty is Harsh

**Issue:** At skill 50, choosing a specialization gives +50% to one skill but -25% to all others. For a crew member training piloting and repairs simultaneously:
- Specialize in piloting: repairs trains at 0.75x (permanently 25% slower)
- Specialize in repairs: piloting trains at 0.75x

Since most job slots train piloting anyway, repair specialists still train piloting faster than repairs in most slots — the specialization bonus is partially wasted.

**Impact:** Specialization feels like a trap for non-piloting skills since piloting training is so dominant.

---

## 3. Combat Balance

### 3.1 Defense Doesn't Scale with Ship Tier (HIGH)

**Issue:** Pirate attack strength scales linearly with distance from Earth:

```
basePirateAttack = threatLevel × 5 (PIRATE_ATTACK_MULTIPLIER)
threatLevel = clamp(currentKm / 10,000,000, 1, 8) + cargoBonus
```

At Jupiter (~588M km from Earth): threatLevel = 8, pirateAttack = 40 (±30% variance = 28-52).

Defense score for a fully equipped Leviathan:
- PD-40 Flak: 20 × effectiveness × (1 + 0.5 + gunnerSkill×0.005) ≈ 20-35
- Deflector: 10
- Ship mass: 1,200,000 / 100,000 = 12
- Captain rally: 5
- Crew arms: ~5 (piloting/10 + weapons)
- PD Laser: 8
- **Total: ~60-75**

Victory threshold: defense ≥ 1.5 × pirateAttack → need 42-78 defense vs 28-52 attack.

This means a **fully equipped Leviathan** can sometimes lose to Jupiter pirates. The variance bands (±15% defense, ±30% attack) can create situations where:
- Best case: 75×1.15 = 86 defense vs 40×0.7 = 28 attack → easy victory
- Worst case: 60×0.85 = 51 defense vs 40×1.3 = 52 attack → harassment or boarding

**Impact:** Outcomes feel random at high threat levels despite heavy investment in defense equipment. A boarding at Jupiter can steal 10-25% of credits (potentially millions) plus 10% equipment degradation on everything.

**Recommendation:** Defense should scale more with ship tier. Consider adding ship class to the defense calculation, or making point defense more effective at higher tiers.

### 3.2 Negotiation Is Unreliable at High Commerce

**Issue:** Negotiation chance = `commerce / 200`. Even at commerce 100 (Master), negotiation succeeds only 50% of the time. Combined with the difficulty of training commerce (see 2.2), most players will have ~30-50 commerce, giving 15-25% negotiation success.

**Impact:** Negotiation is unreliable backup. Players who invest in commerce for negotiations are disappointed by the success rate.

### 3.3 Evasion Stacks Additively Without Cap

**Issue:** Evasion chance = velocity + scanner(0.15) + piloting×0.002 + commandBonus×0.15

At high piloting (80) with scanner and captain:
- Velocity: up to 0.3
- Scanner: 0.15
- Piloting: 80 × 0.002 = 0.16
- Captain piloting 80: (80/200) × 0.15 = 0.06
- **Total: 0.67 (67% evasion)**

This is reasonable, but the velocity component (capped at 0.3) makes evasion very dependent on flight phase. During coast, encounters are rare (0.1× heat) so evasion matters less. During burns, evasion is high because velocity is high.

**Impact:** The system works but encounters feel binary — either evaded entirely or face full combat resolution. There's no "close call" mechanic.

### 3.4 Boarding During Catch-Up Downgraded to Harassment

**Issue:** When the player is offline and catch-up runs, boardings are downgraded to harassment. This is protective but means AFK ships in dangerous space take trivially less damage than active players.

**Impact:** Players may exploit this by deliberately going AFK through dangerous routes.

---

## 4. Ship Balance

### 4.1 Class II Operating Range is Extremely Narrow (CRITICAL)

**Issue:** The quest economics validation doc confirms:
- Wayfarer (150K fuel, NTR Mk1): Can reach Gateway (400 km) and nearby stations. **Cannot reach Meridian Depot** (35,786 km) — needs ~160K kg round trip, has 150K capacity
- Dreadnought (500K fuel, NTR Heavy): Same problem at larger scale

The cislunar destinations (Forge Station at 326K km, Graveyard Drift at 384K km, Tycho Colony at 384K km) all require fuel far exceeding Class II tank capacity for round trips.

**Impact:** Class II ships can essentially only shuttle between Earth/Gateway. They cannot access any mining locations. The Dreadnought's dual mining bays are useless because it can't reach mining locations. This creates a "dead zone" between Class I (Gateway runs) and Class III (everything else).

**Recommendation:** Either:
- Increase Class II fuel capacity significantly (3-5x current values)
- Add intermediate refueling stations within Class II range
- Reduce piloting requirements so Class I can do Gateway→Meridian runs
- Accept this as intended and clearly communicate the progression gap to players

### 4.2 Dreadnought Is a Trap Purchase (HIGH)

**Issue:** The Dreadnought costs 45M cr + 200 Ti + 50 Pt (requiring mining access the ship itself cannot reach). It has:
- 2 mining bays (4 mining slots)
- 80,000 kg cargo capacity
- Rotating habitat
- 12 max crew

But it cannot reach any mining location (Graveyard Drift requires piloting 15 + range it doesn't have). Its 500K kg mass makes it fuel-hungry. Its only viable route (Earth↔Gateway) doesn't utilize any of its mining/industrial features.

**Cost comparison:**
- Dreadnought: 45M + ore, can do Gateway runs for ~68K-105K cr/trip
- Wayfarer: 8.5M, can do same Gateway runs for ~44K-68K cr/trip
- Firebrand: 120M + ore, can reach Mars/Vesta/everything

The Dreadnought occupies a dead zone between affordable (Wayfarer) and capable (Firebrand).

**Recommendation:** Either increase Dreadnought's range to reach cislunar mining locations, or reduce its price to make it a stepping stone purchase.

### 4.3 Ship Unlock Thresholds Are Inconsistent

| Ship | Price | Unlock (lifetime cr) | Ratio |
|---|---|---|---|
| Station Keeper | 250K | 0 | N/A |
| Wayfarer | 8.5M | 1M | 8.5x |
| Dreadnought | 45M | 1M | 45x |
| Firebrand | 120M | 50M | 2.4x |
| Leviathan | 350M | 50M | 7x |

Dreadnought and Wayfarer share the same unlock threshold (1M lifetime credits) despite a 5.3x price difference. Firebrand and Leviathan share 50M despite a 2.9x price difference. The unlock thresholds don't create meaningful gates — by the time you can afford the ship, you've already far exceeded the unlock threshold.

### 4.4 Equipment Slot Uniformity

**Issue:** All equipment slots are tagged `['standard']` with occasional `['standard', 'structural']`. There's no meaningful slot differentiation — any equipment can go in any slot. The tagging system exists but isn't leveraged for balance.

**Impact:** No trade-off decisions in equipment loadout. Players just equip everything they can afford.

---

## 5. Progression Balance

### 5.1 Early Game Feels Good

The Station Keeper → Wayfarer progression works well:
- Start with 5K credits, Station Keeper costs 250K → must earn from Gateway runs
- Gateway runs: ~6-9K cr/trip, ~20 min real time → Wayfarer in ~2-3 hours of play
- This feels appropriate for an idle game early loop

### 5.2 Mid-Game Stalls at Class II→III Transition

**Issue:** The jump from Class II to Class III requires:
- 50M lifetime credits (unlock)
- 120M credits (Firebrand price)
- 300 Titanium Ore + 100 Platinum Ore (mining resources)

But Class II ships can't reach mining locations (see 4.1). Players must either:
1. Grind Gateway runs at ~50K cr/trip → ~2,400 trips for 120M → hundreds of hours
2. Somehow access mining (which requires... Class III)

This creates a catch-22: you need mining resources to buy the ship that lets you mine.

**Recommendation:** This is the single most critical balance issue. Players will hit a wall at Class II and potentially abandon the game. Options:
- Make Graveyard Drift reachable by Class II (reduce distance or increase Class II range)
- Add a cislunar mining location within Class II range
- Remove ore requirements from Firebrand (keep them for Leviathan)
- Add ore trading at stations so players can buy ore with credits

### 5.3 Skill Gating Creates Soft Locks

Piloting requirement to access locations:
- Gateway: 0
- Meridian: 10
- Graveyard Drift: 15
- Forge Station: 20
- Tycho Colony: 30
- Freeport: 40
- Scatter: 45
- Mars: 55
- Vesta: 60
- Crucible: 68
- Ceres: 75
- Jupiter: 85

Since piloting trains everywhere (see 2.1), this isn't usually a problem. But it creates a hidden coupling: ship range AND crew skill must both be sufficient. A new Firebrand with a fresh crew can't reach Mars despite having the fuel range because crew piloting is too low (needs 55).

---

## 6. Inactive/Placeholder Systems

### 6.1 Morale (Initialized, Never Used)

The `morale` field exists on every crew member (initialized to 100) but has no decay, no effects, and no recovery mechanics. This is dead weight in the data model.

### 6.2 Mastery Checkpoint Bonuses (Defined, Not Active)

The mastery pool checkpoint bonuses (10%, 25%, 50%, 95% thresholds) have labels and thresholds defined but the actual gameplay effects are not implemented. For example:
- Mining 50% checkpoint: "-10% equipment degradation while mining" — `getMiningPoolWearReduction()` exists but the specific values for each checkpoint need verification
- Commerce 95% checkpoint: "+10% payment on all contracts" — needs to be wired into quest payment calculation

### 6.3 Health Recovery at Stations

The `patient` job slot exists in medbay but station-based health recovery is listed as deferred. Crew health only recovers via medbay healing during flight (+2 HP/tick), which means injured crew must fly to heal.

---

## 7. Specific Numeric Issues

### 7.1 Mining Wear Rate vs Repair Rate

Mining equipment degrades at 0.005/tick (0.5%/tick). At continuous mining:
- 100% degradation in 200 ticks ≈ 3.3 real minutes ≈ 10 game hours
- At 100% degradation, effectiveness = 50% (divisor of 200)

Repair rate: `repairSkill × 0.05` points/tick, distributed across all degraded equipment. A repair skill of 20 gives 1.0 point/tick. If only one item is degraded, it repairs at 1.0/tick vs 0.5/tick degradation = net +0.5/tick repair. But if multiple items degrade simultaneously (mining + air filters + rad shield), repairs spread thin.

**Impact:** At endgame with multiple degrading systems, a single engineer can't keep up. Players need 2-3 engineers, but the repair slot only allows 3 engineers. This is actually well-balanced — multiple engineers feel necessary.

### 7.2 Encounter Cooldown

Cooldown: `500 × 180 = 90,000` game-seconds = 500 ticks = ~8.3 real minutes.

For a long flight (e.g., Earth→Mars, ~4000+ ticks), a ship faces at most ~8 encounters. Combined with low per-tick encounter probability, most flights have 0-2 encounters. This feels appropriate.

### 7.3 Starvation Damage

Starvation deals 3.0 HP/tick. At 100 HP, crew dies in ~33 ticks (33 real seconds). This is aggressive — appropriate for the severity of running out of food in space.

---

## 8. Priority Recommendations

### P0 — Critical (Game-breaking progression issues)

1. **Class II→III progression gap**: Class II ships cannot reach mining locations, creating a catch-22 where ore requirements for Class III require Class III to obtain
2. **Commerce skill has no passive training**: Commerce is the captain's primary income skill but has zero training slots

### P1 — High (Significant balance problems)

3. **Piloting skill monopoly**: 8/12 job slots train piloting; redistribute to other skills
4. **Dreadnought is a trap**: Expensive, can't reach mining locations, outperformed by cheaper ships
5. **Mining dominates endgame**: 77x more profitable than trading at endgame; trade becomes irrelevant

### P2 — Moderate (Quality of life and polish)

6. **Combat defense doesn't scale with ship tier**: Fully equipped Leviathan can lose to Jupiter pirates
7. **Crew salaries are negligible**: Never create economic pressure even at endgame
8. **Ship unlock thresholds are redundant**: Already surpassed by the time you can afford the ship
9. **Negotiation success rate is low**: Even at max commerce, 50% success feels unrewarding

### P3 — Low (Design debt and future considerations)

10. **Morale system placeholder**: Initialized but unused — decide to implement or remove
11. **Mastery checkpoint effects**: Some defined but not all wired into gameplay
12. **Equipment slot uniformity**: Slot tags exist but don't create meaningful loadout decisions
