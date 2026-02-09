# Skill Training Design Research: Coupled vs. Decoupled vs. Hybrid

## Question

Should Starship Commander decouple skill training from performing activities? Is the Star Wars Combine model better for an idle game than our current "learning by doing" approach?

---

## Three Models Compared

### Model A: Coupled ("Learn by Doing")

Skills improve by performing associated activities. You mine ore, your Mining improves. You navigate, your Astrogation improves.

**Examples:** RuneScape, Melvor Idle, Skyrim, Idle Skilling

**Strengths for idle games:**
- Intuitively comprehensible — no tutorial needed for the core loop
- Every action produces dual rewards (immediate output + long-term XP), making even routine play feel productive
- Offline simulation is deterministic: "crew was in engine room for 8 hours → calculate 8 hours of Engineering XP"
- Self-balancing — players naturally train skills they actually use
- Creates meaningful crew placement decisions with long-term consequences

**Weaknesses:**
- Grinding and skill-spam: players optimize for XP/hour, not enjoyable gameplay
- Over long periods, all characters converge toward similar profiles (everyone does everything)
- Developing breadth is slow — crew can only train one skill at a time based on room assignment
- Tension between current effectiveness and future growth (moving your best engineer to the bridge to cross-train piloting makes you worse now)

### Model B: Decoupled ("Passive Queue / Time-Based")

Skills train via a real-time queue independent of gameplay activities. Your character improves whether you play or not.

**Examples:** EVE Online, Ogame, Torn City

**Strengths for idle games:**
- Purest idle fit — progression requires zero interaction beyond queue management
- No grinding required; strategic planning replaces repetitive action
- Offline calculation is trivially simple: `elapsed_time × sp_per_second`
- Decouples session length from progression, removing "must play more" anxiety
- Strong character diversity (different training plans → different builds)

**Weaknesses:**
- Devastating for new player retention. EVE's own developers identified skill training as "one of the big roadblocks preventing new player retention." Players face weeks of real-time waiting before they can use basic capabilities.
- Real-world time gating is psychologically punishing. CCP acknowledged "people were a lot more patient 22 years ago."
- Encourages disengagement. EVE earned the nickname "Skill Queue Online" because many players' primary interaction was checking their queue.
- Disconnection between skill and ability: a character with max Gunnery who has never fired a weapon feels inauthentic.
- Pay-to-win vulnerability: when progression is time-based, selling time-skips is the obvious monetization, and it undermines the system entirely.

### Model C: Hybrid (Both)

One progression axis from doing activities. Another from allocating points, resources, or time to specific improvements.

**Examples:** Starfield (skill points + usage challenges), Fable (typed XP + general XP pool), Idling to Rule the Gods (passive queue + clone automation)

**Strengths for idle games:**
- Offline results are both interesting (varied XP from activities) and predictable (banked skill points to spend)
- Accumulated skill points create a "return to game" decision hook that pure coupled systems lack
- Prevents extreme specialization without restricting it
- Rewards both active and idle play without punishing either
- Multiple progression velocities create satisfying rhythm

**Weaknesses:**
- More complex to explain and balance
- Two systems can conflict — if one dominates, the other feels pointless
- Decision paralysis from rare, permanent skill point allocation
- More exploit surface area

---

## What Star Wars Combine Actually Does

SWC is **not** a time-based training system like EVE. It is a hybrid:

1. **Character creation:** Allocate 42 skill points across 5 priority-ranked groups (14/10/8/6/4 points). This is the most impactful decision in the game — your initial build dwarfs ongoing gains. Racial bonuses stack with allocated points, making race selection deeply strategic.

2. **Ongoing progression:** XP is earned from virtually all gameplay activities (travel, combat, mining, crafting, building, healing, even forum roleplaying). XP → level up → 1 freely allocatable skill point. The XP curve is steep — level 13 requires ~78,000 XP.

3. **Key insight:** SWC's system is front-loaded. You start competent and improve slowly. The game's own community acknowledges "you can build a competent character at the start, and level-up improvements aren't very impressive." The 1 point per level barely moves the needle compared to the 42 at creation.

