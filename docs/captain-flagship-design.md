# Captain Flagship Design

## Motivation

The captain is the player character — the owner-operator of the entire fleet. Currently, the captain provides exactly one mechanical benefit: a commerce skill bonus on quest payments. There is no gameplay reason for the captain to be on any particular ship.

This is both thematically wrong and a missed design opportunity. A captain would not stay on a Station Keeper and hand a Leviathan to a new recruit. The systems should create an **emergent** incentive for the captain to command the best ship in the fleet, without hardcoding that as a rule.

## Design Principles

- **Emergent, not mandated.** No rule says "captain must be on the best ship." The interacting systems make it the optimal choice.
- **The multiplier matters more on bigger ships.** A +50% bonus on a Leviathan earning 10k/day = 5k extra. The same bonus on a Station Keeper earning 500/day = 250 extra. The player self-selects the best ship because the math demands it.
- **Always visible.** Per the UI discoverability rule, captain bonuses are always shown — even as "inactive" or "0%" on ships without the captain. This teaches players the system exists.
- **Connects to existing unused fields.** Morale exists on crew but has no gameplay effect. This system activates it.

---

## Layer 1: Captain Presence Multiplier (Core Incentive)

The captain's ship receives a **Command Bonus** — a multiplicative modifier to income, crew training speed, and encounter outcomes, derived from the captain's skills:

| Captain Skill | Bonus on Captain's Ship | Effect |
|---------------|------------------------|--------|
| Commerce | `1.0 + commerce/100` (e.g. skill 50 = +50%) | Payment multiplier on contracts, trade routes, ore sales |
| Piloting | `1.0 + piloting/200` (e.g. skill 50 = +25%) | Encounter evasion chance bonus, flight fuel efficiency |
| Mining | `1.0 + mining/100` (e.g. skill 50 = +50%) | Ore extraction rate multiplier |

**Acting captain fallback:** Ships without the captain use the highest-commerce crew member as acting captain. The acting captain provides only **25% of the equivalent bonus** (e.g. a skill-50 acting captain gives +12.5% commerce bonus instead of +50%).

This makes the captain's ship naturally the most productive ship in the fleet. The better the ship (more crew, better equipment, higher-value routes), the more the captain's multiplier is worth in absolute terms.

### Implementation Notes

- Strengthen the existing `getShipCommander()` bonus in `questGen.ts` and `contractExec.ts`
- Apply the same pattern to `miningSystem.ts` for mining yield
- Apply to encounter detection in `combatSystem.ts` for evasion

---

## Layer 2: Fleet Coordination Aura

The captain provides a **fleet-wide aura** that diminishes with distance:

| Proximity to Captain | Bonus |
|---------------------|-------|
| Same location | +10% income, +10% training speed |
| One hop away | +5% income, +5% training speed |
| Two+ hops away | No bonus |

This creates strategic tension: do you keep your fleet clustered near the captain for the aura, or send ships to distant high-value routes and sacrifice the coordination bonus?

### Implementation Notes

- Requires distance calculation between captain's ship location and each fleet ship location
- Applied as a multiplier in the per-ship tick
- "Hop" distance could be defined as connected locations on the nav chart, or use physical distance thresholds

---

## Layer 3: Morale System Integration

The captain's presence affects crew morale (the `morale` field exists on crew but is currently unused):

| Condition | Morale Effect |
|-----------|--------------|
| On captain's ship | Morale stabilized at 85 (current base), slow drift toward 90 |
| On fleet ship (with acting captain) | Morale stable at 75, slow drift toward 70 if unpaid/in danger |
| On fleet ship (no acting captain) | Morale decays toward 50 over time |

**Morale gameplay effects:**

| Morale Range | Effect |
|-------------|--------|
| 80-100 | +15% training speed, +10% combat defense, no desertion risk |
| 60-79 | Normal (no bonus, no penalty) |
| 40-59 | -15% training speed, -10% combat defense, 5% desertion chance at dock |
| 0-39 | -30% training speed, -25% combat defense, 20% desertion chance at dock |

A Leviathan with 20 crew and no captain would experience morale decay — incentivizing the captain to be on the ship with the most crew to manage.

### Implementation Notes

- Wire morale into `gameTick.ts` per-ship update
- Apply training speed modifier in `skillTraining.ts`
- Apply combat modifier in `combatSystem.ts`
- Apply desertion check in `deductFleetSalaries()` dock logic
- Follows Barotrauma's "Leading By Example" captain talent pattern

