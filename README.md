# Starship Commander

A browser-based sci-fi spaceship captain game inspired by Firefly and the Gap Cycle. Create your captain, name your ship, and manage your crew across the stars.

## Getting Started

```bash
npm install
npm run dev
```

## Game Features

- **Captain as Playable Character**: You start solo — just a captain at the helm. Hire crew as you progress
- **Ship Creation**: Choose your captain name, ship name, and starting ship class
- **Ship Classes**: 7 ship classes from orbital tenders to fusion torch ships (Class I-III) (see `src/shipClasses.ts`)
- **Fleet Panel**: Always-visible header panel showing every ship's activity (contracts, trade routes, mining, idle), location, fuel, crew, equipment, and range. Click to switch active ship
- **Tabbed Interface**: Switch between Ship, Station, Crew, Work, Nav, Fleet, Log, Guide, and Settings tabs
- **Station Tab**: Consolidated interface for all docked-station services — fuel depot, ore exchange, hiring office, and station store. Randomized atmospheric flavor text per location type, service badges, and location descriptions
- **Docking & Undocking**: Transition between docked (station power) and in-flight (engine power)
- **Engine System**:
  - Multiple engine types with different warmup times and power outputs
  - Engine warmup mechanic when undocking or turning on engines
  - Manual engine control (turn on/off) when helm is manned or engine room is staffed
  - Power source changes based on docked status
  - Burn-coast-burn flight physics with realistic thrust and delta-v
- **Job Slot Crew Assignment**:
  - Crew are assigned to discrete job slots, not rooms directly
  - Rooms generate job slots (bridge → Helm + Comms, engine room → Drive Ops, etc.)
  - Ship equipment generates additional slots (nav scanner → Scan Ops, point defense → Targeting)
  - Ship-wide repair slots accept multiple engineers generating repair points (works docked, in flight, or orbiting)
  - Direct skill training: jobs train crew skills with power-law diminishing returns (no XP intermediary)
  - Captain starts at zero skills; hired crew arrive with archetype-weighted starting skills (quality varies)
  - Skill 5 in ~5 real minutes, skill 50 in ~5 real days (captain at helm baseline)
  - **4 skills** (Piloting, Mining, Commerce, Repairs) with Melvor Idle-inspired mastery system
  - **Three-layer progression**: Skill Level (gates access), Item Mastery (per-route/ore/trade/equipment efficiency), Mastery Pool (skill-wide checkpoint bonuses at 10/25/50/95%)
  - **10 named skill ranks** (Untrained → Master) with non-linear distribution for idle-game pacing
  - **Commerce skill** trained by captain/first officer completing trade routes — improves quest pay and fuel pricing
  - **Captain Command Bonus**: Captain's skills provide ship-wide multipliers — Commerce boosts income (+1% per skill point), Piloting improves evasion, Mining increases extraction. Acting captain fallback provides 25% bonus. Captain-only negotiation and rally defense bonus in combat. Fleet coordination aura: +10% income/training at same location, +5% one hop away. Captain's ship trains at 1.5× speed
  - **Specialization system**: at skill 50, crew can lock in +50% training speed in one skill (-25% others)
  - **Piloting skill gates destinations and ship class**: destinations have piloting requirements; Class II requires 25, Class III requires 50, etc.
  - 4 crew roles (Captain, Pilot, Miner, Trader) — role deduced from highest skill
  - Passive slots (Patient, Rest) benefit crew without training skills
  - Helm is the only required job — no helm crew means the ship coasts
  - Auto-assign crew to best-fit slots based on skill affinity
  - Crew salaries paid per tick, scaled by individual salary multiplier (skilled hires cost more)
  - Unpaid crew depart at next station
  - Hire new crew at stations with hiring services — each candidate has an archetype (Pilot/Miner/Trader) with randomized skill distribution; hire cost and salary scale with total skills; candidate quality varies from green recruits to rare elite veterans
  - **Crew profiles** with ranked titles (e.g. "Competent Pilot"), service records showing ship tenure, company tenure, current assignment, and recruitment origin
