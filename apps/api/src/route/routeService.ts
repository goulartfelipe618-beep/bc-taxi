import { getDrivingRoute } from '../mapbox/mapboxClient.js';
import type { RouteSummary } from '../mapbox/types.js';
import { deriveStrategyVariant, pickRecommended } from './routeCost.js';
import {
  activateRouteForRide,
  getActiveRoute,
  recordRecalculation,
  saveRouteQuote,
} from './routeStore.js';
import {
  RECALC_ETA_DELTA_SECONDS,
  RECALC_MIN_INTERVAL_MS,
  ROUTE_STRATEGIES,
  type ActiveRouteState,
  type RouteAlternative,
  type RouteQuoteResult,
  type RouteStrategy,
} from './types.js';

function routeToBase(route: RouteSummary) {
  const distanceM = Math.round((route.distanceKm ?? 0) * 1000);
  const etaSeconds = Math.round((route.durationMin ?? 0) * 60);
  return { distanceM, etaSeconds, tollsCentavos: 0 };
}

function withGeometry(
  variant: Omit<RouteAlternative, 'geometry' | 'isRecommended'>,
  geometry: RouteSummary['geometry'] | undefined,
  isRecommended: boolean,
): RouteAlternative {
  return { ...variant, geometry, isRecommended };
}

export async function quoteRoutes(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  waypoints?: { lat: number; lng: number }[];
  userId?: string;
  preferredStrategy?: RouteStrategy;
}): Promise<RouteQuoteResult> {
  const waypoints = input.waypoints ?? [];
  const mapboxRoute = await getDrivingRoute(
    input.fromLat,
    input.fromLng,
    input.toLat,
    input.toLng,
    waypoints,
  );

  const base = routeToBase(mapboxRoute);
  const alternatives = ROUTE_STRATEGIES.map((strategy) => {
    const variant = deriveStrategyVariant(base, strategy);
    return withGeometry(variant, mapboxRoute.geometry, false);
  });

  const recommended = pickRecommended(alternatives);
  for (const alt of alternatives) {
    alt.isRecommended = alt.strategy === recommended.strategy;
  }

  const selectedStrategy = input.preferredStrategy ?? recommended.strategy;
  const selected =
    alternatives.find((a) => a.strategy === selectedStrategy) ?? recommended;

  return saveRouteQuote({
    userId: input.userId,
    fromLat: input.fromLat,
    fromLng: input.fromLng,
    toLat: input.toLat,
    toLng: input.toLng,
    waypoints,
    selectedStrategy: selected.strategy,
    recommended: { ...selected, isRecommended: true },
    alternatives,
    geometry: mapboxRoute.geometry,
  });
}

export async function bindRouteToRide(input: {
  rideId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  waypoints?: { lat: number; lng: number }[];
  userId?: string;
}): Promise<{ quote: RouteQuoteResult; active: ActiveRouteState }> {
  const quote = await quoteRoutes(input);
  const active = await activateRouteForRide({
    rideId: input.rideId,
    requestId: quote.requestId,
    strategy: quote.selectedStrategy,
    distanceM: quote.recommended.distanceM,
    etaSeconds: quote.recommended.etaSeconds,
    tollsTotalCentavos: quote.recommended.tollsTotalCentavos,
    trafficLevelIndex: quote.recommended.trafficLevelIndex,
    geometry: quote.recommended.geometry,
  });
  return { quote, active };
}

export async function recalculateActiveRoute(input: {
  rideId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  reasonCode: string;
}): Promise<ActiveRouteState | null> {
  const current = await getActiveRoute(input.rideId);
  if (!current) return null;

  if (Date.now() - current.lastRecalculatedAt.getTime() < RECALC_MIN_INTERVAL_MS) {
    return current;
  }

  const mapboxRoute = await getDrivingRoute(input.fromLat, input.fromLng, input.toLat, input.toLng);
  const base = routeToBase(mapboxRoute);
  const variant = deriveStrategyVariant(base, current.strategy);
  const etaDelta = Math.abs(variant.etaSeconds - current.etaSeconds);

  if (etaDelta < RECALC_ETA_DELTA_SECONDS) {
    return current;
  }

  const updated = await activateRouteForRide({
    rideId: input.rideId,
    requestId: current.requestId,
    strategy: current.strategy,
    distanceM: variant.distanceM,
    etaSeconds: variant.etaSeconds,
    tollsTotalCentavos: variant.tollsTotalCentavos,
    trafficLevelIndex: variant.trafficLevelIndex,
    geometry: mapboxRoute.geometry,
  });

  await recordRecalculation({
    rideId: input.rideId,
    activeRouteId: updated.id,
    reasonCode: input.reasonCode,
    previousEtaSeconds: current.etaSeconds,
    newEtaSeconds: updated.etaSeconds,
    metadata: { etaDeltaSeconds: etaDelta },
  });

  return updated;
}

export function toPublicRouteQuote(quote: RouteQuoteResult) {
  return {
    requestId: quote.requestId,
    selectedStrategy: quote.selectedStrategy,
    distanceKm: quote.distanceKm,
    durationMin: quote.durationMin,
    recommended: toPublicAlternative(quote.recommended),
    alternatives: quote.alternatives.map(toPublicAlternative),
  };
}

export function toPublicAlternative(alt: RouteAlternative) {
  return {
    strategy: alt.strategy,
    distanceM: alt.distanceM,
    etaSeconds: alt.etaSeconds,
    tollsTotalCentavos: alt.tollsTotalCentavos,
    trafficLevelIndex: alt.trafficLevelIndex,
    incidentCount: alt.incidentCount,
    deviationRiskScore: alt.deviationRiskScore,
    generalizedCost: alt.generalizedCost,
    isRecommended: alt.isRecommended,
    geometry: alt.geometry,
  };
}

export { getActiveRoute } from './routeStore.js';

export function toPublicActiveRoute(state: ActiveRouteState) {
  return {
    rideId: state.rideId,
    strategy: state.strategy,
    distanceM: state.distanceM,
    etaSeconds: state.etaSeconds,
    tollsTotalCentavos: state.tollsTotalCentavos,
    trafficLevelIndex: state.trafficLevelIndex,
    routePolyline: state.routePolyline,
    lastRecalculatedAt: state.lastRecalculatedAt.toISOString(),
  };
}
