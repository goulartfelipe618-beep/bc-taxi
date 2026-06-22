import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { buildEngineQuote } from '../pricing/pricingEngineService.js';
import { startMatching } from '../match/matchService.js';
import {
  areRoutesCompatible,
  computeDetourDiscount,
  estimateDetourBetween,
  type SharedCorridorConfig,
} from './sharedRideCorridor.js';
import {
  applyMarginalFaresToPool,
  assertSharedPassengerEligible,
  assertSharedTemporalWindow,
  recordSharedPoolEvent,
} from './sharedProductionService.js';

export type { SharedCorridorConfig, SharedRoutePoint };

export interface SharedRidePool {
  id: string;
  regionId?: string;
  status: SharedPoolStatus;
  primaryRideId?: string;
  bookingCount: number;
  maxBookings: number;
  waitExpiresAt?: Date;
  matchedAt?: Date;
  createdAt: Date;
}

export interface SharedRideBooking {
  id: string;
  poolId: string;
  rideId: string;
  passengerId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupOrder: number;
  passengerCount: number;
  hasLargeBaggage: boolean;
  baseFareCentavos: number;
  discountCentavos: number;
  finalFareCentavos: number;
  detourKm: number;
  detourMin: number;
  marginalFareCentavos?: number;
  status: string;
}

export interface SharedQuoteResult {
  categoryCode: 'compartilhado';
  baseFareCentavos: number;
  discountCentavos: number;
  finalFareCentavos: number;
  detourKm: number;
  detourMin: number;
  matchedPoolId?: string;
  poolStatus?: SharedPoolStatus;
  occupancyBonusDriver: number;
  soloRide: boolean;
}

export type SharedPoolStatus =
  | 'waiting'
  | 'ready'
  | 'matching'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

const DEFAULT_CORRIDOR: SharedCorridorConfig = {
  maxPickupRadiusKm: 2.5,
  maxDropoffRadiusKm: 3.0,
  maxBearingDiffDeg: 45,
  maxDetourMin: 12,
  maxWaitMin: 3,
  maxBookingsPerPool: 2,
};

const memoryPools: SharedRidePool[] = [];
const memoryBookings: SharedRideBooking[] = [];

export { areRoutesCompatible, computeDetourDiscount } from './sharedRideCorridor.js';

