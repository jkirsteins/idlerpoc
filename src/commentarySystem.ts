import type {
  GameData,
  Ship,
  CommentaryEntry,
  CommentaryTrigger,
  PersonalityTrait,
} from './models';
import { getCrewDynamic, getChemistryLabel } from './personalitySystem';
import { getProvisionsSurvivalDays } from './provisionsSystem';
import { hashString } from './utils';
import { TICKS_PER_DAY, GAME_SECONDS_PER_TICK } from './timeSystem';

/**
 * Commentary System
 *
 * Generates periodic personality-voiced reactions to crew situations.
 * These are context-aware "check-ins" — not event-driven (that's the chronicle).
 * Commentary provides early-game narrative texture before any arc fires.
 *
 * Architecture:
 * - checkCommentary() evaluates situational triggers in priority order
 * - Each trigger has a template bank keyed by personality trait
 * - Templates are selected deterministically (hashString) for consistency
 * - Throttled: one commentary per COMMENTARY_INTERVAL ticks, plus per-ship
 *   trigger dedup so the same trigger type doesn't repeat within 2 game days
 */

/** Minimum ticks between commentary entries (~4 real minutes). */
export const COMMENTARY_INTERVAL = 240;

/** Minimum ticks before same trigger type repeats on same ship (~2 game days). */
const TRIGGER_COOLDOWN = TICKS_PER_DAY * 2;

/** Maximum commentary entries retained in save. */
const MAX_COMMENTARY = 20;

/** Fuel percentage threshold for low-resource commentary. */
const LOW_FUEL_PCT = 30;

/** Provisions survival days threshold for low-resource commentary. */
const LOW_PROVISIONS_DAYS = 5;

/** Ticks docked before idle commentary triggers. */
const IDLE_DOCKED_THRESHOLD = TICKS_PER_DAY; // 1 game day

/** Contract trips on same route before repetition commentary. */
const REPETITION_TRIP_THRESHOLD = 3;

// ─── Template Types ─────────────────────────────────────────────

type TemplateFunc = (ctx: CommentaryContext) => string;

interface CommentaryContext {
  crewName: string;
  otherCrewName?: string;
  shipName: string;
  locationName?: string;
  trait: PersonalityTrait;
  chemistryLabel?: string;
}

// ─── Interpersonal Templates ────────────────────────────────────

/** Friction templates: one crew member's voiced reaction to another. */
const FRICTION_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  reckless: [
    (c) => `${c.crewName} thinks ${c.otherCrewName} overthinks everything.`,
    (c) =>
      `${c.crewName} has started ignoring ${c.otherCrewName}'s pre-flight advisories.`,
    (c) =>
      `"We'd get there faster if someone wasn't running checks every five minutes," ${c.crewName} muttered.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} has started triple-checking ${c.otherCrewName}'s flight plans.`,
    (c) =>
      `${c.crewName} filed a safety concern about ${c.otherCrewName}'s approach vectors. Again.`,
    (c) =>
      `${c.crewName} keeps a list of close calls. ${c.otherCrewName}'s name comes up often.`,
  ],
  ambitious: [
    (c) =>
      `${c.crewName} doesn't understand why ${c.otherCrewName} is content with milk runs.`,
    (c) =>
      `${c.crewName} suggested longer routes. ${c.otherCrewName} wasn't interested.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} wishes ${c.otherCrewName} would commit to the crew instead of keeping options open.`,
    (c) =>
      `${c.crewName} doesn't say much, but the tension with ${c.otherCrewName} is visible.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} disagree about why they're out here.`,
    (c) =>
      `"It's not just about credits," ${c.crewName} told ${c.otherCrewName}. The conversation ended there.`,
  ],
  pragmatic: [
    (c) =>
      `${c.crewName} cares about results. ${c.otherCrewName}'s reasons are their own business.`,
    (c) =>
      `${c.crewName} ignores ${c.otherCrewName}'s speeches about principle and checks the profit margins.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} keeps trying to draw ${c.otherCrewName} into conversation. It rarely works.`,
    (c) =>
      `${c.crewName} organized a ship dinner. ${c.otherCrewName} ate in the engine room.`,
  ],
  stoic: [
    (c) =>
      `${c.crewName} doesn't respond to ${c.otherCrewName}'s chatter. The silence speaks volumes.`,
    (c) => `${c.crewName} prefers the quiet of the night watch. Less talking.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName}'s maintenance logs now include a section labeled "operator error." It's not subtle.`,
    (c) =>
      `${c.crewName} has color-coded the checklist. ${c.otherCrewName} still skips half of it.`,
  ],
  sardonic: [
    (c) =>
      `${c.crewName} has a nickname for ${c.otherCrewName}. ${c.otherCrewName} hasn't figured it out yet.`,
    (c) =>
      `"Fascinating approach to navigation," ${c.crewName} said. They did not mean it as a compliment.`,
  ],
};

