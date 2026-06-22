process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');
  const { activateRouteForRide } = await import('../src/route/routeStore.js');
  const {
    getRideTrackingProductionConfig,
    getRideTrackingProduction,
    listRideTrackingSnapshots,
    seedMemoryRideTrackingProductionConfig,
    __testResetRideTrackingProductionMemory,
    __testGetRideTrackingSnapshots,
  } = await import('../src/ride/rideTrackingProductionService.js');
  const { __testResetRealtimeProductionMemory } = await import(
    '../src/realtime/realtimeProductionService.js'
  );

  __testResetRideTrackingProductionMemory();
  __testResetRealtimeProductionMemory();
  seedMemoryRideTrackingProductionConfig({ snapshotSampleRateBps: 10_000, useActiveRouteEta: true });

  const cfg = await getRideTrackingProductionConfig();
  if (cfg.pollIntervalMs !== 5000) throw new Error('Tracking config mismatch');
  console.log('Ride tracking config OK:', cfg.configVersion);

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
    paymentMethodId: '00000000-0000-4000-8000-000000000001',
  });
  await memoryMatchStore.assignDriverToRide(ride.id, driverId);
  const assigned = (await memoryMatchStore.getRide(ride.id))!;

  const pickupTracking = await getRideTrackingProduction(assigned);
  if (!pickupTracking?.eta || pickupTracking.eta.target !== 'pickup') {
    throw new Error('Expected pickup ETA tracking');
  }
  if (pickupTracking.etaSource !== 'haversine' && pickupTracking.etaSource !== 'blended') {
    throw new Error(`Unexpected pickup eta source: ${pickupTracking.etaSource}`);
  }
  console.log('Pickup tracking OK:', pickupTracking.eta.label);

  await activateRouteForRide({
    rideId: ride.id,
    strategy: 'fastest',
    distanceM: 5200,
    etaSeconds: 420,
    tollsTotalCentavos: 0,
    trafficLevelIndex: 0.35,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-48.6348, -26.99],
        [-48.9, -26.95],
        [-49.0661, -26.9194],
      ],
    },
    driverLat: -26.99,
    driverLng: -48.6348,
  });

  await memoryMatchStore.updateRideStatus(ride.id, 'IN_PROGRESS');
  const inProgress = (await memoryMatchStore.getRide(ride.id))!;

  const dropoffTracking = await getRideTrackingProduction(inProgress);
  if (!dropoffTracking) throw new Error('Tracking missing for IN_PROGRESS');
  if (dropoffTracking.etaSource !== 'active_route') {
    throw new Error(`Expected active_route ETA, got ${dropoffTracking.etaSource}`);
  }
  if (dropoffTracking.eta?.seconds !== 420) {
    throw new Error(`Expected route ETA 420s, got ${dropoffTracking.eta?.seconds}`);
  }
  if (!dropoffTracking.route?.routePolyline) throw new Error('Route polyline missing');
  if (dropoffTracking.pollIntervalMs !== 5000) throw new Error('pollIntervalMs missing');
  console.log('In-progress route tracking OK:', dropoffTracking.eta?.label);

  const snapshots = __testGetRideTrackingSnapshots();
  if (snapshots.length < 2) throw new Error(`Expected tracking snapshots, got ${snapshots.length}`);
  const listed = await listRideTrackingSnapshots(ride.id);
  if (listed.length < 2) throw new Error('listRideTrackingSnapshots failed');
  console.log('Tracking snapshots OK:', listed.length);

  console.log('\nCamada 45 — ride tracking produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
