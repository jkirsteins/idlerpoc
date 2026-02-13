# Main guiding principle

The game is composed of many interacting systems, and the game state should be emergent from the behavior of those systems. Nothing should be hardcoded.

E.g. space ship range is derived from engines generating thrust, consuming fuel, mass on the ships the engines are powered etc. Space ship range would NOT be acceptable to hardcode on a ship as a single numeric value.

Similarly, all game updates need to happen in some central "update tick" method. All systems need to be updated with every tick.

# UI Component Architecture

UI components follow a **mount-once / update-on-tick** pattern (see `src/ui/component.ts`):

- **Factory functions** are named `createXxx(initialState, callbacks)` and return a `Component` with `{ el, update }`.
- `el` is the stable container element — it is created once and stays in the DOM across ticks. **Never** replace it or clear a parent's `innerHTML`; doing so resets scroll position, focus, and mobile touch state.
- `update(gameData)` snapshots the props the component renders into a plain object and **shallow-compares** each field against the previous snapshot. If nothing changed, the update is skipped entirely — no DOM work. Only when props differ does the component patch the DOM in-place. This prevents unnecessary DOM destruction (e.g. open dropdowns, focused inputs).
- **Never use `replaceChildren()`.** It destroys and recreates the entire subtree, which breaks scroll position, focus, mobile touch state, and has caused iOS crashes. Instead, use idiomatic in-place update patterns:
  - Update `textContent` / `innerText` on existing elements for text changes.
  - Toggle classes (`classList.add/remove/toggle`) for visual state changes.
  - Show/hide with `style.display` for conditional visibility.
  - Keep stable references to child elements created in the factory and mutate them directly on each tick.
  - For lists that change length, add/remove individual items at the end rather than clearing and rebuilding.
- Parents hold references to child `Component` instances and call `update()` on each tick instead of recreating children.
- `renderer.ts` is the top-level orchestrator. During the `playing` phase it mounts once and patches in-place on subsequent ticks. Full DOM rebuilds only happen on phase transitions (no_game ↔ creating ↔ playing) or structural changes (catch-up report modal).
- Leaf helpers (statBar, tooltip, threatBadge) and transient UI (toasts, catch-up modal, wizard) may remain as plain `render*()` functions returning `HTMLElement` since they are not persisted across ticks.

# Responsive Layout & Overflow

The game uses a **3-column grid** (left sidebar | main content | right sidebar). All three columns must be independently scrollable:

- **Sidebars** and **`.main-content`** share `max-height: calc(100vh - 100px); overflow-y: auto;` so each column scrolls within its own container rather than pushing the whole page.
- On **mobile** (≤ 900px) sidebars are hidden and the grid collapses to a single column — `max-height` is removed from `.main-content` so the page scrolls naturally.
- On **tablet** (≤ 1200px) the right sidebar is hidden and the grid becomes 2-column.

When creating new tab views or adding content to existing tabs:

- **Never assume the parent will scroll for you.** Each view must work within the constrained main-content height. For tall content, add `overflow-y: auto` with a `max-height` on the inner panel.
- **Add `min-width: 0`** to any flex/grid child that could overflow horizontally (prevents grid blowout).
- **Test at all three breakpoints** (desktop >1200px, tablet ≤1200px, mobile ≤900px) to verify no content overflows its container.
- **Never set a fixed pixel height** on scrollable containers — always use viewport-relative units (`calc(100vh - ...)`) so the layout adapts to screen size.

# UI Discoverability

**Always show UI indicators, never conditionally hide them.** Every game system that has a UI indicator (status bars, gauges, panels) must be rendered at all times, even when the system is inactive or the current ship/equipment doesn't engage with it. Hidden controls hide the existence of features from players. Showing an indicator in a "neutral" or "N/A" state encourages players to explore how to interact with systems they haven't encountered yet. Use disabled/dimmed/zero states instead of removing elements from the DOM.

# Value Display Formatting

**Never format numbers inline.** All player-visible values must use the centralized functions below so that format changes happen in one place.

