# Skill System Design

This document describes the implemented 4-skill progression system, including passive training, event gains, mastery layers, ranks, specialization, crew roles, and how skills integrate with gameplay systems.

Source files: `skillProgression.ts`, `masterySystem.ts`, `skillRanks.ts`, `crewRoles.ts`, `captainBonus.ts`.

---

## Overview

Four skills govern crew capability:

| Skill        | Primary Training                            | Gameplay Role                                                 |
| ------------ | ------------------------------------------- | ------------------------------------------------------------- |
| **Piloting** | Job slots (helm, drive ops, scan ops, etc.) | Ship handling, evasion, destination access, ship class gating |
| **Mining**   | Job slots (mining ops)                      | Ore extraction rate, ore tier access, equipment tier access   |
| **Commerce** | Event gains (contract completion)           | Quest payment bonus, fuel discount, trade route mastery       |
| **Repairs**  | Job slots (repair)                          | Equipment repair speed, repair points per crew                |

Skills are continuous floats from 0 to 100. There is no XP intermediary — skills train directly from job assignment and event completion.

---

## Passive Training

Crew train skills by being assigned to job slots during flight (not while docked). Each job slot has a `trainRate` and a `skill` it trains.

### Formula

```
gain/tick = RATE_SCALE × trainRate × (1 + skill / CURVE_K)^(−CURVE_P) × matchBonus × specMultiplier
```

| Constant                 | Value | Purpose                                                |
| ------------------------ | ----- | ------------------------------------------------------ |
| `SKILL_CAP`              | 100   | Maximum skill value                                    |
| `RATE_SCALE`             | 1724  | Scales trainRate into the formula                      |
| `CURVE_K`                | 5     | Power-law: where diminishing returns kick in           |
| `CURVE_P`                | 3.2   | Power-law: steepness of falloff                        |
| `SKILL_MATCH_MULTIPLIER` | 1.5   | Bonus when crew role's primary skill matches job skill |
| `MASTERY_THRESHOLD`      | 99.5  | Rounds up to 100 when reached                          |

### Diminishing Returns

Uses a **power-law** curve: `(1 + currentSkill / 5)^(−3.2)`. This falls off more gently than exponential, keeping progress visible even at high levels.

### Approximate Passive-Only Timeline

Captain at helm, no match/spec bonuses:

| Skill Level | Rank       | Real Time |
| ----------- | ---------- | --------- |
| 5           | Green      | ~5 min    |
| 12          | Novice     | ~49 min   |
| 20          | Apprentice | ~4 hours  |
| 30          | Competent  | ~17 hours |
| 50          | —          | ~5 days   |
| 55          | Proficient | ~7 days   |
| 70          | Skilled    | ~17 days  |
| 83          | Expert     | ~34 days  |
| 95          | Master     | ~58 days  |

### Training Multipliers

These stack multiplicatively on top of the base formula:

1. **Role Match Bonus** — 1.5× if crew role's primary skill matches the job's trained skill
2. **Specialization** — +50% for specialized skill, −25% for other skills (see Specialization below)
3. **Captain Training Aura** — 1.5× for all crew on the captain's ship
4. **Fleet Coordination Aura** — +10% at captain's location, +5% one hop away

### Job Slots and Trained Skills

| Job Slot     | Skill    | Train Rate | Source             |
| ------------ | -------- | ---------- | ------------------ |
| Helm         | piloting | 0.00004    | Bridge             |
| Comms        | piloting | 0.00002    | Bridge             |
| Drive Ops    | piloting | 0.00004    | Engine room        |
| Containment  | piloting | 0.00006    | Reactor room       |
| Arms Maint.  | piloting | 0.00002    | Armory             |
| Fire Control | piloting | 0.00004    | PD station         |
| Scan Ops     | piloting | 0.00004    | Nav scanner        |
| Targeting    | piloting | 0.00004    | Point defense      |
| Repair       | repairs  | 0.00004    | Ship-wide          |
| Mining Ops   | mining   | 0.00004    | Mining bay         |
| Patient      | —        | 0          | Medbay (passive)   |
| Rest         | —        | 0          | Quarters (passive) |

**Note:** No job slot trains Commerce. Commerce is trained exclusively through event gains (contract completion).

---

## Event-Based Skill Gains

Event gains are **flat** — they bypass the diminishing returns curve entirely. This makes them increasingly valuable at higher skill levels, creating a natural shift from passive-dominated early game to event-dominated late game.

