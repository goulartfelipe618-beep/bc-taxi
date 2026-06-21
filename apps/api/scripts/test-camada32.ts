process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    syncAirportQueueFromLocation,
    getDriverQueueStatus,
    listWaitingQueueEntries,
    rankCandidatesForAirportQueue,
    listAirportQueuePools,
    __testResetAirportQueueMemory,
    __testGetAirportQueueEvents,
    __testSeedAirportDriver,
  } = await import('../src/airport/airportQueueService.js');

  __testResetAirportQueueMemory();

  const pools = await listAirportQueuePools();
  if (pools.length < 1) throw new Error('Expected airport queue pool seed');
  const pool = pools[0]!;

  const driverA = randomUUID();
  const driverB = randomUUID();
  const driverC = randomUUID();

  __testSeedAirportDriver({
    userId: driverA,
    lat: pool.centerLat,
    lng: pool.centerLng,
    categories: ['executivo', 'aeroporto'],
  });
  __testSeedAirportDriver({
    userId: driverB,
    lat: pool.centerLat + 0.0001,
    lng: pool.centerLng,
    categories: ['executivo', 'aeroporto'],
  });
  __testSeedAirportDriver({
    userId: driverC,
    lat: pool.centerLat + 0.0002,
    lng: pool.centerLng,
    categories: ['executivo', 'aeroporto'],
  });

  await syncAirportQueueFromLocation(driverA, pool.centerLat, pool.centerLng);
  await syncAirportQueueFromLocation(driverB, pool.centerLat, pool.centerLng);
  await syncAirportQueueFromLocation(driverC, pool.centerLat, pool.centerLng);

  const statusA = await getDriverQueueStatus(driverA);
  const statusB = await getDriverQueueStatus(driverB);
  if (!statusA.inQueue || !statusB.inQueue) throw new Error('Drivers should be in queue');
  if (statusA.entry!.queuePosition >= statusB.entry!.queuePosition) {
    throw new Error('First driver should have better queue position');
  }
  console.log('Queue positions:', statusA.entry!.queuePosition, statusB.entry!.queuePosition);

  const waiting = await listWaitingQueueEntries({ zoneId: pool.zoneId, categoryCode: 'aeroporto' });
  if (waiting.length < 2) throw new Error('Expected waiting queue entries');

  const ride = {
    id: randomUUID(),
    passengerId: randomUUID(),
    categoryCode: 'aeroporto',
    status: 'REQUESTED' as const,
    pickupLat: pool.centerLat,
    pickupLng: pool.centerLng,
    dropoffLat: -26.99,
    dropoffLng: -48.63,
    passengerCount: 1,
    isCorporate: false,
    isShared: false,
    hasPet: false,
    needsWheelchair: false,
    rideVersion: 1,
    matchStage: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const scored = [
    {
      driver: {
        userId: driverC,
        fullName: 'C',
        isOnline: true,
        operationalStatus: 'online' as const,
        lat: pool.centerLat,
        lng: pool.centerLng,
        reputationScore: 4.99,
        completedRides: 2000,
        acceptanceRate: 0.9,
        cancellationRate: 0.02,
        onlineMinutesToday: 300,
        enabledCategories: ['executivo'],
        wheelchairAccessible: false,
        petReady: false,
        comfortApproved: true,
        vehicleType: 'sedan',
      },
      score: 0.95,
      etaPickupS: 120,
      distanceM: 200,
      compatibility: 1,
      featureVector: {},
    },
    {
      driver: {
        userId: driverA,
        fullName: 'A',
        isOnline: true,
        operationalStatus: 'online' as const,
        lat: pool.centerLat,
        lng: pool.centerLng,
        reputationScore: 4.8,
        completedRides: 800,
        acceptanceRate: 0.85,
        cancellationRate: 0.05,
        onlineMinutesToday: 200,
        enabledCategories: ['executivo'],
        wheelchairAccessible: false,
        petReady: false,
        comfortApproved: true,
        vehicleType: 'sedan',
      },
      score: 0.82,
      etaPickupS: 130,
      distanceM: 220,
      compatibility: 1,
      featureVector: {},
    },
  ];

  const ranked = await rankCandidatesForAirportQueue(scored, ride);
  if (ranked[0]!.driver.userId !== driverA) {
    throw new Error('Queue position should beat raw score for aeroporto rides');
  }
  console.log('Ranked first driver:', ranked[0]!.driver.userId.slice(0, 8));

  await syncAirportQueueFromLocation(driverA, -26.95, -48.6);
  const afterLeave = await getDriverQueueStatus(driverA);
  if (afterLeave.inQueue) throw new Error('Driver should leave queue outside geofence');

  const events = __testGetAirportQueueEvents();
  if (!events.some((e) => e.eventType === 'entered') || !events.some((e) => e.eventType === 'exited')) {
    throw new Error('Expected entered and exited queue events');
  }
  console.log('Queue events:', events.map((e) => e.eventType));

  console.log('Camada 32 airport virtual queue tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
