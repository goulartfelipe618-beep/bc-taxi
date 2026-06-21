import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { MapPlace } from '../mapbox/types.js';

export type PlaceHistoryItem = {
  id: string;
  featureId?: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  source: string;
  confirmedAt: Date;
};

const memoryCache = new Map<string, MapPlace>();
const memoryHistory = new Map<string, PlaceHistoryItem[]>();

function useMemory() {
  return config.useMemoryDb;
}

export async function upsertPlaceCache(place: MapPlace) {
  const featureId = place.featureId ?? place.id;
  if (useMemory()) {
    memoryCache.set(featureId, place);
    return;
  }

  await pool.query(
    `INSERT INTO place_cache (feature_id, label, address_text, lat, lng, source, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (feature_id) DO UPDATE SET
       label = EXCLUDED.label,
       address_text = EXCLUDED.address_text,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       source = EXCLUDED.source,
       updated_at = NOW()`,
    [featureId, place.label, place.address, place.lat, place.lng, place.source],
  );
}

export async function recordPlaceConfirmation(
  userId: string,
  place: MapPlace,
  sessionToken?: string,
) {
  await upsertPlaceCache(place);
  const featureId = place.featureId ?? place.id;

  const { bumpPlacePopularity } = await import('./popularityStore.js');
  void bumpPlacePopularity({
    featureId,
    label: place.label,
    lat: place.lat,
    lng: place.lng,
    kind: 'pickup',
  });

  if (useMemory()) {
    const list = memoryHistory.get(userId) ?? [];
    const item: PlaceHistoryItem = {
      id: randomUUID(),
      featureId,
      label: place.label,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      source: place.source,
      confirmedAt: new Date(),
    };
    memoryHistory.set(userId, [item, ...list.filter((h) => h.featureId !== featureId)].slice(0, 30));
    return item;
  }

  const { rows } = await pool.query(
    `INSERT INTO user_place_history
       (user_id, feature_id, label, address_text, lat, lng, source, session_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, feature_id, label, address_text, lat, lng, source, confirmed_at`,
    [userId, featureId, place.label, place.address, place.lat, place.lng, place.source, sessionToken ?? null],
  );
  return mapHistoryRow(rows[0]);
}

export async function listRecentPlaces(userId: string, limit = 10): Promise<PlaceHistoryItem[]> {
  if (useMemory()) {
    return (memoryHistory.get(userId) ?? []).slice(0, limit);
  }

  const { rows } = await pool.query(
    `SELECT id, feature_id, label, address_text, lat, lng, source, confirmed_at
     FROM user_place_history
     WHERE user_id = $1
     ORDER BY confirmed_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  return rows.map(mapHistoryRow);
}

function mapHistoryRow(row: Record<string, unknown>): PlaceHistoryItem {
  return {
    id: row.id as string,
    featureId: (row.feature_id as string) ?? undefined,
    label: row.label as string,
    address: row.address_text as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    source: row.source as string,
    confirmedAt: new Date(row.confirmed_at as string),
  };
}

export function toPublicPlaceHistory(item: PlaceHistoryItem) {
  return {
    id: item.id,
    featureId: item.featureId,
    label: item.label,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    source: item.source,
    confirmedAt: item.confirmedAt.toISOString(),
  };
}
