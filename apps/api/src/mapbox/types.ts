export interface MapPlace {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  featureId?: string;
  source: 'mapbox' | 'mock';
}

export interface RouteSummary {
  distanceKm: number;
  durationMin: number;
  geometry?: { type: 'LineString'; coordinates: [number, number][] };
  source: 'mapbox' | 'mock';
}
