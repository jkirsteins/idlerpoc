# UX Design Guidelines

Design decisions and principles for the game's user experience. This document covers **what to build and why** — for implementation patterns (component architecture, DOM rules, formatting functions), see `CLAUDE.md`.

---

## 1. Core UX Philosophy

### The Idle Contract

Away time is always rewarding, never punishing. Progress accrues while the player is absent. Bad outcomes are capped during absence (e.g. boarding severity reduced to harassment). The catch-up report celebrates what happened — contracts completed, bounties collected — before mentioning losses. Players should never return to find their fleet devastated.

### Information Over Interaction

The game is primarily a **monitoring** experience with occasional **decision points**. The player should be able to glance at the screen and understand fleet state without clicking anything. Controls exist for strategic choices (which contract, where to fly, who to hire), not for moment-to-moment operation. When in doubt, show more information and require fewer clicks.

### Decisions, Not Reflexes

All player actions are strategic. Nothing requires timing or quick reactions. Encounters auto-resolve. Combat outcomes depend on crew skills and equipment, not player dexterity. UI affordances should communicate "consider your options" rather than "act now."

### Emergent Complexity, Surfaced Simply

Game state emerges from interacting systems (per the main guiding principle in CLAUDE.md). The UX corollary: show the emergent result simply, let the player drill into underlying systems if curious. Show ship range as one number; reveal engine thrust, ship mass, fuel capacity, and provisions duration in a tooltip. The default view is the conclusion; the details are always one interaction away.

### Three Engagement Profiles

Per WORLDRULES.md, the game serves three play styles with layered time clocks:

- **Active** (5–8 min sessions): Short routes, contract management, crew optimization.
- **Check-in** (1.5–2.7 hr gaps): Medium routes, check progress, adjust fleet.
- **Set-and-forget** (hours away): Long routes, idle income accumulation.

UI must work for all three. Active players need dense, scannable data. Check-in players need a quick summary of what changed. Set-and-forget players need a catch-up report and simple re-engagement path.

---

## 2. Color System

All colors below are extracted from the existing `src/style.css`. Never introduce new hex values without adding them here. Semantic meaning is fixed — green always means good/safe, red always means danger/loss.

### Backgrounds

| Token | Hex | Usage |
|---|---|---|
| bg-page | `#1a1a2e` | Body background, deepest layer |
| bg-container | `#16213e` | Game container, modals, catch-up report |
| bg-panel | `#0f3460` | Cards, panels, secondary buttons, small buttons |
| bg-input | `rgba(0,0,0,0.3)` | Input backgrounds, persistent info bar, status bar |

### Semantic Colors

| Token | Hex | Meaning | Example usage |
|---|---|---|---|
| brand-red | `#e94560` | Brand, headings, primary button | h1–h3, default `button`, XP bars, active tabs |
| brand-red-hover | `#d63050` | Hover variant | Button hover state |
| accent-blue | `#4a9eff` | Information, navigation, interactive | Dates, links, active tab indicator, time controls |
| accent-blue-hover | `#6db3ff` | Hover variant | Link hover, time control hover |
| positive-teal | `#4ecdc4` | Positive action, confirmation | Accept buttons, Continue, Dock, contract complete |
| positive-teal-hover | `#3db3aa` | Hover variant | Button hover state |
| positive-green | `#4caf50` | Good status, safe, healthy | Status bars (good), CLEAR threat, level-ups |
| warning-yellow | `#ffc107` | Caution, moderate status | Status bars (warning), CAUTION threat |
| warning-orange | `#ffa500` | Cost, moderate risk | Crew salary, caution confirm buttons |
| danger-red | `#ff6b6b` | Loss, danger | Boarding, credits lost, danger confirm buttons |
| critical-red | `#cc0000` | Extreme danger, pulsing | CRITICAL threat, abandon contract, danger-hot buttons |
| destroy-red | `#8b0000` | Destructive actions | Delete save, `.danger` buttons |
| gold | `#ffd700` | Mining, special activity | Mining status in fleet panel |
| purple | `#ce93d8` | Level, rank, experience | Crew level display |

