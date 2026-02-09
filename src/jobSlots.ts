import type {
  JobSlotType,
  JobSlot,
  Ship,
  SkillId,
  RoomType,
  EquipmentId,
  CrewMember,
} from './models';
import { generateId } from './utils';

/**
 * Job Slot System
 *
 * Crew are assigned to job slots, not rooms. Job slots are generated from:
 * - Rooms (based on room type)
 * - Ship equipment (nav_scanner, point_defense)
 * - Ship-wide jobs (repair)
 *
 * Each job slot optionally trains a skill (bidirectional):
 *   job→crew: skill XP earned with practice
 *   crew→ship: skill level generates bonuses
 *
 * Passive slots (patient, rest) have no skill — they benefit the crew member.
 */

export interface JobSlotDefinition {
  type: JobSlotType;
  name: string;
  description: string;
  icon: string;
  skill: SkillId | null; // null = passive slot (benefits crew, no skill trained)
  required: boolean; // required for ship operations (only helm for now)
  trainRate: number; // base skill training rate per tick (diminishing returns applied)
  bonusDescription: string; // what ship bonus this provides
  source: 'room' | 'equipment' | 'ship';
  sourceRoomType?: RoomType; // which room type generates this
  sourceEquipmentId?: EquipmentId; // which equipment generates this
}

export const JOB_SLOT_DEFINITIONS: JobSlotDefinition[] = [
  // === Bridge jobs ===
  {
    type: 'helm',
    name: 'Helm',
    description: 'Flight control and thrust management.',
    icon: '🎮',
    skill: 'piloting',
    required: true,
    trainRate: 0.00004,
    bonusDescription: 'Fuel efficiency, thrust optimization',
    source: 'room',
    sourceRoomType: 'bridge',
  },
  {
    type: 'comms',
    name: 'Comms',
    description: 'Communications, coordination, and negotiation.',
    icon: '📡',
    skill: 'charisma',
    required: false,
    trainRate: 0.00002,
    bonusDescription: 'Negotiation bonus, quest rewards',
    source: 'room',
    sourceRoomType: 'bridge',
  },

  // === Engine Room jobs ===
  {
    type: 'drive_ops',
    name: 'Drive Ops',
    description: 'Engine monitoring and thrust optimization.',
    icon: '⚙️',
    skill: 'engineering',
    required: false,
    trainRate: 0.00004,
    bonusDescription: 'Engine warmup speed, fuel efficiency',
    source: 'room',
    sourceRoomType: 'engine_room',
  },

  // === Reactor Room jobs ===
  {
    type: 'containment',
    name: 'Containment',
    description: 'Fusion containment monitoring and stabilization.',
    icon: '⚛️',
    skill: 'engineering',
    required: false,
    trainRate: 0.00006,
    bonusDescription: 'Containment stability, power output',
    source: 'room',
    sourceRoomType: 'reactor_room',
  },

  // === Cantina jobs ===
  {
    type: 'galley',
    name: 'Galley',
    description: 'Meal preparation and crew welfare.',
    icon: '🍳',
    skill: 'charisma',
    required: false,
    trainRate: 0.00002,
    bonusDescription: 'Crew morale',
    source: 'room',
    sourceRoomType: 'cantina',
  },

  // === Medbay jobs ===
  {
    type: 'patient',
    name: 'Patient',
    description: 'Crew member receiving medical treatment.',
    icon: '🩺',
    skill: null,
    required: false,
    trainRate: 0,
    bonusDescription: 'Health regeneration for assigned crew',
    source: 'room',
    sourceRoomType: 'medbay',
  },

  // === Armory jobs ===
  {
    type: 'arms_maint',
    name: 'Arms Maint.',
    description: 'Weapons maintenance and boarding defense readiness.',
    icon: '🔫',
    skill: 'strength',
    required: false,
    trainRate: 0.00002,
    bonusDescription: 'Boarding defense, weapon readiness',
    source: 'room',
    sourceRoomType: 'armory',
  },

  // === Point Defense Station jobs ===
  {
    type: 'fire_control',
    name: 'Fire Control',
    description: 'Point defense system operation.',
    icon: '🎯',
    skill: 'strength',
    required: false,
    trainRate: 0.00004,
    bonusDescription: 'PD accuracy, debris destruction rate',
    source: 'room',
    sourceRoomType: 'point_defense_station',
  },

  // === Quarters jobs ===
  {
    type: 'rest',
    name: 'Rest',
    description: 'Off-duty rest and recovery.',
    icon: '🛏️',
    skill: null,
    required: false,
    trainRate: 0,
    bonusDescription: 'Morale recovery for assigned crew',
    source: 'room',
    sourceRoomType: 'quarters',
  },

  // === Equipment-sourced jobs ===
  {
    type: 'scanner',
    name: 'Scan Ops',
    description:
      'Hazard detection and route analysis using deep-space scanner.',
    icon: '📊',
    skill: 'astrogation',
    required: false,
    trainRate: 0.00004,
    bonusDescription: 'Encounter detection, evasion chance',
    source: 'equipment',
    sourceEquipmentId: 'nav_scanner',
  },
  {
    type: 'targeting',
    name: 'Targeting',
    description: 'Manual targeting for point defense turrets.',
    icon: '🎯',
    skill: 'strength',
    required: false,
    trainRate: 0.00004,
    bonusDescription: 'PD effectiveness, debris destruction',
    source: 'equipment',
    sourceEquipmentId: 'point_defense',
  },

  // === Ship-wide jobs ===
  {
    type: 'repair',
    name: 'Repair',
    description: 'Ship-wide equipment maintenance and repair.',
    icon: '🔧',
    skill: 'engineering',
    required: false,
    trainRate: 0.00004,
    bonusDescription: 'Repair points distributed to degraded equipment',
    source: 'ship',
  },
];