- **Mining System**:
  - Orbit locations with `mine` service to extract ore — mining equipment operates at a base rate even without crew; assigning crew to mining_ops dramatically increases speed and unlocks rare ores
  - **Ore material picker**: select which ore to mine from the mining panel; auto-select defaults to highest value; locked ores shown with skill requirements
  - 9 ore types from Iron (common, 8 cr) to Exotic Matter (rare, 500 cr) — mining skill level gates access; ore value increases with distance from Earth
  - 4 tiers of ship-mounted mining equipment: Mining Laser Array (1.0x), Industrial Mining Rig (2.0x), Deep Core System (3.5x), Quantum Resonance Array (5.0x)
  - Equipment purchased/upgraded at Station Store → Ship Equipment tab; trade-in old gear for 50% credit
  - Extraction rate scales with equipment tier, mining skill, and per-ore mastery bonuses
  - Mining is a Class II+ activity — Station Keeper has no mining bay, requires upgrading to Wayfarer or better
  - Mastery pool bonuses at 10/25/50/95% full: XP boost, yield bonus, wear reduction, double-drop chance
  - Sell ore at any station with trade service — prices vary by location type and commerce skill
  - **Cargo progress bar**: visual fill level with mining rate, ETA to fill, and color-coded thresholds
  - **Auto-sell mining routes**: set up idle-friendly mine→sell→return loop; destination picker shows profitability estimates (cr/hr) per station accounting for fill time and round-trip travel
  - Route stats show trips, earnings, status, and average cr/hr
  - Active mining feedback: pulsing indicator when mining, status badges (MINING / IN TRANSIT / CARGO FULL / DOCKED / IDLE)
  - 8 mining locations from cislunar space (Graveyard Drift, Tycho Colony) through the Belt (The Crucible, Ceres) to Jupiter, with progressively valuable ores rewarding outward expansion
- **Navigation System**:
  - World map with 13 locations from LEO to Jupiter in 2D orbital mechanics
  - **Orrery map**: SVG solar system visualization with bodies orbiting in real-time, logarithmic radius scaling, flight trajectory lines, and moving ship dots
  - **2D orbital mechanics**: All bodies follow circular orbits — Earth satellites orbit Earth, planets/stations orbit the Sun. Distances change dynamically as bodies move on their orbits
  - **Launch windows**: Alignment quality system (Excellent/Good/Moderate/Poor) shows optimal departure timing. Earth-Mars distance varies from ~55M km to ~400M km over a synodic cycle
  - **Intercept trajectories**: Ships aim at where the destination will be at arrival time, not where it is at departure. Iterative solver converges on moving targets
  - Destinations gated by piloting skill level (10 for nearby, 75+ for outer system)
  - Dynamic reachability based on ship range, fuel, and piloting skill
  - **Mid-flight redirect**: change destination while in flight — distances, threat levels, and fuel estimates update live from the ship's 2D position in space
  - Redirect replots a fresh intercept trajectory from the ship's current 2D coordinates (not available during contracts or mining routes)
- **Quest & Contract System**:
  - Accept delivery, passenger, and freight contracts with completion deadlines
  - **Active vs passive income**: Finite contracts pay ~2-3x more than automated trade routes — rewarding attentive play while keeping idle income reliable (see `docs/quest-reward-balancing.md`)
  - **Contract deadlines**: Accepted contracts must be completed within their deadline (3-14 days depending on type) or they expire
  - **Persistent trade routes** at every location with trade service — permanent, automatable, modest-but-steady background income
  - Trade route pay scales with distance, route danger, and location economic power
  - Trade goods derived from location type (planets export manufactured goods, stations export tech components, etc.)
  - **Cargo scales with ship capacity**: all contract types fill the ship's hold proportionally — bigger ships earn more per trip through cargo premiums, making ship upgrades immediately rewarding
  - Quest cards show per-trip payment breakdown for multi-trip contracts
  - Quest generation based on location size and ship capabilities
  - Automatic flight execution with multi-leg trips
  - Payment per trip or on completion
  - Contract pause/resume functionality
  - Crew salary costs displayed on quest cards
- **Time System**:
  - 1 tick = 1 real second = 3 game minutes (idle-game pacing: short routes ~5-8 min, medium routes ~1.5-2.5h, long routes ~hours)
  - Real-time based: game computes elapsed time since last update and processes all pending ticks
  - Idle-friendly: closing the browser or backgrounding the tab catches up on return (up to 1 day, batched to keep UI responsive)
  - `visibilitychange` listener triggers immediate catch-up when tab regains focus
  - Time advances each tick; game auto-pauses on arrival (configurable in settings)
  - Manual day advancement when docked
  - Quests regenerate daily
  - Start date: 2247-01-01
