# World Rules: TRAPPIST-1 Swarm Biology

## The TRAPPIST-1 System

Located 40 light-years from Earth, TRAPPIST-1 is an ultra-cool red dwarf star hosting seven Earth-sized rocky planets. All seven planets orbit closer to their star than Mercury orbits our Sun, creating a compact, interconnected system.

### Planet Characteristics

| Planet           | Distance (AU) | Character | Conditions                                 |
| ---------------- | ------------- | --------- | ------------------------------------------ |
| **Roche** (b)    | 0.011         | Scorched  | Tidally locked, hellscape, 1000+°C dayside |
| **Pinter** (c)   | 0.015         | Hot       | Potential thin atmosphere, extreme heat    |
| **Tarter** (d)   | 0.021         | Warm      | Warm edge of habitable zone                |
| **Asimov** (e)   | 0.028         | Temperate | **Most Earth-like, starting location**     |
| **Heinlein** (f) | 0.037         | Cold      | Potential water ice, frozen surface        |
| **Clarke** (g)   | 0.045         | Icy       | Thick ice shell, subsurface ocean possible |
| **Lewis** (h)    | 0.063         | Frozen    | Outer edge, deep freeze                    |

_Planet names honor science fiction authors and SETI scientists._

### Planetary Composition

All TRAPPIST-1 planets share remarkably similar densities — about 8% less dense than Earth. This suggests they contain:

- Similar ratios of rock-forming elements
- Less iron than Earth (or iron bound with oxygen)
- More low-density materials (water, oxygen)
- Silicate-rich crusts (SiO₂ predominant)

**For v1:** Only Asimov is accessible. Others visible on system map but require future mutations to reach.

---

## Swarm Biology

### Alien Metabolism (Universal Model)

All swarm organisms share the same energy→health lifecycle cascade. This is the foundational model — every new alien type must implement it.

**Resource Pools**:

- **Energy Pool** (`energy: { current, max }`): Depletes per tick by `metabolismPerTick`. Refueled by consuming biomass. When empty, triggers health drain.
- **Health Pool** (`health: { current, max }`): Only depletes when energy reaches 0. Drains at `hpDecayPerTickAtZeroEnergy`. When empty, organism dies.

**Per-tick cascade**:

```
1. energy -= metabolismPerTick          (always)
2. refuel energy from available biomass  (if possible)
3. if energy == 0: health -= hpDecayPerTickAtZeroEnergy
4. if health == 0: die
```

**Rate derivation** — metabolism rates are derived from pool sizes and depletion durations, never hardcoded:

```
metabolismPerTick = energyMax / depletionTicks
hpDecayPerTickAtZeroEnergy = healthMax / hpDepletionTicks
```

This ensures tuning is done via meaningful durations (how long to starve, how long to die), with per-tick rates calculated once at entity creation.

**When adding a new organism type**: Define pool sizes and depletion durations as named constants in `SWARM_CONSTANTS`. Derive per-tick rates in the factory function. Store derived rates on the entity instance so tooltips can display them.

### The Queen

The queen is the neural center of the swarm:

- **Immobile**: Embedded underground for safety
- **Immortal**: Cannot die from age (but can starve via energy→health cascade)
- **Neural Hub**: Coordinates all workers via pheromone/chemical signals
- **Reproductive Engine**: Converts energy into eggs
- **Metabolic Core**: Energy depletes over ~1 year; health drains over ~7 years at zero energy

**Base Neural Capacity**: 20 workers

- Beyond this, coordination efficiency drops as ratio^4
- Creates natural homeostatic limit without hard cap

### Workers

Workers are the swarm's hands and sensors:

- **Autonomous**: Self-maintain by consuming cargo to refuel energy
- **Controlled**: Receive orders from queen via command queue
- **Mortal**: Die from starvation (energy→health cascade). No natural aging.
- **Skilled**: Improve at foraging through practice

**Lifecycle**:

1. **Egg** (10 ticks): Queen lays using energy
2. **Incubation** (30 ticks): Develops in protected chamber
3. **Maturation** (15 ticks): Larval stage, minimal activity
4. **Worker** (no fixed lifespan): Lives until energy starvation kills it