export function getJobSlotDefinition(
  type: JobSlotType
): JobSlotDefinition | undefined {
  return JOB_SLOT_DEFINITIONS.find((d) => d.type === type);
}

/**
 * How many room-sourced job slots each room type generates.
 */
const ROOM_JOB_COUNTS: Partial<
  Record<RoomType, { type: JobSlotType; count: number }[]>
> = {
  bridge: [
    { type: 'helm', count: 1 },
    { type: 'comms', count: 1 },
  ],
  engine_room: [{ type: 'drive_ops', count: 3 }],
  reactor_room: [{ type: 'containment', count: 2 }],
  cantina: [{ type: 'galley', count: 1 }],
  medbay: [{ type: 'patient', count: 2 }],
  armory: [{ type: 'arms_maint', count: 2 }],
  point_defense_station: [{ type: 'fire_control', count: 1 }],
  quarters: [{ type: 'rest', count: 2 }],
  // cargo_hold has no jobs (automated)
};

/**
 * Equipment that generates job slots and the room type it attaches to.
 * If the room type doesn't exist on the ship, the job slot is still created (ship-wide fallback).
 */
const EQUIPMENT_JOB_MAP: Partial<
  Record<EquipmentId, { type: JobSlotType; attachRoom: RoomType }>
> = {
  nav_scanner: { type: 'scanner', attachRoom: 'bridge' },
  point_defense: { type: 'targeting', attachRoom: 'point_defense_station' },
};

/** How many repair slots to create (players can assign multiple engineers) */
const REPAIR_SLOT_COUNT = 3;

/**
 * Generate all job slots for a ship based on its rooms and equipment.
 * This is called during ship creation. Existing assignments are not preserved.
 */
export function generateJobSlotsForShip(ship: Ship): JobSlot[] {
  const slots: JobSlot[] = [];

  // Room-sourced slots
  for (const room of ship.rooms) {
    const jobDefs = ROOM_JOB_COUNTS[room.type];
    if (!jobDefs) continue;

    for (const jobDef of jobDefs) {
      for (let i = 0; i < jobDef.count; i++) {
        slots.push({
          id: generateId(),
          type: jobDef.type,
          assignedCrewId: null,
          sourceRoomId: room.id,
        });
      }
    }
  }

  // Equipment-sourced slots
  for (const eq of ship.equipment) {
    const mapping = EQUIPMENT_JOB_MAP[eq.definitionId];
    if (!mapping) continue;

    // Find the room to attach to
    const targetRoom = ship.rooms.find((r) => r.type === mapping.attachRoom);

    slots.push({
      id: generateId(),
      type: mapping.type,
      assignedCrewId: null,
      sourceRoomId: targetRoom?.id,
      sourceEquipmentId: eq.id,
    });
  }

  // Ship-wide repair slots
  for (let i = 0; i < REPAIR_SLOT_COUNT; i++) {
    slots.push({
      id: generateId(),
      type: 'repair',
      assignedCrewId: null,
    });
  }

  return slots;
}

// ── Helper functions for querying job slot state ──

