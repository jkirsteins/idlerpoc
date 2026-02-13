export type CrewRole = 'captain' | 'pilot' | 'miner' | 'trader' | 'engineer';

export type RoomType =
  | 'bridge'
  | 'engine_room'
  | 'reactor_room'
  | 'medbay'
  | 'cargo_hold'
  | 'armory'
  | 'quarters'
  | 'point_defense_station'
  | 'mining_bay';

export type ShipClassId =
  | 'station_keeper'
  | 'wayfarer'
  | 'dreadnought'
  | 'firebrand'
  | 'leviathan';

export type RoomState = 'operational' | 'damaged' | 'offline';

export type EquipmentId =
  | 'life_support'
  | 'air_filters'
  | 'rad_shield_basic'
  | 'rad_shield_heavy'
  | 'heat_radiator_basic'
  | 'heat_radiator_heavy'
  | 'point_defense'
  | 'deflector_shield'
  | 'nav_scanner'
  | 'mag_confinement'
  | 'accel_couches'
  | 'crash_couches'
  | 'centrifuge_pod'
  | 'exercise_module'
  | 'micro_deflector'
  | 'point_defense_laser'
  | 'mining_laser'
  | 'mining_rig'
  | 'deep_core_mining'
  | 'quantum_mining';

export type FactionId =
  | 'terran_alliance'
  | 'free_traders_guild'
  | 'kreth_collective';

export type LocationType =
  | 'planet'
  | 'space_station'
  | 'asteroid_belt'
  | 'planetoid'
  | 'moon'
  | 'orbital';

export type LocationService = 'refuel' | 'trade' | 'repair' | 'hire' | 'mine';

/** 2D position vector in km (Sun at origin for solar-orbiting bodies). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Orbital parameters for a world location (circular or elliptical). */
export interface OrbitalParams {
  parentId: string | null; // null = orbits Sun; 'earth' = orbits Earth
  orbitalRadiusKm: number; // semi-major axis in km
  orbitalPeriodSec: number; // orbital period in game-seconds
  initialAngleRad: number; // mean anomaly at gameTime=0
  eccentricity?: number; // 0 = circular (default), 0.01–0.1 for elliptical
}

export type CrewEquipmentId =
  | 'sidearm'
  | 'rifle'
  | 'toolkit'
  | 'medkit'
  | 'scanner'
  | 'rebreather'
  | 'wrist_terminal'
  | 'armored_vest'
  | 'g_seat';

export type SkillId = 'piloting' | 'mining' | 'commerce' | 'repairs';

export type ShipClassTier = 'I' | 'II' | 'III' | 'IV' | 'V';

export type EngineId =
  | 'chemical_bipropellant'
  | 'ntr_mk1'
  | 'ntr_mk2'
  | 'ntr_heavy'
  | 'fdr_sunfire'
  | 'fdr_hellion'
  | 'fdr_torch'
  | 'unas_m1_colossus';

export type DriveState = 'off' | 'warming_up' | 'online';

export type EquipmentSlotTag = 'standard' | 'structural';

export interface EquipmentSlotDef {
  id: string;
  tags: EquipmentSlotTag[];
  equippedId?: string;
}

export type ShipFeatureId = 'rotating_habitat';

export interface EquipmentInstance {
  id: string;
  definitionId: EquipmentId;
  degradation: number; // 0 = new, 100 = worn out
}

export type ShipStatus = 'docked' | 'in_flight' | 'orbiting';

export type FlightPhase = 'accelerating' | 'coasting' | 'decelerating';

export interface FlightState {
  origin: string;
  destination: string;
  originKm?: number; // km from Earth at flight start (for position interpolation, especially mid-flight redirects)
  totalDistance: number; // meters
  distanceCovered: number; // meters
  currentVelocity: number; // m/s
  phase: FlightPhase;
  burnTime: number; // game-seconds per burn phase
  coastTime: number; // game-seconds for coast phase (0 if mini-brach)
  elapsedTime: number; // game-seconds into this leg
  totalTime: number; // game-seconds for full leg
  acceleration: number; // m/s² during burns
  dockOnArrival: boolean;
  burnFraction: number; // 0.1-1.0: fraction of delta-v budget to use (1.0 = max speed)
  // 2D orbital trajectory fields
  originPos?: Vec2; // origin 2D position (km), recomputed each tick from originBodyId or fixed for redirects
  interceptPos?: Vec2; // destination 2D position (km), recomputed each tick from destination body
  shipPos?: Vec2; // current ship 2D position (km), interpolated each tick between originPos and interceptPos
  estimatedArrivalGameTime?: number; // predicted arrival gameTime
  originBodyId?: string; // real origin body ID (set for normal flights, undefined for redirects where origin is a point in space)
}

