# Encounter System UX Design

**Prepared by:** UX Designer
**For:** Phase B Implementation Team
**Status:** Implemented — encounter UI integrated into Ship, Nav, Work, and Log tabs

---

## Design Principles

1. **Non-intrusive**: Encounters happen passively. This is an idle/incremental game — the player should never need to respond in real-time.
2. **Narrative-driven**: Show evocative text, not raw numbers. "Lawless region" not "17.3% probability."
3. **System-consistent**: Use existing UI patterns (progress bars, quest cards, log entries, badges). No new visual paradigms.
4. **Emergent clarity**: Help players understand _why_ encounters happen (heat signature, crew skill, position) so they can make better fleet decisions.
5. **Days not ticks**: All time references use in-game days per CLAUDE.md guidelines.

---

## 1. Route Risk Display (Threat Level)

### 1.1 Threat Level Badge

A small colored badge shown wherever route information appears. Four levels:

| Risk Band       | Label      | CSS Color                                | Narrative                |
| --------------- | ---------- | ---------------------------------------- | ------------------------ |
| < 5% cumulative | `CLEAR`    | `#4caf50` (existing bar-good green)      | "Patrolled space"        |
| 5–15%           | `CAUTION`  | `#ffc107` (existing bar-warning yellow)  | "Contested territory"    |
| 15–30%          | `DANGER`   | `#e94560` (existing primary red)         | "Lawless region"         |
| > 30%           | `CRITICAL` | `#ff6b6b` (existing danger red, pulsing) | "Pirate hunting grounds" |

**Badge HTML structure:**

```
div.threat-badge.threat-{level}
  span.threat-label   → "CAUTION"
  span.threat-narrative → "Contested territory"
```

**CSS pattern:** Follows the existing `.paused-badge` pattern — inline text badge with colored background. CRITICAL level gets a subtle CSS pulse animation (reuse existing `@keyframes pulse` from navigation markers).

### 1.2 Where Threat Badges Appear

| Location                                    | Details                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Quest cards** (workTab)                   | Below the "Time" line, above "Crew Salaries". Shows route risk for the quest destination.                    |
| **Navigation view legend** (navigationView) | Below the distance line for each location. Shows risk from current position to that destination.             |
| **Flight status** (workTab active contract) | Below the route line. Shows current regional risk level based on ship's live position. Updates every render. |
| **Ship header status bar** (tabbedView)     | When in flight, append risk level to "In flight to [Dest]" → "In flight to Mars — CAUTION".                  |

---

## 2. Navigation View Enhancements

### 2.1 Route Danger Coloring

In the navigation map, location markers already have color states (current=pulsing, unreachable=dimmed). Add danger-based coloring to reachable destinations:

- **CLEAR destinations**: Default marker appearance (no change)
- **CAUTION destinations**: Yellow tinted dot border (`#ffc107`)
- **DANGER destinations**: Red tinted dot border (`#e94560`)
- **CRITICAL destinations**: Red pulsing dot border (`#ff6b6b`)

This uses the existing `.nav-marker-dot` element — add a `data-threat` attribute and style via CSS:

```css
.nav-marker-dot[data-threat='caution'] {
  border-color: #ffc107;
}
.nav-marker-dot[data-threat='danger'] {
  border-color: #e94560;
}
.nav-marker-dot[data-threat='critical'] {
  border-color: #ff6b6b;
  animation: pulse 2s infinite;
}
```

### 2.2 Fleet Ship Positions (Phase B2)

When multiple ships are in flight, show their approximate positions on the map as small ship icons. This supports convoy visualization.

- Use a small `▲` marker (similar to nav-marker but smaller, different color `#4a9eff`)
- Position interpolated from ship's 1D flight progress mapped to the 2D map line between origin and destination markers
- Tooltip: "[Ship Name] — In flight to [Dest]"

### 2.3 Convoy Protection Indicator (Phase B2)

In the navigation legend, for in-flight ships, show:

```
"Convoy: 2 nearby ships (42% risk reduction)"
```

Styled with green text (`#4caf50`) when protection is active, gray when solo.

