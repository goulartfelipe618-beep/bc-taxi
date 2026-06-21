import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import type { RouteSummary } from '../mapbox/types.js';
import type { ActiveRouteState, RouteAlternative, RouteQuoteResult, RouteStrategy } from './types.js';

import type { RouteFareEstimate } from './routePricingService.js';

const memoryRequests = new Map<
  string,
  RouteQuoteResult & { geometry?: RouteSummary['geometry']; fromLat: number; fromLng: number; toLat: number; toLng: number }
>();
const memoryActiveRoutes = new Map<string, ActiveRouteState>();
const memoryRecalcEvents: { rideId: string; reasonCode: string; createdAt: Date }[] = [];

export async function saveRouteQuote(input: {
  userId?: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  waypoints: { lat: number; lng: number }[];
  selectedStrategy: RouteStrategy;
  recommended: RouteAlternative;
  alternatives: RouteAlternative[];
  geometry?: RouteSummary['geometry'];
  categoryCode?: string;
  fareEstimates?: RouteFareEstimate[];
}): Promise<RouteQuoteResult> {
  const requestId = randomUUID();
  const result: RouteQuoteResult = {
    requestId,
    selectedStrategy: input.selectedStrategy,
    recommended: input.recommended,
    alternatives: input.alternatives,
    distanceKm: Math.round((input.recommended.distanceM / 1000) * 100) / 100,
    durationMin: Math.round((input.recommended.etaSeconds / 60) * 10) / 10,
    categoryCode: input.categoryCode,
    fareEstimates: input.fareEstimates,
  };

  if (useMemory()) {
    memoryRequests.set(requestId, {
      ...result,
      geometry: input.geometry,
      fromLat: input.fromLat,
      fromLng: input.fromLng,
      toLat: input.toLat,
      toLng: input.toLng,
    });
    return result;
  }

  await pool.query(
    `INSERT INTO route_requests
       (id, user_id, from_lat, from_lng, to_lat, to_lng, waypoints_json, selected_strategy,
        distance_m, eta_seconds, tolls_total_centavos, traffic_level_index, incident_count,
        deviation_risk_score, route_polyline, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'mapbox')`,
    [
      requestId,
      input.userId ?? null,
      input.fromLat,
      input.fromLng,
      input.toLat,
      input.toLng,
      JSON.stringify(input.waypoints),
      input.selectedStrategy,
      input.recommended.distanceM,
      input.recommended.etaSeconds,
      input.recommended.tollsTotalCentavos,
      input.recommended.trafficLevelIndex,
      input.recommended.incidentCount,
      input.recommended.deviationRiskScore,
      input.geometry ? JSON.stringify(input.geometry) : null,
    ],
  );

  for (const alt of input.alternatives) {
    const fare = input.fareEstimates?.find((f) => f.strategy === alt.strategy);
    await pool.query(
      `INSERT INTO route_alternatives
         (request_id, strategy, distance_m, eta_seconds, tolls_total_centavos, traffic_level_index,
          incident_count, deviation_risk_score, generalized_cost, route_polyline, is_recommended,
          estimated_fare_centavos, traffic_surcharge_centavos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (request_id, strategy) DO UPDATE SET
         distance_m = EXCLUDED.distance_m,
         eta_seconds = EXCLUDED.eta_seconds,
         tolls_total_centavos = EXCLUDED.tolls_total_centavos,
         traffic_level_index = EXCLUDED.traffic_level_index,
         generalized_cost = EXCLUDED.generalized_cost,
         is_recommended = EXCLUDED.is_recommended,
         estimated_fare_centavos = EXCLUDED.estimated_fare_centavos,
         traffic_surcharge_centavos = EXCLUDED.traffic_surcharge_centavos`,
      [
        requestId,
        alt.strategy,
        alt.distanceM,
        alt.etaSeconds,
        alt.tollsTotalCentavos,
        alt.trafficLevelIndex,
        alt.incidentCount,
        alt.deviationRiskScore,
        alt.generalizedCost,
        alt.strategy === input.selectedStrategy && input.geometry ? JSON.stringify(input.geometry) : null,
        alt.isRecommended,
        fare?.passengerFareCentavos ?? null,
        fare?.trafficSurchargeCentavos ?? 0,
      ],
    );
  }

  return result;
}