export interface ShipLocation {
  status: ShipStatus;
  dockedAt?: string; // e.g. "Earth" — set when docked
  orbitingAt?: string; // e.g. "Earth" — set when orbiting
  // destination and flight removed - now using ship.activeFlightPlan
}

export interface CrewSkills {
  piloting: number; // 0-100
  mining: number; // 0-100
  commerce: number; // 0-100, trained by captain/first officer completing trade routes
  repairs: number; // 0-100, trained by crew assigned to repair job slots
}

// ─── Ore & Mining Types ──────────────────────────────────────────

export type OreId =
  | 'iron_ore'
  | 'silicate'
  | 'copper_ore'
  | 'rare_earth'
  | 'titanium_ore'
  | 'platinum_ore'
  | 'helium3'
  | 'exotic_matter'
  | 'water_ice';

export type MiningEquipmentId =
  | 'basic_mining_laser'
  | 'improved_mining_laser'
  | 'heavy_mining_drill'
  | 'deep_core_extractor'
  | 'fusion_assisted_drill'
  | 'quantum_resonance_drill';

// ─── Mastery System Types ────────────────────────────────────────

/** Mastery for a specific item (route, ore, trade route) within a skill */
export interface ItemMastery {
  itemId: string; // e.g. "earth->gateway_station" or "iron_ore"
  xp: number; // current mastery XP for this item
  level: number; // derived from xp, 0-99
}

/** Mastery pool for a skill */
export interface MasteryPool {
  xp: number; // current pool XP
  maxXp: number; // pool cap (500_000 × number of items)
}

/** Per-crew mastery state for one skill */
export interface SkillMasteryState {
  itemMasteries: Record<string, ItemMastery>; // key = itemId
  pool: MasteryPool;
}

/** Cargo item representing mined ore */
export interface OreCargoItem {
  oreId: OreId;
  quantity: number; // units
}

export interface SkillSpecialization {
  skillId: SkillId;
  rankAtSpecialization: string;
  specializedAt: number; // gameTime
}

export interface CrewEquipmentInstance {
  id: string;
  definitionId: CrewEquipmentId;
}

export interface LocationOre {
  oreId: OreId;
  yieldMultiplier?: number; // defaults to 1.0 if omitted
}

export interface WorldLocation {
  id: string;
  name: string;
  type: LocationType;
  factionId?: FactionId;
  description: string;
  distanceFromEarth: number; // km — recomputed each tick from orbital positions
  x: number; // km from Sun (2D position, updated each tick)
  y: number; // km from Sun (2D position, updated each tick)
  services: LocationService[];
  size: number; // quest count per day
  pilotingRequirement: number; // minimum piloting skill to travel here
  availableOres?: LocationOre[]; // ores mineable at this location, with optional yield multiplier
  orbital?: OrbitalParams; // circular orbit parameters (undefined in legacy saves before migration)
}

export interface World {
  locations: WorldLocation[];
}

export interface EngineInstance {
  id: string;
  definitionId: EngineId;
  state: DriveState;
  warmupProgress: number; // 0-100
}

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  morale: number; // 0-100
  health: number; // 0-100
  skills: CrewSkills;
  xp: number;
  level: number;
  isCaptain: boolean;
  equipment: CrewEquipmentInstance[];
  unpaidTicks: number; // Accumulated ticks of unpaid salary
  hireCost: number; // Cost to hire this crew member (reference)
  salaryMultiplier: number; // 1.0 = base salary; higher for skilled hires
  zeroGExposure: number; // cumulative game-seconds in zero-g
  specialization?: SkillSpecialization; // locked-in skill specialization
  mastery: Record<SkillId, SkillMasteryState>; // per-skill mastery state
  hiredAt: number; // gameTime when hired (0 = game start / captain)
  boardedShipAt: number; // gameTime when joined current ship
  hiredLocation?: string; // location ID where recruited (undefined for captain)
}

