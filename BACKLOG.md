# Swarm Backlog

This file tracks deferred features and known gaps for TRAPPIST-1 Swarm Idle.

---

## Planetary Metabolism Phase 2

Follow-up items after zone-derived atmosphere v1:

- Queen internal metabolic pools (`biomass`, `carbon`, `energy`, `nutrients`) instead of a single energy lane
- Alternative resource acquisition loops (atmospheric carbon fixation, mineral nutrient extraction, thermal/photonic energy harvesting)
- Planet-specific atmospheric resistance curves that change terraforming speed
- Atmosphere stability and circulation mechanics between neighboring zones
- Biome succession over long horizons (converted zones influencing nearby unmanaged zones)
- Define explicit zone ownership acquisition rules independent from lifecycle state names (`exploring/converting/harvesting`)

**Prerequisites**: Mature zone ecology loop, expanded resource UI, balancing pass.

---

## Multi-Queen System

Enable multiple queens each controlling separate worker pools:

- Each queen maintains separate command queue
- Workers "belong" to specific queen
- Queens can be on different planets
- Worker transfer between queens (future)
- Queen reproduction (how to spawn new queens?)

**Prerequisites**: Interplanetary travel, planetary expansion

---

## Interplanetary Travel

Enable swarm expansion beyond starting planet:

- **Spore Launch Mutation**: Unlock ability to launch reproductive spores
- **Atmospheric Entry**: Mutations for different planet conditions
- **Moon Waypoints**: Use moons as staging points between planets
- **Spore Ships**: Organic vessels carrying queen embryos
- **Cross-Planet Logistics**: Move resources between planets

**Planets to Unlock**:

- Roche (b): Extreme heat adaptation required
- Pinter (c): Heat resistance
- Tarter (d): Moderate conditions
- Heinlein (f): Cold adaptation
- Clarke (g): Extreme cold
- Lewis (h): Deep freeze survival

**Prerequisites**: Planetary conquest, mutation system

---

## Combat System

Auto-resolved predator clearing for zone conquest:

- **Predator Strength**: 10-tier system (1-2000+)
- **Combat Workers**: Specialized soldier caste (mutation unlock)
- **Auto-Resolution**: Worker strength vs predator strength
- **Casualties**: Workers die in combat
- **Rewards**: Defeated zones become harvestable
- **Biomass Bonus**: Predators yield extra biomass

**Flavor Text Progression**:

1. "Scattered Resistance"
2. "Minor Friction"
3. "Localized Defenses"
4. "Established Presence"
5. "Dominant Ecosystem"
6. "Aggressive Biome"
7. "Fortified Territory"
8. "Hostile Dominance"
9. "Extreme Resistance"
10. "Perfected Defense"

**Prerequisites**: Zone system, mutation system

---

## Structure System

Biological buildings grown from hive:

### Synaptic Nodes

- Extend neural capacity
- +10 capacity per node
- Requires biomass + time to grow

### Brood Chambers

- Accelerate egg production
- Parallel laying (multiple eggs simultaneously)
- Requires energy to maintain

### Energy Membranes

- Passive energy generation
- Solar/thermal harvesting
- Reduces biomass dependence

### Digestive Nodes

- Improve biomass conversion efficiency
- +10% energy per biomass

**Prerequisites**: Silicon resource, building mutations

---

## Advanced Foods

Multiple food types with different characteristics:

| Food Type      | Skill Req | Energy | Notes                |
| -------------- | --------- | ------ | -------------------- |
| Surface Lichen | 0         | 1      | Starting food        |
| Microbial Mats | 5         | 2      | Damp areas           |
| Creeping Moss  | 20        | 4      | Ground cover         |
| Nodule Fungi   | 25        | 6      | Underground          |
| Frond Weeds    | 50        | 10     | Tall vegetation      |
| Shell Crawlers | 55        | 15     | Small fauna          |
| Burrow Nests   | 75        | 25     | Colony organisms     |
| Chitin Beasts  | 80        | 40     | Large fauna (combat) |
| Crystal Flora  | 95        | 80     | Silicate-based       |
| Thermal Vents  | 95        | 100    | Extreme heat only    |

**Zone Suitability**: Different zones favor different foods
**Skill Gates**: Higher foods require foraging skill
**Combat Requirement**: Fauna requires combat to harvest

**Prerequisites**: Combat system, zone specialization

---

## Brain Hierarchy System

Automation through biological intelligence:

