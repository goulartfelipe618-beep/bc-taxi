import { getDrivingRoute } from '../mapbox/mapboxClient.js';
import { randomUUID } from 'node:crypto';
import type { RouteSummary } from '../mapbox/types.js';
import { deriveStrategyVariant, pickRecommended } from './routeCost.js';
import {
  activateRouteForRide,
  getActiveRoute,
  getRecalculationEvents,
  getRouteQuote,
  recordRecalculation,
  saveRouteQuote,
  updateRouteSelection,
} from './routeStore.js';
import { estimateFaresForAlternatives, type RouteFareEstimate } from './routePricingService.js';
import type { RideCategoryCode } from '../domain/types.js';
import {
  RECALC_ETA_DELTA_SECONDS,
  RECALC_MIN_INTERVAL_MS,
  ROUTE_STRATEGIES,
  type ActiveRouteState,
  type RouteAlternative,
  type RouteQuoteResult,
  type RouteRecalcReasonCode,
  type RouteRecalculateOutcome,
  type RouteStrategy,
} from './types.js';
import { computeIncidentRiskScore, ROUTE_RECALC_REASON_LABELS, shouldReplaceRoute } from './routeRecalcPolicy.js';

export const ROUTE_STRATEGY_META: Record<
  RouteStrategy,
  { label: string; description: string; icon: string }
> = {
  fastest: {
    label: 'Mais rápida',
    description: 'Menor tempo com trânsito estimado',
    icon: 'bolt',
  },
  shortest: {
    label: 'Mais curta',
    description: 'Menor distância total',
    icon: 'straight',
  },
  economical: {
    label: 'Econômica',
    description: 'Menor custo com pedágios reduzidos',
    icon: 'savings',
  },
  less_traffic: {
    label: 'Menos trânsito',
    description: 'Evita congestionamentos',
    icon: 'traffic',
  },
};

function attachFaresToAlternatives(
  alternatives: RouteAlternative[],
  fares: RouteFareEstimate[],
): RouteAlternative[] {
  return alternatives.map((alt) => {
    const fare = fares.find((f) => f.strategy === alt.strategy);
    return {
      ...alt,
      estimatedFareCentavos: fare?.passengerFareCentavos,
      trafficSurchargeCentavos: fare?.trafficSurchargeCentavos,
      passengerFareLabel: fare?.passengerFareLabel,
    };
  });
}

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
  persist?: boolean;
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

  const draft: RouteQuoteResult = {
    requestId: randomUUID(),
    selectedStrategy: selected.strategy,
    recommended: { ...selected, isRecommended: true },
    alternatives,
    distanceKm: Math.round((selected.distanceM / 1000) * 100) / 100,
    durationMin: Math.round((selected.etaSeconds / 60) * 10) / 10,
  };

  if (input.persist === false) return draft;

  return saveRouteQuote({
    userId: input.userId,
    fromLat: input.fromLat,
    fromLng: input.fromLng,
    toLat: input.toLat,
    toLng: input.toLng,
    waypoints,
    selectedStrategy: draft.selectedStrategy,
    recommended: draft.recommended,
    alternatives: draft.alternatives,
    geometry: mapboxRoute.geometry,
  });
}

export async function quoteRoutesWithFares(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  waypoints?: { lat: number; lng: number }[];
  userId?: string;
  preferredStrategy?: RouteStrategy;
  categoryCode?: RideCategoryCode;
}): Promise<RouteQuoteResult> {
  const quote = await quoteRoutes({ ...input, persist: false });
  if (!input.categoryCode) {
    return saveRouteQuote({
      userId: input.userId,
      fromLat: input.fromLat,
      fromLng: input.fromLng,
      toLat: input.toLat,
      toLng: input.toLng,
      waypoints: input.waypoints ?? [],
      selectedStrategy: quote.selectedStrategy,
      recommended: quote.recommended,
      alternatives: quote.alternatives,
      geometry: quote.recommended.geometry,
    });
  }

  const fares = await estimateFaresForAlternatives(input.categoryCode, quote.alternatives, {
    fromLat: input.fromLat,
    fromLng: input.fromLng,
    toLat: input.toLat,
    toLng: input.toLng,
  });

  const enriched = attachFaresToAlternatives(quote.alternatives, fares);
  const recommended = enriched.find((a) => a.strategy === quote.recommended.strategy) ?? enriched[0]!;
  const selected =
    enriched.find((a) => a.strategy === quote.selectedStrategy) ?? recommended;

  return saveRouteQuote({
    userId: input.userId,
    fromLat: input.fromLat,
    fromLng: input.fromLng,
    toLat: input.toLat,
    toLng: input.toLng,
    waypoints: input.waypoints ?? [],
    selectedStrategy: selected.strategy,
    recommended: { ...selected, isRecommended: true },
    alternatives: enriched.map((a) => ({
      ...a,
      isRecommended: a.strategy === selected.strategy,
    })),
    geometry: selected.geometry,
    categoryCode: input.categoryCode,
    fareEstimates: fares,
  });
}

