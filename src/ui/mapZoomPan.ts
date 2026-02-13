/**
 * SVG map zoom and pan via CSS transforms.
 *
 * Uses Pointer Events for unified mouse+touch gesture handling:
 * - Single-finger drag to pan
 * - Two-finger pinch to zoom (toward midpoint)
 * - Mouse wheel to zoom (toward cursor)
 * - Tap-vs-drag disambiguation (suppresses click after drag)
 * - Reset button overlay for returning to default view
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD = 8; // pixels of movement before a drag is recognized

/**
 * Attach zoom/pan gesture handling to an SVG inside a container.
 * Returns the reset button element (already appended to container).
 */
export function setupMapZoomPan(
  svg: SVGSVGElement,
  container: HTMLElement
): HTMLButtonElement {
  let currentZoom = 1;
  let panX = 0;
  let panY = 0;

  svg.style.transformOrigin = '0 0';

  // Reset zoom button (HTML overlay, not SVG)
  const resetBtn = document.createElement('button');
  resetBtn.className = 'nav-map-reset-zoom';
  resetBtn.textContent = 'Reset';
  resetBtn.style.display = 'none';
  container.appendChild(resetBtn);

  function clampPan(): void {
    const rect = container.getBoundingClientRect();
    // With transform: translate(px,py) scale(z) and transform-origin: 0 0,
    // panX is in screen pixels. Valid range keeps scaled content covering
    // the container: [-(width * (zoom - 1)), 0] for each axis.
    const minPX = -rect.width * (currentZoom - 1);
    const minPY = -rect.height * (currentZoom - 1);
    panX = Math.max(minPX, Math.min(0, panX));
    panY = Math.max(minPY, Math.min(0, panY));
  }

  function applyTransform(): void {
    clampPan();
    svg.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
    resetBtn.style.display =
      currentZoom === 1 && panX === 0 && panY === 0 ? 'none' : '';
  }

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    svg.style.transition = 'transform 0.3s ease';
    currentZoom = 1;
    panX = 0;
    panY = 0;
    applyTransform();
    const onEnd = (): void => {
      svg.style.transition = '';
      svg.removeEventListener('transitionend', onEnd);
    };
    svg.addEventListener('transitionend', onEnd);
  });

  // --- Pointer tracking state ---
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: {
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null = null;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchStartPanX = 0;
  let pinchStartPanY = 0;
  let pinchStartMidX = 0;
  let pinchStartMidY = 0;
  let wasDragging = false;

  function getPointerDistance(): number {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getPointerMidpoint(): { x: number; y: number } {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return pts[0] || { x: 0, y: 0 };
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  // Capture-phase click listener: suppress clicks after drags
  svg.addEventListener(
    'click',
    (e) => {
      if (wasDragging) {
        e.stopPropagation();
        e.preventDefault();
        wasDragging = false;
      }
    },
    true
  );

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      dragStart = { x: e.clientX, y: e.clientY, panX, panY };
      wasDragging = false;
    } else if (pointers.size === 2) {
      dragStart = null;
      pinchStartDist = getPointerDistance();
      pinchStartZoom = currentZoom;
      pinchStartPanX = panX;
      pinchStartPanY = panY;
      const mid = getPointerMidpoint();
      const rect = container.getBoundingClientRect();
      pinchStartMidX = mid.x - rect.left;
      pinchStartMidY = mid.y - rect.top;
    }
  });

  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && dragStart) {
      // Single-pointer pan
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > DRAG_THRESHOLD) {
        wasDragging = true;
      }
      if (wasDragging) {
        panX = dragStart.panX + dx;
        panY = dragStart.panY + dy;
        applyTransform();
      }
    } else if (pointers.size === 2 && pinchStartDist > 0) {
      // Pinch-zoom toward midpoint
      const newDist = getPointerDistance();
      if (newDist < 1) return;
      const ratio = newDist / pinchStartDist;
      currentZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinchStartZoom * ratio)
      );

      // Keep the SVG point under the initial midpoint anchored to the
      // current midpoint position.
      const mid = getPointerMidpoint();
      const rect = container.getBoundingClientRect();
      const cx = mid.x - rect.left;
      const cy = mid.y - rect.top;

      panX =
        cx - (pinchStartMidX - pinchStartPanX) * (currentZoom / pinchStartZoom);
      panY =
        cy - (pinchStartMidY - pinchStartPanY) * (currentZoom / pinchStartZoom);

      wasDragging = true;
      applyTransform();
    }
  });

  const handlePointerUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      dragStart = null;
    } else if (pointers.size === 1) {
      // Transitioned from pinch to single pointer — start new pan baseline
      const remaining = Array.from(pointers.entries())[0];
      dragStart = {
        x: remaining[1].x,
        y: remaining[1].y,
        panX,
        panY,
      };
    }
  };
  svg.addEventListener('pointerup', handlePointerUp);
  svg.addEventListener('pointercancel', handlePointerUp);

  // Mouse wheel zoom (desktop)
  svg.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const oldZoom = currentZoom;
      currentZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, currentZoom * zoomFactor)
      );
      if (currentZoom === oldZoom) return;

      // Zoom toward cursor: keep the SVG point under the cursor fixed
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      panX = cx - (cx - panX) * (currentZoom / oldZoom);
      panY = cy - (cy - panY) * (currentZoom / oldZoom);

      applyTransform();
    },
    { passive: false }
  );

  return resetBtn;
}
