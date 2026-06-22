process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');
  const { activateRouteForRide } = await import('../src/route/routeStore.js');
  const { authorizeRidePayment, attachIntentToRide } = await import('../src/payments/paymentService.js');
  const { DEMO_PAYMENT_METHOD_IDS } = await import('../src/payments/paymentStore.js');
  const { seedMemoryPricingRule } = await import('../src/pricing/pricingRuleStore.js');
  const { driverMarkArrived, verifyStartCode, driverCompleteRide } = await import(
    '../src/ride/lifecycleService.js'
  );
  const { getPlainCodesForTest } = await import('../src/ride/codeStore.js');
  const {
    getRideCompletionProductionConfig,
    resolveProductionCompletionFare,
    getRideCompletionProduction,
    seedMemoryRideCompletionProductionConfig,
    __testResetRideCompletionProductionMemory,
    __testGetCompletionSnapshots,
  } = await import('../src/ride/rideCompletionProductionService.js');
  const { getPendingReviewsForUser } = await import('../src/reviews/pendingReviewService.js');

  __testResetRideCompletionProductionMemory();
  seedMemoryRideCompletionProductionConfig({ minTripDurationSeconds: 0, useActualRouteFare: true });

  seedMemoryPricingRule({
    id: 'camada47-rule',
    ruleSetId: 'camada47-set',
    categoryCode: 'economico',
    regionId: '00000000-0000-4000-8000-000000000010',
    baseFareCentavos: 500,
    distanceRateCentavosKm: 220,
    timeRateCentavosMin: 35,
    minimumFareCentavos: 800,
    bookingFeeCentavos: 150,
    trafficCoefficient: 12,
    takeRateBps: 2200,
    driverDynamicShareBps: 7500,
    regulatoryFeeCentavos: 50,
  });

  const cfg = await getRideCompletionProductionConfig();
  if (!cfg.useActualRouteFare) throw new Error('Completion config mismatch');
  console.log('Completion config OK:', cfg.configVersion);

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
    pickupAddress: 'Origem',
    dropoffAddress: 'Destino',
    estimatedFareCentavos: 3200,
    paymentMethodId: DEMO_PAYMENT_METHOD_IDS.card,
  });
  await memoryMatchStore.assignDriverToRide(ride.id, driverId);
  await memoryMatchStore.updateRideStatus(ride.id, 'DRIVER_ARRIVED', {
    arrivedAt: new Date(Date.now() - 4 * 60_000),
  });
  await memoryMatchStore.updateRideStatus(ride.id, 'IN_PROGRESS', {
    startedAt: new Date(Date.now() - 8 * 60_000),
  });
  const inProgress = (await memoryMatchStore.getRide(ride.id))!;

  await activateRouteForRide({
    rideId: ride.id,
    strategy: 'fastest',
    distanceM: 6200,
    etaSeconds: 480,
    tollsTotalCentavos: 0,
    trafficLevelIndex: 0.3,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-48.6348, -26.99],
        [-49.0661, -26.9194],
      ],
    },
    driverLat: -26.99,
    driverLng: -48.6348,
  });

  const farePreview = await resolveProductionCompletionFare(inProgress);
  if (farePreview.fareSource === 'estimated') {
    throw new Error(`Expected route-based fare, got ${farePreview.fareSource}`);
  }
  if (farePreview.routeDistanceM !== 6200) {
    throw new Error(`Expected route distance 6200m, got ${farePreview.routeDistanceM}`);
  }
  console.log('Route fare preview OK:', farePreview.fareSource, farePreview.totalCentavos);

  const { intent } = await authorizeRidePayment({
    userId: passengerId,
    paymentMethodId: DEMO_PAYMENT_METHOD_IDS.card,
    amountCentavos: farePreview.totalCentavos,
    rideId: ride.id,
    idempotencyKey: `camada47-${ride.id}`,
  });
  await attachIntentToRide(ride.id, intent.id);
  await memoryMatchStore.updateRideLifecycle(ride.id, { paymentIntentId: intent.id });

  const completed = await driverCompleteRide(ride.id, driverId);
  if (completed.status !== 'COMPLETED') throw new Error('Ride not completed');
  console.log('Ride completed OK');

  const snapshots = __testGetCompletionSnapshots();
  if (snapshots.length !== 1) throw new Error(`Expected 1 snapshot, got ${snapshots.length}`);
  if (snapshots[0]?.fareSource === 'estimated') throw new Error('Snapshot should use route fare');

  const completion = await getRideCompletionProduction(completed, passengerId);
  if (!completion?.receipt) throw new Error('Receipt missing in completion payload');
  if (!completion.reviewPending) throw new Error('Review obligation missing');
  console.log('Completion payload OK — total:', completion.fare.totalLabel);

  const pending = await getPendingReviewsForUser(passengerId);
  if (pending.length < 1) throw new Error('Pending review not created');
  console.log('Review obligations OK');

  console.log('\nCamada 47 — ride completion produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