/** Synergy templates: one crew member appreciating or vibing with another. */
const SYNERGY_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  reckless: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} have started taking increasingly creative approaches to docking. Command should probably be concerned.`,
    (c) =>
      `${c.crewName} grins every time ${c.otherCrewName} suggests the fast route.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} run pre-flight together now. Silently. Efficiently.`,
    (c) =>
      `The checklists have checklists. ${c.crewName} and ${c.otherCrewName} wouldn't have it any other way.`,
  ],
  ambitious: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} are already planning routes three contracts ahead.`,
    (c) =>
      `Both want more. ${c.crewName} and ${c.otherCrewName} push each other forward.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} have an unspoken pact. Neither is going anywhere.`,
    (c) =>
      `Asked about transfers, ${c.crewName} just pointed at ${c.otherCrewName}. That was answer enough.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} stayed up arguing about what the fleet should stand for. They agreed on everything.`,
  ],
  pragmatic: [
    (c) =>
      `${c.crewName} handles the numbers. ${c.otherCrewName} handles the rest. It works.`,
  ],
  gregarious: [
    (c) => `${c.crewName} finally found someone who talks as much as they do.`,
  ],
  stoic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} share comfortable silence. No words needed.`,
  ],
  meticulous: [
    (c) =>
      `Between ${c.crewName} and ${c.otherCrewName}, the ${c.shipName} has never been in better condition.`,
  ],
  sardonic: [
    (c) =>
      `The rest of the crew can't tell if ${c.crewName} and ${c.otherCrewName} are fighting or bonding. Neither can they.`,
    (c) =>
      `${c.crewName} and ${c.otherCrewName} have developed their own shorthand. It's mostly insults.`,
  ],
};

// ─── Evolved Interpersonal Templates (bond >= 15) ───────────────
// As crew spend more time together, friction becomes grudging respect
// and synergy becomes deeper understanding.

/** Mid-bond friction: the edges are softer, but the dynamic persists. */
const FRICTION_EVOLVED_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  reckless: [
    (c) =>
      `${c.crewName} still thinks ${c.otherCrewName} overthinks. But they read the safety notes now.`,
    (c) =>
      `${c.crewName} and ${c.otherCrewName} found a rhythm. It's not agreement — it's tolerance. That's harder.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} still double-checks ${c.otherCrewName}'s plans. But now it's reflex, not distrust.`,
    (c) =>
      `${c.crewName} stopped filing safety reports about ${c.otherCrewName}. Progress, of a sort.`,
  ],
  ambitious: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} still disagree about ambition. But they've stopped arguing about it.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} doesn't understand ${c.otherCrewName}'s priorities. But they've stopped questioning them.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} still see the galaxy differently. They've agreed to disagree. Mostly.`,
  ],
  pragmatic: [
    (c) =>
      `${c.crewName} respects ${c.otherCrewName}'s competence, if not their philosophy.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} learned that ${c.otherCrewName} prefers silence. They still talk, but less.`,
  ],
  stoic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} developed a working shorthand. No extra words needed.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName}'s maintenance logs no longer mention ${c.otherCrewName}'s mistakes. Either they stopped, or ${c.crewName} stopped noticing.`,
  ],
  sardonic: [
    (c) =>
      `The nickname stuck. ${c.otherCrewName} uses it now too. It's... something.`,
  ],
};

