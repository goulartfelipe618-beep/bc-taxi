import { autocompletePlaces, reverseGeocode } from '../mapbox/mapboxClient.js';
import { BC_MOCK_PLACES } from '../mapbox/mockPlaces.js';
import type { MapPlace } from '../mapbox/types.js';
import { aliasToMapPlace, searchPlaceAliases } from './aliasStore.js';
import { bumpPlacePopularity, getPopularityForFeature, listRegionalHotspots } from './popularityStore.js';
import { listRecentPlaces } from './placeStore.js';
import { listSavedPlaces, savedPlaceToMapPlace } from './savedPlaceStore.js';
import { computeSuggestionScore } from './suggestionRankService.js';

export interface RankedPlaceSuggestion extends MapPlace {
  suggestionScore: number;
  suggestionSource: 'mapbox' | 'mock' | 'saved' | 'recent' | 'alias' | 'hotspot';
}

function normalizeQuery(q: string) {
  return q.trim().toLowerCase();
}

function matchesQuery(query: string, label: string, address: string) {
  const q = normalizeQuery(query);
  const l = label.toLowerCase();
  const a = address.toLowerCase();
  return l.includes(q) || a.includes(q);
}

function dedupeKey(p: MapPlace) {
  return p.featureId ?? `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}:${p.label}`;
}

async function buildUserAffinityMap(userId: string) {
  const counts = new Map<string, number>();
  const recency = new Map<string, number>();

  const recent = await listRecentPlaces(userId, 30);
  for (const item of recent) {
    const key = item.featureId ?? item.id;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const days = (Date.now() - item.confirmedAt.getTime()) / 86_400_000;
    const prev = recency.get(key);
    if (prev == null || days < prev) recency.set(key, days);
  }

  return { counts, recency };
}

export async function searchPlacesIntelligent(params: {
  query: string;
  userId?: string;
  proximityLat?: number;
  proximityLng?: number;
  sessionToken?: string;
  limit?: number;
  regionCluster?: string;
}): Promise<RankedPlaceSuggestion[]> {
  const query = params.query.trim();
  if (!query) return [];

  const limit = params.limit ?? 10;
  const regionCluster = params.regionCluster ?? 'bc-vale';
  const proximityLat = params.proximityLat;
  const proximityLng = params.proximityLng;

  void params.sessionToken;

  const candidates: Array<{ place: MapPlace; source: RankedPlaceSuggestion['suggestionSource'] }> = [];
  const seen = new Set<string>();

  const add = (place: MapPlace, source: RankedPlaceSuggestion['suggestionSource']) => {
    const key = dedupeKey(place);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ place, source });
  };

  const mapboxResults = await autocompletePlaces(query, limit, {
    proximityLat,
    proximityLng,
    sessionToken: params.sessionToken,
  });
  for (const p of mapboxResults) add(p, p.source === 'mock' ? 'mock' : 'mapbox');

  if (params.userId) {
    const saved = await listSavedPlaces(params.userId);
    for (const s of saved) {
      const p = savedPlaceToMapPlace(s);
      if (matchesQuery(query, p.label, p.address)) add(p, 'saved');
    }

    const recent = await listRecentPlaces(params.userId, 15);
    for (const r of recent) {
      const p: MapPlace = {
        id: r.featureId ?? r.id,
        label: r.label,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        featureId: r.featureId,
        source: r.source as MapPlace['source'],
      };
      if (matchesQuery(query, p.label, p.address)) add(p, 'recent');
    }

    const aliases = await searchPlaceAliases(params.userId, query);
    for (const a of aliases) add(aliasToMapPlace(a), 'alias');
  }

  const hotspots = await listRegionalHotspots(regionCluster, 12);
  for (const h of hotspots) {
    const p: MapPlace = {
      id: h.featureId ?? h.label,
      label: h.label,
      address: h.label,
      lat: h.lat,
      lng: h.lng,
      featureId: h.featureId,
      source: 'mock',
    };
    if (matchesQuery(query, p.label, p.address)) add(p, 'hotspot');
  }

  if (candidates.length === 0) {
    for (const p of BC_MOCK_PLACES) {
      if (matchesQuery(query, p.label, p.address)) add(p, 'mock');
    }
  }

  const affinity = params.userId ? await buildUserAffinityMap(params.userId) : { counts: new Map(), recency: new Map() };

  const ranked: RankedPlaceSuggestion[] = [];
  for (const { place, source } of candidates) {
    const fid = place.featureId ?? place.id;
    const popularity = await getPopularityForFeature(fid, regionCluster);
    const score = computeSuggestionScore({
      query,
      label: place.label,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      proximityLat,
      proximityLng,
      userUseCount: affinity.counts.get(fid) ?? 0,
      globalPopularity: popularity,
      daysSinceUse: affinity.recency.get(fid),
    });

    ranked.push({
      ...place,
      suggestionScore: Math.round(score * 1000) / 1000,
      suggestionSource: source,
    });
  }

  ranked.sort((a, b) => b.suggestionScore - a.suggestionScore);

  for (const item of ranked.slice(0, limit)) {
    void bumpPlacePopularity({
      featureId: item.featureId ?? item.id,
      label: item.label,
      lat: item.lat,
      lng: item.lng,
      kind: 'search',
      regionCluster,
    });
  }

  return ranked.slice(0, limit);
}

export { reverseGeocode };

export function toPublicRankedSuggestion(s: RankedPlaceSuggestion) {
  return {
    id: s.id,
    label: s.label,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    featureId: s.featureId,
    source: s.source,
    suggestionScore: s.suggestionScore,
    suggestionSource: s.suggestionSource,
  };
}
