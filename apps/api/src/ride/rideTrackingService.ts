import { pool } from '../db.js';
import { getPrimaryActiveVehicle } from '../fleet/fleetStore.js';
import { estimateEtaSeconds, haversineMeters } from '../match/eligibility.js';
import type { RideRecord } from '../match/types.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';

export type RideTrackingTarget = 'pickup' | 'dropoff';

export interface RideTrackingSnapshot {
  driver: {
    userId: string;
    fullName: string;
    rating: number;
    vehiclePlate?: string;
    vehicleMake?: string;
    vehicleModel?: string;
  };
  driverLocation: {
    lat: number;
    lng: number;
    updatedAt?: string;
    heading?: number;
  } | null;
  eta: {
    seconds: number;
    label: string;
    target: RideTrackingTarget;
  } | null;
  distanceM: number | null;
}

function formatEtaLabel(seconds: number): string {
  if (seconds < 60) return '< 1 min';
  const min = Math.ceil(seconds / 60);
  return min === 1 ? '1 min' : '$min min';
}

async function getDriverPublicProfile(driverId: string) {
  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(driverId);
    if (!driver) return null;
    const vehicle = await getPrimaryActiveVehicle(driverId);
    return {
      userId: driverId,
      fullName: driver.fullName,
      rating: driver.reputationScore,
      lat: driver.lat,
      lng: driver.lng,
      locationUpdatedAt: driver.locationUpdatedAt,
      vehiclePlate: vehicle?.plate,
      vehicleMake: vehicle?.make,
      vehicleModel: vehicle?.model,
    };
  }

  const { rows } = await pool.query(
    `SELECT d.user_id, d.lat, d.lng, d.location_updated_at, d.reputation_score, d.rating,
            u.full_name, v.plate, v.make, v.model
     FROM drivers d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN vehicles v ON v.id = d.primary_vehicle_id AND v.deleted_at IS NULL
     WHERE d.user_id = $1`,
    [driverId],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  let vehicle = row.plate
    ? { plate: row.plate as string, make: row.make as string, model: row.model as string }
    : null;
  if (!vehicle) {
    const fallback = await getPrimaryActiveVehicle(driverId);
    vehicle = fallback
      ? { plate: fallback.plate, make: fallback.make, model: fallback.model }
      : null;
  }

  return {
    userId: row.user_id as string,
    fullName: row.full_name as string,
    rating: Number(row.reputation_score ?? row.rating ?? 5),
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    locationUpdatedAt: row.location_updated_at ? new Date(row.location_updated_at as string) : undefined,
    vehiclePlate: vehicle?.plate,
    vehicleMake: vehicle?.make,
    vehicleModel: vehicle?.model,
  };
}

export async function getRideTracking(ride: RideRecord): Promise<RideTrackingSnapshot | null> {
  if (!ride.driverId) return null;
  if (!['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(ride.status)) {
    return null;
  }

  const profile = await getDriverPublicProfile(ride.driverId);
  if (!profile) return null;

  const target =
    ride.status === 'IN_PROGRESS'
      ? { lat: ride.dropoffLat, lng: ride.dropoffLng, kind: 'dropoff' as const }
      : { lat: ride.pickupLat, lng: ride.pickupLng, kind: 'pickup' as const };

  let eta: RideTrackingSnapshot['eta'] = null;
  let distanceM: number | null = null;
  let driverLocation: RideTrackingSnapshot['driverLocation'] = null;

  if (profile.lat != null && profile.lng != null) {
    distanceM = Math.round(haversineMeters(profile.lat, profile.lng, target.lat, target.lng));
    const seconds = estimateEtaSeconds(distanceM);
    eta = { seconds, label: formatEtaLabel(seconds), target: target.kind };
    driverLocation = {
      lat: profile.lat,
      lng: profile.lng,
      updatedAt: profile.locationUpdatedAt?.toISOString(),
    };
  }

  return {
    driver: {
      userId: profile.userId,
      fullName: profile.fullName,
      rating: profile.rating,
      vehiclePlate: profile.vehiclePlate,
      vehicleMake: profile.vehicleMake,
      vehicleModel: profile.vehicleModel,
    },
    driverLocation,
    eta,
    distanceM,
  };
}

export function toPublicTracking(tracking: RideTrackingSnapshot) {
  return tracking;
}

export async function resolveDriverActiveRideId(driverId: string): Promise<string | undefined> {
  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(driverId);
    return driver?.activeRideId;
  }
  const { rows } = await pool.query(
    `SELECT active_ride_id FROM drivers WHERE user_id = $1`,
    [driverId],
  );
  return (rows[0]?.active_ride_id as string) ?? undefined;
}
