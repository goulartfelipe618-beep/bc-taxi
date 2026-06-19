import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { RideOfferRecord } from '../match/types.js';

function mapOfferRow(row: Record<string, unknown>): RideOfferRecord {
  return {
    id: row.id as string,
    rideId: row.ride_id as string,
    attemptId: row.attempt_id as string,
    driverId: row.driver_id as string,
    offerBatch: Number(row.offer_batch),
    offerType: row.offer_type as RideOfferRecord['offerType'],
    status: row.status as RideOfferRecord['status'],
    expiresAt: new Date(row.expires_at as string),
    claimToken: (row.claim_token as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

export async function createOfferPg(params: {
  rideId: string;
  attemptId: string;
  driverId: string;
  offerBatch: number;
  offerType: 'sequential' | 'parallel';
  expiresAt: Date;
}) {
  const result = await pool.query(
    `INSERT INTO ride_offers (ride_id, attempt_id, driver_id, offer_batch, offer_type, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [params.rideId, params.attemptId, params.driverId, params.offerBatch, params.offerType, params.expiresAt],
  );
  return mapOfferRow(result.rows[0]);
}

export async function createAttemptPg(params: {
  rideId: string;
  stageNumber: number;
  searchRadiusM: number;
  candidateCount: number;
  strategy: 'sequential' | 'parallel';
}) {
  const result = await pool.query(
    `INSERT INTO ride_match_attempts
      (ride_id, stage_number, search_radius_m, candidate_count, strategy, result_status)
     VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
    [params.rideId, params.stageNumber, params.searchRadiusM, params.candidateCount, params.strategy],
  );
  return result.rows[0].id as string;
}

export async function saveCandidatesPg(
  attemptId: string,
  scored: {
    driverId: string;
    score: number;
    etaPickupS: number;
    distanceM: number;
    rankPosition: number;
    featureVector: Record<string, number>;
    reputation: number;
    acceptance: number;
    cancellation: number;
    online: number;
    experience: number;
    compatibility: number;
  }[],
) {
  for (const c of scored) {
    await pool.query(
      `INSERT INTO ride_match_candidates (
        attempt_id, driver_id, score, eta_pickup_s, distance_m,
        reputation_score, acceptance_score, cancellation_score,
        online_score, experience_score, compatibility_score,
        rank_position, feature_vector_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (attempt_id, driver_id) DO NOTHING`,
      [
        attemptId,
        c.driverId,
        c.score,
        c.etaPickupS,
        c.distanceM,
        c.reputation,
        c.acceptance,
        c.cancellation,
        c.online,
        c.experience,
        c.compatibility,
        c.rankPosition,
        JSON.stringify(c.featureVector),
      ],
    );
  }
}

export async function finishAttemptPg(attemptId: string, resultStatus: string) {
  await pool.query(
    `UPDATE ride_match_attempts SET result_status = $2, ended_at = NOW() WHERE id = $1`,
    [attemptId, resultStatus],
  );
}

export async function updateRideStatusPg(rideId: string, status: string, matchStage?: number) {
  await pool.query(
    `UPDATE rides SET status = $2, match_stage = COALESCE($3, match_stage), updated_at = NOW() WHERE id = $1`,
    [rideId, status, matchStage ?? null],
  );
}

export async function getOfferPg(id: string) {
  const result = await pool.query('SELECT * FROM ride_offers WHERE id = $1', [id]);
  return result.rowCount ? mapOfferRow(result.rows[0]) : null;
}

export async function getPendingOffersForDriverPg(driverId: string) {
  const result = await pool.query(
    `SELECT * FROM ride_offers WHERE driver_id = $1 AND status = 'pending' AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [driverId],
  );
  return result.rows.map(mapOfferRow);
}

export async function updateOfferStatusPg(id: string, status: string, claimToken?: string) {
  await pool.query(
    `UPDATE ride_offers SET status = $2, claim_token = COALESCE($3, claim_token), updated_at = NOW() WHERE id = $1`,
    [id, status, claimToken ?? null],
  );
}

export async function expirePendingOffersForRidePg(rideId: string) {
  await pool.query(
    `UPDATE ride_offers SET status = 'superseded', updated_at = NOW()
     WHERE ride_id = $1 AND status = 'pending'`,
    [rideId],
  );
}

export async function cancelRidePg(rideId: string, passengerId: string, reason?: string) {
  const result = await pool.query(
    `UPDATE rides SET status = 'CANCELLED', cancelled_at = NOW(), cancel_reason = $3, updated_at = NOW()
     WHERE id = $1 AND passenger_id = $2 AND status IN ('REQUESTED','OFFERING','DRIVER_ASSIGNED')
     RETURNING id`,
    [rideId, passengerId, reason ?? null],
  );
  if (result.rowCount) await expirePendingOffersForRidePg(rideId);
}

export async function insertOfferResponsePg(offerId: string, response: string) {
  await pool.query(
    `INSERT INTO ride_offer_responses (offer_id, response) VALUES ($1,$2)`,
    [offerId, response],
  );
}
