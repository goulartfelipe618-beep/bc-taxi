import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { PaymentMethodType } from './types.js';
import { getPspProvider, resetPspProviderCache } from './psp/pspProvider.js';
import type { PspProvider } from './psp/types.js';
import { createMercadoPagoProvider, MercadoPagoDemoPspProvider } from './psp/mercadoPagoProvider.js';
import { createPagarmeProvider } from './psp/pagarmeProvider.js';
import { createStripeProvider } from './psp/stripeProvider.js';

export type PspProviderCode = 'demo' | 'stripe' | 'mercadopago' | 'pagarme' | 'http';

export interface PspRoutingConfig {
  regionId?: string;
  methodType: PaymentMethodType;
  providerCode: PspProviderCode;
  configVersion: string;
  priority: number;
}

export interface PspRetryJob {
  id: string;
  jobType: 'capture' | 'void' | 'refund' | 'webhook_replay';
  paymentIntentId?: string;
  provider: string;
  providerRef?: string;
  payloadJson: Record<string, unknown>;
  idempotencyKey: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
}

const memoryRouting = new Map<string, PspRoutingConfig>();
const memoryRetryJobs: PspRetryJob[] = [];

const providerCache = new Map<PspProviderCode, PspProvider>();

function routingKey(regionId: string | undefined, methodType: string) {
  return `${regionId ?? 'global'}:${methodType}`;
}

function instantiateProvider(code: PspProviderCode): PspProvider {
  switch (code) {
    case 'stripe':
      try {
        return config.stripeSecretKey ? createStripeProvider() : getPspProvider();
      } catch {
        return getPspProvider();
      }
    case 'mercadopago':
      return config.mercadoPagoAccessToken
        ? createMercadoPagoProvider()
        : new MercadoPagoDemoPspProvider();
    case 'pagarme':
      return createPagarmeProvider();
    case 'http':
      return getPspProvider();
    case 'demo':
    default:
      return getPspProvider();
  }
}

function getProviderByCode(code: PspProviderCode): PspProvider {
  if (providerCache.has(code)) return providerCache.get(code)!;
  const provider = instantiateProvider(code);
  providerCache.set(code, provider);
  return provider;
}

export async function resolvePspProviderForMethod(
  methodType: PaymentMethodType,
  regionId?: string,
): Promise<{ provider: PspProvider; providerCode: PspProviderCode; configVersion: string }> {
  const effectiveRegion = regionId ?? config.defaultServiceRegionId;
  const routing = await getPspRoutingConfig(methodType, effectiveRegion);
  if (routing) {
    return {
      provider: getProviderByCode(routing.providerCode),
      providerCode: routing.providerCode,
      configVersion: routing.configVersion,
    };
  }

  const fallback = config.pspProvider as PspProviderCode;
  return {
    provider: getPspProvider(),
    providerCode: fallback === 'http' || fallback === 'stripe' || fallback === 'mercadopago' || fallback === 'pagarme'
      ? fallback
      : 'demo',
    configVersion: 'env-default',
  };
}

