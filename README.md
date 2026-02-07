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
  - Quest generation based on location size and ship capabilities
  - Automatic flight execution with multi-leg trips
  - Payment per trip or on completion (rebalanced based on trip duration)
  - Contract pause/resume functionality
  - Crew salary costs displayed on quest cards
- **Time System**:
  - 1 tick = 1 real second = 30 game minutes
  - Time advances during flight, frozen when docked
  - Manual day advancement when docked
  - Quests regenerate daily
  - Start date: 2247-01-01
- **Flight Physics**:
  - Burn-coast-burn flight profiles for low-thrust ships
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
- **Event Log**: Comprehensive log of all events (departures, arrivals, payments, contract completions)
- **Resource Tracking**: Monitor credits, fuel, crew count, crew costs per tick, and power consumption
- **Equipment Trading**: Buy and sell crew equipment at stations with trade services (50% sell value)
- **Real-time Simulation**: 1-second tick system for fuel consumption, engine warmup, flight physics, and equipment degradation
- **Game Data Catalogs**:
  - 9 engine types (chemical, nuclear fission, fusion, advanced fusion) with thrust and delta-v specifications
  - 14 ship equipment types (life support, shielding, thermal, defense, navigation, structural)
  - 9 room types (bridge, engine room, reactor room, point defense station, etc.)
  - 3 factions (Terran Alliance, Free Traders Guild, Kreth Collective)
  - 8 crew equipment items (weapons, tools, accessories, armor)
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
