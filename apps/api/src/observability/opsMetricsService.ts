import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export interface OpsMetricsSnapshot {
  bucketHour: string;
  requestToAssignMsAvg?: number;
  acceptRate?: number;
  cancelRate?: number;
  pickupEtaMsAvg?: number;
  pricingConversionRate?: number;
  paymentFailureRate?: number;
  rideCount: number;
}

export interface OpsAlert {
  id: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  metricValue?: number;
  thresholdValue?: number;
  status: string;
  createdAt: Date;
}

const memorySamples: Array<{
  rideId: string;
  categoryCode?: string;
  requestToAssignMs?: number;
  accepted?: boolean;
  cancelled?: boolean;
  paymentFailed?: boolean;
  quoted?: boolean;
  booked?: boolean;
  at: Date;
}> = [];

const memoryHourly: OpsMetricsSnapshot[] = [];
const memoryAlerts: OpsAlert[] = [];

export function recordRideMetric(input: {
  rideId: string;
  categoryCode?: string;
  requestToAssignMs?: number;
  accepted?: boolean;
  cancelled?: boolean;
  paymentFailed?: boolean;
  quoted?: boolean;
  booked?: boolean;
}) {
  memorySamples.push({ ...input, at: new Date() });
}

export async function aggregateHourlyMetrics(): Promise<OpsMetricsSnapshot | null> {
  const bucket = new Date();
  bucket.setMinutes(0, 0, 0);

  if (config.useMemoryDb) {
    const hourAgo = bucket.getTime();
    const samples = memorySamples.filter((s) => s.at.getTime() >= hourAgo - 3600_000);
    if (samples.length === 0 && memoryHourly.length > 0) return memoryHourly[memoryHourly.length - 1] ?? null;

    const assignSamples = samples.filter((s) => s.requestToAssignMs != null);
    const accepted = samples.filter((s) => s.accepted).length;
    const cancelled = samples.filter((s) => s.cancelled).length;
    const paymentFailed = samples.filter((s) => s.paymentFailed).length;
    const quoted = samples.filter((s) => s.quoted).length;
    const booked = samples.filter((s) => s.booked).length;

    const snap: OpsMetricsSnapshot = {
      bucketHour: bucket.toISOString(),
      requestToAssignMsAvg:
        assignSamples.length > 0
          ? Math.round(assignSamples.reduce((a, s) => a + (s.requestToAssignMs ?? 0), 0) / assignSamples.length)
          : undefined,
      acceptRate: samples.length > 0 ? accepted / samples.length : undefined,
      cancelRate: samples.length > 0 ? cancelled / samples.length : undefined,
      pricingConversionRate: quoted > 0 ? booked / quoted : undefined,
      paymentFailureRate: booked > 0 ? paymentFailed / booked : undefined,
      rideCount: samples.length,
    };
    memoryHourly.push(snap);
    return snap;
  }

  const { rows } = await pool.query(`
    WITH recent AS (
      SELECT
        r.id,
        r.category_code,
        r.status,
        r.created_at,
        r.assigned_at,
        EXTRACT(EPOCH FROM (r.assigned_at - r.created_at)) * 1000 AS assign_ms
      FROM rides r
      WHERE r.created_at >= date_trunc('hour', NOW()) - INTERVAL '1 hour'
        AND r.created_at < date_trunc('hour', NOW()) + INTERVAL '1 hour'
    ),
    pay AS (
      SELECT COUNT(*) FILTER (WHERE pi.status IN ('failed','cancelled'))::float / NULLIF(COUNT(*), 0) AS fail_rate
      FROM payment_intents pi
      WHERE pi.created_at >= date_trunc('hour', NOW()) - INTERVAL '1 hour'
    )
    SELECT
      COUNT(*)::int AS ride_count,
      AVG(assign_ms)::int AS request_to_assign_ms_avg,
      COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED','NO_DRIVERS'))::float / NULLIF(COUNT(*), 0) AS accept_rate,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::float / NULLIF(COUNT(*), 0) AS cancel_rate,
      (SELECT fail_rate FROM pay) AS payment_failure_rate
    FROM recent
  `);

  const r = rows[0];
  if (!r || Number(r.ride_count) === 0) return null;

  const snap: OpsMetricsSnapshot = {
    bucketHour: bucket.toISOString(),
    requestToAssignMsAvg: r.request_to_assign_ms_avg != null ? Number(r.request_to_assign_ms_avg) : undefined,
    acceptRate: r.accept_rate != null ? Number(r.accept_rate) : undefined,
    cancelRate: r.cancel_rate != null ? Number(r.cancel_rate) : undefined,
    paymentFailureRate: r.payment_failure_rate != null ? Number(r.payment_failure_rate) : undefined,
    rideCount: Number(r.ride_count),
  };

  await pool.query(
    `INSERT INTO ops_metrics_hourly (
      bucket_hour, request_to_assign_ms_avg, accept_rate, cancel_rate,
      payment_failure_rate, ride_count
    ) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT DO NOTHING`,
    [
      bucket,
      snap.requestToAssignMsAvg ?? null,
      snap.acceptRate ?? null,
      snap.cancelRate ?? null,
      snap.paymentFailureRate ?? null,
      snap.rideCount,
    ],
  );

  return snap;
}

