import type { DynamicPricingFactors } from './dynamicPricingService.js';
import type { DynamicGuardFlags } from './dynamicPricingGuardStore.js';

export const DYNAMIC_PRICING_CALC_VERSION = 'camada24-v1';
export const HYSTERESIS_THRESHOLD = 0.05;
export const SPIKE_WINDOW_MS = 10 * 60_000;
export const SPIKE_MAX_INCREASE = 0.3;
export const SPIKE_VALIDATED_CAP_INCREASE = 0.15;
export const EMA_ALPHA = 0.35;

export function applyEmaSmoothing(previous: number | undefined, raw: number): number {
  if (previous == null) return raw;
  return EMA_ALPHA * raw + (1 - EMA_ALPHA) * previous;
}

export function applyHysteresis(previous: number | undefined, candidate: number): {
  value: number;
  held: boolean;
} {
  if (previous == null) return { value: candidate, held: false };
  if (Math.abs(candidate - previous) < HYSTERESIS_THRESHOLD) {
    return { value: previous, held: true };
  }
  return { value: candidate, held: false };
}

export function applyMinSampleGuard(input: {
  multiplierCandidate: number;
  previousMultiplier?: number;
  recentRequestCount: number;
  onlineDrivers: number;
  minSampleRequests: number;
  minOnlineDrivers: number;
}): { value: number; flagged: boolean } {
  const sampleOk =
    input.recentRequestCount >= input.minSampleRequests &&
    input.onlineDrivers >= input.minOnlineDrivers;

  if (sampleOk) return { value: input.multiplierCandidate, flagged: false };

  const baseline = input.previousMultiplier ?? 1;
  if (input.multiplierCandidate <= baseline) {
    return { value: input.multiplierCandidate, flagged: false };
  }

  return { value: baseline, flagged: true };
}

export function applySpikeGuard(input: {
  previousMultiplier?: number;
  candidate: number;
  recentEffectiveMultipliers: number[];
}): { value: number; flagged: boolean } {
  const prev = input.previousMultiplier ?? 1;
  const oldestInWindow = input.recentEffectiveMultipliers.at(-1) ?? prev;
  const jumpFromWindow = input.candidate - oldestInWindow;

  if (jumpFromWindow <= SPIKE_MAX_INCREASE) {
    return { value: input.candidate, flagged: false };
  }

  return {
    value: Math.min(input.candidate, oldestInWindow + SPIKE_VALIDATED_CAP_INCREASE),
    flagged: true,
  };
}

export function applyConservativeAndRegulatoryCaps(input: {
  candidate: number;
  categoryCap: number;
  regulatoryMaxMultiplier: number;
  conservativeMode: boolean;
  conservativeMaxMultiplier: number;
}): { value: number; flags: DynamicGuardFlags[] } {
  const flags: DynamicGuardFlags[] = [];
  let value = input.candidate;

  if (input.conservativeMode && value > input.conservativeMaxMultiplier) {
    value = input.conservativeMaxMultiplier;
    flags.push('CONSERVATIVE_MODE', 'GPS_FRAUD_CONSERVATIVE');
  }

  if (value > input.regulatoryMaxMultiplier) {
    value = input.regulatoryMaxMultiplier;
    flags.push('REGULATORY_CAP');
  }

  if (value > input.categoryCap) {
    value = input.categoryCap;
  }

  return { value, flags };
}

export function finalizeDynamicMultiplier(input: {
  multiplierRaw: number;
  previousMultiplier?: number;
  recentEffectiveMultipliers: number[];
  recentRequestCount: number;
  onlineDrivers: number;
  categoryCap: number;
  regulatoryMaxMultiplier: number;
  minSampleRequests: number;
  minOnlineDrivers: number;
  conservativeMode: boolean;
  conservativeMaxMultiplier: number;
}): {
  multiplierEffective: number;
  guardFlags: DynamicGuardFlags[];
  emaValue: number;
} {
  const guardFlags: DynamicGuardFlags[] = [];
  const emaValue = applyEmaSmoothing(input.previousMultiplier, input.multiplierRaw);

  const sample = applyMinSampleGuard({
    multiplierCandidate: emaValue,
    previousMultiplier: input.previousMultiplier,
    recentRequestCount: input.recentRequestCount,
    onlineDrivers: input.onlineDrivers,
    minSampleRequests: input.minSampleRequests,
    minOnlineDrivers: input.minOnlineDrivers,
  });
  if (sample.flagged) guardFlags.push('MIN_SAMPLE_HOLD');

  const spike = applySpikeGuard({
    previousMultiplier: input.previousMultiplier,
    candidate: sample.value,
    recentEffectiveMultipliers: input.recentEffectiveMultipliers,
  });
  if (spike.flagged) guardFlags.push('SPIKE_CAPPED');

  const hysteresis = applyHysteresis(input.previousMultiplier, spike.value);
  if (hysteresis.held) guardFlags.push('HYSTERESIS_HOLD');

  const capped = applyConservativeAndRegulatoryCaps({
    candidate: hysteresis.value,
    categoryCap: input.categoryCap,
    regulatoryMaxMultiplier: input.regulatoryMaxMultiplier,
    conservativeMode: input.conservativeMode,
    conservativeMaxMultiplier: input.conservativeMaxMultiplier,
  });
  guardFlags.push(...capped.flags);

  return {
    multiplierEffective: Math.max(1, capped.value),
    guardFlags,
    emaValue,
  };
}

export function buildPublicDynamicStatus(input: {
  categoryCode: string;
  regionId: string;
  multiplierEffective: number;
  multiplierRaw: number;
  factors: DynamicPricingFactors;
  guardFlags: DynamicGuardFlags[];
  calculationVersion?: string;
}) {
  return {
    categoryCode: input.categoryCode,
    regionId: input.regionId,
    multiplierEffective: input.multiplierEffective,
    multiplierRaw: input.multiplierRaw,
    factors: input.factors,
    guardFlags: input.guardFlags,
    calculationVersion: input.calculationVersion ?? DYNAMIC_PRICING_CALC_VERSION,
  };
}
