# Emergent Storytelling System

System design for Fleet Chronicles — an emergent narrative layer that detects meaningful patterns in gameplay events and surfaces them as shareable crew stories.

Source files: `chronicleSystem.ts`, `personalitySystem.ts`, `arcDetector.ts`, `arcPatterns.ts`, `narrativeGenerator.ts`, `ui/storiesTab.ts`.

---

## Overview

The emergent storytelling system transforms raw gameplay events into human-readable narratives about crew members, ships, and fleet history. Players do not author stories — they emerge from the simulation.

### Four-Layer Architecture

```
Events  →  Chronicle  →  Arc Detector  →  UI / Share
(event      (filtered     (pattern          (story cards,
 bus)        per-actor     matching on       text export)
             history)      chronicles)
```

1. **Events**: The typed event bus (`gameEvents.ts`). Game systems emit events (combat outcomes, crew deaths, contract completions, gravity assists, etc.) via `emit()`. The storytelling system subscribes to these events without modifying the event pipeline.

2. **Chronicle**: A persistent, per-actor (crew member or ship) record of notable events stored directly on each actor (`crew.chronicle[]`, `ship.chronicle[]`). Not every event becomes a chronicle entry — only "chronicle-worthy" events that carry narrative weight. Chronicles are the curated memory of an actor's career.

3. **Arc Detector**: A pattern-matching engine that scans chronicles for recognizable story shapes (survivor arcs, rags-to-riches progressions, legendary partnerships). Runs periodically and after catch-up to detect new arcs.

4. **UI / Share**: Story cards displayed in a dedicated Stories tab, with options to copy as formatted text for sharing outside the game.

---

## Chronicle System

File: `src/chronicleSystem.ts`

### Purpose

The event log is a firehose — 200 entries, pruned on a rolling basis, with no per-actor indexing. Chronicles extract and preserve the subset of events that matter for storytelling, indexed by actor (crew member or ship).

### Integration via Event Bus

The chronicle system subscribes to typed events via `on()` from `gameEvents.ts`. Each handler receives the narrowed event type directly (e.g., `CrewDeathEvent`), eliminating redundant type guards.

Registered handlers:

| Event Type             | Handler                 | Chronicle Types Created                                                                  |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `crew_hired`           | handleCrewHired         | `hired` (crew)                                                                           |
| `crew_death`           | handleCrewDeath         | `death` (crew + ship), `comrade_lost` (bonded crew)                                      |
| `crew_departed`        | handleCrewDeparted      | `crew_departed` (crew)                                                                   |
| `crew_near_death`      | handleNearDeath         | `near_death` (crew)                                                                      |
| `crew_skill_milestone` | handleSkillMilestone    | `skill_milestone` (crew)                                                                 |
| `crew_role_change`     | handleRoleChange        | `role_change` (crew)                                                                     |
| `encounter_resolved`   | handleEncounterResolved | `combat_victory`, `boarding_survived`, `close_call`, or `negotiation_save` (crew + ship) |
| `ship_stranded`        | handleShipStranded      | `stranded` (crew + ship)                                                                 |
| `ship_rescued`         | handleShipRescued       | `rescue_participant` (crew + ship)                                                       |
| `contract_completed`   | handleContractCompleted | `contract_milestone` (crew + ship)                                                       |
| `first_visit`          | handleFirstVisit        | `first_visit` (crew + ship)                                                              |
| `gravity_assist`       | handleGravityAssist     | `gravity_assist_master` (crew, successes only)                                           |

Events that are NOT chronicle-worthy: routine departures, mid-flight updates, salary deductions, fuel purchases, quest acceptance, evasions, harassment (too common).

### Chronicle Entry Structure

```typescript
interface ChronicleEntry {
  gameTime: number; // when it happened
  type: ChronicleEventType; // enriched event category (19 types)
  actorId: string; // crew or ship ID
  actorType: 'crew' | 'ship'; // which kind of actor
  shipId: string; // ship context
  shipName: string; // ship display name
  locationId?: string; // where (if applicable)
  details: Record<string, string | number | boolean>; // rich event metadata
  emotionalWeight: number; // -3 to +3 scale
  tags: string[]; // searchable categories for arc matching
}
```

