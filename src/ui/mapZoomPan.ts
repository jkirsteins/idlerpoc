/**
 * SVG map zoom and pan via viewBox manipulation.
 *
 * Uses Pointer Events for unified mouse+touch gesture handling:
 * - Single-finger drag to pan
 * - Two-finger pinch to zoom (toward midpoint)
 * - Mouse wheel to zoom (toward cursor)
 * - Tap-vs-drag disambiguation (suppresses click after drag)
 * - Reset button overlay for returning to default view
 * - Programmatic zoomTo for preset cluster navigation
 *
 * ViewBox-based zoom ensures crisp vector rendering at all zoom levels.
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const DRAG_THRESHOLD = 8; // pixels of movement before a drag is recognized

// Initial viewBox: -200 -200 400 400 (matches ORRERY_SIZE = 400 in navigationView.ts)
const INITIAL_VB_X = -200;
const INITIAL_VB_Y = -200;
const INITIAL_VB_WIDTH = 400;
const INITIAL_VB_HEIGHT = 400;

export interface MapZoomPanControls {
  resetBtn: HTMLButtonElement;
  zoomInBtn: HTMLButtonElement;
  zoomOutBtn: HTMLButtonElement;
  /** Animate to center the given SVG coordinate at the given zoom level. */
  zoomTo(svgX: number, svgY: number, zoom: number, animate?: boolean): void;
  /** Update the world bounds used for clamping and reset. */
  setViewBounds(
    bounds: { x: number; y: number; width: number; height: number },
    options?: { resetToFit?: boolean }
  ): void;
}

