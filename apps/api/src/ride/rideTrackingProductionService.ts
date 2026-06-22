import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { RideRecord } from '../match/types.js';
import {
  getRealtimeProductionConfig,
  smoothDriverLocationForUi,
} from '../realtime/realtimeProductionService.js';
import { getActiveRoute } from '../route/routeStore.js';
import { toPublicActiveRoute } from '../route/routeService.js';
import {
  getRideTracking,
  type RideTrackingSnapshot,
  toPublicTracking,
} from './rideTrackingService.js';

export interface RideTrackingProductionConfig {
  pollIntervalMs: number;
  etaStaleThresholdSeconds: number;
  useActiveRouteEta: boolean;
  snapshotSampleRateBps: number;
  configVersion: string;
}

export interface RideTrackingProductionPayload extends RideTrackingSnapshot {
  etaSource: 'haversine' | 'active_route' | 'blended';
  pollIntervalMs: number;
  configVersion: string;
  route: ReturnType<typeof toPublicActiveRoute> | null;
  locationStale: boolean;
}

const memoryConfig: RideTrackingProductionConfig = {
  pollIntervalMs: 5000,
  etaStaleThresholdSeconds: 90,
  useActiveRouteEta: true,
  snapshotSampleRateBps: 10_000,
  configVersion: 'camada45-memory-v1',
};

const memorySnapshots: Array<{ rideId: string; etaSource: string; etaSeconds: number }> = [];

function formatEtaLabel(seconds: number): string {
  if (seconds < 60) return '< 1 min';
  const min = Math.ceil(seconds / 60);
  return min === 1 ? '1 min' : `${min} min`;
}

export async function getRideTrackingProductionConfig(): Promise<RideTrackingProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM ride_tracking_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada45-v1' };
  return {
    pollIntervalMs: Number(r.poll_interval_ms),
    etaStaleThresholdSeconds: Number(r.eta_stale_threshold_seconds),
    useActiveRouteEta: Boolean(r.use_active_route_eta),
    snapshotSampleRateBps: Number(r.snapshot_sample_rate_bps),
    configVersion: r.config_version as string,
  };
}

function isLocationStale(updatedAt?: string, thresholdSeconds = 90): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > thresholdSeconds * 1000;
}