---

## 3. Quest Card Encounter Info

### 3.1 Threat Badge on Quest Cards

Add a threat level badge to each quest card, positioned after the time/fuel estimates and before the crew salary line.

**Rendering order in quest card details section:**

1. Destination
2. Distance
3. Cargo (if applicable)
4. Trips
5. Fuel per trip
6. Time per trip
7. **Route Risk: [THREAT BADGE]** ← NEW
8. Crew Salaries per trip

### 3.2 Ship Readiness Summary (Phase B2)

Below the threat badge, optionally show a one-line readiness summary:

```
"Defense: Point defense online, 1 gunner stationed"
```

or warning:

```
"Defense: No point defense equipped"  (in orange #ffa500)
```

This only shows when the route risk is CAUTION or higher, to avoid information overload on safe routes.

---

## 4. Ship Tab During Flight

### 4.1 Regional Status Line

When a ship is in flight, add a status line to the ship header area (below the "In flight to [Dest]" text in the global status bar):

```
"Crossing contested territory"  (yellow text)
```

or

```
"Patrolled space"  (green text)
```

This uses the threat narrative text, colored by threat level. It replaces raw position data with a qualitative sense of danger.

### 4.2 Last Encounter Indicator

If the ship has had a recent encounter (within the last 500-tick cooldown window), show a small fading indicator near the ship name:

```
"⚔️ Encounter 2 days ago"  (dimmed text, fades over time)
```

This gives the player a sense of recent activity without being obtrusive.

---

## 5. Encounter Log Entries

### 5.1 New Log Entry Types

Add these encounter-specific log entry types:

| Type                   | Left Border Color  | Description                  |
| ---------------------- | ------------------ | ---------------------------- |
| `encounter_evaded`     | `#4caf50` (green)  | Successfully avoided contact |
| `encounter_negotiated` | `#ffc107` (yellow) | Paid ransom, avoided combat  |
| `encounter_victory`    | `#4ecdc4` (cyan)   | Won combat, earned bounty    |
| `encounter_harassment` | `#ffa500` (orange) | Minor damage sustained       |
| `encounter_boarding`   | `#ff6b6b` (red)    | Boarded, significant losses  |

### 5.2 Narrative Log Messages

All encounter log entries use the ship name prefix (existing pattern: `[ShipName] message`).

**Evasion messages** (vary randomly for flavor):

- "Long-range sensor contact detected. Navigator plotted evasive course — contact lost."
- "Unidentified drive signature on intercept vector. High velocity — they couldn't match our course."
- "Scanner picked up hostile transponders. Evasive maneuvers successful."

**Negotiation messages:**

- "[CrewName] negotiated safe passage for [X] credits."
- "Pirate hail received. Tribute of [X] credits secured safe passage."

**Victory messages:**

- "Pirate raider engaged. Point defense repelled the attack. Bounty: [X] credits."
- "Hostile vessel intercepted. Crew repelled boarding attempt. Bounty collected: [X] credits."

**Harassment messages:**

- "Pirate skirmish in contested space. Minor hull damage sustained."
- "Raider made a pass. Point defense scored hits but took damage. Ship continues."

**Boarding messages:**

- "Ship boarded by pirates. [X] credits seized, crew injuries reported."
- "Hull breach during pirate boarding. Equipment damaged, [X] credits stolen."

### 5.3 Log Entry Details

For non-evasion encounters, the log message includes a brief impact summary on a second line (using `\n` or a sub-element):

```
[Wayfarer] Pirate skirmish in contested space.
  Equipment wear +5%, crew health -8, flight delayed ~2 days
```

This gives the player actionable information without needing to check multiple tabs.

---

## 6. Fast-Forward & Catch-Up UX

### 6.1 Severity Cap During Fast-Forward

During fast-forward ticks (page load catch-up via `fastForwardTicks()`), encounter outcomes are capped at **harassment** severity. No boarding events occur while the player is away.

**Rationale:** Players should never return to find their fleet devastated. The idle game contract is: "things happen while you're away, but nothing catastrophic."

