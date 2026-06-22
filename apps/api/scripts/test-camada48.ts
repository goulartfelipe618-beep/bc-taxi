process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { config } = await import('../src/config.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');
  const { cancelRide, driverCancelRide } = await import('../src/match/matchService.js');
  const {
    seedMemoryOperationalParams,
    __testResetOperationalParamsMemory,
  } = await import('../src/config/operationalParamsService.js');
  const { __testResetPolicyEnforcementMemory } = await import(
    '../src/config/policyEnforcementService.js'
  );
  const {
    getRideCancellationProductionConfig,
    previewRideCancellation,
    getRideCancellationProduction,
    seedMemoryRideCancellationProductionConfig,
    __testResetRideCancellationProductionMemory,
    __testGetCancellationSnapshots,
  } = await import('../src/ride/rideCancellationProductionService.js');

  __testResetRideCancellationProductionMemory();
  __testResetOperationalParamsMemory();
  __testResetPolicyEnforcementMemory();
  seedMemoryRideCancellationProductionConfig();

  seedMemoryOperationalParams({
    regionId: config.defaultServiceRegionId,
    categoryCode: 'economico',
    params: {
      configVersion: 'test-camada48-v1',
      dynamicCap: 2.4,
      driverDynamicShareBps: 7800,
      searchRadiusStagesM: [900],
      offerTimeoutSeconds: 10,
      cashAllowedMinReputation: 4.25,
      premiumMinReputation: 4.75,
      arrivalWaitPolicy: { includedWaitMinutes: 3, perMinuteCentavos: 100 },
      cancellationFeePolicy: { freeWindowSeconds: 120, feeCentavos: 800 },
      pcdPriorityRules: { matchWeightBonus: 0.1 },
      airportFeeRules: { terminalCongestionCap: 1.15 },
    },
  });

  const cfg = await getRideCancellationProductionConfig();
  if (!cfg.passengerCancelEnabled) throw new Error('Cancellation config mismatch');
  console.log('Cancellation config OK:', cfg.configVersion);

  const driverId = randomUUID();
  const passengerId = randomUUID();
  seedDemoFleetCompliance(driverId, ['economico']);
  await memoryMatchStore.setDriverOnline(driverId, true, -26.99, -48.6348);

  const ride = await memoryMatchStore.createRide({
    passengerId,
    categoryCode: 'economico',
    pickupLat: -26.99,
    pickupLng: -48.6348,
    dropoffLat: -26.9194,
    dropoffLng: -49.0661,
    estimatedFareCentavos: 3200,
    paymentMethodId: '00000000-0000-4000-8000-000000000001',
  });
  await memoryMatchStore.assignDriverToRide(ride.id, driverId);
  await memoryMatchStore.updateRideStatus(ride.id, 'DRIVER_ASSIGNED', {
    assignedAt: new Date(Date.now() - 300_000),
  });
  const assigned = (await memoryMatchStore.getRide(ride.id))!;

  const feePreview = await previewRideCancellation({
    ride: assigned,
    actor: 'passenger',
    reasonCode: 'normal',
  });
  if (!feePreview.canCancel || feePreview.feeCentavos !== 800) {
    throw new Error(`Expected cancel fee 800, got ${feePreview.feeCentavos}`);
  }
  console.log('Passenger fee preview OK:', feePreview.feeLabel);

  const safetyPreview = await previewRideCancellation({
    ride: assigned,
    actor: 'passenger',
    reasonCode: 'safety',
  });
  if (!safetyPreview.feeWaived || safetyPreview.feeCentavos !== 0) {
    throw new Error('Safety reason should waive fee');
  }
  console.log('Safety waiver preview OK');

  const cancelled = await cancelRide(ride.id, passengerId, 'teste');
  if (!cancelled || cancelled.status !== 'CANCELLED') throw new Error('Cancel failed');

  const { recordCancellationProductionSnapshot } = await import(
    '../src/ride/rideCancellationProductionService.js'
  );
  await recordCancellationProductionSnapshot({
    rideId: ride.id,
    cancelledBy: 'passenger',
    priorStatus: 'DRIVER_ASSIGNED',
    feeCentavos: safetyPreview.feeCentavos,
    feeWaived: safetyPreview.feeWaived,
    reasonCode: 'safety',
    reputationImpact: false,
    policyVersion: safetyPreview.policyVersion,
  });

  const snapshot = await getRideCancellationProduction(cancelled);
  if (!snapshot?.feeWaived) throw new Error('Cancellation snapshot missing waiver');
  console.log('Cancellation snapshot OK');

  await memoryMatchStore.releaseDriver(driverId);

  const ride2 = await memoryMatchStore.createRide({
    passengerId,
    categoryCode: 'economico',
    pickupLat: -26.99,
    pickupLng: -48.6348,
    dropoffLat: -26.9194,
    dropoffLng: -49.0661,
    estimatedFareCentavos: 2800,
    paymentMethodId: '00000000-0000-4000-8000-000000000001',
  });
  await memoryMatchStore.assignDriverToRide(ride2.id, driverId);
  const assigned2 = (await memoryMatchStore.getRide(ride2.id))!;
  if (assigned2.driverId !== driverId) throw new Error('Ride2 assign failed');
  await memoryMatchStore.updateRideStatus(ride2.id, 'DRIVER_ARRIVED', {
    arrivedAt: new Date(),
  });
  const arrived = (await memoryMatchStore.getRide(ride2.id))!;

  const driverPreview = await previewRideCancellation({
    ride: arrived,
    actor: 'driver',
    reasonCode: 'normal',
  });
  if (!driverPreview.reputationImpact) throw new Error('Expected driver reputation impact after arrival');

  const driverCancelled = await driverCancelRide(ride2.id, driverId, 'imprevisto');
  if (!driverCancelled) throw new Error('Driver cancel failed');
  await recordCancellationProductionSnapshot({
    rideId: ride2.id,
    cancelledBy: 'driver',
    priorStatus: 'DRIVER_ARRIVED',
    feeCentavos: 0,
    feeWaived: true,
    reasonCode: 'normal',
    reputationImpact: driverPreview.reputationImpact,
    policyVersion: driverPreview.policyVersion,
  });
  console.log('Driver cancel reputation impact OK');

  const snaps = __testGetCancellationSnapshots();
  if (snaps.length !== 2) throw new Error(`Expected 2 snapshots, got ${snaps.length}`);

  console.log('\nCamada 48 — ride cancellation produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
