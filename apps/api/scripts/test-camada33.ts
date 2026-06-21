process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { config } = await import('../src/config.js');
  const {
    seedMemoryOperationalParams,
    seedMemorySegmentPolicy,
    getCategoryOperationalParams,
    getUserSegmentPolicy,
    resolveDynamicCap,
    resolveRadiusStages,
    resolveOfferTimeoutSeconds,
    isPaymentMethodAllowed,
    isPromoEligibleForTier,
    captureRideOperationalConfigSnapshot,
    getRideOperationalConfigSnapshot,
    __testResetOperationalParamsMemory,
  } = await import('../src/config/operationalParamsService.js');
  const { getCategory } = await import('../src/domain/rideCategories.js');

  __testResetOperationalParamsMemory();

  const regionId = config.defaultServiceRegionId;
  seedMemoryOperationalParams({
    regionId,
    categoryCode: 'economico',
    params: {
      configVersion: 'test-camada33-v1',
      dynamicCap: 2.55,
      driverDynamicShareBps: 7900,
      searchRadiusStagesM: [950, 1900, 3200, 5200, 8500, 13000],
      offerTimeoutSeconds: 11,
      cashAllowedMinReputation: 4.25,
      premiumMinReputation: 4.8,
      cancellationFeePolicy: { freeWindowSeconds: 90, feeCentavos: 900 },
    },
  });

  seedMemorySegmentPolicy({
    regionId,
    reputationTier: 'restrito',
    configVersion: 'test-segment-v1',
    dispatchPriorityPct: -20,
    allowedPaymentMethods: ['pix'],
    promoEligible: false,
    sharedRideEligible: false,
    premiumCategoryEligible: false,
    antifraudLevel: 'elevated',
  });

  const domain = getCategory('economico');
  const params = await getCategoryOperationalParams('economico', regionId);
  if (params.configVersion !== 'test-camada33-v1') {
    throw new Error('Expected seeded config version');
  }
  if (params.offerTimeoutSeconds !== 11) throw new Error('Offer timeout override missing');
  if (params.searchRadiusStagesM[0] !== 950) throw new Error('Radius stages override missing');
  if (params.dynamicCap === domain!.dynamicCap) {
    throw new Error('Dynamic cap should differ from static domain default');
  }
  console.log('Operational params:', params.configVersion, 'timeout', params.offerTimeoutSeconds);

  const cap = await resolveDynamicCap('economico', regionId);
  if (cap !== 2.55) throw new Error(`Dynamic cap override failed: ${cap}`);

  const stages = await resolveRadiusStages('economico', regionId);
  if (stages.length !== 6 || stages[0] !== 950) throw new Error('resolveRadiusStages failed');

  const timeout = await resolveOfferTimeoutSeconds('economico', regionId);
  if (timeout !== 11) throw new Error('resolveOfferTimeoutSeconds failed');

  const restrito = await getUserSegmentPolicy('restrito', regionId);
  if (restrito.promoEligible || restrito.allowedPaymentMethods.includes('cash')) {
    throw new Error('Restrito segment policy incorrect');
  }
  if (!(await isPromoEligibleForTier('restrito', regionId))) {
    console.log('Restrito promo blocked OK');
  }
  if (await isPaymentMethodAllowed('cash', 'restrito', regionId)) {
    throw new Error('Cash should be blocked for restrito segment');
  }
  if (!(await isPaymentMethodAllowed('pix', 'restrito', regionId))) {
    throw new Error('PIX should be allowed for restrito segment');
  }

  const rideId = randomUUID();
  await captureRideOperationalConfigSnapshot({
    rideId,
    categoryCode: 'economico',
    regionId,
    reputationTier: 'restrito',
  });
  const snap = await getRideOperationalConfigSnapshot(rideId);
  if (!snap || snap.configVersion !== 'test-camada33-v1') {
    throw new Error('Operational config snapshot missing');
  }
  console.log('Ride config snapshot:', snap.configVersion);

  console.log('Camada 33 operational params tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
