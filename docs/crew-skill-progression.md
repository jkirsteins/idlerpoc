# Crew Skill Progression Design

> **SUPERSEDED:** This design (XP → level → allocatable skill points, 1-10 scale) has been replaced by the direct skill training model in [`skill-training-design-research.md`](skill-training-design-research.md). The new design uses direct room-based skill training with diminishing returns on a 1-100 scale. This document is kept for historical reference.

## Design Philosophy

**Skills emerge from what crew members do, not from abstract XP pools.** A navigator gets better at astrogation by navigating. A gunner gets better at combat by fighting. This follows the project's core principle: game state emerges from system behavior.

## Core Mechanic: Learning By Doing

Crew members earn XP during flight based on **what room they are assigned to** and **what events they participate in**. There are two XP sources:

### 1. Passive XP: Room Assignment During Flight

Every tick during flight, crew members earn XP based on their room assignment. This represents on-the-job learning — practice making perfect.

**XP Per Tick By Room:**

| Room                  | Skill Trained                                       | XP/Tick | Rationale                          |
| --------------------- | --------------------------------------------------- | ------- | ---------------------------------- |
| Bridge                | Piloting (for pilots), Astrogation (for navigators) | 0.5     | Active flight operations           |
| Engine Room           | Engineering                                         | 0.5     | Keeping engines running            |
| Reactor Room          | Engineering                                         | 0.75    | Higher-stakes reactor management   |
| Point Defense Station | Strength                                            | 0.5     | Combat readiness drills            |
| Armory                | Strength                                            | 0.25    | Equipment maintenance, less active |
| Cantina               | Charisma                                            | 0.25    | Social interaction, crew welfare   |
| Medbay                | Loyalty                                             | 0.25    | Caring for crew, building trust    |
| Quarters              | None                                                | 0       | Resting, no skill practice         |
| Cargo Hold            | None                                                | 0       | Uncrewed room                      |

**Which skill is trained?** Determined by the room's `preferredRole` → that role's primary skill:

- Bridge → pilot → `piloting` _or_ navigator → `astrogation` (see below)
- Engine Room → engineer → `engineering`
- Cantina → cook → `charisma`
- Medbay → medic → `loyalty`
- Armory → gunner → `strength`
- Reactor Room → engineer → `engineering`
- Point Defense Station → gunner → `strength`

**Bridge special case:** The bridge trains two different skills depending on the crew member's role:

- Crew with role `pilot` or `captain` earn **piloting** XP
- Crew with role `navigator` earn **astrogation** XP
- Other crew in the bridge earn **piloting** XP (learning the basics)

**Skill matching bonus:** If the crew member's highest skill matches the room's trained skill, they earn 1.5x XP (focused expertise). This rewards proper crew placement.

### 2. Event XP: Encounters, Contracts, and Milestones

Discrete events award one-time XP bursts to relevant crew.

| Event                         | Who Gets XP                   | Skill         | Amount       | Rationale             |
| ----------------------------- | ----------------------------- | ------------- | ------------ | --------------------- | -------------------------- |
| **Encounter evaded**          | Bridge crew                   | Astrogation   | 10           | Spotted and dodged    |
| **Encounter negotiated**      | Negotiator (highest charisma) | Charisma      | 15           | Talked out of trouble |
| **Encounter: victory**        | Armory + PD crew              | Strength      | 20           | Won the fight         |
| **Encounter: harassment**     | All crew                      | Loyalty       | 5            | Survived together     |
| **Encounter: boarding**       | All crew                      | Loyalty       | 10, Strength | 10                    | Traumatic bonding + combat |
| **Contract completed**        | All crew on ship              | Primary skill | 5 per trip   | Job well done         |
| **First arrival at location** | All crew                      | Astrogation   | 15           | Exploration reward    |

### XP → Level → Skill Points

The existing level system is preserved exactly:

- XP thresholds: 0, 10, 50, 120, 250, 450, ... 37,000 (levels 1-20)
- On level up: crew member gains **1 unspent skill point**
- Skill points can be spent to increase any skill by 1 (cap: 10)

### Spending Skill Points

Skill points are spent **while docked** through the Crew tab UI. The player selects a crew member with unspent points and chooses which skill to increase.

**Constraint: no skill can exceed 10.** If all skills are at 10, skill points cannot be spent (and the crew member is a master of all trades — exceedingly rare at level 20 with 19 skill points total and 6 skills starting at 3-9).

**Role recalculation:** After spending a skill point, the crew member's role is recalculated via `deduceRoleFromSkills()`. If the role changes, a log entry notes it: "_[Crew name] has grown into the role of [new role]._"

## XP Rate Analysis

**Is this balanced?** Let's check against the existing XP thresholds.

A crew member in the bridge earns 0.5 XP/tick. At the skill-matching bonus of 1.5x, that's 0.75 XP/tick.

| Level Target   | XP Needed | Ticks at 0.75 XP/tick | Game Days | Real Minutes |
| -------------- | --------- | --------------------- | --------- | ------------ |
| 2 (10 XP)      | 10        | 13                    | 0.3       | 0.2          |
| 3 (50 XP)      | 50        | 67                    | 1.4       | 1.1          |
| 5 (250 XP)     | 250       | 333                   | 6.9       | 5.6          |
| 7 (750 XP)     | 750       | 1,000                 | 20.8      | 16.7         |
| 10 (2,400 XP)  | 2,400     | 3,200                 | 66.7      | 53.3         |
| 15 (10,500 XP) | 10,500    | 14,000                | 291.7     | 233.3        |
| 20 (37,000 XP) | 37,000    | 49,333                | 1,027.8   | 822.2        |

