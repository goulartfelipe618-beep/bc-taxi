import { haversineKm } from '../mapbox/mockPlaces.js';

export interface SharedCorridorConfig {
  maxPickupRadiusKm: number;
  maxDropoffRadiusKm: number;
  maxBearingDiffDeg: number;
  maxDetourMin: number;
  maxWaitMin: number;
  maxBookingsPerPool: number;
}

export interface SharedRoutePoint {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function routeBearing(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function estimateRouteKmFromPoint(a: SharedRoutePoint): number {
  return haversineKm(a.pickupLat, a.pickupLng, a.dropoffLat, a.dropoffLng) * 1.35;
}

export function estimateCombinedRouteKm(a: SharedRoutePoint, b: SharedRoutePoint): number {
  const leg1 = haversineKm(a.pickupLat, a.pickupLng, b.pickupLat, b.pickupLng);
  const leg2 = haversineKm(b.pickupLat, b.pickupLng, a.dropoffLat, a.dropoffLng);
  const leg3 = haversineKm(a.dropoffLat, a.dropoffLng, b.dropoffLat, b.dropoffLng);
  return (leg1 + leg2 + leg3) * 1.35;
}

export function estimateDetourBetween(a: SharedRoutePoint, b: SharedRoutePoint): { detourKm: number; detourMin: number } {
  const directA = estimateRouteKmFromPoint(a);
  const directB = estimateRouteKmFromPoint(b);
  const combined = estimateCombinedRouteKm(a, b);
  const detourKm = Math.max(0, combined - directA - directB);
  const detourMin = (detourKm / 30) * 60;
  return { detourKm: Math.round(detourKm * 100) / 100, detourMin: Math.round(detourMin * 10) / 10 };
}

export function computeDetourDiscount(baseFareCentavos: number, detourMin: number, maxDetourMin: number): number {
  const ratio = Math.min(1, Math.max(0, detourMin / maxDetourMin));
  const discountRate = 0.05 + ratio * 0.13;
  return Math.round(baseFareCentavos * discountRate);
}

export function areRoutesCompatible(
  a: SharedRoutePoint,
  b: SharedRoutePoint,
  cfg?: SharedCorridorConfig,
  opts?: { hasLargeBaggageA?: boolean; hasLargeBaggageB?: boolean },
): { compatible: boolean; reason?: string; detourKm: number; detourMin: number } {
  const corridor: SharedCorridorConfig = cfg ?? {
    maxPickupRadiusKm: 2.5,
    maxDropoffRadiusKm: 3.0,
    maxBearingDiffDeg: 45,
    maxDetourMin: 12,
    maxWaitMin: 3,
    maxBookingsPerPool: 2,
  };
  if (opts?.hasLargeBaggageA || opts?.hasLargeBaggageB) {
    return { compatible: false, reason: 'Bagagem grande bloqueia compartilhamento', detourKm: 0, detourMin: 0 };
  }

  const pickupDist = haversineKm(a.pickupLat, a.pickupLng, b.pickupLat, b.pickupLng);
  if (pickupDist > corridor.maxPickupRadiusKm) {
    return { compatible: false, reason: 'Origens muito distantes para compartilhar', detourKm: 0, detourMin: 0 };
  }

  const dropoffDist = haversineKm(a.dropoffLat, a.dropoffLng, b.dropoffLat, b.dropoffLng);
  if (dropoffDist > corridor.maxDropoffRadiusKm) {
    return { compatible: false, reason: 'Destinos muito distantes para compartilhar', detourKm: 0, detourMin: 0 };
  }

  const bearingA = routeBearing(a.pickupLat, a.pickupLng, a.dropoffLat, a.dropoffLng);
  const bearingB = routeBearing(b.pickupLat, b.pickupLng, b.dropoffLat, b.dropoffLng);
  if (bearingDiff(bearingA, bearingB) > corridor.maxBearingDiffDeg) {
    return { compatible: false, reason: 'Rotas em direções incompatíveis', detourKm: 0, detourMin: 0 };
  }

  const { detourKm, detourMin } = estimateDetourBetween(a, b);
  if (detourMin > corridor.maxDetourMin) {
    return { compatible: false, reason: 'Desvio acima do limite operacional', detourKm, detourMin };
  }

  return { compatible: true, detourKm, detourMin };
}
