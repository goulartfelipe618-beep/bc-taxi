import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { computeArrivalWaitFee, resolveOperationalParamsForRide } from '../config/policyEnforcementService.js';
import { pool } from '../db.js';
import { haversineMeters } from '../match/eligibility.js';
import { getRide } from '../match/matchService.js';
import type { RideRecord } from '../match/types.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';
import { getVerificationStatus } from './codeStore.js';
import { driverMarkArrived } from './lifecycleService.js';
import type { VerificationPublic } from './types.js';

export interface RideLifecycleProductionConfig {
  pickupGeofenceRadiusM: number;
  autoArrivalEnabled: boolean;
  autoArrivalMinDwellSeconds: number;
  lifecyclePollIntervalMs: number;
  waitTimerEnabled: boolean;
  configVersion: string;
}

export interface RideLifecycleGeofence {
  distanceM: number | null;
  radiusM: number;
  inGeofence: boolean;
  autoArrivalEnabled: boolean;
  dwellSeconds: number | null;
}

export interface RideLifecycleWaitTimer {
  active: boolean;
  elapsedSeconds: number;
  includedMinutes: number;
  billableMinutes: number;
  estimatedFeeCentavos: number;
  feeLabel: string;
}

export interface RideLifecycleProductionPayload {
  verification: VerificationPublic | null;
  geofence: RideLifecycleGeofence | null;
  waitTimer: RideLifecycleWaitTimer | null;
  pollIntervalMs: number;
  configVersion: string;
}

type LifecycleEventType =
  | 'geofence_enter'
  | 'geofence_exit'
  | 'auto_arrived'
  | 'manual_arrived'
  | 'code_verified'
  | 'ride_started'
  | 'wait_tick';

const memoryConfig: RideLifecycleProductionConfig = {
  pickupGeofenceRadiusM: 120,
  autoArrivalEnabled: true,
  autoArrivalMinDwellSeconds: 5,
  lifecyclePollIntervalMs: 3000,
  waitTimerEnabled: true,
  configVersion: 'camada46-memory-v1',
};

const geofenceDwellByRide = new Map<string, { enteredAt: number | null; wasInGeofence: boolean }>();
const memoryEvents: Array<{
  id: string;
  rideId: string;
  eventType: LifecycleEventType;
  actorUserId?: string;
  payload: Record<string, unknown>;
  configVersion: string;
  createdAt: Date;
}> = [];

function formatFeeLabel(centavos: number): string {
  if (centavos <= 0) return 'Sem taxa de espera';
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
}

export async function getRideLifecycleProductionConfig(): Promise<RideLifecycleProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM ride_lifecycle_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada46-v1' };
  return {
    pickupGeofenceRadiusM: Number(r.pickup_geofence_radius_m),
    autoArrivalEnabled: Boolean(r.auto_arrival_enabled),
    autoArrivalMinDwellSeconds: Number(r.auto_arrival_min_dwell_seconds),
    lifecyclePollIntervalMs: Number(r.lifecycle_poll_interval_ms),
    waitTimerEnabled: Boolean(r.wait_timer_enabled),
    configVersion: r.config_version as string,
  };
}

export function seedMemoryRideLifecycleProductionConfig(
  patch: Partial<RideLifecycleProductionConfig> = {},
): RideLifecycleProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}

export function __testResetRideLifecycleProductionMemory() {
  geofenceDwellByRide.clear();
  memoryEvents.length = 0;
  Object.assign(memoryConfig, {
    pickupGeofenceRadiusM: 120,
    autoArrivalEnabled: true,
    autoArrivalMinDwellSeconds: 5,
    lifecyclePollIntervalMs: 3000,
    waitTimerEnabled: true,
    configVersion: 'camada46-memory-v1',
  });
}

export function __testGetRideLifecycleEvents() {
  return [...memoryEvents];
}

