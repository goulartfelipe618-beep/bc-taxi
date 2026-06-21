import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export interface WebhookEventRecord {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  processedAt?: Date;
  resultJson?: Record<string, unknown>;
  createdAt: Date;
}

const memoryEvents = new Map<string, WebhookEventRecord>();

function memoryKey(provider: string, eventId: string) {
  return `${provider}:${eventId}`;
}

function mapRow(row: Record<string, unknown>): WebhookEventRecord {
  return {
    id: row.id as string,
    provider: row.provider as string,
    eventId: row.event_id as string,
    eventType: row.event_type as string,
    payloadJson: (row.payload_json as Record<string, unknown>) ?? {},
    processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined,
    resultJson: (row.result_json as Record<string, unknown>) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

export async function claimWebhookEvent(params: {
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<{ event: WebhookEventRecord; duplicate: boolean }> {
  const key = memoryKey(params.provider, params.eventId);

  if (config.useMemoryDb) {
    const existing = memoryEvents.get(key);
    if (existing) return { event: existing, duplicate: true };

    const event: WebhookEventRecord = {
      id: randomUUID(),
      provider: params.provider,
      eventId: params.eventId,
      eventType: params.eventType,
      payloadJson: params.payload,
      createdAt: new Date(),
    };
    memoryEvents.set(key, event);
    return { event, duplicate: false };
  }

  const insert = await pool.query(
    `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload_json)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING *`,
    [params.provider, params.eventId, params.eventType, JSON.stringify(params.payload)],
  );

  if (insert.rowCount) {
    return { event: mapRow(insert.rows[0]), duplicate: false };
  }

  const { rows } = await pool.query(
    `SELECT * FROM payment_webhook_events WHERE provider = $1 AND event_id = $2`,
    [params.provider, params.eventId],
  );
  return { event: mapRow(rows[0]), duplicate: true };
}

export async function markWebhookProcessed(
  eventId: string,
  result: Record<string, unknown>,
): Promise<void> {
  if (config.useMemoryDb) {
    for (const event of memoryEvents.values()) {
      if (event.id === eventId) {
        event.processedAt = new Date();
        event.resultJson = result;
        return;
      }
    }
    return;
  }

  await pool.query(
    `UPDATE payment_webhook_events
     SET processed_at = NOW(), result_json = $2
     WHERE id = $1`,
    [eventId, JSON.stringify(result)],
  );
}

export async function getWebhookEventResult(
  provider: string,
  externalEventId: string,
): Promise<Record<string, unknown> | null> {
  if (config.useMemoryDb) {
    const event = memoryEvents.get(memoryKey(provider, externalEventId));
    return event?.resultJson ?? null;
  }

  const { rows } = await pool.query(
    `SELECT result_json FROM payment_webhook_events
     WHERE provider = $1 AND event_id = $2 AND processed_at IS NOT NULL`,
    [provider, externalEventId],
  );
  if (!rows[0]?.result_json) return null;
  return rows[0].result_json as Record<string, unknown>;
}
