import 'dotenv/config';
import { autocompletePlaces, getDrivingRoute } from '../src/mapbox/mapboxClient.js';
import { getMapboxPublicConfig } from '../src/mapbox/mapboxClient.js';

const cfg = getMapboxPublicConfig();
console.log('Mapbox config:', cfg);

const places = await autocompletePlaces('Shopping Neumarkt Blumenau', 3);
console.log('Autocomplete:', places.length, 'results');
for (const p of places.slice(0, 3)) {
  console.log(`  [${p.source}] ${p.label} — ${p.address} (${p.lat}, ${p.lng})`);
}

if (places.length >= 1) {
  const from = { lat: -26.9194, lng: -49.0661 };
  const to = places[0]!;
  const route = await getDrivingRoute(from.lat, from.lng, to.lat, to.lng);
  console.log('Route:', route.distanceKm, 'km', route.durationMin, 'min', route.source);
}

const usingMapbox = places.some((p) => p.source === 'mapbox');
if (!cfg.hasToken) {
  console.error('MAPBOX_ACCESS_TOKEN not set');
  process.exit(1);
}
if (!usingMapbox) {
  console.error('Expected mapbox source but got mock fallback');
  process.exit(1);
}
console.log('Mapbox OK');
