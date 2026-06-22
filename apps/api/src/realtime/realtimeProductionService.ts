import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { RealtimeEvent, RealtimeEventType } from './types.js';

export interface RealtimeProductionConfig {
  gpsUiMinIntervalMs: number;
  gpsSmoothFactor: number;
  pushDedupWindowSeconds: number;
  wsReplayLimit: number;
  configVersion: string;
}

const CRITICAL_EVENT_TYPES: RealtimeEventType[] = [
  'RIDE_DRIVER_ASSIGNED',
  'RIDE_DRIVER_ARRIVED',
  'RIDE_STARTED',
  'RIDE_OFFERED',
  'PAYMENT_FAILED',
  'PAYMENT_AUTHORIZED',
  'DELIVERY_PICKUP_CONFIRMED',
  'DELIVERY_COMPLETED',
];

const memoryConfig: RealtimeProductionConfig = {
  gpsUiMinIntervalMs: 3000,
  gpsSmoothFactor: 0.35,
  pushDedupWindowSeconds: 60,
  wsReplayLimit: 50,
  configVersion: 'camada40-memory-v1',
};

const lastUiBroadcastAt = new Map<string, number>();
const smoothedLocationByDriver = new Map<string, { lat: number; lng: number }>();
const memoryPushDedup = new Map<string, number>();
const memoryEventAcks = new Set<string>();
const memoryWsSessions = new Map<string, { checkpointIso: string }>();

export function seedMemoryRealtimeProductionConfig(cfg: Partial<RealtimeProductionConfig>) {
  Object.assign(memoryConfig, cfg);
}

export async function getRealtimeProductionConfig(): Promise<RealtimeProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM realtime_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada40-v1' };

  return {
    gpsUiMinIntervalMs: Number(r.gps_ui_min_interval_ms),
    gpsSmoothFactor: Number(r.gps_smooth_factor),
    pushDedupWindowSeconds: Number(r.push_dedup_window_seconds),
    wsReplayLimit: Number(r.ws_replay_limit),
    configVersion: r.config_version as string,
  };
}

export function isCriticalRealtimeEvent(eventType: RealtimeEventType): boolean {
  return CRITICAL_EVENT_TYPES.includes(eventType);
}

export function shouldBroadcastDriverLocationToUi(
  driverId: string,
  rideId: string | undefined,
  cfg: RealtimeProductionConfig,
): boolean {
  if (!rideId) return true;
  const key = `${driverId}:${rideId}`;
  const last = lastUiBroadcastAt.get(key) ?? 0;
  if (Date.now() - last < cfg.gpsUiMinIntervalMs) return false;
  lastUiBroadcastAt.set(key, Date.now());
  return true;
}

export function smoothDriverLocationForUi(
  driverId: string,
  lat: number,
  lng: number,
  smoothFactor: number,
): { lat: number; lng: number } {
  const prev = smoothedLocationByDriver.get(driverId);
  if (!prev) {
    smoothedLocationByDriver.set(driverId, { lat, lng });
    return { lat, lng };
  }
  const blended = {
    lat: prev.lat * (1 - smoothFactor) + lat * smoothFactor,
    lng: prev.lng * (1 - smoothFactor) + lng * smoothFactor,
  };
  smoothedLocationByDriver.set(driverId, blended);
  return blended;
}

export async function shouldSkipPushDueToDedup(
  userId: string,
  eventType: string,
  dedupKey: string,
): Promise<boolean> {
  const cfg = await getRealtimeProductionConfig();
  const windowMs = cfg.pushDedupWindowSeconds * 1000;

  if (config.useMemoryDb) {
    const key = `${userId}:${eventType}:${dedupKey}`;
    const last = memoryPushDedup.get(key);
    if (last && Date.now() - last < windowMs) return true;
    memoryPushDedup.set(key, Date.now());
    return false;
  }

  const { rows } = await pool.query(
    `SELECT sent_at FROM push_delivery_dedup
     WHERE user_id = $1 AND event_type = $2 AND dedup_key = $3`,
    [userId, eventType, dedupKey],
  );
  if (rows[0]) {
    const sentAt = new Date(rows[0].sent_at as string).getTime();
    if (Date.now() - sentAt < windowMs) return true;
  }

  await pool.query(
    `INSERT INTO push_delivery_dedup (user_id, event_type, dedup_key)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, event_type, dedup_key) DO UPDATE SET sent_at = NOW()`,
    [userId, eventType, dedupKey],
  );
  return false;
}

export async function recordWebSocketCheckpoint(userId: string, checkpointIso: string) {
  if (config.useMemoryDb) {
    memoryWsSessions.set(userId, { checkpointIso });
    return;
  }
  await pool.query(
    `UPDATE websocket_sessions
     SET last_checkpoint_iso = $2, last_checkpoint_at = $2::timestamptz
     WHERE user_id = $1 AND disconnected_at IS NULL`,
    [userId, checkpointIso],
  );
}

export async function recordWebSocketEventAck(userId: string, eventId: string) {
  if (config.useMemoryDb) {
    memoryEventAcks.add(`${userId}:${eventId}`);
    return;
  }
  await pool.query(
    `INSERT INTO websocket_event_acks (user_id, event_id) VALUES ($1,$2)
     ON CONFLICT (user_id, event_id) DO NOTHING`,
    [userId, eventId],
  );
}

export async function getReplayEventsSince(
  userId: string,
  checkpointIso: string,
): Promise<RealtimeEvent[]> {
  const cfg = await getRealtimeProductionConfig();
  const { getEventsSince } = await import('./outboxStore.js');
  return getEventsSince(checkpointIso, userId, cfg.wsReplayLimit);
}

export function buildPushDedupKey(event: RealtimeEvent): string {
  return event.idempotencyKey ?? `${event.eventType}:${event.aggregateId}`;
}

export function __testResetRealtimeProductionMemory() {
  lastUiBroadcastAt.clear();
  smoothedLocationByDriver.clear();
  memoryPushDedup.clear();
  memoryEventAcks.clear();
  memoryWsSessions.clear();
  Object.assign(memoryConfig, {
    gpsUiMinIntervalMs: 3000,
    gpsSmoothFactor: 0.35,
    pushDedupWindowSeconds: 60,
    wsReplayLimit: 50,
    configVersion: 'camada40-memory-v1',
  });
}

export function __testGetRealtimeProductionState() {
  return {
    uiBroadcastKeys: [...lastUiBroadcastAt.keys()],
    smoothedDrivers: [...smoothedLocationByDriver.keys()],
    pushDedupSize: memoryPushDedup.size,
    eventAcks: memoryEventAcks.size,
  };
}

export function __testSeedOutboxEvent(event: RealtimeEvent) {
  void import('./outboxStore.js').then(({ persistOutboxEvent }) => persistOutboxEvent(event));
}

export function __testBuildEvent(
  type: RealtimeEventType,
  aggregateId: string,
  payload: Record<string, unknown>,
  opts?: { idempotencyKey?: string; userIds?: string[]; rideId?: string; driverId?: string },
): RealtimeEvent {
  return {
    eventId: randomUUID(),
    eventType: type,
    aggregateType: 'ride',
    aggregateId,
    occurredAt: new Date().toISOString(),
    producer: 'core-node',
    schemaVersion: 1,
    idempotencyKey: opts?.idempotencyKey,
    payload,
    userIds: opts?.userIds,
    rideId: opts?.rideId,
    driverId: opts?.driverId,
  };
}