Chronicle entries are distinct from `LogEntry` — they use `ChronicleEventType` (not `LogEntryType`), carry actor-specific metadata in `details`, and use a -3 to +3 emotional weight scale rather than being simple text messages.

### Emotional Weight Scale

| Weight | Events                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------ |
| -3     | `death`, `stranded`                                                                                    |
| -2     | `boarding_survived`, `comrade_lost`                                                                    |
| -1     | `close_call`                                                                                           |
| 0      | `hired`, `first_visit`, `role_change`                                                                  |
| +1     | `contract_milestone` (scales with trips: `Math.min(3, 1 + floor(trips/3))`)                            |
| +2     | `combat_victory`, `rescue_participant`, `skill_milestone`, `gravity_assist_master`, `negotiation_save` |
| +3     | `near_death` (survived against the odds)                                                               |

### Chronicle Caps and Pruning

Each actor (crew member or ship) maintains a chronicle of at most **50 entries** (`MAX_CHRONICLE_ENTRIES`). When a new entry would exceed the cap:

1. Sort entries by `abs(emotionalWeight)` ascending.
2. Remove the lowest-weight entries to bring the count to the cap.

This ensures that high-drama events (deaths, near-deaths, rescues) are preserved while routine milestones are gradually forgotten.

### Chronicle Storage

Chronicles are stored directly on each actor:

- `CrewMember.chronicle?: ChronicleEntry[]`
- `Ship.chronicle?: ChronicleEntry[]`

Both fields are optional — new/existing actors without chronicles simply have `undefined`. No save migration needed.

### Dead Crew Archive

When a crew member dies, they are spliced from `ship.crew`, orphaning their chronicle. The system preserves dead crew data in `gameData.stories.deadCrewArchive` so arc detection can still evaluate them.

```typescript
interface DeadCrewArchive {
  id: string;
  name: string;
  role: CrewRole;
  skills: CrewSkills;
  personality?: CrewPersonality;
  relationships?: CrewRelationship[];
  chronicle: ChronicleEntry[];
  diedAt: number;
  shipId: string;
  shipName: string;
}
```

Archive cap: **20 entries** (`MAX_DEAD_CREW_ARCHIVE`). Oldest entries pruned first.

---

## Personality System

File: `src/personalitySystem.ts`

### Overview

Every crew member has exactly **2 personality traits** that color their story narration and provide small mechanical bonuses. Traits are generated deterministically from the crew member's ID hash at creation time and never change.

### The 10 Traits

| Trait        | Description                               | Narrative Flavor                             |
| ------------ | ----------------------------------------- | -------------------------------------------- |
| `stoic`      | Endures hardship without complaint        | Understated reactions, dry observations      |
| `reckless`   | Seeks danger, acts before thinking        | Bold declarations, impatience with caution   |
| `cautious`   | Plans carefully, avoids unnecessary risk  | Measured assessments, risk calculations      |
| `gregarious` | Social, builds relationships easily       | References to crewmates, shared moments      |
| `meticulous` | Obsessed with detail and precision        | Technical observations, by-the-book language |
| `pragmatic`  | Focused on results over principles        | Cost-benefit framing, practical concerns     |
| `idealistic` | Driven by principle and vision            | References to duty, the bigger picture       |
| `sardonic`   | Dry wit, sees absurdity everywhere        | Wry commentary, dark humor                   |
| `loyal`      | Bonds deeply, protects their own          | References to crew bonds, sacrifice          |
| `ambitious`  | Drives toward advancement and recognition | Goal-oriented language, competitive framing  |

### Deterministic Generation

Traits are derived from the crew member's `id` string using `hashString()` (DJB2 variant from `utils.ts`):

