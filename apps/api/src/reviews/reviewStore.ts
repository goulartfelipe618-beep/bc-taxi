import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export interface RideReviewRecord {
  id: string;
  rideId: string;
  reviewerUserId: string;
  reviewedUserId: string;
  reviewerRole: 'passenger' | 'driver';
  reviewedRole: 'passenger' | 'driver';
  stars: number;
  comment?: string;
  createdAt: Date;
}

const reviews = new Map<string, RideReviewRecord>();

function reviewKey(rideId: string, reviewerUserId: string, reviewedUserId: string) {
  return `${rideId}:${reviewerUserId}:${reviewedUserId}`;
}

function mapRow(row: Record<string, unknown>): RideReviewRecord {
  return {
    id: row.id as string,
    rideId: row.ride_id as string,
    reviewerUserId: row.reviewer_user_id as string,
    reviewedUserId: row.reviewed_user_id as string,
    reviewerRole: row.reviewer_role as 'passenger' | 'driver',
    reviewedRole: row.reviewed_role as 'passenger' | 'driver',
    stars: row.stars as number,
    comment: (row.comment as string) ?? undefined,
    createdAt: row.created_at as Date,
  };
}

export async function findReview(
  rideId: string,
  reviewerUserId: string,
  reviewedUserId: string,
): Promise<RideReviewRecord | null> {
  if (useMemory()) {
    return reviews.get(reviewKey(rideId, reviewerUserId, reviewedUserId)) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT * FROM ride_reviews
     WHERE ride_id = $1 AND reviewer_user_id = $2 AND reviewed_user_id = $3`,
    [rideId, reviewerUserId, reviewedUserId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function insertReview(input: Omit<RideReviewRecord, 'id' | 'createdAt'>): Promise<RideReviewRecord> {
  if (useMemory()) {
    const record: RideReviewRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date(),
    };
    reviews.set(reviewKey(input.rideId, input.reviewerUserId, input.reviewedUserId), record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO ride_reviews
       (ride_id, reviewer_user_id, reviewed_user_id, reviewer_role, reviewed_role, stars, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.rideId,
      input.reviewerUserId,
      input.reviewedUserId,
      input.reviewerRole,
      input.reviewedRole,
      input.stars,
      input.comment ?? null,
    ],
  );
  return mapRow(rows[0]);
}

export function toPublicReview(r: RideReviewRecord) {
  return {
    id: r.id,
    rideId: r.rideId,
    reviewerUserId: r.reviewerUserId,
    reviewedUserId: r.reviewedUserId,
    reviewerRole: r.reviewerRole,
    reviewedRole: r.reviewedRole,
    stars: r.stars,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  };
}