/** Mid-bond synergy: deeper appreciation and trust. */
const SYNERGY_EVOLVED_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  reckless: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} don't need to discuss the plan anymore. A look is enough.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} trusts ${c.otherCrewName}'s checks. They don't need to verify the verifier.`,
  ],
  ambitious: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} have a five-year plan. They wrote it together.`,
  ],
  loyal: [
    (c) =>
      `The bond between ${c.crewName} and ${c.otherCrewName} is the kind of thing other crews envy.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} have started finishing each other's sentences about the mission.`,
  ],
  pragmatic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName}: efficient, effective, and quietly proud of it.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} are the social center of ${c.shipName}. Even the engine seems warmer.`,
  ],
  stoic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} share a silence that says more than most conversations.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} have made ${c.shipName} run better than factory specs. Together.`,
  ],
  sardonic: [
    (c) =>
      `${c.crewName} and ${c.otherCrewName} make everyone else feel like they're missing an inside joke. They are.`,
  ],
};

/** Shared events threshold for evolved commentary. */
const EVOLVED_BOND_THRESHOLD = 15;

// ─── Solo Crew Templates ────────────────────────────────────────

const SOLO_CREW_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  gregarious: [
    (c) =>
      `${c.crewName} has started naming the ship's subsystems. The nav computer is 'Compass.'`,
    (c) =>
      `${c.crewName} talks to the ship. The ship doesn't answer, but that hasn't stopped them.`,
  ],
  stoic: [
    (c) =>
      `${c.crewName} doesn't need conversation. The hum of the engines is company enough.`,
  ],
  sardonic: [
    (c) =>
      `The only downside of solo command, ${c.crewName} notes, is that there's no one to appreciate the jokes.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} keeps the ${c.shipName} running like a home. It's the only one they've got.`,
  ],
  ambitious: [
    (c) =>
      `${c.crewName} is already thinking about a bigger crew. And a bigger ship.`,
  ],
  reckless: [
    (c) =>
      `Solo on the ${c.shipName}, ${c.crewName} can fly however they want. That should worry someone.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} runs every system check twice. With no second pair of eyes, there's no room for error.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName} knows every sound the ${c.shipName} makes. Engine 2 has a slight vibration at 80% thrust.`,
  ],
  pragmatic: [
    (c) => `Solo means no salary overhead. ${c.crewName} has done the math.`,
  ],
  idealistic: [
    (c) =>
      `Alone on the bridge, ${c.crewName} watches the stars and remembers why they came out here.`,
  ],
};

// ─── First Flight Templates ─────────────────────────────────────

const FIRST_FLIGHT_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  reckless: [
    (c) =>
      `${c.crewName} punched the throttle before the docking clamps fully released. First flight energy.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} ran the departure checklist three times. Then once more for good measure.`,
  ],
  ambitious: [
    (c) => `First flight. ${c.crewName} is already thinking about the second.`,
  ],
  stoic: [
    (c) => `${c.crewName} watched Earth shrink in the viewport without a word.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} broadcast a departure message to anyone listening. Mostly static back.`,
  ],
  meticulous: [
    (c) =>
      `Engine output nominal. Heading confirmed. ${c.crewName} logged it all.`,
  ],
  pragmatic: [
    (c) =>
      `First flight means first paycheck on the horizon. ${c.crewName} likes the math.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} looked back at Earth once, then forward. This is what they came for.`,
  ],
  sardonic: [
    (c) =>
      `"And we're off," ${c.crewName} announced to no one in particular. "Try not to die."`,
  ],
  loyal: [(c) => `${c.crewName} made a quiet promise to bring everyone home.`],
};

