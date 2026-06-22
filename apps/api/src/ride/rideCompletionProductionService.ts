import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { computeArrivalWaitFee, resolveOperationalParamsForRide } from '../config/policyEnforcementService.js';
import { formatFare } from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';
import { pool } from '../db.js';
import type { RideRecord } from '../match/types.js';
import { getRideReceipt, toPublicReceipt } from '../receipts/receiptService.js';
import { estimateFareForAlternative } from '../route/routePricingService.js';
import { getActiveRoute } from '../route/routeStore.js';
import { listPendingObligationsForUser } from '../reviews/obligationStore.js';

export interface RideCompletionProductionConfig {
  useActualRouteFare: boolean;
  fareBlendWeightBps: number;
  minTripDurationSeconds: number;
  receiptEnabled: boolean;
  reviewObligationsEnabled: boolean;
  completionPollIntervalMs: number;
  configVersion: string;
}

export interface ProductionCompletionFare {
  baseFareCentavos: number;
  waitFeeCentavos: number;
  totalCentavos: number;
  fareSource: 'estimated' | 'actual_route' | 'blended';
  routeDistanceM: number | null;
  routeDurationS: number | null;
  tripDurationS: number | null;
  configVersion: string;
}

export interface RideCompletionProductionPayload {
  fare: {
    baseFareCentavos: number;
    waitFeeCentavos: number;
    totalCentavos: number;
    totalLabel: string;
    fareSource: string;
    routeDistanceM: number | null;
    routeDurationS: number | null;
    tripDurationS: number | null;
  };
  receipt: ReturnType<typeof toPublicReceipt> | null;
  reviewPending: boolean;
  reviewExpiresAt: string | null;
  pollIntervalMs: number;
  configVersion: string;
}

const memoryConfig: RideCompletionProductionConfig = {
  useActualRouteFare: true,
  fareBlendWeightBps: 7000,
  minTripDurationSeconds: 60,
  receiptEnabled: true,
  reviewObligationsEnabled: true,
  completionPollIntervalMs: 5000,
  configVersion: 'camada47-memory-v1',
};

const memorySnapshots = new Map<string, ProductionCompletionFare & { receiptId?: string }>();

export async function getRideCompletionProductionConfig(): Promise<RideCompletionProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM ride_completion_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada47-v1' };
  return {
    useActualRouteFare: Boolean(r.use_actual_route_fare),
    fareBlendWeightBps: Number(r.fare_blend_weight_bps),
    minTripDurationSeconds: Number(r.min_trip_duration_seconds),
    receiptEnabled: Boolean(r.receipt_enabled),
    reviewObligationsEnabled: Boolean(r.review_obligations_enabled),
    completionPollIntervalMs: Number(r.completion_poll_interval_ms),
    configVersion: r.config_version as string,
  };
}

export function seedMemoryRideCompletionProductionConfig(
  patch: Partial<RideCompletionProductionConfig> = {},
): RideCompletionProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}

export function __testResetRideCompletionProductionMemory() {
  memorySnapshots.clear();
  Object.assign(memoryConfig, {
    useActualRouteFare: true,
    fareBlendWeightBps: 7000,
    minTripDurationSeconds: 60,
    receiptEnabled: true,
    reviewObligationsEnabled: true,
    completionPollIntervalMs: 5000,
    configVersion: 'camada47-memory-v1',
  });
}

export function __testGetCompletionSnapshots() {
  return [...memorySnapshots.entries()].map(([rideId, snap]) => ({ rideId, ...snap }));
}

function computeTripDurationSeconds(ride: RideRecord): number | null {
  if (!ride.startedAt) return null;
  const end = ride.completedAt ?? new Date();
  return Math.max(0, Math.floor((end.getTime() - ride.startedAt.getTime()) / 1000));
}

function blendFare(estimated: number, actual: number, weightBps: number): number {
  const weight = weightBps / 10_000;
  return Math.round(estimated * (1 - weight) + actual * weight);
}

export async function resolveProductionCompletionFare(ride: RideRecord): Promise<ProductionCompletionFare> {
  const cfg = await getRideCompletionProductionConfig();
  const params = await resolveOperationalParamsForRide(ride);
  const waitFee = computeArrivalWaitFee(ride, params);
  const estimated = ride.estimatedFareCentavos ?? 0;
  const tripDurationS = computeTripDurationSeconds(ride);

  let baseFareCentavos = estimated;
  let fareSource: ProductionCompletionFare['fareSource'] = 'estimated';
  let routeDistanceM: number | null = null;
  let routeDurationS: number | null = null;

  const activeRoute = await getActiveRoute(ride.id);
  if (
    cfg.useActualRouteFare &&
    activeRoute &&
    tripDurationS != null &&
    tripDurationS >= cfg.minTripDurationSeconds
  ) {
    routeDistanceM = activeRoute.distanceM;
    routeDurationS = activeRoute.etaSeconds;
    const routeFare = await estimateFareForAlternative(
      ride.categoryCode as RideCategoryCode,
      {
        strategy: activeRoute.strategy,
        distanceM: activeRoute.distanceM,
        etaSeconds: activeRoute.etaSeconds,
        tollsTotalCentavos: activeRoute.tollsTotalCentavos ?? 0,
        trafficLevelIndex: activeRoute.trafficLevelIndex ?? 0,
      },
      {
        fromLat: ride.pickupLat,
        fromLng: ride.pickupLng,
        toLat: ride.dropoffLat,
        toLng: ride.dropoffLng,
      },
    );

    const actualFare = routeFare.passengerFareCentavos;
    const delta = Math.abs(actualFare - estimated);
    const threshold = Math.max(200, Math.round(estimated * 0.08));

    if (delta <= threshold) {
      baseFareCentavos = blendFare(estimated, actualFare, cfg.fareBlendWeightBps);
      fareSource = 'blended';
    } else {
      baseFareCentavos = actualFare;
      fareSource = 'actual_route';
    }
  }

  return {
    baseFareCentavos,
    waitFeeCentavos: waitFee.feeCentavos,
    totalCentavos: baseFareCentavos + waitFee.feeCentavos,
    fareSource,
    routeDistanceM,
    routeDurationS,
    tripDurationS,
    configVersion: cfg.configVersion,
  };
}

