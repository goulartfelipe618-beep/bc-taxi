import { config } from '../config.js';
import { pool } from '../db.js';

export interface AdminOverview {
  ridesToday: number;
  activeRides: number;
  onlineDrivers: number;
  openFraudCases: number;
  pushSentToday: number;
  receiptsIssuedToday: number;
  pendingCorporateInvoices: number;
  activeDeliveries: number;
  activeSurgeEvents: number;
  openOpsAlerts: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (config.useMemoryDb) {
    return {
      ridesToday: 0,
      activeRides: 0,
      onlineDrivers: 0,
      openFraudCases: 0,
      pushSentToday: 0,
      receiptsIssuedToday: 0,
      pendingCorporateInvoices: 0,
      activeDeliveries: 0,
      activeSurgeEvents: 0,
      openOpsAlerts: 0,
    };
  }

  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM rides WHERE created_at >= CURRENT_DATE) AS rides_today,
      (SELECT COUNT(*)::int FROM rides WHERE status IN ('REQUESTED','OFFERING','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS')) AS active_rides,
      (SELECT COUNT(*)::int FROM drivers WHERE is_online = TRUE AND operational_status = 'online') AS online_drivers,
      (SELECT COUNT(*)::int FROM fraud_cases WHERE status = 'open') AS open_fraud_cases,
      (SELECT COUNT(*)::int FROM push_notification_log WHERE status = 'sent' AND created_at >= CURRENT_DATE) AS push_sent_today,
      (SELECT COUNT(*)::int FROM ride_receipts WHERE issued_at >= CURRENT_DATE) AS receipts_today,
      (SELECT COUNT(*)::int FROM corporate_invoice_lines WHERE status = 'pending') AS pending_corporate,
      (SELECT COUNT(*)::int FROM delivery_jobs WHERE status IN ('created','pickup_confirmed','in_transit')) AS active_deliveries,
      (SELECT COUNT(*)::int FROM event_surge_inputs WHERE is_active = TRUE AND starts_at <= NOW() AND ends_at >= NOW()) AS active_surge_events,
      (SELECT COUNT(*)::int FROM ops_alerts WHERE status = 'open') AS open_ops_alerts
  `);

  const r = rows[0];
  return {
    ridesToday: r?.rides_today ?? 0,
    activeRides: r?.active_rides ?? 0,
    onlineDrivers: r?.online_drivers ?? 0,
    openFraudCases: r?.open_fraud_cases ?? 0,
    pushSentToday: r?.push_sent_today ?? 0,
    receiptsIssuedToday: r?.receipts_today ?? 0,
    pendingCorporateInvoices: r?.pending_corporate ?? 0,
    activeDeliveries: r?.active_deliveries ?? 0,
    activeSurgeEvents: r?.active_surge_events ?? 0,
    openOpsAlerts: r?.open_ops_alerts ?? 0,
  };
}

export async function listRecentRides(limit = 50) {
  if (config.useMemoryDb) return [];

  const { rows } = await pool.query(
    `SELECT id, status, category_code, passenger_id, driver_id, estimated_fare_centavos, created_at, completed_at
     FROM rides ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id as string,
    status: r.status as string,
    categoryCode: r.category_code as string,
    passengerId: r.passenger_id as string,
    driverId: (r.driver_id as string) ?? undefined,
    estimatedFareCentavos: r.estimated_fare_centavos != null ? Number(r.estimated_fare_centavos) : undefined,
    createdAt: (r.created_at as Date).toISOString(),
    completedAt: r.completed_at ? (r.completed_at as Date).toISOString() : undefined,
  }));
}

export async function listOpenFraudCases(limit = 30) {
  if (config.useMemoryDb) return [];

  const { rows } = await pool.query(
    `SELECT id, user_id, status, risk_score, summary, created_at FROM fraud_cases
     WHERE status = 'open' ORDER BY risk_score DESC LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    status: r.status as string,
    riskScore: Number(r.risk_score),
    summary: r.summary as string,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

export async function logAdminAction(action: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>) {
  if (config.useMemoryDb) return;
  await pool.query(
    `INSERT INTO admin_audit_log (action, target_type, target_id, metadata_json) VALUES ($1,$2,$3,$4)`,
    [action, targetType ?? null, targetId ?? null, JSON.stringify(metadata ?? {})],
  );
}
