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
  tags?: string[];
  createdAt: Date;
}

export interface ReviewTagRecord {
  code: string;
  label: string;
  appliesTo: 'driver' | 'passenger' | 'both';
  isPositive: boolean;
}

const tagCatalog: ReviewTagRecord[] = [
  { code: 'pontualidade', label: 'Pontualidade', appliesTo: 'both', isPositive: true },
  { code: 'cordialidade', label: 'Cordialidade', appliesTo: 'both', isPositive: true },
  { code: 'direcao', label: 'Direção segura', appliesTo: 'driver', isPositive: true },
  { code: 'limpeza', label: 'Limpeza', appliesTo: 'driver', isPositive: true },
  { code: 'respeito', label: 'Respeito', appliesTo: 'both', isPositive: true },
  { code: 'seguranca', label: 'Segurança', appliesTo: 'both', isPositive: true },
  { code: 'comportamento', label: 'Bom comportamento', appliesTo: 'both', isPositive: true },
  { code: 'localizacao_incorreta', label: 'Localização incorreta', appliesTo: 'both', isPositive: false },
  { code: 'atraso', label: 'Atraso', appliesTo: 'both', isPositive: false },
  { code: 'bagagem', label: 'Bagagem', appliesTo: 'both', isPositive: true },
  { code: 'pet', label: 'Pet', appliesTo: 'both', isPositive: true },
  { code: 'pcd', label: 'Atendimento PCD', appliesTo: 'driver', isPositive: true },
  { code: 'pagamento', label: 'Pagamento', appliesTo: 'passenger', isPositive: true },
  { code: 'rota', label: 'Rota', appliesTo: 'driver', isPositive: true },
];

const reviewTags = new Map<string, Set<string>>();
const reviews = new Map<string, RideReviewRecord>();

export async function listReviewTags(): Promise<ReviewTagRecord[]> {
  if (useMemory()) return tagCatalog;

  const { rows } = await pool.query(
    `SELECT code, label, applies_to, is_positive FROM review_tags ORDER BY label`,
  );
  if (rows.length === 0) return tagCatalog;
  return rows.map((row) => ({
    code: row.code as string,
    label: row.label as string,
    appliesTo: row.applies_to as ReviewTagRecord['appliesTo'],
    isPositive: row.is_positive as boolean,
  }));
}

export async function validateReviewTags(codes: string[], reviewedRole: 'passenger' | 'driver'): Promise<string[]> {
  const catalog = await listReviewTags();
  const allowed = new Set(
    catalog.filter((t) => t.appliesTo === 'both' || t.appliesTo === reviewedRole).map((t) => t.code),
  );
  return codes.filter((c) => allowed.has(c));
}

async function linkReviewTags(reviewId: string, tags: string[]) {
  if (tags.length === 0) return;
  if (useMemory()) {
    reviewTags.set(reviewId, new Set(tags));
    return;
  }
  for (const tag of tags) {
    await pool.query(
      `INSERT INTO ride_review_tag_links (review_id, tag_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [reviewId, tag],
    );
  }
}

export async function getReviewTags(reviewId: string): Promise<string[]> {
  if (useMemory()) return [...(reviewTags.get(reviewId) ?? [])];
  const { rows } = await pool.query(`SELECT tag_code FROM ride_review_tag_links WHERE review_id = $1`, [reviewId]);
  return rows.map((r) => r.tag_code as string);
}

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

export async function listReviewsForUser(reviewedUserId: string): Promise<RideReviewRecord[]> {
  if (useMemory()) {
    return [...reviews.values()].filter((r) => r.reviewedUserId === reviewedUserId);
  }

  const { rows } = await pool.query(
    `SELECT * FROM ride_reviews WHERE reviewed_user_id = $1 ORDER BY created_at DESC`,
    [reviewedUserId],
  );
  return rows.map(mapRow);
}

export async function insertReview(
  input: Omit<RideReviewRecord, 'id' | 'createdAt'> & { tags?: string[] },
): Promise<RideReviewRecord> {
  const tags = input.tags ?? [];
  if (useMemory()) {
    const record: RideReviewRecord = {
      id: randomUUID(),
      ...input,
      tags,
      createdAt: new Date(),
    };
    reviews.set(reviewKey(input.rideId, input.reviewerUserId, input.reviewedUserId), record);
    await linkReviewTags(record.id, tags);
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
  const record = mapRow(rows[0]);
  record.tags = tags;
  await linkReviewTags(record.id, tags);
  return record;
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
    tags: r.tags ?? [],
    createdAt: r.createdAt.toISOString(),
  };
}
