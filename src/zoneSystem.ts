// Zone System - Zone lifecycle and management

import type { Zone, Worker, GameData } from './models/swarmTypes';
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
        zone.ownedBySwarm = true;
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
      // Slow regrowth; transition back to harvesting handled in tick processing
      // when biomassAvailable rises above 0.
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
    saturated:
      'Depleted. Slowly recovering — will resume harvest when biomass returns.',
  };
  return descriptions[state] || '';
}

// ============================================================================
// EXPLORABILITY CHECK
// ============================================================================

/**
 * A zone is explorable if it's not yet harvesting/saturated and it neighbors
 * at least one swarm-owned zone. The player can only expand into adjacent
 * territory, creating a natural frontier.
 */
export function isZoneExplorable(zone: Zone, allZones: Zone[]): boolean {
  if (zone.ownedBySwarm) return false;
  if (zone.state === 'harvesting' || zone.state === 'saturated') return false;

  // Check if any neighbor is owned by the swarm
  return zone.neighborIds.some((neighborId) => {
    const neighbor = allZones.find((z) => z.id === neighborId);
    return neighbor?.ownedBySwarm === true;
  });
}

/**
 * Returns all zones that are currently being explored or converted
 * (i.e., have workers assigned and are in a progression state).
 */
export function getActiveProgressionZones(allZones: Zone[]): Zone[] {
  return allZones.filter(
    (z) =>
      !z.ownedBySwarm &&
      z.assignedWorkers.length > 0 &&
      z.state !== 'harvesting' &&
      z.state !== 'saturated'
  );
}

/**
 * Assign idle workers from the queen's zone to a target zone for exploration.
 * Workers are picked from gathering workers in the queen's zone (the default zone).
 * Returns the number of workers actually assigned.
 */
export function assignWorkersToZone(
  gameData: GameData,
  targetZoneId: string,
  count: number
): number {
  const queen = gameData.swarm.queens[0];
  if (!queen) return 0;

  // Find the target zone across all planets
  let targetZone: Zone | undefined;
  for (const planet of gameData.planets) {
    targetZone = planet.zones.find((z) => z.id === targetZoneId);
    if (targetZone) break;
  }
  if (!targetZone) return 0;

  // Pick workers from the queen's zone (unassigned or assigned to queen zone)
  const queenZoneId = queen.locationZoneId;
  const available = gameData.swarm.workers.filter(
    (w) => !w.assignedZoneId || w.assignedZoneId === queenZoneId
  );

  const toAssign = Math.min(count, available.length);
  for (let i = 0; i < toAssign; i++) {
    const worker = available[i];

    // Remove from old zone's assignedWorkers
    if (worker.assignedZoneId) {
      let oldZone: Zone | undefined;
      for (const planet of gameData.planets) {
        oldZone = planet.zones.find((z) => z.id === worker.assignedZoneId);
        if (oldZone) break;
      }
      if (oldZone) {
        const idx = oldZone.assignedWorkers.indexOf(worker.id);
        if (idx > -1) oldZone.assignedWorkers.splice(idx, 1);
      }
    }

    worker.assignedZoneId = targetZoneId;
    worker.currentZoneId = targetZoneId;
    if (!targetZone.assignedWorkers.includes(worker.id)) {
      targetZone.assignedWorkers.push(worker.id);
    }
  }

  return toAssign;
}

/**
 * Recall all workers from a zone back to the queen's zone.
 * Returns the number of workers recalled.
 */
export function recallWorkersFromZone(
  gameData: GameData,
  zoneId: string
): number {
  const queen = gameData.swarm.queens[0];
  if (!queen) return 0;

  const queenZoneId = queen.locationZoneId;

  // Find the zone
  let zone: Zone | undefined;
  for (const planet of gameData.planets) {
    zone = planet.zones.find((z) => z.id === zoneId);
    if (zone) break;
  }
  if (!zone) return 0;

  // Find the queen's zone
  let queenZone: Zone | undefined;
  for (const planet of gameData.planets) {
    queenZone = planet.zones.find((z) => z.id === queenZoneId);
    if (queenZone) break;
  }

  const workers = gameData.swarm.workers.filter(
    (w) => w.assignedZoneId === zoneId
  );

  for (const worker of workers) {
    worker.assignedZoneId = queenZoneId;
    worker.currentZoneId = queenZoneId;
    if (queenZone && !queenZone.assignedWorkers.includes(worker.id)) {
      queenZone.assignedWorkers.push(worker.id);
    }
  }

  // Clear the zone's worker list
  const recalled = zone.assignedWorkers.length;
  zone.assignedWorkers.length = 0;

  return recalled;
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