**Resource Pools** (follows universal metabolism model):

- Energy: max 10, depletes in 100 ticks without food
- Health: max 100, depletes in 20 ticks at zero energy
- Spawns with full energy — can immediately start gathering

**Cargo System** (purely for biomass delivery):

- Workers carry physical biomass (max 10 units)
- Gather → transport → unload to queen
- Self-maintenance: consume from cargo to refuel energy (at metabolism rate)
- Cargo is not the worker's food source — energy is. Cargo feeds energy.

**States**:

- `self_maintenance`: Consuming from cargo to refuel energy
- `gathering`: Filling cargo from zone
- `idle_empty`: No orders, empty cargo
- `idle_cargo_full`: Queen full, can't unload

### Energy Flow

```
Biomass (Surface Lichen)
    → Worker Cargo (gathering)
    → Worker Energy (self-maintenance, metabolism rate)
    → Surplus cargo delivered to Queen Energy
    → Queen Energy → Eggs → Workers
```

**Conversion**: 1 Biomass = 1 Energy (v1)

**Metabolic Costs** (derived from constants, not hardcoded):

- Worker energy drain: `WORKER_ENERGY_MAX / WORKER_ENERGY_DEPLETION_TICKS` = 0.1/tick
- Queen energy drain: derived from alien type (`energyToZeroYears`)
- Egg production: 10 energy per egg

---

## Neural Capacity & Homeostasis

### Coordination Efficiency

Swarm efficiency depends on neural saturation:

```
if (workers <= capacity):
    efficiency = 100%
else:
    efficiency = 100% / (ratio^4)
```

**Example**:

- 20 workers / 20 capacity = 100% efficiency
- 40 workers / 20 capacity = 6.25% efficiency
- 80 workers / 20 capacity = 0.39% efficiency

### Metabolic Equilibrium

Population stabilizes when:

```
(Production × Efficiency) = (Worker Upkeep + Queen Cost + Egg Cost)
```

**If deficit**: Workers starve (k = 0.5 coefficient)
**If surplus**: Workers multiply via eggs

This creates automatic equilibrium without hard caps.

### Recycling

Dead workers are recycled:

- 70% of biomass cost recovered
- Returns to available biomass pool
- Creates nutrient cycling loop

---

## Zone Ecology

### Zone Structure

Each planet divided hierarchically:

- **Planet** → 6 Continents → 8 Regions each → 8 Zones each
- **Total**: 384 zones per planet

Zones are generated as contiguous organic hex blobs with clustered biomes. Biomes are not assigned per-cell randomly; local environmental fields and neighbor smoothing produce coherent patches (for example, adjacent water basins, mineral-rich ridges, and dark-side frozen bands).

### Zone States

1. **Unexplored**: Grayed out, no information
2. **Exploring**: Workers mapping territory
3. **Combating**: Fighting native predators (v2)
4. **Converting**: Establishing swarm presence
5. **Harvesting**: Active biomass extraction
6. **Saturated**: Maximum extraction reached

### Biomass Availability

Each zone has intrinsic biomass rate:

- **Surface Lichen**: Base photosynthetic growth
- Varies by zone (0.1 to 2.0 food per tick potential)
- Depletes slightly as harvested (recovers over time)

### Insolation Bands (Tidally Locked Worlds)

Every zone belongs to one insolation band:

- `light`: Permanent day side receiving direct stellar flux
- `terminator`: Day/night boundary with moderate gradients
- `dark`: Permanent night side with minimal direct flux

Insolation is a first-order input for zone temperature, terrain, atmospheric retention, and biomass potential.

### Planetary Atmospheric Metabolism

Planet atmosphere is emergent from zone-level contributions.

Each zone provides:

- Atmospheric mass contribution
- Gas fractions (`N2`, `CO2`, `O2`, `CH4`, inert gases)

Planet values are derived, never hardcoded:

- `planetAtmosphericMass = sum(zone.atmosphericMass)`
- Planet composition is the mass-weighted average of zone gas fractions
- Planet pressure is derived from total atmospheric mass