export async function getCorridorConfig(): Promise<SharedCorridorConfig> {
  if (config.useMemoryDb) return DEFAULT_CORRIDOR;
  const { rows } = await pool.query(
    `SELECT * FROM shared_corridor_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  if (!rows[0]) return DEFAULT_CORRIDOR;
  const r = rows[0];
  return {
    maxPickupRadiusKm: Number(r.max_pickup_radius_km),
    maxDropoffRadiusKm: Number(r.max_dropoff_radius_km),
    maxBearingDiffDeg: Number(r.max_bearing_diff_deg),
    maxDetourMin: Number(r.max_detour_min),
    maxWaitMin: Number(r.max_wait_min),
    maxBookingsPerPool: Number(r.max_bookings_per_pool),
  };
}

function mapPool(row: Record<string, unknown>): SharedRidePool {
  return {
    id: row.id as string,
    regionId: (row.region_id as string) ?? undefined,
    status: row.status as SharedPoolStatus,
    primaryRideId: (row.primary_ride_id as string) ?? undefined,
    bookingCount: Number(row.booking_count),
    maxBookings: Number(row.max_bookings),
    waitExpiresAt: row.wait_expires_at ? new Date(row.wait_expires_at as string) : undefined,
    matchedAt: row.matched_at ? new Date(row.matched_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function mapBooking(row: Record<string, unknown>): SharedRideBooking {
  return {
    id: row.id as string,
    poolId: row.pool_id as string,
    rideId: row.ride_id as string,
    passengerId: row.passenger_id as string,
    pickupLat: Number(row.pickup_lat),
    pickupLng: Number(row.pickup_lng),
    dropoffLat: Number(row.dropoff_lat),
    dropoffLng: Number(row.dropoff_lng),
    pickupOrder: Number(row.pickup_order),
    passengerCount: Number(row.passenger_count),
    hasLargeBaggage: Boolean(row.has_large_baggage),
    baseFareCentavos: Number(row.base_fare_centavos),
    discountCentavos: Number(row.discount_centavos),
    finalFareCentavos: Number(row.final_fare_centavos),
    detourKm: Number(row.detour_km),
    detourMin: Number(row.detour_min),
    status: row.status as string,
  };
}

export async function listOpenPools(): Promise<SharedRidePool[]> {
  if (config.useMemoryDb) {
    return memoryPools.filter((p) => p.status === 'waiting' && p.bookingCount < p.maxBookings);
  }
  const { rows } = await pool.query(
    `SELECT * FROM shared_ride_pools
     WHERE status = 'waiting' AND booking_count < max_bookings
     ORDER BY created_at ASC`,
  );
  return rows.map(mapPool);
}

export async function findCompatiblePool(
  route: SharedRoutePoint,
  opts?: { hasLargeBaggage?: boolean; excludePassengerId?: string },
): Promise<{ pool: SharedRidePool; booking: SharedRideBooking; detourKm: number; detourMin: number } | null> {
  const cfg = await getCorridorConfig();
  const openPools = await listOpenPools();

  for (const p of openPools) {
    const bookings = await getPoolBookings(p.id);
    const anchor = bookings[0];
    if (!anchor) continue;
    if (opts?.excludePassengerId && anchor.passengerId === opts.excludePassengerId) continue;

    const compat = areRoutesCompatible(
      {
        pickupLat: anchor.pickupLat,
        pickupLng: anchor.pickupLng,
        dropoffLat: anchor.dropoffLat,
        dropoffLng: anchor.dropoffLng,
      },
      route,
      cfg,
      { hasLargeBaggageA: anchor.hasLargeBaggage, hasLargeBaggageB: opts?.hasLargeBaggage },
    );
    if (compat.compatible) {
      return { pool: p, booking: anchor, detourKm: compat.detourKm, detourMin: compat.detourMin };
    }
  }
  return null;
}

export async function getPoolBookings(poolId: string): Promise<SharedRideBooking[]> {
  if (config.useMemoryDb) {
    return memoryBookings.filter((b) => b.poolId === poolId && b.status === 'active');
  }
  const { rows } = await pool.query(
    `SELECT * FROM shared_ride_bookings WHERE pool_id = $1 AND status = 'active' ORDER BY pickup_order`,
    [poolId],
  );
  return rows.map(mapBooking);
}

export async function getPool(poolId: string): Promise<SharedRidePool | null> {
  if (config.useMemoryDb) return memoryPools.find((p) => p.id === poolId) ?? null;
  const { rows } = await pool.query(`SELECT * FROM shared_ride_pools WHERE id = $1`, [poolId]);
  return rows[0] ? mapPool(rows[0]) : null;
}

export async function quoteSharedRide(input: {
  distanceKm: number;
  durationMin: number;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  hasLargeBaggage?: boolean;
  passengerId?: string;
  reputationScore?: number;
}): Promise<SharedQuoteResult> {
  if (input.hasLargeBaggage) {
    throw new Error('Bagagem grande não é permitida em viagem compartilhada');
  }

  if (input.reputationScore != null) {
    await assertSharedPassengerEligible(input.reputationScore);
  }
  await assertSharedTemporalWindow();

  const baseQuote = await buildEngineQuote({
    categoryCode: 'compartilhado',
    distanceKm: input.distanceKm,
    durationMin: input.durationMin,
    fromLat: input.pickupLat,
    fromLng: input.pickupLng,
    toLat: input.dropoffLat,
    toLng: input.dropoffLng,
  });

  const route: SharedRoutePoint = {
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
  };

  const match = await findCompatiblePool(route, {
    hasLargeBaggage: input.hasLargeBaggage,
    excludePassengerId: input.passengerId,
  });

  const cfg = await getCorridorConfig();
  if (match) {
    const discountCentavos = computeDetourDiscount(
      baseQuote.passengerFareCentavos,
      match.detourMin,
      cfg.maxDetourMin,
    );
    return {
      categoryCode: 'compartilhado',
      baseFareCentavos: baseQuote.passengerFareCentavos,
      discountCentavos,
      finalFareCentavos: baseQuote.passengerFareCentavos - discountCentavos,
      detourKm: match.detourKm,
      detourMin: match.detourMin,
      matchedPoolId: match.pool.id,
      poolStatus: match.pool.status,
      occupancyBonusDriver: 1.04,
      soloRide: false,
    };
  }

  return {
    categoryCode: 'compartilhado',
    baseFareCentavos: baseQuote.passengerFareCentavos,
    discountCentavos: 0,
    finalFareCentavos: baseQuote.passengerFareCentavos,
    detourKm: 0,
    detourMin: 0,
    occupancyBonusDriver: 1,
    soloRide: true,
  };
}

async function createPoolRecord(maxBookings: number, waitExpiresAt: Date): Promise<SharedRidePool> {
  const record: SharedRidePool = {
    id: randomUUID(),
    regionId: config.defaultServiceRegionId,
    status: 'waiting',
    bookingCount: 0,
    maxBookings,
    waitExpiresAt,
    createdAt: new Date(),
  };

  if (config.useMemoryDb) {
    memoryPools.push(record);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO shared_ride_pools (id, region_id, status, booking_count, max_bookings, wait_expires_at)
     VALUES ($1,$2,'waiting',0,$3,$4) RETURNING *`,
    [record.id, record.regionId ?? null, maxBookings, waitExpiresAt],
  );
  return mapPool(rows[0]);
}