export async function selectRouteStrategy(input: {
  requestId: string;
  strategy: RouteStrategy;
  userId?: string;
  rideId?: string;
  categoryCode?: RideCategoryCode;
}): Promise<RouteQuoteResult | null> {
  const existing = await getRouteQuote(input.requestId);
  if (!existing) return null;

  const alt = existing.alternatives.find((a) => a.strategy === input.strategy);
  if (!alt) return null;

  let fareCentavos = alt.estimatedFareCentavos;
  if (fareCentavos == null && input.categoryCode) {
    const { estimateFareForAlternative } = await import('./routePricingService.js');
    const fare = await estimateFareForAlternative(input.categoryCode, alt, {
      fromLat: existing.fromLat,
      fromLng: existing.fromLng,
      toLat: existing.toLat,
      toLng: existing.toLng,
    });
    fareCentavos = fare.passengerFareCentavos;
  }

  await updateRouteSelection({
    requestId: input.requestId,
    strategy: input.strategy,
    userId: input.userId,
    rideId: input.rideId,
    categoryCode: input.categoryCode,
    previousStrategy: existing.selectedStrategy,
    estimatedFareCentavos: fareCentavos ?? 0,
  });

  return getRouteQuote(input.requestId);
}

export async function bindRouteToRide(input: {
  rideId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  waypoints?: { lat: number; lng: number }[];
  userId?: string;
  strategy?: RouteStrategy;
  requestId?: string;
}): Promise<{ quote: RouteQuoteResult; active: ActiveRouteState }> {
  const quote = input.requestId
    ? (await getRouteQuote(input.requestId)) ?? (await quoteRoutes(input))
    : await quoteRoutes(input);

  const strategy = input.strategy ?? quote.selectedStrategy;
  const alt = quote.alternatives.find((a) => a.strategy === strategy) ?? quote.recommended;

  const active = await activateRouteForRide({
    rideId: input.rideId,
    requestId: quote.requestId,
    strategy: alt.strategy,
    distanceM: alt.distanceM,
    etaSeconds: alt.etaSeconds,
    tollsTotalCentavos: alt.tollsTotalCentavos,
    trafficLevelIndex: alt.trafficLevelIndex,
    geometry: alt.geometry,
  });
  return { quote: { ...quote, selectedStrategy: alt.strategy, recommended: alt }, active };
}

