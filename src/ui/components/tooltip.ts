export interface TooltipOptions {
  content: string; // Can include HTML
  followMouse?: boolean; // If true, tooltip follows mouse; if false, positions near element
}

let activeTooltip: HTMLElement | null = null;

export function attachTooltip(
  element: HTMLElement,
  options: TooltipOptions
): void {
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  tooltip.innerHTML = options.content;
  document.body.appendChild(tooltip);

  const updateTooltipPosition = (
    e: MouseEvent,
    tip: HTMLElement,
    elem: HTMLElement,
    followMouse: boolean
  ) => {
    if (followMouse) {
      // Position near mouse
      const offsetX = 15;
      const offsetY = 15;
      let left = e.clientX + offsetX;
      let top = e.clientY + offsetY;

      // Prevent tooltip from going off-screen
      const rect = tip.getBoundingClientRect();
      if (left + rect.width > window.innerWidth) {
        left = e.clientX - rect.width - offsetX;
      }
      if (top + rect.height > window.innerHeight) {
        top = e.clientY - rect.height - offsetY;
      }

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    } else {
      // Position near element
      const elemRect = elem.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();

      let left = elemRect.left;
      let top = elemRect.bottom + 8;

      // Prevent tooltip from going off-screen
      if (left + tipRect.width > window.innerWidth) {
        left = window.innerWidth - tipRect.width - 16;
      }
      if (top + tipRect.height > window.innerHeight) {
        top = elemRect.top - tipRect.height - 8;
      }

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }
  };

  const showTooltip = (e: MouseEvent) => {
    tooltip.classList.add('visible');
    updateTooltipPosition(e, tooltip, element, options.followMouse ?? false);
    activeTooltip = tooltip;
  };

  const hideTooltip = () => {
    tooltip.classList.remove('visible');
    if (activeTooltip === tooltip) {
      activeTooltip = null;
    }
  };

  element.addEventListener('mouseenter', showTooltip);
  element.addEventListener('mousemove', (e) => {
    if (tooltip.classList.contains('visible') && options.followMouse) {
      updateTooltipPosition(e, tooltip, element, true);
    }
  });
  element.addEventListener('mouseleave', hideTooltip);

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