- **Flight Physics**:
  - Burn-coast-burn flight profiles for low-thrust ships
  - **Per-ship flight profile slider** (Economy to Max Speed): controls burn fraction of delta-v budget, trading trip time for fuel savings. Available on both the Work tab and the Navigation Chart for adjusting before any departure
  - Quest cards and navigation chart show profile-aware fuel cost, trip time, crew salary, and estimated profit/loss for informed decision-making
  - Real-time G-force display (0g during coast phase)
  - Velocity and distance tracking
  - Fuel consumption only during burns
  - Estimated travel times from seconds to hours
- **Torch Ship Mechanics (Class III Fusion Vessels)**:
  - Radiation exposure system with shielding equipment
  - Radiation bar with detailed tooltip showing shielding breakdown, per-crew damage rate, and containment status
  - Per-crew radiation exposure indicator on Crew tab showing health loss rate and medbay mitigation
  - Containment breach log warnings and toast notifications at 30%/50%/70% degradation thresholds
  - Waste heat management with radiator arrays
  - Fusion containment stability requiring reactor room staffing
  - Cascading failure mechanics (heat → equipment degradation → radiation spikes)
  - Real-time status bars for radiation, heat, and containment integrity
- **Life Support & Oxygen System**:
  - Oxygen tracked as emergent resource: generated by equipment, consumed by crew
  - Life Support System generates 12 O2/tick; Air Filtration Unit generates 6 O2/tick (degrades with wear)
  - Each crew member consumes 1 O2/tick
  - Atmosphere capacity derived from ship mass — larger ships have more buffer time when life support fails
  - Power loss stops oxygen generation; crew depletes remaining atmosphere
  - Progressive health damage at low oxygen: mild (<50%), severe (<25%), critical (<10%)
  - Air filter degradation creates emergent tension on large ships: as filters wear, O2 balance tips negative
  - Oxygen bar on Ship tab with tooltip showing generation/consumption breakdown
  - Station atmosphere resupply when docked
- **Provisions System**:
  - Crew consume provisions (food & water) at 30 kg/crew/day — tracked as ship cargo mass
  - Provisions bar on Ship tab shows current supply, max capacity, and days remaining
  - Auto-resupply when docked at trade stations (targets 30 days of supplies)
  - Pricing scales with distance from Earth (0.50 cr/kg inner system → 1.25 cr/kg outer)
  - Starvation health damage when provisions run out — crew can die
  - Provisions mass competes with quest cargo capacity, creating meaningful tradeoffs
  - Quest cards warn when provisions are insufficient for the round trip
- **Crew Death**:
  - Crew members die when health reaches 0 (starvation, oxygen deprivation, radiation, combat)
  - Captain (player avatar) is exempt — health floors at 1 (incapacitated, never dies)
  - Dead crew are removed from the ship and unassigned from all job slots
- **Stranded Ships & Rescue**:
  - Ships are stranded when they can't reach any refuel station and can't buy fuel locally
  - Stranded detection runs every tick with log warnings and auto-pause on critical alert
  - Survival timer derived from remaining provisions
  - Rescue quest type: appears at all fleet locations as a fleet emergency broadcast
  - Rescue requires cargo space for fuel payload + own fuel for the round trip
  - Fuel transfers to stranded ship on arrival — no payment (fleet self-rescue)
  - Soft warnings on quest cards when departing to locations without refueling service
- **Gravity & Zero-G Physiology System**:
  - Cumulative zero-g exposure tracking with 5 degradation tiers
  - Progressive strength reduction (0% to -60%) from prolonged zero-g
  - Ship-based gravity: rotating habitats (Dreadnought/Leviathan), centrifuge pods (equipment), thrust gravity (fusion drives)
  - Mitigation equipment: exercise modules (ship), g-seat harnesses (crew)
  - Recovery mechanics when docked at planetary locations
  - Tagged equipment slots (standard/structural) for installation constraints
  - Real-time exposure monitoring and pre-departure warnings
