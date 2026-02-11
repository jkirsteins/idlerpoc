/**
 * Shared flight profile slider — controls burn fraction for travel.
 *
 * The slider mutates `ship.flightProfileBurnFraction` directly.
 * It is created once and survives rebuilds (interactive element).
 */

import type { GameData, Ship } from '../models';
import { getActiveShip } from '../models';

function getProfileLabel(burnFraction: number): string {
  if (burnFraction >= 0.95) return 'Max Speed';
  if (burnFraction >= 0.75) return 'Fast';
  if (burnFraction >= 0.5) return 'Balanced';
  if (burnFraction >= 0.3) return 'Economical';
  return 'Max Economy';
}

export interface FlightProfileControl {
  el: HTMLElement;
  slider: HTMLInputElement;
  label: HTMLElement;
  /** Update the mutable ship reference so the slider mutates the correct ship. */
  updateShipRef: (ship: Ship) => void;
}

export function createFlightProfileControl(
  gameData: GameData,
  onChange?: () => void
): FlightProfileControl {
  // Mutable reference — updated by updateFlightProfileControl each tick
  // so the slider always mutates the *current* active ship even after
  // the player switches ships (keep-alive tabs survive across switches).
  let currentShip = getActiveShip(gameData);

  const el = document.createElement('div');
  el.className = 'flight-profile-control';
  el.style.cssText = `
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    background: rgba(74, 158, 255, 0.05);
    border: 1px solid #333;
    border-radius: 4px;
  `;

  const header = document.createElement('div');
  header.style.cssText =
    'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';

  const title = document.createElement('span');
  title.style.cssText = 'font-weight: bold; font-size: 0.9rem; color: #ccc;';
  title.textContent = 'Flight Profile';
  header.appendChild(title);

  const label = document.createElement('span');
  label.style.cssText =
    'font-size: 0.85rem; color: #4a9eff; font-weight: bold;';
  label.textContent = `${Math.round(currentShip.flightProfileBurnFraction * 100)}% — ${getProfileLabel(currentShip.flightProfileBurnFraction)}`;
  header.appendChild(label);

  el.appendChild(header);

  // Slider row with labels
  const sliderRow = document.createElement('div');
  sliderRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const leftLabel = document.createElement('span');
  leftLabel.style.cssText =
    'font-size: 0.75rem; color: #888; white-space: nowrap;';
  leftLabel.textContent = 'Economy';
  sliderRow.appendChild(leftLabel);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '10';
  slider.max = '100';
  slider.step = '10';
  slider.value = String(
    Math.round(currentShip.flightProfileBurnFraction * 100)
  );
  slider.style.cssText = 'flex: 1; cursor: pointer;';
  slider.addEventListener('input', () => {
    const fraction = parseInt(slider.value) / 100;
    currentShip.flightProfileBurnFraction = fraction;
    label.textContent = `${slider.value}% — ${getProfileLabel(fraction)}`;
  });
  // Fires on release — triggers flight recalculation when mid-flight
  slider.addEventListener('change', () => {
    if (onChange) onChange();
  });
  sliderRow.appendChild(slider);

  const rightLabel = document.createElement('span');
  rightLabel.style.cssText =
    'font-size: 0.75rem; color: #888; white-space: nowrap;';
  rightLabel.textContent = 'Max Speed';
  sliderRow.appendChild(rightLabel);

  el.appendChild(sliderRow);

  // Description
  const desc = document.createElement('div');
  desc.style.cssText = 'font-size: 0.75rem; color: #666; margin-top: 0.4rem;';
  desc.textContent =
    'Lower = longer coast phase, less fuel. Higher = shorter trip, more fuel.';
  el.appendChild(desc);

  return {
    el,
    slider,
    label,
    updateShipRef: (ship: Ship) => {
      currentShip = ship;
    },
  };
}

export function updateFlightProfileControl(
  control: FlightProfileControl,
  ship: Ship
): void {
  // Always refresh the mutable ref so the slider mutates the right ship
  control.updateShipRef(ship);

  const currentSliderVal = parseInt(control.slider.value);
  const shipVal = Math.round(ship.flightProfileBurnFraction * 100);
  // Only update if the ship value changed externally (e.g. switched ships)
  // Don't overwrite while user is dragging
  if (currentSliderVal !== shipVal) {
    control.slider.value = String(shipVal);
    control.label.textContent = `${shipVal}% — ${getProfileLabel(ship.flightProfileBurnFraction)}`;
  }
}
