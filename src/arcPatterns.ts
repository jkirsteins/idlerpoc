import type {
  ChronicleEntry,
  CrewMember,
  Ship,
  ArcType,
  GameData,
} from './models';

/**
 * Arc Pattern Definitions
 *
 * Each pattern scans an actor's chronicle for qualifying event sequences
 * that form a narratively interesting arc. Patterns return null if the
 * arc conditions are not met.
 *
 * See docs/emergent-storytelling.md for the full pattern catalog.
 */

export interface ArcMatch {
  entries: ChronicleEntry[];
  emotionalArc: number[];
  metadata: Record<string, string | number>;
  title: string;
  rating: number;
}

export interface ArcPattern {
  arcType: ArcType;
  actorType: 'crew' | 'ship' | 'both';
  detect: (
    entries: ChronicleEntry[],
    actor: CrewMember | Ship,
    gameData: GameData
  ) => ArcMatch | null;
}

// ── Crew Patterns ───────────────────────────────────────────────

/**
 * Survivor: Crew member has 2+ near-death events and is still alive.
 */
const survivorPattern: ArcPattern = {
  arcType: 'survivor',
  actorType: 'crew',
  detect: (entries) => {
    const nearDeaths = entries.filter((e) => e.type === 'near_death');
    if (nearDeaths.length < 2) return null;

    // Must not have died
    if (entries.some((e) => e.type === 'death')) return null;

    const count = nearDeaths.length;
    const title =
      count >= 4 ? 'The Unkillable' : count >= 3 ? 'Nine Lives' : 'Survivor';

    return {
      entries: nearDeaths,
      emotionalArc: nearDeaths.map((e) => e.emotionalWeight),
      metadata: { survivalCount: count },
      title,
      rating: Math.min(5, count + 1),
    };
  },
};

/**
 * Rags to Riches: Hired with low skills, achieved a named rank.
 */
const ragsToRichesPattern: ArcPattern = {
  arcType: 'rags_to_riches',
  actorType: 'crew',
  detect: (entries) => {
    const hired = entries.find((e) => e.type === 'hired');
    const milestones = entries.filter((e) => e.type === 'skill_milestone');
    if (!hired || milestones.length === 0) return null;

    const startSkill = (hired.details.totalSkills as number) ?? 0;
    if (startSkill > 10) return null; // Must have started low

    const bestMilestone = milestones[milestones.length - 1];
    const endRank = (bestMilestone.details.newRank as string) ?? '';

    const rankTiers: Record<string, number> = {
      Competent: 2,
      Proficient: 3,
      Skilled: 4,
      Expert: 4,
      Master: 5,
    };
    const rating = rankTiers[endRank];
    if (!rating) return null;

    return {
      entries: [hired, ...milestones],
      emotionalArc: [0, ...milestones.map(() => 2)],
      metadata: { startSkill, endRank },
      title: `From Nothing to ${endRank}`,
      rating,
    };
  },
};

/**
 * Old Reliable: Longest-serving crew with significant contract completions.
 */
const oldReliablePattern: ArcPattern = {
  arcType: 'old_reliable',
  actorType: 'crew',
  detect: (entries, actor) => {
    const crew = actor as CrewMember;
    const hired = entries.find((e) => e.type === 'hired');
    if (!hired) return null;

    // Must not have died
    if (entries.some((e) => e.type === 'death')) return null;

    // Check for variety of experiences
    const combatEntries = entries.filter(
      (e) =>
        e.type === 'combat_victory' ||
        e.type === 'boarding_survived' ||
        e.type === 'close_call' ||
        e.type === 'negotiation_save'
    );
    const skillEntries = entries.filter((e) => e.type === 'skill_milestone');

    const totalExperiences = combatEntries.length + skillEntries.length;
    if (totalExperiences < 5) return null;

    const totalSkills =
      crew.skills.piloting +
      crew.skills.mining +
      crew.skills.commerce +
      crew.skills.repairs;

    return {
      entries: [
        hired,
        ...combatEntries.slice(0, 3),
        ...skillEntries.slice(0, 3),
      ],
      emotionalArc: [
        0,
        ...combatEntries.slice(0, 3).map((e) => e.emotionalWeight),
        ...skillEntries.slice(0, 3).map(() => 2),
      ],
      metadata: {
        totalExperiences,
        totalSkills: Math.round(totalSkills),
      },
      title: 'Old Reliable',
      rating: Math.min(5, Math.floor(totalExperiences / 3) + 1),
    };
  },
};

/**
 * Legend Pilot: Exceptional gravity assist record.
 */
