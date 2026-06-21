import { getCategory } from '../domain/rideCategories.js';
import {
  clampDynamic,
  computeDynamicMultiplierRaw,
} from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory, memoryMatchStore } from '../stores/memoryMatchStore.js';
import { getRegionalWeatherPressure } from '../weather/weatherService.js';
import { computeEventPressure } from '../events/eventSurgeService.js';

export interface DynamicPricingFactors {
  demandPressure: number;
  weatherPressure: number;
  eventPressure: number;
  airportPressure: number;
  trafficPressure: number;
  supplyShortage: number;
  timePressure: number;
  conversionPressure: number;
}

const memorySnapshots = new Map<string, { multiplier: number; at: Date; factors: DynamicPricingFactors }>();

function snapshotKey(regionId: string, categoryCode: string) {
  return `${regionId}:${categoryCode}`;
}

async function countOpenRides(): Promise<number> {
  if (useMemory()) {
    return (await memoryMatchStore.findOnlineDrivers()).filter((d) => d.activeRideId).length + 2;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM rides WHERE status IN ('REQUESTED','OFFERING','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS')`,
  );
  return rows[0]?.c ?? 0;
}

async function countOnlineDrivers(): Promise<number> {
  if (useMemory()) {
    return (await memoryMatchStore.findOnlineDrivers()).filter((d) => d.isOnline).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM drivers WHERE is_online = TRUE AND operational_status = 'online'`,
  );
  return rows[0]?.c ?? 0;
}

function hourPressure(): number {
  const hour = new Date().getHours();
  if (hour >= 7 && hour <= 9) return 0.12;
  if (hour >= 17 && hour <= 20) return 0.15;
  if (hour >= 22 || hour <= 5) return 0.08;
  return 0;
}

export async function computeLiveFactors(lat?: number, lng?: number): Promise<DynamicPricingFactors> {
  const openRides = await countOpenRides();
  const onlineDrivers = Math.max(1, await countOnlineDrivers());
  const demandRatio = openRides / onlineDrivers;
  const demandPressure = Math.max(1, Math.min(2.2, 0.85 + demandRatio * 0.35));
  const supplyShortage = Math.max(0, demandRatio - 1) * 0.5;

  let weatherPressure = 0;
  if (config.weatherApiEnabled) {
    try {
      if (lat != null && lng != null) {
        const { getWeatherAtPoint } = await import('../weather/weatherService.js');
        const snap = await getWeatherAtPoint(lat, lng, config.defaultServiceRegionId);
        weatherPressure = snap.weatherPressure;
      } else {
        weatherPressure = await getRegionalWeatherPressure(config.defaultServiceRegionId);
      }
    } catch {
      weatherPressure = 0;
    }
  }

  const eventPressure = await computeEventPressure(lat, lng, undefined);

  return {
    demandPressure,
    weatherPressure,
    eventPressure,
    airportPressure: 0,
    trafficPressure: Math.min(0.25, supplyShortage * 0.3),
    supplyShortage,
    timePressure: hourPressure(),
    conversionPressure: 0,
  };
}

export async function refreshDynamicPricing(
  categoryCode: RideCategoryCode,
  regionId = config.defaultPricingRegionId,
  context?: { lat?: number; lng?: number },
) {
  const category = getCategory(categoryCode);
  if (!category) throw new Error('Categoria inválida');

  const factors = await computeLiveFactors(context?.lat, context?.lng);
  const multiplierRaw = computeDynamicMultiplierRaw(factors);

  let emaInput = multiplierRaw;
  if (!useMemory()) {
    const { rows } = await pool.query(
      `SELECT multiplier_raw FROM dynamic_pricing_snapshots
       WHERE region_id = $1 AND category_code = $2
       ORDER BY snapshot_at DESC LIMIT 1`,
      [regionId, categoryCode],
    );
    if (rows[0]) {
      const prev = Number(rows[0].multiplier_raw);
      emaInput = 0.35 * multiplierRaw + 0.65 * prev;
    }
  }

  const multiplierEffective = clampDynamic(emaInput, category.dynamicCap);

  if (useMemory()) {
    memorySnapshots.set(snapshotKey(regionId, categoryCode), {
      multiplier: multiplierEffective,
      at: new Date(),
      factors,
    });
    return { categoryCode, regionId, multiplierEffective, factors };
  }

  await pool.query(
    `INSERT INTO dynamic_pricing_snapshots
       (region_id, category_code, demand_pressure, weather_pressure, event_pressure, airport_pressure,
        traffic_pressure, supply_shortage, time_pressure, conversion_pressure, multiplier_raw, multiplier_effective)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      regionId,
      categoryCode,
      factors.demandPressure,
      factors.weatherPressure,
      factors.eventPressure,
      factors.airportPressure,
      factors.trafficPressure,
      factors.supplyShortage,
      factors.timePressure,
      factors.conversionPressure,
      multiplierRaw,
      multiplierEffective,
    ],
  );

  return { categoryCode, regionId, multiplierEffective, factors };
}

export async function getDynamicMultiplier(
  categoryCode: RideCategoryCode,
  regionId = config.defaultPricingRegionId,
  context?: { lat?: number; lng?: number },
) {
  if (useMemory()) {
    const cached = memorySnapshots.get(snapshotKey(regionId, categoryCode));
    if (cached && Date.now() - cached.at.getTime() < 5 * 60_000) {
      return cached.multiplier;
    }
    const fresh = await refreshDynamicPricing(categoryCode, regionId, context);
    return fresh.multiplierEffective;
  }

  const { rows } = await pool.query(
    `SELECT multiplier_effective, snapshot_at FROM dynamic_pricing_snapshots
     WHERE region_id = $1 AND category_code = $2
     ORDER BY snapshot_at DESC LIMIT 1`,
    [regionId, categoryCode],
  );

  if (rows[0]) {
    const age = Date.now() - new Date(rows[0].snapshot_at as string).getTime();
    if (age < 5 * 60_000) return Number(rows[0].multiplier_effective);
  }

  const fresh = await refreshDynamicPricing(categoryCode, regionId, context);
  return fresh.multiplierEffective;
}

export async function quoteWithDynamicPricing(
  categoryCode: RideCategoryCode,
  distanceKm: number,
  durationMin: number,
  context?: { lat?: number; lng?: number; toLat?: number; toLng?: number; trafficIndex?: number },
) {
  const { quoteWithEngine } = await import('./pricingEngineService.js');
  return quoteWithEngine(categoryCode, distanceKm, durationMin, context);
}