As zones are converted and managed by the swarm, the aggregate atmosphere shifts organically. Terraforming is therefore a simulation outcome, not a scripted milestone.

### Predators (v2)

Native organisms resist swarm expansion:

- Strength 1-2000+ scale
- Must be defeated to harvest zone
- Auto-resolved combat (workers vs. predators)
- Defeated zones become harvestable

---

## Time System

**Game Time Progression**:

- 1 tick = 1 real second = 3 game minutes (180 seconds)
- 1 game day = 480 ticks (~8 real minutes)
- 1 game month (30 days) = 14,400 ticks (~4 real hours)

**Pacing**:

- First worker: ~1 minute IRL
- Population equilibrium: ~30 minutes IRL
- Planet conquest: Hours to days

---

## Command Queue System

### Hierarchy

```
Player (sets high-level directive)
    ↓
Queen (generates orders)
    ↓
Command Queue
    ↓
Workers (pull and execute)
```

### Queen Directives (v1)

**"Gather Biomass"**:

- Generate "gather_biomass" orders
- Assign to highest-skilled available workers
- Workers fill cargo, return to queen

**"Idle"**:

- Generate "idle" orders
- Workers self-maintain then wait
- Conserves energy

### Order Assignment

Orders are assigned via two mechanisms:

1. **Event-driven** (immediate): When a worker hatches, the queen assigns it an order via the `worker_hatched` event bus. No waiting for the next evaluation cycle.
2. **Periodic re-evaluation** (every 10 ticks): Queen re-evaluates all idle workers, ranking by foraging skill, assigning gathering orders to highest-skilled first.

### Worker Decision Loop

Each tick (follows universal metabolism cascade):

1. Energy depletes by `metabolismPerTick`
2. If energy < max and has cargo: consume from cargo to refuel energy
3. If energy = 0: health depletes by `hpDecayPerTickAtZeroEnergy`
4. If health = 0: die
5. Execute order:
   - If order = gather and cargo < max: gather biomass into cargo
   - If cargo = max: deliver to queen
   - If queen full: idle with cargo full

---

## Skill System

### Foraging

**Global Skill**: 0-100 progression

- Governs base gathering rate
- Diminishing returns curve

**Mastery Item**: Surface Lichen

- 0-99 mastery per food type
- Governs energy yield efficiency
- XP gained per food gathered

**Skill Effects**:

- Level 25: Can see food quality
- Level 50: Gather from adjacent zones
- Level 75: Auto-prioritize rich zones
- Level 99: +50% all food yields

### Mastery Bonuses (Per Food Type)

- Level 25: +10% energy yield
- Level 50: +25% energy yield
- Level 75: +50% energy yield
- Level 99: +100% energy yield

---

## Daily Summaries

Every game day (480 ticks), generate summary:

```
Day 42 Summary:
• 12 workers hatched
• 3 workers died (starvation)
• Population: 45 workers (120% neural load)
• Net energy: +156
```

Queen deaths highlighted:

```
Day 67 Summary:
• 8 workers died (starvation)
• 1 QUEEN died (starvation)
• ⚠️ CRITICAL: Swarm collapse imminent
```

---

## Future Expansion (Backlog)

### Multi-Queen

- Each queen controls own worker pool
- Separate command queues
- Queens coordinate via higher-level brain structures

### Interplanetary Travel

- Spore launch mutations
- Moon waypoints
- Atmospheric entry adaptations
- Planet-specific resources

### Structures

- Synaptic nodes (neural capacity)
- Brood chambers (egg production)
- Energy membranes (passive generation)

### Advanced Foods

- Underground biomass
- Fauna hunting (combat)
- Thermal vent organisms
- Crystal-silicate flora

### Combat

- Predator clearing
- Native organism harvesting
- Zone defense
- Combat-specialized workers

---

## Design Philosophy

This ruleset balances:

1. **Biological Plausibility**: Energy, metabolism, neural limits
2. **Emergent Complexity**: Population finds own equilibrium
3. **Idle Respect**: No constant attention required
4. **Strategic Depth**: Skill assignment, efficiency optimization
5. **Progressive Disclosure**: Simple start, deep mastery

The swarm is not an army. It is a metabolism.
