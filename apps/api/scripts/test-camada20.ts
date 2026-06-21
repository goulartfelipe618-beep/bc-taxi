process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

import { randomUUID } from 'node:crypto';

async function main() {
  const { computeMatchScore } = await import('../src/domain/match.js');
  const { getTierBenefits } = await import('../src/domain/reputation.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { driverCompleteRide } = await import('../src/ride/lifecycleService.js');
  const { getPendingReviewsForUser } = await import('../src/reviews/pendingReviewService.js');
  const { submitRideReview } = await import('../src/reviews/reviewService.js');
  const {
    getFullReputationDashboard,
    getUserReputationProfile,
    recalculateUserReputation,
  } = await import('../src/reviews/reputationService.js');
  const { revokeReputationBenefits } = await import('../src/reviews/revocationService.js');
  const { recordFraudSignal } = await import('../src/fraud/fraudService.js');
  const { authorizeRidePayment, attachIntentToRide } = await import('../src/payments/paymentService.js');
  const { DEMO_PAYMENT_METHOD_IDS } = await import('../src/payments/paymentStore.js');
  const { seedMemoryPricingRule } = await import('../src/pricing/pricingRuleStore.js');

  seedMemoryPricingRule({
    id: 'camada20-rule',
    ruleSetId: 'camada20-set',
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

  const passengerId = randomUUID();
  const driverId = randomUUID();

  memoryMatchStore.ensureSeeded();
  await memoryMatchStore.upsertDriver({
    userId: driverId,
    isOnline: true,
    operationalStatus: 'online',
    lat: -26.99,
    lng: -48.63,
    locationUpdatedAt: new Date(),
    reputationScore: 4.92,
    acceptanceRate: 0.92,
    cancellationRate: 0.04,
    completedRides: 600,
    onlineMinutesToday: 300,
    enabledCategories: ['economico', 'comfort'],
    wheelchairAccessible: false,
    petReady: false,
    comfortApproved: true,
  });

  const ride = await memoryMatchStore.createRide({
    passengerId,
    categoryCode: 'economico',
    pickupLat: -26.99,
    pickupLng: -48.63,
    dropoffLat: -26.985,
    dropoffLng: -48.628,
    estimatedFareCentavos: 3200,
  });

  await memoryMatchStore.updateRideStatus(ride.id, 'DRIVER_ASSIGNED', { driverId });
  await memoryMatchStore.updateRideStatus(ride.id, 'DRIVER_ARRIVED');
  await memoryMatchStore.updateRideStatus(ride.id, 'IN_PROGRESS');

  const { intent } = await authorizeRidePayment({
    userId: passengerId,
    paymentMethodId: DEMO_PAYMENT_METHOD_IDS.card,
    amountCentavos: 3200,
    rideId: ride.id,
    idempotencyKey: 'camada20-pay',
  });
  await attachIntentToRide(ride.id, intent.id);

  await driverCompleteRide(ride.id, driverId);

  const passengerPending = await getPendingReviewsForUser(passengerId);
  const driverPending = await getPendingReviewsForUser(driverId);
  if (passengerPending.length !== 1 || driverPending.length !== 1) {
    throw new Error('Review obligations not created for both sides');
  }
  console.log('Pending reviews opened:', passengerPending[0]?.daysRemaining, 'days left');

  await submitRideReview({
    rideId: ride.id,
    reviewerUserId: passengerId,
    reviewerRole: 'passenger',
    stars: 5,
    tags: ['pontualidade', 'cordialidade'],
  });
  await submitRideReview({
    rideId: ride.id,
    reviewerUserId: driverId,
    reviewerRole: 'driver',
    stars: 5,
    tags: ['comportamento'],
  });

  const passengerPendingAfter = await getPendingReviewsForUser(passengerId);
  if (passengerPendingAfter.length !== 0) throw new Error('Passenger obligation should be submitted');

  await recalculateUserReputation(driverId, 'driver');
  await recalculateUserReputation(passengerId, 'passenger');

  const dashboard = await getFullReputationDashboard(driverId, 'driver');
  if (!dashboard.profile.tier) throw new Error('Missing tier in dashboard');
  console.log('Driver tier:', dashboard.profile.tier, 'badges:', dashboard.badges.length);

  const eliteBenefits = getTierBenefits('elite', 'passenger');
  const baseScore = computeMatchScore({
    etaPickupSeconds: 240,
    etaMaxStageSeconds: 600,
    rating: 4.9,
    acceptanceRate: 0.9,
    cancellationRate: 0.05,
    onlineMinutesToday: 300,
    completedRides: 500,
    compatibility: 1,
    passengerDispatchBonusPct: eliteBenefits.dispatchPriorityPct,
    driverQueueBonusPct: 0,
  });
  const withoutBonus = computeMatchScore({
    etaPickupSeconds: 240,
    etaMaxStageSeconds: 600,
    rating: 4.9,
    acceptanceRate: 0.9,
    cancellationRate: 0.05,
    onlineMinutesToday: 300,
    completedRides: 500,
    compatibility: 1,
  });
  if (baseScore <= withoutBonus) throw new Error('Tier dispatch bonus should increase score');
  console.log('Match tier bonus delta:', (baseScore - withoutBonus).toFixed(4));

  await revokeReputationBenefits({
    userId: driverId,
    userRole: 'driver',
    reason: 'Teste revogação camada 20',
    sourceType: 'admin',
  });
  const revokedProfile = await getUserReputationProfile(driverId, 'driver');
  if (!(revokedProfile as { benefitsRevoked?: boolean }).benefitsRevoked) {
    throw new Error('Benefits should be revoked');
  }

  for (let i = 0; i < 8; i++) {
    await recordFraudSignal({ userId: driverId, signalType: 'GPS_JUMP', rideId: ride.id });
  }
  const revokedByGps = await getUserReputationProfile(driverId, 'driver');
  if (!(revokedByGps as { benefitsRevoked?: boolean }).benefitsRevoked) {
    throw new Error('GPS fraud should revoke benefits');
  }

  console.log('Camada 20 reputação produção tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