export async function activateRouteForRide(input: {
  rideId: string;
  requestId?: string;
  strategy: RouteStrategy;
  distanceM: number;
  etaSeconds: number;
  tollsTotalCentavos: number;
  trafficLevelIndex: number;
  geometry?: RouteSummary['geometry'];
  driverLat?: number;
  driverLng?: number;
  deviationM?: number;
  incidentRiskScore?: number;
}): Promise<ActiveRouteState> {
  const id = randomUUID();
  const state: ActiveRouteState = {
    id,
    rideId: input.rideId,
    requestId: input.requestId,
    strategy: input.strategy,
    distanceM: input.distanceM,
    etaSeconds: input.etaSeconds,
    tollsTotalCentavos: input.tollsTotalCentavos,
    trafficLevelIndex: input.trafficLevelIndex,
    routePolyline: input.geometry,
    lastRecalculatedAt: new Date(),
    driverLat: input.driverLat,
    driverLng: input.driverLng,
    deviationM: input.deviationM ?? 0,
    incidentRiskScore: input.incidentRiskScore ?? 0,
    liveMonitorEnabled: true,
  };

  if (useMemory()) {
    memoryActiveRoutes.set(input.rideId, state);
    return state;
  }

  await pool.query(
    `INSERT INTO active_route_states
       (id, ride_id, request_id, strategy, distance_m, eta_seconds, tolls_total_centavos,
        traffic_level_index, route_polyline, driver_lat, driver_lng, deviation_m, incident_risk_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (ride_id) DO UPDATE SET
       request_id = EXCLUDED.request_id,
       strategy = EXCLUDED.strategy,
       distance_m = EXCLUDED.distance_m,
       eta_seconds = EXCLUDED.eta_seconds,
       tolls_total_centavos = EXCLUDED.tolls_total_centavos,
       traffic_level_index = EXCLUDED.traffic_level_index,
       route_polyline = EXCLUDED.route_polyline,
       driver_lat = EXCLUDED.driver_lat,
       driver_lng = EXCLUDED.driver_lng,
       deviation_m = EXCLUDED.deviation_m,
       incident_risk_score = EXCLUDED.incident_risk_score,
       last_recalculated_at = NOW(),
       updated_at = NOW()`,
    [
      id,
      input.rideId,
      input.requestId ?? null,
      input.strategy,
      input.distanceM,
      input.etaSeconds,
      input.tollsTotalCentavos,
      input.trafficLevelIndex,
      input.geometry ? JSON.stringify(input.geometry) : null,
      input.driverLat ?? null,
      input.driverLng ?? null,
      input.deviationM ?? 0,
      input.incidentRiskScore ?? 0,
    ],
  );

  return state;
}

export async function getActiveRoute(rideId: string): Promise<ActiveRouteState | null> {
  if (useMemory()) {
    return memoryActiveRoutes.get(rideId) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT id, ride_id, request_id, strategy, distance_m, eta_seconds, tolls_total_centavos,
            traffic_level_index, route_polyline, last_recalculated_at, driver_lat, driver_lng,
            deviation_m, incident_risk_score, live_monitor_enabled
     FROM active_route_states WHERE ride_id = $1`,
    [rideId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    rideId: row.ride_id as string,
    requestId: row.request_id as string | undefined,
    strategy: row.strategy as RouteStrategy,
    distanceM: row.distance_m as number,
    etaSeconds: row.eta_seconds as number,
    tollsTotalCentavos: row.tolls_total_centavos as number,
    trafficLevelIndex: Number(row.traffic_level_index),
    routePolyline: row.route_polyline as ActiveRouteState['routePolyline'],
    lastRecalculatedAt: new Date(row.last_recalculated_at as string),
    driverLat: row.driver_lat != null ? Number(row.driver_lat) : undefined,
    driverLng: row.driver_lng != null ? Number(row.driver_lng) : undefined,
    deviationM: row.deviation_m != null ? Number(row.deviation_m) : undefined,
    incidentRiskScore: row.incident_risk_score != null ? Number(row.incident_risk_score) : undefined,
    liveMonitorEnabled: row.live_monitor_enabled == null ? true : Boolean(row.live_monitor_enabled),
  };
}

export async function updateActiveRouteDriverPosition(input: {
  rideId: string;
  driverLat: number;
  driverLng: number;
  deviationM: number;
}) {
  if (useMemory()) {
    const state = memoryActiveRoutes.get(input.rideId);
    if (state) {
      memoryActiveRoutes.set(input.rideId, {
        ...state,
        driverLat: input.driverLat,
        driverLng: input.driverLng,
        deviationM: input.deviationM,
      });
    }
    return;
  }

  await pool.query(
    `UPDATE active_route_states
     SET driver_lat = $2, driver_lng = $3, deviation_m = $4, updated_at = NOW()
     WHERE ride_id = $1`,
    [input.rideId, input.driverLat, input.driverLng, input.deviationM],
  );
}

export async function recordLiveSnapshot(input: {
  rideId: string;
  activeRouteId?: string;
  driverLat: number;
  driverLng: number;
  deviationM: number;
  trafficLevelIndex?: number;
  etaSeconds?: number;
}) {
  if (useMemory()) return;

  await pool.query(
    `INSERT INTO route_live_snapshots
       (ride_id, active_route_id, driver_lat, driver_lng, deviation_m, traffic_level_index, eta_seconds)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.rideId,
      input.activeRouteId ?? null,
      input.driverLat,
      input.driverLng,
      input.deviationM,
      input.trafficLevelIndex ?? null,
      input.etaSeconds ?? null,
    ],
  );
}

