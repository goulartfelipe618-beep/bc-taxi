import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import type { PlatformHealthSnapshot } from './platformHealthService.js';
import {
  evaluateOpsAlerts,
  getLatestMetrics,
  listOpenOpsAlerts,
  type OpsAlert,
  type OpsMetricsSnapshot,
} from './opsMetricsService.js';

const ROUTE_RECALC_SPIKE_THRESHOLD = 25;
const FRAUD_SPIKE_THRESHOLD = 12;
const WS_DEGRADATION_MIN_ACTIVE_RIDES = 3;

const memoryExtendedAlerts: OpsAlert[] = [];

async function createAlert(input: {
  alertType: string;
  severity: OpsAlert['severity'];
  summary: string;
  metricValue?: number;
  thresholdValue?: number;
  component?: string;
}): Promise<OpsAlert | null> {
  const alert: OpsAlert = {
    id: randomUUID(),
    alertType: input.alertType,
    severity: input.severity,
    summary: input.summary,
    metricValue: input.metricValue,
    thresholdValue: input.thresholdValue,
    status: 'open',
    createdAt: new Date(),
  };

  if (useMemory()) {
    const existing = [...memoryExtendedAlerts, ...(await listOpenOpsAlerts())];
    if (existing.some((a) => a.alertType === input.alertType && a.status === 'open')) return null;
    memoryExtendedAlerts.push(alert);
    return alert;
  }

  const { rows } = await pool.query(
    `INSERT INTO ops_alerts (alert_type, severity, summary, metric_value, threshold_value, component)
     SELECT $1,$2,$3,$4,$5,$6
     WHERE NOT EXISTS (SELECT 1 FROM ops_alerts WHERE alert_type = $1 AND status = 'open')
     RETURNING id, created_at`,
    [
      input.alertType,
      input.severity,
      input.summary,
      input.metricValue ?? null,
      input.thresholdValue ?? null,
      input.component ?? null,
    ],
  );
  if (!rows[0]) return null;
  alert.id = rows[0].id as string;
  alert.createdAt = new Date(rows[0].created_at as string);
  return alert;
}

export async function evaluatePlatformHealthAlerts(health: PlatformHealthSnapshot | null): Promise<OpsAlert[]> {
  const created: OpsAlert[] = [];
  if (!health) return created;

  if (
    health.activeRidesInProgress >= WS_DEGRADATION_MIN_ACTIVE_RIDES &&
    health.wsConnections === 0
  ) {
    const alert = await createAlert({
      alertType: 'ws_connections_degraded',
      severity: 'critical',
      summary: 'WebSocket sem conexões ativas com corridas em andamento',
      metricValue: health.wsConnections,
      thresholdValue: 1,
      component: 'ws',
    });
    if (alert) created.push(alert);
  }

  if (health.routeRecalcCount15m > ROUTE_RECALC_SPIKE_THRESHOLD) {
    const alert = await createAlert({
      alertType: 'route_recalc_spike',
      severity: 'warning',
      summary: 'Pico de recálculos de rota nos últimos 15 minutos',
      metricValue: health.routeRecalcCount15m,
      thresholdValue: ROUTE_RECALC_SPIKE_THRESHOLD,
      component: 'route',
    });
    if (alert) created.push(alert);
  }

  if (health.fraudSignalCount15m > FRAUD_SPIKE_THRESHOLD) {
    const alert = await createAlert({
      alertType: 'fraud_signal_spike',
      severity: 'critical',
      summary: 'Pico de sinais de fraude nos últimos 15 minutos',
      metricValue: health.fraudSignalCount15m,
      thresholdValue: FRAUD_SPIKE_THRESHOLD,
      component: 'fraud',
    });
    if (alert) created.push(alert);
  }

  if (configRedisDegraded(health)) {
    const alert = await createAlert({
      alertType: 'redis_disconnected',
      severity: 'warning',
      summary: 'Redis indisponível — fan-out realtime degradado',
      metricValue: 0,
      thresholdValue: 1,
      component: 'redis',
    });
    if (alert) created.push(alert);
  }

  return created;
}

function configRedisDegraded(health: PlatformHealthSnapshot): boolean {
  return Boolean(config.redisUrl) && !health.redisConnected;
}

export async function runFullOpsAlertEvaluation(input?: {
  metrics?: OpsMetricsSnapshot | null;
  health?: PlatformHealthSnapshot | null;
}) {
  const metrics = input?.metrics ?? (await getLatestMetrics());
  const baseAlerts = await evaluateOpsAlerts(metrics);
  const healthAlerts = await evaluatePlatformHealthAlerts(input?.health ?? null);
  return [...baseAlerts, ...healthAlerts];
}

export async function acknowledgeOpsAlert(alertId: string, userId: string) {
  if (useMemory()) {
    const alert = memoryExtendedAlerts.find((a) => a.id === alertId);
    if (alert) alert.status = 'acknowledged';
    return alert ?? null;
  }

  const { rows } = await pool.query(
    `UPDATE ops_alerts SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2
     WHERE id = $1 AND status = 'open'
     RETURNING id, alert_type, severity, summary, status, created_at`,
    [alertId, userId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id as string,
    alertType: rows[0].alert_type as string,
    severity: rows[0].severity as OpsAlert['severity'],
    summary: rows[0].summary as string,
    status: rows[0].status as string,
    createdAt: new Date(rows[0].created_at as string),
  };
}

export async function resolveOpsAlert(alertId: string) {
  if (useMemory()) {
    const alert = memoryExtendedAlerts.find((a) => a.id === alertId);
    if (alert) alert.status = 'resolved';
    return alert ?? null;
  }

  await pool.query(
    `UPDATE ops_alerts SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
    [alertId],
  );
}

export async function getOpsDashboard() {
  const [metrics, health, alerts] = await Promise.all([
    getLatestMetrics(),
    import('./platformHealthService.js').then((m) => m.getLatestPlatformHealth()),
    listOpenOpsAlerts(30),
  ]);

  return {
    metrics,
    platformHealth: health
      ? {
          wsConnections: health.wsConnections,
          wsPassengerConnections: health.wsPassengerConnections,
          wsDriverConnections: health.wsDriverConnections,
          redisConnected: health.redisConnected,
          activeRidesInProgress: health.activeRidesInProgress,
          routeRecalcCount15m: health.routeRecalcCount15m,
          fraudSignalCount15m: health.fraudSignalCount15m,
          paymentFailureRate: health.paymentFailureRate,
          capturedAt: health.capturedAt.toISOString(),
        }
      : null,
    openAlerts: alerts,
    alertCount: alerts.length,
  };
}

export function __testResetAlertMemory() {
  memoryExtendedAlerts.length = 0;
}
