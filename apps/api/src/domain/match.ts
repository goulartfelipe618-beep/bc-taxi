import type { MatchConfig } from './types.js';

export const MATCH_CONFIG: MatchConfig = {
  scoreWeights: { d: 0.32, r: 0.18, a: 0.12, c: 0.1, t: 0.08, e: 0.08, k: 0.12 },
  defaultRadiusStagesM: [800, 1500, 2500, 4000, 6500, 10000],
  passengerEliteBonus: 0.06,
  passengerPremiumBonus: 0.03,
  driverEliteBonus: 0.05,
  driverPremiumBonus: 0.025,
  corporateBonus: 0.04,
  sequentialOfferTimeoutSeconds: 6,
  parallelBatchSizeMin: 3,
  parallelBatchSizeMax: 5,
};

export type MatchCandidateInput = {
  etaPickupSeconds: number;
  etaMaxStageSeconds: number;
  rating: number;
  acceptanceRate: number;
  cancellationRate: number;
  onlineMinutesToday: number;
  completedRides: number;
  compatibility: number;
  isPassengerElite?: boolean;
  isPassengerPremium?: boolean;
  isDriverElite?: boolean;
  isDriverPremium?: boolean;
  isCorporate?: boolean;
  isPcdAdapted?: boolean;
  isShared?: boolean;
  extraEtaSeconds?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function normalizeMatchFeatures(input: MatchCandidateInput) {
  const D = clamp(1 - input.etaPickupSeconds / input.etaMaxStageSeconds, 0, 1);
  const R = clamp((input.rating - 4.0) / 1.0, 0, 1);
  const A = clamp((input.acceptanceRate - 0.35) / 0.65, 0, 1);
  const C = clamp(1 - input.cancellationRate / 0.2, 0, 1);
  const T = clamp(input.onlineMinutesToday / 480, 0, 1);
  const E = clamp(Math.log10(input.completedRides + 1) / 4, 0, 1);
  let K = clamp(input.compatibility, 0, 1);
  if (input.isPcdAdapted) K = Math.max(K, 0.95);
  return { D, R, A, C, T, E, K };
}

export function computeMatchScore(input: MatchCandidateInput): number {
  const f = normalizeMatchFeatures(input);
  const w = MATCH_CONFIG.scoreWeights;
  let score =
    w.d * f.D + w.r * f.R + w.a * f.A + w.c * f.C + w.t * f.T + w.e * f.E + w.k * f.K;
  if (input.isPassengerElite) score += MATCH_CONFIG.passengerEliteBonus;
  if (input.isPassengerPremium) score += MATCH_CONFIG.passengerPremiumBonus;
  if (input.isDriverElite) score += MATCH_CONFIG.driverEliteBonus;
  if (input.isDriverPremium) score += MATCH_CONFIG.driverPremiumBonus;
  if (input.isCorporate) score += MATCH_CONFIG.corporateBonus;
  if (input.isShared && input.extraEtaSeconds != null) {
    const detour = clamp(input.extraEtaSeconds / (12 * 60), 0, 0.2);
    score -= detour;
  }
  return score;
}

export const BLOCK_DURATIONS = {
  PASSENGER_CANCEL_DRIVER_24H: 24 * 60 * 60,
  DRIVER_CANCEL_PASSENGER_REDISPATCH: 30 * 60,
  PAIR_RISK_BLOCK_7D: 7 * 24 * 60 * 60,
  PAIR_RISK_BLOCK_24H: 24 * 60 * 60,
};

export function redisBlockKey(passengerId: string, driverId: string) {
  return `match:block:${passengerId}:${driverId}`;
}
