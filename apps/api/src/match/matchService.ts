import { randomUUID } from 'node:crypto';
import { MATCH_CONFIG } from '../domain/match.js';
import { getTier } from '../domain/reputation.js';
import {
  assignDriverToRidePg,
  createRidePg,
  findOnlineDriversPg,
  getRidePg,
  memoryMatchStore,
  useMemory,
} from '../stores/memoryMatchStore.js';
import {
  cancelRidePg,
  createAttemptPg,
  createOfferPg,
  expirePendingOffersForRidePg,
  finishAttemptPg,
  getOfferPg,
  getPendingOffersForDriverPg,
  insertOfferResponsePg,
  saveCandidatesPg,
  updateOfferStatusPg,
  updateRideStatusPg,
} from '../stores/rideRepository.js';
import { matchCache } from './cacheStore.js';
import {
  filterEligibleDrivers,
  getOfferTimeoutSeconds,
  getRadiusStages,
  scoreCandidates,
  usesSequentialOffer,
} from './eligibility.js';
import type { PassengerContext, RideRecord, RideRequestInput, ScoredCandidate } from './types.js';

const activeMatchLoops = new Set<string>();

function claimKey(rideId: string) {
  return `match:claim:${rideId}`;
}

function offerClaimKey(offerId: string) {
  return `match:offer:claim:${offerId}`;
}

export async function createRideRequest(input: RideRequestInput): Promise<RideRecord> {
  if (useMemory()) {
    return memoryMatchStore.createRide(input);
  }
  return createRidePg(input);
}

export async function getRide(id: string): Promise<RideRecord | null> {
  if (useMemory()) return memoryMatchStore.getRide(id);
  return getRidePg(id);
}

async function findOnlineDrivers() {
  if (useMemory()) return memoryMatchStore.findOnlineDrivers();
  return findOnlineDriversPg();
}

function buildPassengerContext(ride: RideRecord, reputation = 4.7): PassengerContext {
  return {
    passengerId: ride.passengerId,
    reputationScore: reputation,
    tier: getTier(reputation),
    isCorporate: ride.isCorporate,
  };
}

async function persistAttempt(
  ride: RideRecord,
  stageNumber: number,
  radiusM: number,
  strategy: 'sequential' | 'parallel',
  scored: ScoredCandidate[],
) {
  if (useMemory()) {
    const attempt = await memoryMatchStore.createAttempt({
      rideId: ride.id,
      stageNumber,
      searchRadiusM: radiusM,
      candidateCount: scored.length,
      strategy,
      resultStatus: 'pending',
      startedAt: new Date(),
    });
    await memoryMatchStore.saveCandidates(
      attempt.id,
      scored.map((c, i) => ({
        attemptId: attempt.id,
        driverId: c.driver.userId,
        score: c.score,
        etaPickupS: c.etaPickupS,
        distanceM: c.distanceM,
        rankPosition: i + 1,
        featureVector: c.featureVector,
      })),
    );
    return attempt;
  }

  const attemptId = await createAttemptPg({
    rideId: ride.id,
    stageNumber,
    searchRadiusM: radiusM,
    candidateCount: scored.length,
    strategy,
  });
  await saveCandidatesPg(
    attemptId,
    scored.map((c, i) => ({
      driverId: c.driver.userId,
      score: c.score,
      etaPickupS: c.etaPickupS,
      distanceM: c.distanceM,
      rankPosition: i + 1,
      featureVector: c.featureVector,
      reputation: c.driver.reputationScore,
      acceptance: c.driver.acceptanceRate,
      cancellation: c.driver.cancellationRate,
      online: c.driver.onlineMinutesToday / 480,
      experience: Math.log10(c.driver.completedRides + 1) / 4,
      compatibility: c.compatibility,
    })),
  );
  return {
    id: attemptId,
    rideId: ride.id,
    stageNumber,
    searchRadiusM: radiusM,
    candidateCount: scored.length,
    strategy,
    resultStatus: 'pending',
    startedAt: new Date(),
  };
}

