process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');
  const { filterEligibleDrivers } = await import('../src/match/eligibility.js');
  const {
    startOnlineSession,
    updateDriverLocation,
    expireStaleOnlineDrivers,
    HEARTBEAT_TIMEOUT_SECONDS,
  } = await import('../src/driver/driverLocationService.js');

  const driverId = 'camada4-test-driver';
  seedDemoFleetCompliance(driverId, ['economico']);

  await memoryMatchStore.setDriverOnline(driverId, true, -26.9905, -48.6348);
  await startOnlineSession(driverId, -26.9905, -48.6348);

  const ride = {
    id: 'ride-1',
    passengerId: 'passenger-1',
    categoryCode: 'economico',
    status: 'REQUESTED' as const,
    pickupLat: -26.9905,
    pickupLng: -48.6348,
    dropoffLat: -26.985,
    dropoffLng: -48.63,
    passengerCount: 1,
    isCorporate: false,
    isShared: false,
    hasPet: false,
    needsWheelchair: false,
    rideVersion: 1,
    matchStage: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let drivers = await memoryMatchStore.findOnlineDrivers();
  let eligible = await filterEligibleDrivers(drivers, ride, { passengerId: 'passenger-1', reputationScore: 4.9 }, 5000);
  if (!eligible.some((d) => d.userId === driverId)) {
    throw new Error('Driver with fresh location should be eligible');
  }
  console.log('Fresh location eligible OK');

  await updateDriverLocation({ driverId, lat: -26.991, lng: -48.635 });
  drivers = await memoryMatchStore.findOnlineDrivers();
  eligible = await filterEligibleDrivers(drivers, ride, { passengerId: 'passenger-1', reputationScore: 4.9 }, 5000);
  if (!eligible.some((d) => d.userId === driverId)) {
    throw new Error('Driver should stay eligible after location update');
  }
  console.log('Location update OK');

  const driver = await memoryMatchStore.getDriver(driverId);
  if (!driver?.locationUpdatedAt) throw new Error('Expected locationUpdatedAt');
  driver.locationUpdatedAt = new Date(Date.now() - 130_000);
  await memoryMatchStore.upsertDriver(driver);

  drivers = await memoryMatchStore.findOnlineDrivers();
  eligible = await filterEligibleDrivers(drivers, ride, { passengerId: 'passenger-1', reputationScore: 4.9 }, 5000);
  if (eligible.some((d) => d.userId === driverId)) {
    throw new Error('Stale location should exclude driver from match');
  }
  console.log('Stale location exclusion OK');

  const session = await import('../src/driver/driverLocationService.js');
  const sessionsMap = new Map<string, { sessionId: string; startedAt: Date; lastHeartbeatAt: Date }>();
  void sessionsMap;
  await memoryMatchStore.setDriverOnline(driverId, true, -26.9905, -48.6348);
  await startOnlineSession(driverId, -26.9905, -48.6348);
  const d2 = await memoryMatchStore.getDriver(driverId);
  if (d2) {
    d2.locationUpdatedAt = new Date();
    await memoryMatchStore.upsertDriver(d2);
  }

  await new Promise((r) => setTimeout(r, 50));
  const expired = await expireStaleOnlineDrivers();
  console.log('Heartbeat janitor ran, expired:', expired, '(timeout', HEARTBEAT_TIMEOUT_SECONDS, 's)');

  console.log('Camada 4 location tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
