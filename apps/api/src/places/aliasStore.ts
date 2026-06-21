import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { MapPlace } from '../mapbox/types.js';

export interface PlaceAliasRecord {
  id: string;
  userId: string;
  alias: string;
  featureId?: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  createdAt: Date;
  updatedAt: Date;
}

const memoryAliases = new Map<string, PlaceAliasRecord[]>();

function mapRow(row: Record<string, unknown>): PlaceAliasRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    alias: row.alias as string,
    featureId: (row.feature_id as string) ?? undefined,
    label: row.label as string,
    address: row.address_text as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function upsertPlaceAlias(
  userId: string,
  input: { alias: string; place: MapPlace },
): Promise<PlaceAliasRecord> {
  const normalizedAlias = input.alias.trim().toLowerCase();
  const now = new Date();

  if (config.useMemoryDb) {
    const list = memoryAliases.get(userId) ?? [];
    const idx = list.findIndex((a) => a.alias === normalizedAlias);
    const record: PlaceAliasRecord = {
      id: idx >= 0 ? list[idx]!.id : randomUUID(),
      userId,
      alias: normalizedAlias,
      featureId: input.place.featureId ?? input.place.id,
      label: input.place.label,
      address: input.place.address,
      lat: input.place.lat,
      lng: input.place.lng,
      createdAt: idx >= 0 ? list[idx]!.createdAt : now,
      updatedAt: now,
    };
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    memoryAliases.set(userId, list);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO place_aliases (user_id, alias, feature_id, label, address_text, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, alias) DO UPDATE SET
       feature_id = EXCLUDED.feature_id,
       label = EXCLUDED.label,
       address_text = EXCLUDED.address_text,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      normalizedAlias,
      input.place.featureId ?? input.place.id,
      input.place.label,
      input.place.address,
      input.place.lat,
      input.place.lng,
    ],
  );
  return mapRow(rows[0]);
}

export async function listPlaceAliases(userId: string): Promise<PlaceAliasRecord[]> {
  if (config.useMemoryDb) return memoryAliases.get(userId) ?? [];
  const { rows } = await pool.query(
    `SELECT * FROM place_aliases WHERE user_id = $1 ORDER BY alias ASC`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function searchPlaceAliases(userId: string, query: string): Promise<PlaceAliasRecord[]> {
  const q = query.trim().toLowerCase();
  const all = await listPlaceAliases(userId);
  return all.filter((a) => a.alias.includes(q) || a.label.toLowerCase().includes(q));
}

export function aliasToMapPlace(a: PlaceAliasRecord): MapPlace {
  return {
    id: a.featureId ?? a.id,
    label: a.label,
    address: a.address,
    lat: a.lat,
    lng: a.lng,
    featureId: a.featureId,
    source: 'mock',
  };
}
