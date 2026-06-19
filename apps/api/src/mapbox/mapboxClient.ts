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

export async function autocompletePlaces(query: string, limit = 8): Promise<MapPlace[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const token = config.mapboxAccessToken;
  if (!token) return mockAutocomplete(trimmed, limit);

  try {
    const { lat, lng } = config.mapboxDefaultCenter;
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`,
    );
    url.searchParams.set('access_token', token);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('language', 'pt');
    url.searchParams.set('country', 'BR');
    url.searchParams.set('proximity', `${lng},${lat}`);
    url.searchParams.set('types', 'address,poi,place');

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

export async function getDrivingRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<RouteSummary> {
  const token = config.mapboxAccessToken;
  if (!token) return mockRoute(fromLat, fromLng, toLat, toLng);

  try {
    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}`,
    );
    url.searchParams.set('access_token', token);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('language', 'pt');

    const res = await fetch(url);
    if (!res.ok) return mockRoute(fromLat, fromLng, toLat, toLng);

    const data = (await res.json()) as {
      routes?: { distance: number; duration: number; geometry: RouteSummary['geometry'] }[];
    };
    const route = data.routes?.[0];
    if (!route) return mockRoute(fromLat, fromLng, toLat, toLng);

    return {
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMin: Math.round((route.duration / 60) * 10) / 10,
      geometry: route.geometry,
      source: 'mapbox',
    };
  } catch {
    return mockRoute(fromLat, fromLng, toLat, toLng);
  }
}

export function getMapboxPublicConfig() {
  return {
    hasToken: Boolean(config.mapboxAccessToken),
    defaultCenter: config.mapboxDefaultCenter,
    fallbackMode: config.mapboxAccessToken ? 'mapbox' : 'mock',
  };
}
