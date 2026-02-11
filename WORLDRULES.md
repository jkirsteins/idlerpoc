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

### Class IV: Deep System Cruisers (DSC)

**Range**: Entire solar system at high speed
**Typical Missions**: Rapid transit, military operations, pre-gap acceleration
**Travel Time**: Days (inner system), weeks (outer system)

**Constraints**:

- G-forces threaten crew survival
- Extreme thermal/radiation output
- Requires anti-g countermeasures (drugs, immersion pods)
- Military-origin technology restricts availability and increases cost
- Sustained multi-g acceleration possible but biologically limited
- The engine can push far harder than crew can survive

### Class V: Gap-Capable Vessels (GCV)

**Range**: Interstellar distances
**Typical Missions**: Interstellar trade, exploration, military operations
**Travel Time**: Days to weeks (including gap transit)

**Constraints**:

- Requires Class IV-grade conventional drive to reach gap insertion velocity
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
**Typical Thrust**: 1,500 N (RS-44 Bipropellant on 50t vessel = 0.003g)

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

**Typical Thrust Values**:

- NTR-200 Mk1: 4,000 N (0.002g on 200t Wayfarer)
- NTR-450 Mk2: 10,000 N (0.0029g on 350t Corsair)
- NTR-800 Heavy: 20,000 N (0.004g on 500t Dreadnought)
- NTR-300S Stealth: 7,500 N (0.003g on 250t Phantom)

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

### 4. Advanced Fusion Drives

**Applications**: Class III-IV
**Acceleration**: 0.5-10g+ sustained
**Thrust Duration**: Days to weeks
**Delta-v Budget**: 500,000-1,000,000 m/s
**Specific Impulse**: 100,000-500,000 seconds

**Advantages**:

- Solar system traversal in days not months
- Enables gap insertion velocity (0.3c achievable)
- Military-proven technology
- Can sustain extreme acceleration

**Limitations**:

- Extreme waste heat requires massive thermal management
- Radiation output requires heavy shielding
- G-forces require crew countermeasures (drugs, immersion pods)
- Military provenance means expensive and restricted
- The engine can push far harder than the crew can survive
- Human biology is the limiting factor, not engineering

---

### 5. Solar Sails / Photon Drives

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

### 6. Gap Drives (FTL)

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

## Operational Hazards

### Radiation Exposure

All drives above chemical emit radiation proportional to their power output:

- **Fission drives**: Mild radiation; manageable on short flights, cumulative on long ones
- **Fusion drives**: Significant radiation requiring dedicated shielding equipment
- **Advanced fusion**: Extreme radiation requiring heavy shielding

Unshielded crew suffer progressive health degradation. Medical care can slow but not prevent this. Shielding equipment consumes equipment slots and power — a direct tax on ship capability.

### Waste Heat

Fusion and advanced fusion drives produce enormous waste heat that must be radiated away:

- Ships require thermal management equipment (radiator arrays, active coolant systems)
- Insufficient thermal management causes accelerated degradation of all ship equipment
- Thermal management equipment itself degrades under load, creating potential cascade failures

### Debris Hazards

At sustained high velocity, even micro-debris is lethal kinetic energy:

- Ships operating under thrust require point defense systems to destroy or deflect debris in their path
- Point defense effectiveness depends on crew skill (gunner) and detection equipment (scanners)
- Debris density varies by region — asteroid belts are far more dangerous than open space
- Magnetic deflectors handle micro-particles; point defense handles larger debris. Both are needed.

### Reactor Containment

Fusion reactors require active containment management:

- Containment equipment degrades during operation; failure leads to radiation spikes far exceeding normal output
- Reactor monitoring requires dedicated crew (engineers) in a separate reactor room
- An unstaffed or poorly-staffed reactor is a ticking time bomb

### G-Force Exposure (Class IV+)

Advanced fusion drives can accelerate far harder than the human body can tolerate:

- Sustained acceleration above ~2g causes progressive health damage without countermeasures
- **Countermeasures**: anti-g drugs (crew consumable with side effects), full-immersion crash pods (ship equipment), physical fitness (crew strength skill)
- Anti-g drugs enable higher tolerance but cause temporary personality/cognitive side effects
- The captain must balance transit speed against crew survival — faster is not always better

### Cascading Failures

On fusion-class vessels and above, ship systems are deeply interdependent:

- A single equipment failure can cascade: degraded containment → radiation spike → crew health drop → unstaffed stations → further degradation
- Crew management and repair prioritization become critical survival skills
- This is the fundamental difference from Class I/II operations: on a torch ship, neglect kills

---

## Navigation Planning

Higher-class vessels require increasingly careful route planning. Navigation is not trivial — it is a core crew competency.

### Route Planning

