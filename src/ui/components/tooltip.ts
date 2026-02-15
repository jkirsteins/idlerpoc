import { computePosition, flip, shift, offset } from '@floating-ui/dom';

export interface TooltipOptions {
  content: string; // Can include HTML
  followMouse?: boolean; // If true, tooltip follows mouse; if false, positions near element
}

let activeTooltip: HTMLElement | null = null;
let activeTrigger: HTMLElement | null = null;

// Register a document-level touch dismiss listener (once)
let dismissRegistered = false;
function ensureTouchDismiss(): void {
  if (dismissRegistered) return;
  dismissRegistered = true;
  document.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (!activeTooltip) return;
      const target = e.target as Node;
      if (!activeTooltip.contains(target) && !activeTrigger?.contains(target)) {
        activeTooltip.classList.remove('visible');
        activeTooltip = null;
        activeTrigger = null;
      }
    },
    { passive: true }
  );
}

/**
 * Position tooltip using Floating UI for robust viewport-aware positioning.
 * Replaces manual positioning logic with professional collision detection.
 */
async function positionTooltipWithFloating(
  tooltip: HTMLElement,
  trigger: HTMLElement
): Promise<void> {
  const { x, y } = await computePosition(trigger, tooltip, {
    placement: 'bottom-start', // Default: below trigger, left-aligned
    middleware: [
      offset(8), // 8px spacing from trigger
      flip({
        // Auto-flip to opposite side if overflow
        fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
      }),
      shift({
        // Slide along edge to stay in viewport
        padding: 8, // Minimum 8px from viewport edges
      }),
    ],
  });

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

/**
 * Position tooltip at mouse cursor using virtual element (for followMouse mode).
 */
async function positionTooltipAtMouse(
  tooltip: HTMLElement,
  mouseEvent: MouseEvent
): Promise<void> {
  const virtualEl = {
    getBoundingClientRect() {
      return {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        width: 0,
        height: 0,
        top: mouseEvent.clientY,
        left: mouseEvent.clientX,
        right: mouseEvent.clientX,
        bottom: mouseEvent.clientY,
      };
    },
  };

  const { x, y } = await computePosition(virtualEl, tooltip, {
    placement: 'bottom-start',
    middleware: [offset(15), flip(), shift({ padding: 8 })],
  });

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

export function attachTooltip(
  element: HTMLElement,
  options: TooltipOptions
): void {
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  tooltip.innerHTML = options.content;
  document.body.appendChild(tooltip);

  // Mark element as having a tooltip (for CSS touch target sizing)
  element.setAttribute('data-has-tooltip', '');

  const showTooltip = async (e: MouseEvent) => {
    // Dismiss any other active tooltip (singleton enforcement)
    if (activeTooltip && activeTooltip !== tooltip) {
      activeTooltip.classList.remove('visible');
    }

    tooltip.classList.add('visible');
    activeTooltip = tooltip;
    activeTrigger = element;

    // Use Floating UI for positioning
    if (options.followMouse) {
      await positionTooltipAtMouse(tooltip, e);
    } else {
      await positionTooltipWithFloating(tooltip, element);
    }
  };

  const hideTooltip = () => {
    tooltip.classList.remove('visible');
    if (activeTooltip === tooltip) {
      activeTooltip = null;
      activeTrigger = null;
    }
  };

  // Mouse events (hover — desktop)
  element.addEventListener('mouseenter', (e) => {
    void showTooltip(e);
  });
  element.addEventListener('mousemove', (e) => {
    if (tooltip.classList.contains('visible') && options.followMouse) {
      void positionTooltipAtMouse(tooltip, e);
    }
  });
  element.addEventListener('mouseleave', hideTooltip);

  // Touch events (tap to toggle — mobile)
  element.addEventListener(
    'touchstart',
    () => {
      ensureTouchDismiss();

      if (tooltip.classList.contains('visible')) {
        // Tap again to dismiss
        tooltip.classList.remove('visible');
        if (activeTooltip === tooltip) {
          activeTooltip = null;
          activeTrigger = null;
        }
        return;
      }

      // Dismiss any other active tooltip
      if (activeTooltip && activeTooltip !== tooltip) {
        activeTooltip.classList.remove('visible');
      }

      // Show this tooltip
      tooltip.classList.add('visible');
      activeTooltip = tooltip;
      activeTrigger = element;

      // Position anchored to element (not mouse)
      void positionTooltipWithFloating(tooltip, element);
    },
    { passive: true }
  );

  // Clean up tooltip when element is removed
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === element || node.contains(element)) {
          tooltip.remove();
          observer.disconnect();
        }
      });
    });
  });

  if (element.parentElement) {
    observer.observe(element.parentElement, { childList: true, subtree: true });
  }
}

