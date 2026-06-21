import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getCategory } from '../domain/rideCategories.js';
import type { RideCategoryCode } from '../domain/types.js';
import { getPaymentIntentForRide } from '../payments/paymentStore.js';
import type { RideRecord } from '../match/types.js';
import { formatFare } from '../domain/pricing.js';

export interface RideReceiptRecord {
  id: string;
  rideId: string;
  userId: string;
  receiptNumber: string;
  amountCentavos: number;
  currency: string;
  paymentMethodType?: string;
  breakdown: Record<string, unknown>;
  htmlContent: string;
  issuedAt: Date;
}

const memoryReceipts = new Map<string, RideReceiptRecord>();

function receiptKey(rideId: string, userId: string) {
  return `${rideId}:${userId}`;
}

function buildReceiptNumber(rideId: string) {
  return `BC-${rideId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

function buildHtmlReceipt(params: {
  receiptNumber: string;
  ride: RideRecord;
  amountCentavos: number;
  paymentMethodType?: string;
  passengerName?: string;
  issuedAt: Date;
}) {
  const category = getCategory(params.ride.categoryCode as RideCategoryCode);
  const fare = formatFare(params.amountCentavos);
  const issued = params.issuedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Recibo ${params.receiptNumber}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:24px auto;color:#111}
h1{font-size:1.25rem}table{width:100%;border-collapse:collapse;margin-top:16px}
td{padding:8px 0;border-bottom:1px solid #eee}.total{font-weight:700;font-size:1.1rem}</style></head>
<body>
<h1>BC Taxi — Recibo</h1>
<p>Nº ${params.receiptNumber}<br>Emitido em ${issued}</p>
<table>
<tr><td>Categoria</td><td>${category?.name ?? params.ride.categoryCode}</td></tr>
<tr><td>Origem</td><td>${params.ride.pickupAddress ?? '—'}</td></tr>
<tr><td>Destino</td><td>${params.ride.dropoffAddress ?? '—'}</td></tr>
<tr><td>Pagamento</td><td>${params.paymentMethodType ?? '—'}</td></tr>
<tr class="total"><td>Total</td><td>${fare}</td></tr>
</table>
<p style="color:#666;font-size:12px;margin-top:24px">Documento fiscal simplificado para fins de comprovação de viagem.</p>
</body></html>`;
}

export async function issueRideReceipt(ride: RideRecord, passengerName?: string): Promise<RideReceiptRecord> {
  const existing = await getRideReceipt(ride.id, ride.passengerId);
  if (existing) return existing;

  const intent = await getPaymentIntentForRide(ride.id);
  const amount = intent?.amountCapturedCentavos || intent?.amountAuthorizedCentavos || ride.estimatedFareCentavos || 0;
  const receiptNumber = buildReceiptNumber(ride.id);
  const issuedAt = ride.completedAt ?? new Date();

  const record: RideReceiptRecord = {
    id: randomUUID(),
    rideId: ride.id,
    userId: ride.passengerId,
    receiptNumber,
    amountCentavos: amount,
    currency: 'BRL',
    paymentMethodType: intent?.paymentMethodType,
    breakdown: {
      categoryCode: ride.categoryCode,
      estimatedFareCentavos: ride.estimatedFareCentavos,
      paymentIntentId: intent?.id,
    },
    htmlContent: buildHtmlReceipt({
      receiptNumber,
      ride,
      amountCentavos: amount,
      paymentMethodType: intent?.paymentMethodType,
      passengerName,
      issuedAt,
    }),
    issuedAt,
  };

  if (config.useMemoryDb) {
    memoryReceipts.set(receiptKey(ride.id, ride.passengerId), record);
    return record;
  }

  await pool.query(
    `INSERT INTO ride_receipts
      (id, ride_id, user_id, receipt_number, amount_centavos, currency, payment_method_type, breakdown_json, html_content, issued_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      record.id,
      record.rideId,
      record.userId,
      record.receiptNumber,
      record.amountCentavos,
      record.currency,
      record.paymentMethodType ?? null,
      JSON.stringify(record.breakdown),
      record.htmlContent,
      record.issuedAt,
    ],
  );

  return record;
}

export async function getRideReceipt(rideId: string, userId: string): Promise<RideReceiptRecord | null> {
  if (config.useMemoryDb) {
    return memoryReceipts.get(receiptKey(rideId, userId)) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT * FROM ride_receipts WHERE ride_id = $1 AND user_id = $2`,
    [rideId, userId],
  );
  if (!rows[0]) return null;

  return {
    id: rows[0].id as string,
    rideId: rows[0].ride_id as string,
    userId: rows[0].user_id as string,
    receiptNumber: rows[0].receipt_number as string,
    amountCentavos: Number(rows[0].amount_centavos),
    currency: rows[0].currency as string,
    paymentMethodType: (rows[0].payment_method_type as string) ?? undefined,
    breakdown: rows[0].breakdown_json as Record<string, unknown>,
    htmlContent: rows[0].html_content as string,
    issuedAt: new Date(rows[0].issued_at as string),
  };
}

export function toPublicReceipt(r: RideReceiptRecord) {
  return {
    id: r.id,
    rideId: r.rideId,
    receiptNumber: r.receiptNumber,
    amountCentavos: r.amountCentavos,
    amountLabel: formatFare(r.amountCentavos),
    currency: r.currency,
    paymentMethodType: r.paymentMethodType,
    issuedAt: r.issuedAt.toISOString(),
    breakdown: r.breakdown,
  };
}