Before departure, crew plot a course. Quality depends on navigator skill and equipment:

- Route quality affects debris encounter frequency, fuel efficiency, and hazard warning time
- Poor navigation wastes fuel on course corrections and leaves the ship vulnerable to debris
- Excellent navigation avoids hazard-dense regions and optimizes fuel consumption

### Regional Hazard Density

Space is not uniformly empty:

- Asteroid belts, debris fields, and high-traffic zones present varying hazard levels
- Route planning quality determines how effectively the ship avoids high-density regions
- Long journeys through hazardous regions accumulate risk even with good navigation

### Gap Navigation (Class V)

Gap insertion requires precise pre-jump calculations:

- Navigator skill directly affects positional accuracy after gap transit
- Poor navigation increases drift, potentially stranding the ship far from intended destination
- Navigation failure during insertion increases the probability of catastrophic gap field collapse

---

## Crew Consumables

Crew consumables are single-use items carried in cargo and used during operations:

- **Anti-g drugs ("Compress")**: Increases crew g-force tolerance temporarily. Side effects include reduced social capability and focus. Limited supply per journey creates resource tension.
- Future consumables may include medical supplies, rations, repair materials

---

## Ship Equipment Categories

Ship equipment now spans multiple categories beyond life support:

- **Life Support**: Atmosphere, air quality
- **Shielding**: Radiation protection
- **Thermal**: Heat dissipation and management
- **Defense**: Point defense, debris deflection
- **Navigation**: Hazard detection and scanning
- **Structural**: Reactor containment, acceleration compensation

Higher-class ships require more equipment categories to operate safely, consuming more equipment slots. This creates a natural "equipment tax" — a torch ship must dedicate most of its slots to survival systems before any optional upgrades.

---

## Design Philosophy

This ruleset balances:

1. **Realistic Physics**: Acceleration, delta-v, travel times based on actual physics
2. **Gap Cycle Inspiration**: FTL with meaningful constraints, risks, and limitations
3. **Gameplay Depth**: Different ship classes serve different purposes; trade-offs matter
4. **Economic Pressure**: Faster ≠ better if it bankrupts you
5. **Strategic Choices**: No "best" ship - context-dependent decisions
6. **Emergent Systems**: Game values should emerge from interacting systems rather than being hardcoded. Ship range is derived from engine capability × ship mass × mission endurance (from cargo capacity, crew count, and room bonuses). When systems interact, gameplay depth emerges without hand-tuning.

The gap drive is powerful but not a magic solution—it requires extensive conventional acceleration, careful planning, carries real risks, degrades with use, and costs a fortune. Most cargo still moves on slow Class III ships because the economics don't support gap transit for bulk goods.

### Range as Emergent Property

Ship maximum range is not a fixed value but emerges from the interaction of multiple systems:

- **Engine thrust & ship mass** → acceleration
- **Engine maxDeltaV** → fuel budget for cruise velocity
- **Cargo capacity** → consumable supplies (30% reserved for food, water, air)
- **Crew count** → consumption rate (30 kg/crew/day base)
- **Rooms (cantina)** → efficiency modifiers (cook reduces waste by 20%)

Mission endurance constrains range: even with abundant fuel, a ship can only go as far as its consumables allow. A slow ship with low thrust CAN travel far if it has enough supplies and time. A fast ship with many crew burns through consumables quickly, limiting effective range despite powerful engines.

This creates natural trade-offs: Class I ships are slow AND supply-limited, making them truly orbital-only. Class II ships can reach Mars slowly but require long journey times. Class III torch ships have high acceleration but large crews, balancing range through different constraints.

---

## Gameplay Implications

### Resource Management

- **Fuel Costs**: Chemical (1x) < Fission (3x) < Fusion D-D (10x) < Fusion D-He3 (30x) < Gap Drive
- Operating a fusion-class vessel is inherently expensive; every burn is a financial decision
- Fuel availability and cost at different stations creates route planning incentives
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

## Time System

**Game Time Progression**:

- 1 tick = 1 real second = 3 game minutes (180 game seconds)
- 1 game day = 480 ticks (~8 real minutes)
- 1 game month (30 days) = 14,400 ticks (~4 real hours)

**Epoch**: 2247-01-01 00:00 (gameTime = 0)

**Time Advancement**:

- Time advances automatically during flight (180 game seconds per tick)
- Time is frozen when docked
- Players can manually advance time by one day when docked (with no active contract)
- Quests regenerate when advancing the day

**Pacing (idle-game layered clocks)**:

- Short routes (Earth→Meridian): ~5-8 real minutes (short clock — active players)
- Medium routes (Earth→Forge): ~1.5-2.7 real hours (medium clock — check-in-later players)
- Long routes (Earth→Mars): hours (long clock — set-and-forget players)
- Flight times are calculated using burn-coast-burn physics (see implementation)

