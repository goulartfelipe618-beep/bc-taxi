import { haversineKm } from '../mapbox/mockPlaces.js';

export const SUGGESTION_WEIGHTS = {
  textRelevance: 0.38,
  geoProximity: 0.24,
  userAffinity: 0.18,
  globalPopularity: 0.12,
  recency: 0.08,
} as const;

export interface SuggestionScoreInput {
  query: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  proximityLat?: number;
  proximityLng?: number;
  userUseCount?: number;
  globalPopularity?: number;
  daysSinceUse?: number;
}

function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function computeTextRelevance(query: string, label: string, address: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const l = normalizeText(label);
  const a = normalizeText(address);
  if (l.startsWith(q) || a.startsWith(q)) return 1;
  if (l.includes(q) || a.includes(q)) return 0.75;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => l.includes(t) || a.includes(t)).length;
  return Math.min(0.65, hits / tokens.length);
}

export function computeGeoProximity(
  lat: number,
  lng: number,
  proximityLat?: number,
  proximityLng?: number,
): number {
  if (proximityLat == null || proximityLng == null) return 0.5;
  const km = haversineKm(proximityLat, proximityLng, lat, lng);
  if (km <= 1) return 1;
  if (km >= 50) return 0;
  return 1 - km / 50;
}

export function computeUserAffinity(useCount: number): number {
  if (useCount <= 0) return 0;
  return Math.min(1, Math.log10(useCount + 1) / 2);
}

export function computeGlobalPopularity(score: number): number {
  return Math.min(1, score / 1000);
}

export function computeRecency(daysSinceUse?: number): number {
  if (daysSinceUse == null) return 0;
  if (daysSinceUse <= 1) return 1;
  if (daysSinceUse >= 90) return 0.1;
  return Math.max(0.1, 1 - daysSinceUse / 90);
}

export function computeSuggestionScore(input: SuggestionScoreInput): number {
  const text = computeTextRelevance(input.query, input.label, input.address);
  const geo = computeGeoProximity(input.lat, input.lng, input.proximityLat, input.proximityLng);
  const affinity = computeUserAffinity(input.userUseCount ?? 0);
  const popularity = computeGlobalPopularity(input.globalPopularity ?? 0);
  const recency = computeRecency(input.daysSinceUse);

  return (
    SUGGESTION_WEIGHTS.textRelevance * text +
    SUGGESTION_WEIGHTS.geoProximity * geo +
    SUGGESTION_WEIGHTS.userAffinity * affinity +
    SUGGESTION_WEIGHTS.globalPopularity * popularity +
    SUGGESTION_WEIGHTS.recency * recency
  );
}