const legendPilotPattern: ArcPattern = {
  arcType: 'legend_pilot',
  actorType: 'crew',
  detect: (entries) => {
    const assists = entries.filter((e) => e.type === 'gravity_assist_master');
    if (assists.length < 5) return null;

    const totalFuelSaved = assists.reduce(
      (sum, e) => sum + ((e.details.fuelSaved as number) ?? 0),
      0
    );

    return {
      entries: assists,
      emotionalArc: assists.map(() => 1),
      metadata: {
        assistCount: assists.length,
        totalFuelSaved: Math.round(totalFuelSaved),
      },
      title: 'Navigator Legend',
      rating: Math.min(5, Math.floor(assists.length / 3) + 1),
    };
  },
};

/**
 * Rescue Hero: Participated in 2+ stranded ship rescues.
 */
const rescueHeroPattern: ArcPattern = {
  arcType: 'rescue_hero',
  actorType: 'crew',
  detect: (entries) => {
    const rescues = entries.filter((e) => e.type === 'rescue_participant');
    if (rescues.length < 2) return null;

    return {
      entries: rescues,
      emotionalArc: rescues.map(() => 2),
      metadata: { rescueCount: rescues.length },
      title:
        rescues.length >= 4
          ? 'Guardian Angel'
          : rescues.length >= 3
            ? 'Fleet Savior'
            : 'Rescue Hero',
      rating: Math.min(5, rescues.length + 1),
    };
  },
};

/**
 * Battle Brothers: Two crew with deep bond from shared combat.
 */
const battleBrothersPattern: ArcPattern = {
  arcType: 'battle_brothers',
  actorType: 'crew',
  detect: (entries, actor) => {
    const crew = actor as CrewMember;
    if (!crew.relationships) return null;

    const battleBonds = crew.relationships.filter(
      (r) => r.bondType === 'battle_brother' && r.sharedEvents >= 3
    );
    if (battleBonds.length === 0) return null;

    const strongestBond = battleBonds.reduce((best, r) =>
      r.bond > best.bond ? r : best
    );

    const combatEntries = entries.filter(
      (e) =>
        e.type === 'combat_victory' ||
        e.type === 'boarding_survived' ||
        e.type === 'close_call'
    );
    if (combatEntries.length < 2) return null;

    return {
      entries: combatEntries.slice(0, 5),
      emotionalArc: combatEntries.slice(0, 5).map((e) => e.emotionalWeight),
      metadata: {
        partnerName: strongestBond.otherCrewName,
        bondStrength: strongestBond.bond,
        sharedEvents: strongestBond.sharedEvents,
      },
      title: 'Brothers in Arms',
      rating: Math.min(5, Math.floor(strongestBond.bond / 20) + 1),
    };
  },
};

/**
 * Mentor/Protege: Mentor bond where protege's skills grew significantly.
 */
const mentorProtegePattern: ArcPattern = {
  arcType: 'mentor_protege',
  actorType: 'crew',
  detect: (entries, actor) => {
    const crew = actor as CrewMember;
    if (!crew.relationships) return null;

    const mentorBonds = crew.relationships.filter(
      (r) => r.bondType === 'mentor'
    );
    if (mentorBonds.length === 0) return null;

    const milestones = entries.filter((e) => e.type === 'skill_milestone');
    if (milestones.length < 2) return null;

    const strongestMentor = mentorBonds.reduce((best, r) =>
      r.bond > best.bond ? r : best
    );

    return {
      entries: milestones.slice(0, 5),
      emotionalArc: milestones.slice(0, 5).map(() => 2),
      metadata: {
        mentorName: strongestMentor.otherCrewName,
        bondStrength: strongestMentor.bond,
        milestonesReached: milestones.length,
      },
      title: `Apprentice of ${strongestMentor.otherCrewName}`,
      rating: Math.min(5, Math.floor(milestones.length / 2) + 1),
    };
  },
};

// ── Ship Patterns ───────────────────────────────────────────────

/**
 * Cursed Ship: Unusually high rate of bad events.
 */
const cursedShipPattern: ArcPattern = {
  arcType: 'cursed_ship',
  actorType: 'ship',
  detect: (entries) => {
    const badEvents = entries.filter(
      (e) =>
        e.type === 'boarding_survived' ||
        e.type === 'close_call' ||
        e.type === 'death' ||
        e.type === 'stranded'
    );
    if (badEvents.length < 3) return null;

    return {
      entries: badEvents.slice(0, 6),
      emotionalArc: badEvents.slice(0, 6).map((e) => e.emotionalWeight),
      metadata: { badEventCount: badEvents.length },
      title:
        badEvents.length >= 6
          ? 'The Damned'
          : badEvents.length >= 4
            ? 'Ill-Fated'
            : 'Star-Crossed',
      rating: Math.min(5, Math.floor(badEvents.length / 2) + 1),
    };
  },
};

/**
 * Lucky Ship: Unusually high rate of good outcomes.
 */