export interface TooltipHandle {
  updateContent: (html: string) => void;
}

/**
 * Attach a tooltip with dynamic content that can be updated each tick.
 * Returns a handle that allows updating tooltip content without recreating the tooltip element.
 * Used by mount-once components that need to update tooltip content on each tick.
 */
export function attachDynamicTooltip(
  element: HTMLElement,
  initialContent: string,
  options?: { followMouse?: boolean }
): TooltipHandle {
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  tooltip.innerHTML = initialContent;
  document.body.appendChild(tooltip);

  // Mark element as having a tooltip (for CSS touch target sizing)
  element.setAttribute('data-has-tooltip', '');

  let currentContent = initialContent;
  const followMouse = options?.followMouse ?? false;

  const showTooltip = async (e: MouseEvent) => {
    // Dismiss any other active tooltip (singleton enforcement)
    if (activeTooltip && activeTooltip !== tooltip) {
      activeTooltip.classList.remove('visible');
    }

    tooltip.classList.add('visible');
    activeTooltip = tooltip;
    activeTrigger = element;

    // Use Floating UI for positioning
    if (followMouse) {
      await positionTooltipAtMouse(tooltip, e);
    } else {
      await positionTooltipWithFloating(tooltip, element);
    }
  };

  const hideTooltip = () => {
    tooltip.classList.remove('visible');
    if (activeTooltip === tooltip) {
      activeTooltip = null;
      activeTrigger = null;
    }
  };

  // Mouse events (hover — desktop)
  element.addEventListener('mouseenter', (e) => {
    void showTooltip(e);
  });
  element.addEventListener('mousemove', (e) => {
    if (tooltip.classList.contains('visible') && followMouse) {
      void positionTooltipAtMouse(tooltip, e);
    }
  });
  element.addEventListener('mouseleave', hideTooltip);

  // Touch events (tap to toggle — mobile)
  element.addEventListener(
    'touchstart',
    () => {
      ensureTouchDismiss();

      if (tooltip.classList.contains('visible')) {
        // Tap again to dismiss
        tooltip.classList.remove('visible');
        if (activeTooltip === tooltip) {
          activeTooltip = null;
          activeTrigger = null;
        }
        return;
      }

      // Dismiss any other active tooltip
      if (activeTooltip && activeTooltip !== tooltip) {
        activeTooltip.classList.remove('visible');
      }

      // Show this tooltip
      tooltip.classList.add('visible');
      activeTooltip = tooltip;
      activeTrigger = element;

      // Position anchored to element (not mouse)
      void positionTooltipWithFloating(tooltip, element);
    },
    { passive: true }
  );

  // Clean up tooltip when element is removed
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === element || node.contains(element)) {
          tooltip.remove();
          observer.disconnect();
        }
      });
    });
  });

  if (element.parentElement) {
    observer.observe(element.parentElement, { childList: true, subtree: true });
  }

  // Return handle for updating content
  return {
    updateContent: (html: string) => {
      // Only update DOM if content actually changed
      if (html !== currentContent) {
        currentContent = html;
        tooltip.innerHTML = html;

        // Reposition if visible (dimensions may have changed with new content)
        if (tooltip.classList.contains('visible') && activeTrigger) {
          void positionTooltipWithFloating(tooltip, activeTrigger);
        }
      }
    },
  };
}

export function formatPowerTooltip(
  available: number,
  totalCapacity: number,
  drawItems: Array<{ name: string; draw: number }>
): string {
  const parts: string[] = [];

  parts.push(
    `<div><span class="custom-tooltip-label">Available:</span> <span class="custom-tooltip-value">${available} kW</span></div>`
  );
  parts.push(
    `<div><span class="custom-tooltip-label">Total Capacity:</span> <span class="custom-tooltip-value">${totalCapacity} kW</span></div>`
  );

  if (drawItems.length > 0) {
    parts.push('<div class="custom-tooltip-section">Power Draw:</div>');
    for (const item of drawItems) {
      parts.push(
        `<div class="custom-tooltip-item">${item.name}: ${item.draw} kW</div>`
      );
    }
  }

  return parts.join('');
}