export async function getLatestMetrics(): Promise<OpsMetricsSnapshot | null> {
  if (config.useMemoryDb) {
    return memoryHourly[memoryHourly.length - 1] ?? null;
  }
  const { rows } = await pool.query(
    `SELECT bucket_hour, request_to_assign_ms_avg, accept_rate, cancel_rate,
            pickup_eta_ms_avg, pricing_conversion_rate, payment_failure_rate, ride_count
     FROM ops_metrics_hourly ORDER BY bucket_hour DESC LIMIT 1`,
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    bucketHour: (r.bucket_hour as Date).toISOString(),
    requestToAssignMsAvg: r.request_to_assign_ms_avg != null ? Number(r.request_to_assign_ms_avg) : undefined,
    acceptRate: r.accept_rate != null ? Number(r.accept_rate) : undefined,
    cancelRate: r.cancel_rate != null ? Number(r.cancel_rate) : undefined,
    pickupEtaMsAvg: r.pickup_eta_ms_avg != null ? Number(r.pickup_eta_ms_avg) : undefined,
    pricingConversionRate: r.pricing_conversion_rate != null ? Number(r.pricing_conversion_rate) : undefined,
    paymentFailureRate: r.payment_failure_rate != null ? Number(r.payment_failure_rate) : undefined,
    rideCount: Number(r.ride_count),
  };
}

export async function evaluateOpsAlerts(metrics: OpsMetricsSnapshot | null): Promise<OpsAlert[]> {
  const created: OpsAlert[] = [];
  if (!metrics) return created;

  const checks: Array<{ type: string; severity: OpsAlert['severity']; value?: number; threshold: number; summary: string; higherIsBad: boolean }> = [
    {
      type: 'payment_failure_rate',
      severity: 'critical',
      value: metrics.paymentFailureRate,
      threshold: 0.15,
      summary: 'Taxa de falha de pagamento elevada',
      higherIsBad: true,
    },
    {
      type: 'cancel_rate',
      severity: 'warning',
      value: metrics.cancelRate,
      threshold: 0.25,
      summary: 'Taxa de cancelamento acima do normal',
      higherIsBad: true,
    },
    {
      type: 'accept_rate',
      severity: 'warning',
      value: metrics.acceptRate,
      threshold: 0.45,
      summary: 'Taxa de aceite de motoristas baixa',
      higherIsBad: false,
    },
    {
      type: 'request_to_assign_ms',
      severity: 'warning',
      value: metrics.requestToAssignMsAvg,
      threshold: 120_000,
      summary: 'Tempo request→assign acima de 2 min',
      higherIsBad: true,
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
      if (!memoryAlerts.some((a) => a.alertType === check.type && a.status === 'open')) {
        memoryAlerts.push(alert);
        created.push(alert);
      }
    } else {
      const { rows } = await pool.query(
        `INSERT INTO ops_alerts (alert_type, severity, summary, metric_value, threshold_value)
         SELECT $1,$2,$3,$4,$5
         WHERE NOT EXISTS (
           SELECT 1 FROM ops_alerts WHERE alert_type = $1 AND status = 'open'
         )
         RETURNING id, created_at`,
        [check.type, check.severity, check.summary, check.value, check.threshold],
      );
      if (rows[0]) {
        alert.id = rows[0].id as string;
        alert.createdAt = new Date(rows[0].created_at as string);
        created.push(alert);
      }
    }
  }

  return created;
}

export async function listOpenOpsAlerts(limit = 20): Promise<OpsAlert[]> {
  if (config.useMemoryDb) {
    return memoryAlerts.filter((a) => a.status === 'open').slice(0, limit);
  }
  const { rows } = await pool.query(
    `SELECT id, alert_type, severity, summary, metric_value, threshold_value, status, created_at
     FROM ops_alerts WHERE status = 'open' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    alertType: r.alert_type as string,
    severity: r.severity as OpsAlert['severity'],
    summary: r.summary as string,
    metricValue: r.metric_value != null ? Number(r.metric_value) : undefined,
    thresholdValue: r.threshold_value != null ? Number(r.threshold_value) : undefined,
    status: r.status as string,
    createdAt: new Date(r.created_at as string),
  }));
}

export function startOpsMetricsJanitor() {
  const intervalMs = 5 * 60_000;
  const tick = () => {
    void (async () => {
      const metrics = await aggregateHourlyMetrics();
      await evaluateOpsAlerts(metrics);
    })();
  };
  tick();
  return setInterval(tick, intervalMs);
}
