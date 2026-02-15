# TRAPPIST-1 Swarm Idle - Design Goals

## Vision Statement

Create a browser-first idle/incremental game where the player embodies a biological hive mind swarm expanding across the TRAPPIST-1 system. The swarm grows from a single queen into a planetary organism that replaces native ecosystems through biologically plausible, emergent systems.

This is **not** a traditional RTS and not a clicker. It is a systems-driven swarm metabolism idle game.

---

## Design Pillars (Non-Negotiable)

### 1. Emergent Systems > Arbitrary Scaling

- No meaningless +10% upgrades.
- Swarm performance derives from biological constraints: neural capacity, metabolism, logistics.
- Population emerges from homeostatic equilibrium, not hard caps.
- All numbers must trace back to simulation layers.

---

### 2. Idle-First Respect

- No energy systems.
- No punishments for being offline.
- Offline simulation must be deterministic and fair.
- Returning players receive readable summaries, not raw logs.

Absence is part of the gameplay loop.

---

### 3. Homeostatic Population Control

Population equilibrium must emerge automatically from system mechanics:

- **Neural bandwidth limits efficiency** (coordination constraint)
- **Metabolic throughput limits survival** (energy constraint)
- Workers beyond capacity become inefficient, creating deficits that cause starvation
- This produces automatic equilibrium without hard caps

---

### 4. Gradual Cognitive Load

**Show the mountain, hide the details.**

Locked/future systems appear as aspirational goals:

- "Planetary Expansion — Unlock at 100 Workers"
- "Interplanetary Travel — Requires Spore Launch Mutation"
- "System Brain — Unlock multi-queen coordination"

**What to show:** System names, unlock requirements, the promise of depth ahead.

**What to hide:** Exact formulas, failure mechanics, deep stat breakdowns — until the system is active.

---

### 5. Clarity Over Realism

We simulate biology, but we do not simulate confusion.

Every derived stat must have:

- A breakdown tooltip.
- A "Why is this number this way?" explainer.
- A visible causal chain.

---

## Target Player Profile

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

---

## Core Gameplay Loop (Finalized Structure)

### Active Loop (5–8 min)

1. Review daily swarm summaries
2. Check worker distribution and efficiency
3. Toggle queen directives (gather/idle)
4. Enable/disable egg production
5. Plan expansion into new zones

### Passive Loop (Offline / Background)

1. Workers gather biomass autonomously
2. Queen lays eggs when enabled
3. Population finds equilibrium via starvation/birth
4. Skills improve through activity
5. Zones become saturated

### Expansion Loop (Long-Term)

1. Conquer all zones on home planet
2. Unlock interplanetary mutations
3. Establish queens on new planets
4. Build system-spanning swarm intelligence

---

## System Architecture Principles

### Population Must Be Emergent

Swarm size emerges from biological constraints:

- Neural capacity = f(queens, synaptic nodes)
- Efficiency = f(worker count / neural capacity)
- Starvation deaths = f(energy deficit, worker upkeep)
- Equilibrium emerges naturally

### Skills Must Be Few and Deep

Use few skills with meaningful progression:

- Foraging (0-100): Governs biomass gathering
- Each skill has item mastery (0-99 per food type)
- Diminishing returns curve
- No arbitrary caps

### Cargo-Based Logistics

Workers carry physical biomass:

- Not instant resource transfer
- Must gather, transport, unload
- Creates spatial gameplay (future)
- Cargo limits create throughput constraints

---

## UX Principles

### Every Derived Number Needs:

- Hover breakdown
- Visual causal mapping
- Red/green impact indicators
- Change preview before confirmation

### Reports Must Be Narrative

When returning from idle:

**Good:**

> Day 42 Summary:
> • 12 workers hatched
> • 3 workers died (starvation)
> • Population: 45 workers at 120% neural load
> • Net energy: +156

### Progressive Disclosure

- Use grouping and progressive disclosure.
- Hide advanced math behind expandable panels or tooltips.
- Default view = strategic clarity.
- Advanced view = system breakdown.

---

## v1 Scope Guardrails

### Content Limits

- 1 planet (Asimov/TRAPPIST-1e) fully playable
- 6 other planets visible but inaccessible
- 1 queen
- 1 food type (Surface Lichen)
- 1 skill (Foraging)
- 384 zones (all in "grayed out" state except starting zone)
- No combat
- No structures
- No interplanetary travel

### What We Prove in v1

- Core biomass gathering loop
- Homeostatic population equilibrium
- Command queue system
- Neural capacity constraints
- Skill progression with mastery

---

## Definition of Success

We succeed if:

- Players discuss optimal population sizes.
- The community debates efficiency vs. growth.
- Reviews mention "emergent systems."
- The game supports 100+ hour players.

We fail if:

- It feels like a generic idle clicker.
- Population feels arbitrarily capped.
- Biology is invisible.
- Complexity overwhelms onboarding.

---

## Final Directive

This game must feel like:

> A serious, systems-driven biological simulation
> That happens to play itself while you're away.

Every design and engineering decision should reinforce:

- Emergence
- Homeostasis
- Depth
- Coherent simulation