### Text

| Token | Hex | Usage |
|---|---|---|
| text-primary | `#eee` | Body text, data values |
| text-secondary | `#aaa` | Labels, stat bar headers, sidebar text |
| text-muted | `#888` | Hints, timestamps, inactive items, captions |
| text-disabled | `#666` | Disabled controls |

### Status Bar Triad

Used consistently across all status bars (fuel, oxygen, provisions, radiation, heat, containment):

- **Good:** `#4caf50` (green)
- **Warning:** `#ffc107` (yellow)
- **Danger:** `#e94560` (red)

---

## 3. Typography

| Role | Size | Weight | Color | Notes |
|---|---|---|---|---|
| Section heading | 16px+ | bold | `#e94560` | h2, h3 in tab content |
| Sub-heading | 14px | bold | `#4a9eff` | h4, settings sections |
| Body text | 14px | normal | `#eee` | General content |
| Secondary text | 13px | normal/500 | `#eee` | Crew names, stat values |
| Label | 12px | 600 | `#aaa` | Bar headers, form labels |
| Caption | 11px | normal | `#888` | Stat bar compact, small button text |
| Micro | 10px | 600 | `#888` | Mobile header labels |
| Sidebar category | 12px | normal | inherited | Uppercase, `letter-spacing: 0.5px`, `opacity: 0.7` |

System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif`.

---

## 4. Spacing & Sizing

### Standard Gaps

| Token | Value | Typical usage |
|---|---|---|
| xs | 4px | Tight button groups, speed control gaps, compact bar spacing |
| sm | 8px | List items, stat rows, sidebar section inner spacing |
| md | 12px | Equipment items, card internal spacing, sidebar item margin |
| lg | 16px | Section margins, sidebar/panel padding |
| xl | 20px | Grid gap, major section spacing, game header margin |
| xxl | 24px | Game container padding |

### Border Radii

| Value | Usage |
|---|---|
| 4px | Buttons, inputs, progress bars, badges, small cards |
| 6px | Sidebars, log entries, confirm buttons |
| 8px | Game container, major sections, equipment panels |

---

## 5. Information Hierarchy

### The Glance / Scan / Read Model

Design every view with three levels of engagement:

- **Glance** (< 1 second): Fleet panel header, sidebar status bars, mobile header bar. The player sees at a glance: are ships working? Is fuel/money OK? Any alerts? Use color, badges, and bar fill levels to communicate instantly.
- **Scan** (3–5 seconds): Tab content — ship status bars, contract list, crew roster. The player decides: do I need to act on anything? Use clear section headings, status indicators, and sorted/prioritized lists.
- **Read** (10+ seconds): Detailed views — crew skill breakdowns, gamepedia articles, navigation chart with launch windows. The player learns: how do systems work? What are my options? This is where tooltips, detailed tables, and explanatory text live.

### Density Rules

- **Sidebars / fleet panel**: Maximum density. Abbreviated values (`formatLargeNumber`), compact stat bars, minimal labels. Every pixel earns its place.
- **Main tab content**: Moderate density. Full stat bars with headers, formatted values with units (`formatCredits`, `formatDistance`), section headings.
- **Tooltips**: Highest detail. Raw precision values, system breakdowns, formulas explained. Tooltips are opt-in depth.
- **Rates alongside totals**: Always show rate of change next to current value where applicable (e.g. `1,234 cr` with `+50 cr/day`). This helps all three engagement profiles understand trajectory.

---

## 6. Interaction Patterns

### Button Hierarchy

| Level | Class | Background | Use when... |
|---|---|---|---|
| Primary | `button` (default) | `#e94560` brand red | Default action, starting things (Start Game, Create) |
| Positive | `.action-confirm-btn--primary` | `#4ecdc4` teal | Confirming good outcomes (Accept, Continue, Dock, Resume) |
| Secondary | `button.secondary` | `#0f3460` panel blue | Alternative/less important actions (Randomize, Cancel) |
| Caution | `.action-confirm-btn--caution` | `#ffa500` orange | Moderate-risk actions requiring thought |
| Danger | `.action-confirm-btn--danger` | `#ff6b6b` danger red | Risky actions with consequences |
| Danger (hot) | `.action-confirm-btn--danger-hot` | `#cc0000` critical red + pulse | Irreversible or severe actions (Abandon contract) |
| Destructive | `button.danger` | `#8b0000` destroy red | Permanent deletion (Delete save) |
| Inline | `button.small-button` | `#0f3460` panel blue | Inline row actions (Equip, Sell, Unequip) |

