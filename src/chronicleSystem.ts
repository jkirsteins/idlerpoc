import type {
  ChronicleEntry,
  ChronicleEventType,
  CrewMember,
  GameData,
  Ship,
} from './models';
import { on } from './gameEvents';
import type { GameEvent } from './gameEvents';

/**
 * Chronicle System
 *
 * A passive observer that watches game events via the event bus and creates
 * enriched, persistent chronicle entries on crew members and ships.
 *
 * Chronicles are the data layer for the emergent storytelling system.
 * They differ from log entries: chronicles are actor-centric (per crew/ship),
 * persistent (capped but not ephemeral), and carry rich contextual metadata
 * for arc detection.
 *
 * See docs/emergent-storytelling.md for full system design.
 */

/** Maximum chronicle entries per actor (crew member or ship). */
const MAX_CHRONICLE_ENTRIES = 50;

/**
 * Add a chronicle entry to a crew member.
 * Handles initialization and pruning.
 */
export function addCrewChronicle(
  crew: CrewMember,
  entry: ChronicleEntry
): void {
  if (!crew.chronicle) {
    crew.chronicle = [];
  }
  crew.chronicle.push(entry);
  pruneChronicle(crew.chronicle);
}

/**
 * Add a chronicle entry to a ship.
 * Handles initialization and pruning.
 */
export function addShipChronicle(ship: Ship, entry: ChronicleEntry): void {
  if (!ship.chronicle) {
    ship.chronicle = [];
  }
  ship.chronicle.push(entry);
  pruneChronicle(ship.chronicle);
}

/**
 * Prune a chronicle array to stay within MAX_CHRONICLE_ENTRIES.
 * Removes lowest-emotionalWeight entries first.
 */
function pruneChronicle(chronicle: ChronicleEntry[]): void {
  if (chronicle.length <= MAX_CHRONICLE_ENTRIES) return;

  // Sort by absolute emotional weight (ascending) — prune least dramatic first
  const indexed = chronicle.map((e, i) => ({
    idx: i,
    weight: Math.abs(e.emotionalWeight),
  }));
  indexed.sort((a, b) => a.weight - b.weight);

  const toRemove = chronicle.length - MAX_CHRONICLE_ENTRIES;
  const removeIndices = new Set(indexed.slice(0, toRemove).map((e) => e.idx));

  // Remove in reverse order to preserve indices
  for (let i = chronicle.length - 1; i >= 0; i--) {
    if (removeIndices.has(i)) {
      chronicle.splice(i, 1);
    }
  }
}

interface MakeEntryOpts {
  gameData: GameData;
  type: ChronicleEventType;
  actorId: string;
  actorType: 'crew' | 'ship';
  ship: Ship;
  emotionalWeight: number;
  tags: string[];
  details: Record<string, string | number | boolean>;
  locationId?: string;
}

/**
 * Create a chronicle entry with common fields filled in.
 */
function makeEntry(opts: MakeEntryOpts): ChronicleEntry {
  return {
    gameTime: opts.gameData.gameTime,
    type: opts.type,
    actorId: opts.actorId,
    actorType: opts.actorType,
    shipId: opts.ship.id,
    shipName: opts.ship.name,
    locationId: opts.locationId,
    details: opts.details,
    emotionalWeight: opts.emotionalWeight,
    tags: opts.tags,
  };
}

/**
 * Get the current location ID for a ship.
 */
function getShipLocationId(ship: Ship): string | undefined {
  return ship.location.dockedAt ?? ship.location.orbitingAt;
}

/**
 * Update crew relationships when a chronicle-worthy event involves
 * multiple crew on the same ship.
 */
