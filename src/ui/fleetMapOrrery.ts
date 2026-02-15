/**
 * Fleet Map Orrery Component
 *
 * Multi-ship orrery visualization for the Fleet tab. Uses the unified
 * orreryMap component and adds a fleet-specific legend panel.
 *
 * Features:
 * - Shows all ships simultaneously with color coding
 * - Supports overview and cluster focus modes
 * - Click ship to select/switch active ship
 * - Legend shows ships and location types
 */

import type { Component } from './component';
import type { GameData } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import { createOrreryMap } from './orreryMap';
import { type ShipDisplayInfo } from './orreryUpdate';
import { getShipColor } from './shipColors';

export interface FleetMapCallbacks {
  onSelectShip: (shipId: string) => void;
}

export function createFleetMapOrrery(
  gameData: GameData,
  callbacks: FleetMapCallbacks
): Component {
  const container = document.createElement('div');
  container.className = 'fleet-map-orrery';
  container.style.position = 'relative';
  container.style.height = '400px';
  container.style.background = '#0d0d18';
  container.style.border = '1px solid #444';
  container.style.borderRadius = '8px';

  // Build ship display info array
  function buildShipDisplayInfo(gd: GameData): ShipDisplayInfo[] {
    return gd.ships.map((ship) => ({
      shipId: ship.id,
      shipName: ship.name,
      color: getShipColor(ship.id, ship.id === gd.activeShipId),
      locationId: ship.location.dockedAt || ship.location.orbitingAt || null,
      flightPlan: ship.activeFlightPlan || null,
      isActive: ship.id === gd.activeShipId,
    }));
  }

  // Create the unified orrery map
  const {
    component: orreryMapComponent,
    updateWithShips,
    refs: orreryMapRefs,
  } = createOrreryMap(gameData, {
    ships: buildShipDisplayInfo(gameData),
    showZoomControls: true,
    showClusterButtons: true,
    onLocationClick: () => {
      // Fleet Map could add location selection here in the future
    },
  });

  // Setup ship dot click handlers (select ship on click)
  for (const shipDotRef of orreryMapRefs.orreryRefs.shipDotsPool) {
    shipDotRef.dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const shipId = shipDotRef.dot.dataset.shipId;
      if (shipId) callbacks.onSelectShip(shipId);
    });
  }

  container.appendChild(orreryMapComponent.el);

  // Add legend toggle button to zoom controls container
  const legendButton = document.createElement('button');
  legendButton.textContent = 'Legend';
  legendButton.className = 'nav-map-btn';
  // Insert at the beginning so it appears on the left
  orreryMapRefs.zoomControls.controlsContainer.insertBefore(
    legendButton,
    orreryMapRefs.zoomControls.controlsContainer.firstChild
  );

  // Create legend overlay (hidden by default)
  const legend = document.createElement('div');
  legend.className = 'nav-map-legend-panel';
  legend.style.display = 'none';

  // Toggle legend visibility
  let legendVisible = false;
  legendButton.addEventListener('click', () => {
    legendVisible = !legendVisible;
    legend.style.display = legendVisible ? 'block' : 'none';
    legendButton.style.fontWeight = legendVisible ? 'bold' : 'normal';
  });

  // Ships section header
  const shipsHeader = document.createElement('div');
  shipsHeader.textContent = 'Ships';
  shipsHeader.style.fontWeight = 'bold';
  shipsHeader.style.marginBottom = '6px';
  shipsHeader.style.color = '#4a9eff';
  shipsHeader.style.fontSize = '11px';
  legend.appendChild(shipsHeader);

  // Ships list container (will be updated dynamically)
  const shipsList = document.createElement('div');
  shipsList.style.marginBottom = '10px';
  legend.appendChild(shipsList);

  // Location types section header
  const typesHeader = document.createElement('div');
  typesHeader.textContent = 'Locations';
  typesHeader.style.fontWeight = 'bold';
  typesHeader.style.marginBottom = '6px';
  typesHeader.style.color = '#4a9eff';
  typesHeader.style.fontSize = '11px';
  typesHeader.style.borderTop = '1px solid #333';
  typesHeader.style.paddingTop = '8px';
  legend.appendChild(typesHeader);

  // Location types list (static, built once)
  const typesList = document.createElement('div');
  legend.appendChild(typesList);

  // Build location types list
  const worldTypes = new Set(gameData.world.locations.map((loc) => loc.type));
  for (const typeName of worldTypes) {
    const template = getLocationTypeTemplate(typeName);

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
      white-space: nowrap;
    `;

    // Colored circle indicator
    const circle = document.createElement('div');
    circle.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${template.color ?? '#0f3460'};
      flex-shrink: 0;
    `;
    row.appendChild(circle);

    // Type name
    const name = document.createElement('span');
    name.textContent = template.name ?? typeName;
    name.style.color = '#ccc';
    row.appendChild(name);

    typesList.appendChild(row);
  }

  container.appendChild(legend);

  function update(gameData: GameData): void {
    // Build ship display info array
    const ships = buildShipDisplayInfo(gameData);

    // Update orrery map with current ships
    updateWithShips(gameData, ships);

    // Update ships legend
    shipsList.innerHTML = '';
    for (const ship of ships) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 0;
        cursor: pointer;
        white-space: nowrap;
      `;
      if (ship.isActive) {
        row.style.fontWeight = 'bold';
      }

      // Hover effect
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(74, 158, 255, 0.2)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = '';
      });

      // Click to select ship
      row.addEventListener('click', () => {
        callbacks.onSelectShip(ship.shipId);
      });

      // Triangle indicator (matching ship color)
      const triangle = document.createElement('div');
      triangle.style.cssText = `
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-bottom: 7px solid ${ship.color};
        flex-shrink: 0;
      `;
      row.appendChild(triangle);

      // Ship name
      const name = document.createElement('span');
      name.textContent = ship.shipName;
      name.style.color = ship.color;
      row.appendChild(name);

      // Status (docked at X / in flight to Y)
      const status = document.createElement('span');
      status.style.cssText = 'color: #888; font-size: 9px; margin-left: 4px;';
      if (ship.flightPlan) {
        const destLoc = gameData.world.locations.find(
          (l) => l.id === ship.flightPlan!.destination
        );
        status.textContent = `→ ${destLoc?.name ?? 'Unknown'}`;
      } else if (ship.locationId) {
        const loc = gameData.world.locations.find(
          (l) => l.id === ship.locationId
        );
        status.textContent = `@ ${loc?.name ?? 'Unknown'}`;
      }
      row.appendChild(status);

      shipsList.appendChild(row);
    }
  }

  return { el: container, update };
}