| Level             | Scope       | Unlock       | Effect                            |
| ----------------- | ----------- | ------------ | --------------------------------- |
| Local Brain       | Zone        | 50 workers   | Auto-assign workers to rich zones |
| Regional Brain    | Region      | 200 workers  | Auto-expand to adjacent zones     |
| Continental Brain | Continent   | 1000 workers | Auto-conquer continent            |
| Planetary Brain   | Planet      | 5000 workers | Auto-manage planet                |
| System Brain      | Star System | Multi-planet | Coordinate multi-planet swarm     |

**Implementation**: Brain structures (grown like other structures)
**Player Override**: Can always manually control
**Visual**: Shows "automation active" indicators

**Prerequisites**: Structure system, multi-queen

---

## Mutation System

Environmental adaptation through genetic evolution:

### Discovery Mechanism

- Environmental pressure → mutation unlock
- Example: Workers dying to cold → Cold Resistance mutation appears

### Unlock Costs

- Genetic Material (from consuming native organisms)
- Energy
- Biomass

### Mutation Types

- **Environmental**: Heat/cold/radiation resistance
- **Structural**: Enable new structure types
- **Organism**: Unlock new worker castes (combat, building)
- **Metabolic**: Energy efficiency, cargo capacity

### Success Chance

- Increases with failed attempts
- Never guaranteed on first try
- No penalty for failure (just time cost)

**Prerequisites**: Genetic Material resource, native organism harvesting

---

## Zone Expansion

Richer zone mechanics:

### Zone Visualization

- Mini-map showing worker positions
- Gathering animation (movement to targets)
- Biomass depletion visualization
- Recovery over time

### Zone Specialization

- Some zones better for certain foods
- Rare zones with high predator strength but rich rewards
- Zone connections (adjacency matters)

### Predator Respawning

- Defeated predators slowly return
- Requires patrol workers
- Creates ongoing maintenance

---

## System Map Enhancements

### Planet Details

- Hover for planet info
- Click to zoom
- Conquest progress ring
- Atmosphere/temperature indicators (locked until visited)

### Travel Planning

- Show distance between planets
- Required mutations for each
- Estimated travel time (spore launch)

### Multi-Planet View

- All planet status at glance
- Resource flows between planets
- Alert for problems on distant planets

---

## Worker Specialization

Different worker types via mutations:

### Foragers

- Standard gathering workers
- Best at biomass collection

### Soldiers

- Combat-specialized
- Required for predator clearing
- Higher upkeep cost

### Builders

- Construct structures
- Required for hive expansion
- Slower movement

### Scouts

- Fast exploration
- Reveal zone info quickly
- Low cargo capacity

**Recruitment**: Spawn via queen with type selection (costs more)
**Evolution**: Workers can transform (time + biomass cost)

---

## Procedural Zone Names

Expand zone naming system:

**Adjectives**: Fertile, Vibrant, Dormant, Pulsing, Resonant, Silent, Hungry, Generous, Hostile, Welcoming, Deep, Surface, Outer, Inner, Prime, Secondary, Nascent, Ancient, Shifting, Stable

**Nouns**: Essence, Biomass, Vitality, Resonance, Pulse, Thrum, Bloom, Nexus, Lattice, Matrix, Core, Heart, Cradle, Crucible, Wellspring, Breach, Threshold, Vantage, Reach, Hollow

**Generate**: [Adjective] [Noun]

- "Fertile Cradle"
- "Silent Hollow"
- "Pulsing Nexus"
- "Ancient Matrix"

---

## Known Gaps

### v1 Gaps (To Fix Before Release)

- **Zone generation**: Procedural names and resource distribution
- **Movement system**: Worker gather cycle (go to target → gather → return)
- **Visual representation**: Zone-level orrery with worker positions
- **Daily summaries**: Aggregate death/hatch stats

### Future Gaps

- **Save migration**: Currently breaking change (v100), future versions need migrations
- **Mobile optimization**: UI responsive design
- **Tutorial**: Onboarding for swarm mechanics
- **Sound**: Ambient audio
- **Achievements**: Progress milestones

---

## Completed Features

- [x] Single-resource economy (Energy/Biomass)
- [x] Homeostatic population control
- [x] Neural capacity system
- [x] Command queue architecture
- [x] Cargo-based logistics
- [x] TRAPPIST-1 planetary data
- [x] Zone hierarchy (384 zones/planet)

---

## Priority Queue

### Next 3 Features (High Priority)

1. Movement system (worker positioning)
2. Zone-level visualization
3. Daily summary system

### Following 5 Features (Medium Priority)

4. Combat system
5. Mutation system
6. Advanced foods
7. Structure system
8. Multi-queen support

### Long-term (Low Priority)

9. Interplanetary travel
10. Brain hierarchy automation
11. Worker specialization
12. System map enhancements
