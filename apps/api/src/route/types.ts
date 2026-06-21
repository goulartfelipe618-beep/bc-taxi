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
  estimatedFareCentavos?: number;
  trafficSurchargeCentavos?: number;
  passengerFareLabel?: string;
}

export interface RouteQuoteResult {
  requestId: string;
  selectedStrategy: RouteStrategy;
  recommended: RouteAlternative;
  alternatives: RouteAlternative[];
  distanceKm: number;
  durationMin: number;
  categoryCode?: string;
  fareEstimates?: import('./routePricingService.js').RouteFareEstimate[];
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
  driverLat?: number;
  driverLng?: number;
  deviationM?: number;
  incidentRiskScore?: number;
  liveMonitorEnabled?: boolean;
}

export const ROUTE_STRATEGIES: RouteStrategy[] = ['fastest', 'shortest', 'economical', 'less_traffic'];

export const RECALC_MIN_INTERVAL_MS = 45_000;
export const RECALC_ETA_DELTA_SECONDS = 120;
export const RECALC_DEVIATION_THRESHOLD_M = 250;
export const RECALC_ETA_IMPROVEMENT_PCT = 0.06;
export const RECALC_RISK_IMPROVEMENT_PCT = 0.15;
export const RECALC_TRAFFIC_THRESHOLD = 0.72;

export type RouteRecalcReasonCode =
  | 'TRAFFIC_UPDATE'
  | 'DRIVER_DEVIATION'
  | 'ETA_DRIFT'
  | 'ROAD_INCIDENT'
  | 'ROAD_CLOSURE'
  | 'MANUAL';

export interface RouteRecalculateOutcome {
  state: ActiveRouteState;
  applied: boolean;
  skippedReason?: 'THROTTLED' | 'INSUFFICIENT_DELTA' | 'NO_ROUTE';
  reasonCode?: RouteRecalcReasonCode;
  reasonLabel?: string;
  etaDeltaSeconds?: number;
  riskDeltaPct?: number;
  deviationM?: number;
  candidateEtaSeconds?: number;
  candidateTrafficIndex?: number;
}
