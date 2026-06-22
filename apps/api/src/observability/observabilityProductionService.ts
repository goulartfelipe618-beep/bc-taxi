import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { OpsAlert, OpsMetricsSnapshot } from './opsMetricsService.js';
import type { PlatformHealthSnapshot } from './platformHealthService.js';
import type { TraceComponent } from './traceService.js';

export interface ObservabilityProductionConfig {
  paymentFailureThreshold: number;
  cancelRateThreshold: number;
  acceptRateThreshold: number;
  requestToAssignMsThreshold: number;
  routeRecalcSpikeThreshold: number;
  fraudSpikeThreshold: number;
  traceSampleRateBps: number;
  configVersion: string;
}

export interface SloSnapshot {
  id: string;
  bucketHour: string;
  regionId?: string;
  categoryCode?: string;
  reputationTier?: string;
  requestToAssignMsAvg?: number;
  acceptRate?: number;
  cancelRate?: number;
  pickupEtaMsAvg?: number;
  pricingConversionRate?: number;
  paymentFailureRate?: number;
  rideCount: number;
  configVersion: string;
}

interface TraceContextState {
  traceId: string;
  parentSpanId?: string;
  rideId?: string;
}

const traceContextStorage = new AsyncLocalStorage<TraceContextState>();

const memoryConfig: ObservabilityProductionConfig = {
  paymentFailureThreshold: 0.15,
  cancelRateThreshold: 0.25,
  acceptRateThreshold: 0.45,
  requestToAssignMsThreshold: 120_000,
  routeRecalcSpikeThreshold: 25,
  fraudSpikeThreshold: 12,
  traceSampleRateBps: 10_000,
  configVersion: 'camada41-memory-v1',
};

const memorySloSnapshots: SloSnapshot[] = [];
const memoryProductionEvents: Array<{ eventType: string; configVersion: string }> = [];
const memoryProductionAlerts: OpsAlert[] = [];

export function seedMemoryObservabilityProductionConfig(cfg: Partial<ObservabilityProductionConfig>) {
  Object.assign(memoryConfig, cfg);
}

export async function getObservabilityProductionConfig(): Promise<ObservabilityProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM observability_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada41-v1' };

  return {
    paymentFailureThreshold: Number(r.payment_failure_threshold),
    cancelRateThreshold: Number(r.cancel_rate_threshold),
    acceptRateThreshold: Number(r.accept_rate_threshold),
    requestToAssignMsThreshold: Number(r.request_to_assign_ms_threshold),
    routeRecalcSpikeThreshold: Number(r.route_recalc_spike_threshold),
    fraudSpikeThreshold: Number(r.fraud_spike_threshold),
    traceSampleRateBps: Number(r.trace_sample_rate_bps),
    configVersion: r.config_version as string,
  };
}

export function runWithTraceContext<T>(ctx: TraceContextState, fn: () => T): T {
  return traceContextStorage.run(ctx, fn);
}

export function getActiveTraceContext(): TraceContextState | undefined {
  return traceContextStorage.getStore();
}

export function shouldSampleTrace(sampleRateBps: number): boolean {
  if (sampleRateBps >= 10_000) return true;
  return Math.floor(Math.random() * 10_000) < sampleRateBps;
}

