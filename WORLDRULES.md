# World Rules: Spaceship Classes & Power Systems

## Implementation References

**For specific ship models, engines, rooms, equipment, and gameplay systems, see the code:**

- Ship models: `src/shipClasses.ts`
- Engines: `src/engines.ts`
- Room types: `src/rooms.ts`
- Ship equipment: `src/equipment.ts`
- Crew equipment: `src/crewEquipment.ts`
- Crew roles: `src/crewRoles.ts`
- Factions: `src/factions.ts`
- Space locations: `src/spaceLocations.ts`
- Level system: `src/levelSystem.ts`

---

## Ship Classification by Operational Range

### Class I: Orbital Maintenance Vessels (OMV)

**Range**: 0-2,000 km (LEO operations)
**Typical Missions**: Station resupply, orbital repairs, satellite servicing
**Travel Time**: Minutes to hours

**Constraints**:

- Cannot escape Earth's gravity well without external assistance
- Limited delta-v budget (typically 500-2,000 m/s)
- No planetary transfer capability
- Designed for frequent short burns, not sustained acceleration

### Class II: Inner System Vessels (ISV)

**Range**: Earth-Moon, Earth-Mars orbit, Asteroid Belt operations
**Typical Missions**: Mining operations, lunar/asteroid resource extraction, satellite deployment
**Travel Time**: Days to weeks

**Constraints**:

- Can achieve escape velocity from Earth (11.2 km/s minimum)
- Limited sustained acceleration (weeks, not months)
- Effective range: ~3 AU from departure point
- Requires orbital mechanics planning (Hohmann transfers, gravity assists)

### Class III: Interplanetary Vessels (IPV)

**Range**: Inner to outer solar system
**Typical Missions**: Planetary trade, long-range exploration, colony support
**Travel Time**: Weeks to months

**Constraints**:

- Sustained acceleration capability for weeks/months
- Can reach outer planets (Jupiter, Saturn) within human-tolerable timeframes
- Effective range: Entire solar system
- Requires significant fuel/reaction mass for brachistochrone trajectories

### Class IV: Gap-Capable Vessels (GCV)

**Range**: Interstellar distances
**Typical Missions**: Interstellar trade, exploration, military operations
**Travel Time**: Days to weeks (including gap transit)

**Constraints**:

- Requires minimum entry velocity (0.3c) to engage gap drive
- Gap field unstable; requires precise navigation
- Gap drive range: 1-50 light-years per insertion (dependent on power and stability)
- Course drift and navigational errors increase with distance
- Cannot engage gap drive within strong gravity wells (>0.01g)
- Requires substantial conventional drive for acceleration to gap threshold

---

## Power Systems & Capabilities

### 1. Chemical Propulsion

**Applications**: Class I only
**Acceleration**: 0.001-0.01g
**Thrust Duration**: Minutes to hours
**Delta-v Budget**: 500-2,000 m/s

**Advantages**:

- Simple, proven technology
- High thrust-to-weight ratio
- Minimal infrastructure

**Limitations**:

- Extremely limited delta-v
- Cannot sustain acceleration
- Requires refueling for extended operations
- Reaction mass = fuel (both burned together)

---

### 2. Nuclear Fission (Thermal Rockets)

**Applications**: Class I-II
**Acceleration**: 0.001-0.005g sustained
**Thrust Duration**: Days to weeks
**Delta-v Budget**: 10,000-50,000 m/s
**Specific Impulse**: 800-1,000 seconds
**Reaction Mass Ratio**: 3:1 (3 kg propellant per 1 kg payload for typical mission)

**Advantages**:

- High specific impulse vs. chemical
- Proven technology base
- Long operational lifetime

**Limitations**:

- Low thrust limits acceleration
- Radiation shielding adds mass
- Cannot achieve outer system in reasonable timeframes
- Requires separate reaction mass (typically liquid hydrogen)

---

### 3. Fusion Drives (D-He3 or D-D reactors)

**Applications**: Class II-III
**Acceleration**: 0.01-0.1g sustained
**Thrust Duration**: Weeks to months
**Delta-v Budget**: 100,000-500,000 m/s
**Specific Impulse**: 10,000-100,000 seconds
**Reaction Mass Ratio**: 0.5:1 to 1:1 (fuel serves as both energy and propellant)

**Advantages**:

- High sustained acceleration
- Efficient fuel usage
- Can achieve brachistochrone trajectories to outer planets
- Reduced reaction mass requirements

**Limitations**:

- Complex reactor containment required
- He3 fuel requires lunar/gas giant mining infrastructure
- Still bound by relativistic constraints (cannot approach c)
- Minimum reactor size limits smallest vessel class
- Requires weeks/months for long transits

---

### 4. Solar Sails / Photon Drives

**Applications**: Class I-II (supplemental only)
**Acceleration**: 0.00001-0.0001g
**Thrust Duration**: Continuous (while in sunlight)
**Delta-v Budget**: Unlimited (time-dependent)
**Reaction Mass**: None required

**Advantages**:

- No reaction mass required
- Free acceleration in sunlight
- Ideal for long-duration, low-priority cargo

**Limitations**:

- Extremely low acceleration
- Ineffective beyond ~2 AU from sun
- Cannot maneuver rapidly
- Vulnerable to damage
- Useless for time-sensitive missions

---

### 5. Gap Drives (FTL)

**Applications**: Class IV exclusively
**Acceleration**: N/A (translation through gap field)
**Effective Transit Time**: Hours to days (subjective)
**Range per Insertion**: 1-50 light-years
**Entry Velocity Required**: >0.3c
**Reaction Mass**: N/A for gap transit (but requires fusion drive to reach 0.3c)