4. **Force training** is the one exception — it is a dedicated, decoupled activity (1-hour sessions, fixed success chance). But it's a separate system for a subset of characters.

SWC's model is actually closer to what Starship Commander already has than to EVE's pure time-queue. The main differences are SWC's heavy front-loading and the lack of room-based passive XP.

---

## Challenging the Case for Decoupling

### "Decoupled training is more idle-friendly"

**Challenge:** This is true only for the narrowest definition of "idle." Yes, `elapsed_time × rate` is simpler than tick simulation. But Starship Commander already has a tick simulation engine that handles fuel, encounters, gravity, salaries, and equipment degradation. XP calculation adds negligible complexity to that existing simulation. The marginal cost of coupled XP is near zero because the infrastructure already exists.

Meanwhile, pure decoupled training removes the strategic depth of crew placement. If skills train via a queue regardless of room assignment, the question "where do I put my engineer?" loses its long-term dimension. Room assignment becomes a purely tactical, per-flight optimization rather than a strategic investment in crew development.

**Verdict:** The "idle-friendly" advantage of decoupling is real but marginal in a game that already simulates ticks. The cost — losing crew placement strategy — is significant.

### "Decoupled training prevents grinding"

**Challenge:** Starship Commander doesn't have a grinding problem because crew XP is passive. The player doesn't repeatedly click "train" — they assign crew to rooms and go idle. The coupled system generates XP as a side effect of the activity the player would be doing anyway (flying contracts). There is no separate "grind" action to optimize against.

The grinding problem in RuneScape exists because players must actively choose and repeatedly perform training activities. In Starship Commander, the choice is "which room" (set once per flight) and then XP accumulates automatically. This is functionally as passive as a decoupled queue, but with the strategic depth of room placement.

**Verdict:** The anti-grinding argument doesn't apply because the coupled system is already passive.

### "Decoupled training enables more interesting character builds"

**Challenge:** This has merit. In a pure coupled system, a crew member stuck in the engine room for 100 flights becomes a pure engineer with no breadth. However, Starship Commander's existing hybrid (coupled XP + freely allocatable skill points on level-up) already addresses this. Skill points let you invest in any skill regardless of room assignment.

The question is whether 19 total skill points (levels 2-20) across 6 skills (each starting at 3-9, capped at 10) provides enough flexibility. With skills starting at 3-9, many are already near the 10 cap, and 19 points is generous enough to diversify meaningfully. A crew member who earns all their XP from Engineering room assignment but spends skill points on Piloting and Charisma becomes a versatile engineer-turned-renaissance-crew.

**Verdict:** The existing hybrid provides sufficient build diversity. Adding a separate training queue would add complexity without proportional benefit.

---

## Challenging the Case for the Current System

### "Learning by doing is more intuitive"

**Challenge:** Intuitive, yes, but also constraining. If I want my navigator to learn some Engineering, I must pull them off the bridge — where they are providing encounter avoidance bonuses — and put them in the engine room, where they are bad at engineering and provide no immediate benefit. The opportunity cost is high and the payoff is slow.

In a decoupled or deeper hybrid system, I could queue up Engineering training for the navigator while they continue navigating. This eliminates the "train vs. perform" dilemma.

**Counter-challenge:** That dilemma IS the game. If cross-training has no cost, it's not a strategic choice. The tension between "use your best people optimally now" and "invest in future capability" is a core strategic dimension. Removing it makes crew management shallower, not deeper.

**Verdict:** The dilemma is a feature, not a bug — but it should be acknowledged in the UI so players understand the tradeoff they're making.

### "Room assignment locks character development to one axis"

**Challenge:** Valid concern. A crew member in the engine room can only train Engineering via passive XP. Their 6 other skills stagnate except through rare event XP and skill point allocation. Over hundreds of flights, this creates hyper-specialists by default.

**Counter-challenge:** Hyper-specialization is thematically appropriate for a spaceship crew game. Real-world ship crews are specialists. The skill point system provides the escape valve for intentional cross-training. And event XP (encounters, contract completions) provides small amounts of cross-skill XP to all crew, preventing total stagnation.

