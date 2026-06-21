import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { wsHub } from '../realtime/wsHub.js';
import { getRedis } from '../realtime/redisClient.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export interface PlatformHealthSnapshot {
  id: string;
  wsConnections: number;
  wsPassengerConnections: number;
  wsDriverConnections: number;
  redisConnected: boolean;
  activeRidesInProgress: number;
  routeRecalcCount15m: number;
  fraudSignalCount15m: number;
  paymentFailureRate?: number;
  capturedAt: Date;
}

const memoryHealth: PlatformHealthSnapshot[] = [];

async function countActiveRidesInProgress(): Promise<number> {
  if (useMemory()) return 3;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM rides WHERE status = 'IN_PROGRESS'`,
  );
  return rows[0]?.c ?? 0;
}

async function countRouteRecalcs15m(): Promise<number> {
  if (useMemory()) return memoryHealth.at(-1)?.routeRecalcCount15m ?? 2;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM route_recalculation_events
     WHERE created_at > NOW() - INTERVAL '15 minutes'`,
  );
  return rows[0]?.c ?? 0;
}

async function countFraudSignals15m(): Promise<number> {
  if (useMemory()) return 1;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM fraud_signals
     WHERE created_at > NOW() - INTERVAL '15 minutes'`,
  );
  return rows[0]?.c ?? 0;
}

async function getRecentPaymentFailureRate(): Promise<number | undefined> {
  if (useMemory()) return 0.05;
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('failed','cancelled'))::float /
            NULLIF(COUNT(*)::float, 0) AS rate
     FROM payment_intents WHERE created_at > NOW() - INTERVAL '1 hour'`,
  );
  const rate = rows[0]?.rate;
  return rate != null ? Number(rate) : undefined;
}

async function isRedisConnected(): Promise<boolean> {
  if (!config.redisUrl) return false;
  try {
    const client = getRedis();
    if (!client) return false;
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function capturePlatformHealthSnapshot(): Promise<PlatformHealthSnapshot> {
  const wsStats = wsHub.detailedStats();
  const snapshot: PlatformHealthSnapshot = {
    id: randomUUID(),
    wsConnections: wsStats.connections,
    wsPassengerConnections: wsStats.passengers,
    wsDriverConnections: wsStats.drivers,
    redisConnected: await isRedisConnected(),
    activeRidesInProgress: await countActiveRidesInProgress(),
    routeRecalcCount15m: await countRouteRecalcs15m(),
    fraudSignalCount15m: await countFraudSignals15m(),
    paymentFailureRate: await getRecentPaymentFailureRate(),
    capturedAt: new Date(),
  };

  if (useMemory()) {
    memoryHealth.push(snapshot);
    if (memoryHealth.length > 100) memoryHealth.shift();
    return snapshot;
  }

  await pool.query(
    `INSERT INTO platform_health_snapshots
       (id, ws_connections, ws_passenger_connections, ws_driver_connections, redis_connected,
        active_rides_in_progress, route_recalc_count_15m, fraud_signal_count_15m, payment_failure_rate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      snapshot.id,
      snapshot.wsConnections,
      snapshot.wsPassengerConnections,
      snapshot.wsDriverConnections,
      snapshot.redisConnected,
      snapshot.activeRidesInProgress,
      snapshot.routeRecalcCount15m,
      snapshot.fraudSignalCount15m,
      snapshot.paymentFailureRate ?? null,
    ],
  );

  return snapshot;
}

export async function getLatestPlatformHealth(): Promise<PlatformHealthSnapshot | null> {
  if (useMemory()) return memoryHealth[memoryHealth.length - 1] ?? null;

  const { rows } = await pool.query(
    `SELECT * FROM platform_health_snapshots ORDER BY captured_at DESC LIMIT 1`,
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    wsConnections: r.ws_connections as number,
    wsPassengerConnections: r.ws_passenger_connections as number,
    wsDriverConnections: r.ws_driver_connections as number,
    redisConnected: Boolean(r.redis_connected),
    activeRidesInProgress: r.active_rides_in_progress as number,
    routeRecalcCount15m: r.route_recalc_count_15m as number,
    fraudSignalCount15m: r.fraud_signal_count_15m as number,
    paymentFailureRate: r.payment_failure_rate != null ? Number(r.payment_failure_rate) : undefined,
    capturedAt: new Date(r.captured_at as string),
  };
}

export function startPlatformHealthMonitor() {
  void capturePlatformHealthSnapshot();
  return setInterval(() => {
    void capturePlatformHealthSnapshot();
  }, 5 * 60_000);
}

export function __testSeedHealth(snapshot: Partial<PlatformHealthSnapshot>) {
  memoryHealth.push({
    id: randomUUID(),
    wsConnections: snapshot.wsConnections ?? 10,
    wsPassengerConnections: snapshot.wsPassengerConnections ?? 6,
    wsDriverConnections: snapshot.wsDriverConnections ?? 4,
    redisConnected: snapshot.redisConnected ?? true,
    activeRidesInProgress: snapshot.activeRidesInProgress ?? 5,
    routeRecalcCount15m: snapshot.routeRecalcCount15m ?? 2,
    fraudSignalCount15m: snapshot.fraudSignalCount15m ?? 0,
    paymentFailureRate: snapshot.paymentFailureRate,
    capturedAt: new Date(),
  });
}

export function __testResetHealthMemory() {
  memoryHealth.length = 0;
}
