# Emergent Storytelling System

System design for Fleet Chronicles — an emergent narrative layer that detects meaningful patterns in gameplay events and surfaces them as shareable crew stories.

Source files (planned): `chronicleSystem.ts`, `personalitySystem.ts`, `arcDetector.ts`, `narrativeGenerator.ts`, `relationshipSystem.ts`, `storySystem.ts`, `ui/storiesTab.ts`, `ui/storyCard.ts`, `ui/storyShareModal.ts`.

---

## Overview

The emergent storytelling system transforms raw gameplay logs into human-readable narratives about crew members, ships, and fleet history. Players do not author stories — they emerge from the simulation.

### Four-Layer Architecture

```
Events  →  Chronicle  →  Arc Detector  →  UI / Share
(logs)     (filtered     (pattern          (story cards,
            per-actor     matching on       text export,
            history)      chronicles)       PNG export)
```

1. **Events**: The existing `LogEntry` stream from `logSystem.ts`. Every gameplay action (departures, arrivals, combat outcomes, crew deaths, contract completions, mining hauls, skill rank-ups) already produces log entries. The storytelling system consumes these without modifying the log pipeline.

2. **Chronicle**: A persistent, per-actor (crew member or ship) record of notable events. Not every log entry becomes a chronicle entry — only "chronicle-worthy" events that carry narrative weight. Chronicles are the curated memory of an actor's career.

3. **Arc Detector**: A pattern-matching engine that scans chronicles for recognizable story shapes (survivor arcs, rags-to-riches progressions, legendary partnerships). Runs periodically and after catch-up to detect new arcs.

4. **UI / Share**: Story cards displayed in a dedicated Stories tab, with options to copy as formatted text or export as a styled PNG image for sharing outside the game.

---

## Chronicle System

### Purpose

The event log is a firehose — 200 entries, pruned on a rolling basis, with no per-actor indexing. Chronicles extract and preserve the subset of events that matter for storytelling, indexed by actor (crew ID or ship ID).

### Chronicle-Worthy Events

An event is chronicle-worthy if it represents a turning point, milestone, or dramatic moment. The following `LogEntryType` values qualify:

| Event Type             | Why It Matters Narratively                       |
| ---------------------- | ------------------------------------------------ |
| `encounter_evade`      | Narrow escape — tension and relief               |
| `encounter_negotiate`  | Talking your way out — character moment          |
| `encounter_victory`    | Triumph against threat                           |
| `encounter_harassment` | Took a hit but survived                          |
| `encounter_boarding`   | Major loss event, high drama                     |
| `encounter_fled`       | Desperation, survival instinct                   |
| `crew_death`           | Permanent loss — the most dramatic event         |
| `rescue`               | Heroism, fleet solidarity                        |
| `stranded`             | Crisis, vulnerability                            |
| `fuel_depleted`        | Emergency, desperation                           |
| `rank_up`              | Milestone progression                            |
| `contract_complete`    | Achievement, routine mastery                     |
| `arrival`              | First arrival at a new destination — exploration |
| `mining_sale`          | Large haul payoffs (filtered by value threshold) |

Events that are NOT chronicle-worthy: routine departures, mid-flight updates, salary deductions, fuel purchases, quest acceptance (only completion matters), and minor status changes.

### Chronicle Entry Structure

```typescript
interface ChronicleEntry {
  gameTime: number; // when it happened
  type: LogEntryType; // event category
  message: string; // human-readable description
  shipName: string; // which ship
  locationId?: string; // where (if applicable)
  emotionalWeight: number; // 1-10 scale, used for pruning
  involvedActors: string[]; // crew IDs and/or ship IDs involved
}
```

### Emotional Weight Scale

Each chronicle-worthy event type has a base emotional weight:

| Weight | Events                                                   |
| ------ | -------------------------------------------------------- |
| 10     | `crew_death`                                             |
| 9      | `encounter_boarding`, `stranded`                         |
| 8      | `rescue`, `fuel_depleted`                                |
| 7      | `encounter_victory`, `encounter_fled`                    |
| 6      | `encounter_evade`, `encounter_negotiate`                 |
| 5      | `encounter_harassment`                                   |
| 4      | `rank_up` (weight increases at higher ranks)             |
| 3      | `contract_complete` (first completion of a type gets +2) |
| 2      | `arrival` (first visit to a location gets +3)            |
| 1      | `mining_sale` (only included above a value threshold)    |