export async function captureSloSnapshot(input: {
  metrics: OpsMetricsSnapshot;
  regionId?: string;
  categoryCode?: string;
  reputationTier?: string;
}): Promise<SloSnapshot> {
  const cfg = await getObservabilityProductionConfig();
  const snapshot: SloSnapshot = {
    id: randomUUID(),
    bucketHour: input.metrics.bucketHour,
    regionId: input.regionId,
    categoryCode: input.categoryCode,
    reputationTier: input.reputationTier,
    requestToAssignMsAvg: input.metrics.requestToAssignMsAvg,
    acceptRate: input.metrics.acceptRate,
    cancelRate: input.metrics.cancelRate,
    pickupEtaMsAvg: input.metrics.pickupEtaMsAvg,
    pricingConversionRate: input.metrics.pricingConversionRate,
    paymentFailureRate: input.metrics.paymentFailureRate,
    rideCount: input.metrics.rideCount,
    configVersion: cfg.configVersion,
  };

  if (config.useMemoryDb) {
    memorySloSnapshots.push(snapshot);
    memoryProductionEvents.push({ eventType: 'slo_captured', configVersion: cfg.configVersion });
    return snapshot;
  }

  await pool.query(
    `INSERT INTO ops_slo_snapshots (
      id, bucket_hour, region_id, category_code, reputation_tier,
      request_to_assign_ms_avg, accept_rate, cancel_rate, pickup_eta_ms_avg,
      pricing_conversion_rate, payment_failure_rate, ride_count, config_version
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      snapshot.id,
      input.metrics.bucketHour,
      input.regionId ?? null,
      input.categoryCode ?? null,
      input.reputationTier ?? null,
      snapshot.requestToAssignMsAvg ?? null,
      snapshot.acceptRate ?? null,
      snapshot.cancelRate ?? null,
      snapshot.pickupEtaMsAvg ?? null,
      snapshot.pricingConversionRate ?? null,
      snapshot.paymentFailureRate ?? null,
      snapshot.rideCount,
      cfg.configVersion,
    ],
  );

  await recordObservabilityProductionEvent('slo_captured', cfg.configVersion, {
    regionId: input.regionId,
    categoryCode: input.categoryCode,
    reputationTier: input.reputationTier,
    rideCount: snapshot.rideCount,
  });

  return snapshot;
}

export async function listSloSnapshots(input?: {
  regionId?: string;
  categoryCode?: string;
  reputationTier?: string;
  limit?: number;
}) {
  const limit = input?.limit ?? 20;
  if (config.useMemoryDb) {
    return memorySloSnapshots
      .filter((s) => {
        if (input?.regionId && s.regionId !== input.regionId) return false;
        if (input?.categoryCode && s.categoryCode !== input.categoryCode) return false;
        if (input?.reputationTier && s.reputationTier !== input.reputationTier) return false;
        return true;
      })
      .slice(-limit);
  }

  const clauses = ['1=1'];
  const params: unknown[] = [];
  if (input?.regionId) {
    params.push(input.regionId);
    clauses.push(`region_id = $${params.length}`);
  }
  if (input?.categoryCode) {
    params.push(input.categoryCode);
    clauses.push(`category_code = $${params.length}`);
  }
  if (input?.reputationTier) {
    params.push(input.reputationTier);
    clauses.push(`reputation_tier = $${params.length}`);
  }
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT * FROM ops_slo_snapshots WHERE ${clauses.join(' AND ')}
     ORDER BY bucket_hour DESC LIMIT $${params.length}`,
    params,
  );

  return rows.map((r) => ({
    id: r.id as string,
    bucketHour: (r.bucket_hour as Date).toISOString(),
    regionId: (r.region_id as string) ?? undefined,
    categoryCode: (r.category_code as string) ?? undefined,
    reputationTier: (r.reputation_tier as string) ?? undefined,
    requestToAssignMsAvg: r.request_to_assign_ms_avg != null ? Number(r.request_to_assign_ms_avg) : undefined,
    acceptRate: r.accept_rate != null ? Number(r.accept_rate) : undefined,
    cancelRate: r.cancel_rate != null ? Number(r.cancel_rate) : undefined,
    pickupEtaMsAvg: r.pickup_eta_ms_avg != null ? Number(r.pickup_eta_ms_avg) : undefined,
    pricingConversionRate:
      r.pricing_conversion_rate != null ? Number(r.pricing_conversion_rate) : undefined,
    paymentFailureRate: r.payment_failure_rate != null ? Number(r.payment_failure_rate) : undefined,
    rideCount: Number(r.ride_count),
    configVersion: r.config_version as string,
  }));
}