**Verdict:** This is working as designed. The game should lean into specialization as the default with skill points as the intentional diversification tool. If testing reveals specialization is too extreme, the solution is tuning event XP rates, not restructuring the training model.

### "The system doesn't reward returning to the game"

**Challenge:** In a pure coupled system, returning from idle gives you "stuff accumulated." A hybrid with a decoupled element gives you "stuff accumulated AND decisions to make." The skill point allocation on level-up provides this decision hook, but only at level boundaries. If a player returns after 2 hours and no one leveled up, there's no decision to make about skills.

**Counter-challenge:** The return hook doesn't need to come from the skill system specifically. Contract selection, crew hiring, route planning, and equipment management all provide return decisions. Skill point allocation is a bonus decision, not the primary one.

**Verdict:** The current system provides adequate return hooks. If more are needed, tuning the XP curve to produce more frequent level-ups is simpler than adding a separate training system.

---

## Comparative Summary

| Dimension | Coupled Only | Decoupled Only | Current Hybrid | Deeper Hybrid |
|---|---|---|---|---|
| Intuitive? | High | Moderate | High | Moderate |
| Idle-friendly? | Good (already passive) | Perfect | Good | Good |
| Strategic depth | Moderate (room choice) | Low (queue management) | High (room + points) | Higher (but more complex) |
| New player experience | Good | Poor (time gates) | Good | Good |
| Character diversity | Low (convergence) | High | Moderate-High | High |
| Implementation cost | Already done | Major rework | Already done | Moderate rework |
| Thematic fit | Strong ("learn by doing") | Weak (abstract queue) | Strong | Depends on design |
| Balancing complexity | Low | Low | Moderate | High |

---

## Revised Proposal: Direct Skill Training (No Intermediary)

The original recommendation was to keep the XP → level → skill point hybrid. On further analysis, **cutting out the intermediary** and having rooms directly train skills is the stronger design.

### Why Remove the XP/Level/Skill-Point Layer?

1. **The skill point allocation contradicts the design philosophy.** CLAUDE.md says "game state should be emergent from the behavior of systems." A navigator's astrogation should be the accumulated result of time spent navigating — not an abstract point the player spent from a pool. Skill points are a player override that breaks emergence.

2. **Room assignment IS the decision.** The player already expresses intent about crew development by choosing room assignments. Adding a second decision layer (allocating skill points) doesn't add strategy — it adds an undo button. "I put you in the engine room but spend your points on Piloting" is thematically incoherent.

3. **Simpler mental model.** "Crew train the skill their room uses" requires zero explanation. The XP → level → point → allocation pipeline requires a tutorial.

4. **More idle.** Eliminates the "return to allocate points" interaction. Crew develop automatically while the player is away. No decision backlog accumulates.

---

## Time System Reference

Before the math, the game's time constants:

| Unit | Ticks | Real Time |
|------|-------|-----------|
| 1 tick | 1 | 1 second |
| 1 game day | 48 | 48 seconds |
| 1 game month (30 days) | 1,440 | 24 minutes |
| 1 game year | ~17,520 | ~4.9 hours |
| 1 IRL day | 86,400 | 24 hours |
| 1 IRL week | 604,800 | 7 days |
| 1 IRL month | ~2,592,000 | ~30 days |

**Effective flight time fraction:** Ships aren't always in flight (docking, contract selection, player idle at dock). Estimate ~60% for active players, ~30% for casual players. At 60%: ~51,840 in-flight ticks per IRL day.

---

## Idle Game Pacing Research

From industry research on successful idle games:

**Session patterns:**
- Average idle game session: ~8 minutes (480 ticks)
- Average check-ins per day: 5.3
- Total daily engagement: ~42 minutes

**Retention data:**
- Day 1 retention (top 25%): 42%
- Day 7: 10-15%
- Day 28: 5-10%
- 80% of mobile players abandon within the first week

**The engagement decay principle:** Ideal pacing matches the player's natural attention curve. Multiple resource systems should operate at different time scales:
- Clock A caps every ~20 minutes (short check-in reward)
- Clock B caps every ~5 hours (lunch/dinner check-in)
- Clock C caps every ~2 days (weekly planning layer)