/** Find the job slot a crew member is assigned to */
export function getCrewJobSlot(
  ship: Ship,
  crewId: string
): JobSlot | undefined {
  return ship.jobSlots.find((s) => s.assignedCrewId === crewId);
}

/** Get all crew assigned to a specific job slot type */
export function getCrewForJobType(ship: Ship, type: JobSlotType): CrewMember[] {
  const crewIds = ship.jobSlots
    .filter((s) => s.type === type && s.assignedCrewId !== null)
    .map((s) => s.assignedCrewId!);
  return crewIds
    .map((id) => ship.crew.find((c) => c.id === id))
    .filter((c): c is CrewMember => c !== undefined);
}

/** Get all job slots belonging to a specific room */
export function getRoomJobSlots(ship: Ship, roomId: string): JobSlot[] {
  return ship.jobSlots.filter((s) => s.sourceRoomId === roomId);
}

/** Check if any job slot in a room has crew assigned */
export function isRoomStaffed(ship: Ship, roomId: string): boolean {
  return ship.jobSlots.some(
    (s) => s.sourceRoomId === roomId && s.assignedCrewId !== null
  );
}

/** Get crew not assigned to any job slot */
export function getUnassignedCrew(ship: Ship): CrewMember[] {
  const assignedIds = new Set(
    ship.jobSlots
      .filter((s) => s.assignedCrewId !== null)
      .map((s) => s.assignedCrewId!)
  );
  return ship.crew.filter((c) => !assignedIds.has(c.id));
}

/** Check if helm is manned */
export function isHelmManned(ship: Ship): boolean {
  return ship.jobSlots.some(
    (s) => s.type === 'helm' && s.assignedCrewId !== null
  );
}

/**
 * Auto-assign crew to their best-fit job slots.
 * Assigns based on skill affinity: crew with highest relevant skill gets priority.
 */
export function autoAssignCrewToJobs(ship: Ship): void {
  // Clear all assignments first
  for (const slot of ship.jobSlots) {
    slot.assignedCrewId = null;
  }

  // Build priority list: required jobs first, then skilled jobs, then passive
  const sortedSlots = [...ship.jobSlots].sort((a, b) => {
    const defA = getJobSlotDefinition(a.type);
    const defB = getJobSlotDefinition(b.type);
    // Required first
    if (defA?.required && !defB?.required) return -1;
    if (!defA?.required && defB?.required) return 1;
    // Skilled before passive
    if (defA?.skill && !defB?.skill) return -1;
    if (!defA?.skill && defB?.skill) return 1;
    // Higher XP rate first
    return (defB?.trainRate ?? 0) - (defA?.trainRate ?? 0);
  });

  const assignedCrewIds = new Set<string>();
  const availableCrew = [...ship.crew];

  for (const slot of sortedSlots) {
    if (availableCrew.length === 0) break;

    const def = getJobSlotDefinition(slot.type);
    if (!def) continue;

    // Find best crew member for this slot
    let bestCrew: CrewMember | null = null;
    let bestScore = -1;

    for (const crew of availableCrew) {
      if (assignedCrewIds.has(crew.id)) continue;

      let score = 0;
      if (def.skill) {
        // Score based on relevant skill level
        score = crew.skills[def.skill];
      } else {
        // Passive slots: prefer crew with lowest health (for patient) or lowest morale
        if (slot.type === 'patient') {
          score = 100 - crew.health;
        } else {
          score = 0; // Rest: anyone
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestCrew = crew;
      }
    }

    if (bestCrew) {
      slot.assignedCrewId = bestCrew.id;
      assignedCrewIds.add(bestCrew.id);
      availableCrew.splice(availableCrew.indexOf(bestCrew), 1);
    }
  }
}

/**
 * Remove a crew member from all job slots on a ship.
 */
export function unassignCrewFromAllSlots(ship: Ship, crewId: string): void {
  for (const slot of ship.jobSlots) {
    if (slot.assignedCrewId === crewId) {
      slot.assignedCrewId = null;
    }
  }
}

/**
 * Get total count of filled job slots in a room.
 */
export function getRoomCrewCount(ship: Ship, roomId: string): number {
  return ship.jobSlots.filter(
    (s) => s.sourceRoomId === roomId && s.assignedCrewId !== null
  ).length;
}

/**
 * Get total count of job slots in a room.
 */
export function getRoomSlotCount(ship: Ship, roomId: string): number {
  return ship.jobSlots.filter((s) => s.sourceRoomId === roomId).length;
}
