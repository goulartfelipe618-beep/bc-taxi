process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { config } = await import('../src/config.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');
  const {
    seedMemoryOperationalParams,
    __testResetOperationalParamsMemory,
  } = await import('../src/config/operationalParamsService.js');
  const {
    getRideLifecycleProductionConfig,
    getRideLifecycleProductionWithDriverCoords,
    maybeAutoMarkArrivedFromLocation,
    evaluatePickupGeofence,
    listRideLifecycleEvents,
    seedMemoryRideLifecycleProductionConfig,
    __testResetRideLifecycleProductionMemory,
    __testGetRideLifecycleEvents,
  } = await import('../src/ride/rideLifecycleProductionService.js');
  const { driverMarkArrived, verifyStartCode } = await import('../src/ride/lifecycleService.js');
  const { getPlainCodesForTest } = await import('../src/ride/codeStore.js');

  __testResetRideLifecycleProductionMemory();
  __testResetOperationalParamsMemory();
  seedMemoryRideLifecycleProductionConfig({
    pickupGeofenceRadiusM: 150,
    autoArrivalMinDwellSeconds: 0,
    lifecyclePollIntervalMs: 3000,
  });
  seedMemoryOperationalParams({
    regionId: config.defaultServiceRegionId,
    categoryCode: 'economico',
    params: {
      configVersion: 'test-camada46-v1',
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

  const cfg = await getRideLifecycleProductionConfig();
  if (cfg.pickupGeofenceRadiusM !== 150) throw new Error('Lifecycle config mismatch');
  console.log('Lifecycle config OK:', cfg.configVersion);

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

  const farGeofence = evaluatePickupGeofence({
    ride: assigned,
    driverLat: -27.05,
    driverLng: -48.7,
    cfg,
  });
  if (farGeofence.inGeofence) throw new Error('Expected outside geofence');
  console.log('Geofence distance OK:', farGeofence.distanceM, 'm');

  const auto = await maybeAutoMarkArrivedFromLocation(ride.id, driverId, -26.9901, -48.6349);
  if (!auto.autoArrived) throw new Error('Expected auto arrival');
  const arrived = (await memoryMatchStore.getRide(ride.id))!;
  if (arrived.status !== 'DRIVER_ARRIVED') throw new Error(`Expected DRIVER_ARRIVED, got ${arrived.status}`);
  console.log('Auto arrival + geofence OK');

  const lifecycle = await getRideLifecycleProductionWithDriverCoords(arrived);
  if (!lifecycle?.waitTimer?.active) throw new Error('Wait timer should be active');
  if (!lifecycle.verification) throw new Error('Verification missing');
  console.log('Wait timer OK — included min:', lifecycle.waitTimer.includedMinutes);

  const plain = getPlainCodesForTest(ride.id);
  if (!plain) throw new Error('Plain codes missing in memory test');
  const verifyDriver = await verifyStartCode(ride.id, passengerId, 'driver', plain.driver);
  if (!verifyDriver.ok) throw new Error('Driver code verify failed');
  const verifyPassenger = await verifyStartCode(ride.id, driverId, 'passenger', plain.passenger);
  if (!verifyPassenger.ok || !verifyPassenger.started) throw new Error('Passenger code verify / start failed');
  console.log('Dual code verification OK');

  const events = __testGetRideLifecycleEvents();
  if (events.length < 2) throw new Error(`Expected lifecycle events (enter+auto), got ${events.length}`);
  const listed = await listRideLifecycleEvents(ride.id);
  if (listed.length < 2) throw new Error('listRideLifecycleEvents failed');
  console.log('Lifecycle events OK:', listed.length);

  console.log('\nCamada 46 — ride lifecycle produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