**What kills retention:**
1. Hitting a wall with no visible path forward
2. Punishing absence (losing progress while away)
3. Tedious mechanics that feel like wasted time
4. Number novelty wearing off without new systems to discover

**What sustains retention over months:**
1. Multiple interacting systems requiring strategic rebalancing
2. New mechanics "unfolding" over time (not just bigger numbers)
3. Offline progress creating anticipation to return
4. Always having a visible "next goal" within reach

**Key benchmark:** Melvor Idle, the closest comparable (skill-based idle game), takes ~3,000+ hours for full completion. Individual skills from 1-99 follow a curve where the last 8 levels (92-99) take as long as levels 1-92 combined.

---

## The Three Clocks

Skill training must serve three distinct time horizons simultaneously:

### Short-term Clock: Session-to-Session (hours)

**Goal:** Player returns from idle, sees that crew skills have visibly progressed — ideally with integer skill gains since the last check-in.

At the 1-100 scale, a navigator training astrogation at skill 70 gains ~0.93 points/day. A player who checks in after 12 hours sees ~0.47 points of progress — nearly half a level. A daily check-in often shows a full integer gain. This is a real milestone every 1-2 days at mid-range skills — not a progress bar inching forward, but a number going up.

**Target:** Multiple integer gains per day for new crew (skill 20-50). ~1 integer gain per day at mid-range (50-80). At high skills (90+), gains slow to every 3-6 days — still visible per check-in but creating anticipation.

### Medium-term Clock: Weekly (days to weeks)

**Goal:** Crew members reach decade milestones (70, 80, 90) that represent meaningful tiers of competence.

**Target:** A primary-skill crew member should cross a decade boundary every 1-6 weeks (faster early, slower late). Each decade feels like entering a new tier — a skill-80 navigator is qualitatively different from a skill-60 navigator. These are the milestones that matter strategically.

**Why this matters:** At 1-100, individual integer gains are frequent enough to be the short-term clock. The medium-term "event" shifts to decade boundaries, which have larger gameplay impact and feel like genuine crew development arcs.

### Long-term Clock: Monthly+ (months)

**Goal:** Reaching the 90s represents veteran status. Reaching 100 is mastery. Only crew who have flown with you for months reach these levels.

**Target:**
- Primary skill from 35 to 70: ~4 weeks (crew feels competent, player is hooked)
- Primary skill from 70 to 80: ~3 additional weeks (experienced crew)
- Primary skill from 80 to 90: ~2-3 additional months (veteran territory)
- Primary skill reaching 100: ~12+ months total (mastery, rare achievement)

**Why months:** This creates long-term attachment to crew members. A skill-100 navigator is someone who has been with you through hundreds of flights. Losing them (unpaid wages, combat) has real emotional and mechanical cost. This is the "hobby" phase — the player is invested in their crew's development arc.

---

## Concrete Proposal: Diminishing Returns Direct Training

### Core Formula

Skills are stored as continuous floating-point values (range 1-100). Per tick while in-flight:

```
skill_gain = ROOM_RATE × (SKILL_CAP - current_skill) / SKILL_CAP × match_bonus
```

Where:
- `ROOM_RATE` = base learning rate for the room (see table below)
- `SKILL_CAP` = 100
- `current_skill` = continuous value (e.g. 63.4)
- `match_bonus` = 1.5 if crew's role matches the room's trained skill, 1.0 otherwise

This is a first-order decay toward the cap. The analytical solution is:

```
skill(t) = SKILL_CAP - (SKILL_CAP - skill_0) × e^(-R × t / SKILL_CAP)
```

Where R = effective rate (ROOM_RATE × match_bonus) and t = in-flight ticks.

### Room Training Rates

| Room | Skill Trained | ROOM_RATE | Rationale |
|------|--------------|-----------|-----------|
| Bridge | Piloting (or Astrogation for navigators) | 0.000040 | Active flight operations |
| Engine Room | Engineering | 0.000040 | Keeping engines running |
| Reactor Room | Engineering | 0.000060 | Higher-stakes environment, faster learning |
| Point Defense Station | Strength | 0.000040 | Combat readiness drills |
| Armory | Strength | 0.000020 | Equipment maintenance, less active |
| Cantina | Charisma | 0.000020 | Social interaction, crew welfare |
| Medbay | Loyalty | 0.000020 | Caring for crew, building trust |
| Quarters | None | 0 | Resting |
| Cargo Hold | None | 0 | Uncrewed room |