function updateRelationships(
  ship: Ship,
  eventType: ChronicleEventType,
  excludeCrewId?: string
): void {
  const combatEvents: ChronicleEventType[] = [
    'combat_victory',
    'boarding_survived',
    'close_call',
    'negotiation_save',
  ];
  const isCombatEvent = combatEvents.includes(eventType);
  const bondGain = isCombatEvent ? 10 : 5;

  if (ship.crew.length < 2) return;

  for (const crewA of ship.crew) {
    if (crewA.id === excludeCrewId) continue;
    for (const crewB of ship.crew) {
      if (crewB.id === crewA.id || crewB.id === excludeCrewId) continue;

      if (!crewA.relationships) crewA.relationships = [];
      let rel = crewA.relationships.find((r) => r.otherCrewId === crewB.id);
      if (!rel) {
        rel = {
          otherCrewId: crewB.id,
          otherCrewName: crewB.name,
          bond: 0,
          bondType: 'shipmate',
          sharedEvents: 0,
        };
        crewA.relationships.push(rel);
      }

      rel.bond = Math.min(100, rel.bond + bondGain);
      rel.sharedEvents++;

      // Update bond type based on thresholds
      if (rel.bond >= 50) {
        const totalA =
          crewA.skills.piloting +
          crewA.skills.mining +
          crewA.skills.commerce +
          crewA.skills.repairs;
        const totalB =
          crewB.skills.piloting +
          crewB.skills.mining +
          crewB.skills.commerce +
          crewB.skills.repairs;
        if (Math.abs(totalA - totalB) > 20) {
          rel.bondType = 'mentor';
        } else {
          rel.bondType = 'battle_brother';
        }
      } else if (rel.bond >= 30) {
        rel.bondType = 'battle_brother';
      }
    }
  }
}

// ── Event Handlers ──────────────────────────────────────────────

function handleCrewHired(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'crew_hired') return;
  const { crew, ship, locationId } = event;

  const totalSkills =
    crew.skills.piloting +
    crew.skills.mining +
    crew.skills.commerce +
    crew.skills.repairs;

  const entry = makeEntry({
    gameData,
    type: 'hired',
    actorId: crew.id,
    actorType: 'crew',
    ship,
    emotionalWeight: 1,
    tags: ['hired', 'beginning'],
    details: {
      locationId,
      totalSkills: Math.round(totalSkills * 10) / 10,
      role: crew.role,
      trait1: crew.personality?.trait1 ?? 'unknown',
      trait2: crew.personality?.trait2 ?? 'unknown',
    },
    locationId,
  });
  addCrewChronicle(crew, entry);
}

function handleCrewDeath(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'crew_death') return;
  const { crew, ship, cause } = event;

  const serviceDuration = gameData.gameTime - crew.hiredAt;
  const totalSkills =
    crew.skills.piloting +
    crew.skills.mining +
    crew.skills.commerce +
    crew.skills.repairs;

  const entry = makeEntry({
    gameData,
    type: 'death',
    actorId: crew.id,
    actorType: 'crew',
    ship,
    emotionalWeight: -3,
    tags: ['death', cause],
    details: {
      cause,
      serviceDuration,
      totalSkillsAtDeath: Math.round(totalSkills * 10) / 10,
      role: crew.role,
    },
    locationId: getShipLocationId(ship),
  });
  addCrewChronicle(crew, entry);

  // Also add to ship chronicle
  const shipEntry = makeEntry({
    gameData,
    type: 'death',
    actorId: ship.id,
    actorType: 'ship',
    ship,
    emotionalWeight: -3,
    tags: ['crew_loss', cause],
    details: {
      crewName: crew.name,
      cause,
      crewRole: crew.role,
    },
    locationId: getShipLocationId(ship),
  });
  addShipChronicle(ship, shipEntry);

  // Create comrade_lost entries for bonded crew
  for (const otherCrew of ship.crew) {
    if (otherCrew.id === crew.id) continue;
    const rel = otherCrew.relationships?.find((r) => r.otherCrewId === crew.id);
    if (rel && rel.bond >= 10) {
      const lossEntry = makeEntry({
        gameData,
        type: 'comrade_lost',
        actorId: otherCrew.id,
        actorType: 'crew',
        ship,
        emotionalWeight: -2,
        tags: ['loss', 'emotional', rel.bondType],
        details: {
          lostCrewName: crew.name,
          bondType: rel.bondType,
          bondStrength: rel.bond,
        },
        locationId: getShipLocationId(ship),
      });
      addCrewChronicle(otherCrew, lossEntry);
    }
  }
}

