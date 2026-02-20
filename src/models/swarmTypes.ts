// TRAPPIST-1 Swarm Idle - Core Type Definitions

// ============================================================================
// RESOURCES
// ============================================================================

export interface EnergyPool {
  current: number;
  max: number;
}

// Single resource for v1 - Energy (converted from biomass)
export interface Resources {
  energy: EnergyPool;
}

// ============================================================================
// FOOD TYPES
// ============================================================================

export interface FoodType {
  id: string;
  name: string;
  energyYield: number; // Energy per unit of food
  skillRequired: number; // Foraging skill required
}

export const FOOD_TYPES: FoodType[] = [
  {
    id: 'surface_lichen',
    name: 'Surface Lichen',
    energyYield: 1,
    skillRequired: 0,
  },
];

// ============================================================================
// WORKER
// ============================================================================

export type WorkerState =
  | 'self_maintenance' // Consuming from cargo to refuel energy
  | 'gathering' // Filling cargo from zone
  | 'idle_empty' // No orders, empty cargo
  | 'idle_cargo_full'; // Queen full, can't unload

export interface WorkerSkills {
  foraging: number; // 0-100
  mastery: {
    surfaceLichen: number; // 0-99
  };
}

export interface WorkerCargo {
  current: number; // Current biomass carried
  max: number; // Max capacity
}

export interface WorkerPosition {
  x: number; // 0-100 within zone
  y: number;
  targetX?: number;
  targetY?: number;
  moving: boolean;
}

export interface Worker {
  id: string;
  queenId: string; // Which queen controls this worker

  // State
  state: WorkerState;

  // Resource pools (mirror queen's energy→health cascade)
  energy: EnergyPool; // Depletes per tick; refueled by consuming cargo
  health: EnergyPool; // Only depletes when energy reaches 0

  // Derived metabolism rates (calculated once at creation)
  metabolismPerTick: number; // Energy drained per tick
  hpDecayPerTickAtZeroEnergy: number; // Health drained per tick when energy=0

  // Cargo system (purely for delivery to queen)
  cargo: WorkerCargo;

  // Skills
  skills: WorkerSkills;

  // Position (for movement visualization)
  position?: WorkerPosition;

  // Current order
  order?: WorkerOrder;

  // Zone assignment
  assignedZoneId?: string;
  currentZoneId?: string; // Where worker is currently located
}

// ============================================================================
// QUEEN
// ============================================================================

export type QueenDirective = 'gather_biomass' | 'idle';

export interface EggProduction {
  enabled: boolean; // Auto-mode toggle
  isLaying: boolean; // Currently in laying phase
  layingProgress: number; // 0-100
  layingTicksRemaining: number;
  cooldownTicksRemaining: number;
}

// ============================================================================
// EGG ENTITY
// ============================================================================

export type EggPhase = 'incubating' | 'maturing';
export type EggType = 'worker'; // Extensible for future types

export interface Egg {
  id: string;
  queenId: string;
  nurseryId: string; // Which nursery holds this egg
  type: EggType;
  phase: EggPhase;
  ticksInPhase: number;
  totalTicks: number;
}

// ============================================================================
// STRUCTURES
// ============================================================================

export type StructureType = 'nursery';

export interface Structure {
  id: string;
  type: StructureType;
  zoneId: string; // Which zone it's built in
  capacity: number; // Nursery: max eggs
}

export interface WorkerOrder {
  type:
    | 'gather_biomass'
    | 'idle'
    | 'explore_zone'
    | 'combat'
    | 'build_structure';
  targetZoneId?: string;
  priority: number;
  issuedAt: number;
}

export interface Queen {
  id: string;
  locationZoneId: string; // Where embedded
  alienTypeId: string;

  // Neural capacity
  neuralCapacity: number; // Base 20

  // Control
  directive: QueenDirective;
  commandQueue: WorkerOrder[];

  // Reproduction
  eggProduction: EggProduction;
  broodSkill: number; // 0-100, laying efficiency (reduces laying time)
  broodMastery: {
    worker: number; // XP for worker egg type (reduces gestation time)
  };

  // Resources
  energy: EnergyPool;
  health: EnergyPool;
  metabolismPerTick: number;
  hpDecayPerTickAtZeroEnergy: number;

  // Position
  position?: { x: number; y: number }; // Within zone
}

// ============================================================================
// ZONE
// ============================================================================

export type ZoneState =
  | 'unexplored'
  | 'exploring'
  | 'combating'
  | 'converting'
  | 'harvesting'
  | 'saturated';

export type TerrainType = 'soil' | 'liquid' | 'ice';
export type TemperatureZone = 'hot' | 'warm' | 'temperate' | 'cold' | 'frozen';
export type AtmosphereState = 'thick' | 'thin' | 'none';
export type InsolationBand = 'light' | 'terminator' | 'dark';
export type ZoneBiome =
  | 'sunscorch'
  | 'temperate-basin'
  | 'twilight-marsh'
  | 'night-ice'
  | 'mineral-ridge'
  | 'barren-plain';

