import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export type CollectiveCategoryCode = 'van' | 'micro_onibus';

export interface CollectiveBookingRecord {
  id: string;
  passengerId: string;
  categoryCode: CollectiveCategoryCode;
  scheduledRideId?: string;
  rideId?: string;
  passengerCount: number;
  baggageCount: number;
  isAirportShuttle: boolean;
  isLargeGroup: boolean;
  groupLabel?: string;
  pickupNotes?: string;
  estimatedFareCentavos: number;
  multiplierBreakdown: Record<string, number>;
  status: 'scheduled' | 'dispatched' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const memoryBookings: CollectiveBookingRecord[] = [];

function mapRow(row: Record<string, unknown>): CollectiveBookingRecord {
  return {
    id: row.id as string,
    passengerId: row.passenger_id as string,
    categoryCode: row.category_code as CollectiveCategoryCode,
    scheduledRideId: (row.scheduled_ride_id as string) ?? undefined,
    rideId: (row.ride_id as string) ?? undefined,
    passengerCount: Number(row.passenger_count),
    baggageCount: Number(row.baggage_count),
    isAirportShuttle: Boolean(row.is_airport_shuttle),
    isLargeGroup: Boolean(row.is_large_group),
    groupLabel: (row.group_label as string) ?? undefined,
    pickupNotes: (row.pickup_notes as string) ?? undefined,
    estimatedFareCentavos: Number(row.estimated_fare_centavos),
    multiplierBreakdown: (row.multiplier_breakdown as Record<string, number>) ?? {},
    status: row.status as CollectiveBookingRecord['status'],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function insertCollectiveBooking(
  input: Omit<CollectiveBookingRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: CollectiveBookingRecord['status'] },
): Promise<CollectiveBookingRecord> {
  const now = new Date();
  const record: CollectiveBookingRecord = {
    id: randomUUID(),
    ...input,
    status: input.status ?? 'scheduled',
    createdAt: now,
    updatedAt: now,
  };

  if (config.useMemoryDb) {
    memoryBookings.push(record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO collective_transport_bookings
      (passenger_id, category_code, scheduled_ride_id, passenger_count, baggage_count,
       is_airport_shuttle, is_large_group, group_label, pickup_notes,
       estimated_fare_centavos, multiplier_breakdown, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      record.passengerId,
      record.categoryCode,
      record.scheduledRideId ?? null,
      record.passengerCount,
      record.baggageCount,
      record.isAirportShuttle,
      record.isLargeGroup,
      record.groupLabel ?? null,
      record.pickupNotes ?? null,
      record.estimatedFareCentavos,
      JSON.stringify(record.multiplierBreakdown),
      record.status,
    ],
  );
  return mapRow(rows[0]);
}

export async function getCollectiveBooking(id: string): Promise<CollectiveBookingRecord | null> {
  if (config.useMemoryDb) return memoryBookings.find((b) => b.id === id) ?? null;
  const { rows } = await pool.query(`SELECT * FROM collective_transport_bookings WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listCollectiveBookingsForPassenger(passengerId: string): Promise<CollectiveBookingRecord[]> {
  if (config.useMemoryDb) {
    return memoryBookings.filter((b) => b.passengerId === passengerId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const { rows } = await pool.query(
    `SELECT * FROM collective_transport_bookings WHERE passenger_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [passengerId],
  );
  return rows.map(mapRow);
}

export async function driverHasCollectiveCert(
  driverUserId: string,
  categoryCode: CollectiveCategoryCode,
): Promise<boolean> {
  const certType = categoryCode === 'van' ? 'collective_light' : 'micro_bus';
  if (config.useMemoryDb) return true;

  const { rows } = await pool.query(
    `SELECT 1 FROM driver_collective_certifications
     WHERE driver_user_id = $1 AND certification_type = $2 AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [driverUserId, certType],
  );
  return rows.length > 0;
}