---

## Layer 4: Captain-Exclusive Encounter Outcomes

The captain's ship gets unique encounter advantages:

| Mechanic | With Captain | Without Captain |
|----------|-------------|-----------------|
| Negotiation | Available (commerce skill check) | Unavailable — ships can only evade, flee, or fight |
| Boarding defense | Captain's piloting + combat skills contribute | Equipment and crew weapons only |
| Rally bonus | Flat +5 defense score (leadership under fire) | No rally bonus |

This means the captain's ship is the safest ship for dangerous, high-reward routes — which are naturally the routes for your best ship.

### Implementation Notes

- Gate the "negotiation" outcome in `combatSystem.ts` behind `ship.crew.some(c => c.isCaptain)`
- Add rally defense bonus to `calculateDefenseScore()` when captain is aboard
- Captain's piloting contributes an additional defense term

---

## Layer 5: Training Speed Aura

The captain's ship has a **training speed multiplier** for all crew aboard:

| Captain Presence | Training Multiplier |
|-----------------|-------------------|
| Captain aboard | 1.5x base training speed for all crew on ship |
| Acting captain | 1.0x (no bonus) |

This makes the captain's ship the natural "training ground":
1. Recruit new crew at station
2. Assign to captain's ship — they train 50% faster
3. Once skilled, deploy to fleet ships for independent operations

This creates a satisfying crew pipeline and follows Eric Guan's "reengagement clock" framework — the captain's ship rewards frequent check-ins (assign new recruits, rotate trained crew out).

### Implementation Notes

- Apply multiplier in `skillTraining.ts` when calculating training rate per tick
- Simple boolean check: is captain on this ship?

---

## UI Surfacing

### Fleet Panel (Always-Visible Header)

The fleet panel already shows per-ship rows with activity, location, fuel, crew, equipment, and range. Add:

- **Captain indicator**: A gold crown/star icon on the ship row where the captain is stationed. Always visible on exactly one row.
- **Command bonus badge**: Small gold text next to the ship name showing the active bonus, e.g. `+47% CMD`. Tooltip on hover breaks down the bonus by skill.
- **Acting captain indicator**: On ships without the captain, show a dimmed/gray version of the command badge with the acting captain's reduced bonus, e.g. `+12% ACT`. This communicates the system exists and shows what they're missing.

### Ship Tab — Status Bars Area

Add a **Command Bonus bar** alongside the existing Fuel, Power, Oxygen, Radiation, Heat, and Containment bars:

