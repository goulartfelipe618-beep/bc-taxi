import { config } from '../config.js';
import { pool } from '../db.js';

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distância mínima de um segmento (from→to) a um ponto de pedágio. */
function distanceToSegmentKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  pointLat: number,
  pointLng: number,
): number {
  const midLat = (fromLat + toLat) / 2;
  const midLng = (fromLng + toLng) / 2;
  return Math.min(
    haversineKm(fromLat, fromLng, pointLat, pointLng),
    haversineKm(toLat, toLng, pointLat, pointLng),
    haversineKm(midLat, midLng, pointLat, pointLng),
  );
}

const MEMORY_TOLLS = [{ lat: -26.95, lng: -48.6, costCentavos: 850, name: 'Pedágio BR-101 BC' }];

export async function estimateTollsCentavos(params: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  distanceKm?: number;
}): Promise<{ tollsCentavos: number; tollNames: string[] }> {
  const thresholdKm = 4;
  let tolls = MEMORY_TOLLS;

  if (!config.useMemoryDb) {
    const { rows } = await pool.query(
      `SELECT name, lat, lng, cost_centavos FROM route_toll_catalog WHERE is_active = TRUE`,
    );
    tolls = rows.map((r) => ({
      name: r.name as string,
      lat: Number(r.lat),
      lng: Number(r.lng),
      costCentavos: Number(r.cost_centavos),
    }));
  }

  const tripKm = params.distanceKm ?? haversineKm(params.fromLat, params.fromLng, params.toLat, params.toLng);
  if (tripKm < 8) return { tollsCentavos: 0, tollNames: [] };

  let total = 0;
  const names: string[] = [];
  for (const toll of tolls) {
    const dist = distanceToSegmentKm(params.fromLat, params.fromLng, params.toLat, params.toLng, toll.lat, toll.lng);
    if (dist <= thresholdKm) {
      total += toll.costCentavos;
      names.push(toll.name);
    }
  }

  return { tollsCentavos: total, tollNames: names };
}
