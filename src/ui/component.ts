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
 *   - When a component still uses a legacy rebuild pattern internally,
 *     wrap it with `guardRebuild()` so that rebuilds are deferred
 *     while the user is interacting with a focused input/select.
 *   - The container element itself is never replaced.
 */
export interface Component {
  readonly el: HTMLElement;
  update(gameData: GameData): void;
}

/**
 * Returns true when `container` (or a descendant) holds focus on an
 * interactive element — an open `<select>`, a focused `<input>`, or a
 * `<textarea>`.  Used to defer DOM rebuilds so that dropdowns and
 * text fields are not destroyed while the user interacts with them.
 */
export function hasActiveInteraction(container: HTMLElement): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return (
    container.contains(active) &&
    (active instanceof HTMLSelectElement ||
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement)
  );
}

/**
 * Wraps a rebuild function so that it is deferred while an interactive
 * element inside `container` has focus.  When the user blurs out, the
 * deferred rebuild fires automatically with the latest gameData.
 *
 * Usage inside a `createXxx` factory:
 * ```
 *   const { guardedRebuild } = guardRebuild(container, rebuild);
 *   // then use guardedRebuild(gameData) instead of rebuild(gameData)
 * ```
 */
export function guardRebuild(
  container: HTMLElement,
  rebuild: (gameData: GameData) => void
): { guardedRebuild: (gameData: GameData) => void } {
  let pendingRebuild = false;
  let latestGameData: GameData | null = null;

  container.addEventListener('focusout', () => {
    if (pendingRebuild && latestGameData) {
      // Use requestAnimationFrame so the focusout fully settles before
      // we tear down/rebuild the DOM.
      requestAnimationFrame(() => {
        if (pendingRebuild && latestGameData) {
          pendingRebuild = false;
          rebuild(latestGameData);
        }
      });
    }
  });

  function guardedRebuild(gameData: GameData): void {
    latestGameData = gameData;
    if (hasActiveInteraction(container)) {
      pendingRebuild = true;
      return;
    }
    pendingRebuild = false;
    rebuild(gameData);
  }

  return { guardedRebuild };
}