export interface MapZoomPanOptions {
  initialViewBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  startZoom?: number;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Attach zoom/pan gesture handling to an SVG inside a container.
 * Returns controls for programmatic zoom and the reset button.
 */
export function setupMapZoomPan(
  svg: SVGSVGElement,
  container: HTMLElement,
  options: MapZoomPanOptions = {}
): MapZoomPanControls {
  if (!container.style.touchAction) {
    container.style.touchAction = 'none';
  }
  const minZoom = options.minZoom ?? MIN_ZOOM;
  const maxZoom = options.maxZoom ?? MAX_ZOOM;
  let initialViewBox = options.initialViewBox ?? {
    x: INITIAL_VB_X,
    y: INITIAL_VB_Y,
    width: INITIAL_VB_WIDTH,
    height: INITIAL_VB_HEIGHT,
  };
  const panDebugEnabled =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugpan') === '1';
  const debugPan = (...args: unknown[]) => {
    if (!panDebugEnabled) return;
    console.debug('[mapZoomPan]', ...args);
  };
  const eventSurface: HTMLElement = container;

  // ViewBox state (in SVG coordinate space)
  const defaultStartZoom = Math.min(4, maxZoom);
  const startZoom = Math.max(minZoom, options.startZoom ?? defaultStartZoom);
  const startWidth = initialViewBox.width / startZoom;
  const startHeight = initialViewBox.height / startZoom;
  const initialCenterX = initialViewBox.x + initialViewBox.width / 2;
  const initialCenterY = initialViewBox.y + initialViewBox.height / 2;
  let viewBoxX = initialCenterX - startWidth / 2;
  let viewBoxY = initialCenterY - startHeight / 2;
  let viewBoxWidth = startWidth;
  let viewBoxHeight = startHeight;

  function getDefaultViewBox(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const centerX = initialViewBox.x + initialViewBox.width / 2;
    const centerY = initialViewBox.y + initialViewBox.height / 2;
    const width = initialViewBox.width / startZoom;
    const height = initialViewBox.height / startZoom;
    return {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
  }

  /** Get current zoom level (1x = default, 10x = max zoomed in) */
  function getCurrentZoom(): number {
    return initialViewBox.width / viewBoxWidth;
  }

  /**
   * Clamp viewBox to valid zoom range and bounds.
   * Ensures viewBox dimensions stay within MIN_ZOOM to MAX_ZOOM,
   * and origin stays within the coordinate space (-200 to +200).
   */
  function clampViewBox(): void {
    // Clamp dimensions to zoom limits
    const minWidth = initialViewBox.width / maxZoom;
    const maxWidth = initialViewBox.width / minZoom;
    const minHeight = initialViewBox.height / maxZoom;
    const maxHeight = initialViewBox.height / minZoom;
    viewBoxWidth = Math.max(minWidth, Math.min(maxWidth, viewBoxWidth));
    viewBoxHeight = Math.max(minHeight, Math.min(maxHeight, viewBoxHeight));

    // Clamp origin to keep viewBox within bounds
    const minX = initialViewBox.x;
    const maxX = initialViewBox.x + initialViewBox.width - viewBoxWidth;
    const minY = initialViewBox.y;
    const maxY = initialViewBox.y + initialViewBox.height - viewBoxHeight;
    viewBoxX = Math.max(minX, Math.min(maxX, viewBoxX));
    viewBoxY = Math.max(minY, Math.min(maxY, viewBoxY));
  }

  // Zoom control buttons (HTML overlay, not SVG)
  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'nav-map-zoom-btn';
  zoomInBtn.textContent = '+';
  zoomInBtn.setAttribute('aria-label', 'Zoom in');
  zoomInBtn.title = 'Zoom in';
  container.appendChild(zoomInBtn);

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'nav-map-zoom-btn';
  zoomOutBtn.textContent = '−';
  zoomOutBtn.setAttribute('aria-label', 'Zoom out');
  zoomOutBtn.title = 'Zoom out';
  container.appendChild(zoomOutBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'nav-map-reset-zoom';
  resetBtn.textContent = 'Reset';
  resetBtn.style.display = 'none';
  container.appendChild(resetBtn);

  /**
   * Update button states based on current viewBox.
   */
  function updateUIState(): void {
    const defaultView = getDefaultViewBox();
    const epsilon = 0.0001;
    const isDefault =
      Math.abs(viewBoxX - defaultView.x) < epsilon &&
      Math.abs(viewBoxY - defaultView.y) < epsilon &&
      Math.abs(viewBoxWidth - defaultView.width) < epsilon &&
      Math.abs(viewBoxHeight - defaultView.height) < epsilon;
    resetBtn.style.display = isDefault ? 'none' : '';
    zoomInBtn.disabled = getCurrentZoom() >= maxZoom;
    zoomOutBtn.disabled = getCurrentZoom() <= minZoom;
  }

  /**
   * Apply current viewBox state to SVG and update UI controls.
   */
  function applyViewBox(): void {
    clampViewBox();
    svg.setAttribute(
      'viewBox',
      `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`
    );
    updateUIState();
  }

  function safeSetPointerCapture(pointerId: number): void {
    if (!('setPointerCapture' in eventSurface)) return;
    try {
      eventSurface.setPointerCapture(pointerId);
    } catch (error) {
      debugPan('setPointerCapture failed', { pointerId, error });
    }
  }

  /**
   * Convert screen pixel coordinates (clientX/Y) to SVG coordinates.
   * Accounts for preserveAspectRatio: xMidYMid meet letterboxing.
   */
  function screenToSvg(
    screenX: number,
    screenY: number
  ): { x: number; y: number } {
    const rect = container.getBoundingClientRect();
    // Screen coordinates relative to container
    const relX = screenX - rect.left;
    const relY = screenY - rect.top;

    // Account for letterboxing (SVG is centered in container)
    const containerAspect = rect.width / rect.height;
    const svgAspect = viewBoxWidth / viewBoxHeight;
    let svgPixelWidth: number;
    let svgPixelHeight: number;
    let offsetX = 0;
    let offsetY = 0;

    if (containerAspect > svgAspect) {
      // Container is wider: letterbox on sides
      svgPixelHeight = rect.height;
      svgPixelWidth = svgPixelHeight * svgAspect;
      offsetX = (rect.width - svgPixelWidth) / 2;
    } else {
      // Container is taller: letterbox on top/bottom
      svgPixelWidth = rect.width;
      svgPixelHeight = svgPixelWidth / svgAspect;
      offsetY = (rect.height - svgPixelHeight) / 2;
    }

    // Convert to SVG coordinates
    const svgX = viewBoxX + ((relX - offsetX) / svgPixelWidth) * viewBoxWidth;
    const svgY = viewBoxY + ((relY - offsetY) / svgPixelHeight) * viewBoxHeight;
    return { x: svgX, y: svgY };
  }

  /**
   * Zoom to a specific level while keeping an SVG point fixed.
   * @param svgX SVG x-coordinate to keep fixed
   * @param svgY SVG y-coordinate to keep fixed
   * @param zoomFactor Zoom multiplier (e.g., 1.3 to zoom in 30%)
   */
  function zoomAtPoint(svgX: number, svgY: number, zoomFactor: number): void {
    const oldWidth = viewBoxWidth;
    const oldHeight = viewBoxHeight;
    const newZoom = Math.max(
      minZoom,
      Math.min(maxZoom, getCurrentZoom() * zoomFactor)
    );
    const newWidth = initialViewBox.width / newZoom;
    const newHeight = initialViewBox.height / newZoom;

    // Calculate how far the fixed point is into the current viewBox (0-1)
    const fx = (svgX - viewBoxX) / oldWidth;
    const fy = (svgY - viewBoxY) / oldHeight;

    // Adjust viewBox origin to keep the fixed point at the same position
    viewBoxX = svgX - fx * newWidth;
    viewBoxY = svgY - fy * newHeight;
    viewBoxWidth = newWidth;
    viewBoxHeight = newHeight;

    applyViewBox();
  }

  /**
   * Animate viewBox to target state using requestAnimationFrame.
   */
  function animateViewBoxTo(
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number
  ): void {
    const startX = viewBoxX;
    const startY = viewBoxY;
    const startWidth = viewBoxWidth;
    const startHeight = viewBoxHeight;
    const duration = 300; // ms
    const startTime = performance.now();

    function animate(currentTime: number): void {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out curve
      const eased = 1 - Math.pow(1 - progress, 3);

      viewBoxX = startX + (targetX - startX) * eased;
      viewBoxY = startY + (targetY - startY) * eased;
      viewBoxWidth = startWidth + (targetWidth - startWidth) * eased;
      viewBoxHeight = startHeight + (targetHeight - startHeight) * eased;

      applyViewBox();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const defaultView = getDefaultViewBox();
    animateViewBoxTo(
      defaultView.x,
      defaultView.y,
      defaultView.width,
      defaultView.height
    );
  });

  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Zoom toward center
    const centerX = viewBoxX + viewBoxWidth / 2;
    const centerY = viewBoxY + viewBoxHeight / 2;
    zoomAtPoint(centerX, centerY, 1.3);
  });

  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Zoom toward center
    const centerX = viewBoxX + viewBoxWidth / 2;
    const centerY = viewBoxY + viewBoxHeight / 2;
    zoomAtPoint(centerX, centerY, 1 / 1.3);
  });

  /**
   * Programmatic zoom: center the given SVG coordinate at the given zoom.
   */
  function zoomTo(
    svgX: number,
    svgY: number,
    targetZoom: number,
    animate = true
  ): void {
    targetZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
    const targetWidth = initialViewBox.width / targetZoom;
    const targetHeight = initialViewBox.height / targetZoom;
    const targetViewBoxX = svgX - targetWidth / 2;
    const targetViewBoxY = svgY - targetHeight / 2;

    if (animate) {
      animateViewBoxTo(
        targetViewBoxX,
        targetViewBoxY,
        targetWidth,
        targetHeight
      );
    } else {
      viewBoxX = targetViewBoxX;
      viewBoxY = targetViewBoxY;
      viewBoxWidth = targetWidth;
      viewBoxHeight = targetHeight;
      applyViewBox();
    }
  }

  function setViewBounds(
    bounds: { x: number; y: number; width: number; height: number },
    options: { resetToFit?: boolean } = {}
  ): void {
    const nextBounds = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    };

    const currentZoom = getCurrentZoom();
    const centerX = viewBoxX + viewBoxWidth / 2;
    const centerY = viewBoxY + viewBoxHeight / 2;
    initialViewBox = nextBounds;

    if (options.resetToFit ?? false) {
      const defaultView = getDefaultViewBox();
      viewBoxX = defaultView.x;
      viewBoxY = defaultView.y;
      viewBoxWidth = defaultView.width;
      viewBoxHeight = defaultView.height;
    } else {
      viewBoxWidth = initialViewBox.width / currentZoom;
      viewBoxHeight = initialViewBox.height / currentZoom;
      viewBoxX = centerX - viewBoxWidth / 2;
      viewBoxY = centerY - viewBoxHeight / 2;
    }

    applyViewBox();
  }

  // --- Pointer tracking state ---
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: {
    x: number;
    y: number;
    viewBoxX: number;
    viewBoxY: number;
  } | null = null;
  let pinchStartDist = 0;
  let pinchStartWidth = 0;
  let pinchMidpointSvg: { x: number; y: number } | null = null;
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

  function shouldIgnoreTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return target.closest('button') !== null;
  }

  // Capture-phase click listener: suppress clicks after drags
  eventSurface.addEventListener(
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

  eventSurface.addEventListener('pointerdown', (e: PointerEvent) => {
    if (shouldIgnoreTarget(e.target)) return;
    debugPan('pointerdown', {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      x: e.clientX,
      y: e.clientY,
    });

    // Don't capture immediately — defer until drag threshold is exceeded
    // so that taps/clicks propagate normally to child elements (hitAreas).
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      dragStart = {
        x: e.clientX,
        y: e.clientY,
        viewBoxX,
        viewBoxY,
      };
      wasDragging = false;
    } else if (pointers.size === 2) {
      // Pinch always captures immediately
      safeSetPointerCapture(e.pointerId);
      dragStart = null;
      pinchStartDist = getPointerDistance();
      pinchStartWidth = viewBoxWidth;
      const mid = getPointerMidpoint();
      pinchMidpointSvg = screenToSvg(mid.x, mid.y);
      debugPan('pinch start', { pinchStartDist });
    }
  });

  eventSurface.addEventListener('pointermove', (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && dragStart) {
      // Single-pointer pan
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > DRAG_THRESHOLD) {
        if (!wasDragging) {
          // Capture pointer once drag begins so pan continues outside SVG bounds
          safeSetPointerCapture(e.pointerId);
          debugPan('drag start', { pointerId: e.pointerId, dist });
        }
        wasDragging = true;
      }
      if (wasDragging) {
        // Convert screen pixel delta to SVG delta
        const rect = container.getBoundingClientRect();
        const svgDx = (dx / rect.width) * viewBoxWidth;
        const svgDy = (dy / rect.height) * viewBoxHeight;
        // Pan is inverse: drag right = move viewBox left
        viewBoxX = dragStart.viewBoxX - svgDx;
        viewBoxY = dragStart.viewBoxY - svgDy;
        applyViewBox();
      }
    } else if (pointers.size === 2 && pinchStartDist > 0 && pinchMidpointSvg) {
      // Pinch-zoom toward midpoint
      const newDist = getPointerDistance();
      if (newDist < 1) return;
      const ratio = newDist / pinchStartDist;
      const newWidth = pinchStartWidth / ratio;

      // Clamp to zoom limits
      const newZoom = initialViewBox.width / newWidth;
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
      const clampedWidth = initialViewBox.width / clampedZoom;
      const clampedHeight = initialViewBox.height / clampedZoom;

      // Keep SVG midpoint fixed
      viewBoxX = pinchMidpointSvg.x - clampedWidth / 2;
      viewBoxY = pinchMidpointSvg.y - clampedHeight / 2;
      viewBoxWidth = clampedWidth;
      viewBoxHeight = clampedHeight;

      wasDragging = true;
      debugPan('pinch move', { newDist, clampedZoom });
      applyViewBox();
    }
  });

  const handlePointerUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    debugPan('pointerup', { pointerId: e.pointerId, remaining: pointers.size });
    if (pointers.size === 0) {
      dragStart = null;
      pinchMidpointSvg = null;
    } else if (pointers.size === 1) {
      // Transitioned from pinch to single pointer — start new pan baseline
      const remaining = Array.from(pointers.entries())[0];
      dragStart = {
        x: remaining[1].x,
        y: remaining[1].y,
        viewBoxX,
        viewBoxY,
      };
      pinchMidpointSvg = null;
    }
  };
  eventSurface.addEventListener('pointerup', handlePointerUp);
  eventSurface.addEventListener('pointercancel', handlePointerUp);

  // Mouse wheel and trackpad gestures
  eventSurface.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (shouldIgnoreTarget(e.target)) return;
      e.preventDefault();

      // Detect gesture type:
      // 1. Pinch-to-zoom (trackpad pinch sets ctrlKey) → zoom
      // 2. Mouse wheel (large deltaY, LINE mode, or no deltaX) → zoom
      // 3. Trackpad two-finger scroll (small smooth deltaY, PIXEL mode) → pan

      const isPinchZoom = e.ctrlKey;
      const isMouseWheel =
        e.deltaMode === 1 || // LINE mode (mouse wheel)
        (Math.abs(e.deltaY) > 40 && e.deltaX === 0); // Large vertical delta, no horizontal
      const shouldZoom = isPinchZoom || isMouseWheel;

      if (shouldZoom) {
        const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const cursorSvg = screenToSvg(e.clientX, e.clientY);
        zoomAtPoint(cursorSvg.x, cursorSvg.y, zoomFactor);
      } else {
        // Two-finger trackpad scroll → pan
        const rect = container.getBoundingClientRect();
        const svgDx = (e.deltaX / rect.width) * viewBoxWidth;
        const svgDy = (e.deltaY / rect.height) * viewBoxHeight;
        viewBoxX += svgDx;
        viewBoxY += svgDy;
        applyViewBox();
      }
    },
    { passive: false }
  );

  // Initialize viewBox
  applyViewBox();
  debugPan('initialized', {
    viewBoxX,
    viewBoxY,
    viewBoxWidth,
    viewBoxHeight,
    minZoom,
    maxZoom,
  });

  return { resetBtn, zoomInBtn, zoomOutBtn, zoomTo, setViewBounds };
}