async function insertBooking(input: {
  poolId: string;
  rideId: string;
  passengerId: string;
  route: SharedRoutePoint;
  pickupOrder: number;
  passengerCount: number;
  hasLargeBaggage: boolean;
  baseFareCentavos: number;
  discountCentavos: number;
  detourKm: number;
  detourMin: number;
}): Promise<SharedRideBooking> {
  const finalFare = input.baseFareCentavos - input.discountCentavos;
  const booking: SharedRideBooking = {
    id: randomUUID(),
    poolId: input.poolId,
    rideId: input.rideId,
    passengerId: input.passengerId,
    pickupLat: input.route.pickupLat,
    pickupLng: input.route.pickupLng,
    dropoffLat: input.route.dropoffLat,
    dropoffLng: input.route.dropoffLng,
    pickupOrder: input.pickupOrder,
    passengerCount: input.passengerCount,
    hasLargeBaggage: input.hasLargeBaggage,
    baseFareCentavos: input.baseFareCentavos,
    discountCentavos: input.discountCentavos,
    finalFareCentavos: finalFare,
    detourKm: input.detourKm,
    detourMin: input.detourMin,
    status: 'active',
  };

  if (config.useMemoryDb) {
    memoryBookings.push(booking);
    const p = memoryPools.find((x) => x.id === input.poolId);
    if (p) {
      p.bookingCount += 1;
      if (!p.primaryRideId) p.primaryRideId = input.rideId;
    }
    return booking;
  }

  const { rows } = await pool.query(
    `INSERT INTO shared_ride_bookings (
       id, pool_id, ride_id, passenger_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
       pickup_order, passenger_count, has_large_baggage, base_fare_centavos, discount_centavos,
       final_fare_centavos, detour_km, detour_min
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      booking.id,
      booking.poolId,
      booking.rideId,
      booking.passengerId,
      booking.pickupLat,
      booking.pickupLng,
      booking.dropoffLat,
      booking.dropoffLng,
      booking.pickupOrder,
      booking.passengerCount,
      booking.hasLargeBaggage,
      booking.baseFareCentavos,
      booking.discountCentavos,
      booking.finalFareCentavos,
      booking.detourKm,
      booking.detourMin,
    ],
  );

  await pool.query(
    `UPDATE shared_ride_pools
     SET booking_count = booking_count + 1,
         primary_ride_id = COALESCE(primary_ride_id, $2),
         updated_at = NOW()
     WHERE id = $1`,
    [input.poolId, input.rideId],
  );

  return mapBooking(rows[0]);
}

export async function registerSharedBooking(input: {
  rideId: string;
  passengerId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  passengerCount?: number;
  hasLargeBaggage?: boolean;
  distanceKm: number;
  durationMin: number;
  reputationScore?: number;
}): Promise<{ pool: SharedRidePool; booking: SharedRideBooking; sharedQuote: SharedQuoteResult }> {
  if (input.hasLargeBaggage) {
    throw new Error('Bagagem grande não é permitida em viagem compartilhada');
  }

  const eligibility = input.reputationScore != null
    ? await assertSharedPassengerEligible(input.reputationScore)
    : undefined;
  await assertSharedTemporalWindow();

  const cfg = await getCorridorConfig();
  const route: SharedRoutePoint = {
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
  };

  const sharedQuote = await quoteSharedRide({
    ...input,
    passengerId: input.passengerId,
    reputationScore: input.reputationScore,
  });

  let pool: SharedRidePool;
  let pickupOrder = 1;
  let detourKm = sharedQuote.detourKm;
  let detourMin = sharedQuote.detourMin;

  if (sharedQuote.matchedPoolId && !sharedQuote.soloRide) {
    const existing = await getPool(sharedQuote.matchedPoolId);
    if (!existing || existing.status !== 'waiting') {
      throw new Error('Pool compatível não está mais disponível');
    }
    pool = existing;
    pickupOrder = existing.bookingCount + 1;
  } else {
    const waitExpiresAt = new Date(Date.now() + cfg.maxWaitMin * 60_000);
    pool = await createPoolRecord(cfg.maxBookingsPerPool, waitExpiresAt);
    detourKm = 0;
    detourMin = 0;
  }

  const booking = await insertBooking({
    poolId: pool.id,
    rideId: input.rideId,
    passengerId: input.passengerId,
    route,
    pickupOrder,
    passengerCount: input.passengerCount ?? 1,
    hasLargeBaggage: input.hasLargeBaggage ?? false,
    baseFareCentavos: sharedQuote.baseFareCentavos,
    discountCentavos: sharedQuote.discountCentavos,
    detourKm,
    detourMin,
  });

  const updatedPool = (await getPool(pool.id)) ?? pool;

  if (updatedPool.bookingCount >= updatedPool.maxBookings) {
    await applyMarginalFaresToPool(updatedPool.id);
    await recordSharedPoolEvent(updatedPool.id, 'pool_ready', eligibility?.configVersion ?? 'camada37', {
      bookingCount: updatedPool.bookingCount,
    });
    await markPoolReady(updatedPool.id);
  } else {
    await recordSharedPoolEvent(pool.id, 'booking_joined', eligibility?.configVersion ?? 'camada37', {
      rideId: input.rideId,
    });
  }

  return { pool: (await getPool(pool.id)) ?? updatedPool, booking, sharedQuote };
}

async function markPoolReady(poolId: string) {
  if (config.useMemoryDb) {
    const p = memoryPools.find((x) => x.id === poolId);
    if (p && p.status === 'waiting') p.status = 'ready';
    return;
  }
  await pool.query(
    `UPDATE shared_ride_pools SET status = 'ready', updated_at = NOW() WHERE id = $1 AND status = 'waiting'`,
    [poolId],
  );
}

export async function dispatchReadyPools() {
  const pools = config.useMemoryDb
    ? memoryPools.filter(
        (p) =>
          p.status === 'ready' ||
          (p.status === 'waiting' && p.waitExpiresAt && p.waitExpiresAt.getTime() <= Date.now()),
      )
    : (
        await pool.query(
          `SELECT * FROM shared_ride_pools
           WHERE status = 'ready'
              OR (status = 'waiting' AND wait_expires_at <= NOW())
           ORDER BY created_at ASC
           LIMIT 20`,
        )
      ).rows.map(mapPool);

  for (const p of pools) {
    if (p.status === 'waiting') await markPoolReady(p.id);
    const fresh = (await getPool(p.id)) ?? p;
    if (!fresh.primaryRideId || fresh.status !== 'ready') continue;

    if (config.useMemoryDb) {
      const mp = memoryPools.find((x) => x.id === fresh.id);
      if (mp) mp.status = 'matching';
    } else {
      await pool.query(
        `UPDATE shared_ride_pools SET status = 'matching', matched_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [fresh.id],
      );
    }

    await startMatching(fresh.primaryRideId);
  }
}

