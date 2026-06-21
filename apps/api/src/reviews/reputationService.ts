import {
  applyBayesianSmoothing,
  computeDriverCompositeScore,
  computePassengerCompositeScore,
  computeWeightedRating,
  getReputationProfile,
  getTier,
  REPUTATION_CONFIG,
} from '../domain/reputation.js';
import { getRide } from '../match/matchService.js';
import { pool } from '../db.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';
import { listUserBadges, syncUserBadges, toPublicBadge } from './badgeService.js';
import {
  getDriverOperationalMetrics,
  getPassengerOperationalMetrics,
} from './metricsService.js';
import { getPendingReviewsForUser } from './pendingReviewService.js';
import {
  hasActiveBenefitRevocation,
  stripBenefitsForRevocation,
} from './revocationService.js';
import { listReviewsForUser, listReviewTags, type RideReviewRecord } from './reviewStore.js';

const memoryPassengerRep = new Map<string, { score: number; tier: string }>();

const GLOBAL_MEAN = 4.7;

async function buildReviewInputs(reviews: RideReviewRecord[]) {
  const inputs = [];
  for (const r of reviews) {
    const ride = await getRide(r.rideId);
    const distanceKm =
      ride != null
        ? Math.hypot(ride.dropoffLat - ride.pickupLat, ride.dropoffLng - ride.pickupLng) * 111
        : undefined;
    inputs.push({
      stars: r.stars,
      daysAgo: (Date.now() - r.createdAt.getTime()) / 86_400_000,
      tripDistanceKm: distanceKm,
      tripDurationMin: undefined,
      isHighValueTrip: (ride?.estimatedFareCentavos ?? 0) > 8000,
    });
  }
  return inputs;
}

async function saveSnapshot(
  userId: string,
  role: 'passenger' | 'driver',
  data: {
    directScore: number;
    compositeScore: number;
    tier: string;
    reviewCount: number;
    weightedReviewCount: number;
    metrics: Record<string, number>;
  },
) {
  if (useMemory()) return;

  if (role === 'driver') {
    await pool.query(
      `INSERT INTO driver_reputation_snapshots
         (driver_user_id, direct_score, operational_stability, pickup_punctuality, route_adherence,
          document_quality, composite_score, tier, review_count, weighted_review_count, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId,
        data.directScore,
        data.metrics.operationalStability ?? 0,
        data.metrics.pickupPunctuality ?? 0,
        data.metrics.routeAdherence ?? 0,
        data.metrics.documentQuality ?? 0,
        data.compositeScore,
        data.tier,
        data.reviewCount,
        data.weightedReviewCount,
        JSON.stringify(data.metrics),
      ],
    );
    await pool.query(
      `UPDATE drivers SET reputation_tier = $2, reputation_monitoring = $3 WHERE user_id = $1`,
      [userId, data.tier, data.compositeScore < 4.3],
    );
  } else {
    await pool.query(
      `INSERT INTO passenger_reputation_snapshots
         (passenger_user_id, direct_score, boarding_presence, payment_success, late_cancel_index,
          behavior_index, composite_score, tier, review_count, weighted_review_count, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId,
        data.directScore,
        data.metrics.boardingPresence ?? 0,
        data.metrics.paymentSuccess ?? 0,
        data.metrics.lateCancelIndex ?? 0,
        data.metrics.behaviorIndex ?? 0,
        data.compositeScore,
        data.tier,
        data.reviewCount,
        data.weightedReviewCount,
        JSON.stringify(data.metrics),
      ],
    );
    await pool.query(
      `UPDATE users SET reputation_tier = $2, reputation_monitoring = $3 WHERE id = $1`,
      [userId, data.tier, data.compositeScore < 4.3],
    );
  }
}

export async function getPassengerReputation(passengerId: string): Promise<number> {
  if (useMemory()) return memoryPassengerRep.get(passengerId)?.score ?? 4.7;

  const { rows } = await pool.query('SELECT reputation_score FROM users WHERE id = $1', [passengerId]);
  return Number(rows[0]?.reputation_score ?? 4.7);
}

export async function getDriverReputation(driverId: string): Promise<number> {
  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(driverId);
    return driver?.reputationScore ?? 4.7;
  }
  const { rows } = await pool.query('SELECT reputation_score FROM drivers WHERE user_id = $1', [driverId]);
  return Number(rows[0]?.reputation_score ?? 4.7);
}

export async function getUserReputationProfile(userId: string, role: 'passenger' | 'driver') {
  const score = role === 'driver' ? await getDriverReputation(userId) : await getPassengerReputation(userId);
  const profile = getReputationProfile(score, role);
  const revocation = await hasActiveBenefitRevocation(userId, role);
  if (revocation) {
    return {
      ...profile,
      benefits: stripBenefitsForRevocation(profile.benefits),
      benefitsRevoked: true,
      revocationReason: revocation.reason,
    };
  }
  return profile;
}