### Chronicle Caps and Pruning

Each actor (crew member or ship) maintains a chronicle of at most **50 entries**. When a new entry would exceed the cap:

1. Sort existing entries by `emotionalWeight` ascending (lowest weight first).
2. Among entries tied at the lowest weight, prefer pruning the oldest.
3. Remove the single lowest-weight entry to make room.

This ensures that high-drama events (deaths, rescues, boarding) are preserved indefinitely while routine milestones (contract completions, minor encounters) are gradually forgotten as more dramatic events accumulate. A crew member who has survived multiple boardings and a rescue will have a chronicle dominated by those events, with early routine contracts pruned away — exactly the story a player would want to tell.

### Chronicle Storage

Chronicles are stored in `GameData` as a map:

```typescript
interface GameData {
  // ... existing fields ...
  chronicles: Record<string, ChronicleEntry[]>; // keyed by actor ID
}
```

Actor IDs use the crew member's `id` field for crew chronicles and the ship's `name` for ship chronicles. Ship chronicles track events that affect the vessel as a whole (stranding, rescue, repeated encounters on the same route).

---

## Personality System

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

Traits are derived from the crew member's `id` string using a simple hash:

```typescript
function getPersonalityTraits(
  crewId: string
): [PersonalityTrait, PersonalityTrait] {
  const hash = simpleHash(crewId); // deterministic numeric hash
  const traits = ALL_TRAITS; // sorted array of 10 traits
  const first = traits[hash % 10];
  const second = traits[Math.floor(hash / 10) % 9]; // skip first trait's index
  return [first, second];
}
```

This ensures:

- The same crew member always gets the same traits (deterministic, no RNG state).
- Traits are assigned at "birth" and never change — personality is innate.
- No save data needed for trait storage — traits are computed on demand from the ID.

### Mechanical Effects

Each trait applies a small modifier (plus or minus 5-10%) to specific gameplay stats. With 2 traits per crew member, effects stack additively.

| Trait        | Positive Effect           | Negative Effect                        |
| ------------ | ------------------------- | -------------------------------------- |
| `stoic`      | +10% morale_recovery      | -5% negotiation                        |
| `reckless`   | +10% combat_attack        | -10% evasion                           |
| `cautious`   | +10% evasion              | -5% combat_attack                      |
| `gregarious` | +10% negotiation          | -5% mining_yield                       |
| `meticulous` | +10% repair_speed         | -5% encounter_rate (slower reaction)   |
| `pragmatic`  | +10% trade_income         | -5% morale_recovery                    |
| `idealistic` | +10% departure_resistance | -5% salary_expectation (accepts less)  |
| `sardonic`   | +5% morale_recovery       | -5% departure_resistance               |
| `loyal`      | +10% departure_resistance | -5% trade_income                       |
| `ambitious`  | +10% training_speed       | -10% salary_expectation (demands more) |

**Stacking rules**: Additive within a crew member's two traits. If a crew member is `reckless` + `ambitious`, they get +10% combat_attack, -10% evasion, +10% training_speed, and -10% salary_expectation. Effects from different crew members on the same ship do not combine — each modifier applies only to that crew member's personal stats.

**Effect channels explained**:

| Channel                | What It Modifies                                             |
| ---------------------- | ------------------------------------------------------------ |
| `training_speed`       | Multiplier on passive skill training rate                    |
| `combat_attack`        | Additive modifier to crew combat attack value                |
| `evasion`              | Modifier to ship evasion chance (per-crew contribution)      |
| `repair_speed`         | Modifier to repair points generated by this crew             |
| `negotiation`          | Modifier to negotiation success chance                       |
| `mining_yield`         | Modifier to mining extraction rate                           |
| `trade_income`         | Modifier to contract/trade payment                           |
| `encounter_rate`       | Modifier to encounter detection (negative = more encounters) |
| `morale_recovery`      | Modifier to morale recovery rate (future morale system)      |
| `departure_resistance` | Modifier to unpaid departure threshold                       |
| `salary_expectation`   | Modifier to salary multiplier                                |

---

## Arc Detection

### Execution Schedule