export async function recordRecalculation(input: {
  rideId: string;
  activeRouteId?: string;
  reasonCode: string;
  reasonLabel?: string;
  previousEtaSeconds: number;
  newEtaSeconds: number;
  deviationM?: number;
  riskDeltaPct?: number;
  metadata?: Record<string, unknown>;
}) {
  if (useMemory()) {
    memoryRecalcEvents.push({ rideId: input.rideId, reasonCode: input.reasonCode, createdAt: new Date() });
    return;
  }

  await pool.query(
    `INSERT INTO route_recalculation_events
       (ride_id, active_route_id, reason_code, reason_label, eta_delta_seconds, previous_eta_seconds,
        new_eta_seconds, deviation_m, risk_delta_pct, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.rideId,
      input.activeRouteId ?? null,
      input.reasonCode,
      input.reasonLabel ?? null,
      input.newEtaSeconds - input.previousEtaSeconds,
      input.previousEtaSeconds,
      input.newEtaSeconds,
      input.deviationM ?? null,
      input.riskDeltaPct ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export function getMemoryRouteQuote(requestId: string) {
  return memoryRequests.get(requestId);
}

export async function getRouteQuote(requestId: string): Promise<
  (RouteQuoteResult & { fromLat: number; fromLng: number; toLat: number; toLng: number }) | null
> {
  if (useMemory()) {
    const m = memoryRequests.get(requestId);
    if (!m) return null;
    return m;
  }

  const { rows } = await pool.query(`SELECT * FROM route_requests WHERE id = $1`, [requestId]);
  if (!rows[0]) return null;
  const req = rows[0];

  const { rows: altRows } = await pool.query(
    `SELECT * FROM route_alternatives WHERE request_id = $1 ORDER BY generalized_cost ASC`,
    [requestId],
  );

  const alternatives: RouteAlternative[] = altRows.map((row) => ({
    strategy: row.strategy as RouteStrategy,
    distanceM: row.distance_m as number,
    etaSeconds: row.eta_seconds as number,
    tollsTotalCentavos: row.tolls_total_centavos as number,
    trafficLevelIndex: Number(row.traffic_level_index),
    incidentCount: row.incident_count as number,
    deviationRiskScore: Number(row.deviation_risk_score),
    generalizedCost: Number(row.generalized_cost),
    isRecommended: Boolean(row.is_recommended),
    estimatedFareCentavos: row.estimated_fare_centavos as number | undefined,
    trafficSurchargeCentavos: row.traffic_surcharge_centavos as number | undefined,
  }));

  const selectedStrategy = req.selected_strategy as RouteStrategy;
  const recommended =
    alternatives.find((a) => a.isRecommended) ??
    alternatives.find((a) => a.strategy === selectedStrategy) ??
    alternatives[0]!;

  return {
    requestId,
    selectedStrategy,
    recommended,
    alternatives,
    distanceKm: Math.round((recommended.distanceM / 1000) * 100) / 100,
    durationMin: Math.round((recommended.etaSeconds / 60) * 10) / 10,
    fromLat: req.from_lat as number,
    fromLng: req.from_lng as number,
    toLat: req.to_lat as number,
    toLng: req.to_lng as number,
  };
}

export async function updateRouteSelection(input: {
  requestId: string;
  strategy: RouteStrategy;
  userId?: string;
  rideId?: string;
  categoryCode?: string;
  previousStrategy?: RouteStrategy;
  estimatedFareCentavos: number;
}) {
  if (useMemory()) {
    const m = memoryRequests.get(input.requestId);
    if (m) {
      m.selectedStrategy = input.strategy;
      const alt = m.alternatives.find((a) => a.strategy === input.strategy);
      if (alt) {
        m.recommended = { ...alt, isRecommended: true };
        m.distanceKm = Math.round((alt.distanceM / 1000) * 100) / 100;
        m.durationMin = Math.round((alt.etaSeconds / 60) * 10) / 10;
      }
    }
    return;
  }

  await pool.query(
    `UPDATE route_requests SET selected_strategy = $2 WHERE id = $1`,
    [input.requestId, input.strategy],
  );

  await pool.query(
    `UPDATE route_alternatives SET is_recommended = (strategy = $2) WHERE request_id = $1`,
    [input.requestId, input.strategy],
  );

  await pool.query(
    `INSERT INTO route_selection_events
       (user_id, request_id, ride_id, strategy, category_code, estimated_fare_centavos, previous_strategy)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.userId ?? null,
      input.requestId,
      input.rideId ?? null,
      input.strategy,
      input.categoryCode ?? null,
      input.estimatedFareCentavos,
      input.previousStrategy ?? null,
    ],
  );
}

export async function getRecalculationEvents(rideId: string) {
  if (useMemory()) {
    return memoryRecalcEvents
      .filter((e) => e.rideId === rideId)
      .map((e) => ({
        rideId: e.rideId,
        reasonCode: e.reasonCode,
        createdAt: e.createdAt.toISOString(),
      }));
  }

  const { rows } = await pool.query(
    `SELECT reason_code, eta_delta_seconds, previous_eta_seconds, new_eta_seconds, created_at
     FROM route_recalculation_events WHERE ride_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [rideId],
  );

  return rows.map((row) => ({
    reasonCode: row.reason_code as string,
    etaDeltaSeconds: row.eta_delta_seconds as number,
    previousEtaSeconds: row.previous_eta_seconds as number,
    newEtaSeconds: row.new_eta_seconds as number,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}