### 6.2 Catch-Up Report Modal

After fast-forward completes with encounters, display a summary modal before the game renders normally. This uses the existing conditional rendering pattern (like `showNavigation` toggling the ship tab content).

**State addition:** `showCatchUpReport: boolean` in GameState.

**Modal structure:**

```
div.catchup-report
  div.catchup-header
    h3 → "While you were away..."
    span.catchup-duration → "14 days elapsed"

  div.catchup-fleet-summary
    For each ship with encounters:
      div.catchup-ship
        div.catchup-ship-name → "[ShipName]"
        div.catchup-ship-events
          "Evaded 2 contacts"       (green text)
          "Repelled 1 raider"       (cyan text)
          "1 skirmish (minor damage)" (orange text)

  div.catchup-impact
    div → "Credits: +150 (bounties) / -80 (ransoms) = +70 net"
    div → "Equipment wear: +12% average across fleet"
    div → "Crew health: -15 average"

  button.catchup-dismiss → "Continue"
```

**Visual style:**

- Background: `#16213e` (existing dark navy) with `#0f3460` border
- Full-width, replaces tab content (like navigation view pattern)
- "Continue" button uses cyan `#4ecdc4` (positive action color)
- If no encounters occurred during catch-up, skip the modal entirely

### 6.3 Implementation Notes

The catch-up report requires the fast-forward loop to accumulate encounter events rather than just applying them. Pass a `catchUpReport` accumulator object into `applyTick()` during fast-forward:

```typescript
interface CatchUpReport {
  totalTicks: number;
  encounters: {
    shipId: string;
    shipName: string;
    evaded: number;
    negotiated: number;
    victories: number;
    harassment: number;
    // no boarding (capped)
    creditsDelta: number;
    healthDelta: number;
  }[];
}
```

---

## 7. Information Architecture: Three Categories

Encounter info is organized into three categories wherever detailed information is shown (expanded quest cards, navigation legend, future ship readiness panel):

### 7.1 Route Risk

- Threat level badge (CLEAR/CAUTION/DANGER/CRITICAL)
- Narrative description
- Shown everywhere route info appears

### 7.2 Ship Readiness (summary only)

- Point defense status (equipped/degraded/missing)
- Armory staffing (gunner count)
- Deflector shield (equipped/missing)
- Nav scanner (equipped/missing)
- Shown as a single condensed line: "Defense: PD online (82%), 1 gunner, shield active"
- Warning variant for missing equipment: "Defense: No point defense!" (orange/red)

### 7.3 Crew Competence (summary only)

- Best navigator skill (evasion capability)
- Best gunner skill (combat capability)
- Best charisma skill (negotiation capability)
- Shown as: "Crew: Nav 7 / Gun 4 / Cha 5"
- Compact format to avoid information overload

**Where shown:**

- Quest cards: Only Route Risk (7.1) by default. Readiness/Crew shown only for CAUTION+ routes.
- Navigation legend: Route Risk always. Readiness/Crew on hover or when route selected.
- Ship tab during flight: All three, since the player is actively monitoring.

---

## 8. Convoy Protection Display (Phase B2)

### 8.1 In Navigation View

When viewing a potential destination, if other ships are currently in flight on overlapping routes:

```
"Fleet convoy: 2 ships on similar route (42% risk reduction)"
```

Green text, with a small fleet icon.

### 8.2 In Flight Status

During active flight, if convoy protection is active:

Add to the flight status section (workTab active contract):

```
"Convoy protection: 2 nearby ships — 42% encounter reduction"
```

If solo:

```
"Convoy: Solo — no fleet protection"  (dimmed gray text)
```

---

## 9. CSS Integration Plan

All new styles follow existing conventions in `style.css`:

### New CSS Classes