| Event                | Recipients                                                     | Skill                                                                                              | Amount |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| Encounter evaded     | Bridge crew (helm, scanner, comms)                             | piloting                                                                                           | +2.0   |
| Encounter negotiated | The negotiator                                                 | piloting                                                                                           | +2.5   |
| Encounter victory    | Combat crew (arms, fire control, targeting)                    | piloting                                                                                           | +3.0   |
| Encounter harassment | All crew                                                       | piloting                                                                                           | +1.0   |
| Encounter boarding   | All crew                                                       | piloting                                                                                           | +2.0   |
| Encounter fled       | Bridge crew (helm, scanner, comms)                             | piloting                                                                                           | +1.5   |
| Contract completed   | All crew → primary skill; commander + first officer → commerce | primary: `0.8 × tripsCompleted`; commerce: `1.0 + 0.5 × trips` (commander), half for first officer |
| First arrival        | All crew                                                       | piloting                                                                                           | +2.0   |

---

## Skill Ranks

Ten named ranks with non-linear distribution (more labels early where progression is fast):

| Rank       | Min Level | Span |
| ---------- | --------- | ---- |
| Untrained  | 0         | 5    |
| Green      | 5         | 7    |
| Novice     | 12        | 8    |
| Apprentice | 20        | 10   |
| Competent  | 30        | 10   |
| Able       | 40        | 15   |
| Proficient | 55        | 15   |
| Skilled    | 70        | 13   |
| Expert     | 83        | 12   |
| Master     | 95        | 5    |

Rank crossings produce log events and UI notifications (e.g. "Kira is now a Competent Pilot").

---

## Specialization

At skill level 50, a crew member can permanently lock in a specialization:

| Constant                   | Value                                     |
| -------------------------- | ----------------------------------------- |
| `SPECIALIZATION_THRESHOLD` | 50                                        |
| `SPECIALIZATION_BONUS`     | +50% training speed for specialized skill |
| `SPECIALIZATION_PENALTY`   | −25% training speed for all other skills  |

- One-time, irreversible choice per crew member
- Encourages focused crew builds vs. generalists

---

## Crew Roles

A crew member's role is deduced from their highest skill:

| Highest Skill       | Role     |
| ------------------- | -------- |
| piloting            | Pilot    |
| mining              | Miner    |
| commerce            | Trader   |
| repairs             | Engineer |
| (assigned manually) | Captain  |

Tie-breaking priority: piloting > mining > commerce > repairs.

### Role Archetypes (for hire generation)

| Role     | Primary  | Secondary | Tertiary |
| -------- | -------- | --------- | -------- |
| Pilot    | piloting | commerce  | mining   |
| Miner    | mining   | piloting  | commerce |
| Trader   | commerce | piloting  | mining   |
| Engineer | repairs  | piloting  | mining   |

---

## Crew Generation and Hiring

New hires are generated with archetype-weighted skill distributions:

| Constant                     | Value           |
| ---------------------------- | --------------- |
| `MAX_STARTING_PRIMARY_SKILL` | 35              |
| `SECONDARY_SKILL_MIN_RATIO`  | 0.15 of primary |
| `SECONDARY_SKILL_MAX_RATIO`  | 0.50 of primary |
| `TERTIARY_SKILL_MAX_RATIO`   | 0.10 of primary |

**Quality distribution** uses `Math.random()²` (right-skew): most hires are green recruits, elite candidates (primary 26–35) are rare (~13%). Larger stations add a small quality bonus.

**Hire cost:** `baseCost + 20 × totalSkill^1.8`

**Salary multiplier:** `1.0 + 0.5 × (totalSkill / 10)^1.6` — locked at hire time, never increases from post-hire training.

---

## Mastery System (3-Layer Progression)

### Layer 1 — Skill Level (0–100)

The core skill value described above. Gates access to content (ores, equipment, destinations, ship classes).

### Layer 2 — Item Mastery (0–99 per item)

Each skill has specific items that can be individually mastered:

| Skill    | Mastery Items         | Key Format                           |
| -------- | --------------------- | ------------------------------------ |
| Piloting | Routes                | `"earth->gateway_station"` (sorted)  |
| Piloting | Gravity assist bodies | `"ga:earth"`                         |
| Mining   | Ore types             | `"iron_ore"`                         |
| Commerce | Trade routes          | `"earth<=>gateway_station"` (sorted) |
| Repairs  | Equipment types       | `"air_filters"`                      |

**XP curve** follows RuneScape/Melvor style: level 92 ≈ half of level 99. Total XP for level 99 ≈ 13M.

**Item mastery bonuses** (selected thresholds):

| Skill                     | Lv 10            | Lv 50                             | Lv 99                                     |
| ------------------------- | ---------------- | --------------------------------- | ----------------------------------------- |
| Piloting (routes)         | −5% fuel         | +5% evasion                       | −25% fuel, −25% travel time, +15% evasion |
| Piloting (gravity bodies) | +5% success      | −25% penalty                      | +30% success, +25% refund, −75% penalty   |
| Mining (ores)             | +5% yield        | −10% wear, +10% rare variant      | +40% yield, +20% rare, −20% wear          |
| Commerce (trades)         | +3% payment      | +10% payment, exclusive contracts | +20% payment, −15% fuel, best prices      |
| Repairs (equipment)       | +5% repair speed | +20% repair speed                 | +40% repair speed                         |