A pilot starting at level 1 reaches level 5 in about 7 game days (~6 real minutes) of flying. Level 10 takes about 67 game days (~53 real minutes). Level 20 is a very long-term goal requiring ~1,028 game days (~14 real-time hours) of continuous flight with optimal placement.

This feels right:

- **Early levels come quickly** — new crew feel rewarding to train
- **Mid-levels require commitment** — you invest in your crew
- **Max level is aspirational** — only your most veteran crew reach it
- **Event XP provides spikes** — encounters feel rewarding beyond loot

## How Skills Affect Gameplay (Existing + New)

### Already Implemented Effects

These are already coded and will benefit immediately from skill progression:

| Skill       | System              | Formula                         | Impact of +1           |
| ----------- | ------------------- | ------------------------------- | ---------------------- |
| Astrogation | Encounter detection | `1 / (1 + astro * 0.08)`        | ~5-8% fewer encounters |
| Astrogation | Evasion chance      | `astro * 0.02`                  | +2% evasion            |
| Strength    | Point defense       | `0.5 + strength * 0.05`         | +5% PD effectiveness   |
| Strength    | Armory combat       | `strength + weapon.attackScore` | +1 combat score        |
| Charisma    | Negotiation         | `charisma / 20`                 | +5% negotiation chance |

### New Effect: Skill-Based Quest Payment Bonus (ties into economy rebalancing)

When a crew member with high skill relevant to a contract type is aboard, the contract payment receives a bonus. This represents the ship's reputation and reliability.

| Skill       | Contract Bonus        | Condition                                |
| ----------- | --------------------- | ---------------------------------------- |
| Astrogation | +2% per point above 5 | Navigator on bridge                      |
| Engineering | +1% per point above 5 | Engineer in engine room                  |
| Charisma    | +3% per point above 5 | Cook in cantina (negotiated better rate) |

Max bonus example: Navigator with 10 astrogation in bridge → +10% payment. This stacks with the economy rebalancing's cost-floor system.

### Future Effect Hooks (Not Implemented Now, But Designed For)

The skill system creates natural integration points for future features:

- **Engineering → Fuel efficiency:** Higher engineering could reduce fuel consumption during burns (currently not skill-dependent)
- **Piloting → Flight time reduction:** Skilled pilots could reduce total trip time by optimizing burns
- **Loyalty → Unpaid tolerance:** High-loyalty crew could tolerate more unpaid ticks before departing
- **Charisma → Hire cost discount:** High-charisma captain could negotiate lower crew hiring costs

These are NOT implemented in this design — listed here to show the system's extensibility.

## Implementation Specification

### Data Model Changes

No changes to `CrewMember` interface — it already has `xp`, `level`, and `unspentSkillPoints` fields.

### New Module: `src/skillProgression.ts`

```typescript
/**
 * Calculate XP earned per tick for a crew member based on room assignment.
 * Returns { skill: SkillId, xp: number } or null if no XP earned.
 */
export function calculateTickXP(
  crew: CrewMember,
  room: Room | null
): { skill: SkillId; xp: number } | null;

/**
 * Award event XP to relevant crew members.
 * Called by combat system and contract execution.
 */
export function awardEventXP(ship: Ship, event: XPEvent): LevelUpResult[];

/**
 * Spend a skill point to increase a skill.
 * Returns true if successful, false if skill at cap or no points.
 */
export function spendSkillPoint(crew: CrewMember, skill: SkillId): boolean;

/**
 * XP event types for event-based XP awards
 */
export type XPEvent =
  | { type: 'encounter_evaded' }
  | { type: 'encounter_negotiated'; negotiatorId: string }
  | { type: 'encounter_victory' }
  | { type: 'encounter_harassment' }
  | { type: 'encounter_boarding' }
  | { type: 'contract_completed'; tripsCompleted: number }
  | { type: 'first_arrival'; locationId: string };
```

### Integration Points

1. **`gameTick.ts` → `applyShipTick()`**: After existing per-tick logic, call `calculateTickXP()` for each crew member based on their room assignment. Apply XP and check for level-ups.

2. **`combatSystem.ts`**: After encounter resolution, call `awardEventXP()` with the encounter outcome.

3. **`contractExec.ts` → `completeLeg()`**: On contract completion, call `awardEventXP()` with `contract_completed`.

4. **Crew Tab UI**: Show "Spend Skill Points" button when `unspentSkillPoints > 0`. Clicking opens a skill allocation panel.

### Level-Up Log Entries

When a crew member levels up during flight, add a log entry:

```
"[Crew name] has reached level [N]! (1 skill point available)"
```

New log entry type: `'crew_level_up'`

## UI Changes

### Crew Tab Enhancements

1. **XP progress bar** (already exists) — now actually fills up during gameplay
2. **Skill point indicator** — show badge count on crew members with unspent points
3. **Skill allocation panel** — when docked, click "Assign Points" to see skills with +/- buttons
4. **Room training indicator** — show what skill is being trained for each crew member in their current room assignment (small icon or tooltip)

### Flight Status

During flight, periodically show level-up notifications in the log (not as modal popups — don't interrupt gameplay).

## Migration

Per CLAUDE.md: no migration code. Existing crew members will start earning XP naturally on next flight. Their current XP/level is preserved, and `unspentSkillPoints` starts at 0 (retroactive points are not granted).