function handleCrewDeparted(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'crew_departed') return;
  const { crew, ship, serviceDuration, unpaidTicks } = event;

  const entry = makeEntry({
    gameData,
    type: 'crew_departed',
    actorId: crew.id,
    actorType: 'crew',
    ship,
    emotionalWeight: -1,
    tags: ['departed'],
    details: {
      serviceDuration,
      unpaidTicks,
    },
    locationId: getShipLocationId(ship),
  });
  addCrewChronicle(crew, entry);
}

function handleNearDeath(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'crew_near_death') return;
  const { crew, ship, healthRemaining, cause } = event;

  const entry = makeEntry({
    gameData,
    type: 'near_death',
    actorId: crew.id,
    actorType: 'crew',
    ship,
    emotionalWeight: -2,
    tags: ['near_death', 'dramatic', cause],
    details: {
      healthRemaining: Math.round(healthRemaining * 10) / 10,
      cause,
    },
    locationId: getShipLocationId(ship),
  });
  addCrewChronicle(crew, entry);
}

function handleSkillMilestone(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'crew_skill_milestone') return;
  const { crew, ship, skill, newLevel, newRank } = event;

  const entry = makeEntry({
    gameData,
    type: 'skill_milestone',
    actorId: crew.id,
    actorType: 'crew',
    ship,
    emotionalWeight: 2,
    tags: ['skill_up', 'progression', skill],
    details: {
      skill,
      newLevel,
      newRank,
      trainingDuration: gameData.gameTime - crew.hiredAt,
    },
    locationId: getShipLocationId(ship),
  });
  addCrewChronicle(crew, entry);
}

function handleRoleChange(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'crew_role_change') return;
  const { crew, ship, oldRole, newRole } = event;

  const entry = makeEntry({
    gameData,
    type: 'role_change',
    actorId: crew.id,
    actorType: 'crew',
    ship,
    emotionalWeight: 1,
    tags: ['role_change', 'progression'],
    details: { oldRole, newRole },
    locationId: getShipLocationId(ship),
  });
  addCrewChronicle(crew, entry);
}