### Layer 3 — Mastery Pool

A per-skill XP reservoir that fills passively and unlocks skill-wide bonuses:

- **25%** of item mastery XP flows into the pool (50% after skill level 99)
- Pool cap = `1,000 × number of items` in the skill
- Pool can be spent to boost lagging item masteries

**Pool checkpoint bonuses:**

| % Full | Piloting            | Mining                     | Commerce              | Repairs                  |
| ------ | ------------------- | -------------------------- | --------------------- | ------------------------ |
| 10%    | +5% mastery XP      | +5% mastery XP             | +5% mastery XP        | +5% mastery XP           |
| 25%    | −0.1s engine warmup | +5% ore yield              | −5% crew salary       | +5% repair speed         |
| 50%    | +5% fuel efficiency | −10% equipment degradation | +5% sell price        | −10% filter degradation  |
| 95%    | +10% evasion        | +10% double ore drop       | +10% contract payment | +10% bonus repair points |

### Mastery XP Sources

| Action                   | XP                | Recipient      |
| ------------------------ | ----------------- | -------------- |
| Flight arrival           | 100 base          | Helm crew      |
| Gravity assist (success) | 150 base          | Best pilot     |
| Gravity assist (failure) | 50 base           | Best pilot     |
| Contract trip completion | 100 base          | Ship commander |
| Ore unit extracted       | 15 per unit       | Mining crew    |
| Equipment repaired       | 5 per repair tick | Best repairer  |

---

## Skill Gameplay Effects

### Piloting

- **Ship class gating:** Tier I = 0, Tier II = 25, Tier III = 50, Tier IV = 75, Tier V = 95
- **Evasion:** `bestPiloting × 0.002` from scanner/helm crew; captain adds `piloting/200 × 0.15`
- **Crew combat:** `crew.skills.piloting / 10`
- **Gravity assists:** `skillQuality = 0.5 + (pilotingSkill / 100) × 0.5` — affects fuel refund. Per-body mastery adds success chance (+30% at lv 99), refund bonus (+25%), and penalty reduction (−75%)
- **Quest payment bonus:** Scanner/helm/drive crew above skill 50 add small per-crew bonuses

### Mining

- **Ore tier access:** Iron (0) → Exotic Matter (90)
- **Equipment tier access:** Mining Laser (0) → Quantum Resonance Array (80)
- **Yield formula:** `skillFactor = 1 + miningSkill / 100` (1.0× at 0, 2.0× at 100)
- **Captain mining bonus:** `captainMiningSkill / 100` applied fleet-wide

### Commerce

- **Quest payment bonus:** +5% at 25, +10% at 50, +15% at 75, +20% at 95
- **Fuel discount:** −5% at 25, −10% at 50, −15% at 75, −20% at 95
- **Captain income bonus:** `captainCommerceSkill / 100` applied ship-wide
- **Negotiation chance:** `bestCommerce / 200` (captain's ship only)

### Repairs

- **Repair points per crew:** `crew.skills.repairs × 0.05`
- Repairs work in all ship states (docked, in flight, orbiting)

---

## Captain Bonus System

The captain's skills provide ship-wide multiplicative bonuses:

| Captain Skill | Formula     | Effect at Skill 50 |
| ------------- | ----------- | ------------------ |
| Commerce      | skill / 100 | +50% income        |
| Piloting      | skill / 200 | +25% evasion       |
| Mining        | skill / 100 | +50% mining yield  |

Additional captain effects:

- **Rally Defense Bonus:** +5 flat defense when captain aboard
- **Training Aura:** 1.5× training speed on captain's ship
- **Fleet Aura:** +10% income/training at same location, +5% adjacent
- **Negotiation:** Only captain's ship can attempt negotiation in encounters
- **Acting Captain:** Highest-commerce crew provides 25% of commerce bonus only (no piloting/mining)

---

## Design Decisions

See `docs/skill-training-design-research.md` for detailed rationale. Key choices:

1. **Direct training, no XP intermediary** — emergent from job assignment, per CLAUDE.md's guiding principle
2. **No skill decay** — idle games must never punish absence
3. **Power-law over exponential** — gentler falloff keeps progress visible at high levels
4. **Flat event gains** — bypass diminishing returns, creating late-game value shift toward active play
5. **Commerce is event-only** — the one skill with no passive job training, trained exclusively through completing contracts
6. **Captain starts at zero** — the captain IS the player's progression arc
7. **Salary locked at hire** — training crew after hiring is pure upside, rewarding long-term investment
