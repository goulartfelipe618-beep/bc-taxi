import { config } from '../config.js';
import { mockAutocomplete, mockRoute } from './mockPlaces.js';
import type { MapPlace, RouteSummary } from './types.js';

type MapboxFeature = {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
};

function mapFeature(f: MapboxFeature): MapPlace {
  const [lng, lat] = f.center;
  return {
    id: f.id,
    label: f.text,
    address: f.place_name,
    lat,
    lng,
    featureId: f.id,
    source: 'mapbox',
  };
}

export async function autocompletePlaces(
  query: string,
  limit = 8,
  opts?: { proximityLat?: number; proximityLng?: number; sessionToken?: string },
): Promise<MapPlace[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const token = config.mapboxAccessToken;
  if (!token) return mockAutocomplete(trimmed, limit);

  try {
    const lat = opts?.proximityLat ?? config.mapboxDefaultCenter.lat;
    const lng = opts?.proximityLng ?? config.mapboxDefaultCenter.lng;
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`,
    );
    url.searchParams.set('access_token', token);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('language', 'pt');
    url.searchParams.set('country', 'BR');
    url.searchParams.set('proximity', `${lng},${lat}`);
    url.searchParams.set('types', 'address,poi,place');
    if (opts?.sessionToken) url.searchParams.set('session_token', opts.sessionToken);

    const res = await fetch(url);
    if (!res.ok) return mockAutocomplete(trimmed, limit);

    const data = (await res.json()) as { features?: MapboxFeature[] };
    const features = data.features ?? [];
    if (features.length === 0) return mockAutocomplete(trimmed, limit);
    return features.map(mapFeature);
  } catch {
    return mockAutocomplete(trimmed, limit);
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<MapPlace | null> {
  const token = config.mapboxAccessToken;
  if (!token) {
    const nearest = mockAutocomplete('centro', 1)[0];
    return nearest ? { ...nearest, lat, lng, label: 'Ponto selecionado', address: nearest.address } : null;
  }

  try {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
    );
    url.searchParams.set('access_token', token);
    url.searchParams.set('language', 'pt');
    url.searchParams.set('types', 'address,poi,place');

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as { features?: MapboxFeature[] };
    const feature = data.features?.[0];
    return feature ? mapFeature(feature) : null;
  } catch {
    return null;
  }
}

export async function getDrivingRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  waypoints: { lat: number; lng: number }[] = [],
): Promise<RouteSummary> {
  const points = [{ lat: fromLat, lng: fromLng }, ...waypoints, { lat: toLat, lng: toLng }];
  return getDrivingRoutePoints(points);
}

export async function getDrivingRoutePoints(
  points: { lat: number; lng: number }[],
): Promise<RouteSummary> {
  if (points.length < 2) {
    return mockRoute(points[0]?.lat ?? 0, points[0]?.lng ?? 0, points[1]?.lat ?? 0, points[1]?.lng ?? 0);
  }

  const token = config.mapboxAccessToken;
  const coordPath = points.map((p) => `${p.lng},${p.lat}`).join(';');

  if (!token) {
    return mockRoute(points[0].lat, points[0].lng, points.at(-1)!.lat, points.at(-1)!.lng);
  }

  try {
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordPath}`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('language', 'pt');

    const res = await fetch(url);
    if (!res.ok) {
      return mockRoute(points[0].lat, points[0].lng, points.at(-1)!.lat, points.at(-1)!.lng);
    }

    const data = (await res.json()) as {
      routes?: { distance: number; duration: number; geometry: RouteSummary['geometry'] }[];
    };
    const route = data.routes?.[0];
    if (!route) {
      return mockRoute(points[0].lat, points[0].lng, points.at(-1)!.lat, points.at(-1)!.lng);
    }

    return {
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMin: Math.round((route.duration / 60) * 10) / 10,
      geometry: route.geometry,
      source: 'mapbox',
    };
  } catch {
    return mockRoute(points[0].lat, points[0].lng, points.at(-1)!.lat, points.at(-1)!.lng);
  }
}

export function getMapboxPublicConfig() {
  return {
    hasToken: Boolean(config.mapboxAccessToken),
    defaultCenter: config.mapboxDefaultCenter,
    fallbackMode: config.mapboxAccessToken ? 'mapbox' : 'mock',
  };
}
