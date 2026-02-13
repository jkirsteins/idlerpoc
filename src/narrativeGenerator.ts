import type { StoryArc, ArcType, PersonalityTrait } from './models';
// Personality traits are used via NarrativeContext.trait1/trait2 for flavor text

/**
 * Narrative Generator
 *
 * Template-based story text synthesis. Each ArcType has 3-5 narrative
 * template variants. Templates are filled with actor details, personality
 * traits, ship names, locations, and chronicle statistics.
 *
 * Personality traits color the narrative voice — a "stoic" survivor
 * reads differently from a "reckless" one.
 *
 * See docs/emergent-storytelling.md for narrative design notes.
 */

interface NarrativeContext {
  actorName: string;
  shipName: string;
  trait1?: PersonalityTrait;
  trait2?: PersonalityTrait;
  metadata: Record<string, string | number>;
  entryCount: number;
  detectedAt: number;
  rating: number;
}

// ── Utilities ────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Personality Flavor ───────────────────────────────────────────

/**
 * Add a sentence of personality-colored flavor to the narrative.
 */
function getTraitFlavor(
  trait: PersonalityTrait | undefined,
  arcType: ArcType
): string | null {
  if (!trait) return null;

  const flavors: Partial<
    Record<PersonalityTrait, Partial<Record<ArcType, string>>>
  > = {
    stoic: {
      survivor: 'Through it all, they never flinched.',
      cursed_ship: 'The crew endures in silence.',
    },
    reckless: {
      survivor: 'Some say they go looking for trouble. They might be right.',
      battle_brothers: 'Two adrenaline junkies, twice the chaos.',
    },
    cautious: {
      legend_pilot: 'Every maneuver calculated to the decimal.',
      frontier_pioneer:
        'They checked the numbers three times before committing.',
    },
    gregarious: {
      mentor_protege: 'Teaching comes naturally to those who love to talk.',
      rescue_hero:
        'Their voice on the comm is the first thing rescued crews remember.',
    },
    meticulous: {
      old_reliable: 'Every system checked, every bolt tightened.',
      from_ashes: 'They rebuilt methodically, one system at a time.',
    },
    loyal: {
      iron_crew: 'They stayed when others would have walked away.',
      battle_brothers: 'Loyalty forged in fire.',
    },
    ambitious: {
      rags_to_riches: 'They always knew they were destined for more.',
    },
    sardonic: {
      cursed_ship: '"Another day, another catastrophe," they say with a grin.',
      survivor: '"Is that all you\'ve got?" they asked the void.',
    },
    idealistic: {
      rescue_hero: 'Every life saved reaffirms their belief in the mission.',
    },
    pragmatic: {
      lucky_ship: 'They would call it preparation, not luck.',
    },
  };

  return flavors[trait]?.[arcType] ?? null;
}

// ── Templates ────────────────────────────────────────────────────

type TemplateFunc = (ctx: NarrativeContext) => string;

