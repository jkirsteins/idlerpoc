export type CrewRole =
  | 'captain'
  | 'pilot'
  | 'navigator'
  | 'engineer'
  | 'cook'
  | 'medic'
  | 'gunner'
  | 'mechanic';

export type RoomType =
  | 'bridge'
  | 'cantina'
  | 'engine_room'
  | 'reactor_room'
  | 'medbay'
  | 'cargo_hold'
  | 'armory'
  | 'quarters'
  | 'point_defense_station';

export type ShipClassId =
  | 'station_keeper'
  | 'wayfarer'
  | 'corsair'
  | 'dreadnought'
  | 'phantom'
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
  | 'point_defense_laser';

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

export type SkillId =
  | 'piloting'
  | 'astrogation'
  | 'engineering'
  | 'strength'
  | 'charisma'
  | 'loyalty'
  | 'commerce';

export type ShipClassTier = 'I' | 'II' | 'III' | 'IV' | 'V';

export type EngineId =
  | 'chemical_bipropellant'
  | 'ntr_mk1'
  | 'ntr_mk2'
  | 'ntr_heavy'
  | 'ntr_stealth'
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
}

export interface ShipLocation {
  status: ShipStatus;
  dockedAt?: string; // e.g. "Earth" — set when docked
  orbitingAt?: string; // e.g. "Earth" — set when orbiting
  // destination and flight removed - now using ship.activeFlightPlan
}

export interface CrewSkills {
  piloting: number; // 1-100
  astrogation: number; // 1-100
  engineering: number; // 1-100
  strength: number; // 1-100
  charisma: number; // 1-100
  loyalty: number; // 1-100
  commerce: number; // 0-100, trained by captain/first officer completing trade routes
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

export interface WorldLocation {
  id: string;
  name: string;
  type: LocationType;
  factionId?: FactionId;
  description: string;
  distanceFromEarth: number; // km
  x: number; // % position for nav map
  y: number; // % position for nav map
  services: LocationService[];
  size: number; // quest count per day
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
  zeroGExposure: number; // cumulative game-seconds in zero-g
  specialization?: SkillSpecialization; // locked-in skill specialization
}

export interface Room {
  id: string;
  type: RoomType;
  state: RoomState;
}

/**
 * Job slot types - each represents a specific crew position.
 * Room-sourced: helm, comms, drive_ops, containment, galley, patient, arms_maint, fire_control, rest
 * Equipment-sourced: scanner (nav_scanner), targeting (point_defense)
 * Ship-wide: repair
 */
export type JobSlotType =
  | 'helm'
  | 'scanner'
  | 'comms'
  | 'drive_ops'
  | 'containment'
  | 'galley'
  | 'patient'
  | 'arms_maint'
  | 'fire_control'
  | 'targeting'
  | 'rest'
  | 'repair';

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
  oxygenLevel: number; // 0-100% atmosphere oxygen level
  equipment: EquipmentInstance[];
  equipmentSlots: EquipmentSlotDef[];
  location: ShipLocation;
  engine: EngineInstance;
  cargo: CrewEquipmentInstance[];
  activeContract: ActiveContract | null;
  routeAssignment: RouteAssignment | null; // Automated route for standing freight
  lastEncounterTime?: number; // gameTime of last encounter (for cooldown)
  metrics: ShipMetrics; // Performance tracking for fleet management
  role?: 'courier' | 'freighter' | 'scout' | 'combat' | 'luxury'; // Player-assigned specialization
  activeFlightPlan?: FlightState; // Current flight plan (replaces location.flight)
  flightProfileBurnFraction: number; // 0.1-1.0: per-ship flight profile setting (1.0 = max speed, lower = more coasting, less fuel)
}

export type QuestType =
  | 'delivery'
  | 'passenger'
  | 'freight'
  | 'supply'
  | 'standing_freight'
  | 'trade_route';

export interface Quest {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  origin: string;
  destination: string;
  cargoRequired: number; // kg per trip (0 for passenger)
  totalCargoRequired: number; // for supply contracts (0 otherwise)
  tripsRequired: number; // 1 for one-off, N for freight, -1 for indefinite
  paymentPerTrip: number; // credits (0 if lump sum only)
  paymentOnCompletion: number; // credits (0 if per-trip only)
  expiresAfterDays: number; // 0 = no expiry
  estimatedFuelPerTrip: number; // display only
  estimatedTripTicks: number; // display only
}

export interface ActiveContract {
  quest: Quest; // snapshot
  tripsCompleted: number;
  cargoDelivered: number; // for supply contracts
  creditsEarned: number; // running total
  leg: 'outbound' | 'inbound';
  paused: boolean; // docked mid-contract
}

export interface RouteAssignment {
  questId: string; // Standing freight quest being automated
  originId: string; // Route origin location
  destinationId: string; // Route destination location
  autoRefuel: boolean; // Auto-purchase fuel at stations
  autoRefuelThreshold: number; // Trigger refuel when fuel < threshold% (default 30%)
  totalTripsCompleted: number; // Lifetime counter for this route
  creditsEarned: number; // Lifetime earnings for this route
  assignedAt: number; // gameTime when route was assigned
  lastTripCompletedAt: number; // gameTime of last trip completion
}

export type LogEntryType =
  | 'departure'
  | 'arrival'
  | 'trip_complete'
  | 'contract_complete'
  | 'payment'
  | 'contract_accepted'
  | 'contract_abandoned'
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
  | 'crew_role_change';

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
  | 'credits_lost';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  expiresAt: number; // timestamp when toast should be removed
}

export interface CatchUpShipReport {
  shipId: string;
  shipName: string;
  evaded: number;
  negotiated: number;
  victories: number;
  harassments: number;
  fled: number;
  creditsDelta: number;
  avgHealthLost: number;
}

export interface CatchUpReport {
  totalTicks: number;
  elapsedRealSeconds: number; // actual real-world seconds that passed
  creditsDelta: number; // net credits change during catch-up
  tripsCompleted: number; // total trip completions across fleet
  contractsCompleted: number; // total contract completions across fleet
  arrivals: { shipName: string; location: string }[]; // ships that arrived
  shipReports: CatchUpShipReport[]; // encounter details (may be empty)
  logHighlights: LogEntry[]; // notable log entries (skill-ups, etc.) from the idle period
}

export interface GameData {
  saveVersion: number; // migration version — see docs/save-migration.md
  ships: Ship[];
  activeShipId: string;
  credits: number;
  lifetimeCreditsEarned: number;
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
 * Get the currently selected ship from fleet
 */
export function getActiveShip(gameData: GameData): Ship {
  return gameData.ships.find((s) => s.id === gameData.activeShipId)!;
}
