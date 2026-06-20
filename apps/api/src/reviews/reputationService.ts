import {
  applyBayesianSmoothing,
  computeWeightedRating,
  REPUTATION_CONFIG,
} from '../domain/reputation.js';
import { pool } from '../db.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';
import { listReviewsForUser } from './reviewStore.js';

const memoryPassengerRep = new Map<string, number>();

export async function getPassengerReputation(passengerId: string): Promise<number> {
  if (useMemory()) return memoryPassengerRep.get(passengerId) ?? 4.7;

  const { rows } = await pool.query('SELECT reputation_score FROM users WHERE id = $1', [passengerId]);
  return Number(rows[0]?.reputation_score ?? 4.7);
}

export async function recalculateUserReputation(userId: string, role: 'passenger' | 'driver') {
  const reviews = await listReviewsForUser(userId);
  const reviewInputs = reviews.map((r) => ({
    stars: r.stars,
    daysAgo: (Date.now() - r.createdAt.getTime()) / 86_400_000,
  }));

  const lambda =
    role === 'driver' ? REPUTATION_CONFIG.driverLambda : REPUTATION_CONFIG.passengerLambda;
  const m = role === 'driver' ? REPUTATION_CONFIG.driverBayesianM : REPUTATION_CONFIG.passengerBayesianM;
  const raw = computeWeightedRating(reviewInputs, lambda);
  const weightedCount = reviewInputs.length;
  const score =
    Math.round(applyBayesianSmoothing(raw || 4.7, weightedCount, m) * 10_000) / 10_000;

  let previousScore: number | undefined;

  if (role === 'driver') {
    if (useMemory()) {
      const driver = await memoryMatchStore.getDriver(userId);
      previousScore = driver?.reputationScore;
      if (driver) {
        driver.reputationScore = score;
        await memoryMatchStore.upsertDriver(driver);
      }
    } else {
      const prev = await pool.query('SELECT reputation_score FROM drivers WHERE user_id = $1', [userId]);
      previousScore = prev.rows[0] ? Number(prev.rows[0].reputation_score) : undefined;
      await pool.query(
        'UPDATE drivers SET reputation_score = $2, rating = LEAST($2, 5) WHERE user_id = $1',
        [userId, score],
      );
    }
  } else if (useMemory()) {
    previousScore = memoryPassengerRep.get(userId);
    memoryPassengerRep.set(userId, score);
  } else {
    const prev = await pool.query('SELECT reputation_score FROM users WHERE id = $1', [userId]);
    previousScore = prev.rows[0] ? Number(prev.rows[0].reputation_score) : undefined;
    await pool.query('UPDATE users SET reputation_score = $2 WHERE id = $1', [userId, score]);
  }

  if (!useMemory()) {
    await pool.query(
      `INSERT INTO reputation_events
         (user_id, user_role, event_type, previous_score, new_score, source_ride_id, metadata_json)
       VALUES ($1, $2, 'REVIEW_RECALC', $3, $4, NULL, $5)`,
      [userId, role, previousScore ?? null, score, JSON.stringify({ reviewCount: reviews.length })],
    );
  }

  return score;
}
