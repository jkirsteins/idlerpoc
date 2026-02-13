import { describe, it, expect } from 'vitest';
import {
  applyPassiveTraining,
  calculateTickTraining,
} from '../skillProgression';
import type { JobSlotType } from '../models';
import { createTestShip, createTestCrew, assignCrewToJob } from './testHelpers';
import { createInitialMastery } from '../masterySystem';

// ── Helpers ─────────────────────────────────────────────────────

function createMinerCrew(miningSkill = 15) {
  return createTestCrew({
    name: 'Test Miner',
    role: 'miner',
    skills: { piloting: 5, mining: miningSkill, commerce: 0, repairs: 0 },
    mastery: createInitialMastery(),
  });
}

function createPilotCrew(pilotingSkill = 20) {
  return createTestCrew({
    name: 'Test Pilot',
    role: 'pilot',
    skills: { piloting: pilotingSkill, mining: 0, commerce: 0, repairs: 0 },
    mastery: createInitialMastery(),
  });
}

// ── calculateTickTraining ───────────────────────────────────────

describe('calculateTickTraining', () => {
  it('returns mining skill for mining_ops job slot', () => {
    const miner = createMinerCrew(10);
    const result = calculateTickTraining(miner, 'mining_ops');
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('mining');
    expect(result!.gain).toBeGreaterThan(0);
  });

  it('returns piloting skill for helm job slot', () => {
    const pilot = createPilotCrew(10);
    const result = calculateTickTraining(pilot, 'helm');
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('piloting');
    expect(result!.gain).toBeGreaterThan(0);
  });

  it('returns null for null job slot', () => {
    const crew = createMinerCrew();
    const result = calculateTickTraining(crew, null);
    expect(result).toBeNull();
  });

  it('returns null for passive job slots (patient, rest)', () => {
    const crew = createMinerCrew();
    expect(calculateTickTraining(crew, 'patient')).toBeNull();
    expect(calculateTickTraining(crew, 'rest')).toBeNull();
  });
});

// ── applyPassiveTraining with excludeJobTypes ───────────────────

describe('applyPassiveTraining', () => {
  it('trains all crew when no exclusions provided', () => {
    const miner = createMinerCrew(0);
    const pilot = createPilotCrew(0);
    const ship = createTestShip({
      crew: [pilot, miner],
      location: { status: 'in_flight' },
    });

    assignCrewToJob(ship, pilot.id, 'helm');
    assignCrewToJob(ship, miner.id, 'mining_ops');

    const initialMining = miner.skills.mining;
    const initialPiloting = pilot.skills.piloting;

    applyPassiveTraining(ship);

    expect(miner.skills.mining).toBeGreaterThan(initialMining);
    expect(pilot.skills.piloting).toBeGreaterThan(initialPiloting);
  });

  it('excludes mining_ops when passed in excludeJobTypes', () => {
    const miner = createMinerCrew(0);
    const pilot = createPilotCrew(0);
    const ship = createTestShip({
      crew: [pilot, miner],
      location: { status: 'in_flight' },
    });

    assignCrewToJob(ship, pilot.id, 'helm');
    assignCrewToJob(ship, miner.id, 'mining_ops');

    const initialMining = miner.skills.mining;
    const initialPiloting = pilot.skills.piloting;

    const excludeSet = new Set<JobSlotType>(['mining_ops']);
    applyPassiveTraining(ship, 1.0, excludeSet);

    // Mining skill should NOT have changed
    expect(miner.skills.mining).toBe(initialMining);
    // Piloting skill should still train
    expect(pilot.skills.piloting).toBeGreaterThan(initialPiloting);
  });

  it('does not exclude mining_ops when set is empty', () => {
    const miner = createMinerCrew(0);
    const ship = createTestShip({
      crew: [miner],
      location: { status: 'in_flight' },
    });

    assignCrewToJob(ship, miner.id, 'mining_ops');

    const initialMining = miner.skills.mining;

    applyPassiveTraining(ship, 1.0, new Set());

    expect(miner.skills.mining).toBeGreaterThan(initialMining);
  });

  it('returns skill-up results only for non-excluded crew', () => {
    // Set skills just below integer boundary so a single tick's gain crosses it
    const miner = createMinerCrew(0);
    miner.skills.mining = 0.99;
    const pilot = createPilotCrew(0);
    pilot.skills.piloting = 0.99;

    const ship = createTestShip({
      crew: [pilot, miner],
      location: { status: 'in_flight' },
    });

    assignCrewToJob(ship, pilot.id, 'helm');
    assignCrewToJob(ship, miner.id, 'mining_ops');

    const excludeSet = new Set<JobSlotType>(['mining_ops']);
    const results = applyPassiveTraining(ship, 1.0, excludeSet);

    // Only the pilot should have level-up results
    const miningResults = results.filter((r) => r.skill === 'mining');
    const pilotingResults = results.filter((r) => r.skill === 'piloting');
    expect(miningResults).toHaveLength(0);
    expect(pilotingResults).toHaveLength(1);
  });
});