```typescript
function generatePersonality(crewId: string): CrewPersonality {
  const hash = hashString(crewId);
  const trait1 = ALL_TRAITS[hash % ALL_TRAITS.length];
  // Second trait is always different from first
  const remaining = ALL_TRAITS.filter((t) => t !== trait1);
  const trait2 =
    remaining[Math.floor(hash / ALL_TRAITS.length) % remaining.length];
  return { trait1, trait2 };
}
```

This ensures the same crew member always gets the same traits, no RNG state needed.

### Mechanical Effects

Each trait applies a small modifier to specific gameplay stat channels. With 2 traits per crew member, effects stack additively. The authoritative table is the `TRAIT_EFFECTS` map in `personalitySystem.ts`.

| Trait        | Positive Effect           | Negative Effect                                 |
| ------------ | ------------------------- | ----------------------------------------------- |
| `stoic`      | +10% morale recovery\*    | -5% training speed                              |
| `reckless`   | +10% combat attack        | +5% encounter rate (attracts trouble)           |
| `cautious`   | +5% evasion               | -5% mining yield                                |
| `gregarious` | +10% negotiation          | —                                               |
| `meticulous` | +10% repair speed         | -5% combat attack                               |
| `pragmatic`  | +5% trade income          | —                                               |
| `idealistic` | +10% morale recovery\*    | -10% departure resistance (leaves on principle) |
| `sardonic`   | +5% morale recovery\*     | -5% negotiation                                 |
| `loyal`      | +25% departure resistance | -5% trade income                                |
| `ambitious`  | +10% training speed       | +10% salary expectation                         |

\* Morale recovery is reserved for a future morale system. Currently has no mechanical effect.

### Modifier Application

```typescript
getTraitModifier(crew: CrewMember, effect: TraitEffect): number
// Returns: 1.0 + trait1Mod + trait2Mod
// Example: reckless+ambitious crew, 'combat_attack' → 1.10 (+10%)
```

### Wired Effect Channels

| Channel                | Applied In            | Mechanic                                                       |
| ---------------------- | --------------------- | -------------------------------------------------------------- |
| `training_speed`       | `skillProgression.ts` | Multiplier on passive skill training rate                      |
| `combat_attack`        | `combatSystem.ts`     | Multiplier on crew combat attack value                         |
| `evasion`              | `combatSystem.ts`     | Multiplier on evasion contribution                             |
| `repair_speed`         | `gameTick.ts`         | Multiplier on repair points per tick                           |
| `negotiation`          | `encounterSystem.ts`  | Multiplier on negotiation success check                        |
| `mining_yield`         | `miningSystem.ts`     | Multiplier on mining extraction rate                           |
| `trade_income`         | `contractExec.ts`     | Best crew modifier on ship trade payments                      |
| `encounter_rate`       | `encounterSystem.ts`  | Multiplier on encounter detection rate                         |
| `departure_resistance` | `contractExec.ts`     | Multiplier on unpaid departure grace period (3 game days base) |
| `salary_expectation`   | `crewRoles.ts`        | Multiplier on crew salary calculation                          |

### Personality Visibility

Personality traits are displayed in the **Crew tab** detail panel as badge elements between the service record and stats sections. Each badge shows the trait name with a tooltip description. Arc modifier bonuses (from story arcs) are shown alongside when applicable.

---

## Arc Detection

File: `src/arcDetector.ts`, `src/arcPatterns.ts`

### Execution Schedule

The arc detector runs:

1. **Every 480 ticks** (`ARC_SCAN_INTERVAL`, ~1 game day / ~8 real minutes) during normal play.
2. **After catch-up processing** completes, to detect arcs formed during offline time.

Detection is not run every tick for performance — story arcs develop over days, not seconds.

### Pattern Interface

```typescript
interface ArcPattern {
  arcType: ArcType;
  actorType: 'crew' | 'ship' | 'both';
  detect: (
    entries: ChronicleEntry[],
    actor: CrewMember | Ship,
    gameData: GameData
  ) => ArcMatch | null;
}

interface ArcMatch {
  entries: ChronicleEntry[];
  emotionalArc: number[];
  metadata: Record<string, string | number>;
  title: string;
  rating: number; // 1-5
}
```