export async function getFullReputationDashboard(userId: string, role: 'passenger' | 'driver') {
  const profile = await getUserReputationProfile(userId, role);
  const badges = await listUserBadges(userId);
  const pendingReviews = await getPendingReviewsForUser(userId);
  const recentReviews = (await listReviewsForUser(userId)).slice(0, 10).map((r) => ({
    rideId: r.rideId,
    stars: r.stars,
    reviewerRole: r.reviewerRole,
    createdAt: r.createdAt.toISOString(),
  }));

  let history: Array<{ compositeScore: number; tier: string; snapshotAt: string }> = [];
  if (!useMemory()) {
    const table = role === 'driver' ? 'driver_reputation_snapshots' : 'passenger_reputation_snapshots';
    const col = role === 'driver' ? 'driver_user_id' : 'passenger_user_id';
    const { rows } = await pool.query(
      `SELECT composite_score, tier, snapshot_at FROM ${table}
       WHERE ${col} = $1 ORDER BY snapshot_at DESC LIMIT 12`,
      [userId],
    );
    history = rows.map((row) => ({
      compositeScore: Number(row.composite_score),
      tier: row.tier as string,
      snapshotAt: new Date(row.snapshot_at as string).toISOString(),
    }));
  }

  return {
    profile,
    badges: badges.map(toPublicBadge),
    pendingReviews,
    recentReviewsReceived: recentReviews,
    history,
  };
}

export async function recalculateUserReputation(userId: string, role: 'passenger' | 'driver') {
  const reviews = await listReviewsForUser(userId);
  const reviewInputs = await buildReviewInputs(reviews);

  const lambda =
    role === 'driver' ? REPUTATION_CONFIG.driverLambda : REPUTATION_CONFIG.passengerLambda;
  const m = role === 'driver' ? REPUTATION_CONFIG.driverBayesianM : REPUTATION_CONFIG.passengerBayesianM;

  const { rating: rawDirect, weightedCount } = computeWeightedRating(reviewInputs, lambda);
  const directScore =
    Math.round(applyBayesianSmoothing(rawDirect || GLOBAL_MEAN, weightedCount, m, GLOBAL_MEAN) * 10_000) /
    10_000;

  let compositeScore = directScore;
  let metrics: Record<string, number> = {};

  if (role === 'driver') {
    const ops = await getDriverOperationalMetrics(userId);
    compositeScore = computeDriverCompositeScore(directScore, ops);
    metrics = ops;
  } else {
    const ops = await getPassengerOperationalMetrics(userId);
    compositeScore = computePassengerCompositeScore(directScore, ops);
    metrics = ops;
  }

  const tier = getTier(compositeScore);
  let previousScore: number | undefined;

  if (role === 'driver') {
    if (useMemory()) {
      const driver = await memoryMatchStore.getDriver(userId);
      previousScore = driver?.reputationScore;
      if (driver) {
        driver.reputationScore = compositeScore;
        await memoryMatchStore.upsertDriver(driver);
      }
    } else {
      const prev = await pool.query('SELECT reputation_score FROM drivers WHERE user_id = $1', [userId]);
      previousScore = prev.rows[0] ? Number(prev.rows[0].reputation_score) : undefined;
      await pool.query(
        'UPDATE drivers SET reputation_score = $2, rating = LEAST($2, 5), reputation_tier = $3, reputation_monitoring = $4 WHERE user_id = $1',
        [userId, compositeScore, tier, compositeScore < 4.3],
      );
    }
  } else if (useMemory()) {
    previousScore = memoryPassengerRep.get(userId)?.score;
    memoryPassengerRep.set(userId, { score: compositeScore, tier });
  } else {
    const prev = await pool.query('SELECT reputation_score FROM users WHERE id = $1', [userId]);
    previousScore = prev.rows[0] ? Number(prev.rows[0].reputation_score) : undefined;
    await pool.query(
      'UPDATE users SET reputation_score = $2, reputation_tier = $3, reputation_monitoring = $4 WHERE id = $1',
      [userId, compositeScore, tier, compositeScore < 4.3],
    );
  }

  await saveSnapshot(userId, role, {
    directScore,
    compositeScore,
    tier,
    reviewCount: reviews.length,
    weightedReviewCount: weightedCount,
    metrics,
  });

  await syncUserBadges(userId, role, compositeScore);

  if (!useMemory()) {
    await pool.query(
      `INSERT INTO reputation_events
         (user_id, user_role, event_type, previous_score, new_score, source_ride_id, metadata_json)
       VALUES ($1, $2, 'REVIEW_RECALC', $3, $4, NULL, $5)`,
      [
        userId,
        role,
        previousScore ?? null,
        compositeScore,
        JSON.stringify({ reviewCount: reviews.length, weightedCount, directScore, tier }),
      ],
    );
  }

  return compositeScore;
}

export async function listAvailableReviewTags(role: 'passenger' | 'driver') {
  const tags = await listReviewTags();
  return tags.filter((t) => t.appliesTo === 'both' || t.appliesTo === role);
}
