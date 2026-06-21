process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    analyzeCompletedRide,
    analyzeCancelledRide,
    listSuspiciousRideFlags,
    __testResetSuspiciousRideMemory,
    __testSeedPairCompletions,
  } = await import('../src/fraud/suspiciousRideService.js');
  const { getUserRiskScore } = await import('../src/fraud/fraudService.js');

  __testResetSuspiciousRideMemory();

  const passengerId = randomUUID();
  const driverId = randomUUID();

  function baseRide(overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      passengerId,
      driverId,
      categoryCode: 'economico',
      status: 'COMPLETED' as const,
      pickupLat: -26.9194,
      pickupLng: -49.0661,
      dropoffLat: -26.9198,
      dropoffLng: -49.0665,
      passengerCount: 1,
      isCorporate: false,
      isShared: false,
      hasPet: false,
      needsWheelchair: false,
      rideVersion: 1,
      matchStage: 1,
      startedAt: new Date(Date.now() - 8 * 60_000),
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  __testSeedPairCompletions({
    passengerId,
    driverId,
    count: 3,
    distanceM: 400,
  });

  const microFlags = await analyzeCompletedRide(baseRide());
  if (!microFlags.some((f) => f.flagType === 'MICRO_RIDE_REPEAT')) {
    throw new Error('Expected MICRO_RIDE_REPEAT flag');
  }
  console.log('Micro ride flags:', microFlags.map((f) => f.flagType));

  __testSeedPairCompletions({
    passengerId,
    driverId,
    count: 3,
    distanceM: 5000,
  });

  const loopFlags = await analyzeCompletedRide(
    baseRide({
      pickupLat: -26.91,
      pickupLng: -49.06,
      dropoffLat: -26.99,
      dropoffLng: -48.63,
      startedAt: new Date(Date.now() - 20 * 60_000),
    }),
  );
  if (!loopFlags.some((f) => f.flagType === 'PAIR_LOOP')) {
    throw new Error('Expected PAIR_LOOP flag');
  }
  console.log('Pair loop flags:', loopFlags.map((f) => f.flagType));

  const fastFlags = await analyzeCompletedRide(
    baseRide({
      pickupLat: -26.9194,
      pickupLng: -49.0661,
      dropoffLat: -26.9594,
      dropoffLng: -49.1061,
      startedAt: new Date(Date.now() - 60_000),
    }),
  );
  if (!fastFlags.some((f) => f.flagType === 'TOO_FAST_COMPLETE')) {
    throw new Error('Expected TOO_FAST_COMPLETE flag');
  }

  const cancelBase = baseRide({ status: 'CANCELLED', startedAt: undefined, completedAt: undefined });
  for (let i = 0; i < 3; i++) {
    await analyzeCancelledRide({ ...cancelBase, id: randomUUID() });
  }
  const cancelFlags = await analyzeCancelledRide({ ...cancelBase, id: randomUUID() });
  if (!cancelFlags.some((f) => f.flagType === 'COORDINATED_CANCEL')) {
    throw new Error('Expected COORDINATED_CANCEL flag');
  }
  console.log('Cancel flags:', cancelFlags.map((f) => f.flagType));

  const risk = await getUserRiskScore(driverId);
  if (risk <= 0) throw new Error('Driver should accumulate fraud risk from suspicious patterns');

  const allFlags = await listSuspiciousRideFlags({ limit: 20 });
  if (allFlags.length < 4) throw new Error(`Expected multiple flags, got ${allFlags.length}`);

  console.log('Camada 29 suspicious ride detection tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
