import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export type PaymentTxnType = 'authorize' | 'capture' | 'void' | 'refund';

export interface PaymentTransactionRecord {
  id: string;
  paymentIntentId: string;
  txnType: PaymentTxnType;
  amountCentavos: number;
  currency: string;
  provider: string;
  providerRef?: string;
  idempotencyKey?: string;
  status: 'pending' | 'succeeded' | 'failed';
  createdAt: Date;
}

const memoryTxns = new Map<string, PaymentTransactionRecord>();

function mapRow(row: Record<string, unknown>): PaymentTransactionRecord {
  return {
    id: row.id as string,
    paymentIntentId: row.payment_intent_id as string,
    txnType: row.txn_type as PaymentTxnType,
    amountCentavos: Number(row.amount_centavos),
    currency: row.currency as string,
    provider: row.provider as string,
    providerRef: (row.provider_ref as string) ?? undefined,
    idempotencyKey: (row.idempotency_key as string) ?? undefined,
    status: row.status as PaymentTransactionRecord['status'],
    createdAt: new Date(row.created_at as string),
  };
}

export async function findTransactionByIdempotencyKey(
  key: string,
): Promise<PaymentTransactionRecord | null> {
  if (config.useMemoryDb) {
    return [...memoryTxns.values()].find((t) => t.idempotencyKey === key) ?? null;
  }
  const { rows } = await pool.query(`SELECT * FROM payment_transactions WHERE idempotency_key = $1`, [key]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function recordPaymentTransaction(params: {
  paymentIntentId: string;
  txnType: PaymentTxnType;
  amountCentavos: number;
  provider: string;
  providerRef?: string;
  idempotencyKey?: string;
  status?: PaymentTransactionRecord['status'];
}): Promise<PaymentTransactionRecord> {
  if (params.idempotencyKey) {
    const existing = await findTransactionByIdempotencyKey(params.idempotencyKey);
    if (existing) return existing;
  }

  const now = new Date();
  const record: PaymentTransactionRecord = {
    id: randomUUID(),
    paymentIntentId: params.paymentIntentId,
    txnType: params.txnType,
    amountCentavos: params.amountCentavos,
    currency: 'BRL',
    provider: params.provider,
    providerRef: params.providerRef,
    idempotencyKey: params.idempotencyKey,
    status: params.status ?? 'succeeded',
    createdAt: now,
  };

  if (config.useMemoryDb) {
    memoryTxns.set(record.id, record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO payment_transactions
      (payment_intent_id, txn_type, amount_centavos, currency, provider, provider_ref, idempotency_key, status)
     VALUES ($1,$2,$3,'BRL',$4,$5,$6,$7) RETURNING *`,
    [
      params.paymentIntentId,
      params.txnType,
      params.amountCentavos,
      params.provider,
      params.providerRef ?? null,
      params.idempotencyKey ?? null,
      params.status ?? 'succeeded',
    ],
  );
  return mapRow(rows[0]);
}