| Value type      | Function                             | Module                     | Example output      |
| --------------- | ------------------------------------ | -------------------------- | ------------------- |
| Credits         | `formatCredits(n)`                   | `src/formatting.ts`        | `1,234 cr`          |
| Distance        | `formatDistance(km)`                 | `src/formatting.ts`        | `45K km`, `1.5M km` |
| Large number    | `formatLargeNumber(n)`               | `src/formatting.ts`        | `45K`, `1.5M`       |
| Range label     | `getRangeLabel(km)`                  | `src/formatting.ts`        | `GEO/Cislunar`      |
| Mass (general)  | `formatMass(kg)`                     | `src/formatting.ts`        | `12,500 kg`         |
| Fuel mass       | `formatFuelMass(kg)`                 | `src/ui/fuelFormatting.ts` | `12,500 kg`         |
| Fuel % (number) | `calculateFuelPercentage(fuel, max)` | `src/ui/fuelFormatting.ts` | `75.5`              |
| Fuel colour     | `getFuelColorHex(pct)`               | `src/ui/fuelFormatting.ts` | `#4caf50`           |
| Time (dual)     | `formatDualTime(gameSec)`            | `src/timeSystem.ts`        | `2 days (irl 5m)`   |
| Game date       | `formatGameDate(gameTime)`           | `src/timeSystem.ts`        | `Day 42`            |
| Provisions mass | `formatMass(kg)`                     | `src/formatting.ts`        | `900 kg`            |
| Provisions days | `getProvisionsSurvivalDays(ship)`    | `src/provisionsSystem.ts`  | `166`               |

- For rates like `cr/day`, append the rate suffix after `formatCredits()`: `` `${formatCredits(x)}/day` ``.
- Tooltips showing raw precision (e.g. `maxRangeKm.toLocaleString() + ' km'`) are acceptable since they supplement the formatted display value.
- `formatFuelMass` delegates to `formatMass`; use whichever reads clearer in context.

# Event Logging & Catch-Up Report

Every gameplay mechanic that produces observable events must create log entries via `addLog()` in `src/logSystem.ts`. Log entries are the primary record of what happened during offline periods.

When adding a new mechanic or event type:

- Add a new `LogEntryType` variant in `src/models/index.ts`
- Create log entries with `addLog()` including `shipName` when applicable
- **Update the catch-up report builder** (`src/catchUpReportBuilder.ts`) to scan for and summarize the new event type — otherwise it will be invisible in the "While you were away..." modal
- **Update the catch-up report renderer** (`src/ui/catchUpReport.ts`) to display the summary
- Consider aggregation: for events that can occur many times per ship during an absence, aggregate into counts/totals rather than listing individually
- Include actor attribution (crew member name) in log messages when a specific crew member's skill determined the outcome

# Additional rules

- Consult README for project scope before starting work. See if any other markdown files (\*.md pattern, in root and in docs/ folder) might be relevant. If so, read them.
- Always consider WORLDRULES.md for our game world constraints. Apply these to any game design decisions.
- Consult `docs/ux-guidelines.md` for UX design principles (color palette, interaction patterns, idle game UX, information hierarchy). Implementation patterns stay in CLAUDE.md; design decisions live there.
- Update README to reflect project goals/scope before commits.
- README: high-level only. Infer architecture from code; detailed docs go in docs/.
- Commit messages: concise, no "Claude Code" mentions.
- **Save data must never be lost or corrupted.** Existing saves must migrate gracefully to new formats. See `docs/save-migration.md` for the versioned migration architecture. Every change that alters the persisted `GameData` shape must include a migration function in `storage.ts` and bump `CURRENT_SAVE_VERSION`. Additive optional fields can still use simple backfill defaults without a version bump.
- "tick" is a implementation term, and should not appear in the game UI ever. Instead of "tick" convert it to terms like days, months, years, etc.
- When providing time values in the game UI, always provide in-game value and real-life value. E.g. "2 days (irl 5 min)" formatting. Use shared components for displaying time so it can be changed later easily.
- Maintain BACKLOG.md: add deferred ideas during design discussions, remove items when implemented.
- **Gamepedia maintenance**: When implementing or changing a game mechanic, update the corresponding Gamepedia article(s) in `src/gamepediaData.ts` to reflect the change. If the mechanic is new, add a new article. When a mechanic is removed or significantly changed, update or remove stale information from affected articles to prevent misleading players. Ensure `relatedArticles` links are set so players can discover connected topics. Use inline cross-reference links (`[[article-id|display text]]` syntax) in paragraph text and table cells to connect related concepts — e.g. skill names should link to skill articles, equipment names should link to equipment articles. The Gamepedia is the player-facing explanation of how the game works — it must stay accurate. **Gamepedia articles cover game concepts and mechanics, not individual UI components.** Articles may mention which tab or page shows relevant data, but should not document specific widgets, panels, or layout details.
- Never suppress linter or type-checker errors (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`). Always cleanly resolve the underlying issue instead.
