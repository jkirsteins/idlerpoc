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

## Executive Summary and Recommendations

### Recommendation: Keep the current hybrid model. Do not decouple skill training.

The existing design — coupled passive XP from room assignment + freely allocatable skill points on level-up — is already the right model for this game. Here's why:

1. **The SWC comparison is misleading.** Star Wars Combine doesn't use EVE-style decoupled training. SWC uses activity-based XP → level-up → allocatable skill points, which is structurally identical to Starship Commander's current design. The main SWC difference (heavy front-loading at character creation) is a separate design question, not a training model question.

2. **The coupled axis is already passive.** The "grinding" problem that decoupled systems solve doesn't exist here. Crew XP accumulates automatically from room assignment during flight. The player sets crew placement once and goes idle. This is functionally as hands-off as a training queue.

3. **Room assignment as strategic investment is the game's unique strength.** Where you put your crew determines both their immediate effectiveness and their long-term development. This dual-purpose decision is more interesting than a separate training queue bolted onto room assignment.

4. **The skill point system already provides the flexibility a decoupled element would add.** Players can invest points in any skill regardless of training history. This prevents the "locked into one axis" problem without the complexity of a separate training system.

5. **Implementation cost matters.** The current system is designed and partially implemented. A decoupled training system would require new UI (training queue interface), new mechanics (training rates, queue management, interruption handling), and new balancing (two independent progression rates that must stay meaningful). The ROI is low relative to the design benefit.

### Suggested Tuning (Not Structural Changes)

If playtesting reveals issues with the current model, address them through tuning rather than restructuring:

- **If characters specialize too extremely:** Increase event XP rates or add new cross-skill event types (e.g., "crew bonding during long flight" gives small XP to all skills for all crew)
- **If skill points feel too rare:** Adjust the XP curve to produce more level-ups, or grant bonus skill points from milestone achievements
- **If the return-to-game hook is weak:** Add "training insight" — a small passive XP bonus to all crew's lowest skill while docked, representing shore leave self-improvement. This is thematically appropriate and adds a micro-decision (how long to stay docked) without a full training queue
- **If players want more control over development:** Add "mentorship" — a docked-only activity where one crew member tutors another, transferring XP in their strongest skill. This adds a coupled training option without decoupling from the activity model

### What to Add to the Backlog

- **Docked training activities** (mentorship, shore leave bonuses) — as a tuning lever if playtesting shows specialization is too rigid
- **UI: room training indicators** — show what skill is being trained per crew member, making the coupled system's mechanics visible and strategic
- **UI: "projected level-up" display** — show estimated time to next level based on current room assignment, helping players plan crew placement
