import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import type { RouteSummary } from '../mapbox/types.js';
import type { ActiveRouteState, RouteAlternative, RouteQuoteResult, RouteStrategy } from './types.js';

const memoryRequests = new Map<string, RouteQuoteResult & { geometry?: RouteSummary['geometry'] }>();
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
}): Promise<RouteQuoteResult> {
  const requestId = randomUUID();
  const result: RouteQuoteResult = {
    requestId,
    selectedStrategy: input.selectedStrategy,
    recommended: input.recommended,
    alternatives: input.alternatives,
    distanceKm: Math.round((input.recommended.distanceM / 1000) * 100) / 100,
    durationMin: Math.round((input.recommended.etaSeconds / 60) * 10) / 10,
  };

  if (useMemory()) {
    memoryRequests.set(requestId, { ...result, geometry: input.geometry });
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
    await pool.query(
      `INSERT INTO route_alternatives
         (request_id, strategy, distance_m, eta_seconds, tolls_total_centavos, traffic_level_index,
          incident_count, deviation_risk_score, generalized_cost, route_polyline, is_recommended)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (request_id, strategy) DO NOTHING`,
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
  };

  if (useMemory()) {
    memoryActiveRoutes.set(input.rideId, state);
    return state;
  }

  await pool.query(
    `INSERT INTO active_route_states
       (id, ride_id, request_id, strategy, distance_m, eta_seconds, tolls_total_centavos,
        traffic_level_index, route_polyline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (ride_id) DO UPDATE SET
       request_id = EXCLUDED.request_id,
       strategy = EXCLUDED.strategy,
       distance_m = EXCLUDED.distance_m,
       eta_seconds = EXCLUDED.eta_seconds,
       tolls_total_centavos = EXCLUDED.tolls_total_centavos,
       traffic_level_index = EXCLUDED.traffic_level_index,
       route_polyline = EXCLUDED.route_polyline,
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
            traffic_level_index, route_polyline, last_recalculated_at
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
  };
}

export async function recordRecalculation(input: {
  rideId: string;
  activeRouteId?: string;
  reasonCode: string;
  previousEtaSeconds: number;
  newEtaSeconds: number;
  metadata?: Record<string, unknown>;
}) {
  if (useMemory()) {
    memoryRecalcEvents.push({ rideId: input.rideId, reasonCode: input.reasonCode, createdAt: new Date() });
    return;
  }

  await pool.query(
    `INSERT INTO route_recalculation_events
       (ride_id, active_route_id, reason_code, eta_delta_seconds, previous_eta_seconds, new_eta_seconds, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.rideId,
      input.activeRouteId ?? null,
      input.reasonCode,
      input.newEtaSeconds - input.previousEtaSeconds,
      input.previousEtaSeconds,
      input.newEtaSeconds,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export function getMemoryRouteQuote(requestId: string) {
  return memoryRequests.get(requestId);
}
