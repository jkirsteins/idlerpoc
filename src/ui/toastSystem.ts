import type { Toast } from '../models';

/**
 * Toast Notification System
 *
 * Renders real-time event notifications that auto-dismiss after 5 seconds.
 */

/**
 * Render a toast notification container with all active toasts.
 */
export function renderToasts(toasts: Toast[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'toast-container';

  for (const toast of toasts) {
    container.appendChild(renderToast(toast));
  }

  return container;
}

/**
 * Render a single toast notification.
 */
function renderToast(toast: Toast): HTMLElement {
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${toast.type}`;
  toastEl.setAttribute('data-toast-id', toast.id);

  // Icon based on type
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = getToastIcon(toast.type);
  toastEl.appendChild(icon);

  // Message
  const message = document.createElement('span');
  message.className = 'toast-message';
  message.textContent = toast.message;
  toastEl.appendChild(message);

  return toastEl;
}

/**
 * Get icon for toast type.
 */
function getToastIcon(type: string): string {
  switch (type) {
    case 'encounter_evaded':
      return '🛡️';
    case 'encounter_negotiated':
      return '🤝';
    case 'encounter_victory':
      return '⚔️';
    case 'encounter_harassment':
      return '⚠️';
    case 'encounter_boarding':
      return '🔴';
    case 'level_up':
      return '⭐';
    case 'credits_gained':
      return '💰';
    case 'credits_lost':
      return '💸';
    case 'radiation_spike':
      return '☢️';
    default:
      return 'ℹ️';
  }
}