export interface Room {
  id: string;
  type: RoomType;
  state: RoomState;
}

/**
 * Job slot types - each represents a specific crew position.
 * Room-sourced: helm, comms, drive_ops, containment, patient, arms_maint, fire_control, rest
 * Equipment-sourced: scanner (nav_scanner), targeting (point_defense)
 * Ship-wide: repair
 */
export type JobSlotType =
  | 'helm'
  | 'scanner'
  | 'comms'
  | 'drive_ops'
  | 'containment'
  | 'patient'
  | 'arms_maint'
  | 'fire_control'
  | 'targeting'
  | 'rest'
  | 'repair'
  | 'mining_ops';

/**
 * A job slot instance on a ship. Crew are assigned to job slots, not rooms.
 */
export interface JobSlot {
  id: string;
  type: JobSlotType;
  assignedCrewId: string | null; // single crew per slot (repair allows multiple slots)
  sourceRoomId?: string; // room that generated this slot
  sourceEquipmentId?: string; // equipment that generated this slot
}

export interface ShipMetrics {
  creditsEarned: number; // Lifetime earnings for this ship
  fuelCostsPaid: number; // Total fuel expenses
  crewCostsPaid: number; // Total crew salaries paid
  repairCostsPaid: number; // Total repair costs
  contractsCompleted: number; // Total contracts finished
  totalFlightTicks: number; // Time spent in flight
  totalIdleTicks: number; // Time spent idle at stations
  lastActivityTime: number; // gameTime of last contract completion
}

export interface Ship {
  id: string;
  name: string;
  classId: ShipClassId;
  rooms: Room[];
  crew: CrewMember[];
  jobSlots: JobSlot[]; // Crew assignment via job slots
  fuelKg: number; // Current fuel mass in kilograms
  maxFuelKg: number; // Fuel tank capacity in kilograms
  provisionsKg: number; // Current provisions (food & water) mass in kg
  oxygenLevel: number; // 0-100% atmosphere oxygen level
  equipment: EquipmentInstance[];
  equipmentSlots: EquipmentSlotDef[];
  location: ShipLocation;
  engine: EngineInstance;
  cargo: CrewEquipmentInstance[];
  oreCargo: OreCargoItem[]; // mined ore in cargo hold
  miningAccumulator: Record<string, number>; // fractional ore per OreId
  activeContract: ActiveContract | null;
  routeAssignment: RouteAssignment | null; // Automated route for trade routes
  miningRoute: MiningRoute | null; // Automated mine → sell → return loop
  lastEncounterTime?: number; // gameTime of last encounter (for cooldown)
  metrics: ShipMetrics; // Performance tracking for fleet management
  role?: 'courier' | 'freighter' | 'scout' | 'combat' | 'luxury'; // Player-assigned specialization
  activeFlightPlan?: FlightState; // Current flight plan (replaces location.flight)
  flightProfileBurnFraction: number; // 0.1-1.0: per-ship flight profile setting (1.0 = max speed, lower = more coasting, less fuel)
  selectedMiningOreId?: OreId; // Player-chosen ore to mine (undefined = auto-select highest value)
}

export type QuestType =
  | 'delivery'
  | 'passenger'
  | 'freight'
  | 'trade_route'
  | 'rescue';

export interface Quest {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  origin: string;
  destination: string;
  cargoRequired: number; // kg per trip (0 for passenger) — resolved per-ship via resolveQuestForShip()
  totalCargoRequired: number; // unused legacy field, always 0
  tripsRequired: number; // 1 for one-off, N for freight, -1 for indefinite
  paymentPerTrip: number; // credits (0 if lump sum only) — resolved per-ship
  paymentOnCompletion: number; // credits (0 if per-trip only) — resolved per-ship
  expiresAfterDays: number; // 0 = no deadline; N = days to complete once accepted
  estimatedFuelPerTrip: number; // display only — resolved per-ship
  estimatedTripTicks: number; // display only — resolved per-ship
  cargoFraction?: number; // 0–1 fraction of available hold to fill (set at generation, resolved per-ship)
  cargoTypeName?: string; // e.g. "medical supplies" — used to generate description per-ship
  rescueShipId?: string; // for rescue quests: the stranded ship's ID
  rescueFuelKg?: number; // for rescue quests: kg of fuel to deliver to stranded ship
}

