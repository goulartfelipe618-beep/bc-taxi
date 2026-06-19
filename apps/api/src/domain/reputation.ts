import type { ReputationConfig, ReputationTier } from './types.js';

export const REPUTATION_CONFIG: ReputationConfig = {
  driverLambda: 0.0025,
  passengerLambda: 0.0035,
  freshnessBonus: 1.05,
  maxHistoricalWeightRatio: 0.15,
  driverBayesianM: 50,
  passengerBayesianM: 20,
  tiers: {
    elite: { min: 4.9, max: 5.0 },
    premium: { min: 4.8, max: 4.89 },
    confiavel: { min: 4.6, max: 4.79 },
    observacao: { min: 4.3, max: 4.59 },
    restrito: { min: 0, max: 4.29 },
  },
};

export type ReviewInput = {
  stars: number;
  daysAgo: number;
  hasDispute?: boolean;
  isFraudConfirmed?: boolean;
  tripDistanceKm?: number;
  tripDurationMin?: number;
  tripValueCentavos?: number;
  isHighValueTrip?: boolean;
};

function tripWeight(review: ReviewInput): number {
  if (review.isFraudConfirmed) return 0;
  let w = 1;
  if (review.hasDispute) w *= 0.75;
  if (review.tripDistanceKm != null && review.tripDistanceKm < 1.2) w *= 0.85;
  if (review.tripDurationMin != null && review.tripDurationMin < 4) w *= 0.85;
  if (review.isHighValueTrip) w *= 1.1;
  return w;
}

function temporalWeight(daysAgo: number, lambda: number, freshnessBonus: number): number {
  let w = Math.exp(-lambda * daysAgo);
  if (daysAgo <= 30) w *= freshnessBonus;
  if (daysAgo > 365) w = Math.min(w, 0.15);
  return w;
}

export function computeWeightedRating(reviews: ReviewInput[], lambda: number): number {
  let num = 0;
  let den = 0;
  for (const r of reviews) {
    const w = temporalWeight(r.daysAgo, lambda, REPUTATION_CONFIG.freshnessBonus) * tripWeight(r);
    if (w <= 0) continue;
    num += r.stars * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export function applyBayesianSmoothing(rating: number, weightedCount: number, m: number, globalMean = 4.7): number {
  return (weightedCount / (weightedCount + m)) * rating + (m / (weightedCount + m)) * globalMean;
}

export function getTier(rating: number): ReputationTier {
  for (const [tier, range] of Object.entries(REPUTATION_CONFIG.tiers) as [ReputationTier, { min: number; max: number }][]) {
    if (rating >= range.min && rating <= range.max) return tier;
  }
  return 'restrito';
}

export function driverBlockedCategories(rating: number): string[] {
  const blocked: string[] = [];
  if (rating < 4.1) blocked.push('comfort', 'executivo', 'black', 'aeroporto', 'corporativo');
  if (rating < 3.9) blocked.push('*');
  return blocked;
}

export function passengerBlockedCategories(rating: number): string[] {
  const blocked: string[] = [];
  if (rating < 4.1) blocked.push('comfort', 'executivo', 'black', 'compartilhado');
  return blocked;
}

export const PASSENGER_TIER_BENEFITS = {
  elite: { dispatchPriorityPct: 18, maxWalletDiscountPct: 8 },
  premium: { dispatchPriorityPct: 10, maxWalletDiscountPct: 5 },
  confiavel: { dispatchPriorityPct: 0, maxWalletDiscountPct: 0 },
  observacao: { dispatchPriorityPct: -5, maxWalletDiscountPct: 0 },
  restrito: { dispatchPriorityPct: -15, maxWalletDiscountPct: 0, prepayRequired: true },
};

export const DRIVER_TIER_BENEFITS = {
  elite: { queuePriorityBonusPct: 16, dynamicGainBonusPct: 3 },
  premium: { queuePriorityBonusPct: 9, dynamicGainBonusPct: 0 },
  confiavel: { queuePriorityBonusPct: 0, dynamicGainBonusPct: 0 },
  observacao: { queuePriorityBonusPct: -8, dynamicGainBonusPct: 0 },
  restrito: { queuePriorityBonusPct: -20, dynamicGainBonusPct: 0 },
};