export async function evaluateProductionMetricAlerts(metrics: OpsMetricsSnapshot | null): Promise<OpsAlert[]> {
  const created: OpsAlert[] = [];
  if (!metrics) return created;

  const cfg = await getObservabilityProductionConfig();
  const checks: Array<{
    type: string;
    severity: OpsAlert['severity'];
    value?: number;
    threshold: number;
    summary: string;
    higherIsBad: boolean;
    component: string;
  }> = [
    {
      type: 'payment_failure_rate',
      severity: 'critical',
      value: metrics.paymentFailureRate,
      threshold: cfg.paymentFailureThreshold,
      summary: 'Taxa de falha de pagamento elevada',
      higherIsBad: true,
      component: 'psp',
    },
    {
      type: 'cancel_rate',
      severity: 'warning',
      value: metrics.cancelRate,
      threshold: cfg.cancelRateThreshold,
      summary: 'Taxa de cancelamento acima do normal',
      higherIsBad: true,
      component: 'match',
    },
    {
      type: 'accept_rate',
      severity: 'warning',
      value: metrics.acceptRate,
      threshold: cfg.acceptRateThreshold,
      summary: 'Taxa de aceite de motoristas baixa',
      higherIsBad: false,
      component: 'match',
    },
    {
      type: 'request_to_assign_ms',
      severity: 'warning',
      value: metrics.requestToAssignMsAvg,
      threshold: cfg.requestToAssignMsThreshold,
      summary: 'Tempo request→assign acima do limite operacional',
      higherIsBad: true,
      component: 'match',
    },
  ];

  for (const check of checks) {
    if (check.value == null) continue;
    const triggered = check.higherIsBad ? check.value > check.threshold : check.value < check.threshold;
    if (!triggered) continue;

    const alert: OpsAlert = {
      id: randomUUID(),
      alertType: check.type,
      severity: check.severity,
      summary: check.summary,
      metricValue: check.value,
      thresholdValue: check.threshold,
      status: 'open',
      createdAt: new Date(),
    };

    if (config.useMemoryDb) {
      if (!memoryProductionAlerts.some((a) => a.alertType === check.type && a.status === 'open')) {
        memoryProductionAlerts.push(alert);
        memoryProductionEvents.push({ eventType: 'alert_triggered', configVersion: cfg.configVersion });
        created.push(alert);
      }
    } else {
      const { rows } = await pool.query(
        `INSERT INTO ops_alerts (alert_type, severity, summary, metric_value, threshold_value, component)
         SELECT $1,$2,$3,$4,$5,$6
         WHERE NOT EXISTS (SELECT 1 FROM ops_alerts WHERE alert_type = $1 AND status = 'open')
         RETURNING id, created_at`,
        [check.type, check.severity, check.summary, check.value, check.threshold, check.component],
      );
      if (rows[0]) {
        alert.id = rows[0].id as string;
        alert.createdAt = new Date(rows[0].created_at as string);
        created.push(alert);
        await recordObservabilityProductionEvent('alert_triggered', cfg.configVersion, {
          alertType: check.type,
          metricValue: check.value,
        });
      }
    }
  }

  return created;
}

