// Zone System - Zone lifecycle and management

import type { Zone, Worker } from './models/swarmTypes';
import { getPredatorStrengthLabel } from './models/swarmTypes';

// ============================================================================
// ZONE STATE MANAGEMENT
// ============================================================================

export function advanceZoneState(zone: Zone): boolean {
  // Returns true if state changed

  switch (zone.state) {
    case 'unexplored':
      if (zone.progress >= 100) {
        zone.state = 'exploring';
        zone.progress = 0;
        return true;
      }
      break;

    case 'exploring':
      if (zone.progress >= 100) {
        // Check if predators need to be defeated
        if (
          zone.predators &&
          !zone.predators.defeated &&
          zone.predators.strength > 0
        ) {
          zone.state = 'combating';
        } else {
          zone.state = 'converting';
        }
        zone.progress = 0;
        return true;
      }
      break;

    case 'combating':
      // Combat auto-resolved (v2 feature)
      // For v1, skip combat
      if (zone.progress >= 100) {
        zone.state = 'converting';
        zone.progress = 0;
        return true;
      }
      break;

    case 'converting':
      if (zone.progress >= 100) {
        zone.state = 'harvesting';
        zone.progress = 0;
        return true;
      }
      break;

    case 'harvesting':
      // Can stay in harvesting indefinitely
      // Eventually becomes saturated
      if (zone.biomassAvailable <= 0) {
        zone.state = 'saturated';
        zone.progress = 100;
        return true;
      }
      break;

    case 'saturated':
      // Stays saturated, minimal biomass regrowth
      break;
  }

  return false;
}

// ============================================================================
// ZONE PROGRESS
// ============================================================================

export function addZoneProgress(zone: Zone, amount: number): void {
  zone.progress = Math.min(100, zone.progress + amount);
}

// ============================================================================
// WORKER ASSIGNMENT
// ============================================================================

export function assignWorkerToZone(worker: Worker, zone: Zone): void {
  if (!zone.assignedWorkers.includes(worker.id)) {
    zone.assignedWorkers.push(worker.id);
    worker.assignedZoneId = zone.id;
  }
}

export function unassignWorkerFromZone(worker: Worker, zone: Zone): void {
  const index = zone.assignedWorkers.indexOf(worker.id);
  if (index > -1) {
    zone.assignedWorkers.splice(index, 1);
  }
  worker.assignedZoneId = undefined;
}

export function getZoneWorkers(zone: Zone, allWorkers: Worker[]): Worker[] {
  return allWorkers.filter((w) => zone.assignedWorkers.includes(w.id));
}

// ============================================================================
// BIOMASS MANAGEMENT
// ============================================================================

export function depleteZoneBiomass(zone: Zone, amount: number): number {
  // Returns actual amount depleted
  const actualDepletion = Math.min(amount, zone.biomassAvailable);
  zone.biomassAvailable -= actualDepletion;

  // Natural regrowth (slow)
  zone.biomassAvailable = Math.min(
    zone.biomassAvailable + zone.biomassRate * 0.01, // 1% regrowth per tick
    zone.biomassRate * 1000 // Cap at initial amount
  );

  return actualDepletion;
}

export function getZoneBiomassPercentage(zone: Zone): number {
  const maxBiomass = zone.biomassRate * 1000;
  return (zone.biomassAvailable / maxBiomass) * 100;
}

// ============================================================================
// ZONE INFO
// ============================================================================

export interface ZoneInfo {
  id: string;
  name: string;
  state: string;
  progress: number;
  biomassAvailable: number;
  biomassPercentage: number;
  workersAssigned: number;
  predatorStrength?: number;
  predatorLabel?: string;
}

export function getZoneInfo(zone: Zone): ZoneInfo {
  return {
    id: zone.id,
    name: zone.name,
    state: zone.state,
    progress: zone.progress,
    biomassAvailable: zone.biomassAvailable,
    biomassPercentage: getZoneBiomassPercentage(zone),
    workersAssigned: zone.assignedWorkers.length,
    predatorStrength: zone.predators?.strength,
    predatorLabel: zone.predators
      ? getPredatorStrengthLabel(zone.predators.strength)
      : undefined,
  };
}

// ============================================================================
// STATE DISPLAY HELPERS
// ============================================================================

export function getStateDisplayName(state: string): string {
  const displays: Record<string, string> = {
    unexplored: 'Unexplored',
    exploring: 'Exploring',
    combating: 'Combatting Predators',
    converting: 'Converting Ecosystem',
    harvesting: 'Active Harvest',
    saturated: 'Saturated',
  };
  return displays[state] || state;
}

export function getStateDescription(state: string): string {
  const descriptions: Record<string, string> = {
    unexplored: 'Unknown territory. Send workers to explore.',
    exploring: 'Mapping terrain and identifying resources.',
    combating: 'Fighting native resistance.',
    converting: 'Establishing swarm presence.',
    harvesting: 'Active biomass extraction.',
    saturated: 'Maximum extraction reached. Minimal regrowth.',
  };
  return descriptions[state] || '';
}

// ============================================================================
// PROGRESS CALCULATION
// ============================================================================

export function calculateExplorationProgress(
  _zone: Zone,
  workerCount: number
): number {
  void _zone;
  // Progress per tick based on worker count
  // Diminishing returns after 4 workers
  const baseRate = 0.5;
  const efficiency = Math.min(
    workerCount,
    4 + Math.log2(Math.max(1, workerCount - 3))
  );
  return baseRate * efficiency;
}

export function calculateConversionProgress(
  _zone: Zone,
  workerCount: number
): number {
  void _zone;
  // Slower than exploration
  const baseRate = 0.2;
  const efficiency = Math.min(
    workerCount,
    4 + Math.log2(Math.max(1, workerCount - 3))
  );
  return baseRate * efficiency;
}
