type LineCoordinate = [number, number];

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistanceM(
  lat: number,
  lng: number,
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dx = lat2 - lat1;
  const dy = lng2 - lng1;
  if (dx === 0 && dy === 0) return haversineM(lat, lng, lat1, lng1);

  const t = Math.max(
    0,
    Math.min(1, ((lat - lat1) * dx + (lng - lng1) * dy) / (dx * dx + dy * dy)),
  );
  const projLat = lat1 + t * dx;
  const projLng = lng1 + t * dy;
  return haversineM(lat, lng, projLat, projLng);
}

export function computeRouteDeviationM(
  lat: number,
  lng: number,
  polyline?: { type?: string; coordinates?: LineCoordinate[] },
): number {
  const coords = polyline?.coordinates ?? [];
  if (coords.length === 0) return 0;
  if (coords.length === 1) {
    const [lng0, lat0] = coords[0]!;
    return haversineM(lat, lng, lat0, lng0);
  }

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [lng1, lat1] = coords[i]!;
    const [lng2, lat2] = coords[i + 1]!;
    min = Math.min(min, pointToSegmentDistanceM(lat, lng, lat1, lng1, lat2, lng2));
  }
  return min;
}

export { haversineM };