The arc detector runs:

1. **Every 480 ticks** (~1 game day) during normal play.
2. **After catch-up processing** completes, to detect arcs formed during offline time.

Detection is not run every tick for performance — story arcs develop over days, not seconds.

### The 12 Arc Patterns

Each pattern defines:

- A **name** and **display title**.
- **Required chronicle entries**: minimum count and types.
- **Time window**: how far back in the chronicle to scan.
- A **scoring function** that rates how strongly the pattern matches (0.0 to 1.0).
- A **minimum threshold** score to trigger (typically 0.6).

| Pattern ID         | Display Title        | Detection Logic                                                                                                                                                                |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `survivor`         | "The Survivor"       | Crew member has 3+ near-death events (boarding, starvation, oxygen critical) and is still alive. Score scales with event count and variety.                                    |
| `rags_to_riches`   | "Rags to Riches"     | Crew member started as a green recruit (initial skill total < 10) and has reached Proficient+ rank in any skill. Score scales with rank achieved and time taken.               |
| `old_reliable`     | "Old Reliable"       | Crew member has 20+ contract completions on the same trade route. Score scales with trip count and route consistency.                                                          |
| `legend_pilot`     | "Legend of the Void" | Crew member has reached Master rank in Piloting and has 5+ evasion/victory chronicles. Score scales with rank and combat variety.                                              |
| `rescue_hero`      | "The Rescue"         | Crew member was aboard a ship that completed a rescue mission. Score increases if the rescued ship had critical provisions.                                                    |
| `battle_brothers`  | "Brothers in Arms"   | Two crew members on the same ship have 5+ shared combat chronicles (victories, boardings, evasions). Score scales with shared event count.                                     |
| `mentor_protege`   | "Mentor & Protege"   | Two crew members on the same ship where one has 50+ skill advantage in any skill and the junior has gained 20+ points in that skill since boarding. Mentor relationship.       |
| `cursed_ship`      | "The Cursed Ship"    | A ship has 5+ boarding/harassment events and 2+ crew deaths in its chronicle. Score scales with loss severity.                                                                 |
| `lucky_ship`       | "Fortune's Favor"    | A ship has 8+ evasion or negotiation successes with zero boarding events. Score scales with streak length.                                                                     |
| `from_ashes`       | "From the Ashes"     | A ship was stranded and rescued, then completed 10+ contracts afterward. Score scales with post-rescue productivity.                                                           |
| `frontier_pioneer` | "Frontier Pioneer"   | A crew member has first-arrival chronicles at 5+ unique locations. Score scales with location count and distance from Earth of furthest visit.                                 |
| `iron_crew`        | "The Iron Crew"      | A ship has maintained the same crew complement (no deaths, no departures) for 30+ game days with 10+ combined contract completions. Score scales with tenure and productivity. |

### Scoring and Deduplication

- Each pattern returns a score from 0.0 to 1.0. Only scores above the pattern's threshold (default 0.6) produce a detected arc.
- An arc is identified by the combination of `(pattern_id, primary_actor_id, secondary_actor_id?)`. If this key already exists in the story list, the existing arc's score is updated rather than creating a duplicate.
- Higher scores produce more detailed narrative text (the generator includes additional flavor lines above 0.8).

---

## Narrative Generation

### Template-Based Synthesis

Each arc pattern has a set of narrative templates — short paragraph structures with placeholder slots filled from chronicle data.

```typescript
interface NarrativeTemplate {
  pattern: ArcPatternId;
  minScore: number; // minimum arc score to use this template
  title: string; // e.g. "The Survivor: {crewName}"
  opening: string; // first sentence template
  body: string[]; // middle paragraph templates (selected by score)
  closing: string; // final sentence template
  flavorSlots: string[]; // personality-colored insertions
}
```

### Personality-Colored Flavor Text

Each trait has a bank of short phrases for each arc type. When generating narrative text, the crew member's two personality traits inject flavor into designated slots:

**Example — "The Survivor" arc for a `stoic` + `loyal` crew member:**

> _Kira Vasquez has survived what would break most spacers. Three boardings on the Stellarwind, including the brutal ambush near The Crucible that left two crew dead. She doesn't talk about it much — just shows up for her shift and does the work. "They were my people," she said once, after the memorial. "You don't forget that."_

