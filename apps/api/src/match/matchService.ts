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
import { findNearbyDriversPostGIS, isPostgisMatchEnabled } from './geoMatchStore.js';
import {
  cancelRidePg,
  cancelRideByDriverPg,
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
import { distributedCache } from '../realtime/distributedCache.js';
import {
  filterEligibleDrivers,
  getOfferTimeoutSeconds,
  getRadiusStages,
  scoreCandidates,
  usesSequentialOffer,
} from './eligibility.js';
import type { PassengerContext, RideRecord, RideRequestInput, ScoredCandidate } from './types.js';
import { captureRideGovernanceSnapshot } from '../governance/governanceService.js';
import { logRideDecision } from '../observability/decisionLogService.js';
import { recordRideMetric } from '../observability/opsMetricsService.js';
import { emitEvent } from '../realtime/eventBus.js';
import {
  blockDriverCancelledPassengerRedispatch,
  blockPassengerCancelledDriver,
  resolveDriverCancelEscLevel,
} from './blockService.js';
import { buildAttemptIdempotencyKey, computeAgingBonus } from './reassignPolicyService.js';
import {
  registerAttemptMeta,
  seedMemoryCandidates,
  attemptExistsByIdempotency,
} from './matchEngineRepository.js';
import { scheduleMatchTimeout } from './timeoutHandlerService.js';

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

async function findOnlineDrivers(pickup?: { lat: number; lng: number; radiusM?: number }) {
  if (useMemory()) return memoryMatchStore.findOnlineDrivers();
  if (pickup && isPostgisMatchEnabled()) {
    const nearby = await findNearbyDriversPostGIS(pickup.lat, pickup.lng, pickup.radiusM ?? 10000);
    return nearby.map(({ distanceM: _d, ...driver }) => driver);
  }
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

async function afterAttemptPersisted(input: {
  attempt: { id: string; stageNumber: number; strategy: 'sequential' | 'parallel'; candidateCount: number };
  ride: RideRecord;
  scored: ScoredCandidate[];
  agingBonus: number;
  idempotencyKey: string;
}) {
  await registerAttemptMeta({
    attemptId: input.attempt.id,
    rideId: input.ride.id,
    stageNumber: input.attempt.stageNumber,
    strategy: input.attempt.strategy,
    candidateCount: input.scored.length,
    agingBonus: input.agingBonus,
    idempotencyKey: input.idempotencyKey,
  });
  seedMemoryCandidates(
    input.attempt.id,
    input.scored.map((c, i) => ({
      driverId: c.driver.userId,
      rankPosition: i + 1,
      score: c.score,
    })),
  );
}

async function dispatchOffers(
  ride: RideRecord,
  attemptId: string,
  scored: ScoredCandidate[],
  strategy: 'sequential' | 'parallel',
) {
  const { resolveServiceRegionIdAtPoint } = await import('../region/serviceRegionGeoService.js');
  const serviceRegionId = await resolveServiceRegionIdAtPoint(ride.pickupLat, ride.pickupLng);
  const timeoutSec = await getOfferTimeoutSeconds(ride.categoryCode, serviceRegionId);
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
    void emitEvent(
      'RIDE_OFFERED',
      'ride',
      ride.id,
      { offerId: offer.id, rideId: ride.id, categoryCode: ride.categoryCode },
      { driverId: top.driver.userId, rideId: ride.id, userIds: [ride.passengerId] },
    );
    const { markQueueOffered } = await import('../airport/airportQueueService.js');
    void markQueueOffered(top.driver.userId, ride.id);
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

  const { markQueueOffered } = await import('../airport/airportQueueService.js');
  for (const offer of created) {
    void emitEvent(
      'RIDE_OFFERED',
      'ride',
      ride.id,
      { offerId: offer.id, rideId: ride.id, categoryCode: ride.categoryCode },
      { driverId: offer.driverId, rideId: ride.id, userIds: [ride.passengerId] },
    );
    void markQueueOffered(offer.driverId, ride.id);
  }
  return created;
}

export async function runMatchStage(rideId: string, stageIndex: number, passengerReputation = 4.7) {
  const ride = await getRide(rideId);
  if (!ride || !['REQUESTED', 'OFFERING'].includes(ride.status)) return ride;

  const { resolveServiceRegionIdAtPoint } = await import('../region/serviceRegionGeoService.js');
  const serviceRegionId = await resolveServiceRegionIdAtPoint(ride.pickupLat, ride.pickupLng);
  const stages = await getRadiusStages(ride.categoryCode, serviceRegionId);
  if (stageIndex >= stages.length) {
    if (useMemory()) await memoryMatchStore.updateRideStatus(rideId, 'NO_DRIVERS');
    else await updateRideStatusPg(rideId, 'NO_DRIVERS');
    return getRide(rideId);
  }

  const idempotencyKey = buildAttemptIdempotencyKey(rideId, stageIndex + 1);
  if (await attemptExistsByIdempotency(idempotencyKey)) {
    return getRide(rideId);
  }

  const radiusM = stages[stageIndex]!;
  const strategy = usesSequentialOffer(ride.categoryCode) ? 'sequential' : 'parallel';
  const agingBonus = computeAgingBonus(ride);

  if (useMemory()) {
    await memoryMatchStore.updateRideStatus(rideId, 'OFFERING', { matchStage: stageIndex + 1 });
  } else {
    await updateRideStatusPg(rideId, 'OFFERING', stageIndex + 1);
  }

  const allDrivers = await findOnlineDrivers({
    lat: ride.pickupLat,
    lng: ride.pickupLng,
    radiusM,
  });
  const passenger = buildPassengerContext(ride, passengerReputation);
  const eligible = await filterEligibleDrivers(allDrivers, ride, passenger, radiusM);
  let scored = scoreCandidates(eligible, ride, passenger, radiusM, agingBonus);
  const { shouldApplyAirportQueue, rankCandidatesForAirportQueue } = await import(
    '../airport/airportQueueService.js'
  );
  if (await shouldApplyAirportQueue(ride)) {
    scored = await rankCandidatesForAirportQueue(scored, ride);
  }

  const attempt = await persistAttempt(ride, stageIndex + 1, radiusM, strategy, scored);
  await afterAttemptPersisted({ attempt, ride, scored, agingBonus, idempotencyKey });

  void emitEvent(
    'RIDE_MATCH_ATTEMPT_CREATED',
    'ride',
    rideId,
    {
      attemptId: attempt.id,
      stageNumber: stageIndex + 1,
      radiusM,
      candidateCount: scored.length,
      strategy,
      agingBonus,
    },
    { rideId, userIds: [ride.passengerId] },
  );

  if (scored.length === 0) {
    if (useMemory()) await memoryMatchStore.finishAttempt(attempt.id, 'no_candidates');
    else await finishAttemptPg(attempt.id, 'no_candidates');
    setTimeout(() => void runMatchStage(rideId, stageIndex + 1, passengerReputation), 500);
    return getRide(rideId);
  }

  if (useMemory()) await memoryMatchStore.finishAttempt(attempt.id, 'offered');
  else await finishAttemptPg(attempt.id, 'offered');
  await dispatchOffers(ride, attempt.id, scored, strategy);

  const timeoutMs = (await getOfferTimeoutSeconds(ride.categoryCode, serviceRegionId)) * 1000;
  await scheduleMatchTimeout({
    rideId,
    attemptId: attempt.id,
    stageIndex,
    strategy,
    passengerReputation,
    dueAt: new Date(Date.now() + timeoutMs),
  });

  return getRide(rideId);
}

export async function startMatching(rideId: string, passengerReputation = 4.7) {
  if (activeMatchLoops.has(rideId)) return getRide(rideId);
  activeMatchLoops.add(rideId);
  try {
    const ride = await getRide(rideId);
    if (ride) {
      void logRideDecision({
        rideId,
        decisionType: 'MATCH_STARTED',
        stage: 'stage_1',
        payload: { categoryCode: ride.categoryCode, passengerReputation },
      });
      void captureRideGovernanceSnapshot({
        rideId,
        phase: 'match',
        quotedFareCentavos: ride.estimatedFareCentavos,
        snapshotJson: { categoryCode: ride.categoryCode, matchStage: ride.matchStage },
      });
      void emitEvent('RIDE_REQUESTED', 'ride', rideId, { categoryCode: ride.categoryCode }, {
        rideId,
        userIds: [ride.passengerId],
      });
    }
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
  const claimed = await distributedCache.setNx(offerClaimKey(offerId), claimToken, 30);
  if (!claimed) return null;

  const ride = await getRide(offer.rideId);
  if (!ride || !['REQUESTED', 'OFFERING'].includes(ride.status)) return null;

  const rideClaim = await distributedCache.setNx(claimKey(ride.id), driverId, 60);
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
    const assigned = await memoryMatchStore.assignDriverToRide(ride.id, driverId);
    if (assigned) {
      const assignMs = Date.now() - ride.createdAt.getTime();
      recordRideMetric({
        rideId: ride.id,
        categoryCode: ride.categoryCode,
        requestToAssignMs: assignMs,
        accepted: true,
        booked: true,
      });
      void logRideDecision({
        rideId: ride.id,
        decisionType: 'DRIVER_ASSIGNED',
        payload: { driverId, offerId, assignMs },
      });
      void emitEvent(
        'RIDE_ACCEPTED',
        'ride',
        ride.id,
        { offerId, driverId, status: assigned.status },
        { userIds: [ride.passengerId], driverId, rideId: ride.id },
      );
      void emitEvent('RIDE_DRIVER_ASSIGNED', 'ride', ride.id, { driverId }, {
        userIds: [ride.passengerId],
        driverId,
        rideId: ride.id,
      });
      const { markQueueAccepted } = await import('../airport/airportQueueService.js');
      void markQueueAccepted(driverId, ride.id);
    }
    return assigned;
  }
  const assignedPg = await assignDriverToRidePg(ride.id, driverId, ride.rideVersion);
  if (assignedPg) {
    const assignMs = Date.now() - ride.createdAt.getTime();
    recordRideMetric({
      rideId: ride.id,
      categoryCode: ride.categoryCode,
      requestToAssignMs: assignMs,
      accepted: true,
      booked: true,
    });
    void logRideDecision({
      rideId: ride.id,
      decisionType: 'DRIVER_ASSIGNED',
      payload: { driverId, offerId, assignMs },
    });
    void emitEvent(
      'RIDE_ACCEPTED',
      'ride',
      ride.id,
      { offerId, driverId, status: assignedPg.status },
      { userIds: [ride.passengerId], driverId, rideId: ride.id },
    );
    void emitEvent('RIDE_DRIVER_ASSIGNED', 'ride', ride.id, { driverId }, {
      userIds: [ride.passengerId],
      driverId,
      rideId: ride.id,
    });
    const { markQueueAccepted } = await import('../airport/airportQueueService.js');
    void markQueueAccepted(driverId, ride.id);
  }
  return assignedPg;
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

async function notifySuspiciousCancel(ride: RideRecord | null) {
  if (!ride || ride.status !== 'CANCELLED' || !ride.driverId) return;
  void import('../fraud/suspiciousRideService.js').then(({ analyzeCancelledRide }) =>
    analyzeCancelledRide(ride),
  );
}

export async function cancelRide(rideId: string, passengerId: string, reason?: string) {
  const ride = await getRide(rideId);
  if (!ride || ride.passengerId !== passengerId) return null;

  const priorStatus = ride.status;
  const driverId = ride.driverId;
  const shouldBlock =
    Boolean(driverId) && ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED'].includes(priorStatus);

  if (useMemory()) {
    await memoryMatchStore.expirePendingOffersForRide(rideId);
    const cancelled = await memoryMatchStore.updateRideStatus(rideId, 'CANCELLED', {
      cancelReason: reason ?? 'passenger_cancel',
    });
    if (cancelled) {
      if (shouldBlock && driverId) {
        await blockPassengerCancelledDriver(passengerId, driverId, rideId);
      }
      void emitEvent('RIDE_CANCELLED', 'ride', rideId, { reason }, {
        rideId,
        userIds: [passengerId],
        driverId: cancelled.driverId,
      });
      void notifySuspiciousCancel(cancelled);
    }
    return cancelled;
  }

  await cancelRidePg(rideId, passengerId, reason ?? 'passenger_cancel');
  if (shouldBlock && driverId) {
    await blockPassengerCancelledDriver(passengerId, driverId, rideId);
  }
  const updated = await getRide(rideId);
  if (updated) {
    void emitEvent('RIDE_CANCELLED', 'ride', rideId, { reason }, {
      rideId,
      userIds: [passengerId],
      driverId: updated.driverId,
    });
    void notifySuspiciousCancel(updated);
  }
  return updated;
}

export async function driverCancelRide(rideId: string, driverId: string, reason?: string) {
  const ride = await getRide(rideId);
  if (!ride || ride.driverId !== driverId) return null;
  if (!['DRIVER_ASSIGNED', 'DRIVER_ARRIVED'].includes(ride.status)) return null;

  const escalation = await resolveDriverCancelEscLevel(ride.passengerId, driverId);

  if (useMemory()) {
    await memoryMatchStore.expirePendingOffersForRide(rideId);
    const cancelled = await memoryMatchStore.updateRideStatus(rideId, 'CANCELLED', {
      cancelReason: reason ?? 'driver_cancel',
    });
    if (cancelled) {
      await blockDriverCancelledPassengerRedispatch(
        ride.passengerId,
        driverId,
        rideId,
        escalation,
      );
      void emitEvent('RIDE_CANCELLED', 'ride', rideId, { reason, cancelledBy: 'driver' }, {
        rideId,
        userIds: [ride.passengerId, driverId],
        driverId,
      });
      void notifySuspiciousCancel(cancelled);
    }
    return cancelled;
  }

  await cancelRideByDriverPg(rideId, driverId, reason ?? 'driver_cancel');
  await blockDriverCancelledPassengerRedispatch(ride.passengerId, driverId, rideId, escalation);
  const updated = await getRide(rideId);
  if (updated) {
    void emitEvent('RIDE_CANCELLED', 'ride', rideId, { reason, cancelledBy: 'driver' }, {
      rideId,
      userIds: [ride.passengerId, driverId],
      driverId,
    });
    void notifySuspiciousCancel(updated);
  }
  return updated;
}
