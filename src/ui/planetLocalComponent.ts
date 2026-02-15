// TRAPPIST-1 Planet Local View Component
// Shows a planet with its moons orbiting (planet-centric view)
// Adapted from navigationView.ts focus mode in main branch

import type { GameData, Moon } from '../models/swarmTypes';
import type { Component } from './component';
import { setupMapZoomPan, type MapZoomPanControls } from './mapZoomPan';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ORRERY_SIZE = 400;
const ORRERY_HALF = ORRERY_SIZE / 2;

export interface PlanetLocalCallbacks {
  onBackToSystem?: () => void;
  onViewZones?: (planetId: string) => void;
  onViewPlanet?: (planetId: string) => void;
}

interface MoonMarker {
  moon: Moon;
  dot: SVGElement;
  label: SVGTextElement;
  orbitPath: SVGPathElement;
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

function localOrbitalRadiusToSvg(radiusKm: number): number {
  const logMin = Math.log10(5000);
  const logMax = Math.log10(100000);
  const logR = Math.log10(Math.max(radiusKm, 5000));
  const t = (logR - logMin) / (logMax - logMin);
  return 30 + t * 140;
}

export function createPlanetLocalComponent(
  container: HTMLElement,
  _gameData: GameData,
  callbacks: PlanetLocalCallbacks
): Component<GameData> {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
  `;
  container.appendChild(wrapper);

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-color, #2a2a3a);
  `;

  const backBtn = document.createElement('button');
  backBtn.textContent = '← System';
  backBtn.style.cssText = `
    background: transparent;
    border: 1px solid var(--border-color, #444);
    color: var(--text-secondary, #888);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
  `;
  backBtn.onclick = () => {
    if (callbacks.onBackToSystem) callbacks.onBackToSystem();
  };
  header.appendChild(backBtn);

  const title = document.createElement('span');
  title.style.cssText =
    'font-weight: bold; color: var(--accent-cyan, #00e5ff);';
  header.appendChild(title);

  const viewZonesBtn = document.createElement('button');
  viewZonesBtn.textContent = 'View Zones';
  viewZonesBtn.style.cssText = `
    background: var(--accent-cyan, #00e5ff);
    border: none;
    color: #0a0a0f;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    margin-left: auto;
  `;
  header.appendChild(viewZonesBtn);

  wrapper.appendChild(header);

  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = `
    flex: 1;
    position: relative;
    overflow: hidden;
  `;
  wrapper.appendChild(mapContainer);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute(
    'viewBox',
    `${-ORRERY_HALF} ${-ORRERY_HALF} ${ORRERY_SIZE} ${ORRERY_SIZE}`
  );
  svg.style.display = 'block';
  mapContainer.appendChild(svg);

  const zoomControls: MapZoomPanControls = setupMapZoomPan(svg, mapContainer, {
    startZoom: 2,
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

  const ringLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(ringLayer);

  const bodyLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(bodyLayer);

  const planetDot = document.createElementNS(SVG_NS, 'path');
  planetDot.setAttribute('d', createHexPath(0, 0, 12));
  planetDot.setAttribute('fill', '#48dbfb');
  planetDot.setAttribute('stroke', '#00e5ff');
  planetDot.setAttribute('stroke-width', '2');
  bodyLayer.appendChild(planetDot);

  const planetLabel = document.createElementNS(SVG_NS, 'text');
  planetLabel.setAttribute('x', '0');
  planetLabel.setAttribute('y', '20');
  planetLabel.setAttribute('text-anchor', 'middle');
  planetLabel.setAttribute('fill', '#fff');
  planetLabel.setAttribute('font-size', '8');
  bodyLayer.appendChild(planetLabel);

  const moonMarkers: MoonMarker[] = [];
  let currentPlanetId: string | null = null;

  viewZonesBtn.onclick = () => {
    if (callbacks.onViewZones && currentPlanetId) {
      callbacks.onViewZones(currentPlanetId);
    }
  };

  return {
    el: wrapper,
    update: (gameData: GameData) => {
      const planet =
        gameData.planets.find((p) => p.id === gameData.homePlanetId) ??
        gameData.planets.find((p) => p.accessible);

      if (!planet) return;

      if (currentPlanetId !== planet.id) {
        currentPlanetId = planet.id;
        title.textContent = planet.name;
        planetLabel.textContent = planet.name.split(' (')[0];

        while (ringLayer.firstChild) {
          ringLayer.removeChild(ringLayer.firstChild);
        }
        moonMarkers.length = 0;

        const moonDistances = planet.moons.map((m) => m.distance);
        void moonDistances;

        for (const moon of planet.moons) {
          const orbitRadius = localOrbitalRadiusToSvg(moon.distance);

          const orbitPath = document.createElementNS(SVG_NS, 'circle');
          orbitPath.setAttribute('cx', '0');
          orbitPath.setAttribute('cy', '0');
          orbitPath.setAttribute('r', String(orbitRadius));
          orbitPath.setAttribute('fill', 'none');
          orbitPath.setAttribute('stroke', 'rgba(74, 158, 255, 0.3)');
          orbitPath.setAttribute('stroke-width', '0.5');
          orbitPath.setAttribute('stroke-dasharray', '3,3');
          ringLayer.appendChild(orbitPath);

          const angle =
            (moonMarkers.length / Math.max(planet.moons.length, 1)) *
            Math.PI *
            2;
          const moonX = orbitRadius * Math.cos(angle);
          const moonY = orbitRadius * Math.sin(angle);

          const dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('cx', String(moonX));
          dot.setAttribute('cy', String(moonY));
          dot.setAttribute('r', '4');
          dot.setAttribute('fill', '#aaa');
          dot.setAttribute('stroke', '#666');
          dot.setAttribute('stroke-width', '1');
          bodyLayer.appendChild(dot);

          const label = document.createElementNS(SVG_NS, 'text');
          label.setAttribute('x', String(moonX));
          label.setAttribute('y', String(moonY + 10));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('fill', '#888');
          label.setAttribute('font-size', '5');
          label.textContent = moon.name;
          bodyLayer.appendChild(label);

          moonMarkers.push({
            moon,
            dot,
            label,
            orbitPath,
          });
        }

        if (planet.moons.length === 0) {
          const noMoonsLabel = document.createElementNS(SVG_NS, 'text');
          noMoonsLabel.setAttribute('x', '0');
          noMoonsLabel.setAttribute('y', '-25');
          noMoonsLabel.setAttribute('text-anchor', 'middle');
          noMoonsLabel.setAttribute('fill', '#666');
          noMoonsLabel.setAttribute('font-size', '6');
          noMoonsLabel.textContent = 'No satellites';
          ringLayer.appendChild(noMoonsLabel);
        }
      }

      const time = gameData.gameTime * 0.01;
      for (let i = 0; i < moonMarkers.length; i++) {
        const marker = moonMarkers[i];
        const orbitRadius = localOrbitalRadiusToSvg(marker.moon.distance);
        const angle =
          time + (i / Math.max(planet.moons.length, 1)) * Math.PI * 2;
        const moonX = orbitRadius * Math.cos(angle);
        const moonY = orbitRadius * Math.sin(angle);

        marker.dot.setAttribute('cx', String(moonX));
        marker.dot.setAttribute('cy', String(moonY));
        marker.label.setAttribute('x', String(moonX));
        marker.label.setAttribute('y', String(moonY + 10));
      }
    },
  };
}