export interface ActiveContract {
  quest: Quest; // snapshot
  tripsCompleted: number;
  cargoDelivered: number; // unused legacy field, always 0
  creditsEarned: number; // running total
  leg: 'outbound' | 'inbound';
  paused: boolean; // docked mid-contract
  abandonRequested?: boolean; // deferred abandon — applied on next arrival
  acceptedOnDay?: number; // game day when contract was accepted (for deadline enforcement)
}

export interface RouteAssignment {
  questId: string; // Trade route quest being automated
  originId: string; // Route origin location
  destinationId: string; // Route destination location
  autoRefuel: boolean; // Auto-purchase fuel at stations
  autoRefuelThreshold: number; // Trigger refuel when fuel < threshold% (default 30%)
  totalTripsCompleted: number; // Lifetime counter for this route
  creditsEarned: number; // Lifetime earnings for this route
  assignedAt: number; // gameTime when route was assigned
  lastTripCompletedAt: number; // gameTime of last trip completion
}

export interface MiningRoute {
  mineLocationId: string; // Asteroid belt / mine location
  sellLocationId: string; // Trade station to sell ore
  status: 'mining' | 'selling' | 'returning'; // Current phase
  totalTrips: number; // Round-trips completed
  totalCreditsEarned: number; // Lifetime ore sale earnings
  assignedAt: number; // gameTime when route was set up
}

export type LogEntryType =
  | 'departure'
  | 'arrival'
  | 'trip_complete'
  | 'contract_complete'
  | 'payment'
  | 'contract_accepted'
  | 'contract_abandoned'
  | 'contract_expired'
  | 'day_advanced'
  | 'refueled'
  | 'salary_paid'
  | 'crew_departed'
  | 'crew_hired'
  | 'equipment_bought'
  | 'equipment_sold'
  | 'gravity_warning'
  | 'encounter_evaded'
  | 'encounter_negotiated'
  | 'encounter_victory'
  | 'encounter_harassment'
  | 'encounter_boarding'
  | 'encounter_fled'
  | 'crew_level_up'
  | 'crew_role_change'
  | 'mining_started'
  | 'ore_mined'
  | 'ore_sold'
  | 'cargo_full'
  | 'mining_route'
  | 'radiation_warning'
  | 'provisions_warning'
  | 'crew_death'
  | 'stranded'
  | 'rescue'
  | 'fuel_depleted';

export interface LogEntry {
  gameTime: number;
  type: LogEntryType;
  message: string;
  shipName?: string;
}

export interface EncounterStats {
  totalEncounters: number;
  evaded: number;
  negotiated: number;
  victories: number;
  harassments: number;
  boardings: number;
  fled: number;
}

export type EncounterOutcome =
  | 'evaded'
  | 'negotiated'
  | 'victory'
  | 'harassment'
  | 'boarding'
  | 'fled';

export interface EncounterResult {
  type: EncounterOutcome;
  shipId: string;
  threatLevel: number;
  positionKm: number;
  defenseScore?: number;
  pirateAttack?: number;
  creditsLost?: number;
  creditsGained?: number;
  healthLost?: Record<string, number>; // crewId -> HP lost
  equipmentDegraded?: Record<string, number>; // equipmentInstanceId -> degradation added
  flightDelayAdded?: number; // game-seconds added
  negotiatorName?: string;
  negotiatorId?: string;
}

export type ThreatLevel = 'clear' | 'caution' | 'danger' | 'critical';

/**
 * Toast notification for real-time event feedback
 */
export type ToastType =
  | 'encounter_evaded'
  | 'encounter_negotiated'
  | 'encounter_victory'
  | 'encounter_harassment'
  | 'encounter_boarding'
  | 'encounter_fled'
  | 'level_up'
  | 'credits_gained'
  | 'credits_lost'
  | 'radiation_spike';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  expiresAt: number; // timestamp when toast should be removed
}