// ─── Repetition Templates ───────────────────────────────────────

const REPETITION_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  ambitious: [
    (c) =>
      `${c.crewName} has stopped counting runs on this route. They're restless.`,
  ],
  reckless: [
    (c) =>
      `${c.crewName} is taking increasingly creative approaches to the docking sequence. Possibly out of boredom.`,
  ],
  cautious: [
    (c) =>
      `Same route, same checks. ${c.crewName} finds comfort in the routine.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} doesn't mind running the same route. They say they're learning its moods.`,
  ],
  sardonic: [
    (c) =>
      `"Groundhog day," ${c.crewName} announced as they loaded the same cargo at the same dock.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName} has documented seventeen micro-optimizations for this route. Still finding more.`,
  ],
  stoic: [
    (c) =>
      `${c.crewName} runs the route without complaint. The work is the work.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} knows the dockmaster by name now. And their kids' names.`,
  ],
  pragmatic: [
    (c) =>
      `Familiar route, predictable income. ${c.crewName} calls it smart business.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} wonders if there's something more meaningful out there. But the route pays.`,
  ],
};

// ─── Low Resources Templates ────────────────────────────────────

const LOW_RESOURCES_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  pragmatic: [
    (c) =>
      `Supplies running low. ${c.crewName} is already calculating which contracts cover resupply.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} has been checking the gauges more frequently. The numbers aren't comfortable.`,
  ],
  reckless: [
    (c) =>
      `Low reserves. ${c.crewName} says they've flown on less. That doesn't make it a good idea.`,
  ],
  idealistic: [
    (c) =>
      `Running low, but ${c.crewName} insists they'll figure it out. "We didn't come out here to turn back."`,
  ],
  stoic: [
    (c) =>
      `Reserves are thin. ${c.crewName} hasn't mentioned it. The tension is in their posture.`,
  ],
  sardonic: [
    (c) =>
      `"Plenty of vacuum out here if we run out of air," ${c.crewName} offered. Helpful as always.`,
  ],
  ambitious: [
    (c) =>
      `Low supplies. ${c.crewName} is frustrated — hard to chase bigger contracts when you can't fuel the ship.`,
  ],
  loyal: [
    (c) => `${c.crewName} quietly started rationing before anyone had to ask.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} is trying to keep spirits up despite the supply situation. Mixed results.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName} has a spreadsheet tracking consumption per hour. The projections aren't great.`,
  ],
};

// ─── Idle Docked Templates ──────────────────────────────────────

const IDLE_DOCKED_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  ambitious: [
    (c) =>
      `${c.crewName} keeps checking the contract board. Sitting still doesn't suit them.`,
  ],
  reckless: [
    (c) => `${c.crewName} is getting twitchy. Too long on the ground.`,
  ],
  stoic: [
    (c) => `${c.crewName} uses the downtime for maintenance. No complaints.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} has been exploring the station. Knows half the regulars already.`,
  ],
  cautious: [
    (c) => `Docked time means safe time. ${c.crewName} isn't in any hurry.`,
  ],
  sardonic: [
    (c) =>
      `"Another exciting day of not going anywhere," ${c.crewName} observed at breakfast.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName} has used the downtime to recalibrate every instrument on the ship. Twice.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} doesn't mind the wait. The crew is here. That's enough.`,
  ],
  pragmatic: [
    (c) =>
      `No contracts, no income. ${c.crewName} is watching the credit balance.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} spends shore leave reading about frontier settlements. Dreaming bigger.`,
  ],
};

// ─── Post-Combat Templates ──────────────────────────────────────

