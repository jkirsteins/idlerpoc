# Mass-Based Fuel Physics Implementation

## Overview

The game now uses realistic mass-based fuel physics based on the Tsiolkovsky rocket equation. Fuel has mass, ship mass changes as fuel burns, and range emerges from the interaction of these systems.

## Key Changes

### Ship Model (`src/models/index.ts`)

```typescript
interface Ship {
  fuelKg: number; // Current fuel mass in kilograms
  maxFuelKg: number; // Fuel tank capacity in kilograms
  // ... other fields
}
```

The old `fuel: number` percentage field has been removed.

### Core Physics Functions (`src/flightPhysics.ts`)

#### Tsiolkovsky Rocket Equation

```typescript
function calculateDeltaV(
  wetMass: number,
  dryMass: number,
  specificImpulse: number
): number;
```

Implements: **Δv = Isp × g₀ × ln(m_wet / m_dry)**

#### Fuel Tank Capacity

```typescript
function calculateFuelTankCapacity(
  dryMass: number,
  engineDef: EngineDefinition
): number;
```

Based on WORLDRULES.md reaction mass ratios:

- **Chemical**: 0.5:1 (50% of dry mass)
- **Nuclear Fission**: 3:1 (3× dry mass) - WORLDRULES line 126
- **Fusion**: 0.75:1
- **Military Fusion**: 1:1

#### Current Ship Mass

```typescript
function getCurrentShipMass(ship: Ship): number;
```

Returns: dry mass + fuel mass + cargo mass + crew mass (~80kg per person)

#### Fuel Consumption

```typescript
function calculateFuelFlowRate(thrust: number, specificImpulse: number): number;
```

Implements: **dm/dt = -F / (Isp × g₀)**

Returns fuel consumption rate in kg/s during burns.

### Engine Specifications

Specific impulse values matching WORLDRULES.md:

| Engine Type               | Isp (seconds) | Reference           |
| ------------------------- | ------------- | ------------------- |
| Chemical Bipropellant     | 450s          | Standard LOX/LH2    |
| Nuclear Thermal (Fission) | 900s          | WORLDRULES line 124 |
| Fusion D-D                | 50,000s       | -                   |
| Fusion D-He3              | 100,000s      | -                   |
| Advanced Military Fusion  | 200,000s      | -                   |

## Example: Wayfarer with NTR-200

**Ship Specifications:**

- Dry mass: 200,000 kg
- Engine: NTR-200 Fission Drive
- Thrust: 4,000 N
- Specific impulse: 900s

**Calculated Values:**

- Fuel tank capacity: 600,000 kg (3:1 ratio)
- Wet mass (full fuel): 800,000 kg
- Maximum delta-v: ~9,700 m/s (not hardcoded!)
- Fuel flow rate: ~0.46 kg/s during burns
- Initial acceleration: 0.005 m/s² (0.0005g)

**Trip Example (Earth to Gateway Station, 400 km):**

- Required delta-v: ~430 m/s
- Fuel consumed: ~10,000 kg
- Fuel percentage: ~1.7% of tank
- Trip duration: ~1.5 game hours

This matches the fuel_analysis.md calculations!

## Game Tick Integration (`src/gameTick.ts`)

During burn phases, fuel is consumed based on thrust and specific impulse:

```typescript
const specificImpulse = getSpecificImpulse(engineDef);
const fuelFlowRateKgPerSec = calculateFuelFlowRate(
  engineDef.thrust,
  specificImpulse
);
const fuelConsumedKg = fuelFlowRateKgPerSec * GAME_SECONDS_PER_TICK;
ship.fuelKg = Math.max(0, ship.fuelKg - fuelConsumedKg);
```

## Ship Initialization (`src/gameFactory.ts`)

New ships are created with full fuel tanks:

```typescript
const engineDef = getEngineDefinition(engine.definitionId);
const maxFuelKg = calculateFuelTankCapacity(shipClass.mass, engineDef);

const ship: Ship = {
  // ...
  fuelKg: maxFuelKg, // Start with full tank
  maxFuelKg,
  // ...
};
```

## Design Philosophy

### Emergent Properties

Ship range is NOT hardcoded. It emerges from:

1. Engine thrust / ship mass → acceleration
2. Fuel mass / Isp → available delta-v
3. Delta-v / acceleration → burn time
4. Consumables capacity → mission endurance

### Realistic Behavior

- Ships get lighter as fuel burns (though acceleration is fixed per flight for simplicity)
- Heavy cargo reduces range (increases dry mass)
- Different engine types have vastly different fuel efficiency
- Fuel tank size competes with cargo capacity (both use ship mass budget)

### Proof of Concept

- Acceleration is fixed per flight based on initial mass (simplifies calculations)
- Between flights, acceleration changes as fuel depletes (emergent)
- Future enhancement: dynamic acceleration within flight (requires iterative integration)

## Breaking Changes

### Removed Fields

- `Ship.fuel` (percentage) - replaced by `fuelKg` and `maxFuelKg`

### Removed Functions

- `calculateFuelCost(distanceKm, maxRangeKm)` - replaced by `calculateFuelMassRequired()`

### API Changes

**Old:**

```typescript
const fuelCost = calculateFuelCost(distanceKm, maxRangeKm); // Returns percentage
ship.fuel -= fuelCost;
```

**New:**

```typescript
const fuelRequired = calculateFuelMassRequired(
  dryMass,
  requiredDeltaV,
  specificImpulse
);
ship.fuelKg -= fuelRequired;
```

## Remaining Work

### Critical (Blocking)

1. **UI Components** - 13 files display fuel, need kg conversion
2. **Refueling System** - needs per-kg pricing
3. **Quest Generation** - fuel cost estimates

### Non-Critical

4. Fleet analytics - fuel display
5. Power system - fuel checks
6. Route assignment - fuel calculations

## Testing

All ships should spawn with realistic fuel capacities. Example values:

| Ship Class     | Dry Mass     | Engine        | Fuel Capacity |
| -------------- | ------------ | ------------- | ------------- |
| Station Keeper | 50,000 kg    | Chemical      | 25,000 kg     |
| Wayfarer       | 200,000 kg   | NTR-200       | 600,000 kg    |
| Corsair        | 350,000 kg   | NTR-450       | 1,050,000 kg  |
| Dreadnought    | 500,000 kg   | NTR-800 Heavy | 1,500,000 kg  |
| Firebrand      | 800,000 kg   | Fusion D-D    | 600,000 kg    |
| Leviathan      | 1,200,000 kg | Fusion D-He3  | 900,000 kg    |

## References

- `WORLDRULES.md` - Lines 118-146 (Nuclear Fission), 149-176 (Fusion)
- `fuel_analysis.md` - Original violation analysis
- `CLAUDE.md` - Main guiding principles (emergent systems)
