// TRAPPIST-1 Planet Map Component - Hex Grid Visualization
// Shows zones on a planet as a hex grid, centered on current/conquered zone

/* eslint-disable top/no-top-level-side-effects */

import type { GameData, Zone } from '../models/swarmTypes';
import type { Component } from './component';
import { setupMapZoomPan, type MapZoomPanControls } from './mapZoomPan';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PlanetMapCallbacks {
  onZoneSelect?: (zoneId: string) => void;
  onBackToLocal?: () => void;
  onBackToSystem?: () => void;
  getPlanetId?: () => string | null;
}

interface ZoneHex {
  zone: Zone;
  hex: SVGGElement;
  label: SVGTextElement;
}

// Hex grid config
const HEX_SIZE = 22;
const HEX_WIDTH = HEX_SIZE * Math.sqrt(3);
const HEX_HEIGHT = HEX_SIZE * 2;

// Offset for odd-r layout
function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_WIDTH * (q + r / 2);
  const y = ((HEX_HEIGHT * 3) / 4) * r;
  return { x, y };
}

function createHexPath(cx: number, cy: number): string {
  let path = '';
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + HEX_SIZE * Math.cos(angle);
    const y = cy + HEX_SIZE * Math.sin(angle);
    path += `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }
  path += 'Z';
  return path;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getSafeZoneHex(
  zone: Zone,
  index: number,
  total: number
): { q: number; r: number; s: number } {
  if (
    isFiniteNumber(zone.hexQ) &&
    isFiniteNumber(zone.hexR) &&
    isFiniteNumber(zone.hexS)
  ) {
    return { q: zone.hexQ, r: zone.hexR, s: zone.hexS };
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(total, 1))));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const q = col - Math.floor(cols / 2);
  const r = row - Math.floor(total / cols / 2);
  return { q, r, s: -q - r };
}

// Get color based on zone state
function getZoneStateColor(zone: Zone, isHome: boolean): string {
  if (zone.state === 'unexplored') {
    return isHome ? '#2a2a3a' : '#1a1a1a';
  }
  if (zone.state === 'exploring') return '#4a9eff';
  if (zone.state === 'combating') return '#ff6b6b';
  if (zone.state === 'converting') return '#ffc107';
  if (zone.state === 'harvesting') return '#4caf50';
  if (zone.state === 'saturated') return '#9c27b0';
  return '#444';
}

// Get terrain indicator color
function getTerrainIndicator(zone: Zone): string | null {
  if (zone.terrainType === 'liquid') return '#00bcd4';
  if (zone.terrainType === 'ice') return '#e0e0ff';
  return null;
}

// Get atmosphere indicator
function getAtmosphereOpacity(zone: Zone): number {
  if (zone.atmosphere === 'thick') return 0.3;
  if (zone.atmosphere === 'thin') return 0.15;
  return 0; // none
}

export function createPlanetMapComponent(
  container: HTMLElement,
  _gameData: GameData,
  callbacks: PlanetMapCallbacks
): Component<GameData> {
  // Create main container and append to provided container
  const el = document.createElement('div');
  container.appendChild(el);
  el.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-void, #050508);
  `;

  // Header with back button and planet name
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-color, #2a2a3a);
  `;

  const backBtn = document.createElement('button');
  backBtn.textContent = '← System';
  backBtn.style.cssText = `
    background: transparent;
    border: 1px solid var(--border-color, #444);
    color: var(--text-secondary, #888);
    padding: 0.4rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  `;
  backBtn.onclick = () => {
    if (callbacks.onBackToLocal) {
      callbacks.onBackToLocal();
      return;
    }
    if (callbacks.onBackToSystem) callbacks.onBackToSystem();
  };
  header.appendChild(backBtn);

  const planetName = document.createElement('span');
  planetName.style.cssText = `
    font-weight: bold;
    color: var(--accent-cyan, #00e5ff);
  `;
  header.appendChild(planetName);

  const zoneCount = document.createElement('span');
  zoneCount.style.cssText = `
    margin-left: auto;
    font-size: 0.85rem;
    color: var(--text-secondary, #888);
  `;
  header.appendChild(zoneCount);

  el.appendChild(header);

  // Map container (scrollable)
  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = `
    flex: 1;
    min-height: 200px;
    overflow: hidden;
    position: relative;
  `;

  // SVG for hex grid
  const svg = document.createElementNS(SVG_NS, 'svg');
  // Larger world-space view to allow meaningful zoom-out on dense zone maps.
  const mapViewSize = 1600;
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute(
    'viewBox',
    `${-mapViewSize / 2} ${-mapViewSize / 2} ${mapViewSize} ${mapViewSize}`
  );
  svg.style.cssText = 'display: block;';

  // Create layers
  const terrainLayer = document.createElementNS(SVG_NS, 'g');
  terrainLayer.setAttribute('class', 'terrain-layer');
  svg.appendChild(terrainLayer);

  const zoneLayer = document.createElementNS(SVG_NS, 'g');
  zoneLayer.setAttribute('class', 'zone-layer');
  svg.appendChild(zoneLayer);

  const workerLayer = document.createElementNS(SVG_NS, 'g');
  workerLayer.setAttribute('class', 'worker-layer');
  svg.appendChild(workerLayer);

  const selectionLayer = document.createElementNS(SVG_NS, 'g');
  selectionLayer.setAttribute('class', 'selection-layer');
  svg.appendChild(selectionLayer);

  mapContainer.appendChild(svg);
  el.appendChild(mapContainer);

  const zoomControls: MapZoomPanControls = setupMapZoomPan(svg, mapContainer, {
    initialViewBox: {
      x: -mapViewSize / 2,
      y: -mapViewSize / 2,
      width: mapViewSize,
      height: mapViewSize,
    },
    startZoom: 1,
    minZoom: 1,
    maxZoom: 10,
  });
  const styleZoomBtn = (btn: HTMLButtonElement) => {
    btn.style.cssText = `
      position: absolute;
      background: rgba(20, 20, 30, 0.9);
      border: 1px solid #444;
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    `;
  };
  styleZoomBtn(zoomControls.zoomInBtn);
  styleZoomBtn(zoomControls.zoomOutBtn);
  zoomControls.zoomInBtn.style.right = '10px';
  zoomControls.zoomInBtn.style.top = '10px';
  zoomControls.zoomOutBtn.style.right = '10px';
  zoomControls.zoomOutBtn.style.top = '45px';
  zoomControls.resetBtn.className = 'nav-map-reset-zoom';
  zoomControls.resetBtn.style.cssText = `
    position: absolute;
    left: 10px;
    bottom: 10px;
    top: auto;
    right: auto;
    width: auto;
    height: auto;
  `;

  // Legend
  const legend = document.createElement('div');
  legend.style.cssText = `
    display: flex;
    gap: 1rem;
    padding: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
    border-top: 1px solid var(--border-color, #2a2a3a);
    flex-wrap: wrap;
    justify-content: center;
  `;
  legend.innerHTML = `
    <span>⬛ Unexplored</span>
    <span style="color: #4a9eff">● Exploring</span>
    <span style="color: #ffc107">● Converting</span>
    <span style="color: #4caf50">● Harvesting</span>
    <span style="color: #00bcd4">◆ Liquid</span>
    <span style="color: #e0e0ff">◆ Ice</span>
  `;
  el.appendChild(legend);

  // Store zone hex refs for updates
  let zoneHexes: ZoneHex[] = [];
  let currentPlanetId: string | null = null;

  // Center on the middle hex (0,0), or closest to it
  function findCenterZone(zones: Zone[]): { zone: Zone; index: number } | null {
    // Find zone closest to center (0,0)
    let centerZone: Zone | null = null;
    let centerZoneIndex = -1;
    let minDist = Infinity;

    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      const hex = getSafeZoneHex(zone, i, zones.length);
      const dist = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(hex.s));
      if (dist < minDist) {
        minDist = dist;
        centerZone = zone;
        centerZoneIndex = i;
      }
    }

    if (centerZone && centerZoneIndex >= 0) {
      return { zone: centerZone, index: centerZoneIndex };
    }

    if (zones.length === 0) return null;
    return { zone: zones[0], index: 0 };
  }

  return {
    el,
    update: (gameData: GameData) => {
      // Find current planet (home planet or first accessible)
      const selectedPlanetId = callbacks.getPlanetId?.();
      const planet =
        (selectedPlanetId
          ? gameData.planets.find((p) => p.id === selectedPlanetId)
          : undefined) ??
        gameData.planets.find((p) => p.id === gameData.homePlanetId) ??
        gameData.planets.find((p) => p.accessible);

      if (!planet) return;

      // If planet changed, rebuild hex grid
      if (currentPlanetId !== planet.id) {
        currentPlanetId = planet.id;

        // Clear layers
        while (terrainLayer.firstChild)
          terrainLayer.removeChild(terrainLayer.firstChild);
        while (zoneLayer.firstChild)
          zoneLayer.removeChild(zoneLayer.firstChild);
        while (workerLayer.firstChild)
          workerLayer.removeChild(workerLayer.firstChild);
        while (selectionLayer.firstChild)
          selectionLayer.removeChild(selectionLayer.firstChild);

        zoneHexes = [];

        // Update header
        planetName.textContent = planet.name;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        // Build hex grid for each zone
        for (let i = 0; i < planet.zones.length; i++) {
          const zone = planet.zones[i];
          const safeHex = getSafeZoneHex(zone, i, planet.zones.length);
          const { x, y } = hexToPixel(safeHex.q, safeHex.r);
          minX = Math.min(minX, x - HEX_SIZE);
          maxX = Math.max(maxX, x + HEX_SIZE);
          minY = Math.min(minY, y - HEX_SIZE);
          maxY = Math.max(maxY, y + HEX_SIZE);

          // Create hex group
          const hexGroup = document.createElementNS(SVG_NS, 'g');

          // Hex background
          const hexBg = document.createElementNS(SVG_NS, 'path');
          hexBg.setAttribute('d', createHexPath(x, y));
          hexBg.setAttribute(
            'fill',
            getZoneStateColor(zone, zone.planetId === gameData.homePlanetId)
          );
          hexBg.setAttribute('stroke', '#333');
          hexBg.setAttribute('stroke-width', '0.5');
          hexGroup.appendChild(hexBg);

          // Terrain indicator (small shape in center)
          const terrainColor = getTerrainIndicator(zone);
          if (terrainColor) {
            const terrainMark = document.createElementNS(SVG_NS, 'circle');
            terrainMark.setAttribute('cx', String(x));
            terrainMark.setAttribute('cy', String(y));
            terrainMark.setAttribute('r', '4');
            terrainMark.setAttribute('fill', terrainColor);
            terrainMark.setAttribute('opacity', '0.7');
            hexGroup.appendChild(terrainMark);
          }

          // Atmosphere overlay
          const atmosOpacity = getAtmosphereOpacity(zone);
          if (atmosOpacity > 0) {
            const atmos = document.createElementNS(SVG_NS, 'circle');
            atmos.setAttribute('cx', String(x));
            atmos.setAttribute('cy', String(y));
            atmos.setAttribute('r', String(HEX_SIZE * 0.8));
            atmos.setAttribute('fill', '#87ceeb');
            atmos.setAttribute('opacity', String(atmosOpacity));
            hexGroup.appendChild(atmos);
          }

          // Zone label (for nearby)
          if (
            zone.state !== 'unexplored' ||
            zone.planetId === gameData.homePlanetId
          ) {
            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', String(x));
            label.setAttribute('y', String(y + 3));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute(
              'fill',
              zone.state === 'unexplored' ? '#555' : '#fff'
            );
            label.setAttribute('font-size', '5');

            // Abbreviated name
            const abbrev = zone.name.substring(0, 3).toUpperCase();
            label.textContent = abbrev;
            hexGroup.appendChild(label);
          }

          // Click handler
          hexGroup.style.cursor = 'pointer';
          hexGroup.addEventListener('click', () => {
            if (callbacks.onZoneSelect) {
              callbacks.onZoneSelect(zone.id);
            }
          });

          // Hover effect
          hexGroup.addEventListener('mouseenter', () => {
            hexBg.setAttribute('stroke', '#00e5ff');
            hexBg.setAttribute('stroke-width', '2');
          });
          hexGroup.addEventListener('mouseleave', () => {
            hexBg.setAttribute('stroke', '#333');
            hexBg.setAttribute('stroke-width', '0.5');
          });

          zoneLayer.appendChild(hexGroup);

          zoneHexes.push({
            zone,
            hex: hexGroup,
            label: null as unknown as SVGTextElement,
          });
        }

        // Update zone count
        const conquered = planet.zones.filter(
          (z) => z.state === 'harvesting' || z.state === 'saturated'
        ).length;
        zoneCount.textContent = `${conquered}/${planet.zones.length} zones`;

        // Fit and center view on planet zone bounds
        if (
          Number.isFinite(minX) &&
          Number.isFinite(maxX) &&
          Number.isFinite(minY) &&
          Number.isFinite(maxY)
        ) {
          const padding = HEX_SIZE * 2;
          const spanX = Math.max(1, maxX - minX + padding * 2);
          const spanY = Math.max(1, maxY - minY + padding * 2);
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const fitZoom = Math.max(
            1,
            Math.min(10, Math.min(mapViewSize / spanX, mapViewSize / spanY))
          );
          zoomControls.zoomTo(centerX, centerY, fitZoom, false);
        } else {
          const centerZone = findCenterZone(planet.zones);
          if (centerZone) {
            const centerHex = getSafeZoneHex(
              centerZone.zone,
              centerZone.index,
              planet.zones.length
            );
            const center = hexToPixel(centerHex.q, centerHex.r);
            zoomControls.zoomTo(center.x, center.y, 1, false);
          }
        }
      }

      // Update zone colors (states may change)
      for (let i = 0; i < zoneHexes.length; i++) {
        const { zone, hex } = zoneHexes[i];
        const hexBg = hex.querySelector('path');
        if (hexBg) {
          hexBg.setAttribute(
            'fill',
            getZoneStateColor(zone, zone.planetId === gameData.homePlanetId)
          );
        }

        // Update worker dots for this zone
        const zoneWorkers = gameData.swarm.workers.filter(
          (w) => w.currentZoneId === zone.id
        );

        // Remove old worker dots for this zone
        const oldDots = workerLayer.querySelectorAll(
          `[data-zone="${zone.id}"]`
        );
        oldDots.forEach((dot) => dot.remove());

        // Add worker dots
        const safeHex = getSafeZoneHex(zone, i, zoneHexes.length);
        const { x, y } = hexToPixel(safeHex.q, safeHex.r);
        for (let j = 0; j < Math.min(zoneWorkers.length, 5); j++) {
          const workerDot = document.createElementNS(SVG_NS, 'circle');
          const offsetX = ((j % 3) - 1) * 5;
          const offsetY = (Math.floor(j / 3) - 0.5) * 5;
          workerDot.setAttribute('cx', String(x + offsetX));
          workerDot.setAttribute('cy', String(y + offsetY));
          workerDot.setAttribute('r', '3');
          workerDot.setAttribute('fill', '#00ff88');
          workerDot.setAttribute('stroke', '#fff');
          workerDot.setAttribute('stroke-width', '0.5');
          workerDot.setAttribute('data-zone', zone.id);
          workerDot.style.pointerEvents = 'none';
          workerLayer.appendChild(workerDot);
        }
      }
    },
  };
}