async function maybeCaptureSnapshot(input: {
  rideId: string;
  target: 'pickup' | 'dropoff';
  etaSeconds: number;
  distanceM: number | null;
  etaSource: string;
  driverLat?: number;
  driverLng?: number;
  routeEtaSeconds?: number;
  deviationM?: number;
  configVersion: string;
  sampleRateBps: number;
}) {
  const sample = Math.floor(Math.random() * 10_000);
  if (sample >= input.sampleRateBps) return;

  if (config.useMemoryDb) {
    memorySnapshots.push({
      rideId: input.rideId,
      etaSource: input.etaSource,
      etaSeconds: input.etaSeconds,
    });
    return;
  }

  await pool.query(
    `INSERT INTO ride_tracking_snapshots
       (ride_id, target, eta_seconds, distance_m, eta_source, driver_lat, driver_lng,
        route_eta_seconds, deviation_m, config_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.rideId,
      input.target,
      input.etaSeconds,
      input.distanceM,
      input.etaSource,
      input.driverLat ?? null,
      input.driverLng ?? null,
      input.routeEtaSeconds ?? null,
      input.deviationM ?? null,
      input.configVersion,
    ],
  );
}

export async function getRideTrackingProduction(
  ride: RideRecord,
): Promise<RideTrackingProductionPayload | null> {
  const base = await getRideTracking(ride);
  if (!base) return null;

  const [trackingCfg, rtCfg, activeRoute] = await Promise.all([
    getRideTrackingProductionConfig(),
    getRealtimeProductionConfig(),
    getActiveRoute(ride.id),
  ]);

  let etaSource: RideTrackingProductionPayload['etaSource'] = 'haversine';
  let tracking: RideTrackingSnapshot = { ...base };

  if (tracking.driverLocation && ride.driverId) {
    const smoothed = smoothDriverLocationForUi(
      ride.driverId,
      tracking.driverLocation.lat,
      tracking.driverLocation.lng,
      rtCfg.gpsSmoothFactor,
    );
    tracking = {
      ...tracking,
      driverLocation: {
        ...tracking.driverLocation,
        lat: smoothed.lat,
        lng: smoothed.lng,
      },
    };
  }

  if (trackingCfg.useActiveRouteEta && activeRoute && ride.status === 'IN_PROGRESS') {
    tracking = {
      ...tracking,
      eta: {
        seconds: activeRoute.etaSeconds,
        label: formatEtaLabel(activeRoute.etaSeconds),
        target: 'dropoff',
      },
      distanceM: activeRoute.distanceM,
    };
    etaSource = 'active_route';
  } else if (
    trackingCfg.useActiveRouteEta &&
    activeRoute &&
    tracking.eta &&
    activeRoute.etaSeconds < tracking.eta.seconds
  ) {
    tracking = {
      ...tracking,
      eta: {
        seconds: activeRoute.etaSeconds,
        label: formatEtaLabel(activeRoute.etaSeconds),
        target: tracking.eta.target,
      },
    };
    etaSource = 'blended';
  }

  const locationStale = isLocationStale(
    tracking.driverLocation?.updatedAt,
    trackingCfg.etaStaleThresholdSeconds,
  );

  if (tracking.eta) {
    await maybeCaptureSnapshot({
      rideId: ride.id,
      target: tracking.eta.target,
      etaSeconds: tracking.eta.seconds,
      distanceM: tracking.distanceM,
      etaSource,
      driverLat: tracking.driverLocation?.lat,
      driverLng: tracking.driverLocation?.lng,
      routeEtaSeconds: activeRoute?.etaSeconds,
      deviationM: activeRoute?.deviationM,
      configVersion: trackingCfg.configVersion,
      sampleRateBps: trackingCfg.snapshotSampleRateBps,
    });
  }

  return {
    ...tracking,
    etaSource,
    pollIntervalMs: trackingCfg.pollIntervalMs,
    configVersion: trackingCfg.configVersion,
    route: activeRoute ? toPublicActiveRoute(activeRoute) : null,
    locationStale,
  };
}

export function toPublicRideTrackingProduction(payload: RideTrackingProductionPayload) {
  return {
    ...toPublicTracking(payload),
    etaSource: payload.etaSource,
    pollIntervalMs: payload.pollIntervalMs,
    configVersion: payload.configVersion,
    route: payload.route,
    locationStale: payload.locationStale,
  };
}

export async function listRideTrackingSnapshots(rideId: string, limit = 20) {
  if (config.useMemoryDb) {
    return memorySnapshots.filter((s) => s.rideId === rideId).slice(0, limit);
  }
  const { rows } = await pool.query(
    `SELECT id, target, eta_seconds, distance_m, eta_source, created_at
     FROM ride_tracking_snapshots WHERE ride_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [rideId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    target: r.target as string,
    etaSeconds: Number(r.eta_seconds),
    distanceM: r.distance_m != null ? Number(r.distance_m) : null,
    etaSource: r.eta_source as string,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export function seedMemoryRideTrackingProductionConfig(cfg: Partial<RideTrackingProductionConfig>) {
  Object.assign(memoryConfig, cfg);
}

export function __testResetRideTrackingProductionMemory() {
  memorySnapshots.length = 0;
  Object.assign(memoryConfig, {
    pollIntervalMs: 5000,
    etaStaleThresholdSeconds: 90,
    useActiveRouteEta: true,
    snapshotSampleRateBps: 10_000,
    configVersion: 'camada45-memory-v1',
  });
}

export function __testGetRideTrackingSnapshots() {
  return memorySnapshots;
}
