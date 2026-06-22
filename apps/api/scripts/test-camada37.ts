process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    areRoutesCompatible,
    quoteSharedRide,
    registerSharedBooking,
    getPool,
    getPoolBookings,
    dispatchReadyPools,
  } = await import('../src/shared/sharedRideService.js');
  const {
    assertSharedPassengerEligible,
    computeMarginalFareAllocations,
    validateAllOccupantsCompatible,
    isWithinSharedTemporalWindow,
    getSharedProductionConfig,
    __testResetSharedProductionMemory,
    __testGetSharedPoolEvents,
  } = await import('../src/shared/sharedProductionService.js');
  const { createRideRequest } = await import('../src/match/matchService.js');

  __testResetSharedProductionMemory();

  const routeA = {
    pickupLat: -26.9194,
    pickupLng: -49.0661,
    dropoffLat: -26.99,
    dropoffLng: -48.6348,
  };
  const routeB = {
    pickupLat: -26.918,
    pickupLng: -49.065,
    dropoffLat: -26.988,
    dropoffLng: -48.636,
  };

  const cfg = await getSharedProductionConfig();
  const allOk = validateAllOccupantsCompatible([routeA, routeB], cfg);
  if (!allOk.ok) throw new Error(`Occupants should be compatible: ${allOk.reason}`);
  console.log('All-occupant SLA OK — max detour min:', allOk.maxDetourMin);

  if (!isWithinSharedTemporalWindow(new Date(), [{ dayOfWeek: -1, startMinute: 0, endMinute: 1440 }])) {
    throw new Error('Temporal window should allow now');
  }

  try {
    await assertSharedPassengerEligible(4.2);
    throw new Error('Low reputation should be blocked');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!msg.includes('Reputação') && !msg.includes('segmento')) throw e;
    console.log('Reputation gate OK');
  }

  await assertSharedPassengerEligible(4.85);

  const marginal = computeMarginalFareAllocations({
    bookings: [
      { id: 'b1', rideId: 'r1', baseFareCentavos: 4000, route: routeA },
      { id: 'b2', rideId: 'r2', baseFareCentavos: 3900, route: routeB },
    ],
    cfg,
  });
  if (marginal.length !== 2 || marginal.every((m) => m.finalFareCentavos >= 4000)) {
    throw new Error('Marginal fares should reduce final price');
  }
  console.log('Marginal fares:', marginal.map((m) => m.finalFareCentavos));

  const soloQuote = await quoteSharedRide({
    distanceKm: 35,
    durationMin: 45,
    ...routeA,
    reputationScore: 4.85,
  });
  if (!soloQuote.soloRide) throw new Error('First quote should be solo');

  const passengerA = randomUUID();
  const rideA = await createRideRequest({
    passengerId: passengerA,
    categoryCode: 'compartilhado',
    ...routeA,
    isShared: true,
    estimatedFareCentavos: soloQuote.finalFareCentavos,
  });

  await registerSharedBooking({
    rideId: rideA.id,
    passengerId: passengerA,
    ...routeA,
    distanceKm: 35,
    durationMin: 45,
    reputationScore: 4.85,
  });

  const matchQuote = await quoteSharedRide({
    distanceKm: 34,
    durationMin: 44,
    ...routeB,
    passengerId: randomUUID(),
    reputationScore: 4.85,
  });
  if (matchQuote.soloRide) throw new Error('Second route should match pool');

  const passengerB = randomUUID();
  const rideB = await createRideRequest({
    passengerId: passengerB,
    categoryCode: 'compartilhado',
    ...routeB,
    isShared: true,
    estimatedFareCentavos: matchQuote.finalFareCentavos,
  });

  const regB = await registerSharedBooking({
    rideId: rideB.id,
    passengerId: passengerB,
    ...routeB,
    distanceKm: 34,
    durationMin: 44,
    reputationScore: 4.82,
  });
  if (regB.pool.status !== 'ready') throw new Error('Pool should be ready');

  const bookings = await getPoolBookings(regB.pool.id);
  if (bookings.length !== 2) throw new Error('Expected 2 bookings');
  if (!bookings.every((b) => b.finalFareCentavos < b.baseFareCentavos)) {
    throw new Error('Marginal pricing should reduce fares for both');
  }
  console.log('Pool fares:', bookings.map((b) => ({ base: b.baseFareCentavos, final: b.finalFareCentavos })));

  await dispatchReadyPools();
  const after = await getPool(regB.pool.id);
  if (after?.status !== 'matching') throw new Error('Pool should enter matching');

  const events = __testGetSharedPoolEvents();
  if (!events.some((e) => e.eventType === 'marginal_fare_applied')) {
    throw new Error('Missing marginal_fare_applied event');
  }

  console.log('Camada 37 shared production tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
