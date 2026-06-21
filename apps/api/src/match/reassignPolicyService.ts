import type { RideRecord } from './types.js';

const AGING_START_MS = 3 * 60 * 1000;
const AGING_MAX_BONUS = 0.08;

export function computeAgingBonus(ride: RideRecord): number {
  const ageMs = Date.now() - ride.createdAt.getTime();
  if (ageMs < AGING_START_MS) return 0;
  const minutes = (ageMs - AGING_START_MS) / 60_000;
  return Math.min(AGING_MAX_BONUS, minutes * 0.01);
}

export function buildAttemptIdempotencyKey(rideId: string, stageNumber: number): string {
  return `${rideId}:stage:${stageNumber}`;
}

export type ReassignAction = 'rotate_sequential' | 'expand_stage' | 'no_drivers' | 'none';

export function decideReassignAction(input: {
  strategy: 'sequential' | 'parallel';
  sequentialCursor: number;
  candidateCount: number;
  stageIndex: number;
  maxStages: number;
}): ReassignAction {
  if (input.strategy === 'sequential' && input.sequentialCursor + 1 < input.candidateCount) {
    return 'rotate_sequential';
  }
  if (input.stageIndex + 1 < input.maxStages) {
    return 'expand_stage';
  }
  return 'no_drivers';
}