Patterns return `null` when conditions aren't met, or an `ArcMatch` with a 1-5 integer rating when they detect a story. There is no continuous 0-1 score — patterns use discrete thresholds derived from game systems.

### The 12 Arc Patterns

#### Crew Patterns

| Pattern           | Title(s)                                    | Detection                                                      | Rating                               |
| ----------------- | ------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| `survivor`        | Survivor / Nine Lives / The Unkillable      | 2+ `near_death`, not dead                                      | `min(5, count+1)`                    |
| `rags_to_riches`  | "From Nothing to {rank}"                    | `hired` with low skills → `skill_milestone` at named rank      | From rank index via `rankToRating()` |
| `old_reliable`    | Old Reliable                                | `hired` + 5+ combined combat/skill events, alive               | `min(5, floor(exp/3)+1)`             |
| `legend_pilot`    | Navigator Legend                            | 5+ `gravity_assist_master`                                     | `min(5, floor(assists/3)+1)`         |
| `rescue_hero`     | Rescue Hero / Fleet Savior / Guardian Angel | 2+ `rescue_participant`                                        | `min(5, rescues+1)`                  |
| `battle_brothers` | Brothers in Arms                            | `battle_brother` bond with 3+ shared events, 2+ combat entries | `min(5, floor(bond/20)+1)`           |
| `mentor_protege`  | "Apprentice of {name}"                      | `mentor` bond + 2+ `skill_milestone`                           | `min(5, floor(milestones/2)+1)`      |

#### Ship Patterns

| Pattern            | Title(s)                              | Detection                                             | Rating                             |
| ------------------ | ------------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `cursed_ship`      | Star-Crossed / Ill-Fated / The Damned | 3+ bad events (boarding, close call, death, stranded) | `min(5, floor(count/2)+1)`         |
| `lucky_ship`       | Fortune's Favorite / The Blessed      | 4+ good events (victory, rescue, contract)            | `min(5, floor(count/2))`           |
| `from_ashes`       | From the Ashes                        | Death(s) followed by 2+ recovery events               | `min(5, deaths+recovery)`          |
| `frontier_pioneer` | "Pioneer of {location}"               | `first_visit` at 50M+ km from Earth                   | 2 (Mars), 3 (Belt), 4 (Jupiter+)   |
| `iron_crew`        | Iron Crew                             | Death(s) followed by 3+ post-loss activities          | `min(5, floor(deaths+activity/2))` |

#### Threshold Derivations

Thresholds trace back to game systems rather than arbitrary constants:

- **`LOW_SKILL_THRESHOLD`** = `SKILL_RANKS[1].minLevel × 4` — the Green rank boundary across 4 skills
- **`rankToRating()`** = `ceil(rankIndex / 2)`, null below Competent (index 4)
- **Frontier distances** from solar system geography: Mars (50M km), Asteroid Belt (250M km), Jupiter (550M km)
- **Bond thresholds**: 30 for battle_brother, 50 for mentor — from relationship system's tier boundaries
- **Mentor skill gap**: derived from `SKILL_RANKS[5].minLevel - SKILL_RANKS[4].minLevel`

### Deduplication

An arc is identified by the key `{arcType}:{actorId}`. If this key already exists in detected or dismissed arcs, the pattern is skipped. Arcs are not re-evaluated once detected.

### Dead Crew Scanning

The arc detector scans three sources:

1. Living crew on all ships (`ship.crew`)
2. Ship chronicles (`ship.chronicle`)
3. Dead crew archives (`gameData.stories.deadCrewArchive`)

This ensures arcs can still be detected for crew who died before their story was recognized.

### Arc Effects (Gameplay Bonuses)

Active arcs provide small gameplay bonuses via `getArcModifier()`:

