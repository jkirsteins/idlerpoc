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