export interface ZoneAtmosphereGases {
  n2: number;
  co2: number;
  o2: number;
  ch4: number;
  inert: number;
}

export interface Zone {
  id: string;
  name: string;

  // Hierarchy
  planetId: string;
  continentId: string;
  regionId: string;

  // State
  state: ZoneState;
  progress: number; // 0-100 toward next state
  ownedBySwarm: boolean;

  // Resources
  biomassRate: number; // Surface lichen growth per tick
  biomassAvailable: number; // Current depletable amount

  // Predators (v2)
  predators?: {
    strength: number;
    defeated: boolean;
  };

  // Workers
  assignedWorkers: string[]; // Worker IDs

  // Spatial - Hex grid coordinates (axial)
  hexQ: number;
  hexR: number;
  hexS: number; // = -q-r

  // Environment - derived from temperature calculation
  terrainType: TerrainType;
  temperatureZone: TemperatureZone;
  temperatureKelvin: number;
  atmosphere: AtmosphereState;
  insolationBand: InsolationBand;
  biome: ZoneBiome;
  hasMineralVein: boolean;
  atmosphericMass: number;
  atmosphericGases: ZoneAtmosphereGases;

  // Connectivity - neighbor zone IDs
  neighborIds: string[];

  // Bounds for procedural naming
  continentIndex: number;
  regionIndex: number;
  zoneIndex: number;
}

// ============================================================================
// PLANET
// ============================================================================

export interface Moon {
  id: string;
  name: string;
  distance: number; // From planet
}

export interface Planet {
  id: string;
  name: string;
  trappistId: string; // b, c, d, e, f, g, h
  distanceAU: number; // Semi-major axis in AU
  orbitalPeriod: number; // Earth days
  eccentricity: number; // Orbital eccentricity (0 = circular)
  initialAngleRad: number; // Starting angle at gameTime=0

  // Time: rotation period in Earth hours (tidally locked = orbital period)
  // Stored as ticks per local day for the UI
  dayLengthTicks: number;

  // State
  discovered: boolean; // Always true for all 7
  accessible: boolean; // False until travel unlocked

  // Hierarchy
  zones: Zone[];
  moons: Moon[];

  // Position (updated each tick by orbital mechanics)
  x: number; // km from star center
  y: number; // km from star center
}

// ============================================================================
// SWARM
// ============================================================================

export interface Swarm {
  queens: Queen[];
  workers: Worker[];
  eggs: Egg[];
  structures: Structure[];
}

// ============================================================================
// DAILY STATS
// ============================================================================

export interface DailyStats {
  day: number;
  workersDied: number;
  queensDied: number;
  eggsLaid: number;
  workersHatched: number;
  netEnergy: number;
}

// ============================================================================
// LOG
// ============================================================================

export type LogEntryType =
  | 'worker_hatched'
  | 'worker_died'
  | 'queen_died'
  | 'egg_laid'
  | 'egg_hatched'
  | 'zone_conquered'
  | 'daily_summary';

export interface LogEntry {
  id: string;
  timestamp: number;
  type: LogEntryType;
  message: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// GAME DATA
// ============================================================================

export interface GameData {
  saveVersion: number;
  gameTime: number;
  createdAt: number;
  lastTickTimestamp: number;

  // Core entities
  swarm: Swarm;
  planets: Planet[];
  homePlanetId: string;

  // Resources
  resources: Resources;

  // Stats
  dailyStats: DailyStats[];

  // Log
  log: LogEntry[];

