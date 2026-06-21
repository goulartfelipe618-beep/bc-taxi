process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    areRoutesCompatible,
    computeDetourDiscount,
    quoteSharedRide,
    registerSharedBooking,
    getPool,
    getPoolBookings,
    dispatchReadyPools,
    listOpenPools,
  } = await import('../src/shared/sharedRideService.js');
  const { createRideRequest } = await import('../src/match/matchService.js');

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

  const compat = areRoutesCompatible(routeA, routeB);
  if (!compat.compatible) throw new Error(`Routes should be compatible: ${compat.reason}`);
  console.log('Corridor match OK — detour min:', compat.detourMin);

  const discount = computeDetourDiscount(4000, compat.detourMin, 12);
  if (discount < 200 || discount > 800) throw new Error(`Unexpected discount: ${discount}`);
  console.log('Detour discount:', discount, 'centavos');

  const soloQuote = await quoteSharedRide({
    distanceKm: 35,
    durationMin: 45,
    ...routeA,
  });
  if (!soloQuote.soloRide) throw new Error('First quote should be solo');
  console.log('Solo shared quote:', soloQuote.finalFareCentavos);

  const passengerA = randomUUID();
  const rideA = await createRideRequest({
    passengerId: passengerA,
    categoryCode: 'compartilhado',
    ...routeA,
    isShared: true,
    estimatedFareCentavos: soloQuote.finalFareCentavos,
  });

  const regA = await registerSharedBooking({
    rideId: rideA.id,
    passengerId: passengerA,
    ...routeA,
    distanceKm: 35,
    durationMin: 45,
  });
  if (regA.pool.status !== 'waiting') throw new Error('First pool should wait for partner');
  console.log('Pool A waiting:', regA.pool.id);

  const open = await listOpenPools();
  if (open.length < 1) throw new Error('Expected open pool');

  const matchQuote = await quoteSharedRide({
    distanceKm: 34,
    durationMin: 44,
    ...routeB,
    passengerId: randomUUID(),
  });
  if (matchQuote.soloRide) throw new Error('Second route should match existing pool');
  console.log('Matched quote discount:', matchQuote.discountCentavos);

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
  });
  if (regB.pool.status !== 'ready') throw new Error('Pool should be ready with 2 bookings');

  const bookings = await getPoolBookings(regB.pool.id);
  if (bookings.length !== 2) throw new Error('Expected 2 bookings');
  if (bookings.every((b) => b.discountCentavos <= 0)) {
    throw new Error('Both passengers should receive detour discount');
  }
  console.log('Pool full — discounts:', bookings.map((b) => b.discountCentavos));

  const pool = await getPool(regB.pool.id);
  if (!pool?.primaryRideId) throw new Error('Missing primary ride');

  await dispatchReadyPools();
  const after = await getPool(regB.pool.id);
  if (after?.status !== 'matching') throw new Error('Pool should enter matching');

  console.log('Camada 16 shared ride pool tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
