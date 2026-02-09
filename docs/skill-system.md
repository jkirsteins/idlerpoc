# Skill System Design

This document describes the complete skill system including ranks, training, specialization, commerce, and gameplay unlocks.

## Overview

Crew members have 7 skills on a 1-100 scale. Six core skills (piloting, astrogation, engineering, strength, charisma, loyalty) train passively via job slot assignment during flight. The seventh skill (commerce) trains exclusively when the captain or first officer completes trade routes.

Skills use **diminishing returns**: training speed decreases as skill approaches 100, creating fast early progress and slow late-game mastery.

## Core Training Formula

```
gain/tick = trainRate × (100 - currentSkill) / 100 × matchBonus × specializationMultiplier
```

- `trainRate`: base rate from job slot (0.00002 - 0.00006)
- `matchBonus`: 1.5x when crew's primary role skill matches job's trained skill
- `specializationMultiplier`: 1.5x for specialized skill, 0.75x for non-specialized skills (1.0 if no specialization)

## Skill Ranks (10 Levels, Non-Linear Distribution)

Ranks are distributed non-linearly: many levels per rank at low effort, fewer at high effort. This means players see frequent rank-ups early (dopamine when skills are cheap) and each high-level rank feels earned.

| Rank       | Min Level | Band Width | Design Intent          |
| ---------- | --------- | ---------- | ---------------------- |
| Untrained  | 0         | 5 levels   | Starting state         |
| Green      | 5         | 7 levels   | First steps            |
| Novice     | 12        | 8 levels   | Learning the basics    |
| Apprentice | 20        | 10 levels  | Developing competence  |
| Competent  | 30        | 10 levels  | Functional crew member |
| Able       | 40        | 15 levels  | Reliable performer     |
| Proficient | 55        | 15 levels  | Above average          |
| Skilled    | 70        | 13 levels  | High capability        |
| Expert     | 83        | 12 levels  | Top tier               |
| Master     | 95        | 6 levels   | Pinnacle of mastery    |

### UI Presentation

- Each skill shows: name, numeric value, rank label, and a progress bar toward the next rank
- Rank crossings generate prominent log entries: "Torres has become Expert in Engineering (83)!"
- Integer skill crossings still log but more subtly

## Skill-Linked Gameplay Unlocks

### Piloting → Ship Class Requirements

The helm crew's piloting skill determines which ship classes they can fly:

| Ship Tier | Min Piloting | Rank Required | Ships                                   |
| --------- | ------------ | ------------- | --------------------------------------- |
| I         | 0            | Any           | Station Keeper                          |
| II        | 25           | Competent     | Wayfarer, Corsair, Dreadnought, Phantom |
| III       | 50           | Able          | Firebrand, Leviathan                    |
| IV        | 75           | Skilled       | (Future: Deep System Cruisers)          |
| V         | 95           | Master        | (Future: Gap-Capable Vessels)           |

### Other Skill Thresholds (Design Reference)

These thresholds are defined in `skillRanks.ts` as design documentation. Not all are enforced yet — this serves as a roadmap:

**Astrogation:**

- 25: Encounter avoidance bonus kicks in
- 50: Quest payment bonus from scanner crew
- 75: Encounter detection range doubled (early warning)

**Engineering:**

- 25: Repair points start flowing from repair job slots
- 50: Quest payment bonus from drive ops crew
- 75: Repair efficiency doubled

**Strength:**

- 25: Boarding defense contributes to ship defense score
- 50: Can operate heavy weapons (point defense turrets)
- 75: Combat victory bounties increased 50%

**Charisma:**

- 25: Negotiation attempts become available
- 50: Quest payment bonus from galley/comms crew
- 75: Negotiation auto-succeeds against low-threat pirates

**Loyalty:**

- 25: Crew morale decay reduced
- 50: Crew salary reduced 10%
- 75: Crew stays 50% longer when unpaid

