# Starship Commander

A browser-based sci-fi spaceship captain game inspired by Firefly and the Gap Cycle. Create your captain, name your ship, and manage your crew across the stars.

## Getting Started

```bash
npm install
npm run dev
```

## Game Features

- **Captain as Playable Character**: You are a crew member! The captain is part of the crew with their own skills and level
- **Ship Creation**: Choose your captain name, ship name, and starting ship class
- **Ship Classes**: 7 ship classes from orbital tenders to fusion torch ships (Class I-III) (see `src/shipClasses.ts`)
- **Tabbed Interface**: Switch between Ship, Crew, Work, Log, and Settings tabs
- **Docking & Undocking**: Transition between docked (station power) and in-flight (engine power)
- **Engine System**:
  - Multiple engine types with different warmup times and power outputs
  - Engine warmup mechanic when undocking or turning on engines
  - Manual engine control (turn on/off) when bridge or engine room is staffed
  - Power source changes based on docked status
  - Burn-coast-burn flight physics with realistic thrust and delta-v
- **Interactive Crew Management**:
  - Assign multiple crew to rooms (respecting room capacity)
  - Staging area for unassigned crew
  - Visual indicators for crew in preferred rooms and captain badge
  - Crew skills (Piloting, Astrogation, Engineering, Strength, Charisma, Loyalty) and levels (1-20)
  - 8 crew roles including Navigator (astrogation specialist)
  - Room-specific outputs (navigation, power, morale, health, etc.)
  - Skill-based role assignment system
  - Crew salaries paid per tick during flight (0.5-1.5 credits/tick depending on role)
  - Unpaid crew depart at next station
  - Hire new crew at stations with hiring services
- **Navigation System**:
  - World map with 8 locations (Earth, Gateway Station, Forge Station, Mars, etc.)
  - Visual navigation chart showing distances and reachable locations
  - Access via bridge crew (requires staffed bridge)
  - Dynamic reachability based on ship range and fuel
- **Quest & Contract System**:
  - Accept delivery, passenger, freight, supply, and standing freight contracts
  - **Persistent trade routes** at every location with trade service — permanent work lines to all trading partners
  - Trade route pay scales with distance, route danger, and location economic power
  - Trade goods derived from location type (planets export manufactured goods, stations export tech components, etc.)
  - Quest generation based on location size and ship capabilities
  - Automatic flight execution with multi-leg trips
  - Payment per trip or on completion (rebalanced based on trip duration)
  - Contract pause/resume functionality
  - Crew salary costs displayed on quest cards
- **Time System**:
  - 1 tick = 1 real second = 30 game minutes
  - Real-time based: game computes elapsed time since last update and processes all pending ticks
  - Idle-friendly: closing the browser or backgrounding the tab catches up on return (up to 1 day, batched to keep UI responsive)
  - `visibilitychange` listener triggers immediate catch-up when tab regains focus
  - Time advances during flight, frozen when docked
  - Manual day advancement when docked
  - Quests regenerate daily
  - Start date: 2247-01-01
- **Flight Physics**:
  - Burn-coast-burn flight profiles for low-thrust ships
  - **Per-ship flight profile slider** (Economy to Max Speed): controls burn fraction of delta-v budget, trading trip time for fuel savings
  - Quest cards show profile-aware fuel cost, trip time, crew salary, and estimated profit/loss for informed decision-making
  - Real-time G-force display (0g during coast phase)
  - Velocity and distance tracking
  - Fuel consumption only during burns
  - Estimated travel times from seconds to hours
- **Torch Ship Mechanics (Class III Fusion Vessels)**:
  - Radiation exposure system with shielding equipment
  - Waste heat management with radiator arrays
  - Fusion containment stability requiring reactor room staffing
  - Cascading failure mechanics (heat → equipment degradation → radiation spikes)
  - Real-time status bars for radiation, heat, and containment integrity
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
  - Auto-resolve combat pipeline: Evade → Negotiate → Combat → Outcome
  - Five outcomes: evasion, negotiation (ransom), victory (bounty), harassment (minor damage), boarding (major losses)
  - Defense score from point defense equipment, armory crew weapons, deflector shields, and ship mass
  - Regional threat levels (Clear/Caution/Danger/Critical) based on distance from Terran Alliance and proximity to lawless zones
  - Threat badges on quest cards, navigation chart, and flight status
  - Narrative log entries for all encounter outcomes
  - Fast-forward severity cap (boarding → harassment during catch-up)
  - Catch-up report modal summarizing encounters that occurred while away
  - Encounter cooldown prevents rapid consecutive encounters per ship
- **Event Log**: Comprehensive log of all events (departures, arrivals, payments, contract completions, encounters)
- **Resource Tracking**: Monitor credits, fuel, crew count, crew costs per tick, and power consumption
- **Equipment Trading**: Buy and sell crew equipment at stations with trade services (50% sell value)
- **Responsive Design**: Mobile-friendly layout with collapsible sidebar drawer, compact status bar, scrollable tabs, and adaptive grids for phone/tablet screens
- **Real-time Simulation**: Elapsed-time tick system that catches up based on real time passed — works across browser throttling, background tabs, and phone sleep. Catch-up report modal shown for long absences
- **Game Data Catalogs**:
  - 9 engine types (chemical, nuclear fission, fusion, advanced fusion) with thrust and delta-v specifications
  - 16 ship equipment types (life support, shielding, thermal, defense, navigation, structural, gravity systems)
  - 9 room types (bridge, engine room, reactor room, point defense station, etc.)
  - 3 factions (Terran Alliance, Free Traders Guild, Kreth Collective)
  - 9 crew equipment items (weapons, tools, accessories, armor, gravity countermeasures)
  - Progressive XP/leveling system (20 levels)
  - 8 world locations with varied services and quest availability

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