### Starting Skill Ranges

Crew members are generated with low starting skills — they're raw recruits, not seasoned veterans. The journey from novice to master IS the game.

- **Base skills:** 5-20 (minimal training, basic aptitude)
- **Primary skill:** 20-40 (enough to get the role, not enough to be good at it)

This creates a long growth arc with three distinct phases:
- **Early game (20-50):** Fast gains, 2+ points/day. New crew ramp up quickly. Player is rewarded for playing.
- **Mid game (50-80):** Steady gains, ~1 point/day. Crew are competent and improving. The "habit" phase.
- **Late game (80-100):** Slow gains, days-to-weeks per point. Veteran crew. The "hobby" phase.

### Progression Timeline (Active Player, 60% Flight Time)

Using ROOM_RATE = 0.000040, match_bonus = 1.5 (effective R = 0.000060), 51,840 in-flight ticks/day:

**Navigator training astrogation (starting skill 35):**

| Skill Range | Daily Gain | Days Per Point | IRL Period for 10 Points |
|---|---|---|---|
| 35 → 45 | ~2.02/day | ~0.5 days | ~5 days |
| 45 → 55 | ~1.71/day | ~0.6 days | ~6 days |
| 55 → 65 | ~1.40/day | ~0.7 days | ~7 days |
| 65 → 75 | ~1.09/day | ~0.9 days | ~9 days |
| 75 → 85 | ~0.78/day | ~1.3 days | ~13 days |
| 85 → 90 | ~0.47/day | ~2.1 days | ~11 days |
| 90 → 95 | ~0.31/day | ~3.2 days | ~16 days |
| 95 → 100 | ~0.16/day | ~6.4 days | ~32 days |

**Summary milestones:**

| Milestone | Cumulative IRL Time | Player Phase |
|---|---|---|
| Skill 50 | ~1 week | Hook (early gratification) |
| Skill 70 | ~4 weeks | Habit (crew feels competent) |
| Skill 80 | ~7 weeks | Experienced (crew are reliably good) |
| Skill 90 | ~4 months | Veteran (long-term achievement) |
| Skill 100 | ~12+ months | Mastery (aspirational, extremely rare) |

**Navigator training astrogation (starting skill 20, lowest roll):**

| Milestone | Cumulative IRL Time |
|---|---|
| Skill 50 | ~2 weeks |
| Skill 70 | ~5 weeks |
| Skill 80 | ~9 weeks |
| Skill 90 | ~5 months |
| Skill 100 | ~14+ months |

**Why low starting skills work:** With the diminishing returns curve, low-skill crew develop fast. A skill-35 navigator gains 2+ points per day — multiple level-ups per session in the early game. This is the "hook" phase where idle games need to deliver rapid gratification. By skill 70 they're gaining ~1/day (the steady "habit" phase). By 90+, each point takes days — creating the long-term "hobby" attachment.

The wide range (starting at 20-40, maxing at 100) means crew feel like they genuinely grow from recruits into veterans over months of play. At the old 1-10 scale with starting skills of 6-9, there were only 1-4 points of total growth — barely noticeable. Now there are 60-80 points of growth, each one a visible milestone.

### Casual Player (30% Flight Time)

All timelines roughly double. Skill 80 from starting 35: ~14 weeks. Skill 90: ~8 months. Casual players see slower but still meaningful daily progress.

### Reaching Skill 100: The Mastery Problem

The diminishing returns formula is asymptotic — skill approaches 100 but mathematically never reaches it. Two options:

**Option A: Threshold rounding.** When continuous skill reaches 99.5, it rounds to 100. Still takes 12+ months for active players. Simple, no new mechanics needed.

**Option B: Mastery event.** Passive training caps effective gains at 95. Reaching 100 requires a mastery condition — e.g., 10,000 cumulative ticks in the relevant room AND a specific event trigger (critical navigation save, critical repair, etc.). This creates a memorable "ding" moment and gates mastery behind experience plus achievement.

