export interface StatBarOverlay {
  percentage: number; // 0-100, overlay width
  colorClass: string; // 'bar-good' | 'bar-warning' | 'bar-danger'
}

export interface StatBarOptions {
  label: string; // Header text (full) or value text (compact)
  percentage: number; // Primary fill percentage (0-100)
  colorClass: string; // Primary fill color class
  mode: 'full' | 'compact';
  valueLabel?: string; // Right-side value text (full mode only)
  overlay?: StatBarOverlay; // Optional overlay rendered on top of fill
}

export function renderStatBar(options: StatBarOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = `stat-bar stat-bar--${options.mode}`;

  if (options.mode === 'full') {
    // Full mode: header + track
    const header = document.createElement('div');
    header.className = 'stat-bar__header';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = options.label;

    const valueSpan = document.createElement('span');
    valueSpan.textContent = options.valueLabel || '';

    header.appendChild(labelSpan);
    header.appendChild(valueSpan);
    container.appendChild(header);

    const track = document.createElement('div');
    track.className = 'stat-bar__track';

    const fill = document.createElement('div');
    fill.className = `stat-bar__fill ${options.colorClass}`;
    fill.style.width = `${Math.min(100, options.percentage)}%`;

    track.appendChild(fill);

    // Add overlay if provided
    if (options.overlay) {
      const overlay = document.createElement('div');
      overlay.className = `stat-bar__overlay ${options.overlay.colorClass}`;
      overlay.style.width = `${Math.min(100, options.overlay.percentage)}%`;
      track.appendChild(overlay);
    }

    container.appendChild(track);
  } else {
    // Compact mode: label + track
    const labelDiv = document.createElement('div');
    labelDiv.className = 'stat-bar__label';
    labelDiv.textContent = options.label;
    container.appendChild(labelDiv);

    const track = document.createElement('div');
    track.className = 'stat-bar__track';

    const fill = document.createElement('div');
    fill.className = `stat-bar__fill ${options.colorClass}`;
    fill.style.width = `${Math.min(100, options.percentage)}%`;

    track.appendChild(fill);

    // Add overlay if provided
    if (options.overlay) {
      const overlay = document.createElement('div');
      overlay.className = `stat-bar__overlay ${options.overlay.colorClass}`;
      overlay.style.width = `${Math.min(100, options.overlay.percentage)}%`;
      track.appendChild(overlay);
    }

    container.appendChild(track);
  }

  return container;
}
