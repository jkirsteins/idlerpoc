import type { GameData } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import { isLocationReachable } from '../worldGen';
import { getGravityDegradationLevel } from '../gravitySystem';

export interface NavigationViewCallbacks {
  onToggleNavigation: () => void;
  onStartTrip?: (destinationId: string) => void;
}

function formatDistance(km: number): string {
  if (km === 0) return 'Current Location';
  if (km < 1000) return `${km} km`;
  if (km < 1_000_000) return `${(km / 1000).toFixed(1)}K km`;
  return `${(km / 1_000_000).toFixed(1)}M km`;
}

export function renderNavigationView(
  gameData: GameData,
  callbacks: NavigationViewCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'navigation-view';

  // Header
  const header = document.createElement('div');
  header.className = 'nav-header';

  const title = document.createElement('h3');
  title.textContent = 'Navigation Chart';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'nav-close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', callbacks.onToggleNavigation);
  header.appendChild(closeBtn);

  container.appendChild(header);

  // Map area
  const mapArea = document.createElement('div');
  mapArea.className = 'nav-map';

  // Get current location (either docked location or flight origin/destination)
  const currentLocationId =
    gameData.ship.location.dockedAt ||
    gameData.ship.location.flight?.destination ||
    'earth';
  const currentLocation =
    gameData.world.locations.find((loc) => loc.id === currentLocationId) ||
    gameData.world.locations[0];

  const canStartTrips =
    gameData.ship.location.status === 'docked' && !gameData.activeContract;

  for (const location of gameData.world.locations) {
    const marker = document.createElement('div');
    marker.className = 'nav-marker';
    marker.style.left = `${location.x}%`;
    marker.style.top = `${location.y}%`;

    const reachable = isLocationReachable(
      gameData.ship,
      location,
      currentLocation
    );

    if (location.id === currentLocationId) {
      marker.classList.add('current');
    }
    if (!reachable) {
      marker.classList.add('unreachable');
    }

    // Make clickable if we can start trips and location is reachable
    if (
      canStartTrips &&
      reachable &&
      location.id !== currentLocationId &&
      callbacks.onStartTrip
    ) {
      marker.classList.add('clickable');
      marker.addEventListener('click', () => {
        if (callbacks.onStartTrip) {
          callbacks.onStartTrip(location.id);
        }
      });
      marker.title = `Click to travel to ${location.name}`;
    }

    const template = getLocationTypeTemplate(location.type);
    const dot = document.createElement('div');
    dot.className = 'nav-marker-dot';
    dot.textContent = template.icon;
    marker.appendChild(dot);

    const label = document.createElement('div');
    label.className = 'nav-marker-label';
    label.textContent = location.name;
    marker.appendChild(label);

    mapArea.appendChild(marker);
  }

  container.appendChild(mapArea);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'nav-legend';

  const legendTitle = document.createElement('h4');
  legendTitle.textContent = 'Locations';
  legend.appendChild(legendTitle);

  for (const location of gameData.world.locations) {
    const reachable = isLocationReachable(
      gameData.ship,
      location,
      currentLocation
    );

    const item = document.createElement('div');
    item.className = 'nav-legend-item';
    if (!reachable) {
      item.classList.add('unreachable');
    }

    // Make clickable if we can start trips and location is reachable
    if (
      canStartTrips &&
      reachable &&
      location.id !== currentLocationId &&
      callbacks.onStartTrip
    ) {
      item.classList.add('clickable');
      item.addEventListener('click', () => {
        if (callbacks.onStartTrip) {
          callbacks.onStartTrip(location.id);
        }
      });
      item.title = `Click to travel to ${location.name}`;
      item.style.cursor = 'pointer';
    }

    const name = document.createElement('strong');
    name.textContent = location.name;
    item.appendChild(name);

    const distanceFromCurrent = Math.abs(
      location.distanceFromEarth - currentLocation.distanceFromEarth
    );
    const distance = document.createElement('div');
    distance.textContent = `Distance: ${formatDistance(distanceFromCurrent)}`;
    item.appendChild(distance);

    const description = document.createElement('div');
    description.textContent = location.description;
    description.style.fontSize = '0.9em';
    description.style.color = '#aaa';
    item.appendChild(description);

    // Gravity warning for degraded crew
    const degradedCrew = gameData.ship.crew.filter(
      (c) => getGravityDegradationLevel(c.zeroGExposure) !== 'none'
    );

    if (
      degradedCrew.length > 0 &&
      location.id !== currentLocationId &&
      reachable
    ) {
      const warning = document.createElement('div');
      warning.style.fontSize = '0.85em';
      warning.style.color = '#fbbf24';
      warning.style.marginTop = '0.25rem';
      warning.textContent = `⚠️ ${degradedCrew.length} crew member${degradedCrew.length > 1 ? 's' : ''} with zero-g atrophy`;
      item.appendChild(warning);
    }

    legend.appendChild(item);
  }

  container.appendChild(legend);

  return container;
}