**Recommendation:** Option A for the POC (simplest). Option B is a future enhancement if mastery needs to feel more earned.

### Visibility Per Check-In

At the target rates, what does the player see when they return?

**At skill 35 (early game, with match bonus):**

| Check-in interval | Gain | Experience |
|---|---|---|
| 4 hours | ~0.34 | Visible fractional progress |
| 12 hours | ~1.01 | Full integer gain |
| 24 hours | ~2.02 | Two levels gained — exciting |
| 1 week | ~14 | Massive jump — crew transformed |

**At skill 70 (mid game, with match bonus):**

| Check-in interval | Gain | Experience |
|---|---|---|
| 4 hours | ~0.18 | Small but visible |
| 12 hours | ~0.55 | Half a point — close to a level |
| 24 hours | ~1.09 | Full integer gain — satisfying daily milestone |
| 1 week | ~7.6 | Several levels — clear weekly progress |

**At skill 90 (late game, with match bonus):**

| Check-in interval | Gain | Experience |
|---|---|---|
| 12 hours | ~0.16 | Barely visible |
| 24 hours | ~0.31 | Slow, deliberate progress |
| 1 week | ~2.2 | 2 points — each one hard-earned |

The wide starting range means early game is fast and exciting (2+ levels/day), mid game is steady (1 level/day), and late game is glacial (1 level every few days). This naturally matches the engagement decay curve — players check in frequently early on and see rapid gains, then settle into a daily habit, then become invested hobbyists watching each point inch upward.

---

## Event-Based Skill Bursts

Events provide direct skill gains that bypass the diminishing returns curve. These are flat amounts — they feel more impactful at higher skill levels, which is intentional (events become the primary mechanism for pushing past the diminishing returns wall).

| Event | Who | Skill | Amount | Equivalent Passive Days (at skill 70) |
|---|---|---|---|---|
| Encounter evaded | Bridge crew | Astrogation | +2.0 | ~2 days |
| Encounter negotiated | Negotiator | Charisma | +2.5 | ~3 days |
| Encounter victory | Combat room crew | Strength | +3.0 | ~3 days |
| Encounter harassment | All crew | Loyalty | +1.0 | ~1 day |
| Encounter boarding | All crew | Loyalty +1.5, Strength +1.5 | — | ~2 days each |
| Contract completed | All crew | Primary skill | +0.8 per leg | ~1 day |
| First arrival at location | All crew | Astrogation | +2.0 | ~2 days |

**Key design property:** Event gains are flat (not diminished by current skill level). At skill 35, an encounter evasion adds +2.0 against a passive rate of ~2.0/day — a nice 1-day spike. At skill 90, the same +2.0 equals ~6+ days of passive training — events become increasingly valuable as passive gains slow down. This creates a natural shift: early game is dominated by passive training, late game is dominated by events and achievements.

**Cross-training effect:** Events that award skill gains to ALL crew (harassment, boarding, contract completion) provide organic breadth. A navigator who never leaves the bridge still slowly accumulates Loyalty and Strength from shared encounters. This prevents total skill stagnation outside the assigned room without requiring crew rotation.

---

## What Happens to Levels and XP?

The XP → level system remains but is repurposed:

| Before | After |
|---|---|
| XP earned from room assignment | XP still earned (unchanged formula) |
| Level up → skill point | Level up → no skill point |
| Skill points spent manually | Skills train directly from room |
| Level used for... nothing specific | Level used for salary tier, prestige display, UI badge |

Levels become a **prestige indicator** — a badge of experience that shows how long a crew member has been active. They can drive salary tiers (higher level = higher salary expectation), hiring prestige (players prefer higher-level crew), and future systems (level requirements for advanced room assignments, officer ranks, etc.).

The `unspentSkillPoints` field is removed. The `spendSkillPoint()` function is removed. The crew tab no longer shows a point allocation panel.

---

## Cross-Training Analysis

**Navigator (astrogation 65, engineering 12) moved to engine room:**

