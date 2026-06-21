import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { PaymentIntentRecord, PaymentMethodRecord, PaymentMethodType } from './types.js';

/** UUIDs fixos para demo (pix, card, debit, cash). */
export const DEMO_PAYMENT_METHOD_IDS = {
  pix: '00000000-0000-4000-8000-000000000001',
  card: '00000000-0000-4000-8000-000000000002',
  debit: '00000000-0000-4000-8000-000000000003',
  cash: '00000000-0000-4000-8000-000000000004',
} as const;

const DEMO_METHODS: Omit<PaymentMethodRecord, 'userId'>[] = [
  {
    id: DEMO_PAYMENT_METHOD_IDS.pix,
    methodType: 'pix',
    label: 'PIX',
    isDefault: true,
    isActive: true,
  },
  {
    id: DEMO_PAYMENT_METHOD_IDS.card,
    methodType: 'card',
    label: 'Cartão •••• 4242',
    lastFour: '4242',
    brand: 'Visa',
    isDefault: false,
    isActive: true,
  },
  {
    id: DEMO_PAYMENT_METHOD_IDS.debit,
    methodType: 'debit',
    label: 'Débito •••• 8811',
    lastFour: '8811',
    brand: 'Mastercard',
    isDefault: false,
    isActive: true,
  },
  {
    id: DEMO_PAYMENT_METHOD_IDS.cash,
    methodType: 'cash',
    label: 'Dinheiro',
    isDefault: false,
    isActive: true,
  },
];

const methodsByUser = new Map<string, PaymentMethodRecord[]>();
const intents = new Map<string, PaymentIntentRecord>();
const methodPspById = new Map<string, { provider: string; providerRef: string; providerCustomerId?: string }>();

export interface MethodPspDetails {
  provider: string;
  providerRef: string;
  providerCustomerId?: string;
}

function seedUserMethods(userId: string): PaymentMethodRecord[] {
  const existing = methodsByUser.get(userId);
  if (existing) return existing;
  const list = DEMO_METHODS.map((m) => ({ ...m, userId }));
  methodsByUser.set(userId, list);
  return list;
}

function mapMethodRow(row: Record<string, unknown>): PaymentMethodRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    methodType: row.method_type as PaymentMethodType,
    label: row.label as string,
    lastFour: (row.last_four as string) ?? undefined,
    brand: (row.brand as string) ?? undefined,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
  };
}

