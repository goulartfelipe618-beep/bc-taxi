import { getDynamicMultiplier, refreshDynamicPricing, type DynamicPricingFactors } from './dynamicPricingService.js';
import {
  appendCalculationLog,
  getRideDynamicLock,
  saveRideDynamicLock,
} from './dynamicPricingGuardStore.js';

export async function lockDynamicMultiplierForRide(input: {
  rideId: string;
  categoryCode: string;
  regionId: string;
  lockedMultiplier: number;
  factors: DynamicPricingFactors;
  calculationLogId?: string;
}) {
  return saveRideDynamicLock(input);
}

export async function resolveDynamicMultiplierForRide(input: {
  rideId?: string;
  categoryCode: import('../domain/types.js').RideCategoryCode;
  regionId: string;
  context?: { lat?: number; lng?: number };
}): Promise<number> {
  if (input.rideId) {
    const lock = await getRideDynamicLock(input.rideId);
    if (lock) return lock.lockedMultiplier;
  }

  return getDynamicMultiplier(input.categoryCode, input.regionId, {
    lat: input.context?.lat,
    lng: input.context?.lng,
  });
}

export async function lockMultiplierFromFreshQuote(input: {
  rideId: string;
  categoryCode: import('../domain/types.js').RideCategoryCode;
  regionId: string;
  context?: { lat?: number; lng?: number };
}) {
  const snapshot = await refreshDynamicPricing(input.categoryCode, input.regionId, input.context);
  const logId = await appendCalculationLog({
    regionId: input.regionId,
    categoryCode: input.categoryCode,
    multiplierRaw: snapshot.multiplierEffective,
    multiplierEffective: snapshot.multiplierEffective,
    factors: snapshot.factors,
    guardFlags: snapshot.guardFlags ?? [],
  });

  await lockDynamicMultiplierForRide({
    rideId: input.rideId,
    categoryCode: input.categoryCode,
    regionId: input.regionId,
    lockedMultiplier: snapshot.multiplierEffective,
    factors: snapshot.factors,
    calculationLogId: logId,
  });

  return snapshot;
}

export { getRideDynamicLock };