Compared to the same arc for a `sardonic` + `reckless` crew member:

> _Jin Park has survived what would break most spacers. Three boardings on the Stellarwind, including the brutal ambush near The Crucible that left two crew dead. "At this point I think the pirates owe me a frequent customer card," he joked on the bridge afterward. He volunteered for the next dangerous run before anyone asked._

The narrative structure is identical — only the flavor-slot text changes based on personality.

### Template Data

Templates are stored as static data arrays (similar to `gamepediaData.ts`) — no runtime LLM or procedural text generation. All narrative text is hand-authored in advance and assembled from parts. This keeps the system deterministic and saves-compatible.

---

## Relationship Layer

### Bond Formation

Relationships between crew members form automatically based on shared experiences. Bonds are tracked as a numeric `bondStrength` (0-100) between pairs of crew IDs.

**Bond formation rules:**

| Bond Level       | Threshold | Formation Condition                                                                                                                                                  |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shipmate`       | 10        | Serving on the same ship for 10+ game days                                                                                                                           |
| `battle_brother` | 30        | 30+ shared days AND 3+ shared combat chronicles                                                                                                                      |
| `mentor`         | 50        | 50+ shared days AND one crew member has a 20+ skill gap in any skill compared to the other, AND the junior has gained 10+ points since they started serving together |

Bond strength increases by:

- **+1 per game day** of shared ship assignment.
- **+5 per shared combat event** (encounter on the same ship).
- **+3 per shared crisis** (stranding, fuel depletion, oxygen critical).
- **+2 per shared contract completion**.

Bond strength decays by **-0.5 per game day** when crew are on different ships, to a floor of 0.

### Comrade Lost

When a crew member dies, all crew members with a bond strength of 10+ to the deceased gain a `comrade_lost` chronicle entry. This entry has emotional weight 8 and references the deceased by name. The `comrade_lost` mechanic ensures that deaths ripple through the story system — other crew members' narratives acknowledge the loss.

If the deceased had a `battle_brother` or `mentor` bond with the survivor, the `comrade_lost` entry is elevated to emotional weight 9 and may trigger the "Brothers in Arms" or "Mentor & Protege" arc patterns retrospectively.

### Relationship Storage

```typescript
interface Bond {
  crewIdA: string; // lexicographically smaller ID
  crewIdB: string; // lexicographically larger ID
  strength: number; // 0-100
  sharedDays: number; // total days on same ship
  sharedCombat: number; // count of shared combat events
}
```

Bonds are stored in `GameData.bonds: Bond[]`. The array is kept compact — bonds that decay to 0 are removed.

---

## Story Lifecycle

### States

Each detected arc becomes a **Story** with a lifecycle:

```
Detected  →  Active  →  Dismissed
              ↑
              └── Updated (score improved, narrative refreshed)
```

- **Active**: Visible in the Stories tab. The player can read, share, or dismiss it.
- **Dismissed**: Hidden from the main list. Can be found in a "Dismissed Stories" archive section. Dismissed stories do not count toward the storage cap.

### Storage Cap

The game stores at most **30 active stories**. When a new arc is detected and the cap is reached:

1. Stories are sorted by their arc score (lowest first).
2. The lowest-scoring active story is automatically dismissed to make room.
3. A toast notification informs the player: "A new story was detected. An older story was archived to make room."

This ensures the story list is always curated — only the most dramatic and well-evidenced narratives survive.

### Story Rating

Each story has a composite rating derived from:

- **Arc score** (0.0-1.0): How strongly the pattern matched.
- **Emotional weight sum**: Total emotional weight of the chronicle entries that contributed to the arc.
- **Recency**: More recent stories get a small boost (decays over 30 game days).

Rating = `arcScore * 0.5 + normalizedWeight * 0.3 + recencyBoost * 0.2`

This rating determines pruning order and display sort order (highest rating first).

---

## Sharing

### Text Copy

Players can copy a story as formatted plain text via the clipboard API. The text format:

```
═══════════════════════════════
THE SURVIVOR: KIRA VASQUEZ
Stellarwind — Day 42 to Day 187
═══════════════════════════════

Kira Vasquez has survived what would break most spacers. Three
boardings on the Stellarwind, including the brutal ambush near
The Crucible that left two crew dead. She doesn't talk about it
much — just shows up for her shift and does the work.