function mapIntentRow(row: Record<string, unknown>): PaymentIntentRecord {
  return {
    id: row.id as string,
    rideId: (row.ride_id as string) ?? undefined,
    userId: row.user_id as string,
    paymentMethodId: (row.payment_method_id as string) ?? undefined,
    paymentMethodType: row.payment_method_type as PaymentMethodType,
    status: row.status as PaymentIntentRecord['status'],
    amountAuthorizedCentavos: Number(row.amount_authorized_centavos),
    amountCapturedCentavos: Number(row.amount_captured_centavos),
    currency: row.currency as string,
    provider: row.provider as string,
    providerRef: (row.provider_ref as string) ?? undefined,
    idempotencyKey: (row.idempotency_key as string) ?? undefined,
    failureReason: (row.failure_reason as string) ?? undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export function useMemoryPayments() {
  return config.useMemoryDb;
}

export async function listPaymentMethods(userId: string): Promise<PaymentMethodRecord[]> {
  if (useMemoryPayments()) return seedUserMethods(userId);

  const result = await pool.query(
    `SELECT * FROM payment_methods WHERE user_id = $1 AND is_active = TRUE ORDER BY is_default DESC, created_at`,
    [userId],
  );
  if (result.rowCount === 0) {
    for (const m of DEMO_METHODS) {
      await pool.query(
        `INSERT INTO payment_methods (id, user_id, method_type, label, last_four, brand, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [m.id, userId, m.methodType, m.label, m.lastFour ?? null, m.brand ?? null, m.isDefault],
      );
    }
    const seeded = await pool.query(
      `SELECT * FROM payment_methods WHERE user_id = $1 AND is_active = TRUE ORDER BY is_default DESC`,
      [userId],
    );
    return seeded.rows.map(mapMethodRow);
  }
  return result.rows.map(mapMethodRow);
}

export async function getPaymentMethod(
  userId: string,
  methodId: string,
): Promise<PaymentMethodRecord | null> {
  const methods = await listPaymentMethods(userId);
  return methods.find((m) => m.id === methodId) ?? null;
}

export async function createPaymentIntent(params: {
  userId: string;
  paymentMethodId?: string;
  paymentMethodType: PaymentMethodType;
  amountCentavos: number;
  rideId?: string;
  status?: PaymentIntentRecord['status'];
  provider?: string;
  providerRef?: string;
  idempotencyKey?: string;
  expiresAt?: Date;
}): Promise<PaymentIntentRecord> {
  const now = new Date();
  const expiresAt = params.expiresAt ?? new Date(now.getTime() + 30 * 60 * 1000);
  const status = params.status ?? 'authorized';
  const provider = params.provider ?? 'demo';

  if (useMemoryPayments()) {
    const intent: PaymentIntentRecord = {
      id: randomUUID(),
      rideId: params.rideId,
      userId: params.userId,
      paymentMethodId: params.paymentMethodId,
      paymentMethodType: params.paymentMethodType,
      status,
      amountAuthorizedCentavos: params.amountCentavos,
      amountCapturedCentavos: 0,
      currency: 'BRL',
      provider,
      providerRef: params.providerRef ?? `demo-${randomUUID().slice(0, 8)}`,
      idempotencyKey: params.idempotencyKey,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    intents.set(intent.id, intent);
    if (params.providerRef) {
      intents.set(`ref:${params.providerRef}`, intent);
    }
    return intent;
  }

  const result = await pool.query(
    `INSERT INTO payment_intents (
      ride_id, user_id, payment_method_id, payment_method_type, status,
      amount_authorized_centavos, currency, provider, provider_ref, expires_at, idempotency_key
    ) VALUES ($1,$2,$3,$4,$5,$6,'BRL',$7,$8,$9,$10) RETURNING *`,
    [
      params.rideId ?? null,
      params.userId,
      params.paymentMethodId ?? null,
      params.paymentMethodType,
      status,
      params.amountCentavos,
      provider,
      params.providerRef ?? null,
      expiresAt,
      params.idempotencyKey ?? null,
    ],
  );
  return mapIntentRow(result.rows[0]);
}

export async function getPaymentIntentByIdempotencyKey(key: string): Promise<PaymentIntentRecord | null> {
  if (useMemoryPayments()) {
    return [...intents.values()].find((i) => i.idempotencyKey === key) ?? null;
  }
  const result = await pool.query(`SELECT * FROM payment_intents WHERE idempotency_key = $1`, [key]);
  return result.rowCount ? mapIntentRow(result.rows[0]) : null;
}

export async function getPaymentIntent(id: string): Promise<PaymentIntentRecord | null> {
  if (useMemoryPayments()) return intents.get(id) ?? null;
  const result = await pool.query('SELECT * FROM payment_intents WHERE id = $1', [id]);
  return result.rowCount ? mapIntentRow(result.rows[0]) : null;
}

export async function attachIntentToRideStore(rideId: string, intentId: string) {
  if (useMemoryPayments()) {
    const intent = intents.get(intentId);
    if (intent) {
      intent.rideId = rideId;
      intent.updatedAt = new Date();
    }
    return;
  }
  await pool.query(
    `UPDATE payment_intents SET ride_id = $2, updated_at = NOW() WHERE id = $1`,
    [intentId, rideId],
  );
  await pool.query(`UPDATE rides SET payment_intent_id = $2, updated_at = NOW() WHERE id = $1`, [
    rideId,
    intentId,
  ]);
}

export async function updatePaymentIntentStatus(
  intentId: string,
  status: PaymentIntentRecord['status'],
  patch: Partial<Pick<PaymentIntentRecord, 'amountCapturedCentavos' | 'failureReason'>> = {},
) {
  if (useMemoryPayments()) {
    const intent = intents.get(intentId);
    if (!intent) return null;
    intent.status = status;
    if (patch.amountCapturedCentavos != null) intent.amountCapturedCentavos = patch.amountCapturedCentavos;
    if (patch.failureReason != null) intent.failureReason = patch.failureReason;
    intent.updatedAt = new Date();
    return intent;
  }

  const result = await pool.query(
    `UPDATE payment_intents SET
      status = $2,
      amount_captured_centavos = COALESCE($3, amount_captured_centavos),
      failure_reason = COALESCE($4, failure_reason),
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [intentId, status, patch.amountCapturedCentavos ?? null, patch.failureReason ?? null],
  );
  return result.rowCount ? mapIntentRow(result.rows[0]) : null;
}

export async function getPaymentIntentForRide(rideId: string): Promise<PaymentIntentRecord | null> {
  if (useMemoryPayments()) {
    return [...intents.values()].find((i) => i.rideId === rideId) ?? null;
  }
  const result = await pool.query(
    `SELECT * FROM payment_intents WHERE ride_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [rideId],
  );
  return result.rowCount ? mapIntentRow(result.rows[0]) : null;
}

export function resolveMethodType(methodId: string): PaymentMethodType | null {
  const entry = Object.entries(DEMO_PAYMENT_METHOD_IDS).find(([, id]) => id === methodId);
  return entry ? (entry[0] as PaymentMethodType) : null;
}

export async function getMethodPspDetails(methodId: string): Promise<MethodPspDetails | null> {
  if (useMemoryPayments()) {
    return methodPspById.get(methodId) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT provider, provider_ref, provider_customer_id FROM payment_methods WHERE id = $1`,
    [methodId],
  );
  if (!rows[0]?.provider_ref) return null;
  return {
    provider: rows[0].provider as string,
    providerRef: rows[0].provider_ref as string,
    providerCustomerId: (rows[0].provider_customer_id as string) ?? undefined,
  };
}

export async function saveTokenizedPaymentMethod(params: {
  userId: string;
  methodType: PaymentMethodType;
  label: string;
  lastFour?: string;
  brand?: string;
  provider: string;
  providerRef: string;
  providerCustomerId?: string;
  fingerprintHash?: string;
  setDefault?: boolean;
}): Promise<PaymentMethodRecord> {
  const id = randomUUID();
  const method: PaymentMethodRecord = {
    id,
    userId: params.userId,
    methodType: params.methodType,
    label: params.label,
    lastFour: params.lastFour,
    brand: params.brand,
    isDefault: params.setDefault ?? false,
    isActive: true,
  };

  if (useMemoryPayments()) {
    const list = seedUserMethods(params.userId);
    if (params.setDefault) {
      for (const m of list) m.isDefault = false;
    }
    list.push(method);
    methodPspById.set(id, {
      provider: params.provider,
      providerRef: params.providerRef,
      providerCustomerId: params.providerCustomerId,
    });
    return method;
  }

  if (params.setDefault) {
    await pool.query(`UPDATE payment_methods SET is_default = FALSE WHERE user_id = $1`, [params.userId]);
  }

  const { rows } = await pool.query(
    `INSERT INTO payment_methods
      (id, user_id, method_type, label, last_four, brand, is_default, provider, provider_ref, provider_customer_id, fingerprint_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      id,
      params.userId,
      params.methodType,
      params.label,
      params.lastFour ?? null,
      params.brand ?? null,
      params.setDefault ?? false,
      params.provider,
      params.providerRef,
      params.providerCustomerId ?? null,
      params.fingerprintHash ?? null,
    ],
  );
  return mapMethodRow(rows[0]);
}

export async function getPaymentIntentByProviderRef(providerRef: string): Promise<PaymentIntentRecord | null> {
  if (useMemoryPayments()) {
    const cached = intents.get(`ref:${providerRef}`);
    if (cached) return cached;
    return [...intents.values()].find((i) => i.providerRef === providerRef) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT * FROM payment_intents WHERE provider_ref = $1 ORDER BY created_at DESC LIMIT 1`,
    [providerRef],
  );
  return rows[0] ? mapIntentRow(rows[0]) : null;
}