## Commerce Skill

Commerce is a **7th skill** unique in how it's trained:

- **Not trained via job slots** — only through completing trade routes
- **Only the captain and first officer earn it** when a contract completes
- Captain earns: `1.0 + 0.5 × tripsCompleted` per contract
- First officer (highest-loyalty non-captain) earns half the captain's amount

### Commerce Effects

| Commerce Level | Quest Payment Bonus | Fuel Discount |
| -------------- | ------------------- | ------------- |
| 0-24           | 0%                  | 0%            |
| 25-49          | +5%                 | -5%           |
| 50-74          | +10%                | -10%          |
| 75-94          | +15%                | -15%          |
| 95-100         | +20%                | -20%          |

Commerce creates a feedback loop: completing routes improves commerce, which improves pay and reduces fuel costs, making future routes more profitable. This is the game's primary long-term progression reward for sustained play.

## Specialization System

When any core skill (not commerce) reaches level 50 (Able rank), the player can choose to **specialize** that crew member:

- **+50% training speed** for the specialized skill
- **-25% training speed** for all other skills
- **One-time, irreversible choice** — creates meaningful commitment
- UI shows specialization as a badge on the crew detail panel

### Design Intent

Specialization creates a medium-to-long-term decision:

- **Specialize early** (at 50) for faster high-level progression in one skill
- **Wait and generalize** for a more versatile crew member
- Creates roster differentiation over time — your crew becomes uniquely yours

## Event-Based Skill Gains

These bypass diminishing returns (flat amounts):

| Event                | Crew Affected | Skill Gained       | Amount                 |
| -------------------- | ------------- | ------------------ | ---------------------- |
| Encounter Evaded     | Bridge crew   | Astrogation        | 2.0                    |
| Encounter Negotiated | Negotiator    | Charisma           | 2.5                    |
| Encounter Victory    | Combat crew   | Strength           | 3.0                    |
| Encounter Harassment | All crew      | Loyalty            | 1.0                    |
| Encounter Boarding   | All crew      | Loyalty + Strength | 1.5 each               |
| Encounter Fled       | Bridge crew   | Piloting           | 1.5                    |
| Contract Completed   | All crew      | Primary skill      | 0.8 × trips            |
| Contract Completed   | Captain       | Commerce           | 1.0 + 0.5 × trips      |
| Contract Completed   | First Officer | Commerce           | (captain amount) × 0.5 |
| First Arrival        | All crew      | Astrogation        | 2.0                    |

## Idle Game Clock Mapping

| Clock               | Duration          | Skill System Role                                      |
| ------------------- | ----------------- | ------------------------------------------------------ |
| Short (minutes)     | Per-session       | Integer skill-ups as micro-rewards                     |
| Medium (hours-days) | Between check-ins | Rank crossings as milestones, specialization decisions |
| Long (days-weeks)   | Sustained play    | Commerce progression, Master rank achievement          |

## Implementation Files

- `src/skillRanks.ts` — Rank definitions, gameplay thresholds, specialization, commerce bonuses
- `src/skillProgression.ts` — Training formula, event gains, rank crossing detection
- `src/models/index.ts` — CrewSkills interface (7 skills), SkillSpecialization type
- `src/crewRoles.ts` — Role-to-skill mapping (commerce excluded from role deduction)
- `src/ui/crewTab.ts` — Skill display with ranks, progress bars, specialization UI
- `src/questGen.ts` — Commerce payment bonus integration
- `src/ui/refuelDialog.ts` — Commerce fuel discount integration

## Future Work

- Enforce piloting tier requirements at ship purchase/departure
- Implement remaining skill threshold effects (charisma auto-negotiate, engineering repair doubling, etc.)
- Add skill-based equipment requirements (strength for heavy weapons, engineering for advanced tools)
- Consider prestige/reset mechanics for long-term clock
- Crew trait system that interacts with mastery (skill 100)