**Mechanics** (Gap Cycle Inspired):

- Gap drive creates a controlled rupture in normal space
- Ship "falls through" into gap space where distance metrics differ
- Transit is not instantaneous; crew experiences several hours to days
- Navigational precision degrades with distance
- Successful insertion requires:
  - Velocity >0.3c (achieved via conventional fusion/antimatter drives)
  - Distance >100 AU from stellar gravity wells
  - Precise vector alignment (±0.01° tolerance)

**Hazards & Limitations**:

- **Gap Sickness**: Psychological effects on crew during transit; 5-10% experience severe disorientation
- **Navigation Drift**: 1-3% positional error per 10 LY traveled; requires course corrections
- **Gap Instability**: 0.5% chance of catastrophic field collapse per insertion
- **Entry Failure**: If ship velocity drops below 0.28c during insertion sequence, gap field fails catastrophically
- **Gravity Well Restriction**: Cannot engage within 100 AU of stars >0.5 solar masses
- **Power Requirements**: Massive capacitor banks required; 24-48 hour recharge cycle between jumps
- **Drive Wear**: Each insertion degrades gap field generator; requires maintenance every 20-30 jumps

**Range Brackets**:

- Short Jump (1-5 LY): High precision, 0.1% drift, lower power
- Medium Jump (5-20 LY): Standard operations, 1% drift
- Long Jump (20-50 LY): Risky, 3-5% drift, requires extensive pre-jump calculations
- Ultra-Long Jumps (>50 LY): Experimental, 10%+ drift, high failure rate

---

## Design Philosophy

This ruleset balances:

1. **Realistic Physics**: Acceleration, delta-v, travel times based on actual physics
2. **Gap Cycle Inspiration**: FTL with meaningful constraints, risks, and limitations
3. **Gameplay Depth**: Different ship classes serve different purposes; trade-offs matter
4. **Economic Pressure**: Faster ≠ better if it bankrupts you
5. **Strategic Choices**: No "best" ship - context-dependent decisions

The gap drive is powerful but not a magic solution—it requires extensive conventional acceleration, careful planning, carries real risks, degrades with use, and costs a fortune. Most cargo still moves on slow Class III ships because the economics don't support gap transit for bulk goods.

---

## Gameplay Implications

### Resource Management

- **Fuel Costs**: Chemical < Fission < Fusion < Gap Drive (exponential cost increase)
- **Reaction Mass**: Even fusion drives need propellant; resupply stations critical
- **Maintenance**: Gap drives require expensive, specialized service
- **Time vs. Cost**: Faster ships cost exponentially more to operate

### Operational Constraints by Class

**Class I**: Orbit-bound operations only, stranded without refueling, short-duration missions, cannot leave Earth's gravity well

**Class II**: Weeks to reach Moon or Mars, months to reach Belt, cannot reach outer planets in career timeframe, requires refueling at destination

**Class III**: Entire solar system accessible in months, expensive fuel costs limit profit margins, no interstellar capability

**Class IV**: Interstellar capable but weeks of acceleration required, perfect conditions needed (gravity well distance), huge costs and risks, drive degradation is depleting resource, gap sickness affects crew morale

### Strategic Choices

- **Route Planning**: Can you afford gap drive? Is time worth the risk?
- **Fuel Economics**: He3 expensive; chemical cheap but limited
- **Maintenance Timing**: When to service gap drive? (30-jump limit)
- **Risk Management**: Gap drive 0.8% failure rate - insure or gamble?
- **Crew Welfare**: Gap sickness, radiation exposure, mission duration limits

---

## Crew Skills & Role System

### Core Principle

**Roles are derived from skills, not assigned.** A crew member's role is determined by their highest skill, representing their primary expertise and natural inclination. This creates a dynamic crew where members can transition roles as they develop.

### Skill-to-Role Mapping

Every skill must map to a role archetype:

| Skill           | Role          | Description                                                                                  |
| --------------- | ------------- | -------------------------------------------------------------------------------------------- |
| **Piloting**    | Pilot         | Navigation, ship control, spatial awareness. Handles helm operations and course plotting.    |
| **Engineering** | Engineer      | Reactor maintenance, systems repair, technical expertise. Keeps ship systems operational.    |
| **Strength**    | Gunner        | Combat capability, security, physical prowess. Handles weapons and boarding actions.         |
| **Charisma**    | Quartermaster | Morale management, trade negotiations, crew welfare. Handles supplies and diplomacy.         |
| **Loyalty**     | First Officer | Crew support, conflict mediation, reliability. Supports captain and maintains crew cohesion. |

### Special Cases

**Captain**: Always the player character, regardless of skill distribution. The captain leads through position, not necessarily superior skills.

**Role Assignment**: When generating or leveling crew:

1. Calculate highest skill
2. Assign role based on that skill
3. If tie, prioritize: Piloting > Engineering > Strength > Charisma > Loyalty
4. Captain is always assigned manually (player character)

### Initial Stat Distribution

New crew members receive skill distributions weighted toward their intended role:

- **Primary skill**: 6-9 (role-defining)
- **Secondary skills**: 3-5 (general competence)

This ensures roles are meaningful at creation but allows growth and specialization through experience.

### Skill Caps & Growth

- Maximum skill: 10 (mastery)
- Skill points earned: 1 per level gained
- No skill can exceed 10
- Crew can shift roles by developing different skills (though rare)

### Implementation Requirements

1. All crew (except captain) have roles deduced from skills
2. Skill values determine effectiveness in role-specific tasks
3. UI displays role based on current highest skill
4. Role changes dynamically if skill distribution shifts