| Arc Type          | Effect Channel  | Bonus per Rating Star |
| ----------------- | --------------- | --------------------- |
| `survivor`        | health_recovery | +1%                   |
| `rags_to_riches`  | training_speed  | +1%                   |
| `old_reliable`    | training_speed  | +1%                   |
| `legend_pilot`    | fuel_efficiency | +1%                   |
| `battle_brothers` | combat_attack   | +1%                   |
| `mentor_protege`  | training_speed  | +1%                   |
| `lucky_ship`      | evasion         | +1%                   |
| `from_ashes`      | training_speed  | +1%                   |
| `iron_crew`       | combat_attack   | +1%                   |

A 4-star `rags_to_riches` arc grants +4% training speed. Multiple arcs with the same effect stack additively.

### Storage Caps

- Maximum active arcs: **30** (`MAX_ARCS`). Pruned by rating (lowest first).
- Maximum dismissed arc keys: **100** (`MAX_DISMISSED_IDS`). Pruned FIFO.

---

## Narrative Generation

File: `src/narrativeGenerator.ts`

### Template-Based Synthesis

Each arc type has **3-5 narrative template variants** — short paragraph structures with placeholder slots filled from chronicle data. Templates are selected deterministically using `hashString(arc.id) % templates.length`, ensuring the same arc always generates the same narrative.

Templates are function-based:

```typescript
const SURVIVOR_TEMPLATES = [
  (ctx: NarrativeContext) =>
    `${ctx.actorName} has cheated death ${ctx.metadata.survivalCount} times aboard ${ctx.shipName}. ...`,
  // ... more variants
];
```

### Personality-Colored Flavor Text

Each trait has optional flavor sentences for specific arc types, appended to the base narrative. Examples:

- **Stoic** survivor: "Through it all, they never flinched."
- **Reckless** survivor: "Some say they go looking for trouble. They might be right."
- **Sardonic** cursed ship: '"Another day, another catastrophe," they say with a grin.'
- **Ambitious** rags-to-riches: "They always knew they were destined for more."

The narrative structure is identical for the same arc — only the flavor text changes based on personality.

### Share Text Format

```
═══════════════════════════════════
STARSHIP COMMANDER — The Unkillable
★★★★★
═══════════════════════════════════

Marcus Chen has cheated death four times aboard The Endeavour...

#StarshipCommander
```

All narrative text is hand-authored in templates. No runtime LLM or procedural text generation. This keeps the system deterministic and save-compatible.

---

## Relationship Layer

### Bond Formation

Relationships between crew members form automatically based on shared chronicle-worthy events. Bonds are tracked per crew member in `crew.relationships[]`.

```typescript
interface CrewRelationship {
  otherCrewId: string;
  otherCrewName: string;
  bond: number; // 0-100
  bondType: 'shipmate' | 'battle_brother' | 'mentor';
  sharedEvents: number;
}
```

### Bond Growth

When two crew are on the same ship during a chronicle-worthy event, both gain bond points:

- **Combat events** (COMBAT_EVENT_TYPES): `max(BASE_BOND_GAIN, abs(emotionalWeight) × 3)`
- **Non-combat events**: `BASE_BOND_GAIN = 5`
- Bond capped at 100

### Bond Type Thresholds

| Bond Level       | Threshold | Additional Condition                                      |
| ---------------- | --------- | --------------------------------------------------------- |
| `shipmate`       | bond < 30 | —                                                         |
| `battle_brother` | bond ≥ 30 | —                                                         |
| `mentor`         | bond ≥ 50 | Skill gap > `MENTOR_SKILL_GAP` (derived from SKILL_RANKS) |

### Comrade Lost

When a crew member dies, all crew members with a bond strength of 10+ to the deceased gain a `comrade_lost` chronicle entry (emotional weight -2). This entry references the deceased by name and captures the bond type and strength.

---

## Story Lifecycle

### States

```
Detected  →  Active  →  Dismissed
```

- **Active**: Visible in the Stories tab. The player can read, share, or dismiss.
- **Dismissed**: Hidden. The arc key is stored in `dismissedArcIds` to prevent re-detection.

### Story Rating

Each story has an integer rating from **1 to 5**, derived directly from the arc pattern's analysis of chronicle data:

