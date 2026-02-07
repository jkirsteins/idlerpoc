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
  | 'exercise_module';

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
  | 'loyalty';

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

export type ShipStatus = 'docked' | 'in_flight';

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
}

export interface ShipLocation {
  status: ShipStatus;
  dockedAt?: string; // e.g. "Earth" — set when docked
  destination?: string; // e.g. "Mars" — set when in_flight (future use)
  flight?: FlightState; // flight state when in_flight
}

export interface CrewSkills {
  piloting: number; // 1-10
  astrogation: number; // 1-10
  engineering: number; // 1-10
  strength: number; // 1-10
  charisma: number; // 1-10
  loyalty: number; // 1-10
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
  unspentSkillPoints: number;
  unpaidTicks: number; // Accumulated ticks of unpaid salary
  hireCost: number; // Cost to hire this crew member (reference)
  zeroGExposure: number; // cumulative game-seconds in zero-g
}

export interface Room {
  id: string;
  type: RoomType;
  state: RoomState;
  assignedCrewIds: string[];
}

export interface Ship {
  id: string;
  name: string;
  classId: ShipClassId;
  rooms: Room[];
  crew: CrewMember[];
  fuel: number;
  equipment: EquipmentInstance[];
  equipmentSlots: EquipmentSlotDef[];
  location: ShipLocation;
  engine: EngineInstance;
  cargo: CrewEquipmentInstance[];
  activeContract: ActiveContract | null;
  lastEncounterTime?: number; // gameTime of last encounter (for cooldown)
}

export type QuestType =
  | 'delivery'
  | 'passenger'
  | 'freight'
  | 'supply'
  | 'standing_freight';

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
}

export type EncounterOutcome =
  | 'evaded'
  | 'negotiated'
  | 'victory'
  | 'harassment'
  | 'boarding';

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

export interface CatchUpShipReport {
  shipId: string;
  shipName: string;
  evaded: number;
  negotiated: number;
  victories: number;
  harassments: number;
  creditsDelta: number;
  avgHealthLost: number;
}

export interface CatchUpReport {
  totalTicks: number;
  shipReports: CatchUpShipReport[];
}

export interface GameData {
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
}

/**
 * Get the currently selected ship from fleet
 */
export function getActiveShip(gameData: GameData): Ship {
  return gameData.ships.find((s) => s.id === gameData.activeShipId)!;
}
