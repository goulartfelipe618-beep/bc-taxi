process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    applyHysteresis,
    applyMinSampleGuard,
    applySpikeGuard,
    finalizeDynamicMultiplier,
  } = await import('../src/pricing/dynamicPricingGuardService.js');
  const { refreshDynamicPricing, computeLiveFactors } = await import('../src/pricing/dynamicPricingService.js');
  const { __testResetMemoryGuards, getRideDynamicLock } = await import('../src/pricing/dynamicPricingGuardStore.js');
  const { lockDynamicMultiplierForRide, resolveDynamicMultiplierForRide } = await import(
    '../src/pricing/rideDynamicLockService.js'
  );
  const { computeDynamicMultiplierRaw } = await import('../src/domain/pricing.js');

  __testResetMemoryGuards();

  const hysteresis = applyHysteresis(1.2, 1.23);
  if (!hysteresis.held || hysteresis.value !== 1.2) throw new Error('Hysteresis should hold small delta');

  const sample = applyMinSampleGuard({
    multiplierCandidate: 1.45,
    previousMultiplier: 1.1,
    recentRequestCount: 1,
    onlineDrivers: 2,
    minSampleRequests: 5,
    minOnlineDrivers: 3,
  });
  if (!sample.flagged || sample.value !== 1.1) throw new Error('Min sample guard failed');

  const spike = applySpikeGuard({
    previousMultiplier: 1.1,
    candidate: 1.55,
    recentEffectiveMultipliers: [1.05],
  });
  if (!spike.flagged || spike.value > 1.25) throw new Error('Spike guard failed');

  const finalized = finalizeDynamicMultiplier({
    multiplierRaw: 1.8,
    previousMultiplier: 1.1,
    recentEffectiveMultipliers: [1.05],
    recentRequestCount: 8,
    onlineDrivers: 6,
    categoryCap: 2.2,
    regulatoryMaxMultiplier: 2.5,
    minSampleRequests: 5,
    minOnlineDrivers: 3,
    conservativeMode: true,
    conservativeMaxMultiplier: 1.15,
  });
  if (finalized.multiplierEffective > 1.15) throw new Error('Conservative cap failed');
  console.log('Guard flags:', finalized.guardFlags);

  const factors = await computeLiveFactors(-26.99, -48.63);
  const raw = computeDynamicMultiplierRaw(factors);
  if (raw < 1) throw new Error('Raw multiplier below 1');

  const snapshot = await refreshDynamicPricing('economico');
  if (!snapshot.calculationVersion.includes('camada24')) throw new Error('Missing calc version');
  console.log('Dynamic snapshot:', snapshot.multiplierEffective, snapshot.guardFlags);

  const rideId = randomUUID();
  await lockDynamicMultiplierForRide({
    rideId,
    categoryCode: 'economico',
    regionId: '00000000-0000-4000-8000-000000000010',
    lockedMultiplier: 1.33,
    factors,
  });
  const lock = await getRideDynamicLock(rideId);
  if (!lock || lock.lockedMultiplier !== 1.33) throw new Error('Ride lock missing');

  await refreshDynamicPricing('economico');
  const resolved = await resolveDynamicMultiplierForRide({
    rideId,
    categoryCode: 'economico',
    regionId: '00000000-0000-4000-8000-000000000010',
  });
  if (resolved !== 1.33) throw new Error('Locked multiplier not honored');

  console.log('Camada 24 advanced dynamic pricing tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