const POST_COMBAT_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  reckless: [
    (c) =>
      `${c.crewName} has been checking the weapons console more often since the encounter. They don't look worried — they look interested.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} has rerouted all future trips to avoid that sector. Fuel costs be damned.`,
  ],
  stoic: [(c) => `${c.crewName} filed the incident report. Moved on.`],
  sardonic: [
    (c) =>
      `"Well, that was fun," ${c.crewName} said, cleaning pirate residue off the hull sensors.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} did a headcount after the encounter. Everyone's here. Good.`,
  ],
  ambitious: [
    (c) =>
      `${c.crewName} is reviewing combat logs. Looking for patterns. Looking for an edge.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName} documented the encounter in exhaustive detail. Sixty-two pages.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} won't stop telling the story. It gets more dramatic with each retelling.`,
  ],
  pragmatic: [
    (c) =>
      `${c.crewName} calculated the cost of the encounter: damage, delays, ammo. Not profitable.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} is shaken but resolute. "This is why we need better patrols out here."`,
  ],
};

// ─── Ship Bond Templates ────────────────────────────────────────

/** Ship bond milestone commentary — personality-voiced relationship with the ship. */
const SHIP_BOND_TEMPLATES: Record<PersonalityTrait, TemplateFunc[]> = {
  stoic: [
    (c) =>
      `${c.crewName} knows every sound ${c.shipName} makes. The quiet ones worry them.`,
  ],
  reckless: [
    (c) =>
      `${c.crewName} has been pushing ${c.shipName}'s limits. They know exactly how far she'll bend.`,
  ],
  cautious: [
    (c) =>
      `${c.crewName} has memorized every system readout on ${c.shipName}. Every anomaly catalogued.`,
  ],
  meticulous: [
    (c) =>
      `${c.crewName} keeps personal maintenance notes on ${c.shipName}. The official logs aren't thorough enough.`,
  ],
  loyal: [
    (c) =>
      `${c.crewName} turned down a transfer offer. "This is my ship," they said.`,
  ],
  ambitious: [
    (c) =>
      `${c.crewName} has been studying the specs of larger ships. Not that they'd say that out loud aboard ${c.shipName}.`,
  ],
  gregarious: [
    (c) =>
      `${c.crewName} has named half the equipment on ${c.shipName}. The engine is "Gerald."`,
  ],
  sardonic: [
    (c) =>
      `"She's not pretty, but she's ours," ${c.crewName} said of ${c.shipName}. Affectionately.`,
  ],
  pragmatic: [
    (c) =>
      `${c.crewName} knows what ${c.shipName} can handle. No more, no less. That's worth something.`,
  ],
  idealistic: [
    (c) =>
      `${c.crewName} believes in ${c.shipName} the way some believe in causes. It's a little inspiring.`,
  ],
};

// ─── Template Selection ─────────────────────────────────────────

function selectTemplate(templates: TemplateFunc[], seed: string): TemplateFunc {
  const idx = hashString(seed) % templates.length;
  return templates[idx];
}

function getTemplatesForTrait(
  trait: PersonalityTrait,
  bank: Record<PersonalityTrait, TemplateFunc[]>
): TemplateFunc[] {
  return bank[trait] ?? [];
}

// ─── Trigger Evaluators ─────────────────────────────────────────

