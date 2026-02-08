# Main guiding principle

The game is composed of many interacting systems, and the game state should be emergent from the behavior of those systems. Nothing should be hardcoded.

E.g. space ship range is derived from engines generating thrust, consuming fuel, mass on the ships the engines are powered etc. Space ship range would NOT be acceptable to hardcode on a ship as a single numeric value.

Similarly, all game updates need to happen in some central "update tick" method. All systems need to be updated with every tick.

# UI Component Architecture

UI components follow a **mount-once / update-on-tick** pattern (see `src/ui/component.ts`):

- **Factory functions** are named `createXxx(initialState, callbacks)` and return a `Component` with `{ el, update }`.
- `el` is the stable container element — it is created once and stays in the DOM across ticks. **Never** replace it or clear a parent's `innerHTML`; doing so resets scroll position, focus, and mobile touch state.
- `update(gameData)` rebuilds inner content via `el.replaceChildren()`. Callbacks are captured in the closure; only changing data goes through `update()`.
- Parents hold references to child `Component` instances and call `update()` on each tick instead of recreating children.
- `renderer.ts` is the top-level orchestrator. During the `playing` phase it mounts once and patches in-place on subsequent ticks. Full DOM rebuilds only happen on phase transitions (no_game ↔ creating ↔ playing) or structural changes (catch-up report modal).
- Leaf helpers (statBar, tooltip, threatBadge) and transient UI (toasts, catch-up modal, wizard) may remain as plain `render*()` functions returning `HTMLElement` since they are not persisted across ticks.

# Additional rules

- Consult README for project scope before starting work.
- Always consider WORLDRULES.md for our game world constraints. Apply these to any game design decisions.
- Update README to reflect project goals/scope before commits.
- README: high-level only. Infer architecture from code; detailed docs go in docs/.
- Commit messages: concise, no "Claude Code" mentions.
- Never implement any migration code unless asked. For a proof of concept we should just reset the game state when making incompatible changes.
- "tick" is a implementation term, and should not appear in the game UI ever. Instead of "tick" convert it to terms like days, months, years, etc.
- When providing time values in the game UI, always provide in-game value and real-life value. E.g. "2 days (irl 5 min)" formatting. Use shared components for displaying time so it can be changed later easily.
- Maintain BACKLOG.md: add deferred ideas during design discussions, remove items when implemented.
