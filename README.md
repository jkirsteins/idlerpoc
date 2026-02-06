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
- **Ship Classes**: 5 ship classes from orbital tenders to stealth couriers (see `src/shipClasses.ts`)
- **Tabbed Interface**: Switch between Ship view and Settings
- **Docking & Undocking**: Transition between docked (station power) and in-flight (engine power)
- **Engine System**:
  - Multiple engine types with different warmup times and power outputs
  - Engine warmup mechanic when undocking or turning on engines
  - Manual engine control (turn on/off) when bridge or engine room is staffed
  - Power source changes based on docked status
- **Interactive Crew Management**:
  - Assign multiple crew to rooms (respecting room capacity)
  - Staging area for unassigned crew
  - Visual indicators for crew in preferred rooms and captain badge
  - Crew skills (Strength, Loyalty, Charisma) and levels (1-20)
  - Room-specific outputs (navigation, power, morale, health, etc.)
- **Navigation System**:
  - World map with 7 locations (some unreachable initially)
  - Visual navigation chart showing distances and reachable locations
  - Access via bridge crew (requires staffed bridge)
- **Resource Tracking**: Monitor credits, fuel, crew count, and power consumption
- **Real-time Simulation**: 1-second tick system for fuel consumption, engine warmup, and equipment degradation
- **Game Data Catalogs**:
  - 5 engine types (chemical to nuclear thermal)
  - 3 factions (Terran Alliance, Free Traders Guild, Kreth Collective)
  - 8 crew equipment items (weapons, tools, accessories, armor)
  - Progressive XP/leveling system (20 levels)

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