function checkInterpersonal(
  ship: Ship,
  gameData: GameData
): CommentaryEntry | null {
  if (ship.crew.length < 2) return null;

  // Pick the first pair that has non-neutral chemistry
  for (let i = 0; i < ship.crew.length - 1; i++) {
    for (let j = i + 1; j < ship.crew.length; j++) {
      const crewA = ship.crew[i];
      const crewB = ship.crew[j];
      const dynamic = getCrewDynamic(crewA, crewB);

      if (dynamic.type === 'neutral') continue;

      // Check bond level for evolved templates
      const relationship = crewA.relationships?.find(
        (r) => r.otherCrewId === crewB.id
      );
      const sharedEvents = relationship?.sharedEvents ?? 0;
      const isEvolved = sharedEvents >= EVOLVED_BOND_THRESHOLD;

      let bank: Record<PersonalityTrait, TemplateFunc[]>;
      if (dynamic.type === 'friction') {
        bank = isEvolved ? FRICTION_EVOLVED_TEMPLATES : FRICTION_TEMPLATES;
      } else {
        bank = isEvolved ? SYNERGY_EVOLVED_TEMPLATES : SYNERGY_TEMPLATES;
      }

      // Pick which crew member "speaks" based on hash
      const speakerIdx =
        hashString(crewA.id + crewB.id + gameData.gameTime) % 2;
      const speaker = speakerIdx === 0 ? crewA : crewB;
      const other = speakerIdx === 0 ? crewB : crewA;

      // Use speaker's dominant trait (trait1)
      const trait = speaker.personality?.trait1 ?? 'stoic';
      const templates = getTemplatesForTrait(trait, bank);
      if (templates.length === 0) continue;

      const label = getChemistryLabel(
        dynamic.frictionPairs[0]?.[0] ?? dynamic.synergyPairs[0]?.[0] ?? trait,
        dynamic.frictionPairs[0]?.[1] ?? dynamic.synergyPairs[0]?.[1] ?? trait
      );

      const tmpl = selectTemplate(
        templates,
        `interpersonal:${crewA.id}:${crewB.id}:${gameData.gameTime}`
      );

      return {
        gameTime: gameData.gameTime,
        crewId: speaker.id,
        crewName: speaker.name,
        shipId: ship.id,
        text: tmpl({
          crewName: speaker.name,
          otherCrewName: other.name,
          shipName: ship.name,
          trait,
          chemistryLabel: label ?? undefined,
        }),
        trigger: 'interpersonal',
      };
    }
  }

  return null;
}

function checkSoloCrew(ship: Ship, gameData: GameData): CommentaryEntry | null {
  if (ship.crew.length !== 1) return null;
  const crew = ship.crew[0];
  const trait = crew.personality?.trait1 ?? 'stoic';
  const templates = getTemplatesForTrait(trait, SOLO_CREW_TEMPLATES);
  if (templates.length === 0) return null;

  const tmpl = selectTemplate(
    templates,
    `solo:${crew.id}:${gameData.gameTime}`
  );
  return {
    gameTime: gameData.gameTime,
    crewId: crew.id,
    crewName: crew.name,
    shipId: ship.id,
    text: tmpl({
      crewName: crew.name,
      shipName: ship.name,
      trait,
    }),
    trigger: 'solo_crew',
  };
}

function checkFirstFlight(
  ship: Ship,
  gameData: GameData
): CommentaryEntry | null {
  // Only fire once: check if ship has ever flown
  if (ship.location.status !== 'in_flight') return null;
  if (ship.metrics.totalFlightTicks > TICKS_PER_DAY / 2) return null; // Not first flight

  const crew = ship.crew[0];
  if (!crew) return null;

  const trait = crew.personality?.trait1 ?? 'stoic';
  const templates = getTemplatesForTrait(trait, FIRST_FLIGHT_TEMPLATES);
  if (templates.length === 0) return null;

  const tmpl = selectTemplate(templates, `firstflight:${ship.id}`);
  return {
    gameTime: gameData.gameTime,
    crewId: crew.id,
    crewName: crew.name,
    shipId: ship.id,
    text: tmpl({
      crewName: crew.name,
      shipName: ship.name,
      trait,
    }),
    trigger: 'first_flight',
  };
}

function checkRepetition(
  ship: Ship,
  gameData: GameData
): CommentaryEntry | null {
  const contract = ship.activeContract;
  if (!contract || contract.tripsCompleted < REPETITION_TRIP_THRESHOLD)
    return null;

  const crew = ship.crew[0];
  if (!crew) return null;

  const trait = crew.personality?.trait1 ?? 'stoic';
  const templates = getTemplatesForTrait(trait, REPETITION_TEMPLATES);
  if (templates.length === 0) return null;

  const tmpl = selectTemplate(
    templates,
    `repetition:${ship.id}:${contract.quest.id}:${gameData.gameTime}`
  );
  return {
    gameTime: gameData.gameTime,
    crewId: crew.id,
    crewName: crew.name,
    shipId: ship.id,
    text: tmpl({
      crewName: crew.name,
      shipName: ship.name,
      trait,
    }),
    trigger: 'repetition',
  };
}