- **Encounter & Combat System**:
  - Per-tick pirate encounter detection derived from position, engine heat, and crew skills
  - Auto-resolve combat pipeline: Evade → Negotiate (captain only) → Flee (if outmatched) → Combat → Outcome
  - Six outcomes: evasion, negotiation (ransom, captain required), fled (emergency escape), victory (bounty), harassment (minor damage), boarding (major losses)
  - Captain's rally bonus (+5 defense) and captain-only negotiation create incentive for captain placement on ships running dangerous routes
  - Combat variance: randomized pirate attack strength (±30%) and defense effectiveness (±15%) ensure borderline fights are unpredictable
  - Defense score from point defense equipment (PD-40 Flak Turret, PD-10 Laser), deflector shields (Magnetic Debris Deflector, EM-1 Micro Deflector), armory crew weapons, and ship mass
  - Defense readiness displayed in Ship Capabilities panel with equipment breakdown
  - Starting ship equipped with basic defense (micro deflector) and attack (PD laser) systems
  - Regional threat levels (Clear/Caution/Danger/Critical) based on distance from Terran Alliance and proximity to lawless zones
  - Threat badges on quest cards, navigation chart, and flight status
  - Narrative log entries for all encounter outcomes
  - Fast-forward severity cap (boarding → harassment during catch-up)
  - Catch-up report modal summarizing encounters that occurred while away
  - Encounter cooldown prevents rapid consecutive encounters per ship
- **Event Log**: Rolling log of the most recent 200 events (departures, arrivals, payments, contract completions, encounters); older entries pruned automatically
- **Resource Tracking**: Monitor credits, fuel, oxygen, crew count, and power consumption
- **Daily Ledger**: Fleet-wide financial overview with 7-day rolling income average, projected crew/fuel expenses per day, net income rate, and runway indicator. Appears in header bar, left sidebar, and Fleet Performance Dashboard
- **Equipment Trading**: Buy and sell crew equipment at stations with trade services (50% sell value)
- **In-Game Encyclopedia (Gamepedia)**: Searchable guide explaining all game mechanics — skills, zero-g exposure, flight physics, encounters, and more. Inspired by Civilization's Civilopedia with category filtering, cross-linked articles, and a "See Also" section for discovery
- **Live UI Architecture**: All tabs use mount-once/update-on-tick pattern — tab components are created once and kept alive, receiving live updates every tick even when hidden. Switching tabs is instant with no stale data. Shared flight status component (flight info + station-arrival action controls) appears on both Ship and Work tabs during flight.
- **Responsive Design**: Mobile-friendly layout with collapsible sidebar drawer, compact status bar, scrollable tabs, and adaptive grids for phone/tablet screens
- **Real-time Simulation**: Elapsed-time tick system that catches up based on real time passed — works across browser throttling, background tabs, and phone sleep. Catch-up report modal shown for long absences with per-ship contract status (ongoing, completed, expired, abandoned), encounter summaries, and credit changes
- **Save Data Migration**: Versioned save format with automatic migration pipeline — existing saves upgrade gracefully when the data shape changes (see `docs/save-migration.md`)
- **Game Data Catalogs**:
  - 9 engine types (chemical, nuclear fission, fusion, advanced fusion) with thrust and delta-v specifications
  - 18 ship equipment types with category labels (life support, shielding, thermal, defense, navigation, structural, gravity systems)
  - 9 room types (bridge, engine room, reactor room, point defense station, etc.)
  - 3 factions (Terran Alliance, Free Traders Guild, Kreth Collective)
  - 15 crew equipment items (weapons, tools, accessories, armor, gravity countermeasures, 6 mining equipment tiers)
  - 9 ore types with mining level requirements and location availability
  - Progressive XP/leveling system (20 levels)
  - 3-skill mastery system with per-item progression and mastery pool checkpoints (see `docs/skill-revamp-design.md`)
  - 13 world locations from LEO to Jupiter with 2D circular orbital mechanics

## Code Quality

ESLint enforces code complexity guardrails to stop the bleeding — thresholds are set just above current maximums so existing code passes as-is, but new code can't make things worse. Tighten over time.

| Rule                     | Threshold | Purpose                      |
| ------------------------ | --------- | ---------------------------- |
| `complexity`             | 110       | Cyclomatic complexity per fn |
| `max-lines`              | 2175      | Lines per file               |
| `max-lines-per-function` | 1510      | Lines per function           |
| `max-depth`              | 9         | Nesting depth                |
| `max-params`             | 7         | Parameters per function      |

## Scripts

| Command                | Description               |
| ---------------------- | ------------------------- |
| `npm run dev`          | Start development server  |
| `npm run build`        | Build for production      |
| `npm run preview`      | Preview production build  |
| `npm run lint`         | Run ESLint                |
| `npm run lint:fix`     | Fix ESLint errors         |
| `npm run format`       | Format code with Prettier |
| `npm run format:check` | Check formatting          |
| `npm test`             | Run unit tests            |
| `npm run test:watch`   | Run tests in watch mode   |
