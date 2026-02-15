# TRAPPIST-1 Swarm Idle

A biological hive mind idle game set in the TRAPPIST-1 star system.

## Overview

You are not a captain. You are a metabolism.

TRAPPIST-1 Swarm Idle is a systems-driven incremental game where you embody a biological swarm consciousness expanding across an alien star system. Starting with a single queen on the temperate planet Asimov, you must grow your swarm, overcome biological constraints, and ultimately spread to all seven planets.

## Core Concept

The swarm is not an army. It is a planetary organism that replaces ecosystems through biological inevitability. Growth is not about clicking—it's about understanding emergent systems:

- **Neural Capacity**: Each queen can only coordinate so many workers efficiently
- **Homeostatic Equilibrium**: Population finds natural balance through starvation and birth
- **Cargo Logistics**: Workers carry physical biomass, creating spatial constraints
- **Skill Progression**: Workers improve through practice, not arbitrary upgrades
- **Planetary Metabolism**: Planet atmosphere and pressure emerge from zone ecology

## Key Features

### 🧠 Emergent Population Control

No hard caps. Population stabilizes naturally when neural coordination limits and metabolic costs create equilibrium. Workers starve when overextended, recycle when they die, and the swarm finds its own balance.

### 🌍 Seven Worlds to Conquer

All seven TRAPPIST-1 planets are visible from the start, but reaching them requires evolution:

- **Roche** (b): Tidally locked hellscape
- **Pinter** (c): Scorching heat
- **Tarter** (d): Warm edge
- **Asimov** (e): **Starting world** — temperate and welcoming
- **Heinlein** (f): Cold ice world
- **Clarke** (g): Deep frozen
- **Lewis** (h): Outer wasteland

Each world is generated as an organic hex biome map. Zones carry local light bands (light, terminator, dark), terrain, mineral potential, and atmospheric gas contributions. Planet-level atmosphere is derived from those zone states, so terraforming outcomes emerge from expansion instead of static planet stats.

### 📦 Cargo-Based Logistics

Workers carry physical biomass. They must travel to zones, gather food, and return to the queen. This creates throughput limits and spatial gameplay without complex micro-management.

### ⚡ Command Queue System

Set high-level directives ("Gather Biomass" or "Idle") and the queen automatically assigns workers based on their skills. No individual unit control—strategic decisions only.

### 📊 True Idle Gameplay

The swarm operates autonomously. Check in to adjust strategy, enable egg production, or plan expansion. Return to daily summaries showing births, deaths, and net growth.

## How to Play

1. **Start**: You have 1 queen, 0 workers, 50 energy
2. **Enable Production**: Toggle egg production ON
3. **Wait**: First worker hatches in ~1 minute
4. **Gather**: Queen instructs workers to forage for biomass
5. **Grow**: Workers feed the queen, queen lays more eggs
6. **Expand**: Conquer zones, improve skills, find equilibrium

**Pro Tip**: Watch your neural load. Beyond 100% capacity, efficiency drops dramatically. Let the system find its balance.

## Technical Details

- **Time**: 1 tick = 1 real second = 3 game minutes
- **Day**: 480 ticks (~8 real minutes)
- **First Worker**: ~55 ticks (~1 minute IRL)
- **Equilibrium**: 30-60 minutes to find natural balance

## Design Philosophy

This game follows strict emergent systems design:

- **No arbitrary +X% upgrades** — All values derive from simulation
- **No hard population caps** — Homeostasis emerges naturally
- **No punishment for absence** — Offline progress is fair and deterministic
- **Clear causal chains** — Every number has a tooltip explaining why

## Installation

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Technology

- TypeScript
- Vite
- Vitest (testing)

## Documentation

- [Design Goals](DESIGN_GOALS.md) — Core design principles
- [World Rules](WORLDRULES.md) — TRAPPIST-1 biology and mechanics
- [Backlog](BACKLOG.md) — Upcoming features and roadmap
- [Command Queue System](docs/command-queue-system.md) — Hierarchical task distribution

## License

MIT

## Acknowledgments

Planet names honor science fiction authors who imagined life beyond Earth:

- **Asimov** — Isaac Asimov, father of robotics
- **Heinlein** — Robert Heinlein, master of speculative fiction
- **Clarke** — Arthur C. Clarke, visionary of space exploration
- **Lewis** — C.S. Lewis, cosmic mythology
- And the scientists who made these discoveries possible

---

**The swarm is inevitable.**