async function dispatchOffers(
  ride: RideRecord,
  attemptId: string,
  scored: ScoredCandidate[],
  strategy: 'sequential' | 'parallel',
) {
  const timeoutSec = getOfferTimeoutSeconds(ride.categoryCode);
  const expiresAt = new Date(Date.now() + timeoutSec * 1000);

  if (strategy === 'sequential') {
    const top = scored[0];
    if (!top) return [];
    const offer = useMemory()
      ? await memoryMatchStore.createOffer({
          rideId: ride.id,
          attemptId,
          driverId: top.driver.userId,
          offerBatch: 1,
          offerType: 'sequential',
          status: 'pending',
          expiresAt,
        })
      : await createOfferPg({
          rideId: ride.id,
          attemptId,
          driverId: top.driver.userId,
          offerBatch: 1,
          offerType: 'sequential',
          expiresAt,
        });
    return [offer];
  }

  const batchSize = Math.min(
    MATCH_CONFIG.parallelBatchSizeMax,
    Math.max(MATCH_CONFIG.parallelBatchSizeMin, scored.length),
  );
  const batch = scored.slice(0, batchSize);
  const created = [];
  for (const c of batch) {
    const offer = useMemory()
      ? await memoryMatchStore.createOffer({
          rideId: ride.id,
          attemptId,
          driverId: c.driver.userId,
          offerBatch: 1,
          offerType: 'parallel',
          status: 'pending',
          expiresAt,
        })
      : await createOfferPg({
          rideId: ride.id,
          attemptId,
          driverId: c.driver.userId,
          offerBatch: 1,
          offerType: 'parallel',
          expiresAt,
        });
    created.push(offer);
  }
  return created;
}

export async function runMatchStage(rideId: string, stageIndex: number, passengerReputation = 4.7) {
  const ride = await getRide(rideId);
  if (!ride || !['REQUESTED', 'OFFERING'].includes(ride.status)) return ride;

  const stages = getRadiusStages(ride.categoryCode);
  if (stageIndex >= stages.length) {
    if (useMemory()) await memoryMatchStore.updateRideStatus(rideId, 'NO_DRIVERS');
    else await updateRideStatusPg(rideId, 'NO_DRIVERS');
    return getRide(rideId);
  }

  const radiusM = stages[stageIndex]!;
  const strategy = usesSequentialOffer(ride.categoryCode) ? 'sequential' : 'parallel';

  if (useMemory()) {
    await memoryMatchStore.updateRideStatus(rideId, 'OFFERING', { matchStage: stageIndex + 1 });
  } else {
    await updateRideStatusPg(rideId, 'OFFERING', stageIndex + 1);
  }

  const allDrivers = await findOnlineDrivers();
  const passenger = buildPassengerContext(ride, passengerReputation);
  const eligible = await filterEligibleDrivers(allDrivers, ride, passenger, radiusM);
  const scored = scoreCandidates(eligible, ride, passenger, radiusM);

  const attempt = await persistAttempt(ride, stageIndex + 1, radiusM, strategy, scored);

  if (scored.length === 0) {
    if (useMemory()) await memoryMatchStore.finishAttempt(attempt.id, 'no_candidates');
    else await finishAttemptPg(attempt.id, 'no_candidates');
    setTimeout(() => void runMatchStage(rideId, stageIndex + 1, passengerReputation), 500);
    return getRide(rideId);
  }

  if (useMemory()) await memoryMatchStore.finishAttempt(attempt.id, 'offered');
  else await finishAttemptPg(attempt.id, 'offered');
  const offerList = await dispatchOffers(ride, attempt.id, scored, strategy);

  const timeoutMs = getOfferTimeoutSeconds(ride.categoryCode) * 1000;
  setTimeout(async () => {
    const current = await getRide(rideId);
    if (!current || current.status === 'DRIVER_ASSIGNED') return;

    for (const offer of offerList) {
      if (useMemory()) {
        const o = await memoryMatchStore.getOffer(offer.id);
        if (o?.status === 'pending') await memoryMatchStore.updateOfferStatus(offer.id, 'expired');
      } else {
        const o = await getOfferPg(offer.id);
        if (o?.status === 'pending') {
          await updateOfferStatusPg(offer.id, 'expired');
          await insertOfferResponsePg(offer.id, 'timeout');
        }
      }
    }

    const stillOpen = await getRide(rideId);
    if (stillOpen && stillOpen.status === 'OFFERING') {
      await runMatchStage(rideId, stageIndex + 1, passengerReputation);
    }
  }, timeoutMs);

  return getRide(rideId);
}

