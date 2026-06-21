import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { BC_MOCK_PLACES } from '../mapbox/mockPlaces.js';

export interface PopularityRecord {
  featureId?: string;
  label: string;
  lat: number;
  lng: number;
  pickupCount: number;
  dropoffCount: number;
  searchCount: number;
}

const memoryStats = new Map<string, PopularityRecord>();

function clusterKey(regionCluster: string, featureId: string) {
  return `${regionCluster}:${featureId}`;
}

function popularityScore(r: PopularityRecord): number {
  return r.pickupCount + r.dropoffCount + r.searchCount;
}

function seedMemoryHotspots() {
  if (memoryStats.size > 0) return;
  for (const p of BC_MOCK_PLACES) {
    const fid = p.featureId ?? p.id;
    memoryStats.set(clusterKey('bc-vale', fid), {
      featureId: fid,
      label: p.label,
      lat: p.lat,
      lng: p.lng,
      pickupCount: fid.includes('shopping') ? 420 : 200,
      dropoffCount: fid.includes('shopping') ? 380 : 180,
      searchCount: fid.includes('centro') ? 1200 : 500,
    });
  }
}

export async function bumpPlacePopularity(params: {
  featureId?: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'pickup' | 'dropoff' | 'search';
  regionCluster?: string;
}) {
  const regionCluster = params.regionCluster ?? 'bc-vale';
  const featureId = params.featureId ?? `${params.lat.toFixed(4)}:${params.lng.toFixed(4)}`;

  if (config.useMemoryDb) {
    seedMemoryHotspots();
    const key = clusterKey(regionCluster, featureId);
    const existing = memoryStats.get(key) ?? {
      featureId,
      label: params.label,
      lat: params.lat,
      lng: params.lng,
      pickupCount: 0,
      dropoffCount: 0,
      searchCount: 0,
    };
    if (params.kind === 'pickup') existing.pickupCount++;
    if (params.kind === 'dropoff') existing.dropoffCount++;
    if (params.kind === 'search') existing.searchCount++;
    memoryStats.set(key, existing);
    return;
  }

  const col =
    params.kind === 'pickup' ? 'pickup_count' : params.kind === 'dropoff' ? 'dropoff_count' : 'search_count';

  await pool.query(
    `INSERT INTO place_popularity_stats
       (id, region_cluster, feature_id, label, lat, lng, ${col})
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT (region_cluster, feature_id) DO UPDATE SET
       ${col} = place_popularity_stats.${col} + 1,
       label = EXCLUDED.label,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       updated_at = NOW()`,
    [randomUUID(), regionCluster, featureId, params.label, params.lat, params.lng],
  );
}

export async function getPopularityForFeature(
  featureId: string,
  regionCluster = 'bc-vale',
): Promise<number> {
  if (config.useMemoryDb) {
    seedMemoryHotspots();
    const r = memoryStats.get(clusterKey(regionCluster, featureId));
    return r ? popularityScore(r) : 0;
  }

  const { rows } = await pool.query(
    `SELECT pickup_count, dropoff_count, search_count FROM place_popularity_stats
     WHERE region_cluster = $1 AND feature_id = $2`,
    [regionCluster, featureId],
  );
  if (!rows[0]) return 0;
  return (
    Number(rows[0].pickup_count) + Number(rows[0].dropoff_count) + Number(rows[0].search_count)
  );
}

export async function listRegionalHotspots(regionCluster = 'bc-vale', limit = 20): Promise<PopularityRecord[]> {
  if (config.useMemoryDb) {
    seedMemoryHotspots();
    return [...memoryStats.values()]
      .filter((r) => r.featureId)
      .sort((a, b) => popularityScore(b) - popularityScore(a))
      .slice(0, limit);
  }

  const { rows } = await pool.query(
    `SELECT feature_id, label, lat, lng, pickup_count, dropoff_count, search_count
     FROM place_popularity_stats
     WHERE region_cluster = $1
     ORDER BY (pickup_count + dropoff_count + search_count) DESC
     LIMIT $2`,
    [regionCluster, limit],
  );

  return rows.map((row) => ({
    featureId: row.feature_id as string,
    label: row.label as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    pickupCount: Number(row.pickup_count),
    dropoffCount: Number(row.dropoff_count),
    searchCount: Number(row.search_count),
  }));
}