const luckyShipPattern: ArcPattern = {
  arcType: 'lucky_ship',
  actorType: 'ship',
  detect: (entries) => {
    const goodEvents = entries.filter(
      (e) =>
        e.type === 'combat_victory' ||
        e.type === 'rescue_participant' ||
        e.type === 'contract_milestone'
    );
    if (goodEvents.length < 4) return null;

    return {
      entries: goodEvents.slice(0, 6),
      emotionalArc: goodEvents.slice(0, 6).map((e) => e.emotionalWeight),
      metadata: { goodEventCount: goodEvents.length },
      title: goodEvents.length >= 6 ? 'The Blessed' : "Fortune's Favorite",
      rating: Math.min(5, Math.floor(goodEvents.length / 2)),
    };
  },
};

/**
 * From Ashes: Ship lost crew, rebuilt, and went on to succeed.
 */
const fromAshesPattern: ArcPattern = {
  arcType: 'from_ashes',
  actorType: 'ship',
  detect: (entries) => {
    const deaths = entries.filter((e) => e.type === 'death');
    if (deaths.length === 0) return null;

    // Find recovery events after the last death
    const lastDeathTime = deaths[deaths.length - 1].gameTime;
    const recoveryEvents = entries.filter(
      (e) =>
        e.gameTime > lastDeathTime &&
        (e.type === 'combat_victory' || e.type === 'contract_milestone')
    );
    if (recoveryEvents.length < 2) return null;

    const allEntries = [...deaths.slice(-2), ...recoveryEvents.slice(0, 3)];
    allEntries.sort((a, b) => a.gameTime - b.gameTime);

    return {
      entries: allEntries,
      emotionalArc: allEntries.map((e) => e.emotionalWeight),
      metadata: {
        deathCount: deaths.length,
        recoveryEvents: recoveryEvents.length,
      },
      title: 'From the Ashes',
      rating: Math.min(5, deaths.length + recoveryEvents.length),
    };
  },
};

/**
 * Frontier Pioneer: First ship to reach a distant location.
 */
const frontierPioneerPattern: ArcPattern = {
  arcType: 'frontier_pioneer',
  actorType: 'ship',
  detect: (entries) => {
    const visits = entries.filter((e) => e.type === 'first_visit');
    if (visits.length === 0) return null;

    // Find the most distant location visited
    const farthest = visits.reduce((best, e) => {
      const dist = (e.details.distanceFromEarth as number) ?? 0;
      const bestDist = (best.details.distanceFromEarth as number) ?? 0;
      return dist > bestDist ? e : best;
    });

    const distance = (farthest.details.distanceFromEarth as number) ?? 0;
    // Only interesting for far locations (Mars+, ~55M km minimum)
    if (distance < 50_000_000) return null;

    const locationName = (farthest.details.locationName as string) ?? 'unknown';

    return {
      entries: [farthest],
      emotionalArc: [2],
      metadata: {
        locationName,
        distanceFromEarth: Math.round(distance),
      },
      title: `Pioneer of ${locationName}`,
      rating: distance > 500_000_000 ? 4 : distance > 200_000_000 ? 3 : 2,
    };
  },
};

/**
 * Iron Crew: Ship survived crew death(s) and continued operations.
 */
const ironCrewPattern: ArcPattern = {
  arcType: 'iron_crew',
  actorType: 'ship',
  detect: (entries) => {
    const deaths = entries.filter((e) => e.type === 'death');
    if (deaths.length === 0) return null;

    const lastDeathTime = deaths[deaths.length - 1].gameTime;

    // Must have continued operating (victories or contracts) after loss
    const postLossActivity = entries.filter(
      (e) =>
        e.gameTime > lastDeathTime &&
        (e.type === 'combat_victory' ||
          e.type === 'contract_milestone' ||
          e.type === 'first_visit')
    );
    if (postLossActivity.length < 3) return null;

    const allEntries = [...deaths.slice(-1), ...postLossActivity.slice(0, 4)];
    allEntries.sort((a, b) => a.gameTime - b.gameTime);

    return {
      entries: allEntries,
      emotionalArc: allEntries.map((e) => e.emotionalWeight),
      metadata: {
        deathCount: deaths.length,
        postLossActivities: postLossActivity.length,
      },
      title: 'Iron Crew',
      rating: Math.min(
        5,
        Math.floor(deaths.length + postLossActivity.length / 2)
      ),
    };
  },
};

// ── Pattern Registry ────────────────────────────────────────────

export const ALL_ARC_PATTERNS: ArcPattern[] = [
  // Crew patterns
  survivorPattern,
  ragsToRichesPattern,
  oldReliablePattern,
  legendPilotPattern,
  rescueHeroPattern,
  battleBrothersPattern,
  mentorProtegePattern,
  // Ship patterns
  cursedShipPattern,
  luckyShipPattern,
  fromAshesPattern,
  frontierPioneerPattern,
  ironCrewPattern,
];
