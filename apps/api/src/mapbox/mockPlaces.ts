import type { MapPlace, RouteSummary } from './types.js';

/** Pontos de referência em Blumenau / Vale do Itajaí (SC). */
export const BC_MOCK_PLACES: MapPlace[] = [
  {
    id: 'mock-centro-blumenau',
    label: 'Centro — Blumenau',
    address: 'Rua XV de Novembro, Centro, Blumenau, SC',
    lat: -26.9194,
    lng: -49.0661,
    source: 'mock',
  },
  {
    id: 'mock-shopping-neumarkt',
    label: 'Shopping Neumarkt',
    address: 'Rua Sete de Setembro, 1213, Centro, Blumenau, SC',
    lat: -26.9182,
    lng: -49.0685,
    source: 'mock',
  },
  {
    id: 'mock-aeroporto-navegantes',
    label: 'Aeroporto Ministro Victor Konder',
    address: 'Av. Santos Dumont, Navegantes, SC',
    lat: -26.8799,
    lng: -48.6514,
    source: 'mock',
  },
  {
    id: 'mock-balneario-camboriu',
    label: 'Balneário Camboriú — Centro',
    address: 'Av. Atlântica, Balneário Camboriú, SC',
    lat: -26.9905,
    lng: -48.6348,
    source: 'mock',
  },
  {
    id: 'mock-itajai-porto',
    label: 'Porto de Itajaí',
    address: 'Av. Beira Rio, Itajaí, SC',
    lat: -26.9078,
    lng: -48.6619,
    source: 'mock',
  },
  {
    id: 'mock-joinville-centro',
    label: 'Joinville — Centro',
    address: 'Rua do Príncipe, Centro, Joinville, SC',
    lat: -26.3045,
    lng: -48.8487,
    source: 'mock',
  },
  {
    id: 'mock-pomerode',
    label: 'Pomerode — Centro',
    address: 'Rua XV de Novembro, Pomerode, SC',
    lat: -26.7406,
    lng: -49.1769,
    source: 'mock',
  },
  {
    id: 'mock-brusque',
    label: 'Brusque — Centro',
    address: 'Rua Brusque, Centro, Brusque, SC',
    lat: -27.098,
    lng: -48.9158,
    source: 'mock',
  },
];

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function mockAutocomplete(query: string, limit = 8): MapPlace[] {
  const q = query.trim().toLowerCase();
  if (!q) return BC_MOCK_PLACES.slice(0, limit);
  return BC_MOCK_PLACES.filter(
    (p) => p.label.toLowerCase().includes(q) || p.address.toLowerCase().includes(q),
  ).slice(0, limit);
}

/** Rota estimada por haversine com fator viário ~1.35 e velocidade média 35 km/h. */
export function mockRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): RouteSummary {
  const straightKm = haversineKm(fromLat, fromLng, toLat, toLng);
  const distanceKm = Math.max(0.5, straightKm * 1.35);
  const durationMin = Math.max(3, (distanceKm / 35) * 60);
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMin: Math.round(durationMin * 10) / 10,
    geometry: {
      type: 'LineString',
      coordinates: [
        [fromLng, fromLat],
        [toLng, toLat],
      ],
    },
    source: 'mock',
  };
}
