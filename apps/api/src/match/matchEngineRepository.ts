import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory, memoryMatchStore } from '../stores/memoryMatchStore.js';
import { getOfferTimeoutSeconds } from './eligibility.js';
import type { RideRecord } from './types.js';
import { createOfferPg, getOfferPg, updateOfferStatusPg, insertOfferResponsePg } from '../stores/rideRepository.js';
import { emitEvent } from '../realtime/eventBus.js';

export interface AttemptMeta {
  id: string;
  rideId?: string;
  sequentialCursor: number;
  candidateCount: number;
  stageNumber: number;
  strategy: 'sequential' | 'parallel';
}

export interface AttemptCandidate {
  driverId: string;
  rankPosition: number;
  score: number;
}

const memoryAttemptMeta = new Map<string, AttemptMeta>();
const memoryCandidates = new Map<string, AttemptCandidate[]>();
const memoryIdempotencyKeys = new Set<string>();

export async function registerAttemptMeta(input: {
  attemptId: string;
  rideId?: string;
  stageNumber: number;
  strategy: 'sequential' | 'parallel';
  candidateCount: number;
  agingBonus?: number;
  idempotencyKey?: string;
}) {
  memoryAttemptMeta.set(input.attemptId, {
    id: input.attemptId,
    rideId: input.rideId,
    sequentialCursor: 0,
    candidateCount: input.candidateCount,
    stageNumber: input.stageNumber,
    strategy: input.strategy,
  });
  if (input.idempotencyKey) memoryIdempotencyKeys.add(input.idempotencyKey);

  if (useMemory()) return;

  await pool.query(
    `UPDATE ride_match_attempts SET
       aging_bonus_applied = COALESCE($2, aging_bonus_applied),
       idempotency_key = COALESCE($3, idempotency_key)
     WHERE id = $1`,
    [input.attemptId, input.agingBonus ?? 0, input.idempotencyKey ?? null],
  );
}

export async function attemptExistsByIdempotency(key: string): Promise<boolean> {
  if (useMemory()) return memoryIdempotencyKeys.has(key);
  const { rows } = await pool.query(
    `SELECT 1 FROM ride_match_attempts WHERE idempotency_key = $1 LIMIT 1`,
    [key],
  );
  return rows.length > 0;
}