export async function recordProductionCompletionSnapshot(
  ride: RideRecord,
  fare: ProductionCompletionFare,
  receiptId?: string,
) {
  if (config.useMemoryDb) {
    memorySnapshots.set(ride.id, { ...fare, receiptId });
    return;
  }

  await pool.query(
    `INSERT INTO ride_completion_snapshots (
      ride_id, base_fare_centavos, wait_fee_centavos, total_fare_centavos,
      fare_source, route_distance_m, route_duration_s, trip_duration_s, receipt_id, config_version
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (ride_id) DO UPDATE SET
      base_fare_centavos = EXCLUDED.base_fare_centavos,
      wait_fee_centavos = EXCLUDED.wait_fee_centavos,
      total_fare_centavos = EXCLUDED.total_fare_centavos,
      fare_source = EXCLUDED.fare_source,
      route_distance_m = EXCLUDED.route_distance_m,
      route_duration_s = EXCLUDED.route_duration_s,
      trip_duration_s = EXCLUDED.trip_duration_s,
      receipt_id = EXCLUDED.receipt_id,
      config_version = EXCLUDED.config_version`,
    [
      ride.id,
      fare.baseFareCentavos,
      fare.waitFeeCentavos,
      fare.totalCentavos,
      fare.fareSource,
      fare.routeDistanceM,
      fare.routeDurationS,
      fare.tripDurationS,
      receiptId ?? null,
      fare.configVersion,
    ],
  );
}

async function loadCompletionSnapshot(rideId: string): Promise<ProductionCompletionFare | null> {
  if (config.useMemoryDb) {
    const snap = memorySnapshots.get(rideId);
    if (!snap) return null;
    const { receiptId: _r, ...fare } = snap;
    return fare;
  }

  const { rows } = await pool.query(`SELECT * FROM ride_completion_snapshots WHERE ride_id = $1`, [rideId]);
  const r = rows[0];
  if (!r) return null;
  return {
    baseFareCentavos: Number(r.base_fare_centavos),
    waitFeeCentavos: Number(r.wait_fee_centavos),
    totalCentavos: Number(r.total_fare_centavos),
    fareSource: r.fare_source as ProductionCompletionFare['fareSource'],
    routeDistanceM: r.route_distance_m != null ? Number(r.route_distance_m) : null,
    routeDurationS: r.route_duration_s != null ? Number(r.route_duration_s) : null,
    tripDurationS: r.trip_duration_s != null ? Number(r.trip_duration_s) : null,
    configVersion: r.config_version as string,
  };
}

export async function getRideCompletionProduction(
  ride: RideRecord,
  viewerUserId: string,
): Promise<RideCompletionProductionPayload | null> {
  if (ride.status !== 'COMPLETED') return null;

  const cfg = await getRideCompletionProductionConfig();
  const fare = (await loadCompletionSnapshot(ride.id)) ?? (await resolveProductionCompletionFare(ride));

  const receiptRecord = cfg.receiptEnabled ? await getRideReceipt(ride.id, ride.passengerId) : null;
  const receipt = receiptRecord ? toPublicReceipt(receiptRecord) : null;

  let reviewPending = false;
  let reviewExpiresAt: string | null = null;
  if (cfg.reviewObligationsEnabled) {
    const obligations = await listPendingObligationsForUser(viewerUserId);
    const mine = obligations.find((o) => o.rideId === ride.id);
    if (mine) {
      reviewPending = true;
      reviewExpiresAt = mine.expiresAt.toISOString();
    }
  }

  return {
    fare: {
      baseFareCentavos: fare.baseFareCentavos,
      waitFeeCentavos: fare.waitFeeCentavos,
      totalCentavos: fare.totalCentavos,
      totalLabel: formatFare(fare.totalCentavos),
      fareSource: fare.fareSource,
      routeDistanceM: fare.routeDistanceM,
      routeDurationS: fare.routeDurationS,
      tripDurationS: fare.tripDurationS,
    },
    receipt,
    reviewPending,
    reviewExpiresAt,
    pollIntervalMs: cfg.completionPollIntervalMs,
    configVersion: fare.configVersion,
  };
}

export function toPublicRideCompletionProduction(payload: RideCompletionProductionPayload) {
  return payload;
}

export async function shouldOpenReviewObligationsOnComplete(): Promise<boolean> {
  const cfg = await getRideCompletionProductionConfig();
  return cfg.reviewObligationsEnabled;
}

export async function shouldIssueReceiptOnComplete(): Promise<boolean> {
  const cfg = await getRideCompletionProductionConfig();
  return cfg.receiptEnabled;
}