---

## Crew Economics & Salaries

### Salary System

Crew members require regular payment for their services. Salaries are deducted every tick (3 game minutes) during flight operations. When docked, time is frozen and no salaries are charged.

**Salary Rates (credits per tick):**

| Role      | Salary/Tick | Salary/Day (480 ticks) | Role Justification                       |
| --------- | ----------- | ---------------------- | ---------------------------------------- |
| Captain   | 0           | 0                      | Owner-operator, earns from ship profits  |
| Pilot     | 0.1         | 48                     | Essential bridge crew, flight operations |
| Navigator | 0.1         | 48                     | Route planning and hazard analysis       |
| Engineer  | 0.15        | 72                     | Critical for engine and ship systems     |
| Cook      | 0.05        | 24                     | Morale specialist, crew welfare          |
| Medic     | 0.075       | 36                     | Medical care, crew health maintenance    |
| Gunner    | 0.075       | 36                     | Combat capability, ship security         |
| Mechanic  | 0.1         | 48                     | Repairs and maintenance specialist       |

**Economic Pressure:**

A typical 3-person starting crew (captain + pilot + engineer) costs **0.25 credits/tick** or **120 credits/day** during active flight time. This creates constant economic pressure to:

- Accept profitable contracts
- Minimize idle flight time
- Balance crew size against operational costs
- Plan efficient routes to reduce flight duration

**Payment Failures:**

- Salaries are deducted from ship credits every tick
- If credits reach zero, crew members become "unpaid"
- Unpaid crew will leave the ship once docked at a station
- Captain never leaves (owner of the ship)
- Multiple missed payments = multiple crew departures

**Strategic Implications:**

- Larger crews provide operational advantages but increase costs exponentially
- Long-duration flights without contracts are financially risky
- Emergency docking may result in crew losses if credits are depleted
- Standing freight contracts provide steady income to cover crew costs

### Crew Hiring

When docked at stations with **'hire'** service (Earth, Forge Station, Freeport Station, Mars), players can recruit additional crew members.

**Hiring Mechanics:**

- 2-3 randomly generated crew candidates available per station visit
- Candidates refresh when advancing the day
- Each candidate has randomized skills, level, and role
- Hire cost formula: **Base Cost (500 cr) + (Level × 200 cr)**
  - Level 1 crew: ~700 credits
  - Level 3 crew: ~1,100 credits
  - Level 5 crew: ~1,500 credits

**Strategic Considerations:**

- Hiring higher-level crew costs more but provides better skills
- Crew diversity (multiple roles) enables more operational flexibility
- Larger crews increase operational costs but reduce single-crew dependency
- Crew departures due to unpaid wages can force emergency hiring

### Equipment Shop

At stations with **'trade'** service (Earth, Forge Station, Freeport Station, Mars), players can buy and sell crew equipment.

**Buy Equipment:**

- All crew equipment types available at full retail value
- Equipment values range from 450 cr (wrist terminal) to 3,500 cr (assault rifle)
- Purchased items go to ship cargo hold
- Must have sufficient credits to purchase

**Sell Equipment:**

- Sell equipped items or cargo items for 50% of retail value
- Useful for liquidating excess equipment or outdated gear
- Crew can unequip items before sale

**Available Equipment Categories:**

- **Weapons**: Sidearms (800 cr), Assault Rifles (3,500 cr)
- **Tools**: Toolkits (1,200 cr), Medkits (1,500 cr), Scanners (2,000 cr)
- **Accessories**: Rebreathers (600 cr), Wrist Terminals (450 cr)
- **Armor**: Ballistic Vests (2,200 cr)

---

## Crew Skills & Role System

### Core Principle

**Roles are derived from skills, not assigned.** A crew member's role is determined by their highest skill, representing their primary expertise and natural inclination. This creates a dynamic crew where members can transition roles as they develop.

---

## Gravity & Zero-G Physiology

### Natural Gravity Sources

Most locations in space provide negligible gravity. Crew on extended voyages face progressive physical degradation from zero-g exposure.

**Ship-Based Gravity Solutions:**

- **Rotating Habitats**: Large military ships (Dreadnought, Leviathan) have rotating sections providing ~0.3-0.5g spin gravity. Completely prevents zero-g exposure.
- **Centrifuge Pods**: Installable modules for smaller ships. Provides ~0.3g spin gravity via rotating crew quarters. Requires structural equipment slot.
- **Thrust Gravity**: Fusion drives (Class III) produce measurable thrust gravity during burns (0.01-0.1g). Reduces but doesn't eliminate exposure.

### Zero-G Exposure Mechanics

Crew accumulate zero-g exposure during flight time. Effects are cumulative and progressive:

