import type { RouteSummary } from '../mapbox/types.js';

export type RouteStrategy = 'fastest' | 'shortest' | 'economical' | 'less_traffic';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteAlternative {
  strategy: RouteStrategy;
  distanceM: number;
  etaSeconds: number;
  tollsTotalCentavos: number;
  trafficLevelIndex: number;
  incidentCount: number;
  deviationRiskScore: number;
  generalizedCost: number;
  geometry?: RouteSummary['geometry'];
  isRecommended: boolean;
}

export interface RouteQuoteResult {
  requestId: string;
  selectedStrategy: RouteStrategy;
  recommended: RouteAlternative;
  alternatives: RouteAlternative[];
  distanceKm: number;
  durationMin: number;
}

export interface ActiveRouteState {
  id: string;
  rideId: string;
  requestId?: string;
  strategy: RouteStrategy;
  distanceM: number;
  etaSeconds: number;
  tollsTotalCentavos: number;
  trafficLevelIndex: number;
  routePolyline?: RouteSummary['geometry'];
  lastRecalculatedAt: Date;
}

export const ROUTE_STRATEGIES: RouteStrategy[] = ['fastest', 'shortest', 'economical', 'less_traffic'];

export const RECALC_MIN_INTERVAL_MS = 45_000;
export const RECALC_ETA_DELTA_SECONDS = 120;