export interface CatchUpEncounterStats {
  evaded: number;
  negotiated: number;
  victories: number;
  harassments: number;
  fled: number;
  creditsDelta: number;
  avgHealthLost: number;
}

export type CatchUpShipActivity =
  | { type: 'trade_route'; routeName: string; tripsCompleted: number }
  | { type: 'mining_route'; routeName: string; tripsCompleted: number }
  | { type: 'completed_trips'; tripsCompleted: number }
  | { type: 'arrived'; destination: string }
  | { type: 'en_route'; destination: string }
  | { type: 'idle'; location: string };

/** Pre-catch-up snapshot of a ship's automated route for accurate reporting. */
export interface RouteSnapshot {
  type: 'trade' | 'mining';
  routeName: string;
}

/** Pre-catch-up snapshot of a ship's active contract for accurate reporting. */
export interface ContractSnapshot {
  questTitle: string;
  questId: string;
}

/** Per-ship contract status in the catch-up report. */
export interface CatchUpContractInfo {
  title: string;
  status: 'ongoing' | 'completed' | 'expired' | 'abandoned';
}

export interface CatchUpShipSummary {
  shipId: string;
  shipName: string;
  activity: CatchUpShipActivity;
  encounters?: CatchUpEncounterStats;
  contractInfo?: CatchUpContractInfo;
  crewHighlights?: LogEntry[];
}

export interface CatchUpReport {
  totalTicks: number;
  elapsedRealSeconds: number; // actual real-world seconds that passed
  creditsDelta: number; // net credits change during catch-up
  contractsCompleted: number; // total contract completions across fleet
  shipSummaries: CatchUpShipSummary[]; // per-ship consolidated summaries
  logHighlights: LogEntry[]; // notable log entries (skill-ups, etc.) from the idle period
}

/** Snapshot of lifetime earnings at the end of a game day, for rolling income averages. */
export interface DailyLedgerSnapshot {
  gameDay: number;
  lifetimeCreditsEarned: number;
}

export interface GameData {
  saveVersion: number; // migration version — see docs/save-migration.md
  ships: Ship[];
  activeShipId: string;
  credits: number;
  lifetimeCreditsEarned: number;
  dailyLedgerSnapshots: DailyLedgerSnapshot[];
  world: World;
  createdAt: number;
  gameTime: number; // elapsed game-seconds since epoch
  availableQuests: Record<string, Quest[]>; // key = location ID
  log: LogEntry[];
  lastTickTimestamp: number; // real-world timestamp of last tick (milliseconds)
  lastQuestRegenDay: number; // game day when quests were last generated
  hireableCrewByLocation: Record<string, CrewMember[]>; // key = location ID
  visitedLocations: string[]; // location IDs the player has docked at
  encounterStats?: EncounterStats;
  // Time system state
  isPaused: boolean; // Global pause state
  timeSpeed: 1 | 2 | 5; // Current time speed multiplier
  autoPauseSettings: {
    onArrival: boolean; // Pause when ships arrive at destination
    onContractComplete: boolean; // Pause when contracts complete
    onCriticalAlert: boolean; // Pause on critical alerts
    onLowFuel: boolean; // Pause when fuel drops below 10%
  };
}

/**
 * Get the currently selected ship from fleet.
 * Throws if the fleet is empty (should never happen in normal gameplay).
 */
export function getActiveShip(gameData: GameData): Ship {
  const ship =
    gameData.ships.find((s) => s.id === gameData.activeShipId) ??
    gameData.ships[0];
  if (!ship) {
    throw new Error('No ships in fleet — game state is invalid');
  }
  return ship;
}

/**
 * Get the commanding officer of a ship for commerce purposes.
 * Returns the player character if aboard, otherwise the crew member
 * with the highest commerce skill (the acting captain).
 */
export function getShipCommander(ship: Ship): CrewMember | undefined {
  return (
    ship.crew.find((c) => c.isCaptain) ??
    ship.crew.reduce<CrewMember | undefined>(
      (best, c) =>
        !best || c.skills.commerce > best.skills.commerce ? c : best,
      undefined
    )
  );
}
