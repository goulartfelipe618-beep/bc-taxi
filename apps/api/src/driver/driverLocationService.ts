import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { checkGpsIntegrity } from '../fraud/fraudService.js';
import { emitEvent } from '../realtime/eventBus.js';
import { resolveDriverActiveRideId } from '../ride/rideTrackingService.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';

export const LOCATION_SLA_SECONDS = 120;
export const HEARTBEAT_TIMEOUT_SECONDS = 45;
const LOCATION_SAMPLE_MIN_INTERVAL_MS = 30_000;

const memorySessions = new Map<string, { sessionId: string; startedAt: Date; lastHeartbeatAt: Date }>();
const lastSampleAtByDriver = new Map<string, number>();

export async function startOnlineSession(
  driverId: string,
  lat?: number,
  lng?: number,
): Promise<string | null> {
  if (useMemory()) {
    const sessionId = randomUUID();
    memorySessions.set(driverId, {
      sessionId,
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
    });
    return sessionId;
  }

  const { rows } = await pool.query(
    `UPDATE driver_online_sessions SET ended_at = NOW(), ended_reason = 'replaced'
     WHERE driver_id = $1 AND ended_at IS NULL`,
    [driverId],
  );
  void rows;

  const insert = await pool.query(
    `INSERT INTO driver_online_sessions (driver_id, last_lat, last_lng, last_heartbeat_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [driverId, lat ?? null, lng ?? null],
  );
  await pool.query(
    `UPDATE drivers SET last_heartbeat_at = NOW() WHERE user_id = $1`,
    [driverId],
  );
  return insert.rows[0].id as string;
}

export async function endOnlineSession(driverId: string, reason = 'offline'): Promise<void> {
  if (useMemory()) {
    memorySessions.delete(driverId);
    lastSampleAtByDriver.delete(driverId);
    return;
  }

  await pool.query(
    `UPDATE driver_online_sessions
     SET ended_at = NOW(), ended_reason = $2
     WHERE driver_id = $1 AND ended_at IS NULL`,
    [driverId, reason],
  );
}

async function getActiveSessionId(driverId: string): Promise<string | null> {
  if (useMemory()) return memorySessions.get(driverId)?.sessionId ?? null;

  const { rows } = await pool.query(
    `SELECT id FROM driver_online_sessions WHERE driver_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [driverId],
  );
  return rows[0]?.id as string | null;
}

export async function isDriverOnlineForLocation(driverId: string): Promise<boolean> {
  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(driverId);
    return Boolean(driver?.isOnline);
  }
  const { rows } = await pool.query(
    `SELECT is_online FROM drivers WHERE user_id = $1`,
    [driverId],
  );
  return Boolean(rows[0]?.is_online);
}

