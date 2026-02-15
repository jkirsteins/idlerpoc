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
  | 'self_maintenance' // Consuming from personal cargo
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
  health: number; // 0-100, degrades over time

  // Cargo system
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
  enabled: boolean; // Player toggle
  inProgress: boolean; // Currently laying?
  progress: number; // 0-100
  ticksRemaining: number;
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

  // Neural capacity
  neuralCapacity: number; // Base 20

  // Control
  directive: QueenDirective;
  commandQueue: WorkerOrder[];

  // Reproduction
  eggProduction: EggProduction;

  // Resources
  energy: EnergyPool;

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
  // Timing (ticks)
  EGG_LAYING_TICKS: 10,
  INCUBATION_TICKS: 30,
  MATURATION_TICKS: 15,
  TOTAL_SPAWN_TICKS: 55, // 10 + 30 + 15

  // Worker lifecycle
  WORKER_HEALTH_MAX: 100,
  WORKER_HEALTH_DECAY: 0.36, // Dies at ~275 ticks
  WORKER_CARGO_MAX: 10,
  WORKER_UPKEEP_ENERGY: 0.1,

  // Energy costs
  EGG_COST: 10,
  QUEEN_UPKEEP: 0.5,

  // Conversion
  BIOMASS_TO_ENERGY: 1,

  // Gathering
  BASE_GATHER_RATE: 0.2,

  // Neural capacity
  QUEEN_BASE_CAPACITY: 20,
  OVERLOAD_EXPONENT: 4,
  STARVATION_COEFFICIENT: 0.5,
  RECYCLE_EFFICIENCY: 0.7,

  // Time
  TICKS_PER_DAY: 480,
  TICKS_PER_HOUR: 20,

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