**Rule:** Teal is for positive outcomes. Red is for the brand and for danger. Never use brand red (`#e94560`) for destructive actions — that is reserved for headings and the generic primary button.

### Control Selection Guide

- **Button**: One-shot actions (Accept Quest, Dock, Buy Fuel, Launch).
- **Radio card group**: Mutually exclusive choices where the player needs to understand tradeoffs before choosing (encounter action selection).
- **Toggle / checkbox**: Persistent settings (auto-pause on arrival, auto-pause on encounter).
- **Dropdown / select**: Lists of 5+ homogeneous items (ore type picker, destination picker).
- **Tab bar**: Switching between major views. Established pattern with top-level tabs.
- **Sub-tabs**: Switching within a tab (station store crew/ship equipment tabs).
- **Slider**: Continuous value selection (flight profile economy↔speed).

### Touch Targets

All interactive elements must have a minimum effective touch area of **44×44px** on mobile. This applies to the tap target, not necessarily the visible element — use padding to expand the touch area where the visual element is smaller.

---

## 7. Feedback Patterns

### Toasts

- **Purpose**: Informational only. Toasts report what happened, never what to do.
- **Auto-dismiss**: ~5 seconds. Player does not need to interact.
- **Stacking**: Maximum 3–4 visible simultaneously to avoid overwhelm.
- **Fast-forward**: Never show toasts during catch-up processing. Aggregate into the catch-up report instead.
- **Content**: Short narrative line + optional emoji identifier. Example: "Evaded pirate patrol near Meridian."

### Catch-Up Report

The canonical "return from absence" pattern:

- Show only when the absence was long enough for meaningful events to occur.
- **Ship-centric layout**: Each ship appears once with all its activities consolidated.
- **Positive first**: Celebrate progress (contracts completed, bounties collected) before showing losses.
- **Single dismissal**: One "Continue" button. Never force complex interaction on return.
- **Diminished returns note**: For very long absences, show the reduced-rate indicator so players understand the cap.

### Log Entries

- **Narrative voice**: "Long-range sensor contact detected," not "Encounter check passed."
- **Color-coded left borders**: Match severity/type to semantic colors.
- **Ship name prefix**: Identify which ship in multi-ship fleets.
- **Newest first**, auto-prune at 200 entries.

### Status Bars

- **Always visible**: Per the discoverability principle. Show bars even when the system is inactive (at zero, neutral, or N/A state).
- **Three-color semantic**: Green (good) → Yellow (warning) → Red (danger). Thresholds are system-specific but the color language is universal.
- **Two modes**: Full (header label + value text + wide bar) for main content. Compact (thin bar, minimal label) for sidebars and dense panels.

---

## 8. Modal & Dialog Rules

An idle game should almost never interrupt the player.

- **Modals are for transitions, not information.** The catch-up report is a transition (returning from absence). The game creation wizard is a transition. Routine events (encounters, arrivals, payments) use toasts and log entries, never modals.
- **Confirm dialogs only for destructive actions.** Deleting a save, abandoning a contract. Use the radio-card pattern when the destructive choice has nuanced alternatives (e.g. encounter response selection).
- **Auto-pause replaces modals for attention-needed moments.** When a ship arrives at a destination, the game auto-pauses (configurable) so the player can decide what to do next. This is less intrusive than a modal — the game state is visible, and the player resumes when ready.
- **No stacking.** Only one modal/overlay at a time. If a transition happens during another transition, queue it.

