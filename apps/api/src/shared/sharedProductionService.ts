import { config } from '../config.js';
import { pool } from '../db.js';
import { getTier } from '../domain/reputation.js';
import { getUserSegmentPolicy } from '../config/operationalParamsService.js';
import type { SharedCorridorConfig, SharedRoutePoint } from './sharedRideCorridor.js';
import {
  areRoutesCompatible,
  computeDetourDiscount,
  estimateRouteKmFromPoint,
  estimateCombinedRouteKm,
  estimateDetourBetween,
} from './sharedRideCorridor.js';

export interface MarginalFareAllocation {
  bookingId: string;
  rideId: string;
  directKm: number;
  marginalKm: number;
  marginalFareCentavos: number;
  detourDiscountCentavos: number;
  finalFareCentavos: number;
}

export interface SharedCorridorProductionConfig extends SharedCorridorConfig {
  minPassengerReputation: number;
  marginalRateCentavosKm: number;
  configVersion: string;
}

const memoryWindows: Array<{
  regionId?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}> = [{ regionId: config.defaultServiceRegionId, dayOfWeek: -1, startMinute: 0, endMinute: 1440 }];

const memoryEvents: Array<{ poolId: string; eventType: string; configVersion: string }> = [];

export async function getSharedProductionConfig(): Promise<SharedCorridorProductionConfig> {
  const { getCorridorConfig } = await import('./sharedRideService.js');
  const base = await getCorridorConfig();

  if (config.useMemoryDb) {
    return {
      ...base,
      minPassengerReputation: 4.5,
      marginalRateCentavosKm: 115,
      configVersion: 'camada37-memory-v1',
    };
  }

  const { rows } = await pool.query(
    `SELECT min_passenger_reputation, marginal_rate_centavos_km, config_version
     FROM shared_corridor_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const row = rows[0];
  return {
    ...base,
    minPassengerReputation: row ? Number(row.min_passenger_reputation) : 4.5,
    marginalRateCentavosKm: row ? Number(row.marginal_rate_centavos_km) : 115,
    configVersion: (row?.config_version as string) ?? 'camada37-v1',
  };
}

export async function assertSharedPassengerEligible(
  reputationScore: number,
  regionId = config.defaultServiceRegionId,
): Promise<{ tier: string; configVersion: string }> {
  const prodCfg = await getSharedProductionConfig();
  const tier = getTier(reputationScore);
  const segment = await getUserSegmentPolicy(tier, regionId);

  if (!segment.sharedRideEligible) {
    throw new Error('Seu segmento não permite viagens compartilhadas');
  }
  if (reputationScore < prodCfg.minPassengerReputation) {
    throw new Error('Reputação insuficiente para viagem compartilhada');
  }

  return { tier, configVersion: prodCfg.configVersion };
}

export function isWithinSharedTemporalWindow(
  at: Date,
  windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
): boolean {
  if (windows.length === 0) return true;
  const dow = at.getDay();
  const minute = at.getHours() * 60 + at.getMinutes();
  return windows.some((w) => {
    if (w.dayOfWeek >= 0 && w.dayOfWeek !== dow) return false;
    return minute >= w.startMinute && minute < w.endMinute;
  });
}

export async function loadSharedTemporalWindows(regionId = config.defaultServiceRegionId) {
  if (config.useMemoryDb) {
    return memoryWindows.filter((w) => !w.regionId || w.regionId === regionId);
  }
  const { rows } = await pool.query(
    `SELECT day_of_week, start_minute, end_minute
     FROM shared_temporal_windows
     WHERE is_active = TRUE AND (region_id = $1 OR region_id IS NULL)`,
    [regionId],
  );
  if (rows.length === 0) {
    return [{ dayOfWeek: -1, startMinute: 0, endMinute: 1440 }];
  }
  return rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    startMinute: Number(r.start_minute),
    endMinute: Number(r.end_minute),
  }));
}

export async function assertSharedTemporalWindow(regionId = config.defaultServiceRegionId) {
  const windows = await loadSharedTemporalWindows(regionId);
  if (!isWithinSharedTemporalWindow(new Date(), windows)) {
    throw new Error('Compartilhado indisponível neste horário');
  }
}

export function validateAllOccupantsCompatible(
  routes: SharedRoutePoint[],
  cfg: SharedCorridorConfig,
  baggageFlags: boolean[] = [],
): { ok: boolean; reason?: string; maxDetourMin: number; combinedKm: number } {
  if (routes.length < 2) {
    return { ok: true, maxDetourMin: 0, combinedKm: estimateRouteKmFromPoint(routes[0] ?? routes[0]) };
  }

  let maxDetourMin = 0;
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const compat = areRoutesCompatible(routes[i], routes[j], cfg, {
        hasLargeBaggageA: baggageFlags[i],
        hasLargeBaggageB: baggageFlags[j],
      });
      if (!compat.compatible) {
        return { ok: false, reason: compat.reason, maxDetourMin: 0, combinedKm: 0 };
      }
      maxDetourMin = Math.max(maxDetourMin, compat.detourMin);
    }
  }

  let combinedKm = estimateRouteKmFromPoint(routes[0]);
  for (let i = 1; i < routes.length; i++) {
    combinedKm = estimateCombinedRouteKm(
      { pickupLat: routes[0].pickupLat, pickupLng: routes[0].pickupLng, dropoffLat: routes[0].dropoffLat, dropoffLng: routes[0].dropoffLng },
      routes[i],
    );
  }

  if (maxDetourMin > cfg.maxDetourMin) {
    return { ok: false, reason: 'Desvio acima do SLA para todos os ocupantes', maxDetourMin, combinedKm };
  }

  return { ok: true, maxDetourMin, combinedKm };
}

export function computeMarginalFareAllocations(input: {
  bookings: Array<{
    id: string;
    rideId: string;
    baseFareCentavos: number;
    route: SharedRoutePoint;
  }>;
  cfg: SharedCorridorProductionConfig;
}): MarginalFareAllocation[] {
  if (input.bookings.length === 0) return [];
  if (input.bookings.length === 1) {
    const b = input.bookings[0];
    return [
      {
        bookingId: b.id,
        rideId: b.rideId,
        directKm: estimateRouteKmFromPoint(b.route),
        marginalKm: 0,
        marginalFareCentavos: 0,
        detourDiscountCentavos: 0,
        finalFareCentavos: b.baseFareCentavos,
      },
    ];
  }

  const routes = input.bookings.map((b) => b.route);
  const directKms = routes.map(estimateRouteKmFromPoint);
  const directSum = directKms.reduce((a, v) => a + v, 0);
  const { detourKm, detourMin } = estimateDetourBetween(routes[0], routes[1]);
  const combinedKm = estimateCombinedRouteKm(routes[0], routes[1]);
  const marginalTotalCentavos = Math.round(detourKm * input.cfg.marginalRateCentavosKm);

  return input.bookings.map((b, idx) => {
    const share = directSum > 0 ? directKms[idx]! / directSum : 0.5;
    const detourDiscountCentavos = computeDetourDiscount(b.baseFareCentavos, detourMin, input.cfg.maxDetourMin);
    const marginalCreditCentavos = Math.round(marginalTotalCentavos * share);
    const finalFareCentavos = Math.max(
      0,
      b.baseFareCentavos - detourDiscountCentavos - marginalCreditCentavos,
    );
    return {
      bookingId: b.id,
      rideId: b.rideId,
      directKm: directKms[idx]!,
      marginalKm: Math.round(detourKm * share * 1000) / 1000,
      marginalFareCentavos: marginalCreditCentavos,
      detourDiscountCentavos,
      finalFareCentavos,
    };
  });
}

export async function applyMarginalFaresToPool(poolId: string) {
  const { getPoolBookings } = await import('./sharedRideService.js');
  const bookings = await getPoolBookings(poolId);
  if (bookings.length < 2) return [];

  const prodCfg = await getSharedProductionConfig();
  const routes = bookings.map((b) => ({
    pickupLat: b.pickupLat,
    pickupLng: b.pickupLng,
    dropoffLat: b.dropoffLat,
    dropoffLng: b.dropoffLng,
  }));
  const sla = validateAllOccupantsCompatible(routes, prodCfg, bookings.map((b) => b.hasLargeBaggage));
  if (!sla.ok) {
    await recordSharedPoolEvent(poolId, 'sla_detour_violation', prodCfg.configVersion, {
      reason: sla.reason,
      maxDetourMin: sla.maxDetourMin,
    });
    throw new Error(sla.reason ?? 'SLA de desvio violado para o pool');
  }

  const allocations = computeMarginalFareAllocations({
    bookings: bookings.map((b) => ({
      id: b.id,
      rideId: b.rideId,
      baseFareCentavos: b.baseFareCentavos,
      route: {
        pickupLat: b.pickupLat,
        pickupLng: b.pickupLng,
        dropoffLat: b.dropoffLat,
        dropoffLng: b.dropoffLng,
      },
    })),
    cfg: prodCfg,
  });

  for (const alloc of allocations) {
    const booking = bookings.find((b) => b.id === alloc.bookingId);
    if (!booking) continue;

    if (config.useMemoryDb) {
      booking.marginalFareCentavos = alloc.marginalFareCentavos;
      booking.discountCentavos = alloc.detourDiscountCentavos;
      booking.finalFareCentavos = alloc.finalFareCentavos;
    } else {
      await pool.query(
        `UPDATE shared_ride_bookings
         SET discount_centavos = $2, final_fare_centavos = $3, marginal_fare_centavos = $4,
             detour_km = $5, detour_min = $6, pricing_config_version = $7
         WHERE id = $1`,
        [
          alloc.bookingId,
          alloc.detourDiscountCentavos,
          alloc.finalFareCentavos,
          alloc.marginalFareCentavos,
          sla.combinedKm > 0 ? sla.combinedKm - alloc.directKm : 0,
          sla.maxDetourMin,
          prodCfg.configVersion,
        ],
      );
      await pool.query(
        `INSERT INTO shared_marginal_fare_allocations
           (pool_id, booking_id, ride_id, direct_km, marginal_km, marginal_fare_centavos,
            detour_discount_centavos, final_fare_centavos, config_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (booking_id) DO UPDATE SET
           marginal_km = EXCLUDED.marginal_km,
           marginal_fare_centavos = EXCLUDED.marginal_fare_centavos,
           detour_discount_centavos = EXCLUDED.detour_discount_centavos,
           final_fare_centavos = EXCLUDED.final_fare_centavos,
           config_version = EXCLUDED.config_version`,
        [
          poolId,
          alloc.bookingId,
          alloc.rideId,
          alloc.directKm,
          alloc.marginalKm,
          alloc.marginalFareCentavos,
          alloc.detourDiscountCentavos,
          alloc.finalFareCentavos,
          prodCfg.configVersion,
        ],
      );
    }
  }

  if (!config.useMemoryDb) {
    await pool.query(
      `UPDATE shared_ride_pools
       SET combined_route_km = $2, sla_detour_min = $3, pricing_config_version = $4, updated_at = NOW()
       WHERE id = $1`,
      [poolId, sla.combinedKm, sla.maxDetourMin, prodCfg.configVersion],
    );
  }

  await recordSharedPoolEvent(poolId, 'marginal_fare_applied', prodCfg.configVersion, {
    allocations: allocations.length,
    maxDetourMin: sla.maxDetourMin,
  });

  return allocations;
}

export async function recordSharedPoolEvent(
  poolId: string,
  eventType: string,
  configVersion: string,
  metadata: Record<string, unknown> = {},
) {
  if (config.useMemoryDb) {
    memoryEvents.push({ poolId, eventType, configVersion });
    return;
  }
  await pool.query(
    `INSERT INTO shared_pool_events (pool_id, event_type, config_version, metadata_json)
     VALUES ($1,$2,$3,$4)`,
    [poolId, eventType, configVersion, JSON.stringify(metadata)],
  );
}

export function seedMemoryTemporalWindow(input: {
  regionId?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}) {
  memoryWindows.push(input);
}

export function __testResetSharedProductionMemory() {
  memoryWindows.length = 0;
  memoryWindows.push({ regionId: config.defaultServiceRegionId, dayOfWeek: -1, startMinute: 0, endMinute: 1440 });
  memoryEvents.length = 0;
}

export function __testGetSharedPoolEvents() {
  return memoryEvents;
}