```css
/* Threat badges */
.threat-badge { ... }
.threat-badge.threat-clear { ... }
.threat-badge.threat-caution { ... }
.threat-badge.threat-danger { ... }
.threat-badge.threat-critical { ... }
.threat-label { ... }
.threat-narrative { ... }

/* Encounter log entries (follow existing log-entry-{type} pattern) */
.log-entry-encounter_evaded { border-left-color: #4caf50; }
.log-entry-encounter_negotiated { border-left-color: #ffc107; }
.log-entry-encounter_victory { border-left-color: #4ecdc4; }
.log-entry-encounter_harassment { border-left-color: #ffa500; }
.log-entry-encounter_boarding { border-left-color: #ff6b6b; }

/* Catch-up report */
.catchup-report { ... }
.catchup-header { ... }
.catchup-fleet-summary { ... }
.catchup-ship { ... }
.catchup-impact { ... }
.catchup-dismiss { ... }

/* Navigation threat coloring */
.nav-marker-dot[data-threat="caution"] { ... }
.nav-marker-dot[data-threat="danger"] { ... }
.nav-marker-dot[data-threat="critical"] { ... }

/* Ship readiness summary */
.readiness-summary { ... }
.readiness-warning { ... }

/* Regional status during flight */
.regional-status { ... }
```

### Color Reuse

No new colors are introduced. Every color maps to an existing convention:

- Green `#4caf50` → bar-good, success
- Yellow `#ffc107` → bar-warning, caution
- Red `#e94560` → primary red, danger
- Bright red `#ff6b6b` → critical, boarding
- Cyan `#4ecdc4` → positive actions, victories
- Orange `#ffa500` → crew costs, harassment
- Blue `#4a9eff` → ship names, fleet markers

---

## 10. Implementation Priority

### Phase B1 (Core — implement first)

1. Threat level badge component (reusable across views)
2. Quest card threat badge integration
3. Navigation view threat badges + marker coloring
4. Ship header regional status line during flight
5. Encounter log entry types + narrative messages
6. Fast-forward severity cap
7. Catch-up report modal

### Phase B2 (Fleet features)

8. Fleet ship positions on navigation map
9. Convoy protection indicators
10. Ship readiness summary on quest cards
11. Convoy display during flight

### Phase B3 (Polish)

12. Encounter heat map visualization
13. Crew competence display
14. Log entry detail expansion (click-to-expand)

---

## 11. Interaction Flow Examples

### Example 1: Player Accepts a Dangerous Contract

1. Player is docked at Earth, opens Work tab
2. Sees quest: "Freight Delivery to Freeport Station"
3. Quest card shows: `Route Risk: DANGER — Lawless region` (red badge)
4. Below badge: `Defense: No point defense!` (orange warning)
5. Player decides to buy equipment first, switches to crew tab
6. Returns, accepts quest
7. Ship header shows: "In flight to Freeport Station — DANGER"
8. Ship tab shows: "Crossing lawless region" in red
9. Mid-flight, encounter triggers → log entry appears: "[Wayfarer] Pirate raider engaged. Point defense repelled the attack. Bounty: 250 credits."
10. Flight continues

### Example 2: Player Returns After Being Away

1. Player was away 8 hours (≈480 ticks, capped at 1000)
2. Page loads, fast-forward runs
3. During fast-forward, 3 encounters occur across 2 ships (boarding capped to harassment)
4. Catch-up modal shows:
   - "While you were away... 10 days elapsed"
   - Wayfarer: "Evaded 1 contact, 1 skirmish (minor damage)"
   - Corsair: "Repelled 1 raider (+150 credits bounty)"
   - Net impact: "+150 credits, -8 avg crew health, +5% equipment wear"
5. Player clicks "Continue", sees normal game state
6. Detailed entries in Log tab for each encounter

### Example 3: Player Plans a Convoy (Phase B2)

1. Player has 3 ships docked at Earth
2. Opens Navigation on Ship 1, sees "Mars — CAUTION"
3. Starts trip to Mars with Ship 1
4. Switches to Ship 2, opens Navigation
5. Sees "Mars — CAUTION" but also: "Fleet convoy: 1 ship on similar route (29% risk reduction)"
6. Starts Ship 2 on same route
7. Switches to Ship 3, sees "Fleet convoy: 2 ships (42% risk reduction)"
8. During flight, all three ships show convoy protection in flight status

---

**End of UX Design Document**
