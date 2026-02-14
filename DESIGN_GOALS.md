# Project Design Guidance Report

## Working Title: Torchline (placeholder)

---

# 1. Vision Statement

Create a browser-first idle/incremental game set in a hard sci-fi solar system where:

- All numbers emerge from interacting systems.
- Player absence is always respected and rewarded.
- Depth exists for system thinkers, but onboarding remains approachable.
- The experience feels like "spreadsheet optimization in space" with narrative flavor.

This is **not** a traditional space sim and not a clicker.
It is a systems-driven fleet management idle game.

---

# 2. Design Pillars (Non-Negotiable)

## 1. Emergent Systems > Arbitrary Scaling

- No meaningless +10% upgrades.
- Ship performance derives from physics + crew + equipment.
- Economy derives from distance, risk, and infrastructure.
- Combat derives from mass, thrust, crew skills, and decision types.

If a number exists, it must trace back to a simulation layer.

---

## 2. Idle-First Respect

- No energy systems.
- No punishments for being offline.
- Offline simulation must be deterministic and fair.
- Returning players receive a readable "mission report," not raw logs.

Absence is part of the gameplay loop.

---

## 3. Gradual Cognitive Load

**Show the mountain, hide the details.**

Locked/future systems appear as aspirational goals with clear unlock conditions:

- "Class II Ships — Unlock at Piloting 20"
- "Radiation Exposure — Active beyond Mars orbit"
- "Fleet Coordination — Unlock at 2 ships"

This creates anticipation, goal clarity, and progress tension without overload.

**What to show:** System names, unlock requirements, the promise of depth ahead.

**What to hide:** Exact formulas, failure mechanics, deep stat breakdowns, detailed UI panels — until the system is active for the player.

Natural gating through piloting skill requirements, credit thresholds, and ship class capabilities is preferred over explicit tutorial unlock sequences.

---

## 4. Clarity Over Realism

We simulate physics, but we do not simulate confusion.

Every derived stat must have:

- A breakdown tooltip.
- A "Why is this number this way?" explainer.
- A visible causal chain.

---

# 3. Target Player Profile

Primary player:

- Age 25–45
- Comfortable with spreadsheets
- Has played incremental games deeply
- Enjoys optimization puzzles
- Plays in bursts (5–10 minutes) throughout the day

We optimize for:

- Long-term retention
- Systems mastery
- Community discussion
- Steam-positive-review type players

We are not targeting casual mobile idle players.

---

# 4. Core Gameplay Loop (Finalized Structure)

### Active Loop (5–8 min)

1. Review mission reports
2. Adjust routes
3. Assign crew
4. Upgrade equipment
5. Accept higher-risk contracts

### Passive Loop (Offline / Background)

1. Ships run routes
2. Skills gain XP
3. Ores accumulate
4. Trade cycles generate profit
5. Random encounters resolve

### Expansion Loop (Long-Term)

1. Unlock new ship class
2. Expand to new orbital band
3. Introduce new resource
4. Increase fleet size
5. Unlock new mastery branch

---

# 5. System Architecture Principles

## Ship Performance Must Be Emergent

Ship performance must derive from physics simulation, not flat stats:

- Range = f(engine thrust, fuel capacity, total mass, crew consumption, provisions)
- Travel Time = f(delta-v required, thrust-to-mass ratio, skill modifiers)

Formulas must be deterministic, scale smoothly across ship classes, and avoid exponential runaway early.

---

## Skills Must Be Few and Deep

Use few skills with meaningful progression and diminishing returns:

- Each skill: 0–100 progression with diminishing returns curve
- Specialization unlocks at higher tiers
- Mastery bonuses layered on top

Skill scaling must feel meaningful at every tier without trivializing earlier ships.

---

## Mastery Enhances Efficiency, Never Rewrites Physics

Mastery bonuses must not break simulation integrity:

- Per-item mastery (routes, ores, equipment)
- Skill XP progression
- Global mastery checkpoints

Mastery should enhance efficiency (time, consumption, success rates), not rewrite physics constraints.

---

## Survival Complexity Introduced Through Natural Gating

Do not enable all survival systems at start. Use ship class requirements to gate complexity:

- Fuel, provisions, repairs always active
- Advanced systems (radiation, zero-g degradation, reactor heat) unlock with higher-tier ships or deeper-space destinations

Each system must have clear UI feedback, predictable failure modes, and no hidden math.

---

# 6. UX Principles

## Every Derived Number Needs:

- Hover breakdown
- Visual causal mapping
- Red/green impact indicators
- Change preview before confirmation

---

## Reports Must Be Narrative

When returning from idle:

Bad:

> +1245 credits

Good:

> 3 successful cargo runs to Mars
> 1 radiation storm encountered
> Chief Engineer gained Repairs (41 → 43)
> Net profit: 1,245 credits

Reports are emotional reinforcement.

---

## Progressive Disclosure Reduces Spreadsheet Fatigue

- Use grouping and progressive disclosure.
- Hide advanced math behind expandable panels or tooltips.
- Default view = strategic clarity.
- Advanced view = system breakdown.

---

# 7. v1 Scope Guardrails

To ship within a reasonable timeframe, the initial version targets:

## Content Limits

- 5 ship classes max
- 13 locations max
- 4 skills only
- 9 ores max
- 6 encounter types max
- No procedural galaxy expansion

Do not expand beyond Jupiter in v1.

Future expansion can extend to Saturn+, but v1 must prove the core loop first.

---

# 8. Platform Strategy

Primary: Browser
Secondary: Steam wrapper

Browser version:

- Free
- Polished demo
- Cloud saves optional

Steam version:

- Premium
- Expanded features
- Better UI polish
- Achievements
- Potential mod support

Do not rely solely on browser distribution for revenue viability.

---

# 9. Monetization Philosophy

Allowed:

- Premium one-time purchase
- Cosmetic ship skins
- Supporter tier

Not Allowed:

- Energy systems
- Loot boxes
- Paid power boosts
- Ads

Long-term trust > short-term monetization.

---

# 10. Risk Mitigation

## Complexity Risk

Solution:

- Progressive system unlocking
- Simplified default UI mode
- Clear tooltips

## Player Churn Risk

Solution:

- Meaningful early ship upgrade
- First major unlock within 30 minutes
- Visible long-term goal (Jupiter expansion)

## Balance Risk

Solution:

- Internal telemetry
- Early closed testing in incremental communities
- Economy modeling before launch

---

# 11. Core Differentiation to Protect

If scope cuts are required:

Cut:

- Advanced encounter variety
- Extra ores
- Secondary mechanics

Do NOT cut:

- Emergent system identity
- Mastery depth
- Fleet expansion fantasy
- Solar-system progression arc

---

# 12. Definition of Success (Design)

We succeed if:

- Players discuss optimization strategies.
- The community debates optimal trade routes.
- Steam reviews mention "deep systems."
- The game supports 100+ hour players.

We fail if:

- It feels like a generic idle clicker.
- Systems feel arbitrary.
- Physics is invisible.
- Complexity overwhelms onboarding.

---

# 13. Final Directive

This game must feel like:

> A serious, systems-driven management sim
> That happens to play itself while you're away.

Every design and engineering decision should reinforce:

- Respect
- Clarity
- Depth
- Coherent simulation
