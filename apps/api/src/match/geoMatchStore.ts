import { config } from '../config.js';
import { pool } from '../db.js';
import type { DriverRecord } from '../match/types.js';

export interface NearbyDriver extends DriverRecord {
  distanceM: number;
}

function mapDriverRow(row: Record<string, unknown>, fullName: string): DriverRecord {
  return {
    userId: row.user_id as string,
    fullName,
    isOnline: Boolean(row.is_online),
    operationalStatus: row.operational_status as DriverRecord['operationalStatus'],
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    locationUpdatedAt: row.location_updated_at ? new Date(row.location_updated_at as string) : undefined,
    enabledCategories: (row.enabled_categories as string[]) ?? ['economico'],
    reputationScore: Number(row.reputation_score ?? row.rating ?? 5),
    completedRides: Number(row.completed_rides ?? 0),
    acceptanceRate: Number(row.acceptance_rate ?? 1),
    cancellationRate: Number(row.cancellation_rate ?? 0),
    onlineMinutesToday: Number(row.online_minutes_today ?? 0),
    activeRideId: (row.active_ride_id as string) ?? undefined,
    wheelchairAccessible: Boolean(row.wheelchair_accessible),
    petReady: Boolean(row.pet_ready),
    comfortApproved: Boolean(row.comfort_approved),
    vehicleType: (row.vehicle_type as string) ?? 'economico',
  };
}

export async function findNearbyDriversPostGIS(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<NearbyDriver[]> {
  const { rows } = await pool.query(
    `SELECT d.*, u.full_name,
       ST_Distance(
         d.location,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       ) AS distance_m
     FROM drivers d
     JOIN users u ON u.id = d.user_id
     WHERE d.is_online = TRUE
       AND d.operational_status = 'online'
       AND d.active_ride_id IS NULL
       AND d.location IS NOT NULL
       AND d.location_updated_at > NOW() - INTERVAL '120 seconds'
       AND d.last_heartbeat_at > NOW() - INTERVAL '45 seconds'
       AND ST_DWithin(
         d.location,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
         $3
       )
     ORDER BY distance_m ASC
     LIMIT 200`,
    [lat, lng, radiusM],
  );

  return rows.map((r) => ({
    ...mapDriverRow(r, r.full_name as string),
    distanceM: Number(r.distance_m),
  }));
}

export function isPostgisMatchEnabled() {
  return config.matchUsePostgis && !config.useMemoryDb;
}
