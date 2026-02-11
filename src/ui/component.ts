import type { GameData } from '../models';

/**
 * A UI component whose container element stays in the DOM across tick
 * updates.  Parents hold a reference to the component and call
 * `update()` instead of recreating the element, preserving browser
 * scroll position and focus state.
 *
 * Convention:
 *   - Factory is named `createXxx(initialState, callbacks)`.
 *   - Callbacks are captured in the closure; only changing state is
 *     passed to `update()`.
 *   - `update()` snapshots the rendered props and shallow-compares
 *     against the previous snapshot.  If nothing changed, the
 *     update is skipped entirely — no DOM work.  Only when props
 *     differ does the component patch the DOM in-place.
 *   - **Never use `replaceChildren()`.**  It destroys the entire
 *     subtree which resets scroll position, focus, and touch state.
 *     Instead, mutate existing elements (textContent, classList,
 *     style.display) and keep stable child references.
 *   - For variable-length lists, use a `Map<id, refs>` to reconcile:
 *     add new items, remove departed, update existing in-place.
 *   - For leaf helpers (statBar, tooltip), use slot divs: remove old
 *     child and append new one instead of replaceChildren().
 *   - The container element itself is never replaced.
 */
export interface Component {
  readonly el: HTMLElement;
  update(gameData: GameData): void;
}