- **Label**: "Command" or "Leadership"
- **Fill**: Percentage represents the captain's effective bonus on this ship (0% if captain absent, scaled by captain's skill level)
- **Color**: Gold (#fbbf24) when captain is aboard, gray when absent
- **Tooltip**: Detailed breakdown:
  ```
  Captain's Command Bonus
  ────────────────────────
  Commerce:  +47% income     (skill 47)
  Piloting:  +23% evasion    (skill 47)
  Mining:    +12% extraction  (skill 12)

  Fleet Aura: +10% (same location)
  Morale:    85 → +15% training
  Training:  1.5x speed (captain aboard)

  Acting Captain: Commander Reyes
    Would provide: +12% income (25% of skill 48)
  ```
- **When captain is absent**: Bar shows at reduced fill with gray color. Tooltip shows what an acting captain provides and what's being missed.

### Ship Tab — Ship Capabilities Panel (Right Sidebar)

Add a **"Command"** section to the capabilities panel:

```
── Command ──────────────
Captain:    CPT Nakamura ✦
  Commerce: +47% income
  Piloting: +23% evasion
  Mining:   +12% yield
  Training: 1.5x crew speed
  Morale:   Stable (85)
  Negotiate: Available
  Rally:    +5 defense
```

When captain is NOT on this ship:

```
── Command ──────────────
Acting Cpt: Reyes
  Commerce: +12% income (reduced)
  Piloting: —
  Mining:   —
  Training: 1.0x (no bonus)
  Morale:   Drifting (72 ↓)
  Negotiate: Unavailable
  Rally:    —
```

The "—" entries and "Unavailable" labels make it clear what the ship is missing, encouraging the player to think about captain placement.

### Crew Tab — Captain Profile

When viewing the captain's profile, add a **"Command Bonuses"** section below skills:

```
── Command Bonuses ──────
These bonuses apply to the ship you command.

Income:     +47%  (Commerce 47)
Evasion:    +23%  (Piloting 47)
Extraction: +12%  (Mining 12)
Training:   1.5x  (Captain presence)
Rally:      +5    (Leadership)
Negotiate:  ✓     (Captain only)

Fleet Aura: +10% to ships at same location
            +5%  to ships one hop away
```

This section only appears on the captain's profile (not other crew). It reinforces that leveling the captain's skills has fleet-wide value.

### Work Tab — Quest Cards

Quest cards already show payment, fuel cost, crew salary, and profit. Add a **captain bonus line** to the profit breakdown:

```
Payment:        2,450 cr
Fuel cost:       -340 cr
Crew salary:     -144 cr
Captain bonus:   +960 cr  ← gold text
─────────────────────────
Profit:         2,926 cr
```

On ships without the captain:

```
Payment:        2,450 cr
Fuel cost:       -340 cr
Crew salary:     -144 cr
Acting cpt:      +240 cr  ← gray text
(Captain: +960 cr)        ← dimmed hint
─────────────────────────
Profit:         2,206 cr
```

The dimmed "(Captain: +960 cr)" line shows what the player would earn if the captain were on this ship. This is the most powerful UI nudge — it puts a concrete credit value on captain placement every time the player looks at a quest.

### Fleet Tab — Fleet Performance Dashboard

The fleet tab already has a performance dashboard. Add:

- **"Captain Bonus" column** showing total bonus income attributed to the captain's presence per ship
- **"Fleet Aura" indicator** showing which ships are in range of the captain's coordination aura
- **Optimization hint**: If the captain is on a low-earning ship while a higher-earning ship exists, show a subtle hint: "Moving captain to [Leviathan] would increase fleet income by ~2,400 cr/day"

### Nav Tab — Navigation Chart

On the navigation chart, the captain's current ship/location could have a distinct marker (gold border or crown icon) so the player always knows where their captain is relative to the fleet.

### Morale Indicators

Since morale becomes gameplay-relevant:

- **Crew Tab**: Show morale bar on each crew member's profile (already has the field, just needs a visual)
- **Fleet Panel**: Add a morale indicator per ship row — green (80+), yellow (60-79), orange (40-59), red (<40)
- **Tooltip on morale bar**: Explain what's affecting morale (captain presence, pay status, danger level, ship conditions)

### Toast Notifications

Trigger toast notifications for morale events:

- "Crew morale dropping on [Ship Name] — no captain aboard" (when morale crosses below 60)
- "Crew member [Name] deserted from [Ship Name] — low morale" (when desertion occurs)
- "Captain's leadership stabilizing morale on [Ship Name]" (when captain boards a low-morale ship)

---

## Implementation Priority

| Phase | Scope | Effort | Impact |
|-------|-------|--------|--------|
| 1 | Strengthen captain skill multipliers on income/mining/evasion. Acting captain at 25%. | Low | High — creates core incentive |
| 2 | Wire up morale gameplay effects (training speed, combat, desertion). Captain stabilizes morale. | Medium | High — activates unused system |
| 3 | Captain-only encounter outcomes (negotiation gating, rally bonus). | Medium | Medium — makes dangerous routes demand the captain |
| 4 | Fleet coordination aura based on spatial proximity. | Medium | Medium — adds fleet positioning strategy |
| 5 | Training speed multiplier on captain's ship. | Low | Medium — creates crew pipeline pattern |
| UI | Command bar, fleet panel badges, quest card bonus lines, capabilities panel section, morale indicators. | Medium | High — makes all mechanics visible and discoverable |

Phase 1 + UI should be done together — the mechanic is only as good as its visibility.

---

## Design Validation

**Does this follow the "emergent, not hardcoded" principle?**
Yes. No rule forces the captain onto a specific ship. The multiplicative bonus simply makes bigger ships benefit more from the captain's presence. The player discovers this through the UI showing concrete credit differences.

**Does this avoid the Idle Armada anti-pattern?**
Yes. The captain scales with the fleet — as the captain's skills grow, the bonus grows. As the fleet gets better ships, the bonus becomes more valuable. The captain never becomes obsolete.

**Does this create meaningful choice?**
Yes. The player must decide: keep the captain on the safest ship (coordination/training), or put the captain on the most dangerous route (negotiation/rally/maximum income). The captain can't be everywhere.

**Does this reward both active and idle play?**
Yes. Active players optimize captain placement for maximum bonus. Idle players benefit from the training aura and morale stability on whichever ship the captain is parked on. Both playstyles see concrete benefits.
