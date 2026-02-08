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
 *   - `update()` calls `el.replaceChildren()` and rebuilds inner
 *     content.  The container element itself is never replaced.
 */
export interface Component {
  readonly el: HTMLElement;
  update(gameData: GameData): void;
}