---

## 9. Empty, Disabled & Error States

### Empty States

Never show blank areas. When a list or panel has no content, display calm explanatory text that tells the player what would fill it. Use the voice: reassuring, slightly characterful. Example: "All quiet — nothing notable happened" (catch-up report), not "No data available."

### Disabled / Inactive States

Per the discoverability principle: always render the element, but dimmed.

- Visual: `opacity: 0.4`, `cursor: not-allowed` on disabled buttons.
- Include a brief explanation of what would enable it: "Requires Mining Equipment" or "Piloting 25 required."
- Never remove elements from the DOM to hide unavailable features. A dimmed indicator teaches the player that a system exists.

### Error / Warning States

- **Warnings** (recoverable, informational): Orange text (`#ffa500`). Salary costs, fuel running low.
- **Critical alerts** (needs attention): Red text (`#ff6b6b` or `#e94560`), potentially pulsing for immediate danger (stranded ship, oxygen critical).
- **Narrative language always.** Never expose technical errors, stack traces, or system internals to the player. The log should read like a ship's journal, not a debug console.

---

## 10. Idle & Offline Progress UX

- **Catch-up processing**: When the player returns, elapsed time is processed with encounters and income. A diminishing-returns cap prevents extreme absences from being disproportionately rewarding.
- **Severity cap**: Bad outcomes during catch-up are softened (boarding capped to harassment). The idle contract holds.
- **Dual-time display**: Everywhere time appears, show both game time and real time: "2 days (irl 5m)". Use `formatDualTime()`.
- **Rates alongside totals**: Show credits/day next to total credits. Show fuel burn rate alongside current fuel level. This lets check-in players quickly assess trajectory without mental math.
- **Never say "tick"**: Convert all time references to in-game units (days, months, years).

---

## 11. Responsive Behavior

