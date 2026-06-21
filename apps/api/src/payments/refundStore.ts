import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export type RefundRequestStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface RefundRequestRecord {
  id: string;
  paymentIntentId: string;
  amountCentavos: number;
  reason?: string;
  status: RefundRequestStatus;
  providerRef?: string;
  idempotencyKey?: string;
  failureReason?: string;
  requestedByUserId?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const memoryRefunds = new Map<string, RefundRequestRecord>();

function mapRow(row: Record<string, unknown>): RefundRequestRecord {
  return {
    id: row.id as string,
    paymentIntentId: row.payment_intent_id as string,
    amountCentavos: Number(row.amount_centavos),
    reason: (row.reason as string) ?? undefined,
    status: row.status as RefundRequestStatus,
    providerRef: (row.provider_ref as string) ?? undefined,
    idempotencyKey: (row.idempotency_key as string) ?? undefined,
    failureReason: (row.failure_reason as string) ?? undefined,
    requestedByUserId: (row.requested_by_user_id as string) ?? undefined,
    processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function getRefundByIdempotencyKey(key: string): Promise<RefundRequestRecord | null> {
  if (config.useMemoryDb) {
    return [...memoryRefunds.values()].find((r) => r.idempotencyKey === key) ?? null;
  }
  const { rows } = await pool.query(`SELECT * FROM payment_refund_requests WHERE idempotency_key = $1`, [key]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createRefundRequest(params: {
  paymentIntentId: string;
  amountCentavos: number;
  reason?: string;
  requestedByUserId?: string;
  idempotencyKey?: string;
}): Promise<RefundRequestRecord> {
  const now = new Date();
  const record: RefundRequestRecord = {
    id: randomUUID(),
    paymentIntentId: params.paymentIntentId,
    amountCentavos: params.amountCentavos,
    reason: params.reason,
    status: 'pending',
    idempotencyKey: params.idempotencyKey,
    requestedByUserId: params.requestedByUserId,
    createdAt: now,
    updatedAt: now,
  };

  if (config.useMemoryDb) {
    memoryRefunds.set(record.id, record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO payment_refund_requests
      (payment_intent_id, amount_centavos, reason, requested_by_user_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.paymentIntentId,
      params.amountCentavos,
      params.reason ?? null,
      params.requestedByUserId ?? null,
      params.idempotencyKey ?? null,
    ],
  );
  return mapRow(rows[0]);
}

export async function updateRefundRequest(
  id: string,
  patch: Partial<
    Pick<RefundRequestRecord, 'status' | 'providerRef' | 'failureReason' | 'processedAt'>
  >,
): Promise<RefundRequestRecord | null> {
  if (config.useMemoryDb) {
    const record = memoryRefunds.get(id);
    if (!record) return null;
    if (patch.status) record.status = patch.status;
    if (patch.providerRef) record.providerRef = patch.providerRef;
    if (patch.failureReason) record.failureReason = patch.failureReason;
    if (patch.processedAt) record.processedAt = patch.processedAt;
    record.updatedAt = new Date();
    return record;
  }

  const { rows } = await pool.query(
    `UPDATE payment_refund_requests SET
      status = COALESCE($2, status),
      provider_ref = COALESCE($3, provider_ref),
      failure_reason = COALESCE($4, failure_reason),
      processed_at = COALESCE($5, processed_at),
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, patch.status ?? null, patch.providerRef ?? null, patch.failureReason ?? null, patch.processedAt ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