- Engineering gain rate at skill 12: `0.000040 × (100-12)/100 = 0.0000352/tick` (no match bonus — they're a navigator, not an engineer)
- Daily gain at 60% flight: `0.0000352 × 51,840 = 1.82 points/day`
- Engineering 12 → 30 in ~10 days
- Meanwhile: astrogation frozen (no bridge assignment). No decay — skills never decrease.

**Cost:** Ship loses its navigator's encounter avoidance bonuses for the duration. This is the meaningful tradeoff. Cross-training is viable but expensive.

**Observation:** Cross-training is actually *faster* than primary training at high levels because non-primary skills start lower (more headroom in the diminishing returns curve). Engineering 12 → 30 takes ~10 days, while astrogation 80 → 90 takes ~9 weeks. This is a natural and satisfying dynamic: breadth is quick, depth is slow.

---

## Skill Display

At the 1-100 scale, the integer value itself provides sufficient granularity for feedback. No sub-integer progress bar is required (though one could be added for polish). Display format:

```
Engineering  63
Astrogation  71  ▲
```

The `▲` indicator shows which skill is actively being trained by the current room assignment. Tooltip: "71.4 / 100 — training in Bridge at 0.90/day — next level in ~16h"

The tooltip showing the training rate and projected time to next integer serves as the "room training indicator" from the backlog — it makes the training system visible and strategic without a separate UI element.

---

## Data Model Changes

```typescript
// CrewSkills: values become floats in the 1-100 range (e.g., 63.4)
// CrewMember: Remove unspentSkillPoints field
// xp and level remain (prestige/salary purposes)

// Gameplay formulas need rescaling for the 1-100 range.
// The simplest approach: divide by 10 where old formulas expected 1-10.
// Examples:
//   Old: astrogation * 0.02        → New: astrogation * 0.002
//   Old: charisma / 20             → New: charisma / 200
//   Old: 0.5 + strength * 0.05    → New: 0.5 + strength * 0.005
//   Old: strength + weapon.attack  → New: (strength / 10) + weapon.attack
// This preserves identical gameplay behavior at equivalent skill levels.
```

---

## No Skill Decay

Skills never decrease. This is critical for idle game retention. The research strongly warns that "punishing absence" is the #1 abandonment driver. A player who returns after 2 weeks should find their crew exactly as they left them (plus any progress from offline flight time), never worse.

---

## Executive Summary

### Recommendation: Direct skill training with diminishing returns, targeting months-long progression.

**Model:** Room assignment directly trains the room's associated skill. No XP → level → point intermediary for skill growth. Levels remain as a prestige/salary indicator.

**Formula:** `gain/tick = ROOM_RATE × (100 - current) / 100 × match_bonus`

**Pacing targets:**

| Clock | Horizon | What the player sees |
|---|---|---|
| Short (per check-in) | Hours | Integer skill gains every 1-2 days at mid-range |
| Medium (weekly) | Weeks | ~5-7 points gained, approaching decade milestones (70, 80, 90) |
| Long (monthly) | Months | Decade milestones, crew reaching veteran/mastery status |

**Key timelines (active player, primary skill starting ~35):**

| Milestone | Cumulative IRL Time |
|---|---|
| Skill 50 | ~1 week |
| Skill 70 | ~4 weeks |
| Skill 80 | ~7 weeks |
| Skill 90 | ~4 months |
| Skill 100 | ~12+ months |

**Why this works:**
1. Most emergent — skill state is a pure reflection of crew history
2. Most idle — zero player interaction required for progression
3. Clear strategic tradeoff — room placement determines development, cross-training has real cost
4. Event XP provides organic breadth and increasingly matters at high levels
5. Months-long mastery creates attachment to veteran crew
6. No punishment for absence, no decay, always-forward progression

### What to Add to the Backlog

- **Mastery events** (Option B for reaching skill 100) — design specific event triggers per skill
- **UI: skill training indicator** — show `▲` and tooltip with rate/projected time for actively trained skill
- **UI: projected milestone** — "Astrogation 80 in ~3 weeks" based on current room assignment and flight patterns
- **Mentorship (docked)** — one crew member can train another in their strongest skill while docked, providing an alternative training path with a different cost (time at dock instead of room reassignment)