export async function getAttemptMeta(attemptId: string): Promise<AttemptMeta | null> {
  if (useMemory()) return memoryAttemptMeta.get(attemptId) ?? null;
  const { rows } = await pool.query(
    `SELECT id, sequential_cursor, candidate_count, stage_number, strategy
     FROM ride_match_attempts WHERE id = $1`,
    [attemptId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id as string,
    sequentialCursor: Number(rows[0].sequential_cursor),
    candidateCount: Number(rows[0].candidate_count),
    stageNumber: Number(rows[0].stage_number),
    strategy: rows[0].strategy as 'sequential' | 'parallel',
  };
}

export async function incrementSequentialCursor(attemptId: string, cursor: number) {
  const meta = memoryAttemptMeta.get(attemptId);
  if (meta) meta.sequentialCursor = cursor;
  if (!useMemory()) {
    await pool.query(`UPDATE ride_match_attempts SET sequential_cursor = $2 WHERE id = $1`, [
      attemptId,
      cursor,
    ]);
  }
}

export function seedMemoryCandidates(attemptId: string, list: AttemptCandidate[]) {
  memoryCandidates.set(attemptId, list);
}

export async function listCandidatesForAttempt(attemptId: string): Promise<AttemptCandidate[]> {
  if (useMemory()) {
    return (memoryCandidates.get(attemptId) ?? []).sort((a, b) => a.rankPosition - b.rankPosition);
  }
  const { rows } = await pool.query(
    `SELECT driver_id, rank_position, score FROM ride_match_candidates
     WHERE attempt_id = $1 ORDER BY rank_position ASC`,
    [attemptId],
  );
  return rows.map((r) => ({
    driverId: r.driver_id as string,
    rankPosition: Number(r.rank_position),
    score: Number(r.score),
  }));
}

export async function createOfferForCandidate(input: {
  ride: RideRecord;
  attemptId: string;
  driverId: string;
  offerType: 'sequential' | 'parallel';
}) {
  const timeoutSec = getOfferTimeoutSeconds(input.ride.categoryCode);
  const expiresAt = new Date(Date.now() + timeoutSec * 1000);

  const offer = useMemory()
    ? await memoryMatchStore.createOffer({
        rideId: input.ride.id,
        attemptId: input.attemptId,
        driverId: input.driverId,
        offerBatch: 1,
        offerType: input.offerType,
        status: 'pending',
        expiresAt,
      })
    : await createOfferPg({
        rideId: input.ride.id,
        attemptId: input.attemptId,
        driverId: input.driverId,
        offerBatch: 1,
        offerType: input.offerType,
        expiresAt,
      });

  void emitEvent(
    'RIDE_OFFERED',
    'ride',
    input.ride.id,
    { offerId: offer.id, rideId: input.ride.id, categoryCode: input.ride.categoryCode },
    { driverId: input.driverId, rideId: input.ride.id, userIds: [input.ride.passengerId] },
  );

  return offer;
}

export async function expireOffers(rideId: string) {
  if (useMemory()) {
    await memoryMatchStore.expirePendingOffersForRide(rideId);
    return;
  }
  const { rows } = await pool.query(
    `SELECT id FROM ride_offers WHERE ride_id = $1 AND status = 'pending'`,
    [rideId],
  );
  for (const row of rows) {
    const offerId = row.id as string;
    const offer = await getOfferPg(offerId);
    if (offer?.status === 'pending') {
      await updateOfferStatusPg(offerId, 'expired');
      await insertOfferResponsePg(offerId, 'timeout');
    }
  }
}

export async function getMatchTrail(rideId: string) {
  if (useMemory()) {
    const attempts = [...memoryAttemptMeta.values()]
      .filter((a) => a.rideId === rideId)
      .sort((a, b) => a.stageNumber - b.stageNumber);
    return {
      rideId,
      attempts: attempts.map((a) => ({
        ...a,
        candidates: memoryCandidates.get(a.id) ?? [],
      })),
      timeoutEvents: [],
    };
  }

  const { rows: attemptRows } = await pool.query(
    `SELECT * FROM ride_match_attempts WHERE ride_id = $1 ORDER BY stage_number ASC`,
    [rideId],
  );
  const attempts = [];
  for (const row of attemptRows) {
    const attemptId = row.id as string;
    const { rows: candRows } = await pool.query(
      `SELECT driver_id, rank_position, score, eta_pickup_s, distance_m
       FROM ride_match_candidates WHERE attempt_id = $1 ORDER BY rank_position`,
      [attemptId],
    );
    const { rows: offerRows } = await pool.query(
      `SELECT id, driver_id, status, offer_type, expires_at, created_at
       FROM ride_offers WHERE attempt_id = $1 ORDER BY created_at`,
      [attemptId],
    );
    attempts.push({
      id: attemptId,
      stageNumber: Number(row.stage_number),
      searchRadiusM: Number(row.search_radius_m),
      strategy: row.strategy,
      resultStatus: row.result_status,
      sequentialCursor: Number(row.sequential_cursor ?? 0),
      agingBonusApplied: Number(row.aging_bonus_applied ?? 0),
      idempotencyKey: row.idempotency_key,
      candidates: candRows,
      offers: offerRows,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    });
  }

  const { rows: timeoutRows } = await pool.query(
    `SELECT * FROM match_offer_timeout_events WHERE ride_id = $1 ORDER BY created_at DESC`,
    [rideId],
  );

  return { rideId, attempts, timeoutEvents: timeoutRows };
}

export function __testResetMatchEngineMemory() {
  memoryAttemptMeta.clear();
  memoryCandidates.clear();
  memoryIdempotencyKeys.clear();
}

export function __testRegisterMemoryAttempt(input: {
  attemptId: string;
  rideId: string;
  stageNumber: number;
  strategy: 'sequential' | 'parallel';
  candidates: AttemptCandidate[];
}) {
  registerAttemptMeta({
    attemptId: input.attemptId,
    rideId: input.rideId,
    stageNumber: input.stageNumber,
    strategy: input.strategy,
    candidateCount: input.candidates.length,
  });
  seedMemoryCandidates(input.attemptId, input.candidates);
}
