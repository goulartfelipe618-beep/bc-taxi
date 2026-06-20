process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');
  const { getRideTracking } = await import('../src/ride/rideTrackingService.js');
  const { updateDriverLocation } = await import('../src/driver/driverLocationService.js');

  const passengerId = 'camada5-passenger';
  const driverId = 'camada5-driver';
  seedDemoFleetCompliance(driverId, ['economico']);

  await memoryMatchStore.setDriverOnline(driverId, true, -26.991, -48.635);
  const ride = await memoryMatchStore.createRide({
    passengerId,
    categoryCode: 'economico',
    pickupLat: -26.9905,
    pickupLng: -48.6348,
    dropoffLat: -26.985,
    dropoffLng: -48.63,
    pickupAddress: 'Recolha',
    dropoffAddress: 'Destino',
    passengerCount: 1,
    isCorporate: false,
    isShared: false,
    hasPet: false,
    needsWheelchair: false,
  });

  await memoryMatchStore.assignDriverToRide(ride.id, driverId);
  const assigned = await memoryMatchStore.getRide(ride.id);
  if (!assigned || assigned.status !== 'DRIVER_ASSIGNED') {
    throw new Error('Expected DRIVER_ASSIGNED');
  }

  const tracking = await getRideTracking(assigned);
  if (!tracking) throw new Error('Expected tracking snapshot');
  if (!tracking.driver.fullName) throw new Error('Expected driver name');
  if (!tracking.eta?.seconds || tracking.eta.seconds <= 0) throw new Error('Expected positive ETA');
  console.log('Tracking OK:', tracking.driver.fullName, tracking.eta.label, tracking.distanceM, 'm');

  await updateDriverLocation({ driverId, lat: -26.9908, lng: -48.6352 });
  const tracking2 = await getRideTracking(assigned);
  if (!tracking2?.driverLocation) throw new Error('Expected driver location after update');

  console.log('Camada 5 ride tracking tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
