process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { config } = await import('../src/config.js');
  const {
    seedMemoryOperationalParams,
    __testResetOperationalParamsMemory,
  } = await import('../src/config/operationalParamsService.js');
  const {
    computeCancellationFee,
    computeArrivalWaitFee,
    assessPassengerCancellationPolicy,
    assessArrivalWaitPolicy,
    isCashAllowedByPolicy,
    isPremiumCategoryAllowedByPolicy,
    listPolicyChargesForRide,
    __testResetPolicyEnforcementMemory,
    __testGetPolicyEvents,
  } = await import('../src/config/policyEnforcementService.js');

  __testResetOperationalParamsMemory();
  __testResetPolicyEnforcementMemory();

  const regionId = config.defaultServiceRegionId;
  const params = {
    configVersion: 'test-camada35-v1',
    dynamicCap: 2.4,
    driverDynamicShareBps: 7800,
    searchRadiusStagesM: [900, 1800],
    offerTimeoutSeconds: 10,
    cashAllowedMinReputation: 4.25,
    premiumMinReputation: 4.75,
    arrivalWaitPolicy: { includedWaitMinutes: 3, perMinuteCentavos: 100 },
    cancellationFeePolicy: { freeWindowSeconds: 120, feeCentavos: 800 },
    pcdPriorityRules: { matchWeightBonus: 0.1 },
    airportFeeRules: { terminalCongestionCap: 1.15 },
  };

  seedMemoryOperationalParams({ regionId, categoryCode: 'economico', params });

  const baseRide = () => ({
    id: randomUUID(),
    passengerId: randomUUID(),
    categoryCode: 'economico',
    status: 'DRIVER_ASSIGNED' as const,
    pickupLat: -26.99,
    pickupLng: -48.63,
    dropoffLat: -26.98,
    dropoffLng: -48.62,
    passengerCount: 1,
    isCorporate: false,
    isShared: false,
    hasPet: false,
    needsWheelchair: false,
    rideVersion: 1,
    matchStage: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const withinWindow = computeCancellationFee(
    { ...baseRide(), assignedAt: new Date(Date.now() - 60_000) },
    { ...params, regionId, categoryCode: 'economico' },
    'DRIVER_ASSIGNED',
  );
  if (withinWindow.feeCentavos !== 0) throw new Error('Expected no fee within free window');

  const afterWindow = computeCancellationFee(
    { ...baseRide(), assignedAt: new Date(Date.now() - 180_000) },
    { ...params, regionId, categoryCode: 'economico' },
    'DRIVER_ASSIGNED',
  );
  if (afterWindow.feeCentavos !== 800) throw new Error(`Expected cancel fee 800, got ${afterWindow.feeCentavos}`);
  console.log('Cancellation fee after window:', afterWindow.feeCentavos);

  const waitRide = {
    ...baseRide(),
    status: 'IN_PROGRESS' as const,
    arrivedAt: new Date(Date.now() - 8 * 60_000),
    startedAt: new Date(),
  };
  const waitFee = computeArrivalWaitFee(waitRide, { ...params, regionId, categoryCode: 'economico' });
  if (waitFee.feeCentavos !== 500) {
    throw new Error(`Expected wait fee 500 (5 billable min), got ${waitFee.feeCentavos}`);
  }
  console.log('Arrival wait fee:', waitFee.feeCentavos);

  if (await isCashAllowedByPolicy(4.2, 'economico', regionId)) {
    throw new Error('Cash should be blocked below 4.25');
  }
  if (!(await isCashAllowedByPolicy(4.5, 'economico', regionId))) {
    throw new Error('Cash should be allowed at 4.5');
  }
  console.log('Cash policy OK');

  const premiumLowRep = await isPremiumCategoryAllowedByPolicy({
    reputationScore: 4.6,
    categoryCode: 'executivo',
    regionId,
  });
  if (premiumLowRep.allowed || premiumLowRep.reason !== 'below_premium_min_reputation') {
    throw new Error('Premium should be blocked below min reputation');
  }

  const cancelRide = { ...baseRide(), assignedAt: new Date(Date.now() - 200_000) };
  const assessed = await assessPassengerCancellationPolicy(cancelRide, 'DRIVER_ASSIGNED');
  const charges = await listPolicyChargesForRide(cancelRide.id);
  if (assessed.feeCentavos !== 800 || charges.length !== 1) {
    throw new Error('Cancel policy charge not persisted');
  }

  const completedRide = {
    ...baseRide(),
    status: 'IN_PROGRESS' as const,
    arrivedAt: new Date(Date.now() - 10 * 60_000),
    startedAt: new Date(Date.now() - 2 * 60_000),
  };
  const waitAssessed = await assessArrivalWaitPolicy(completedRide);
  if (waitAssessed.feeCentavos <= 0) throw new Error('Wait fee assessment failed');

  const events = __testGetPolicyEvents();
  if (!events.some((e) => e.eventType === 'cancel_fee_assessed')) {
    throw new Error('Missing cancel_fee_assessed event');
  }
  console.log('Policy events:', events.length);

  console.log('Camada 35 policy enforcement tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
