export type CrewRole =
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

export type ShipClassId = 'rustbucket' | 'corsair' | 'dreadnought' | 'phantom';

export type RoomState = 'operational' | 'damaged' | 'offline';

export interface CaptainStats {
  leadership: number;
  navigation: number;
  negotiation: number;
}

export interface Captain {
  name: string;
  stats: CaptainStats;
}

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  morale: number; // 0-100
  health: number; // 0-100
  skill: number; // 1-10
}

export interface Room {
  id: string;
  type: RoomType;
  state: RoomState;
  assignedCrewId?: string;
}

export interface Ship {
  name: string;
  classId: ShipClassId;
  rooms: Room[];
  crew: CrewMember[];
  fuel: number;
  credits: number;
}

export interface GameData {
  captain: Captain;
  ship: Ship;
  createdAt: number;
}