"They were my people," she said once, after the memorial.
"You don't forget that."

         — Starship Commander Fleet Chronicle
```

### PNG Image Export

Players can export a story as a styled PNG image using the Canvas API:

1. Create an offscreen `<canvas>` element (800 x 600 default, adjustable by content length).
2. Draw the game's dark background gradient (`#1a1a2e` to `#16213e`).
3. Render the story title in the game's accent color (`#e94560`).
4. Render the narrative body text in light color (`#e0e0e0`), word-wrapped.
5. Add a subtle game logo/watermark and "Starship Commander" attribution at the bottom.
6. Convert to PNG blob and trigger download or share.

The canvas approach avoids html2canvas dependencies and gives full control over styling.

### Web Share API

On devices that support `navigator.share()` (mobile browsers, some desktop), a "Share" button uses the Web Share API to share:

- **Text-only share**: Title and narrative text.
- **Image share**: The PNG blob as a shared file (where supported).

Fallback on unsupported browsers: copy-to-clipboard with a toast confirmation.

---

## Data Model

### New Types

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

interface PersonalityEffect {
  channel: string; // e.g. 'training_speed', 'combat_attack'
  modifier: number; // e.g. +0.10 or -0.05
}

// Chronicle
interface ChronicleEntry {
  gameTime: number;
  type: LogEntryType;
  message: string;
  shipName: string;
  locationId?: string;
  emotionalWeight: number;
  involvedActors: string[];
}

// Relationships
interface Bond {
  crewIdA: string;
  crewIdB: string;
  strength: number;
  sharedDays: number;
  sharedCombat: number;
}

// Arc Detection
type ArcPatternId =
  | 'survivor'
  | 'rags_to_riches'
  | 'old_reliable'
  | 'legend_pilot'
  | 'rescue_hero'
  | 'battle_brothers'
  | 'mentor_protege'
  | 'cursed_ship'
  | 'lucky_ship'
  | 'from_ashes'
  | 'frontier_pioneer'
  | 'iron_crew';

interface DetectedArc {
  patternId: ArcPatternId;
  primaryActorId: string;
  secondaryActorId?: string;
  score: number; // 0.0-1.0
  contributingEntries: number[]; // indices into actor's chronicle
}

// Stories
type StoryStatus = 'active' | 'dismissed';

interface Story {
  id: string; // unique story ID
  arc: DetectedArc;
  title: string; // rendered title
  narrative: string; // rendered narrative text
  rating: number; // composite rating for sorting/pruning
  detectedAt: number; // gameTime when first detected
  status: StoryStatus;
}

