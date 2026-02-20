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

All swarm organisms share the same lifecycle cascade. **Every organism type MUST have all three resource pools and implement all four cascade steps. No organism is exempt — including the queen.**

**Required Resource Pools** — every organism has all three:

| Pool               | Interface                      | Purpose                                                                                                                                   | Required            |
| ------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **Energy**         | `energy: EnergyPool`           | Metabolic fuel. Depletes per tick by `metabolismPerTick`. When empty, triggers health drain.                                              | YES — all organisms |
| **Health**         | `health: EnergyPool`           | Structural integrity. Only depletes when energy reaches 0. Drains at `hpDecayPerTickAtZeroEnergy`. When empty, organism dies.             | YES — all organisms |
| **Biomass Buffer** | `biomassBuffer: BiomassBuffer` | Internal food storage. Consumed to refuel energy. Filled by organism-specific intake (worker: from cargo; queen: from worker deliveries). | YES — all organisms |

**Per-tick cascade** (shared `processMetabolismCascade()` function — never reimplement per type):

```
1. energy -= metabolismPerTick                              (always)
2. refuel energy from biomassBuffer up to energy deficit    (if buffer has biomass)
3. if energy == 0: health -= hpDecayPerTickAtZeroEnergy
4. if health == 0: die
```

Step 2 converts biomass buffer → energy each tick. The conversion restores up to the full energy deficit (instant digestion). **Biomass intake (how the buffer gets filled) is separate from the cascade** and differs per organism type — but the cascade itself is identical for all organisms.

**Rate derivation** — metabolism rates are derived from pool sizes and depletion durations, never hardcoded:

```
metabolismPerTick = energyMax / depletionTicks
hpDecayPerTickAtZeroEnergy = healthMax / hpDepletionTicks
```

This ensures tuning is done via meaningful durations (how long to starve, how long to die), with per-tick rates calculated once at entity creation.

**New organism type checklist** — verify ALL of these when adding any organism:

- [ ] Implements `Organism` interface (energy + health + biomassBuffer + metabolism rates)
- [ ] Factory function initializes all three pools with explicit max values
- [ ] Tick function calls shared `processMetabolismCascade()` — never inline the cascade
- [ ] Biomass intake writes to `biomassBuffer`, never directly to `energy`
- [ ] UI displays all three pools (energy, health, biomass buffer)
- [ ] Constants for pool sizes and depletion durations defined in `SWARM_CONSTANTS`

### The Queen

The queen is the neural center of the swarm. **Follows the universal metabolism model** (energy, health, biomass buffer — same cascade as all organisms).

- **Immobile**: Embedded underground for safety
- **Immortal**: Cannot die from age (but can starve via energy→health cascade)
- **Neural Hub**: Coordinates all workers via pheromone/chemical signals
- **Reproductive Engine**: Converts energy into eggs
- **Metabolic Core**: Energy depletes over ~1 year; health drains over ~7 years at zero energy
- **Biomass Buffer**: Workers deliver biomass to the queen's internal buffer (the royal food chamber). The cascade converts buffer → energy each tick. The queen has no cargo — she is immobile and receives food from workers.

**Base Neural Capacity**: 20 workers

- Beyond this, coordination efficiency drops as ratio^4
- Creates natural homeostatic limit without hard cap

### Workers

Workers are the swarm's hands and sensors. **Follows the universal metabolism model** (energy, health, biomass buffer — same cascade as all organisms).

- **Autonomous**: Self-maintain by consuming biomass buffer to refuel energy
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
- Biomass Buffer: max 2, internal food storage (refueled from cargo)
- Spawns with full energy and full biomass buffer — can immediately start gathering

**Cargo System** (purely for biomass transport — separate from internal biomass buffer):

- Workers carry physical biomass externally (max 10 units)
- Gather → transport → unload to queen's biomass buffer
- Workers replenish their own biomass buffer from cargo (separate from the universal cascade)
- Cargo is the backpack. Biomass buffer is the stomach. Energy is the fuel.

**States**:

- `self_maintenance`: Replenishing biomass buffer from cargo
- `gathering`: Filling cargo from zone
- `idle_empty`: No orders, empty cargo
- `idle_cargo_full`: Queen full, can't unload

### Energy Flow

```
Biomass (Surface Lichen)
    → Worker Cargo (gathering — external transport)
    → Worker Biomass Buffer (self-maintenance — internal food storage)
    → Worker Energy (universal cascade — buffer→energy conversion)
    → Surplus cargo delivered to Queen Biomass Buffer
    → Queen Energy (universal cascade — buffer→energy conversion)
    → Eggs → Workers
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

Each tick:

1. **Cargo → biomass buffer** (worker-specific): replenish internal buffer from cargo
2. **Universal metabolism cascade** (shared with all organisms):
   a. Energy depletes by `metabolismPerTick`
   b. Refuel energy from biomass buffer (up to deficit)
   c. If energy = 0: health depletes by `hpDecayPerTickAtZeroEnergy`
   d. If health = 0: die
3. **Execute order**:
   - If order = gather and cargo < max: gather biomass into cargo
   - If cargo = max: deliver to queen's biomass buffer
   - If queen's buffer full: idle with cargo full

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