export async function startMatching(rideId: string, passengerReputation = 4.7) {
  if (activeMatchLoops.has(rideId)) return getRide(rideId);
  activeMatchLoops.add(rideId);
  try {
    return await runMatchStage(rideId, 0, passengerReputation);
  } finally {
    activeMatchLoops.delete(rideId);
  }
}

export async function acceptOffer(offerId: string, driverId: string): Promise<RideRecord | null> {
  const offer = useMemory() ? await memoryMatchStore.getOffer(offerId) : await getOfferPg(offerId);
  if (!offer || offer.driverId !== driverId || offer.status !== 'pending') {
    return null;
  }
  if (offer.expiresAt.getTime() <= Date.now()) {
    if (useMemory()) await memoryMatchStore.updateOfferStatus(offerId, 'expired');
    else await updateOfferStatusPg(offerId, 'expired');
    return null;
  }

  const claimToken = randomUUID();
  const claimed = await matchCache.setNx(offerClaimKey(offerId), claimToken, 30);
  if (!claimed) return null;

  const ride = await getRide(offer.rideId);
  if (!ride || !['REQUESTED', 'OFFERING'].includes(ride.status)) return null;

  const rideClaim = await matchCache.setNx(claimKey(ride.id), driverId, 60);
  if (!rideClaim) return null;

  if (useMemory()) {
    await memoryMatchStore.expirePendingOffersForRide(ride.id);
    await memoryMatchStore.updateOfferStatus(offerId, 'accepted', claimToken);
  } else {
    await expirePendingOffersForRidePg(ride.id);
    await updateOfferStatusPg(offerId, 'accepted', claimToken);
    await insertOfferResponsePg(offerId, 'accepted');
  }

  if (useMemory()) {
    return memoryMatchStore.assignDriverToRide(ride.id, driverId);
  }
  return assignDriverToRidePg(ride.id, driverId, ride.rideVersion);
}

export async function rejectOffer(offerId: string, driverId: string) {
  const offer = useMemory() ? await memoryMatchStore.getOffer(offerId) : await getOfferPg(offerId);
  if (!offer || offer.driverId !== driverId || offer.status !== 'pending') return false;
  if (useMemory()) await memoryMatchStore.updateOfferStatus(offerId, 'rejected');
  else {
    await updateOfferStatusPg(offerId, 'rejected');
    await insertOfferResponsePg(offerId, 'rejected');
  }
  return true;
}

export async function getDriverPendingOffers(driverId: string) {
  if (useMemory()) return memoryMatchStore.getPendingOffersForDriver(driverId);
  return getPendingOffersForDriverPg(driverId);
}

export async function cancelRide(rideId: string, passengerId: string, reason?: string) {
  const ride = await getRide(rideId);
  if (!ride || ride.passengerId !== passengerId) return null;
  const cancellable = ['REQUESTED', 'OFFERING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'];
  if (!cancellable.includes(ride.status)) return null;

  if (useMemory()) {
    await memoryMatchStore.expirePendingOffersForRide(rideId);
    if (ride.driverId) await memoryMatchStore.releaseDriver(ride.driverId);
    return memoryMatchStore.updateRideStatus(rideId, 'CANCELLED', { cancelReason: reason });
  }
  await cancelRidePg(rideId, passengerId, reason);
  return getRide(rideId);
}
