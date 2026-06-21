import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export type ReviewObligationStatus = 'pending' | 'submitted' | 'expired';

export interface ReviewObligationRecord {
  id: string;
  rideId: string;
  reviewerUserId: string;
  reviewedUserId: string;
  reviewerRole: 'passenger' | 'driver';
  status: ReviewObligationStatus;
  expiresAt: Date;
  reviewId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const memoryObligations = new Map<string, ReviewObligationRecord>();

function mapRow(row: Record<string, unknown>): ReviewObligationRecord {
  return {
    id: row.id as string,
    rideId: row.ride_id as string,
    reviewerUserId: row.reviewer_user_id as string,
    reviewedUserId: row.reviewed_user_id as string,
    reviewerRole: row.reviewer_role as 'passenger' | 'driver',
    status: row.status as ReviewObligationStatus,
    expiresAt: new Date(row.expires_at as string),
    reviewId: (row.review_id as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function createReviewObligations(params: {
  rideId: string;
  passengerId: string;
  driverId: string;
  expiresAt: Date;
}): Promise<ReviewObligationRecord[]> {
  const base = [
    {
      reviewerUserId: params.passengerId,
      reviewedUserId: params.driverId,
      reviewerRole: 'passenger' as const,
    },
    {
      reviewerUserId: params.driverId,
      reviewedUserId: params.passengerId,
      reviewerRole: 'driver' as const,
    },
  ];

  const created: ReviewObligationRecord[] = [];
  for (const item of base) {
    const record = await upsertObligation({
      rideId: params.rideId,
      ...item,
      expiresAt: params.expiresAt,
    });
    created.push(record);
  }
  return created;
}

async function upsertObligation(input: {
  rideId: string;
  reviewerUserId: string;
  reviewedUserId: string;
  reviewerRole: 'passenger' | 'driver';
  expiresAt: Date;
}): Promise<ReviewObligationRecord> {
  const now = new Date();
  if (useMemory()) {
    const key = `${input.rideId}:${input.reviewerUserId}`;
    const existing = memoryObligations.get(key);
    if (existing) return existing;

    const record: ReviewObligationRecord = {
      id: randomUUID(),
      rideId: input.rideId,
      reviewerUserId: input.reviewerUserId,
      reviewedUserId: input.reviewedUserId,
      reviewerRole: input.reviewerRole,
      status: 'pending',
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    memoryObligations.set(key, record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO ride_review_obligations
       (ride_id, reviewer_user_id, reviewed_user_id, reviewer_role, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ride_id, reviewer_user_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [input.rideId, input.reviewerUserId, input.reviewedUserId, input.reviewerRole, input.expiresAt],
  );
  return mapRow(rows[0]);
}

export async function markObligationSubmitted(
  rideId: string,
  reviewerUserId: string,
  reviewId: string,
): Promise<void> {
  if (useMemory()) {
    const record = memoryObligations.get(`${rideId}:${reviewerUserId}`);
    if (record) {
      record.status = 'submitted';
      record.reviewId = reviewId;
      record.updatedAt = new Date();
    }
    return;
  }

  await pool.query(
    `UPDATE ride_review_obligations
     SET status = 'submitted', review_id = $3, updated_at = NOW()
     WHERE ride_id = $1 AND reviewer_user_id = $2`,
    [rideId, reviewerUserId, reviewId],
  );
}

export async function expireStaleObligations(now = new Date()): Promise<number> {
  if (useMemory()) {
    let count = 0;
    for (const record of memoryObligations.values()) {
      if (record.status === 'pending' && record.expiresAt <= now) {
        record.status = 'expired';
        record.updatedAt = now;
        count++;
      }
    }
    return count;
  }

  const result = await pool.query(
    `UPDATE ride_review_obligations
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at <= $1`,
    [now],
  );
  return result.rowCount ?? 0;
}

export async function listPendingObligationsForUser(
  userId: string,
): Promise<ReviewObligationRecord[]> {
  await expireStaleObligations();

  if (useMemory()) {
    return [...memoryObligations.values()].filter(
      (o) => o.reviewerUserId === userId && o.status === 'pending' && o.expiresAt > new Date(),
    );
  }

  const { rows } = await pool.query(
    `SELECT * FROM ride_review_obligations
     WHERE reviewer_user_id = $1 AND status = 'pending' AND expires_at > NOW()
     ORDER BY expires_at ASC`,
    [userId],
  );
  return rows.map(mapRow);
}
