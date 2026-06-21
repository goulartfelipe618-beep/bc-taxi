import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export type PushPlatform = 'ios' | 'android' | 'web' | 'expo';

export interface PushTokenRecord {
  id: string;
  userId: string;
  platform: PushPlatform;
  token: string;
  isActive: boolean;
}

const memoryTokens = new Map<string, PushTokenRecord[]>();

export async function upsertPushToken(input: {
  userId: string;
  platform: PushPlatform;
  token: string;
}): Promise<PushTokenRecord> {
  const record: PushTokenRecord = {
    id: randomUUID(),
    userId: input.userId,
    platform: input.platform,
    token: input.token,
    isActive: true,
  };

  if (config.useMemoryDb) {
    const list = memoryTokens.get(input.userId) ?? [];
    const existing = list.find((t) => t.token === input.token);
    if (existing) {
      existing.isActive = true;
      return existing;
    }
    list.push(record);
    memoryTokens.set(input.userId, list);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO user_push_tokens (user_id, platform, token, is_active, updated_at)
     VALUES ($1,$2,$3,TRUE,NOW())
     ON CONFLICT (user_id, token) DO UPDATE SET
       platform = EXCLUDED.platform,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [input.userId, input.platform, input.token],
  );

  return {
    id: rows[0].id as string,
    userId: rows[0].user_id as string,
    platform: rows[0].platform as PushPlatform,
    token: rows[0].token as string,
    isActive: Boolean(rows[0].is_active),
  };
}

export async function listActivePushTokens(userId: string): Promise<PushTokenRecord[]> {
  if (config.useMemoryDb) {
    return (memoryTokens.get(userId) ?? []).filter((t) => t.isActive);
  }
  const { rows } = await pool.query(
    `SELECT * FROM user_push_tokens WHERE user_id = $1 AND is_active = TRUE ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    platform: r.platform as PushPlatform,
    token: r.token as string,
    isActive: Boolean(r.is_active),
  }));
}

export async function logPushNotification(input: {
  userId?: string;
  eventType: string;
  title: string;
  body: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  provider: string;
  providerRef?: string;
  payload?: Record<string, unknown>;
}) {
  if (config.useMemoryDb) return { id: randomUUID() };

  const { rows } = await pool.query(
    `INSERT INTO push_notification_log
      (user_id, event_type, title, body, status, provider, provider_ref, payload_json, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $5 = 'sent' THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      input.userId ?? null,
      input.eventType,
      input.title,
      input.body,
      input.status,
      input.provider,
      input.providerRef ?? null,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return { id: rows[0].id as string };
}

export async function listUserNotifications(userId: string, limit = 30) {
  if (config.useMemoryDb) return [];

  const { rows } = await pool.query(
    `SELECT id, event_type, title, body, status, created_at, sent_at
     FROM push_notification_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    eventType: r.event_type as string,
    title: r.title as string,
    body: r.body as string,
    status: r.status as string,
    createdAt: (r.created_at as Date).toISOString(),
    sentAt: r.sent_at ? (r.sent_at as Date).toISOString() : undefined,
  }));
}