- Higher event counts → higher ratings (e.g., 4 near-deaths = 5-star survivor)
- Higher skill ranks → higher ratings (e.g., Master rank = 4+ star rags-to-riches)
- Greater distances → higher ratings (Jupiter pioneer = 4-star)

Rating determines display sort order (highest first) and pruning priority (lowest pruned first when exceeding MAX_ARCS).

---

## Data Model

### Types

```typescript
// Personality
type PersonalityTrait =
  | 'stoic'
  | 'reckless'
  | 'cautious'
  | 'gregarious'
  | 'meticulous'
  | 'pragmatic'
  | 'idealistic'
  | 'sardonic'
  | 'loyal'
  | 'ambitious';

interface CrewPersonality {
  trait1: PersonalityTrait;
  trait2: PersonalityTrait;
}

// Chronicle (19 event types)
type ChronicleEventType =
  | 'hired'
  | 'death'
  | 'near_death'
  | 'skill_milestone'
  | 'role_change'
  | 'combat_victory'
  | 'negotiation_save'
  | 'rescue_participant'
  | 'stranded'
  | 'gravity_assist_master'
  | 'contract_milestone'
  | 'crew_departed'
  | 'boarding_survived'
  | 'close_call'
  | 'first_visit'
  | 'mining_bonanza'
  | 'ship_maiden_voyage'
  | 'relationship_formed'
  | 'comrade_lost';

// Arc Detection (12 arc types)
type ArcType =
  | 'rags_to_riches'
  | 'survivor'
  | 'iron_crew'
  | 'legend_pilot'
  | 'rescue_hero'
  | 'old_reliable'
  | 'cursed_ship'
  | 'lucky_ship'
  | 'from_ashes'
  | 'frontier_pioneer'
  | 'battle_brothers'
  | 'mentor_protege';

// Story state stored in GameData
interface StoryState {
  detectedArcs: StoryArc[];
  dismissedArcIds: string[]; // format: "arcType:actorId"
  lastScanGameTime: number;
  deadCrewArchive?: DeadCrewArchive[];
}
```

### Extensions to Existing Types

All new fields are optional — no save migration needed:

- `CrewMember`: `personality?: CrewPersonality`, `chronicle?: ChronicleEntry[]`, `relationships?: CrewRelationship[]`
- `Ship`: `chronicle?: ChronicleEntry[]`
- `GameData`: `stories?: StoryState`

### Save Data Sizing

| Component         | Count                   | Avg Size         | Total       |
| ----------------- | ----------------------- | ---------------- | ----------- |
| Chronicles        | ~25 actors × 50 entries | ~200 bytes/entry | ~250 KB     |
| Dead crew archive | ~20 entries             | ~10 KB each      | ~200 KB     |
| Story arcs        | 30 active               | ~1 KB each       | ~30 KB      |
| Dismissed IDs     | 100 keys                | ~30 bytes each   | ~3 KB       |
| **Total**         |                         |                  | **~483 KB** |

Fits comfortably within localStorage limits (~5 MB). Personality traits add zero save bytes — computed from crew IDs.

---

## Integration Points

### Existing Systems Modified

| System         | File                          | Change                                                                 |
| -------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Event Bus      | `src/gameEvents.ts`           | Event type definitions (no game-system imports)                        |
| Game Tick      | `src/gameTick.ts`             | Near-death detection, periodic arc scan trigger, repair trait modifier |
| Catch-Up       | `src/catchUpReportBuilder.ts` | Trigger arc detection after catch-up, add new stories to report        |
| Combat         | `src/combatSystem.ts`         | Apply combat_attack and evasion trait modifiers                        |
| Encounters     | `src/encounterSystem.ts`      | Apply encounter_rate and negotiation trait modifiers                   |
| Skill Training | `src/skillProgression.ts`     | Apply training_speed trait modifier                                    |
| Mining         | `src/miningSystem.ts`         | Apply mining_yield trait modifier                                      |
| Contracts      | `src/contractExec.ts`         | Apply trade_income trait modifier, departure_resistance grace period   |
| Crew Roles     | `src/crewRoles.ts`            | Apply salary_expectation trait modifier, `getTotalCrewSkills()`        |
| Crew Death     | `src/crewDeath.ts`            | Emit `crew_death` event before crew removal                            |
| Models         | `src/models/index.ts`         | New types, optional field extensions, `COMBAT_EVENT_TYPES` constant    |
| Renderer       | `src/ui/renderer.ts`          | Wire up Stories tab callbacks                                          |
| Crew Tab       | `src/ui/crewTab.ts`           | Display personality trait badges and arc modifier indicators           |
| Catch-Up UI    | `src/ui/catchUpReport.ts`     | "New Stories" section in catch-up modal                                |
| Gamepedia      | `src/gamepediaData.ts`        | Fleet Chronicles article                                               |
| Utils          | `src/utils.ts`                | Shared `hashString()` function (DJB2 variant)                          |