Design decisions per breakpoint (for implementation details, see CLAUDE.md's Responsive Layout section):

### Desktop (> 1200px) — Three Columns

Full experience. Left sidebar for real-time status monitoring, main content for active tab, right sidebar for fleet overview / contextual info. All three independently scrollable. This is the primary design target.

### Tablet (901–1200px) — Two Columns

Right sidebar hidden. Any information exclusive to the right sidebar must be accessible from main content or left sidebar. Layout otherwise unchanged.

### Mobile (≤ 900px) — Single Column

- Sidebars hidden. Left sidebar accessible via hamburger/drawer.
- Mobile header bar provides glance-level stats (credits, fuel, provisions) that would otherwise be in the sidebar.
- Tab bar scrolls horizontally — do not wrap to multiple rows.
- **No hover-dependent information.** Anything critical shown in tooltips on desktop must also be accessible on mobile (e.g. via tap or inline display). Tooltips as supplementary detail are acceptable; tooltips as the only way to see information are not.
- Touch-friendly: larger tap targets, adequate spacing between interactive elements.

### Small Phone (≤ 600px)

Further compaction: smaller toast notifications, tighter spacing, reduced font sizes where needed. Content remains fully functional.

---

## 12. Accessibility Baseline

- **Color is never the sole indicator.** Pair color with text labels. The threat badge pattern (colored badge + text label like "CAUTION") is the model to follow.
- **Visible focus states** on all interactive elements for keyboard navigation.
- **Labels on inputs.** Form inputs (wizard, settings) use proper label elements.
- **Status values available as text.** Status bars show a numeric value alongside the visual fill, not just the bar.
- **Toasts convey meaning through text**, not just icon/color. The narrative message is the primary content.

---

## 13. UI Consistency

### The Consistency Principle

The same data type must look identical everywhere it appears. A credit amount on the sidebar, in a contract card, in a tooltip, and in the catch-up report must use the same format, the same unit suffix, and the same abbreviation rules. If a player sees `1,234 cr` in one place and `1234 CR` in another, they will question whether these are the same currency. Consistency builds trust in the simulation.

All value formatting passes through the centralized functions documented in CLAUDE.md's Value Display Formatting table. This section prescribes how those formatted values compose into the compound display patterns that appear throughout the UI.

### Time & Duration Displays

All time values must show both game time and real-life equivalent using `formatDualTime()`. This applies everywhere a duration or ETA appears: flight ETAs, contract timers, catch-up report elapsed time, cooldowns, training time remaining. The only exception is pure real-time values (e.g. "last saved 2 min ago") which have no game-time equivalent.

Two time-unit vocabularies exist for different contexts:

| Form | Units | Where used | Example |
|---|---|---|---|
| Compact (single-letter) | `s`, `m`, `h`, `d` | Durations, ETAs, parenthetical supplements — anywhere `formatDuration` or `formatDualTime` output appears | `2d 4h (irl 3m)`, `(18d)` |
| Word | `/day`, `/hr` | Rate denominators — the "per" unit after a formatted value | `1,234 cr/day`, `6.0 O2/hr` |

These two forms serve different purposes and must not be mixed: never write `cr/d` (use `cr/day`) and never write `2 days 4 hours` for a duration (use `2d 4h`). The compact form is for scannability in space-constrained displays; the word form is for readability in rate expressions.

### Rate Displays

Rates express change over time. Every rate follows the pattern `{formatted value}/{time unit}`.

| Rule | Pattern | Example |
|---|---|---|
| Credits per time | `formatCredits(n)/day` | `+1,234 cr/day` |
| Credits per time (comparison) | `formatCredits(n)/hr` | `~85 cr/hr` |
| Resource per time | `{value} {unit}/{time}` | `6.0 O2/hr`, `-0.8 HP/day` |
| Approximate rates | Prefix with `~` | `~85 cr/hr` |

**Time unit choice by context:**

| Display context | Time unit | Rationale |
|---|---|---|
| Sidebar ledger (income, expenses, net) | `/day` | Long-running rates for passive monitoring |
| Fleet tab financial overview | `/day` | Same data as sidebar, consistent |
| Header bar net income | `/day` | Matches sidebar |
| Crew salary (crew tab, hire panel) | `/day` | Salary is a daily operating cost |
| Contract/route profitability | `/hr` | Enables apples-to-apples comparison across different trip durations |
| Mining route profitability | `/hr` | Same rationale as contracts |
| Oxygen generation/consumption | `/hr` | O2 changes rapidly enough that per-hour is meaningful |
| HP damage rates | `/day` | Health changes slowly; per-day is the natural unit |
| Fleet performance summary | `/day` | Matches ledger context |

Within any single view, all comparable rates must use the same time unit so the player can compare without mental conversion.

**No bare numbers in rates.** A rate must always pass through the appropriate formatter. `1234 cr/day` (no comma) is wrong; `1,234 cr/day` (via `formatCredits`) is correct.

### Fraction & Capacity Displays

Fractions show current vs. maximum of a countable or measurable resource. Two patterns exist, chosen by context:

| Context | Pattern | Example |
|---|---|---|
| Compact / numeric gauges | `{current}/{max}` (no spaces) | `3/5`, `42/100 kW` |
| Prose / sequential progress | `{current} of {max}` | `Step 1 of 3`, `2 of 5 crew` |

**Rules:**

- **Unit appears once after max**, not on both sides. Write `45,000 / 100,000 kg`, not `45,000 kg / 100,000 kg`. Exception: when current and max are both passed through a formatter that includes the unit (e.g. `formatFuelMass`), each carries its own unit because the formatter produces it.
- **Slash form** (`/`) is for numeric resource gauges where the player is scanning quantities: power draw, equipment slots, crew count, fuel.
- **"of" form** is for sequential progress or natural-language contexts: wizard steps, trip legs.
- **Parenthetical supplement** for resources with a secondary dimension: provisions show mass with survival days as a supplement — `900 kg (18d)`. The supplement is always in parentheses after the primary value.

### Percentage Precision

| Context | Precision | Example | Rationale |
|---|---|---|---|
| Status bars, progress, margins | `.toFixed(0)%` | `75%` | Whole-number precision is sufficient for at-a-glance monitoring |
| Fuel percentage | `.toFixed(0)%` | `75%` | Matches status bar convention |
| Slow-draining resources (oxygen, degradation) | `.toFixed(1)%` | `92.3%` | Fractional changes matter for resources where the player watches trends |
| Mastery pool progress | `.toFixed(1)%` | `14.2%` | Fine-grained progress feedback for long-term goals |

**Rule of thumb:** Use one decimal place when the percentage changes slowly (less than 1% per real minute) and the player benefits from seeing small movements. Use whole numbers when the value moves quickly or when the player only needs the general level.

### Empty State Vocabulary

Each empty-state token communicates something different. Use the right one for the situation.

| Token | Meaning | When to use | Example context |
|---|---|---|---|
| `0` or `0%` | The value exists but is currently zero | Numeric fields with a real zero state | `0/5 crew`, `0 cr`, `0%` fuel |
| `N/A` | The value does not apply to this entity | A system or metric that is structurally irrelevant (e.g. radiation on a non-fusion engine, containment on a docked vessel) | Radiation bar: `N/A` |
| `None` | A slot or role that could be filled but is not | An entity is expected but absent | Captain: `None`, Power source: `None` |
| `—` (em-dash) | A value that cannot be computed or is not yet available | Data requiring prerequisites or elapsed time | Reward: `—` |
| Sentence | Reassuring explanation of what would fill an empty area | Empty lists, empty panels, first-time states (per Section 9 guidance) | `Cargo hold is empty`, `All quiet — nothing notable happened` |

**Never use `(empty)` as a standalone token** — it is ambiguous and reads as a debug label. For an empty equipment slot, use `None`. For an empty list, use a sentence.

### Sign & Delta Conventions

Changes and differences carry explicit signs and semantic color.

| Direction | Prefix | Color | Example |
|---|---|---|---|
| Gain / positive rate | `+` | `#4caf50` positive-green | `+1,234 cr/day` |
| Loss / negative rate | `-` (natural from number) | `#ff6b6b` danger-red | `-85 cr/day` |
| Expense (always negative) | `-` | `#ffa500` warning-orange | `-500 cr/day` |
| Net (positive) | `+` | `#4caf50` positive-green | `+750 cr/day` |
| Net (negative) | `-` | `#ff6b6b` danger-red | `-200 cr/day` |
| Neutral / informational delta | `+` or `-` | `#aaa` text-secondary | `+5 defense` |

**Rules:**

- Positive values always get an explicit `+` sign. Negative values rely on the minus sign from the number itself.
- Income lines are always `+` green. Expense lines are always `-` orange. Net lines are green or red depending on sign.
- The sign is part of the formatted string, not a separate element. Write `+${formatCredits(n)}/day`, not `+ ${formatCredits(n)}/day` (no space between sign and value).

### Label: Value Pairs

Stat displays pair a label with a value. Three prescribed approaches serve three density contexts:

| Context | Approach | Example |
|---|---|---|
| **Tooltips** | CSS classes: `custom-tooltip-label` (label) + `custom-tooltip-value` (value) | `<span class="custom-tooltip-label">Thrust:</span> <span class="custom-tooltip-value">45 kN</span>` |
| **Dashboard / sidebar stats** | Muted-color label span + value span | `<span style="color: #888;">Max Range:</span> <span>45K km</span>` |
| **Dialogs / panels** | Bold label, normal-weight value | `<strong>Current Fuel:</strong> 45,000 kg` |

**Do not mix approaches within the same visual context.** A tooltip should never use `<strong>` for labels. A sidebar stat should never use tooltip CSS classes. The three approaches serve three density levels (tooltip detail, dashboard scanning, dialog reading) and must not cross.
