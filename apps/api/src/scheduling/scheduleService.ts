import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { createRideRequest, startMatching } from '../match/matchService.js';
import type { RideCategoryCode } from '../domain/types.js';
import { getPassengerReputation } from '../reviews/reputationService.js';
import { validatePromoCode, recordCouponRedemption } from '../promotions/couponService.js';
import { emitEvent } from '../realtime/eventBus.js';

export type ScheduledRideStatus = 'pending' | 'confirmed' | 'dispatched' | 'cancelled' | 'failed';

export interface ScheduledRideRecord {
  id: string;
  passengerId: string;
  categoryCode: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  scheduledAt: Date;
  status: ScheduledRideStatus;
  rideId?: string;
  paymentMethodId?: string;
  estimatedFareCentavos?: number;
  promoCode?: string;
  discountCentavos: number;
  dispatchLeadMinutes: number;
  dispatchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const memorySchedules: ScheduledRideRecord[] = [];

const MIN_LEAD_MS = 30 * 60 * 1000;
const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;

function mapRow(row: Record<string, unknown>): ScheduledRideRecord {
  return {
    id: row.id as string,
    passengerId: row.passenger_id as string,
    categoryCode: row.category_code as string,
    pickupLat: Number(row.pickup_lat),
    pickupLng: Number(row.pickup_lng),
    pickupAddress: (row.pickup_address as string) ?? undefined,
    dropoffLat: Number(row.dropoff_lat),
    dropoffLng: Number(row.dropoff_lng),
    dropoffAddress: (row.dropoff_address as string) ?? undefined,
    scheduledAt: new Date(row.scheduled_at as string),
    status: row.status as ScheduledRideStatus,
    rideId: (row.ride_id as string) ?? undefined,
    paymentMethodId: (row.payment_method_id as string) ?? undefined,
    estimatedFareCentavos: row.estimated_fare_centavos != null ? Number(row.estimated_fare_centavos) : undefined,
    promoCode: (row.promo_code as string) ?? undefined,
    discountCentavos: Number(row.discount_centavos ?? 0),
    dispatchLeadMinutes: Number(row.dispatch_lead_minutes ?? 15),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export function toPublicScheduledRide(r: ScheduledRideRecord) {
  return {
    id: r.id,
    categoryCode: r.categoryCode,
    pickupAddress: r.pickupAddress,
    dropoffAddress: r.dropoffAddress,
    scheduledAt: r.scheduledAt.toISOString(),
    status: r.status,
    rideId: r.rideId,
    estimatedFareCentavos: r.estimatedFareCentavos,
    discountCentavos: r.discountCentavos,
    promoCode: r.promoCode,
  };
}

function assertScheduledAtValid(scheduledAt: Date) {
  const delta = scheduledAt.getTime() - Date.now();
  if (delta < MIN_LEAD_MS) throw new Error('Agendamento deve ser com pelo menos 30 minutos de antecedência');
  if (delta > MAX_LEAD_MS) throw new Error('Agendamento limitado a 30 dias');
}

export async function createScheduledRide(input: {
  passengerId: string;
  categoryCode: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  scheduledAt: Date;
  paymentMethodId?: string;
  estimatedFareCentavos?: number;
  promoCode?: string;
  dispatchLeadMinutes?: number;
}): Promise<ScheduledRideRecord> {
  assertScheduledAtValid(input.scheduledAt);

  let discountCentavos = 0;
  let fareAfter = input.estimatedFareCentavos ?? 0;
  let promoRecord: Awaited<ReturnType<typeof validatePromoCode>>['promo'];

  if (input.promoCode && fareAfter > 0) {
    const validation = await validatePromoCode({
      code: input.promoCode,
      userId: input.passengerId,
      categoryCode: input.categoryCode,
      fareCentavos: fareAfter,
    });
    if (!validation.valid || !validation.promo) {
      throw new Error(validation.reason ?? 'Cupom inválido');
    }
    promoRecord = validation.promo;
    discountCentavos = validation.discountCentavos;
    fareAfter = validation.fareAfterCentavos;
  }

  const record: ScheduledRideRecord = {
    id: randomUUID(),
    passengerId: input.passengerId,
    categoryCode: input.categoryCode,
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    pickupAddress: input.pickupAddress,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
    dropoffAddress: input.dropoffAddress,
    scheduledAt: input.scheduledAt,
    status: 'confirmed',
    paymentMethodId: input.paymentMethodId,
    estimatedFareCentavos: fareAfter || input.estimatedFareCentavos,
    promoCode: input.promoCode?.toUpperCase(),
    discountCentavos,
    dispatchLeadMinutes: input.dispatchLeadMinutes ?? 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (config.useMemoryDb) {
    memorySchedules.push(record);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO scheduled_rides (
        id, passenger_id, category_code, pickup_lat, pickup_lng, pickup_address,
        dropoff_lat, dropoff_lng, dropoff_address, scheduled_at, status,
        payment_method_id, estimated_fare_centavos, promo_code, discount_centavos, dispatch_lead_minutes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed',$11,$12,$13,$14,$15) RETURNING *`,
      [
        record.id,
        record.passengerId,
        record.categoryCode,
        record.pickupLat,
        record.pickupLng,
        record.pickupAddress ?? null,
        record.dropoffLat,
        record.dropoffLng,
        record.dropoffAddress ?? null,
        record.scheduledAt,
        record.paymentMethodId ?? null,
        record.estimatedFareCentavos ?? null,
        record.promoCode ?? null,
        record.discountCentavos,
        record.dispatchLeadMinutes,
      ],
    );
    Object.assign(record, mapRow(rows[0]));
  }

  if (promoRecord && discountCentavos > 0) {
    await recordCouponRedemption({
      promo: promoRecord,
      userId: input.passengerId,
      fareBeforeCentavos: input.estimatedFareCentavos ?? 0,
      discountCentavos,
      scheduledRideId: record.id,
    });
  }

  void emitEvent('SCHEDULED_RIDE_CREATED', 'schedule', record.id, {
    scheduledAt: record.scheduledAt.toISOString(),
  }, { userIds: [input.passengerId] });

  return record;
}

export async function listPassengerSchedules(passengerId: string): Promise<ScheduledRideRecord[]> {
  if (config.useMemoryDb) {
    return memorySchedules
      .filter((s) => s.passengerId === passengerId && s.status !== 'cancelled')
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  }
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_rides WHERE passenger_id = $1 AND status <> 'cancelled'
     ORDER BY scheduled_at DESC LIMIT 50`,
    [passengerId],
  );
  return rows.map(mapRow);
}

export async function cancelScheduledRide(id: string, passengerId: string, reason?: string) {
  if (config.useMemoryDb) {
    const s = memorySchedules.find((x) => x.id === id && x.passengerId === passengerId);
    if (!s) throw new Error('Agendamento não encontrado');
    if (s.status === 'dispatched') throw new Error('Corrida já despachada');
    s.status = 'cancelled';
    s.updatedAt = new Date();
    return s;
  }

  const { rows } = await pool.query(
    `UPDATE scheduled_rides SET status = 'cancelled', cancel_reason = $3, updated_at = NOW()
     WHERE id = $1 AND passenger_id = $2 AND status IN ('pending','confirmed')
     RETURNING *`,
    [id, passengerId, reason ?? null],
  );
  if (!rows[0]) throw new Error('Agendamento não encontrado ou não cancelável');
  return mapRow(rows[0]);
}

export async function dispatchDueScheduledRides(): Promise<number> {
  const due = config.useMemoryDb
    ? memorySchedules.filter(
        (s) =>
          (s.status === 'confirmed' || s.status === 'pending') &&
          s.scheduledAt.getTime() - s.dispatchLeadMinutes * 60_000 <= Date.now(),
      )
    : (
        await pool.query(
          `SELECT * FROM scheduled_rides
           WHERE status IN ('pending','confirmed')
             AND scheduled_at - (dispatch_lead_minutes || ' minutes')::INTERVAL <= NOW()
           ORDER BY scheduled_at ASC LIMIT 20`,
        )
      ).rows.map(mapRow);

  let dispatched = 0;
  for (const schedule of due) {
    try {
      const rep = await getPassengerReputation(schedule.passengerId);
      const ride = await createRideRequest({
        passengerId: schedule.passengerId,
        categoryCode: schedule.categoryCode,
        pickupLat: schedule.pickupLat,
        pickupLng: schedule.pickupLng,
        pickupAddress: schedule.pickupAddress,
        dropoffLat: schedule.dropoffLat,
        dropoffLng: schedule.dropoffLng,
        dropoffAddress: schedule.dropoffAddress,
        estimatedFareCentavos: schedule.estimatedFareCentavos,
        passengerReputation: rep,
      });

      await startMatching(ride.id, rep);

      schedule.status = 'dispatched';
      schedule.rideId = ride.id;
      schedule.dispatchedAt = new Date();
      schedule.updatedAt = new Date();

      if (!config.useMemoryDb) {
        await pool.query(
          `UPDATE scheduled_rides SET status = 'dispatched', ride_id = $2, dispatched_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [schedule.id, ride.id],
        );
      }

      void emitEvent('SCHEDULED_RIDE_DISPATCHED', 'schedule', schedule.id, { rideId: ride.id }, {
        userIds: [schedule.passengerId],
        rideId: ride.id,
      });
      dispatched += 1;
    } catch {
      schedule.status = 'failed';
      if (!config.useMemoryDb) {
        await pool.query(`UPDATE scheduled_rides SET status = 'failed', updated_at = NOW() WHERE id = $1`, [
          schedule.id,
        ]);
      }
    }
  }

  return dispatched;
}

export function startScheduleDispatcher() {
  const intervalMs = 60_000;
  void dispatchDueScheduledRides();
  return setInterval(() => {
    void dispatchDueScheduledRides();
  }, intervalMs);
}

export function __testResetScheduleMemory() {
  memorySchedules.length = 0;
}