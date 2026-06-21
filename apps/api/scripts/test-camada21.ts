process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    quoteCollectiveTransport,
    bookCollectiveTransport,
    validateCollectiveCapacity,
  } = await import('../src/collective/collectiveTransportService.js');
  const { seedMemoryPricingRule } = await import('../src/pricing/pricingRuleStore.js');
  const { filterEligibleDrivers } = await import('../src/match/eligibility.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');

  seedMemoryPricingRule({
    id: 'camada21-rule',
    ruleSetId: 'camada21-set',
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

  const vanQuote = await quoteCollectiveTransport({
    categoryCode: 'van',
    distanceKm: 28,
    durationMin: 40,
    passengerCount: 8,
    baggageCount: 6,
    isAirportShuttle: true,
    pickupLat: -26.9194,
    pickupLng: -49.0661,
    dropoffLat: -26.85,
    dropoffLng: -49.1,
  });
  if (vanQuote.finalFareCentavos <= vanQuote.baseFareCentavos) {
    throw new Error('Van quote should include collective multipliers');
  }
  console.log('Van quote:', vanQuote.finalFareCentavos, 'mult:', vanQuote.collectiveMultiplier);

  const microQuote = await quoteCollectiveTransport({
    categoryCode: 'micro_onibus',
    distanceKm: 45,
    durationMin: 55,
    passengerCount: 18,
    isLargeGroup: true,
  });
  if (!microQuote.multiplierBreakdown.reservation || !microQuote.multiplierBreakdown.large_group) {
    throw new Error('Micro-ônibus should apply reservation + large_group multipliers');
  }
  console.log('Micro quote:', microQuote.finalFareCentavos);

  try {
    validateCollectiveCapacity({ categoryCode: 'van', passengerCount: 8, baggageCount: 9 });
    throw new Error('Should reject excess baggage');
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('mala')) throw e;
  }

  const passengerId = randomUUID();
  const scheduledAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

  const booked = await bookCollectiveTransport({
    passengerId,
    categoryCode: 'van',
    pickupLat: -26.9194,
    pickupLng: -49.0661,
    dropoffLat: -26.85,
    dropoffLng: -49.1,
    scheduledAt,
    passengerCount: 10,
    baggageCount: 8,
    distanceKm: 28,
    durationMin: 40,
    groupLabel: 'Excursão BC',
  });
  if (!booked.booking.scheduledRideId) throw new Error('Booking missing schedule link');
  console.log('Van booking:', booked.booking.id, 'schedule:', booked.scheduleId);

  try {
    await bookCollectiveTransport({
      passengerId,
      categoryCode: 'micro_onibus',
      pickupLat: -26.9194,
      pickupLng: -49.0661,
      dropoffLat: -26.85,
      dropoffLng: -49.1,
      scheduledAt: new Date(Date.now() + 45 * 60 * 1000),
      passengerCount: 20,
      distanceKm: 45,
      durationMin: 55,
    });
    throw new Error('Micro should require 2h lead');
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('2 horas')) throw e;
  }

  memoryMatchStore.ensureSeeded();
  const vanDriverId = randomUUID();
  await memoryMatchStore.upsertDriver({
    userId: vanDriverId,
    fullName: 'Motorista Van',
    isOnline: true,
    operationalStatus: 'online',
    lat: -26.919,
    lng: -49.066,
    locationUpdatedAt: new Date(),
    reputationScore: 4.85,
    acceptanceRate: 0.9,
    cancellationRate: 0.05,
    completedRides: 400,
    onlineMinutesToday: 200,
    enabledCategories: ['van'],
    wheelchairAccessible: false,
    petReady: false,
    comfortApproved: false,
    vehicleType: 'van',
    collectiveCertified: true,
  });
  seedDemoFleetCompliance(vanDriverId, ['van'], { seatCount: 12, bodyType: 'van' });

  const ride = await memoryMatchStore.createRide({
    passengerId,
    categoryCode: 'van',
    pickupLat: -26.9194,
    pickupLng: -49.0661,
    dropoffLat: -26.85,
    dropoffLng: -49.1,
    passengerCount: 10,
    estimatedFareCentavos: vanQuote.finalFareCentavos,
  });

  const eligible = await filterEligibleDrivers(
    await memoryMatchStore.findOnlineDrivers(),
    ride,
    { passengerId, reputationScore: 4.8, tier: 'premium', isCorporate: false },
    10000,
  );
  if (!eligible.some((d) => d.userId === vanDriverId)) {
    throw new Error('Collective-certified van driver should be eligible');
  }
  console.log('Eligible collective drivers:', eligible.length);

  console.log('Camada 21 van/micro-ônibus tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