async function recordLifecycleEvent(input: {
  rideId: string;
  eventType: LifecycleEventType;
  actorUserId?: string;
  payload?: Record<string, unknown>;
  configVersion: string;
}) {
  if (config.useMemoryDb) {
    memoryEvents.push({
      id: randomUUID(),
      rideId: input.rideId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      payload: input.payload ?? {},
      configVersion: input.configVersion,
      createdAt: new Date(),
    });
    return;
  }

  await pool.query(
    `INSERT INTO ride_lifecycle_events (ride_id, event_type, actor_user_id, payload_json, config_version)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.rideId,
      input.eventType,
      input.actorUserId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.configVersion,
    ],
  );
}

export async function recordLifecycleProductionEvent(input: {
  rideId: string;
  eventType: LifecycleEventType;
  actorUserId?: string;
  payload?: Record<string, unknown>;
}) {
  const cfg = await getRideLifecycleProductionConfig();
  await recordLifecycleEvent({ ...input, configVersion: cfg.configVersion });
}

export async function listRideLifecycleEvents(rideId: string, limit = 20) {
  if (config.useMemoryDb) {
    return memoryEvents
      .filter((e) => e.rideId === rideId)
      .slice(-limit)
      .map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorUserId: e.actorUserId,
        payload: e.payload,
        configVersion: e.configVersion,
        createdAt: e.createdAt.toISOString(),
      }));
  }

  const { rows } = await pool.query(
    `SELECT id, event_type, actor_user_id, payload_json, config_version, created_at
     FROM ride_lifecycle_events WHERE ride_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [rideId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    eventType: r.event_type as string,
    actorUserId: r.actor_user_id as string | undefined,
    payload: r.payload_json as Record<string, unknown>,
    configVersion: r.config_version as string,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

function evaluateGeofenceDwell(rideId: string, inGeofence: boolean): number | null {
  const state = geofenceDwellByRide.get(rideId) ?? { enteredAt: null, wasInGeofence: false };
  if (inGeofence) {
    if (state.enteredAt == null) state.enteredAt = Date.now();
  } else {
    state.enteredAt = null;
  }
  state.wasInGeofence = inGeofence;
  geofenceDwellByRide.set(rideId, state);
  if (!inGeofence || state.enteredAt == null) return null;
  return Math.floor((Date.now() - state.enteredAt) / 1000);
}

export function evaluatePickupGeofence(input: {
  ride: RideRecord;
  driverLat: number;
  driverLng: number;
  cfg: RideLifecycleProductionConfig;
}): RideLifecycleGeofence {
  const distanceM = Math.round(
    haversineMeters(input.ride.pickupLat, input.ride.pickupLng, input.driverLat, input.driverLng),
  );
  const inGeofence = distanceM <= input.cfg.pickupGeofenceRadiusM;
  const dwellSeconds =
    input.ride.status === 'DRIVER_ASSIGNED' ? evaluateGeofenceDwell(input.ride.id, inGeofence) : null;

  return {
    distanceM,
    radiusM: input.cfg.pickupGeofenceRadiusM,
    inGeofence,
    autoArrivalEnabled: input.cfg.autoArrivalEnabled,
    dwellSeconds,
  };
}

export async function maybeAutoMarkArrivedFromLocation(
  rideId: string,
  driverId: string,
  driverLat: number,
  driverLng: number,
): Promise<{ autoArrived: boolean }> {
  const ride = await getRide(rideId);
  if (!ride || ride.driverId !== driverId || ride.status !== 'DRIVER_ASSIGNED') {
    return { autoArrived: false };
  }

  const cfg = await getRideLifecycleProductionConfig();
  if (!cfg.autoArrivalEnabled) return { autoArrived: false };

  const prevWasIn = geofenceDwellByRide.get(rideId)?.wasInGeofence ?? false;
  const geofence = evaluatePickupGeofence({ ride, driverLat, driverLng, cfg });

  if (!geofence.inGeofence) {
    if (prevWasIn) {
      await recordLifecycleEvent({
        rideId,
        eventType: 'geofence_exit',
        actorUserId: driverId,
        payload: { distanceM: geofence.distanceM },
        configVersion: cfg.configVersion,
      });
    }
    return { autoArrived: false };
  }

  if (!prevWasIn) {
    await recordLifecycleEvent({
      rideId,
      eventType: 'geofence_enter',
      actorUserId: driverId,
      payload: { distanceM: geofence.distanceM },
      configVersion: cfg.configVersion,
    });
  }

  if ((geofence.dwellSeconds ?? 0) < cfg.autoArrivalMinDwellSeconds) {
    return { autoArrived: false };
  }

  await driverMarkArrived(rideId, driverId);
  await recordLifecycleEvent({
    rideId,
    eventType: 'auto_arrived',
    actorUserId: driverId,
    payload: { distanceM: geofence.distanceM, dwellSeconds: geofence.dwellSeconds },
    configVersion: cfg.configVersion,
  });
  geofenceDwellByRide.delete(rideId);
  return { autoArrived: true };
}

async function buildWaitTimer(
  ride: RideRecord,
  cfg: RideLifecycleProductionConfig,
): Promise<RideLifecycleWaitTimer | null> {
  if (!cfg.waitTimerEnabled || !ride.arrivedAt || ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    return null;
  }
  if (!['DRIVER_ARRIVED', 'IN_PROGRESS'].includes(ride.status)) return null;

  const params = await resolveOperationalParamsForRide(ride);
  const fee = computeArrivalWaitFee(ride, params);
  const elapsedSeconds = Math.max(
    0,
    Math.floor(((ride.startedAt ?? new Date()).getTime() - ride.arrivedAt.getTime()) / 1000),
  );
  const metadata = fee.metadata as {
    waitMinutes?: number;
    includedWaitMinutes?: number;
    billableMinutes?: number;
  };

  return {
    active: ride.status === 'DRIVER_ARRIVED',
    elapsedSeconds,
    includedMinutes: metadata.includedWaitMinutes ?? params.arrivalWaitPolicy.includedWaitMinutes,
    billableMinutes: metadata.billableMinutes ?? 0,
    estimatedFeeCentavos: fee.feeCentavos,
    feeLabel: formatFeeLabel(fee.feeCentavos),
  };
}

export async function getRideLifecycleProduction(
  ride: RideRecord,
  driverCoords?: { lat: number; lng: number },
): Promise<RideLifecycleProductionPayload | null> {
  if (
    !['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(ride.status)
  ) {
    return null;
  }

  const cfg = await getRideLifecycleProductionConfig();
  const verificationPair = await getVerificationStatus(ride.id);
  const verification = verificationPair ?? null;

  let geofence: RideLifecycleGeofence | null = null;
  if (ride.status === 'DRIVER_ASSIGNED' && driverCoords) {
    geofence = evaluatePickupGeofence({
      ride,
      driverLat: driverCoords.lat,
      driverLng: driverCoords.lng,
      cfg,
    });
  }

  const waitTimer = await buildWaitTimer(ride, cfg);

  return {
    verification,
    geofence,
    waitTimer,
    pollIntervalMs: cfg.lifecyclePollIntervalMs,
    configVersion: cfg.configVersion,
  };
}

export function toPublicRideLifecycleProduction(payload: RideLifecycleProductionPayload) {
  return {
    verification: payload.verification,
    geofence: payload.geofence,
    waitTimer: payload.waitTimer,
    pollIntervalMs: payload.pollIntervalMs,
    configVersion: payload.configVersion,
  };
}

export async function getRideLifecycleProductionForRideId(
  rideId: string,
  driverCoords?: { lat: number; lng: number },
) {
  const ride = await getRide(rideId);
  if (!ride) return null;
  return getRideLifecycleProduction(ride, driverCoords);
}

async function resolveDriverCoords(driverId: string): Promise<{ lat: number; lng: number } | undefined> {
  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(driverId);
    if (driver?.lat == null || driver.lng == null) return undefined;
    return { lat: driver.lat, lng: driver.lng };
  }

  const { rows } = await pool.query(`SELECT lat, lng FROM drivers WHERE user_id = $1`, [driverId]);
  const row = rows[0];
  if (!row || row.lat == null || row.lng == null) return undefined;
  return { lat: Number(row.lat), lng: Number(row.lng) };
}

export async function getRideLifecycleProductionWithDriverCoords(ride: RideRecord) {
  const coords = ride.driverId ? await resolveDriverCoords(ride.driverId) : undefined;
  return getRideLifecycleProduction(ride, coords);
}