// GameData additions
interface GameData {
  // ... existing fields ...
  chronicles: Record<string, ChronicleEntry[]>; // actor ID → entries
  bonds: Bond[];
  stories: Story[];
  lastArcDetectionTime: number; // gameTime of last detection run
}
```

### Save Data Sizing

Estimated maximum save data contribution:

| Component  | Count                    | Avg Size         | Total       |
| ---------- | ------------------------ | ---------------- | ----------- |
| Chronicles | ~20 actors x 50 entries  | ~200 bytes/entry | ~200 KB     |
| Bonds      | ~50 pairs                | ~80 bytes/bond   | ~4 KB       |
| Stories    | 30 active + 30 dismissed | ~800 bytes/story | ~48 KB      |
| Metadata   | —                        | —                | ~1 KB       |
| **Total**  |                          |                  | **~253 KB** |

With JSON overhead and worst-case string lengths, the ceiling is approximately **280 KB**. This fits comfortably within localStorage limits (~5 MB) alongside the existing save data.

Personality traits add zero bytes to save data — they are computed deterministically from crew IDs.

---

## Integration Points

### Existing Systems Modified

| System        | File                               | Change                                                                                                                                                                                    |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log System    | `src/logSystem.ts`                 | After `addLog()`, call `addChronicleEntry()` to evaluate and store chronicle-worthy events                                                                                                |
| Game Tick     | `src/gameTick.ts`                  | Call `updateBonds()` every tick (bond strength accrual/decay). Call `runArcDetection()` every 480 ticks                                                                                   |
| Catch-Up      | `src/catchUpReportBuilder.ts`      | After catch-up tick processing, trigger arc detection for the offline period                                                                                                              |
| Crew Hiring   | `src/crewHiring.ts`                | No change — personality derived from ID at render time                                                                                                                                    |
| Combat System | `src/combatSystem.ts`              | No change to logic — chronicle entries created via the log system hook                                                                                                                    |
| Crew Death    | `src/gameTick.ts` (death handling) | After removing dead crew, fire `comrade_lost` chronicle entries for bonded crew                                                                                                           |
| Models        | `src/models/index.ts`              | Add `ChronicleEntry`, `Bond`, `Story`, `DetectedArc`, `PersonalityTrait`, `ArcPatternId`, `StoryStatus` types. Add `chronicles`, `bonds`, `stories`, `lastArcDetectionTime` to `GameData` |
| Storage       | `src/storage.ts`                   | Add migration for new `GameData` fields (empty defaults). Bump `CURRENT_SAVE_VERSION`                                                                                                     |
| Renderer      | `src/ui/renderer.ts`               | Add Stories tab to tab list. Mount `storiesTab` component                                                                                                                                 |
| Crew Tab      | `src/ui/crewTab.ts`                | Display personality traits on crew profile cards (two trait badges)                                                                                                                       |

### New Files

| File                        | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `src/chronicleSystem.ts`    | Chronicle entry creation, filtering, storage, pruning              |
| `src/personalitySystem.ts`  | Trait derivation from ID hash, effect lookup, modifier application |
| `src/arcDetector.ts`        | Pattern definitions, scoring functions, detection scheduling       |
| `src/narrativeGenerator.ts` | Template assembly, personality flavor injection                    |
| `src/relationshipSystem.ts` | Bond tracking, strength updates, comrade_lost events               |
| `src/storySystem.ts`        | Story lifecycle management, rating, pruning                        |
| `src/ui/storiesTab.ts`      | Stories tab component (mount-once/update-on-tick pattern)          |
| `src/ui/storyCard.ts`       | Individual story card rendering                                    |
| `src/ui/storyShareModal.ts` | Text copy and PNG export modal                                     |
| `src/narrativeTemplates.ts` | Static template data for all 12 arc patterns                       |

### Systems NOT Modified

- **Skill progression** (`src/skillProgression.ts`): Personality modifiers to `training_speed` are applied as a multiplier at the point of use, not by changing the skill system's formulas.
- **Quest system** (`src/questSystem.ts`): Trade income modifiers from personality are applied at payment time via the existing bonus pipeline.
- **Navigation** (`src/navigation.ts`): No changes — storytelling is observational, not interventional.
- **Mining** (`src/miningSystem.ts`): Personality yield modifiers applied at extraction time via modifier lookup.

---

## Design Decisions

1. **Observation, not intervention**: The storytelling system observes and narrates; it never changes gameplay outcomes. A "cursed ship" arc does not make the ship more likely to be attacked — it just recognizes the pattern.

2. **Deterministic personality**: Traits are derived from ID hashes, not stored. This means personality survives save corruption, costs zero storage, and is always consistent. The tradeoff is that players cannot choose or reroll traits.

3. **Template-based narration**: Hand-authored templates instead of procedural generation. This keeps text quality high and output predictable. The system's expressiveness comes from combining templates with personality-colored flavor text, not from generating novel sentences.

4. **Generous detection, strict curation**: The arc detector is tuned to find patterns relatively often (every few game days of active play), but the 30-story cap and rating-based pruning ensure only the best stories persist. Players should discover stories regularly but not be overwhelmed.

5. **Chronicle-first, not log-first**: Chronicles are a separate data structure from the event log. The log is a rolling window (200 entries, pruned by age); chronicles are per-actor (50 entries, pruned by emotional weight). This lets stories reference events that have long since fallen out of the log.

6. **Bonds decay when separated**: Crew relationships weaken when crew are on different ships. This creates a soft incentive to keep partnerships together and makes the "Brothers in Arms" arc feel earned — you had to keep those two together through real danger.

7. **PNG export over screenshot**: Canvas-rendered PNG gives consistent styling across devices and avoids the complexity and quality issues of DOM-to-image libraries. The tradeoff is manual layout code, but story cards have a fixed, simple structure.