  // Settings
  isPaused: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const SWARM_CONSTANTS = {
  // Egg production timing (ticks)
  EGG_LAYING_TICKS: 10, // Base laying duration
  EGG_INCUBATION_TICKS: 30, // Egg incubation phase
  EGG_MATURATION_TICKS: 15, // Egg maturation phase
  EGG_TOTAL_GESTATION_TICKS: 45, // 30 + 15 (gestation only, excludes laying)
  EGG_COOLDOWN_TICKS: 20, // Cooldown between lays
  SPEED_UP_ADVANCE_TICKS: 2, // Ticks advanced per Speed Up tap

  // Nursery
  NURSERY_BASE_CAPACITY: 10, // Starting nursery egg capacity

  // Brood skill progression
  BROOD_XP_PER_LAY: 1, // Activity amount for brood skill gain
  EGG_HATCH_MASTERY_XP: 10, // Mastery XP per hatch

  // Worker lifecycle (energy→health cascade mirrors queen)
  WORKER_HEALTH_MAX: 100,
  WORKER_ENERGY_MAX: 10, // Energy pool size (spawns full)
  WORKER_ENERGY_DEPLETION_TICKS: 100, // Ticks to fully deplete energy with no food
  WORKER_HP_DEPLETION_TICKS_AT_ZERO_ENERGY: 20, // Ticks to die once energy=0
  WORKER_CARGO_MAX: 10,
  WORKER_RECYCLE_BIOMASS: 5, // Biomass recovered when a worker dies

  // Energy costs
  EGG_COST: 10,
  QUEEN_UPKEEP: 0.5,

  // Conversion
  BIOMASS_TO_ENERGY: 1,

  // Gathering
  BASE_GATHER_RATE: 0.2,

  // Skill progression tuning (shared by foraging and brood skills)
  SKILL_ACTIVITY_MULTIPLIER: 10, // Scales activity into skill gain units
  SKILL_GAIN_DIVISOR: 1_000_000, // Scales raw skill gain into usable range
  MASTERY_XP_PER_FOOD_UNIT: 10, // Mastery XP awarded per unit of food gathered

  // Neural capacity
  QUEEN_BASE_CAPACITY: 20,
  OVERLOAD_EXPONENT: 4,
  STARVATION_COEFFICIENT: 0.5,
  RECYCLE_EFFICIENCY: 0.7,

  // Equilibrium / catch-up
  EQUILIBRIUM_TARGET_LOAD: 1.2, // Slight neural overshoot is stable
  CATCHUP_GROWTH_RATE: 0.1, // Fraction of gap closed per day during catch-up
  CATCHUP_OVERCAPACITY_THRESHOLD: 1.5, // Above this × target, population crashes
  CATCHUP_DEATH_RATE: 0.2, // Fraction of excess killed per day during crash
  EQUILIBRIUM_TREND_THRESHOLD: 2, // Net energy above/below this = growing/shrinking
  EQUILIBRIUM_CONVERGENCE_RATE: 10, // Workers per day toward equilibrium

  // Time
  TICKS_PER_DAY: 480,
  TICKS_PER_HOUR: 20,
  TICKS_PER_YEAR: 480 * 365, // 175,200 ticks = 1 game year

  // Re-evaluation
  ORDER_REEVALUATION_INTERVAL: 10,
} as const;

// ============================================================================
// PREDATOR STRENGTH LABELS
// ============================================================================

export const PREDATOR_STRENGTH_LABELS: Array<{
  min: number;
  max: number;
  label: string;
  description: string;
}> = [
  {
    min: 1,
    max: 2,
    label: 'Scattered Resistance',
    description: 'Isolated native organisms, minimal threat',
  },
  {
    min: 3,
    max: 6,
    label: 'Minor Friction',
    description: 'Small populations, easily overcome',
  },
  {
    min: 7,
    max: 15,
    label: 'Localized Defenses',
    description: 'Organized resistance in pockets',
  },
  {
    min: 16,
    max: 35,
    label: 'Established Presence',
    description: 'Significant biomass competition',
  },
  {
    min: 36,
    max: 80,
    label: 'Dominant Ecosystem',
    description: 'Complex food webs, apex predators',
  },
  {
    min: 81,
    max: 180,
    label: 'Aggressive Biome',
    description: 'Hostile environment, toxic organisms',
  },
  {
    min: 181,
    max: 400,
    label: 'Fortified Territory',
    description: 'Heavily defended ecological niches',
  },
  {
    min: 401,
    max: 900,
    label: 'Hostile Dominance',
    description: 'Near-total native control',
  },
  {
    min: 901,
    max: 2000,
    label: 'Extreme Resistance',
    description: 'Intelligent/social native organisms',
  },
  {
    min: 2001,
    max: Infinity,
    label: 'Perfected Defense',
    description: 'Maximum native biomass concentration',
  },
];

export function getPredatorStrengthLabel(strength: number): string {
  const entry = PREDATOR_STRENGTH_LABELS.find(
    (s) => strength >= s.min && strength <= s.max
  );
  return entry?.label || 'Unknown';
}

// ============================================================================
// ZONE NAMING
// ============================================================================

export const ZONE_ADJECTIVES = [
  'Fertile',
  'Vibrant',
  'Dormant',
  'Pulsing',
  'Resonant',
  'Silent',
  'Hungry',
  'Generous',
  'Hostile',
  'Welcoming',
  'Deep',
  'Surface',
  'Outer',
  'Inner',
  'Prime',
  'Secondary',
  'Nascent',
  'Ancient',
  'Shifting',
  'Stable',
];

export const ZONE_NOUNS = [
  'Essence',
  'Biomass',
  'Vitality',
  'Resonance',
  'Pulse',
  'Thrum',
  'Bloom',
  'Nexus',
  'Lattice',
  'Matrix',
  'Core',
  'Heart',
  'Cradle',
  'Crucible',
  'Wellspring',
  'Breach',
  'Threshold',
  'Vantage',
  'Reach',
  'Hollow',
];

export function generateZoneName(seed: number): string {
  const adjIndex = seed % ZONE_ADJECTIVES.length;
  const nounIndex =
    Math.floor(seed / ZONE_ADJECTIVES.length) % ZONE_NOUNS.length;
  return `${ZONE_ADJECTIVES[adjIndex]} ${ZONE_NOUNS[nounIndex]}`;
}
