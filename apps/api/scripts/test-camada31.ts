process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    computeAgingBonus,
    buildAttemptIdempotencyKey,
    decideReassignAction,
  } = await import('../src/match/reassignPolicyService.js');
  const {
    attemptExistsByIdempotency,
    registerAttemptMeta,
    getMatchTrail,
    __testResetMatchEngineMemory,
    __testRegisterMemoryAttempt,
  } = await import('../src/match/matchEngineRepository.js');
  const {
    scheduleMatchTimeout,
    processDueMatchTimeouts,
    __testResetTimeoutMemory,
    __testGetTimeoutEvents,
  } = await import('../src/match/timeoutHandlerService.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { startMatching, getRide } = await import('../src/match/matchService.js');

  __testResetMatchEngineMemory();
  __testResetTimeoutMemory();
  memoryMatchStore.ensureSeeded();

  const rideId = randomUUID();
  const attemptId = randomUUID();
  const oldRide = {
    id: rideId,
    passengerId: randomUUID(),
    categoryCode: 'economico',
    status: 'OFFERING' as const,
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
    createdAt: new Date(Date.now() - 5 * 60_000),
    updatedAt: new Date(),
  };

  const aging = computeAgingBonus(oldRide);
  if (aging <= 0) throw new Error('Expected aging bonus for old ride');

  const key = buildAttemptIdempotencyKey(rideId, 1);
  await registerAttemptMeta({
    attemptId,
    rideId,
    stageNumber: 1,
    strategy: 'sequential',
    candidateCount: 2,
    idempotencyKey: key,
  });
  if (!(await attemptExistsByIdempotency(key))) {
    throw new Error('Idempotency key should exist');
  }

  if (decideReassignAction({
    strategy: 'sequential',
    sequentialCursor: 0,
    candidateCount: 3,
    stageIndex: 0,
    maxStages: 4,
  }) !== 'rotate_sequential') {
    throw new Error('Expected rotate_sequential');
  }

  if (decideReassignAction({
    strategy: 'parallel',
    sequentialCursor: 0,
    candidateCount: 2,
    stageIndex: 0,
    maxStages: 4,
  }) !== 'expand_stage') {
    throw new Error('Expected expand_stage for parallel timeout');
  }

  __testRegisterMemoryAttempt({
    attemptId,
    rideId,
    stageNumber: 1,
    strategy: 'sequential',
    candidates: [
      { driverId: 'driver-a', rankPosition: 1, score: 0.9 },
      { driverId: 'driver-b', rankPosition: 2, score: 0.8 },
    ],
  });

  const trail = await getMatchTrail(rideId);
  if (trail.attempts.length !== 1 || trail.attempts[0]!.candidates.length !== 2) {
    throw new Error('Match trail incomplete');
  }
  console.log('Trail attempts:', trail.attempts.length);

  const liveRide = await memoryMatchStore.createRide({
    passengerId: 'passenger-camada31',
    categoryCode: 'executivo',
    pickupLat: -26.9905,
    pickupLng: -48.6348,
    dropoffLat: -26.985,
    dropoffLng: -48.628,
  });

  await startMatching(liveRide.id);
  const offering = await getRide(liveRide.id);
  if (!offering || offering.status !== 'OFFERING') {
    throw new Error(`Expected OFFERING, got ${offering?.status}`);
  }

  const liveTrail = await getMatchTrail(liveRide.id);
  if (liveTrail.attempts.length < 1) throw new Error('Live match trail missing attempt');

  await scheduleMatchTimeout({
    rideId: liveRide.id,
    attemptId: liveTrail.attempts[0]!.id,
    stageIndex: 0,
    strategy: 'sequential',
    passengerReputation: 4.7,
    dueAt: new Date(Date.now() - 1000),
  });

  const processed = await processDueMatchTimeouts();
  if (processed < 1) throw new Error('Expected timeout processing');

  const events = __testGetTimeoutEvents();
  if (!events.some((e) => e.action === 'expire_offers')) {
    throw new Error('Expected expire_offers timeout event');
  }
  console.log('Timeout events:', events.map((e) => e.action));

  console.log('Camada 31 production match engine tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
