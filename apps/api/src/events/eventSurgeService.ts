import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export type EventSurgeType = 'show' | 'sports' | 'festival' | 'conference' | 'other';

export interface EventSurgeRecord {
  id: string;
  regionId?: string;
  eventName: string;
  eventType: EventSurgeType;
  startsAt: Date;
  endsAt: Date;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  intensityIndex: number;
  impactedCategories?: string[];
  source: string;
  isActive: boolean;
}

const DEMO_EVENT_ID = '00000000-0000-4000-8000-000000000200';

const memoryEvents: EventSurgeRecord[] = [
  {
    id: DEMO_EVENT_ID,
    regionId: '00000000-0000-4000-8000-000000000020',
    eventName: 'Show Arena BC — Verão',
    eventType: 'show',
    startsAt: new Date(Date.now() - 2 * 3600_000),
    endsAt: new Date(Date.now() + 30 * 86400_000),
    centerLat: -26.9905,
    centerLng: -48.6348,
    radiusKm: 4.5,
    intensityIndex: 0.72,
    impactedCategories: ['economico', 'comfort', 'executivo', 'suv'],
    source: 'seed',
    isActive: true,
  },
];

function mapRow(row: Record<string, unknown>): EventSurgeRecord {
  return {
    id: row.id as string,
    regionId: (row.region_id as string) ?? undefined,
    eventName: row.event_name as string,
    eventType: row.event_type as EventSurgeType,
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    radiusKm: Number(row.radius_km),
    intensityIndex: Number(row.intensity_index),
    impactedCategories: (row.impacted_categories as string[]) ?? undefined,
    source: row.source as string,
    isActive: Boolean(row.is_active),
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isEventActive(event: EventSurgeRecord, at: Date) {
  return event.isActive && event.startsAt.getTime() <= at.getTime() && event.endsAt.getTime() >= at.getTime();
}

export async function listActiveEvents(at = new Date()): Promise<EventSurgeRecord[]> {
  if (config.useMemoryDb) {
    return memoryEvents.filter((e) => isEventActive(e, at));
  }
  const { rows } = await pool.query(
    `SELECT * FROM event_surge_inputs
     WHERE is_active = TRUE AND starts_at <= $1 AND ends_at >= $1
     ORDER BY intensity_index DESC`,
    [at],
  );
  return rows.map(mapRow);
}

export async function listEventsNear(lat: number, lng: number, at = new Date()): Promise<EventSurgeRecord[]> {
  const active = await listActiveEvents(at);
  return active.filter((e) => haversineKm(lat, lng, e.centerLat, e.centerLng) <= e.radiusKm);
}

export async function computeEventPressure(
  lat?: number,
  lng?: number,
  categoryCode?: string,
  at = new Date(),
): Promise<number> {
  const events = lat != null && lng != null ? await listEventsNear(lat, lng, at) : await listActiveEvents(at);
  let maxPressure = 0;

  for (const event of events) {
    if (categoryCode && event.impactedCategories?.length && !event.impactedCategories.includes(categoryCode)) {
      continue;
    }
    let pressure = event.intensityIndex * 0.35;
    if (lat != null && lng != null) {
      const dist = haversineKm(lat, lng, event.centerLat, event.centerLng);
      const proximity = Math.max(0, 1 - dist / event.radiusKm);
      pressure *= 0.5 + proximity * 0.5;
    }
    maxPressure = Math.max(maxPressure, pressure);
  }

  return Math.min(0.5, maxPressure);
}

export async function createEventSurge(input: {
  eventName: string;
  eventType: EventSurgeType;
  startsAt: Date;
  endsAt: Date;
  centerLat: number;
  centerLng: number;
  radiusKm?: number;
  intensityIndex?: number;
  impactedCategories?: string[];
  regionId?: string;
  source?: string;
}): Promise<EventSurgeRecord> {
  const record: EventSurgeRecord = {
    id: randomUUID(),
    regionId: input.regionId,
    eventName: input.eventName,
    eventType: input.eventType,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    centerLat: input.centerLat,
    centerLng: input.centerLng,
    radiusKm: input.radiusKm ?? 3,
    intensityIndex: input.intensityIndex ?? 0.5,
    impactedCategories: input.impactedCategories,
    source: input.source ?? 'backoffice',
    isActive: true,
  };

  if (config.useMemoryDb) {
    memoryEvents.push(record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO event_surge_inputs (
      id, region_id, event_name, event_type, starts_at, ends_at,
      center_lat, center_lng, radius_km, intensity_index, impacted_categories, source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      record.id,
      record.regionId ?? null,
      record.eventName,
      record.eventType,
      record.startsAt,
      record.endsAt,
      record.centerLat,
      record.centerLng,
      record.radiusKm,
      record.intensityIndex,
      record.impactedCategories ?? null,
      record.source,
    ],
  );
  return mapRow(rows[0]);
}

export function toPublicEvent(e: EventSurgeRecord) {
  return {
    id: e.id,
    eventName: e.eventName,
    eventType: e.eventType,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    centerLat: e.centerLat,
    centerLng: e.centerLng,
    radiusKm: e.radiusKm,
    intensityIndex: e.intensityIndex,
    impactedCategories: e.impactedCategories,
  };
}