const NARRATIVE_TEMPLATES: Record<ArcType, TemplateFunc[]> = {
  survivor: [
    (ctx) => {
      const count = ctx.metadata.survivalCount ?? ctx.entryCount;
      return `${ctx.actorName} has cheated death ${count} times. Radiation exposure, pirate attacks, oxygen failures — each time the medbay brought them back. Still breathing. Still flying.`;
    },
    (ctx) => {
      const count = ctx.metadata.survivalCount ?? ctx.entryCount;
      return `They called ${ctx.actorName} unlucky after the first near-death. After the second, they called them something else entirely. ${count} close calls and counting.`;
    },
    (ctx) => {
      const count = ctx.metadata.survivalCount ?? ctx.entryCount;
      return `${count} times the void tried to claim ${ctx.actorName}. ${count} times it failed. The crew has stopped betting against them.`;
    },
  ],

  rags_to_riches: [
    (ctx) => {
      const endRank = ctx.metadata.endRank ?? 'unknown';
      return `Hired with barely enough skill to hold a wrench, ${ctx.actorName} rose through the ranks to become ${endRank}. A testament to hard work and good ship assignments.`;
    },
    (ctx) => {
      const endRank = ctx.metadata.endRank ?? 'unknown';
      return `When ${ctx.actorName} first stepped aboard, nobody expected much. Now ranked ${endRank}, they've proven every doubter wrong.`;
    },
    (ctx) => {
      const startSkill = ctx.metadata.startSkill ?? 0;
      const endRank = ctx.metadata.endRank ?? 'unknown';
      return `From a total skill rating of ${startSkill} to ${endRank} — ${ctx.actorName}'s journey is the definition of from nothing to something.`;
    },
  ],

  old_reliable: [
    (ctx) => {
      const exp = ctx.metadata.totalExperiences ?? 0;
      return `${ctx.actorName} has been through it all — combat, contracts, crises. With ${exp} notable experiences under their belt, they're the backbone of the crew.`;
    },
    (ctx) => {
      return `Some crew members come and go. ${ctx.actorName} stays. Through every battle, every haul, every close call — always there, always reliable.`;
    },
    (ctx) => {
      const skills = ctx.metadata.totalSkills ?? 0;
      return `${ctx.actorName}, total skill rating ${skills}. Not the flashiest crew member, but the one you'd want beside you when things go wrong. And things always go wrong.`;
    },
  ],

  legend_pilot: [
    (ctx) => {
      const assists = ctx.metadata.assistCount ?? 0;
      const fuel = ctx.metadata.totalFuelSaved ?? 0;
      return `${ctx.actorName} has mastered the art of gravity assists — ${assists} perfect slingshot maneuvers, saving ${fuel} kg of fuel. The navigator every captain dreams of.`;
    },
    (ctx) => {
      const assists = ctx.metadata.assistCount ?? 0;
      return `${assists} gravity assists and counting. ${ctx.actorName} reads orbital mechanics the way most people read breakfast menus — naturally and with confidence.`;
    },
  ],

  rescue_hero: [
    (ctx) => {
      const count = ctx.metadata.rescueCount ?? 0;
      return `When stranded ships send distress calls, ${ctx.actorName} answers. ${count} rescue missions, ${count} crews brought home alive.`;
    },
    (ctx) => {
      const count = ctx.metadata.rescueCount ?? 0;
      return `${ctx.actorName} has pulled ${count} crews back from the edge of the void. In the deep black, they're the name you pray to hear on the comm.`;
    },
  ],

  battle_brothers: [
    (ctx) => {
      const partner = ctx.metadata.partnerName ?? 'their comrade';
      const events = ctx.metadata.sharedEvents ?? 0;
      return `${ctx.actorName} and ${partner} have fought side by side through ${events} engagements. What started as shipmates became something forged in fire.`;
    },
    (ctx) => {
      const partner = ctx.metadata.partnerName ?? 'their comrade';
      return `Some bonds are built over drinks. ${ctx.actorName} and ${partner} built theirs over pirate gunfire and near-death experiences. Brothers in everything but blood.`;
    },
  ],

  mentor_protege: [
    (ctx) => {
      const mentor = ctx.metadata.mentorName ?? 'their mentor';
      const milestones = ctx.metadata.milestonesReached ?? 0;
      return `Under the guidance of ${mentor}, ${ctx.actorName} has reached ${milestones} skill milestones. The student may soon surpass the teacher.`;
    },
    (ctx) => {
      const mentor = ctx.metadata.mentorName ?? 'their mentor';
      return `Every great crew member has someone who believed in them first. For ${ctx.actorName}, that was ${mentor} — and the results speak for themselves.`;
    },
  ],

  cursed_ship: [
    (ctx) => {
      const count = ctx.metadata.badEventCount ?? 0;
      return `${ctx.actorName} has seen more than her share of misfortune — ${count} incidents of piracy, system failures, and worse. The crew whispers about bad luck, but they keep flying.`;
    },
    (ctx) => {
      const count = ctx.metadata.badEventCount ?? 0;
      return `${count} incidents and counting. ${ctx.actorName}'s log reads like a catalog of everything that can go wrong in deep space. And yet, somehow, she's still out there.`;
    },
    (ctx) => {
      return `Old spacers have a word for ships like ${ctx.actorName}: cursed. New spacers just call it "bad luck." The crew calls it Tuesday.`;
    },
  ],

  lucky_ship: [
    (ctx) => {
      const count = ctx.metadata.goodEventCount ?? 0;
      return `${count} victories, rescues, and completed contracts — ${ctx.actorName} seems to attract good fortune wherever she flies.`;
    },
    (ctx) => {
      return `Some ships are just born lucky. ${ctx.actorName} finds victory in every engagement, profit in every run. The crew has stopped questioning it and started enjoying it.`;
    },
  ],

  from_ashes: [
    (ctx) => {
      const deaths = ctx.metadata.deathCount ?? 0;
      const recovery = ctx.metadata.recoveryEvents ?? 0;
      return `${ctx.actorName} lost ${deaths} crew member${deaths !== 1 ? 's' : ''} and kept flying. ${recovery} successful missions since the darkest day. From the ashes, something stronger.`;
    },
    (ctx) => {
      return `They said ${ctx.actorName} was finished after the losses. The remaining crew said otherwise. They rebuilt, they flew, they proved everyone wrong.`;
    },
  ],

  frontier_pioneer: [
    (ctx) => {
      const location = ctx.metadata.locationName ?? 'the frontier';
      const distance = ctx.metadata.distanceFromEarth ?? 0;
      return `${ctx.actorName} was the first to reach ${location}, ${typeof distance === 'number' ? Math.round(distance / 1_000_000) + ' million' : distance} km from Earth. Where others saw the edge of known space, her crew saw opportunity.`;
    },
    (ctx) => {
      const location = ctx.metadata.locationName ?? 'the frontier';
      return `First to ${location}. The crew of ${ctx.actorName} planted their flag at the edge of human reach. History will remember the name.`;
    },
  ],

  iron_crew: [
    (ctx) => {
      const deaths = ctx.metadata.deathCount ?? 0;
      const activities = ctx.metadata.postLossActivities ?? 0;
      return `${ctx.actorName} lost ${deaths} crew member${deaths !== 1 ? 's' : ''} but the survivors pressed on — ${activities} missions completed in the aftermath. Iron will, iron crew.`;
    },
    (ctx) => {
      return `Loss is part of the deep black. What matters is what comes after. The crew of ${ctx.actorName} chose to keep flying, and they haven't stopped since.`;
    },
  ],

  merchant_prince: [
    (ctx) => {
      return `${ctx.actorName}'s ledger tells the story better than words: a trading empire built one contract at a time.`;
    },
  ],
};