export async function getPspRoutingConfig(
  methodType: PaymentMethodType,
  regionId?: string,
): Promise<PspRoutingConfig | null> {
  const effectiveRegion = regionId ?? config.defaultServiceRegionId;
  if (config.useMemoryDb) {
    const specific = memoryRouting.get(routingKey(effectiveRegion, methodType));
    if (specific) return specific;
    return memoryRouting.get(routingKey(undefined, methodType)) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT method_type, provider_code, config_version, priority, region_id
     FROM psp_provider_configs
     WHERE method_type = $1
       AND is_active = TRUE
       AND effective_from <= NOW()
       AND (effective_to IS NULL OR effective_to > NOW())
       AND (region_id = $2 OR ($2 IS NOT NULL AND region_id IS NULL))
     ORDER BY (region_id IS NOT NULL) DESC, priority ASC, effective_from DESC
     LIMIT 1`,
    [methodType, effectiveRegion],
  );

  if (!rows[0]) return null;
  const row = rows[0];
  return {
    regionId: row.region_id as string | undefined,
    methodType: row.method_type as PaymentMethodType,
    providerCode: row.provider_code as PspProviderCode,
    configVersion: row.config_version as string,
    priority: Number(row.priority),
  };
}

export async function listPspRoutingConfigs(regionId?: string): Promise<PspRoutingConfig[]> {
  if (config.useMemoryDb) {
    return [...memoryRouting.values()].filter((r) => !regionId || r.regionId === regionId || !r.regionId);
  }
  const { rows } = await pool.query(
    `SELECT method_type, provider_code, config_version, priority, region_id
     FROM psp_provider_configs
     WHERE is_active = TRUE AND effective_to IS NULL
       AND ($1::uuid IS NULL OR region_id = $1 OR region_id IS NULL)
     ORDER BY method_type, priority`,
    [regionId ?? null],
  );
  return rows.map((row) => ({
    regionId: row.region_id as string | undefined,
    methodType: row.method_type as PaymentMethodType,
    providerCode: row.provider_code as PspProviderCode,
    configVersion: row.config_version as string,
    priority: Number(row.priority),
  }));
}

export async function enqueuePspRetryJob(input: {
  jobType: PspRetryJob['jobType'];
  paymentIntentId?: string;
  provider: string;
  providerRef?: string;
  payloadJson?: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<PspRetryJob> {
  const existing = await findRetryJobByIdempotency(input.idempotencyKey);
  if (existing) return existing;

  const job: PspRetryJob = {
    id: randomUUID(),
    jobType: input.jobType,
    paymentIntentId: input.paymentIntentId,
    provider: input.provider,
    providerRef: input.providerRef,
    payloadJson: input.payloadJson ?? {},
    idempotencyKey: input.idempotencyKey,
    status: 'pending',
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? 5,
    nextAttemptAt: new Date(Date.now() + (input.delayMs ?? 0)),
  };

  if (config.useMemoryDb) {
    memoryRetryJobs.push(job);
    return job;
  }

  await pool.query(
    `INSERT INTO payment_psp_retry_jobs
       (id, job_type, payment_intent_id, provider, provider_ref, payload_json, idempotency_key, max_attempts, next_attempt_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      job.id,
      job.jobType,
      input.paymentIntentId ?? null,
      input.provider,
      input.providerRef ?? null,
      JSON.stringify(job.payloadJson),
      job.idempotencyKey,
      job.maxAttempts,
      job.nextAttemptAt,
    ],
  );
  return job;
}

async function findRetryJobByIdempotency(idempotencyKey: string): Promise<PspRetryJob | null> {
  if (config.useMemoryDb) {
    return memoryRetryJobs.find((j) => j.idempotencyKey === idempotencyKey) ?? null;
  }
  const { rows } = await pool.query(`SELECT * FROM payment_psp_retry_jobs WHERE idempotency_key = $1`, [
    idempotencyKey,
  ]);
  return rows[0] ? mapRetryRow(rows[0]) : null;
}

function mapRetryRow(row: Record<string, unknown>): PspRetryJob {
  return {
    id: row.id as string,
    jobType: row.job_type as PspRetryJob['jobType'],
    paymentIntentId: row.payment_intent_id as string | undefined,
    provider: row.provider as string,
    providerRef: row.provider_ref as string | undefined,
    payloadJson: (row.payload_json as Record<string, unknown>) ?? {},
    idempotencyKey: row.idempotency_key as string,
    status: row.status as string,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    nextAttemptAt: new Date(row.next_attempt_at as string),
  };
}