export async function evaluateProductionHealthAlerts(
  health: PlatformHealthSnapshot | null,
): Promise<OpsAlert[]> {
  const created: OpsAlert[] = [];
  if (!health) return created;

  const cfg = await getObservabilityProductionConfig();

  if (health.routeRecalcCount15m > cfg.routeRecalcSpikeThreshold) {
    const alert: OpsAlert = {
      id: randomUUID(),
      alertType: 'route_recalc_spike',
      severity: 'warning',
      summary: 'Pico de recálculos de rota nos últimos 15 minutos',
      metricValue: health.routeRecalcCount15m,
      thresholdValue: cfg.routeRecalcSpikeThreshold,
      status: 'open',
      createdAt: new Date(),
    };
    if (config.useMemoryDb) {
      if (!memoryProductionAlerts.some((a) => a.alertType === alert.alertType && a.status === 'open')) {
        memoryProductionAlerts.push(alert);
        created.push(alert);
      }
    } else {
      const { rows } = await pool.query(
        `INSERT INTO ops_alerts (alert_type, severity, summary, metric_value, threshold_value, component)
         SELECT $1,$2,$3,$4,$5,'route'
         WHERE NOT EXISTS (SELECT 1 FROM ops_alerts WHERE alert_type = $1 AND status = 'open')
         RETURNING id`,
        [alert.alertType, alert.severity, alert.summary, alert.metricValue, alert.thresholdValue],
      );
      if (rows[0]) created.push(alert);
    }
  }

  if (health.fraudSignalCount15m > cfg.fraudSpikeThreshold) {
    const alert: OpsAlert = {
      id: randomUUID(),
      alertType: 'fraud_signal_spike',
      severity: 'critical',
      summary: 'Pico de sinais de fraude nos últimos 15 minutos',
      metricValue: health.fraudSignalCount15m,
      thresholdValue: cfg.fraudSpikeThreshold,
      status: 'open',
      createdAt: new Date(),
    };
    if (config.useMemoryDb) {
      if (!memoryProductionAlerts.some((a) => a.alertType === alert.alertType && a.status === 'open')) {
        memoryProductionAlerts.push(alert);
        created.push(alert);
      }
    } else {
      const { rows } = await pool.query(
        `INSERT INTO ops_alerts (alert_type, severity, summary, metric_value, threshold_value, component)
         SELECT $1,$2,$3,$4,$5,'fraud'
         WHERE NOT EXISTS (SELECT 1 FROM ops_alerts WHERE alert_type = $1 AND status = 'open')
         RETURNING id`,
        [alert.alertType, alert.severity, alert.summary, alert.metricValue, alert.thresholdValue],
      );
      if (rows[0]) created.push(alert);
    }
  }

  return created;
}

export async function recordLinkedTraceSpan(input: {
  traceId?: string;
  rideId?: string;
  spanName: string;
  component: TraceComponent;
  status?: 'ok' | 'error' | 'degraded';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}) {
  const active = getActiveTraceContext();
  const traceId = input.traceId ?? active?.traceId ?? randomUUID().replace(/-/g, '').slice(0, 24);
  const parentSpanId = active?.parentSpanId;

  const { recordTraceSpan } = await import('./traceService.js');
  const span = await recordTraceSpan({
    traceId,
    rideId: input.rideId ?? active?.rideId,
    spanName: input.spanName,
    component: input.component,
    status: input.status,
    durationMs: input.durationMs,
    metadata: input.metadata,
    parentSpanId,
  });

  const cfg = await getObservabilityProductionConfig();
  if (parentSpanId) {
    await recordObservabilityProductionEvent('trace_linked', cfg.configVersion, {
      traceId,
      parentSpanId,
      spanId: span.id,
    });
  }

  return span;
}

async function recordObservabilityProductionEvent(
  eventType: string,
  configVersion: string,
  metadata: Record<string, unknown> = {},
) {
  if (config.useMemoryDb) {
    memoryProductionEvents.push({ eventType, configVersion });
    return;
  }
  await pool.query(
    `INSERT INTO observability_production_events (event_type, config_version, metadata_json)
     VALUES ($1,$2,$3)`,
    [eventType, configVersion, JSON.stringify(metadata)],
  );
}

export function __testResetObservabilityProductionMemory() {
  memorySloSnapshots.length = 0;
  memoryProductionEvents.length = 0;
  memoryProductionAlerts.length = 0;
  Object.assign(memoryConfig, {
    paymentFailureThreshold: 0.15,
    cancelRateThreshold: 0.25,
    acceptRateThreshold: 0.45,
    requestToAssignMsThreshold: 120_000,
    routeRecalcSpikeThreshold: 25,
    fraudSpikeThreshold: 12,
    traceSampleRateBps: 10_000,
    configVersion: 'camada41-memory-v1',
  });
}

export function __testGetObservabilityProductionEvents() {
  return memoryProductionEvents;
}

export function __testGetObservabilityProductionAlerts() {
  return memoryProductionAlerts;
}