function handleEncounterResolved(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'encounter_resolved') return;
  const { result, ship } = event;

  // Only chronicle the more dramatic encounter outcomes
  switch (result.type) {
    case 'victory': {
      for (const crew of ship.crew) {
        const crewEntry = makeEntry({
          gameData,
          type: 'combat_victory',
          actorId: crew.id,
          actorType: 'crew',
          ship,
          emotionalWeight: 2,
          tags: ['combat', 'victory'],
          details: {
            threatLevel: result.threatLevel,
            bounty: result.creditsGained ?? 0,
          },
        });
        addCrewChronicle(crew, crewEntry);
      }
      const shipEntry = makeEntry({
        gameData,
        type: 'combat_victory',
        actorId: ship.id,
        actorType: 'ship',
        ship,
        emotionalWeight: 2,
        tags: ['combat', 'victory'],
        details: {
          threatLevel: result.threatLevel,
          bounty: result.creditsGained ?? 0,
          crewCount: ship.crew.length,
        },
      });
      addShipChronicle(ship, shipEntry);
      updateRelationships(ship, 'combat_victory');
      break;
    }
    case 'boarding': {
      for (const crew of ship.crew) {
        const healthLost = result.healthLost?.[crew.id] ?? 0;
        const crewEntry = makeEntry({
          gameData,
          type: 'boarding_survived',
          actorId: crew.id,
          actorType: 'crew',
          ship,
          emotionalWeight: -2,
          tags: ['combat', 'boarding', 'dramatic'],
          details: {
            healthLost: Math.round(healthLost * 10) / 10,
            creditsLost: result.creditsLost ?? 0,
            threatLevel: result.threatLevel,
          },
        });
        addCrewChronicle(crew, crewEntry);
      }
      const shipEntry = makeEntry({
        gameData,
        type: 'boarding_survived',
        actorId: ship.id,
        actorType: 'ship',
        ship,
        emotionalWeight: -2,
        tags: ['combat', 'boarding'],
        details: {
          creditsLost: result.creditsLost ?? 0,
          threatLevel: result.threatLevel,
        },
      });
      addShipChronicle(ship, shipEntry);
      updateRelationships(ship, 'boarding_survived');
      break;
    }
    case 'fled': {
      for (const crew of ship.crew) {
        const crewEntry = makeEntry({
          gameData,
          type: 'close_call',
          actorId: crew.id,
          actorType: 'crew',
          ship,
          emotionalWeight: -1,
          tags: ['combat', 'fled', 'close_call'],
          details: {
            defenseScore: Math.round((result.defenseScore ?? 0) * 10) / 10,
            pirateAttack: Math.round((result.pirateAttack ?? 0) * 10) / 10,
            threatLevel: result.threatLevel,
          },
        });
        addCrewChronicle(crew, crewEntry);
      }
      const shipEntry = makeEntry({
        gameData,
        type: 'close_call',
        actorId: ship.id,
        actorType: 'ship',
        ship,
        emotionalWeight: -1,
        tags: ['combat', 'fled'],
        details: { threatLevel: result.threatLevel },
      });
      addShipChronicle(ship, shipEntry);
      updateRelationships(ship, 'close_call');
      break;
    }
    case 'negotiated': {
      if (result.negotiatorId) {
        const negotiator = ship.crew.find((c) => c.id === result.negotiatorId);
        if (negotiator) {
          const entry = makeEntry({
            gameData,
            type: 'negotiation_save',
            actorId: negotiator.id,
            actorType: 'crew',
            ship,
            emotionalWeight: 1,
            tags: ['combat', 'negotiation', 'skill'],
            details: {
              ransom: result.creditsLost ?? 0,
              negotiatorName: result.negotiatorName ?? negotiator.name,
              threatLevel: result.threatLevel,
            },
          });
          addCrewChronicle(negotiator, entry);
        }
      }
      updateRelationships(ship, 'negotiation_save');
      break;
    }
    case 'evaded':
    case 'harassment':
      // Too common to chronicle — skip silently
      break;
  }
}

function handleShipStranded(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'ship_stranded') return;
  const { ship, locationId, provisionsDays } = event;

  const entry = makeEntry({
    gameData,
    type: 'stranded',
    actorId: ship.id,
    actorType: 'ship',
    ship,
    emotionalWeight: -2,
    tags: ['stranded', 'crisis'],
    details: { locationId, provisionsDays },
    locationId,
  });
  addShipChronicle(ship, entry);

  for (const crew of ship.crew) {
    const crewEntry = makeEntry({
      gameData,
      type: 'stranded',
      actorId: crew.id,
      actorType: 'crew',
      ship,
      emotionalWeight: -2,
      tags: ['stranded', 'crisis'],
      details: { locationId, provisionsDays },
      locationId,
    });
    addCrewChronicle(crew, crewEntry);
  }
}

