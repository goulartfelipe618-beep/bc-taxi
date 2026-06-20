import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export type SavedPlaceType = 'favorite' | 'home' | 'work';

export type SavedPlace = {
  id: string;
  userId: string;
  placeType: SavedPlaceType;
  label: string;
  address: string;
  lat: number;
  lng: number;
  featureId?: string;
  createdAt: Date;
  updatedAt: Date;
};

const memorySaved = new Map<string, SavedPlace[]>();

function useMemory() {
  return config.useMemoryDb;
}

function mapSavedRow(row: Record<string, unknown>): SavedPlace {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    placeType: row.place_type as SavedPlaceType,
    label: row.label as string,
    address: row.address_text as string,
    lat: Number(row.point_lat),
    lng: Number(row.point_lng),
    featureId: (row.mapbox_feature_id as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listSavedPlaces(userId: string): Promise<SavedPlace[]> {
  if (useMemory()) {
    return memorySaved.get(userId) ?? [];
  }

  const { rows } = await pool.query(
    `SELECT * FROM user_saved_places
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY
       CASE place_type WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END,
       label ASC`,
    [userId],
  );
  return rows.map(mapSavedRow);
}

export async function upsertSavedPlace(
  userId: string,
  input: {
    placeType: SavedPlaceType;
    label: string;
    address: string;
    lat: number;
    lng: number;
    featureId?: string;
  },
): Promise<SavedPlace> {
  if (useMemory()) {
    const list = memorySaved.get(userId) ?? [];
    if (input.placeType === 'home' || input.placeType === 'work') {
      const idx = list.findIndex((p) => p.placeType === input.placeType);
      const record: SavedPlace = {
        id: idx >= 0 ? list[idx]!.id : randomUUID(),
        userId,
        placeType: input.placeType,
        label: input.label,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        featureId: input.featureId,
        createdAt: idx >= 0 ? list[idx]!.createdAt : new Date(),
        updatedAt: new Date(),
      };
      if (idx >= 0) list[idx] = record;
      else list.unshift(record);
      memorySaved.set(userId, list);
      return record;
    }

    const record: SavedPlace = {
      id: randomUUID(),
      userId,
      placeType: input.placeType,
      label: input.label,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      featureId: input.featureId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memorySaved.set(userId, [record, ...list]);
    return record;
  }

  if (input.placeType === 'home' || input.placeType === 'work') {
    const existing = await pool.query(
      `SELECT id FROM user_saved_places
       WHERE user_id = $1 AND place_type = $2 AND deleted_at IS NULL`,
      [userId, input.placeType],
    );
    if (existing.rowCount) {
      const { rows } = await pool.query(
        `UPDATE user_saved_places SET
           label = $3, address_text = $4, point_lat = $5, point_lng = $6,
           mapbox_feature_id = $7, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [
          existing.rows[0].id,
          userId,
          input.label,
          input.address,
          input.lat,
          input.lng,
          input.featureId ?? null,
        ],
      );
      return mapSavedRow(rows[0]);
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO user_saved_places
       (user_id, place_type, label, mapbox_feature_id, address_text, point_lat, point_lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, input.placeType, input.label, input.featureId ?? null, input.address, input.lat, input.lng],
  );
  return mapSavedRow(rows[0]);
}

export async function deleteSavedPlace(userId: string, placeId: string): Promise<boolean> {
  if (useMemory()) {
    const list = memorySaved.get(userId) ?? [];
    const next = list.filter((p) => p.id !== placeId);
    if (next.length === list.length) return false;
    memorySaved.set(userId, next);
    return true;
  }

  const result = await pool.query(
    `UPDATE user_saved_places SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [placeId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export function toPublicSavedPlace(p: SavedPlace) {
  return {
    id: p.id,
    placeType: p.placeType,
    label: p.label,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    featureId: p.featureId,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function savedPlaceToMapPlace(p: SavedPlace) {
  return {
    id: p.featureId ?? p.id,
    label: p.label,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    featureId: p.featureId,
    source: 'mapbox' as const,
  };
}