export async function recalculateActiveRoute(input: {
  rideId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  reasonCode: RouteRecalcReasonCode;
  dryRun?: boolean;
  deviationM?: number;
}): Promise<RouteRecalculateOutcome> {
  const current = await getActiveRoute(input.rideId);
  if (!current) {
    return {
      state: {
        id: '',
        rideId: input.rideId,
        strategy: 'fastest',
        distanceM: 0,
        etaSeconds: 0,
        tollsTotalCentavos: 0,
        trafficLevelIndex: 0,
        lastRecalculatedAt: new Date(),
      },
      applied: false,
      skippedReason: 'NO_ROUTE',
    };
  }

  if (
    !input.dryRun &&
    input.reasonCode !== 'MANUAL' &&
    Date.now() - current.lastRecalculatedAt.getTime() < RECALC_MIN_INTERVAL_MS
  ) {
    return { state: current, applied: false, skippedReason: 'THROTTLED' };
  }

  const mapboxRoute = await getDrivingRoute(input.fromLat, input.fromLng, input.toLat, input.toLng);
  const base = routeToBase(mapboxRoute);
  const variant = deriveStrategyVariant(base, current.strategy);
  const currentRisk = current.incidentRiskScore ?? computeIncidentRiskScore(current.trafficLevelIndex, 0);
  const candidateRisk = computeIncidentRiskScore(variant.trafficLevelIndex, variant.incidentCount);
  const etaDelta = Math.abs(variant.etaSeconds - current.etaSeconds);
  const riskDeltaPct = currentRisk > 0 ? (currentRisk - candidateRisk) / currentRisk : 0;

  const replace = shouldReplaceRoute({
    currentEtaSeconds: current.etaSeconds,
    candidateEtaSeconds: variant.etaSeconds,
    currentRiskScore: currentRisk,
    candidateRiskScore: candidateRisk,
    reasonCode: input.reasonCode,
  });

  if (!replace) {
    return {
      state: current,
      applied: false,
      skippedReason: 'INSUFFICIENT_DELTA',
      reasonCode: input.reasonCode,
      etaDeltaSeconds: etaDelta,
      riskDeltaPct,
      deviationM: input.deviationM,
      candidateEtaSeconds: variant.etaSeconds,
      candidateTrafficIndex: variant.trafficLevelIndex,
    };
  }

  if (input.dryRun) {
    return {
      state: current,
      applied: false,
      reasonCode: input.reasonCode,
      etaDeltaSeconds: etaDelta,
      riskDeltaPct,
      deviationM: input.deviationM,
      candidateEtaSeconds: variant.etaSeconds,
      candidateTrafficIndex: variant.trafficLevelIndex,
    };
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
    driverLat: input.fromLat,
    driverLng: input.fromLng,
    deviationM: input.deviationM ?? current.deviationM,
    incidentRiskScore: candidateRisk,
  });

  await recordRecalculation({
    rideId: input.rideId,
    activeRouteId: updated.id,
    reasonCode: input.reasonCode,
    reasonLabel: ROUTE_RECALC_REASON_LABELS[input.reasonCode],
    previousEtaSeconds: current.etaSeconds,
    newEtaSeconds: updated.etaSeconds,
    deviationM: input.deviationM,
    riskDeltaPct,
    metadata: { etaDeltaSeconds: etaDelta },
  });

  return {
    state: updated,
    applied: true,
    reasonCode: input.reasonCode,
    reasonLabel: ROUTE_RECALC_REASON_LABELS[input.reasonCode],
    etaDeltaSeconds: etaDelta,
    riskDeltaPct,
    deviationM: input.deviationM,
  };
}

export function toPublicRouteQuote(quote: RouteQuoteResult) {
  return {
    requestId: quote.requestId,
    selectedStrategy: quote.selectedStrategy,
    categoryCode: quote.categoryCode,
    distanceKm: quote.distanceKm,
    durationMin: quote.durationMin,
    recommended: toPublicAlternative(quote.recommended),
    alternatives: quote.alternatives.map(toPublicAlternative),
    strategies: ROUTE_STRATEGIES.map((s) => ({
      strategy: s,
      ...ROUTE_STRATEGY_META[s],
    })),
  };
}

export function toPublicAlternative(alt: RouteAlternative) {
  const meta = ROUTE_STRATEGY_META[alt.strategy];
  return {
    strategy: alt.strategy,
    label: meta.label,
    description: meta.description,
    icon: meta.icon,
    distanceM: alt.distanceM,
    distanceKm: Math.round((alt.distanceM / 1000) * 10) / 10,
    etaSeconds: alt.etaSeconds,
    etaMinutes: Math.round(alt.etaSeconds / 60),
    tollsTotalCentavos: alt.tollsTotalCentavos,
    trafficLevelIndex: alt.trafficLevelIndex,
    incidentCount: alt.incidentCount,
    deviationRiskScore: alt.deviationRiskScore,
    generalizedCost: alt.generalizedCost,
    isRecommended: alt.isRecommended,
    estimatedFareCentavos: alt.estimatedFareCentavos,
    passengerFareLabel: alt.passengerFareLabel,
    trafficSurchargeCentavos: alt.trafficSurchargeCentavos,
    geometry: alt.geometry,
  };
}

export { getActiveRoute, getRecalculationEvents } from './routeStore.js';

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
    driverLat: state.driverLat,
    driverLng: state.driverLng,
    deviationM: state.deviationM,
    incidentRiskScore: state.incidentRiskScore,
    liveMonitorEnabled: state.liveMonitorEnabled ?? true,
  };
}
