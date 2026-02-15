// TRAPPIST-1 Orrery Component - System Map Visualization
// Based on navigationView.ts pattern with zoom/pan from mapZoomPan.ts

import type { GameData, Planet } from '../models/swarmTypes';
import type { Component } from './component';
import { setupMapZoomPan, type MapZoomPanControls } from './mapZoomPan';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ORRERY_SIZE = 400;
const ORRERY_HALF = ORRERY_SIZE / 2;

// Scale: 0.063 AU (outermost planet) -> ~160px from center
const MAX_DISTANCE_AU = 0.07;
const MAX_SVG_RADIUS = 160;
const AU_TO_SVG_SCALE = MAX_SVG_RADIUS / MAX_DISTANCE_AU;

export interface OrreryCallbacks {
  onPlanetSelect?: (planetId: string) => void;
  onPlanetFocus?: (planetId: string) => void; // Zoom into planet view
}

interface PlanetMarker {
  planet: Planet;
  dot: SVGElement;
  label: SVGTextElement;
  orbitPath: SVGPathElement | null;
  hitArea: SVGCircleElement;
}

function createHexPath(cx: number, cy: number, size: number): string {
  let path = '';
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    path += `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }
  path += 'Z';
  return path;
}

function createPlanetMarker(
  planet: Planet,
  callbacks: OrreryCallbacks,
  planetGroup: SVGGElement,
  orbitGroup: SVGGElement
): PlanetMarker {
  // Create orbit path (elliptical)
  const orbitPath = createOrbitPath(planet);
  orbitGroup.appendChild(orbitPath);

  // Get SVG position - with guards for invalid values
  const AU_IN_KM = 149597870.7;
  const planetX = Number(planet.x) || 0;
  const planetY = Number(planet.y) || 0;

  const distanceAU =
    Math.sqrt(planetX * planetX + planetY * planetY) / AU_IN_KM;
  const svgRadius = distanceAU * AU_TO_SVG_SCALE;
  const angle = Math.atan2(planetY, planetX);
  const svgX = svgRadius * Math.cos(angle);
  const svgY = svgRadius * Math.sin(angle);

  // Create planet dot (hex shape)
  const dot = document.createElementNS(SVG_NS, 'path');
  dot.setAttribute('d', createHexPath(svgX, svgY, 4));
  dot.setAttribute('fill', getPlanetColor(planet.trappistId));
  dot.setAttribute('stroke', planet.accessible ? '#00e5ff' : '#333');
  dot.setAttribute('stroke-width', planet.accessible ? '2' : '1');
  dot.style.cursor = 'pointer';
  planetGroup.appendChild(dot);

  // Create label
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', String(svgX));
  label.setAttribute('y', String(svgY + 12));
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('fill', planet.accessible ? '#ccc' : '#555');
  label.setAttribute('font-size', '6');
  label.textContent = planet.name.split(' (')[0];
  planetGroup.appendChild(label);

  // Create invisible hit area for clicking
  const hitArea = document.createElementNS(SVG_NS, 'circle');
  hitArea.setAttribute('cx', String(svgX));
  hitArea.setAttribute('cy', String(svgY));
  hitArea.setAttribute('r', '15');
  hitArea.setAttribute('fill', 'transparent');
  hitArea.style.cursor = 'pointer';

  // Click to zoom into planet (focus mode)
  hitArea.addEventListener('click', (e) => {
    e.stopPropagation();
    if (callbacks.onPlanetFocus) {
      callbacks.onPlanetFocus(planet.id);
    }
  });

  // Hover effect
  hitArea.addEventListener('mouseenter', () => {
    dot.setAttribute('stroke', planet.accessible ? '#00e5ff' : '#666');
    dot.setAttribute('stroke-width', '2');
  });
  hitArea.addEventListener('mouseleave', () => {
    dot.setAttribute('stroke', planet.accessible ? '#00e5ff' : '#333');
    dot.setAttribute('stroke-width', planet.accessible ? '2' : '1');
  });

  planetGroup.appendChild(hitArea);

  return {
    planet,
    dot,
    label,
    orbitPath,
    hitArea,
  };
}

function createOrbitPath(planet: Planet): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');

  const semiMajorAxisAU = planet.distanceAU ?? 0.02;
  const eccentricity = planet.eccentricity ?? 0;

  // Guard against invalid values
  if (!semiMajorAxisAU || semiMajorAxisAU <= 0) {
    path.setAttribute('d', 'M0,0L0,0');
    return path;
  }

  // Generate elliptical orbit path
  const points: string[] = [];
  const numPoints = 72;

  for (let i = 0; i <= numPoints; i++) {
    const theta = (2 * Math.PI * i) / numPoints;
    const rAU =
      eccentricity === 0
        ? semiMajorAxisAU
        : (semiMajorAxisAU * (1 - eccentricity * eccentricity)) /
          (1 + eccentricity * Math.cos(theta));

    const svgRadius = rAU * AU_TO_SVG_SCALE;
    const x = svgRadius * Math.cos(theta);
    const y = svgRadius * Math.sin(theta);

    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }

  points.push('Z');

  path.setAttribute('d', points.join(' '));
  path.setAttribute('fill', 'none');
  path.setAttribute(
    'stroke',
    planet.accessible ? 'rgba(74, 158, 255, 0.3)' : 'rgba(100, 100, 100, 0.2)'
  );
  path.setAttribute('stroke-width', '0.5');
  path.setAttribute('stroke-dasharray', '2,2');

  return path;
}

function getPlanetColor(trappistId: string): string {
  const colors: Record<string, string> = {
    b: '#ff6b6b',
    c: '#ff9f43',
    d: '#feca57',
    e: '#48dbfb',
    f: '#0abde3',
    g: '#2980b9',
    h: '#5f27cd',
  };
  return colors[trappistId] || '#888';
}

export function createOrreryComponent(
  container: HTMLElement,
  gameData: GameData,
  callbacks: OrreryCallbacks
): Component<GameData> {
  // Create main container for orrery (includes zoom controls)
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
  `;
  container.appendChild(wrapper);

  // Header with planet focus buttons
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border-color, #2a2a3a);
    max-height: 80px;
    overflow-y: auto;
  `;

  // Create focus buttons for each accessible planet
  for (const planet of gameData.planets) {
    const btn = document.createElement('button');
    btn.textContent = planet.name.split(' (')[0];
    btn.style.cssText = `
      background: ${planet.id === gameData.homePlanetId ? '#1a3a3a' : '#2a2a3a'};
      border: 1px solid ${planet.id === gameData.homePlanetId ? '#00e5ff' : '#444'};
      color: ${planet.accessible ? '#fff' : '#666'};
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      cursor: ${planet.accessible ? 'pointer' : 'not-allowed'};
      font-size: 0.75rem;
      opacity: ${planet.accessible ? '1' : '0.5'};
    `;
    if (planet.accessible) {
      btn.onclick = () => {
        if (callbacks.onPlanetFocus) {
          callbacks.onPlanetFocus(planet.id);
        }
      };
    }
    header.appendChild(btn);
  }
  wrapper.appendChild(header);

  // Map container (for zoom controls)
  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = `
    flex: 1;
    position: relative;
    overflow: hidden;
  `;
  wrapper.appendChild(mapContainer);

  // Create SVG element
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute(
    'viewBox',
    `${-ORRERY_HALF} ${-ORRERY_HALF} ${ORRERY_SIZE} ${ORRERY_SIZE}`
  );
  svg.style.display = 'block';
  mapContainer.appendChild(svg);

  // Set up zoom/pan controls with 2x default zoom
  const zoomControls: MapZoomPanControls = setupMapZoomPan(svg, mapContainer, {
    startZoom: 2,
  });

  // Style zoom buttons
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

  // Style reset button - use CSS class and override position
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

  // Create star at center
  const star = document.createElementNS(SVG_NS, 'circle');
  star.setAttribute('cx', '0');
  star.setAttribute('cy', '0');
  star.setAttribute('r', '6');
  star.setAttribute('fill', '#ffd700');
  star.setAttribute('stroke', '#ffaa00');
  star.setAttribute('stroke-width', '1');
  svg.appendChild(star);

  // Star label
  const starLabel = document.createElementNS(SVG_NS, 'text');
  starLabel.setAttribute('x', '0');
  starLabel.setAttribute('y', '14');
  starLabel.setAttribute('text-anchor', 'middle');
  starLabel.setAttribute('fill', '#888');
  starLabel.setAttribute('font-size', '7');
  starLabel.textContent = 'TRAPPIST-1';
  svg.appendChild(starLabel);

  // Create orbit group (behind planets)
  const orbitGroup = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(orbitGroup);

  // Create planet group
  const planetGroup = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(planetGroup);

  // Store planet markers
  const markers = new Map<string, PlanetMarker>();

  // Create markers for each planet
  for (const planet of gameData.planets) {
    const marker = createPlanetMarker(
      planet,
      callbacks,
      planetGroup,
      orbitGroup
    );
    markers.set(planet.id, marker);
  }

  return {
    el: wrapper,
    update: (gameData: GameData) => {
      // Update planet positions based on their x,y coordinates
      for (const planet of gameData.planets) {
        const marker = markers.get(planet.id);
        if (!marker) continue;

        // Convert km position to SVG coordinates
        const AU_IN_KM = 149597870.7;
        const planetX = Number(planet.x) || 0;
        const planetY = Number(planet.y) || 0;
        const distanceAU =
          Math.sqrt(planetX * planetX + planetY * planetY) / AU_IN_KM;
        const svgRadius = distanceAU * AU_TO_SVG_SCALE;
        const angle = Math.atan2(planetY, planetX);

        const svgX = svgRadius * Math.cos(angle);
        const svgY = svgRadius * Math.sin(angle);

        // Update dot position (hex shape)
        marker.dot.setAttribute(
          'd',
          createHexPath(svgX, svgY, planet.id === gameData.homePlanetId ? 5 : 4)
        );

        // Update label position
        marker.label.setAttribute('x', String(svgX));
        marker.label.setAttribute('y', String(svgY + 12));

        // Update hit area
        marker.hitArea.setAttribute('cx', String(svgX));
        marker.hitArea.setAttribute('cy', String(svgY));

        // Update accessibility styling
        if (planet.accessible) {
          marker.dot.setAttribute('opacity', '1');
          marker.label.setAttribute('opacity', '1');
          marker.label.setAttribute('fill', '#ccc');
        } else {
          marker.dot.setAttribute('opacity', '0.4');
          marker.label.setAttribute('opacity', '0.4');
          marker.label.setAttribute('fill', '#555');
        }

        // Highlight accessible planets
        const isAccessible = planet.accessible;
        marker.dot.setAttribute('stroke', isAccessible ? '#00e5ff' : '#333');
        marker.dot.setAttribute('stroke-width', isAccessible ? '2' : '1');
      }
    },
  };
}
