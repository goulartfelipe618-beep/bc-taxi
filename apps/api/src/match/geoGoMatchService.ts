import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { memoryMatchStore } from '../stores/memoryMatchStore.js';
import { findNearbyDriversPostGIS } from '../match/geoMatchStore.js';
import type { DriverRecord } from '../match/types.js';
import { getCategoryLocationFreshnessSeconds } from '../catalog/categoryDocumentProductionService.js';

export interface GeoGoMatchConfig {
  mode: 'internal' | 'external';
  externalBaseUrl?: string;
  locationFreshnessDefaultSeconds: number;
  heartbeatMaxAgeSeconds: number;
  configVersion: string;
}

const memoryGeoGoConfig: GeoGoMatchConfig = {
  mode: 'internal',
  locationFreshnessDefaultSeconds: 120,
  heartbeatMaxAgeSeconds: 45,
  configVersion: 'camada43-memory-v1',
};

const memoryGeoGoEvents: Array<{ eventType: string; candidateCount: number }> = [];

export async function getGeoGoMatchConfig(regionId?: string): Promise<GeoGoMatchConfig> {
  if (config.useMemoryDb) return { ...memoryGeoGoConfig };

  const { rows } = await pool.query(
    `SELECT * FROM geo_go_match_config
     WHERE is_active = TRUE AND ($1::uuid IS NULL OR region_id = $1 OR region_id IS NULL)
     ORDER BY region_id NULLS LAST, created_at DESC
     LIMIT 1`,
    [regionId ?? null],
  );
  const r = rows[0];
  if (!r) return { ...memoryGeoGoConfig, configVersion: 'camada43-v1' };
  return {
    mode: r.mode as GeoGoMatchConfig['mode'],
    externalBaseUrl: (r.external_base_url as string) ?? undefined,
    locationFreshnessDefaultSeconds: Number(r.location_freshness_default_seconds),
    heartbeatMaxAgeSeconds: Number(r.heartbeat_max_age_seconds),
    configVersion: r.config_version as string,
  };
}

function isDriverLocationFresh(driver: DriverRecord, slaSeconds: number): boolean {
  if (driver.lat == null || driver.lng == null || !driver.locationUpdatedAt) return false;
  return Date.now() - driver.locationUpdatedAt.getTime() <= slaSeconds * 1000;
}

async function recordGeoGoEvent(input: {
  rideId?: string;
  categoryCode?: string;
  regionId?: string;
  eventType: string;
  candidateCount: number;
  metadata?: Record<string, unknown>;
  configVersion: string;
}) {
  if (config.useMemoryDb) {
    memoryGeoGoEvents.push({ eventType: input.eventType, candidateCount: input.candidateCount });
    return;
  }
  await pool.query(
    `INSERT INTO geo_go_match_events
       (ride_id, category_code, region_id, event_type, candidate_count, metadata_json, config_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.rideId ?? null,
      input.categoryCode ?? null,
      input.regionId ?? null,
      input.eventType,
      input.candidateCount,
      JSON.stringify(input.metadata ?? {}),
      input.configVersion,
    ],
  );
}

async function findNearbyDriversInternal(input: {
  lat: number;
  lng: number;
  radiusM: number;
  categoryCode: string;
  regionId?: string;
}): Promise<DriverRecord[]> {
  const geoCfg = await getGeoGoMatchConfig(input.regionId);
  const slaSeconds = await getCategoryLocationFreshnessSeconds(input.categoryCode, input.regionId);

  let drivers: DriverRecord[] = [];
  if (useMemory()) {
    drivers = await memoryMatchStore.findOnlineDrivers();
  } else {
    const nearby = await findNearbyDriversPostGIS(input.lat, input.lng, input.radiusM);
    drivers = nearby.map(({ distanceM: _d, ...driver }) => driver);
  }

  const filtered = drivers.filter((d) => isDriverLocationFresh(d, slaSeconds));
  await recordGeoGoEvent({
    categoryCode: input.categoryCode,
    regionId: input.regionId,
    eventType: filtered.length < drivers.length ? 'sla_filtered' : 'nearby_query',
    candidateCount: filtered.length,
    metadata: { totalBeforeSla: drivers.length, slaSeconds, heartbeatMaxAge: geoCfg.heartbeatMaxAgeSeconds },
    configVersion: geoCfg.configVersion,
  });
  return filtered;
}

async function findNearbyDriversExternal(input: {
  lat: number;
  lng: number;
  radiusM: number;
  categoryCode: string;
  baseUrl: string;
}): Promise<DriverRecord[] | null> {
  try {
    const url = new URL('/v1/drivers/nearby', input.baseUrl);
    url.searchParams.set('lat', String(input.lat));
    url.searchParams.set('lng', String(input.lng));
    url.searchParams.set('radiusM', String(input.radiusM));
    url.searchParams.set('categoryCode', input.categoryCode);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { drivers?: DriverRecord[] };
    return body.drivers ?? [];
  } catch {
    return null;
  }
}

export async function findNearbyDriversGeoGo(input: {
  lat: number;
  lng: number;
  radiusM: number;
  categoryCode: string;
  regionId?: string;
  rideId?: string;
}): Promise<DriverRecord[]> {
  const geoCfg = await getGeoGoMatchConfig(input.regionId);

  if (geoCfg.mode === 'external' && geoCfg.externalBaseUrl) {
    const external = await findNearbyDriversExternal({
      lat: input.lat,
      lng: input.lng,
      radiusM: input.radiusM,
      categoryCode: input.categoryCode,
      baseUrl: geoCfg.externalBaseUrl,
    });
    if (external) {
      await recordGeoGoEvent({
        rideId: input.rideId,
        categoryCode: input.categoryCode,
        regionId: input.regionId,
        eventType: 'nearby_query',
        candidateCount: external.length,
        metadata: { source: 'external' },
        configVersion: geoCfg.configVersion,
      });
      return external;
    }
    await recordGeoGoEvent({
      rideId: input.rideId,
      categoryCode: input.categoryCode,
      regionId: input.regionId,
      eventType: 'external_fallback',
      candidateCount: 0,
      configVersion: geoCfg.configVersion,
    });
  }

  return findNearbyDriversInternal(input);
}

export function isGeoGoMatchEnabled() {
  return config.geoGoMatchEnabled;
}

export function __testResetGeoGoMatchMemory() {
  memoryGeoGoEvents.length = 0;
  Object.assign(memoryGeoGoConfig, {
    mode: 'internal',
    locationFreshnessDefaultSeconds: 120,
    heartbeatMaxAgeSeconds: 45,
    configVersion: 'camada43-memory-v1',
  });
}

export function __testGetGeoGoMatchEvents() {
  return memoryGeoGoEvents;
}
