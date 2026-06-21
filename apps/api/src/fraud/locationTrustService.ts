import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export interface LocationTrustRecord {
  userId: string;
  deviceId: string;
  trustScore: number;
  gpsJumpCount7d: number;
  staleGpsCount7d: number;
}

const memoryTrust = new Map<string, LocationTrustRecord>();

function trustKey(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}

export async function recordLocationTrustEvent(input: {
  userId: string;
  deviceId: string;
  eventType: 'GPS_JUMP' | 'GPS_STALE' | 'OK';
}) {
  if (!input.deviceId) return null;

  const key = trustKey(input.userId, input.deviceId);
  const existing = memoryTrust.get(key) ?? {
    userId: input.userId,
    deviceId: input.deviceId,
    trustScore: 1,
    gpsJumpCount7d: 0,
    staleGpsCount7d: 0,
  };

  if (input.eventType === 'GPS_JUMP') {
    existing.gpsJumpCount7d += 1;
    existing.trustScore = Math.max(0, existing.trustScore - 0.15);
  } else if (input.eventType === 'GPS_STALE') {
    existing.staleGpsCount7d += 1;
    existing.trustScore = Math.max(0, existing.trustScore - 0.05);
  } else {
    existing.trustScore = Math.min(1, existing.trustScore + 0.02);
  }

  if (useMemory()) {
    memoryTrust.set(key, existing);
    return existing;
  }

  const { rows } = await pool.query(
    `INSERT INTO device_location_trust (user_id, device_id, trust_score, gps_jump_count_7d, stale_gps_count_7d, last_gps_event_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
     ON CONFLICT (user_id, device_id) DO UPDATE SET
       trust_score = EXCLUDED.trust_score,
       gps_jump_count_7d = device_location_trust.gps_jump_count_7d + $6,
       stale_gps_count_7d = device_location_trust.stale_gps_count_7d + $7,
       last_gps_event_at = NOW(),
       updated_at = NOW()
     RETURNING trust_score, gps_jump_count_7d, stale_gps_count_7d`,
    [
      input.userId,
      input.deviceId,
      existing.trustScore,
      existing.gpsJumpCount7d,
      existing.staleGpsCount7d,
      input.eventType === 'GPS_JUMP' ? 1 : 0,
      input.eventType === 'GPS_STALE' ? 1 : 0,
    ],
  );

  return {
    userId: input.userId,
    deviceId: input.deviceId,
    trustScore: Number(rows[0]?.trust_score ?? existing.trustScore),
    gpsJumpCount7d: Number(rows[0]?.gps_jump_count_7d ?? existing.gpsJumpCount7d),
    staleGpsCount7d: Number(rows[0]?.stale_gps_count_7d ?? existing.staleGpsCount7d),
  };
}

export async function getLocationTrust(userId: string, deviceId: string): Promise<LocationTrustRecord | null> {
  if (useMemory()) {
    return memoryTrust.get(trustKey(userId, deviceId)) ?? null;
  }
  const { rows } = await pool.query(
    `SELECT trust_score, gps_jump_count_7d, stale_gps_count_7d
     FROM device_location_trust WHERE user_id = $1 AND device_id = $2`,
    [userId, deviceId],
  );
  if (!rows[0]) return null;
  return {
    userId,
    deviceId,
    trustScore: Number(rows[0].trust_score),
    gpsJumpCount7d: Number(rows[0].gps_jump_count_7d),
    staleGpsCount7d: Number(rows[0].stale_gps_count_7d),
  };
}

export function __testResetLocationTrustMemory() {
  memoryTrust.clear();
}