function checkPostCombat(
  ship: Ship,
  gameData: GameData
): CommentaryEntry | null {
  // Fire if ship had an encounter recently (within last game day)
  if (!ship.lastEncounterTime) return null;
  const ticksSinceEncounter =
    (gameData.gameTime - ship.lastEncounterTime) / GAME_SECONDS_PER_TICK;
  if (ticksSinceEncounter > TICKS_PER_DAY || ticksSinceEncounter < 1)
    return null;

  const crew = ship.crew[0];
  if (!crew) return null;

  const trait = crew.personality?.trait1 ?? 'stoic';
  const templates = getTemplatesForTrait(trait, POST_COMBAT_TEMPLATES);
  if (templates.length === 0) return null;

  const tmpl = selectTemplate(
    templates,
    `postcombat:${ship.id}:${ship.lastEncounterTime}`
  );
  return {
    gameTime: gameData.gameTime,
    crewId: crew.id,
    crewName: crew.name,
    shipId: ship.id,
    text: tmpl({
      crewName: crew.name,
      shipName: ship.name,
      trait,
    }),
    trigger: 'post_combat',
  };
}

function checkLowResources(
  ship: Ship,
  gameData: GameData
): CommentaryEntry | null {
  if (ship.crew.length === 0) return null;

  const fuelPct =
    ship.maxFuelKg > 0 ? (ship.fuelKg / ship.maxFuelKg) * 100 : 100;
  const provisionsDays = getProvisionsSurvivalDays(ship);

  if (fuelPct >= LOW_FUEL_PCT && provisionsDays >= LOW_PROVISIONS_DAYS)
    return null;

  const crew = ship.crew[0];
  const trait = crew.personality?.trait1 ?? 'stoic';
  const templates = getTemplatesForTrait(trait, LOW_RESOURCES_TEMPLATES);
  if (templates.length === 0) return null;

  const tmpl = selectTemplate(
    templates,
    `lowres:${ship.id}:${gameData.gameTime}`
  );
  return {
    gameTime: gameData.gameTime,
    crewId: crew.id,
    crewName: crew.name,
    shipId: ship.id,
    text: tmpl({
      crewName: crew.name,
      shipName: ship.name,
      trait,
    }),
    trigger: 'low_resources',
  };
}

/** Ship bond milestones: 7 days, 30 days, 90 days aboard. */
const BOND_MILESTONES = [
  TICKS_PER_DAY * 7,
  TICKS_PER_DAY * 30,
  TICKS_PER_DAY * 90,
];

function checkShipBond(ship: Ship, gameData: GameData): CommentaryEntry | null {
  // Find crew member who just crossed a bond milestone
  for (const crew of ship.crew) {
    const affinity = crew.shipAffinity ?? 0;
    for (const milestone of BOND_MILESTONES) {
      // Check if crew crossed this milestone within the last commentary interval
      if (affinity >= milestone && affinity < milestone + COMMENTARY_INTERVAL) {
        const trait = crew.personality?.trait1 ?? 'stoic';
        const templates = getTemplatesForTrait(trait, SHIP_BOND_TEMPLATES);
        if (templates.length === 0) continue;

        const tmpl = selectTemplate(templates, `bond:${crew.id}:${milestone}`);
        return {
          gameTime: gameData.gameTime,
          crewId: crew.id,
          crewName: crew.name,
          shipId: ship.id,
          text: tmpl({
            crewName: crew.name,
            shipName: ship.name,
            trait,
          }),
          trigger: 'ship_bond',
        };
      }
    }
  }
  return null;
}