### New Files

| File                        | Purpose                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `src/chronicleSystem.ts`    | Chronicle event handling, entry creation, pruning, relationship tracking, dead crew archival |
| `src/personalitySystem.ts`  | Trait generation from ID hash, effect lookup, modifier application                           |
| `src/arcDetector.ts`        | Arc detection orchestration, effect bonuses, dismissal, storage management                   |
| `src/arcPatterns.ts`        | 12 individual arc pattern implementations                                                    |
| `src/narrativeGenerator.ts` | Template-based story text synthesis with personality flavoring                               |
| `src/ui/storiesTab.ts`      | Stories tab component (mount-once/update-on-tick pattern)                                    |

---

## UI: Stories Tab

File: `src/ui/storiesTab.ts`

### Structure

The Stories tab follows the mount-once/update-on-tick component pattern with three sections:

1. **Active Stories** (top): Cards sorted by rating (highest first). The highest-rated card auto-expands its narrative on creation. Each card shows title, star rating, actor name, collapsible narrative text, and action buttons (Read/Collapse, Share, Dismiss).

2. **Crew Chronicles** (middle): Per-crew summary — name, personality trait badges (with tooltip descriptions), and event stats (total events, near-deaths, combat, milestones).

3. **Ship Histories** (bottom): Per-ship milestone summary — name and event stats (total events, crew lost, combat, rescues).

### Reconciliation

Each section uses a `Map<id, refs>` to track mounted DOM elements. On each update:

- New items are appended
- Removed items are deleted from the DOM
- Existing items are patched in-place (textContent updates, not DOM rebuilds)
- Shallow hash comparison (`id:chronicle.length:name`) prevents unnecessary patches

### Tab Notification

A badge on the "Stories" tab header signals when new arcs are detected (similar to the log unread count pattern).

---

## Design Decisions

1. **Observation, not intervention**: The storytelling system observes and narrates; it never changes gameplay outcomes. A "cursed ship" arc does not make the ship more likely to be attacked — it just recognizes the pattern. Arc bonuses are small (1-5%) and trace back to simulated events.

2. **Deterministic personality**: Traits are derived from ID hashes, not stored. This means personality survives save corruption, costs zero storage, and is always consistent.

3. **Template-based narration**: Hand-authored templates instead of procedural generation. Expressiveness comes from combining templates with personality-colored flavor text, not from generating novel sentences.

4. **Event bus over log hooks**: The chronicle system subscribes to typed events via the event bus, not via hooks on `addLog()`. This provides type safety (narrowed event types per handler), decoupling, and cleaner integration with the game event architecture.

5. **Per-actor storage**: Chronicles live on each actor (`crew.chronicle[]`, `ship.chronicle[]`) rather than in a global `GameData.chronicles` map. This keeps data locality natural and simplifies serialization.

6. **Dead crew preservation**: When crew die, their chronicle and key metadata are archived in `StoryState.deadCrewArchive` so arc detection can still recognize their stories. This prevents narratively interesting deaths from being lost.

7. **Thresholds from game systems**: All detection thresholds derive from existing game systems (skill ranks, orbital distances, relationship tiers) rather than arbitrary magic numbers. This keeps the storytelling system grounded in the simulation.