// ── Public API ───────────────────────────────────────────────────

/**
 * Generate narrative text for a story arc.
 * Returns a short paragraph suitable for the stories tab and share cards.
 */
export function generateNarrative(arc: StoryArc): string {
  const ctx: NarrativeContext = {
    actorName: arc.actorName,
    shipName: arc.shipId ? `the ${arc.actorName}` : 'Unknown',
    entryCount: arc.entries.length,
    detectedAt: arc.detectedAt,
    rating: arc.rating,
    metadata: {},
  };

  // Extract metadata from arc entries
  for (const entry of arc.entries) {
    for (const [key, value] of Object.entries(entry.details)) {
      if (typeof value === 'string' || typeof value === 'number') {
        ctx.metadata[key] = value;
      }
    }
  }

  // Try to get personality traits from the first entry's details
  const firstEntry = arc.entries[0];
  if (firstEntry) {
    ctx.trait1 = firstEntry.details.trait1 as PersonalityTrait | undefined;
    ctx.trait2 = firstEntry.details.trait2 as PersonalityTrait | undefined;
  }

  const templates = NARRATIVE_TEMPLATES[arc.arcType];
  if (!templates || templates.length === 0) {
    return `${arc.actorName} — ${arc.title}. A story of ${arc.arcType.replace(/_/g, ' ')}.`;
  }

  // Pick template deterministically from arc ID
  const idx = simpleHash(arc.id) % templates.length;
  let text = templates[idx](ctx);

  // Append trait flavor if available
  const traitFlavor = getTraitFlavor(ctx.trait1, arc.arcType);
  if (traitFlavor) {
    text += ' ' + traitFlavor;
  }

  return text;
}

/**
 * Generate a short share-friendly version of the narrative.
 * Suitable for clipboard copy and social media.
 */
export function generateShareText(arc: StoryArc): string {
  const narrative = generateNarrative(arc);
  const stars = '\u2605'.repeat(arc.rating) + '\u2606'.repeat(5 - arc.rating);

  return [
    `STARSHIP COMMANDER — ${arc.title}`,
    `${stars}`,
    '',
    narrative,
    '',
    '#StarshipCommander',
  ].join('\n');
}
