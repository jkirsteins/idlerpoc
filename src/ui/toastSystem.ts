import type { Toast } from '../models';
import { getToastIconSvg } from './icons';

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
  if (toast.type === 'level_up') {
    toastEl.classList.add('toast-shimmer');
  }
  toastEl.setAttribute('data-toast-id', toast.id);

  // Icon based on type (inline SVG)
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.appendChild(getToastIconSvg(toast.type, 16));
  toastEl.appendChild(icon);

  // Message
  const message = document.createElement('span');
  message.className = 'toast-message';
  message.textContent = toast.message;
  toastEl.appendChild(message);

  return toastEl;
}
