import type { GameData } from '../models';
import { getLocationTypeTemplate } from '../spaceLocations';
import { isLocationReachable } from '../worldGen';

export interface NavigationViewCallbacks {
  onToggleNavigation: () => void;
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

  const currentLocationId =
    gameData.ship.location.dockedAt?.toLowerCase().replace(' ', '_') || 'earth';
  const currentLocation =
    gameData.world.locations.find((loc) => loc.id === currentLocationId) ||
    gameData.world.locations[0];

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

    const name = document.createElement('strong');
    name.textContent = location.name;
    item.appendChild(name);

    const distance = document.createElement('div');
    distance.textContent = `Distance: ${formatDistance(location.distanceFromEarth)}`;
    item.appendChild(distance);

    const description = document.createElement('div');
    description.textContent = location.description;
    description.style.fontSize = '0.9em';
    description.style.color = '#aaa';
    item.appendChild(description);

    legend.appendChild(item);
  }

  container.appendChild(legend);

  return container;
}