function checkIdleDocked(
  ship: Ship,
  gameData: GameData
): CommentaryEntry | null {
  if (ship.location.status !== 'docked') return null;
  if (ship.activeContract || ship.miningRoute) return null;

  // Check if docked for long enough
  if (ship.metrics.totalIdleTicks < IDLE_DOCKED_THRESHOLD) return null;

  const crew = ship.crew[0];
  if (!crew) return null;

  const trait = crew.personality?.trait1 ?? 'stoic';
  const templates = getTemplatesForTrait(trait, IDLE_DOCKED_TEMPLATES);
  if (templates.length === 0) return null;

  const tmpl = selectTemplate(
    templates,
    `idle:${ship.id}:${gameData.gameTime}`
  );
  return {
    gameTime: gameData.gameTime,
    crewId: crew.id,
    crewName: crew.name,
    shipId: ship.id,
    text: tmpl({
      crewName: crew.name,
      shipName: ship.name,
      trait,
    }),
    trigger: 'idle_docked',
  };
}

// ─── Trigger Priority & Orchestration ───────────────────────────

type TriggerEvaluator = (
  ship: Ship,
  gameData: GameData
) => CommentaryEntry | null;

/** Triggers evaluated in priority order (highest first). */
const TRIGGER_PIPELINE: TriggerEvaluator[] = [
  checkFirstFlight,
  checkInterpersonal,
  checkPostCombat,
  checkLowResources,
  checkRepetition,
  checkSoloCrew,
  checkShipBond,
  checkIdleDocked,
];

/**
 * Check if enough time has passed since last commentary.
 */
export function shouldRunCommentary(gameData: GameData): boolean {
  const stories = gameData.stories;
  if (!stories) return false;
  const lastTime = stories.lastCommentaryGameTime ?? 0;
  const ticksSinceLast = (gameData.gameTime - lastTime) / GAME_SECONDS_PER_TICK;
  return ticksSinceLast >= COMMENTARY_INTERVAL;
}

/**
 * Check if a trigger is on cooldown for a specific ship.
 */
function isTriggerOnCooldown(
  gameData: GameData,
  shipId: string,
  trigger: CommentaryTrigger
): boolean {
  const last = gameData.stories?.lastTriggerByShip?.[shipId];
  if (!last || last.trigger !== trigger) return false;
  const ticksSince =
    (gameData.gameTime - last.gameTime) / GAME_SECONDS_PER_TICK;
  return ticksSince < TRIGGER_COOLDOWN;
}

/**
 * Evaluate all ships for commentary opportunities.
 * Returns at most one entry per call (the highest-priority match).
 */
export function checkCommentary(gameData: GameData): CommentaryEntry | null {
  for (const ship of gameData.ships) {
    if (ship.crew.length === 0) continue;

    for (const evaluator of TRIGGER_PIPELINE) {
      const entry = evaluator(ship, gameData);
      if (!entry) continue;

      // Check per-ship trigger cooldown
      if (isTriggerOnCooldown(gameData, ship.id, entry.trigger)) continue;

      return entry;
    }
  }
  return null;
}

/**
 * Add a commentary entry to the story state and update tracking.
 */
export function addCommentaryEntry(
  gameData: GameData,
  entry: CommentaryEntry
): void {
  if (!gameData.stories) return;

  if (!gameData.stories.commentary) {
    gameData.stories.commentary = [];
  }
  gameData.stories.commentary.push(entry);

  // Cap entries
  while (gameData.stories.commentary.length > MAX_COMMENTARY) {
    gameData.stories.commentary.shift();
  }

  // Update tracking
  gameData.stories.lastCommentaryGameTime = gameData.gameTime;

  if (!gameData.stories.lastTriggerByShip) {
    gameData.stories.lastTriggerByShip = {};
  }
  gameData.stories.lastTriggerByShip[entry.shipId] = {
    trigger: entry.trigger,
    gameTime: gameData.gameTime,
  };
}