function handleShipRescued(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'ship_rescued') return;
  const { rescuerShip, strandedShip, fuelDelivered } = event;

  // Rescuer crew get hero entries
  for (const crew of rescuerShip.crew) {
    const entry = makeEntry({
      gameData,
      type: 'rescue_participant',
      actorId: crew.id,
      actorType: 'crew',
      ship: rescuerShip,
      emotionalWeight: 2,
      tags: ['rescue', 'heroic'],
      details: {
        rescuedShipName: strandedShip.name,
        fuelDelivered,
      },
    });
    addCrewChronicle(crew, entry);
  }

  const rescuerShipEntry = makeEntry({
    gameData,
    type: 'rescue_participant',
    actorId: rescuerShip.id,
    actorType: 'ship',
    ship: rescuerShip,
    emotionalWeight: 2,
    tags: ['rescue', 'heroic'],
    details: {
      rescuedShipName: strandedShip.name,
      fuelDelivered,
    },
  });
  addShipChronicle(rescuerShip, rescuerShipEntry);
}

function handleContractCompleted(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'contract_completed') return;
  const { ship, questTitle, tripsCompleted, totalCreditsEarned } = event;

  // Only chronicle multi-trip contracts (significant achievements)
  if (tripsCompleted < 3) return;

  const entry = makeEntry({
    gameData,
    type: 'contract_milestone',
    actorId: ship.id,
    actorType: 'ship',
    ship,
    emotionalWeight: 2,
    tags: ['contract', 'achievement'],
    details: {
      questTitle,
      tripsCompleted,
      totalCreditsEarned,
    },
    locationId: getShipLocationId(ship),
  });
  addShipChronicle(ship, entry);
}

function handleFirstVisit(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'first_visit') return;
  const { ship, locationId, locationName, distanceFromEarth } = event;

  // Ship chronicle
  const shipEntry = makeEntry({
    gameData,
    type: 'first_visit',
    actorId: ship.id,
    actorType: 'ship',
    ship,
    emotionalWeight: 1,
    tags: ['exploration', 'first_visit'],
    details: {
      locationName,
      distanceFromEarth,
    },
    locationId,
  });
  addShipChronicle(ship, shipEntry);

  // Crew chronicles (for frontier_pioneer arcs)
  for (const crew of ship.crew) {
    const crewEntry = makeEntry({
      gameData,
      type: 'first_visit',
      actorId: crew.id,
      actorType: 'crew',
      ship,
      emotionalWeight: 1,
      tags: ['exploration', 'first_visit'],
      details: {
        locationName,
        distanceFromEarth,
      },
      locationId,
    });
    addCrewChronicle(crew, crewEntry);
  }
}

function handleGravityAssist(gameData: GameData, event: GameEvent): void {
  if (event.type !== 'gravity_assist') return;
  const { ship, pilotName, pilotId, bodyName, fuelSaved, success } = event;

  if (!success) return; // Only chronicle successes

  const pilot = ship.crew.find((c) => c.id === pilotId);
  if (!pilot) return;

  const entry = makeEntry({
    gameData,
    type: 'gravity_assist_master',
    actorId: pilot.id,
    actorType: 'crew',
    ship,
    emotionalWeight: 1,
    tags: ['navigation', 'gravity_assist', 'skill'],
    details: {
      bodyName,
      fuelSaved: Math.round(fuelSaved * 10) / 10,
      pilotName,
    },
  });
  addCrewChronicle(pilot, entry);
}

// ── Initialization ──────────────────────────────────────────────

/**
 * Register chronicle event handlers on the event bus.
 * Called once at application startup from main.ts::init().
 */
export function initChronicleSystem(): void {
  on('crew_hired', handleCrewHired);
  on('crew_death', handleCrewDeath);
  on('crew_departed', handleCrewDeparted);
  on('crew_near_death', handleNearDeath);
  on('crew_skill_milestone', handleSkillMilestone);
  on('crew_role_change', handleRoleChange);
  on('encounter_resolved', handleEncounterResolved);
  on('ship_stranded', handleShipStranded);
  on('ship_rescued', handleShipRescued);
  on('contract_completed', handleContractCompleted);
  on('first_visit', handleFirstVisit);
  on('gravity_assist', handleGravityAssist);
}