export async function updateDriverLocation(input: {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  rideId?: string;
  persistSample?: boolean;
}): Promise<{ ok: true; sessionId: string | null }> {
  const prev = useMemory()
    ? await memoryMatchStore.getDriver(input.driverId)
    : await getDriverLocationRow(input.driverId);

  void checkGpsIntegrity({
    driverId: input.driverId,
    rideId: input.rideId,
    lat: input.lat,
    lng: input.lng,
    prevLat: prev?.lat,
    prevLng: prev?.lng,
    prevAt: prev?.locationUpdatedAt,
  });

  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(input.driverId);
    if (driver) {
      driver.lat = input.lat;
      driver.lng = input.lng;
      driver.locationUpdatedAt = new Date();
      await memoryMatchStore.upsertDriver(driver);
    }
    const session = memorySessions.get(input.driverId);
    if (session) session.lastHeartbeatAt = new Date();
    return { ok: true, sessionId: session?.sessionId ?? null };
  }

  const sessionId = await getActiveSessionId(input.driverId);
  const now = new Date();

  await pool.query(
    `UPDATE drivers SET
      lat = $2,
      lng = $3,
      heading = COALESCE($4, heading),
      location_updated_at = $5,
      last_heartbeat_at = $5
     WHERE user_id = $1`,
    [input.driverId, input.lat, input.lng, input.heading ?? null, now],
  );

  if (sessionId) {
    await pool.query(
      `UPDATE driver_online_sessions SET
        last_lat = $2,
        last_lng = $3,
        last_heartbeat_at = $4,
        heartbeat_count = heartbeat_count + 1
       WHERE id = $1`,
      [sessionId, input.lat, input.lng, now],
    );
  }

  if (input.persistSample !== false) {
    const lastSample = lastSampleAtByDriver.get(input.driverId) ?? 0;
    if (Date.now() - lastSample >= LOCATION_SAMPLE_MIN_INTERVAL_MS) {
      lastSampleAtByDriver.set(input.driverId, Date.now());
      if (!useMemory()) {
        await pool.query(
          `INSERT INTO driver_location_samples (driver_id, session_id, lat, lng, heading)
           VALUES ($1, $2, $3, $4, $5)`,
          [input.driverId, sessionId, input.lat, input.lng, input.heading ?? null],
        );
      }
    }
  }

  const rideId = input.rideId ?? (await resolveDriverActiveRideId(input.driverId));

  if (rideId) {
    void import('../route/liveRouteMonitorService.js').then(({ processLiveRouteOnLocationUpdate }) =>
      processLiveRouteOnLocationUpdate({
        driverId: input.driverId,
        lat: input.lat,
        lng: input.lng,
        rideId,
      }),
    );
  }

  await emitEvent(
    'DRIVER_LOCATION_UPDATED',
    'driver',
    input.driverId,
    {
      lat: input.lat,
      lng: input.lng,
      heading: input.heading,
      rideId,
    },
    { driverId: input.driverId, rideId },
  );

  return { ok: true, sessionId };
}

async function getDriverLocationRow(driverId: string) {
  const { rows } = await pool.query(
    `SELECT lat, lng, location_updated_at FROM drivers WHERE user_id = $1`,
    [driverId],
  );
  if (!rows[0]) return null;
  return {
    lat: rows[0].lat != null ? Number(rows[0].lat) : undefined,
    lng: rows[0].lng != null ? Number(rows[0].lng) : undefined,
    locationUpdatedAt: rows[0].location_updated_at
      ? new Date(rows[0].location_updated_at as string)
      : undefined,
  };
}

export async function expireStaleOnlineDrivers(): Promise<number> {
  if (useMemory()) {
    let count = 0;
    const cutoff = Date.now() - HEARTBEAT_TIMEOUT_SECONDS * 1000;
    for (const driver of await memoryMatchStore.findOnlineDrivers()) {
      const session = memorySessions.get(driver.userId);
      const lastBeat = session?.lastHeartbeatAt ?? driver.locationUpdatedAt;
      if (!lastBeat || lastBeat.getTime() < cutoff) {
        await memoryMatchStore.setDriverOnline(driver.userId, false);
        memorySessions.delete(driver.userId);
        count += 1;
      }
    }
    return count;
  }

  const result = await pool.query(
    `UPDATE drivers SET
      is_online = FALSE,
      operational_status = 'offline'
     WHERE is_online = TRUE
       AND operational_status = 'online'
       AND active_ride_id IS NULL
       AND (
         last_heartbeat_at IS NULL
         OR last_heartbeat_at < NOW() - ($1 || ' seconds')::INTERVAL
       )
     RETURNING user_id`,
    [String(HEARTBEAT_TIMEOUT_SECONDS)],
  );

  if (result.rowCount) {
    await pool.query(
      `UPDATE driver_online_sessions SET ended_at = NOW(), ended_reason = 'heartbeat_timeout'
       WHERE driver_id = ANY($1::uuid[]) AND ended_at IS NULL`,
      [result.rows.map((r) => r.user_id)],
    );
  }

  return result.rowCount ?? 0;
}

export function startHeartbeatJanitor() {
  if (config.useMemoryDb) {
    return setInterval(() => {
      void expireStaleOnlineDrivers();
    }, 30_000);
  }
  return setInterval(() => {
    void expireStaleOnlineDrivers();
  }, 30_000);
}
