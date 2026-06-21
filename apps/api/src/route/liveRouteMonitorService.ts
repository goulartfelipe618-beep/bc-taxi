import { getRide } from '../match/matchService.js';
import { computeRouteDeviationM } from './routeGeoUtils.js';
import { detectRecalcReason } from './routeRecalcPolicy.js';
import {
  getActiveRoute,
  recordLiveSnapshot,
  updateActiveRouteDriverPosition,
} from './routeStore.js';
import { recalculateActiveRoute, toPublicActiveRoute } from './routeService.js';
import { emitEvent } from '../realtime/eventBus.js';
import type { RouteRecalcReasonCode, RouteRecalculateOutcome } from './types.js';
import { ROUTE_RECALC_REASON_LABELS } from './routeRecalcPolicy.js';

export async function processLiveRouteOnLocationUpdate(input: {
  driverId: string;
  lat: number;
  lng: number;
  rideId?: string;
}) {
  const { resolveDriverActiveRideId } = await import('../ride/rideTrackingService.js');
  const rideId = input.rideId ?? (await resolveDriverActiveRideId(input.driverId));
  if (!rideId) return null;

  const ride = await getRide(rideId);
  if (!ride || ride.driverId !== input.driverId || ride.status !== 'IN_PROGRESS') return null;

  const active = await getActiveRoute(rideId);
  if (!active || active.liveMonitorEnabled === false) return null;

  const deviationM = computeRouteDeviationM(input.lat, input.lng, active.routePolyline);
  await updateActiveRouteDriverPosition({
    rideId,
    driverLat: input.lat,
    driverLng: input.lng,
    deviationM,
  });
  await recordLiveSnapshot({
    rideId,
    activeRouteId: active.id,
    driverLat: input.lat,
    driverLng: input.lng,
    deviationM,
    trafficLevelIndex: active.trafficLevelIndex,
    etaSeconds: active.etaSeconds,
  });

  const preview = await recalculateActiveRoute({
    rideId,
    fromLat: input.lat,
    fromLng: input.lng,
    toLat: ride.dropoffLat,
    toLng: ride.dropoffLng,
    reasonCode: 'TRAFFIC_UPDATE',
    dryRun: true,
    deviationM,
  });

  const reasonCode: RouteRecalcReasonCode | null =
    deviationM >= 250
      ? 'DRIVER_DEVIATION'
      : detectRecalcReason({
          deviationM,
          currentTrafficIndex: active.trafficLevelIndex,
          candidateTrafficIndex: preview.candidateTrafficIndex ?? active.trafficLevelIndex,
          currentEtaSeconds: active.etaSeconds,
          candidateEtaSeconds: preview.candidateEtaSeconds ?? active.etaSeconds,
        });

  if (!reasonCode) {
    return { monitored: true, recalculated: false, deviationM };
  }

  const outcome = await recalculateActiveRoute({
    rideId,
    fromLat: input.lat,
    fromLng: input.lng,
    toLat: ride.dropoffLat,
    toLng: ride.dropoffLng,
    reasonCode,
    deviationM,
  });

  if (outcome.applied) {
    await emitRouteRecalculatedEvent(rideId, ride.passengerId, ride.driverId!, outcome);
    void import('../observability/traceService.js').then(({ recordTraceSpan, generateTraceId }) =>
      recordTraceSpan({
        traceId: generateTraceId(),
        rideId,
        spanName: 'route_recalculated',
        component: 'route',
        metadata: { reasonCode: outcome.reasonCode, etaSeconds: outcome.state.etaSeconds },
      }),
    );
  }

  return {
    monitored: true,
    recalculated: outcome.applied,
    deviationM,
    reasonCode: outcome.reasonCode,
  };
}

export async function emitRouteRecalculatedEvent(
  rideId: string,
  passengerId: string,
  driverId: string,
  outcome: RouteRecalculateOutcome,
) {
  if (!outcome.applied) return;

  await emitEvent(
    'ROUTE_RECALCULATED',
    'ride',
    rideId,
    {
      reasonCode: outcome.reasonCode,
      reasonLabel: outcome.reasonLabel,
      etaSeconds: outcome.state.etaSeconds,
      etaDeltaSeconds: outcome.etaDeltaSeconds,
      riskDeltaPct: outcome.riskDeltaPct,
      deviationM: outcome.deviationM,
      route: toPublicActiveRoute(outcome.state),
    },
    { rideId, userIds: [passengerId], driverId },
  );
}

export async function pollActiveRideRoutes(): Promise<number> {
  const { pool } = await import('../db.js');
  const { useMemory } = await import('../stores/memoryMatchStore.js');
  if (useMemory()) return 0;

  const { rows } = await pool.query(
    `SELECT r.id AS ride_id, r.driver_id, d.lat, d.lng
     FROM rides r
     JOIN drivers d ON d.user_id = r.driver_id
     JOIN active_route_states ars ON ars.ride_id = r.id
     WHERE r.status = 'IN_PROGRESS'
       AND ars.live_monitor_enabled = TRUE
       AND d.lat IS NOT NULL
       AND d.lng IS NOT NULL`,
  );

  let recalculated = 0;
  for (const row of rows) {
    const result = await processLiveRouteOnLocationUpdate({
      driverId: row.driver_id as string,
      lat: Number(row.lat),
      lng: Number(row.lng),
      rideId: row.ride_id as string,
    });
    if (result?.recalculated) recalculated += 1;
  }
  return recalculated;
}

export function startLiveRouteMonitor() {
  return setInterval(() => {
    void pollActiveRideRoutes();
  }, 60_000);
}

export { computeRouteDeviationM, ROUTE_RECALC_REASON_LABELS };