export function startSharedPoolDispatcher() {
  const tick = () => {
    void dispatchReadyPools().catch((err) => console.error('shared pool dispatcher:', err.message));
  };
  tick();
  return setInterval(tick, 30_000);
}

export function toPublicPool(p: SharedRidePool, bookings: SharedRideBooking[]) {
  return {
    id: p.id,
    status: p.status,
    bookingCount: p.bookingCount,
    maxBookings: p.maxBookings,
    waitExpiresAt: p.waitExpiresAt?.toISOString(),
    primaryRideId: p.primaryRideId,
    bookings: bookings.map((b) => ({
      rideId: b.rideId,
      pickupOrder: b.pickupOrder,
      finalFareCentavos: b.finalFareCentavos,
      discountCentavos: b.discountCentavos,
      marginalFareCentavos: (b as SharedRideBooking & { marginalFareCentavos?: number }).marginalFareCentavos ?? 0,
      detourMin: b.detourMin,
    })),
  };
}

export function toPublicSharedQuote(q: SharedQuoteResult) {
  return {
    categoryCode: q.categoryCode,
    baseFareCentavos: q.baseFareCentavos,
    discountCentavos: q.discountCentavos,
    finalFareCentavos: q.finalFareCentavos,
    detourKm: q.detourKm,
    detourMin: q.detourMin,
    matchedPoolId: q.matchedPoolId,
    poolStatus: q.poolStatus,
    occupancyBonusDriver: q.occupancyBonusDriver,
    soloRide: q.soloRide,
  };
}
