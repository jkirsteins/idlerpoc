export type CrewRole =
  | 'captain'
  | 'pilot'
  | 'engineer'
  | 'cook'
  | 'medic'
  | 'gunner'
  | 'mechanic';

export type RoomType =
  | 'bridge'
  | 'cantina'
  | 'engine_room'
  | 'medbay'
  | 'cargo_hold'
  | 'armory'
  | 'quarters';

export type ShipClassId =
  | 'station_keeper'
  | 'wayfarer'
  | 'corsair'
  | 'dreadnought'
  | 'phantom';

export type RoomState = 'operational' | 'damaged' | 'offline';

export type EquipmentId = 'life_support' | 'air_filters';

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
  | 'armored_vest';

export type SkillId = 'strength' | 'loyalty' | 'charisma';

export type EngineId =
  | 'chemical_bipropellant'
  | 'ntr_mk1'
  | 'ntr_mk2'
  | 'ntr_heavy'
  | 'ntr_stealth';

export type DriveState = 'off' | 'warming_up' | 'online';

export interface EquipmentInstance {
  id: string;
  definitionId: EquipmentId;
  degradation: number; // 0 = new, 100 = worn out
}

export type ShipStatus = 'docked' | 'in_flight';

export interface ShipLocation {
  status: ShipStatus;
  dockedAt?: string; // e.g. "Earth" — set when docked
  destination?: string; // e.g. "Mars" — set when in_flight (future use)
}

export interface CrewSkills {
  strength: number; // 1-10
  loyalty: number; // 1-10
  charisma: number; // 1-10
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
  reachable: boolean;
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
}

export interface Room {
  id: string;
  type: RoomType;
  state: RoomState;
  assignedCrewIds: string[];
}

export interface Ship {
  name: string;
  classId: ShipClassId;
  rooms: Room[];
  crew: CrewMember[];
  fuel: number;
  credits: number;
  equipment: EquipmentInstance[];
  location: ShipLocation;
  engine: EngineInstance;
}

export interface GameData {
  ship: Ship;
  world: World;
  createdAt: number;
}
