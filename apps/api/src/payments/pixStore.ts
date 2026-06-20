import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export type PixChargeStatus = 'pending' | 'paid' | 'expired' | 'cancelled';

export interface PixChargeRecord {
  id: string;
  paymentIntentId: string;
  txid: string;
  qrCodePayload: string;
  qrCodeImageUrl?: string;
  status: PixChargeStatus;
  amountCentavos: number;
  paidAt?: Date;
  webhookReceivedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const memoryPix = new Map<string, PixChargeRecord>();

function mapRow(row: Record<string, unknown>): PixChargeRecord {
  return {
    id: row.id as string,
    paymentIntentId: row.payment_intent_id as string,
    txid: row.txid as string,
    qrCodePayload: row.qr_code_payload as string,
    qrCodeImageUrl: (row.qr_code_image_url as string) ?? undefined,
    status: row.status as PixChargeStatus,
    amountCentavos: Number(row.amount_centavos),
    paidAt: row.paid_at ? new Date(row.paid_at as string) : undefined,
    webhookReceivedAt: row.webhook_received_at ? new Date(row.webhook_received_at as string) : undefined,
    expiresAt: new Date(row.expires_at as string),
    createdAt: new Date(row.created_at as string),
  };
}

export async function createPixCharge(params: {
  paymentIntentId: string;
  txid: string;
  qrCodePayload: string;
  amountCentavos: number;
  expiresAt: Date;
}): Promise<PixChargeRecord> {
  const now = new Date();
  const record: PixChargeRecord = {
    id: randomUUID(),
    paymentIntentId: params.paymentIntentId,
    txid: params.txid,
    qrCodePayload: params.qrCodePayload,
    status: 'pending',
    amountCentavos: params.amountCentavos,
    expiresAt: params.expiresAt,
    createdAt: now,
  };

  if (config.useMemoryDb) {
    memoryPix.set(record.txid, record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO pix_charges (payment_intent_id, txid, qr_code_payload, amount_centavos, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [params.paymentIntentId, params.txid, params.qrCodePayload, params.amountCentavos, params.expiresAt],
  );
  return mapRow(rows[0]);
}

export async function getPixByTxid(txid: string): Promise<PixChargeRecord | null> {
  if (config.useMemoryDb) return memoryPix.get(txid) ?? null;
  const { rows } = await pool.query(`SELECT * FROM pix_charges WHERE txid = $1`, [txid]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getPixForIntent(intentId: string): Promise<PixChargeRecord | null> {
  if (config.useMemoryDb) {
    return [...memoryPix.values()].find((p) => p.paymentIntentId === intentId) ?? null;
  }
  const { rows } = await pool.query(
    `SELECT * FROM pix_charges WHERE payment_intent_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [intentId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function markPixPaid(txid: string): Promise<PixChargeRecord | null> {
  const now = new Date();
  if (config.useMemoryDb) {
    const pix = memoryPix.get(txid);
    if (!pix || pix.status === 'paid') return pix ?? null;
    pix.status = 'paid';
    pix.paidAt = now;
    pix.webhookReceivedAt = now;
    return pix;
  }

  const { rows } = await pool.query(
    `UPDATE pix_charges SET status = 'paid', paid_at = NOW(), webhook_received_at = NOW()
     WHERE txid = $1 AND status = 'pending' RETURNING *`,
    [txid],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export function toPublicPixCharge(p: PixChargeRecord) {
  return {
    txid: p.txid,
    status: p.status,
    qrCodePayload: p.qrCodePayload,
    amountCentavos: p.amountCentavos,
    expiresAt: p.expiresAt.toISOString(),
    paidAt: p.paidAt?.toISOString(),
  };
}
