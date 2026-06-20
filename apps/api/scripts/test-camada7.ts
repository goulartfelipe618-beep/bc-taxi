process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

import { randomUUID } from 'node:crypto';

async function main() {
  const {
    computeDriverCompositeScore,
    computePassengerCompositeScore,
    computeWeightedRating,
    getReputationProfile,
    getTier,
    isCashPaymentAllowed,
    isPassengerCategoryAllowed,
    isPassengerPrepayRequired,
  } = await import('../src/domain/reputation.js');
  const { recalculateUserReputation, getUserReputationProfile, listAvailableReviewTags } = await import(
    '../src/reviews/reputationService.js'
  );
  const { insertReview, validateReviewTags } = await import('../src/reviews/reviewStore.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');
  const { computeMatchScore } = await import('../src/domain/match.js');

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
    reputationScore: 4.7,
    acceptanceRate: 0.9,
    cancellationRate: 0.05,
    completedRides: 120,
    onlineMinutesToday: 200,
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
    estimatedFareCentavos: 2200,
  });
  await memoryMatchStore.updateRideStatus(ride.id, 'COMPLETED', { driverId });

  await insertReview({
    rideId: ride.id,
    reviewerUserId: passengerId,
    reviewedUserId: driverId,
    reviewerRole: 'passenger',
    reviewedRole: 'driver',
    stars: 5,
    tags: ['pontualidade', 'cordialidade'],
  });
  await insertReview({
    rideId: ride.id,
    reviewerUserId: driverId,
    reviewedUserId: passengerId,
    reviewerRole: 'driver',
    reviewedRole: 'passenger',
    stars: 4,
    tags: ['comportamento'],
  });

  const tags = await validateReviewTags(['pontualidade', 'invalid_tag'], 'driver');
  if (!tags.includes('pontualidade') || tags.includes('invalid_tag')) {
    throw new Error('Tag validation failed');
  }

  const driverScore = await recalculateUserReputation(driverId, 'driver');
  const passengerScore = await recalculateUserReputation(passengerId, 'passenger');
  console.log('Composite scores:', { driverScore, passengerScore });

  const driverProfile = await getUserReputationProfile(driverId, 'driver');
  const passengerProfile = await getUserReputationProfile(passengerId, 'passenger');
  if (!driverProfile.tier || !passengerProfile.tier) throw new Error('Missing tier');

  const { rating, weightedCount } = computeWeightedRating(
    [{ stars: 5, daysAgo: 1 }, { stars: 4, daysAgo: 400 }],
    0.0025,
  );
  if (rating <= 0 || weightedCount <= 0) throw new Error('Weighted rating failed');

  const driverComposite = computeDriverCompositeScore(4.8, {
    operationalStability: 4.5,
    pickupPunctuality: 4.6,
    routeAdherence: 4.4,
    documentQuality: 5,
  });
  if (driverComposite < 4.5) throw new Error('Driver composite too low');

  const passengerComposite = computePassengerCompositeScore(4.2, {
    boardingPresence: 4.5,
    paymentSuccess: 4.8,
    lateCancelIndex: 4.0,
    behaviorIndex: 4.6,
  });
  if (passengerComposite < 4) throw new Error('Passenger composite too low');

  if (isPassengerCategoryAllowed(4.0, 'comfort')) throw new Error('Should block comfort');
  if (!isPassengerPrepayRequired(3.7)) throw new Error('Should require prepay');
  if (isCashPaymentAllowed(4.5)) throw new Error('Should block cash');

  const matchScore = computeMatchScore({
    etaPickupSeconds: 300,
    etaMaxStageSeconds: 600,
    rating: 4.85,
    acceptanceRate: 0.9,
    cancellationRate: 0.05,
    onlineMinutesToday: 300,
    completedRides: 500,
    compatibility: 1,
    isPassengerPremium: true,
    isDriverPremium: true,
  });
  if (matchScore <= 0) throw new Error('Match score failed');

  const availableTags = await listAvailableReviewTags('driver');
  if (availableTags.length < 5) throw new Error('Expected tag catalog');

  console.log('Tier driver:', getTier(driverScore), 'Tier passenger:', getTier(passengerScore));
  console.log('Camada 7 reputation tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