async function listDueRetryJobs(limit = 20): Promise<PspRetryJob[]> {
  if (config.useMemoryDb) {
    const now = Date.now();
    return memoryRetryJobs
      .filter((j) => ['pending', 'processing'].includes(j.status) && j.nextAttemptAt.getTime() <= now)
      .slice(0, limit);
  }
  const { rows } = await pool.query(
    `SELECT * FROM payment_psp_retry_jobs
     WHERE status IN ('pending', 'processing') AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map(mapRetryRow);
}

async function updateRetryJob(
  jobId: string,
  patch: Partial<Pick<PspRetryJob, 'status' | 'attemptCount' | 'nextAttemptAt'>> & { lastError?: string },
) {
  if (config.useMemoryDb) {
    const job = memoryRetryJobs.find((j) => j.id === jobId);
    if (!job) return;
    if (patch.status) job.status = patch.status;
    if (patch.attemptCount != null) job.attemptCount = patch.attemptCount;
    if (patch.nextAttemptAt) job.nextAttemptAt = patch.nextAttemptAt;
    return;
  }
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [jobId];
  if (patch.status) {
    vals.push(patch.status);
    sets.push(`status = $${vals.length}`);
  }
  if (patch.attemptCount != null) {
    vals.push(patch.attemptCount);
    sets.push(`attempt_count = $${vals.length}`);
  }
  if (patch.nextAttemptAt) {
    vals.push(patch.nextAttemptAt);
    sets.push(`next_attempt_at = $${vals.length}`);
  }
  if (patch.lastError !== undefined) {
    vals.push(patch.lastError);
    sets.push(`last_error = $${vals.length}`);
  }
  await pool.query(`UPDATE payment_psp_retry_jobs SET ${sets.join(', ')} WHERE id = $1`, vals);
}

export async function processPspRetryJob(job: PspRetryJob): Promise<{ ok: boolean; error?: string }> {
  await updateRetryJob(job.id, { status: 'processing', attemptCount: job.attemptCount + 1 });

  try {
    if (job.jobType === 'capture') {
      const rideId = job.payloadJson.rideId as string;
      if (!rideId) throw new Error('Missing rideId for capture retry');
      const amountCentavos = Number(job.payloadJson.amountCentavos ?? 0);
      const { captureRidePayment } = await import('./paymentService.js');
      await captureRidePayment(rideId, amountCentavos > 0 ? amountCentavos : undefined, {
        categoryCode: job.payloadJson.categoryCode as import('../domain/types.js').RideCategoryCode | undefined,
        driverUserId: job.payloadJson.driverUserId as string | undefined,
      });
    } else if (job.jobType === 'webhook_replay') {
      const { handlePspWebhookWithIdempotency } = await import('./webhookService.js');
      await handlePspWebhookWithIdempotency(
        job.payloadJson as { event: 'pix.paid' | 'charge.failed'; txid?: string; paymentIntentId?: string },
        {
          provider: job.provider,
          eventId: job.idempotencyKey,
        },
      );
    } else {
      throw new Error(`Unsupported retry job type: ${job.jobType}`);
    }

    await updateRetryJob(job.id, { status: 'succeeded' });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Retry failed';
    const nextAttempt = job.attemptCount + 1;
    if (nextAttempt >= job.maxAttempts) {
      await updateRetryJob(job.id, { status: 'dead', attemptCount: nextAttempt, lastError: error });
    } else {
      const backoffMs = Math.min(60_000, 2 ** nextAttempt * 1000);
      await updateRetryJob(job.id, {
        status: 'pending',
        attemptCount: nextAttempt,
        nextAttemptAt: new Date(Date.now() + backoffMs),
        lastError: error,
      });
    }
    return { ok: false, error };
  }
}

export async function processDuePspRetryJobs(limit = 20) {
  const jobs = await listDueRetryJobs(limit);
  const results = [];
  for (const job of jobs) {
    results.push({ jobId: job.id, ...(await processPspRetryJob(job)) });
  }
  return results;
}

export async function getPspProductionHealth() {
  const routing = await listPspRoutingConfigs(config.defaultServiceRegionId);
  const providers = [...new Set(routing.map((r) => r.providerCode))];
  const pendingRetries = config.useMemoryDb
    ? memoryRetryJobs.filter((j) => ['pending', 'processing'].includes(j.status)).length
    : (
        await pool.query(
          `SELECT COUNT(*)::int AS c FROM payment_psp_retry_jobs WHERE status IN ('pending', 'processing')`,
        )
      ).rows[0]?.c ?? 0;

  return {
    productionMode: config.pspProvider !== 'demo' || Boolean(config.stripeSecretKey || config.mercadoPagoAccessToken),
    defaultProvider: config.pspProvider,
    routing,
    configuredProviders: providers,
    pendingRetryJobs: Number(pendingRetries),
  };
}

export function seedMemoryPspRouting(configs: PspRoutingConfig[]) {
  for (const c of configs) {
    memoryRouting.set(routingKey(c.regionId, c.methodType), c);
  }
}

export function __testResetPspProductionMemory() {
  memoryRouting.clear();
  memoryRetryJobs.length = 0;
  providerCache.clear();
  resetPspProviderCache();
}

export function __testGetRetryJobs() {
  return memoryRetryJobs;
}

export function startPspRetryJanitor(intervalMs = 15_000) {
  const timer = setInterval(() => {
    void processDuePspRetryJobs().catch(() => undefined);
  }, intervalMs);
  return () => clearInterval(timer);
}
