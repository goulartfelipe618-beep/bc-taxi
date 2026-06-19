import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import type { RealtimeEvent } from './types.js';

const memoryOutbox: RealtimeEvent[] = [];

export async function persistOutboxEvent(event: RealtimeEvent): Promise<void> {
  if (useMemory()) {
    memoryOutbox.push(event);
    if (memoryOutbox.length > 500) memoryOutbox.shift();
    return;
  }

  await pool.query(
    `INSERT INTO event_outbox
       (id, event_type, aggregate_type, aggregate_id, producer, schema_version, idempotency_key, payload_json, trace_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      event.eventId,
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      event.producer,
      event.schemaVersion,
      event.idempotencyKey ?? null,
      JSON.stringify({ ...event.payload, userIds: event.userIds, rideId: event.rideId, driverId: event.driverId }),
      event.traceId ?? null,
    ],
  );
}

export async function markOutboxPublished(eventId: string) {
  if (useMemory()) return;
  await pool.query(
    `UPDATE event_outbox SET delivery_status = 'published', published_at = NOW() WHERE id = $1`,
    [eventId],
  );
}

export function buildEvent<T extends Record<string, unknown>>(
  type: RealtimeEvent['eventType'],
  aggregateType: string,
  aggregateId: string,
  payload: T,
  opts?: { idempotencyKey?: string; userIds?: string[]; rideId?: string; driverId?: string },
): RealtimeEvent<T> {
  return {
    eventId: randomUUID(),
    eventType: type,
    aggregateType,
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

export async function getEventsSince(sinceIso: string, userId: string, limit = 50): Promise<RealtimeEvent[]> {
  if (useMemory()) {
    return memoryOutbox
      .filter((e) => e.occurredAt > sinceIso && (e.userIds?.includes(userId) || e.driverId === userId))
      .slice(-limit);
  }

  const { rows } = await pool.query(
    `SELECT * FROM event_outbox
     WHERE occurred_at > $1
       AND delivery_status = 'published'
       AND (payload_json->'userIds' ? $2 OR payload_json->>'driverId' = $2)
     ORDER BY occurred_at ASC
     LIMIT $3`,
    [sinceIso, userId, limit],
  );

  return rows.map((row) => ({
    eventId: row.id as string,
    eventType: row.event_type as RealtimeEvent['eventType'],
    aggregateType: row.aggregate_type as string,
    aggregateId: row.aggregate_id as string,
    occurredAt: (row.occurred_at as Date).toISOString(),
    producer: row.producer as string,
    schemaVersion: row.schema_version as number,
    payload: row.payload_json as Record<string, unknown>,
  }));
}

export { config };