**Thresholds** (measured in days):

- **Safe**: < 14 days — No effects
- **Minor**: 14-60 days — Strength -7.5%
- **Moderate**: 60-180 days — Strength -17.5%
- **Severe**: 180-365 days — Strength -35%
- **Critical**: > 365 days — Strength -60%

**Exposure Rate Modifiers:**

- Rotating habitat or centrifuge: **0% accumulation** (full protection)
- Thrust gravity during burns: **Reduced by thrust g-force** (fusion drives: ~10% reduction at 0.1g)
- Exercise module (ship equipment): **50% reduction** in accumulation rate
- G-Seat harness (crew equipment): **30% reduction** per crew member equipped

**Example**: A 60-day trip on a fusion ship with exercise module and g-seats:

- Base exposure: 60 days
- Thrust reduction (10% of burn time): ~54 days effective
- Exercise module (50%): ~27 days effective
- G-seat (30%): ~19 days effective
- Result: Minor atrophy threshold (14d) crossed, but moderate threshold (60d) avoided

### Recovery Mechanics

When docked at planetary or lunar locations, crew slowly recover from zero-g exposure:

- **Recovery rate**: 0.5x accumulation rate (slower than degradation)
- **Time to full recovery**: ~2x the exposure time
- Recovery happens continuously while docked
- No recovery during flight or at zero-g stations

**Strategic Implications:**

- Long-haul fusion ships need gravity solutions or suffer combat penalties
- Shorter trips can skip gravity equipment if planned carefully
- Rest stops at planetary stations allow partial recovery
- Crew rotation strategies can manage long-term exposure

### Equipment Slots & Compatibility

Ships have two slot types:

- **Standard Slots**: Accept all equipment (life support, shielding, thermal, etc.)
- **Structural Slots**: Accept both standard equipment AND large structural items (centrifuges)

**Ship Slot Configurations**:

- Class I/II ships: Mostly standard slots (0-1 structural)
- Class III ships: More structural slots for centrifuges and heavy equipment

This creates equipment trade-offs: installing a centrifuge uses a structural slot that could hold other critical equipment.

---

### Skill-to-Role Mapping

Every skill must map to a role archetype:

| Skill           | Role          | Description                                                                                         |
| --------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| **Piloting**    | Pilot         | Ship handling, helm control, real-time maneuvering. Handles ship operations during flight.          |
| **Astrogation** | Navigator     | Route plotting, hazard analysis, jump calculations. Handles course planning and scanner operations. |
| **Engineering** | Engineer      | Reactor maintenance, systems repair, technical expertise. Keeps ship systems operational.           |
| **Strength**    | Gunner        | Combat capability, security, physical prowess. Handles weapons and boarding actions.                |
| **Charisma**    | Quartermaster | Morale management, trade negotiations, crew welfare. Handles supplies and diplomacy.                |
| **Loyalty**     | First Officer | Crew support, conflict mediation, reliability. Supports captain and maintains crew cohesion.        |

**Note**: Piloting and Astrogation are distinct skills. A bridge with both a skilled pilot AND a skilled navigator is ideal — the pilot handles the ship, the navigator plots the course. On smaller ships, one person may do both (poorly).

### Special Cases

**Captain**: Always the player character, regardless of skill distribution. The captain leads through position, not necessarily superior skills. The captain can transfer between ships in the fleet — when absent, the crew member with the highest commerce skill acts as commanding officer for trade bonuses.

**Role Assignment**: When generating or leveling crew:

1. Calculate highest skill
2. Assign role based on that skill
3. If tie, prioritize: Piloting > Astrogation > Engineering > Strength > Charisma > Loyalty
4. Captain is always assigned manually (player character)

### Initial Stat Distribution

New crew members receive skill distributions weighted toward their intended role:

- **Primary skill**: 6-9 (role-defining)
- **Secondary skills**: 3-5 (general competence)

This ensures roles are meaningful at creation but allows growth and specialization through experience.

### Skill Caps & Growth

- Skills scale 1-100 with 10 named ranks (Untrained → Master)
- Training is passive via job slot assignment with diminishing returns
- Specialization available at skill 50: +50% training in chosen skill, -25% in others
- Commerce (7th skill): trained by ship commander/first officer completing trade routes, improves pay and fuel pricing
- Piloting skill gates ship class access (Class II: 25, Class III: 50, Class IV: 75, Class V: 95)
- Crew can shift roles by developing different skills (though rare)
- See `docs/skill-system.md` for full details

### Implementation Requirements

1. All crew (except captain) have roles deduced from skills
2. Skill values determine effectiveness in role-specific tasks
3. UI displays role based on current highest skill
4. Role changes dynamically if skill distribution shifts
