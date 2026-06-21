import { getCategory } from '../domain/rideCategories.js';
import { clampDynamic, computeDynamicMultiplierRaw } from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory, memoryMatchStore } from '../stores/memoryMatchStore.js';
import { getRegionalWeatherPressure } from '../weather/weatherService.js';
import { computeEventPressure } from '../events/eventSurgeService.js';
import { computeAirportPressure } from '../airport/airportService.js';
import {
  appendCalculationLog,
  getRecentCalculationLogs,
  getRegionGuardConfig,
  type DynamicGuardFlags,
} from './dynamicPricingGuardStore.js';
import {
  DYNAMIC_PRICING_CALC_VERSION,
  finalizeDynamicMultiplier,
} from './dynamicPricingGuardService.js';

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

export interface DynamicPricingSnapshot {
  categoryCode: RideCategoryCode;
  regionId: string;
  multiplierRaw: number;
  multiplierEffective: number;
  factors: DynamicPricingFactors;
  guardFlags: DynamicGuardFlags[];
  calculationVersion: string;
}

const memorySnapshots = new Map<
  string,
  { multiplier: number; raw: number; at: Date; factors: DynamicPricingFactors; guardFlags: DynamicGuardFlags[] }
>();

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

async function countRecentRideRequests(windowMinutes = 10): Promise<number> {
  if (useMemory()) return 8;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM rides WHERE created_at > NOW() - ($1 || ' minutes')::INTERVAL`,
    [String(windowMinutes)],
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

async function computeConversionPressure(): Promise<number> {
  if (useMemory()) return 0.04;
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE result_status IN ('timeout', 'cancelled'))::float /
       NULLIF(COUNT(*)::float, 0) AS rejection_rate
     FROM ride_match_attempts
     WHERE started_at > NOW() - INTERVAL '15 minutes'`,
  );
  const rate = Number(rows[0]?.rejection_rate ?? 0);
  return Math.min(0.2, Math.max(0, rate * 0.25));
}

function hourPressure(): number {
  const hour = new Date().getHours();
  if (hour >= 7 && hour <= 9) return 0.12;
  if (hour >= 17 && hour <= 20) return 0.15;
  if (hour >= 22 || hour <= 5) return 0.08;
  return 0;
}

export async function computeLiveFactors(
  lat?: number,
  lng?: number,
  trafficIndex?: number,
): Promise<DynamicPricingFactors> {
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
  const airportPressure = await computeAirportPressure(lat, lng, undefined);
  const conversionPressure = await computeConversionPressure();
  const trafficFromIndex = trafficIndex != null ? Math.min(0.35, trafficIndex * 0.4) : supplyShortage * 0.3;

  return {
    demandPressure,
    weatherPressure,
    eventPressure,
    airportPressure,
    trafficPressure: Math.max(trafficFromIndex, Math.min(0.25, supplyShortage * 0.3)),
    supplyShortage,
    timePressure: hourPressure(),
    conversionPressure,
  };
}

async function getPreviousMultiplier(regionId: string, categoryCode: string) {
  if (useMemory()) {
    const cached = memorySnapshots.get(snapshotKey(regionId, categoryCode));
    return cached?.multiplier;
  }

  const { rows } = await pool.query(
    `SELECT multiplier_effective FROM dynamic_pricing_snapshots
     WHERE region_id = $1 AND category_code = $2
     ORDER BY snapshot_at DESC LIMIT 1`,
    [regionId, categoryCode],
  );
  return rows[0] ? Number(rows[0].multiplier_effective) : undefined;
}

export async function refreshDynamicPricing(
  categoryCode: RideCategoryCode,
  regionId = config.defaultPricingRegionId,
  context?: { lat?: number; lng?: number; trafficIndex?: number },
): Promise<DynamicPricingSnapshot> {
  const category = getCategory(categoryCode);
  if (!category) throw new Error('Categoria inválida');

  const guard = await getRegionGuardConfig(regionId);
  const factors = await computeLiveFactors(context?.lat, context?.lng, context?.trafficIndex);
  const multiplierRaw = computeDynamicMultiplierRaw(factors);
  const previousMultiplier = await getPreviousMultiplier(regionId, categoryCode);
  const recentLogs = await getRecentCalculationLogs(regionId, categoryCode, 5);
  const recentEffectiveMultipliers = recentLogs.map((l) => l.multiplierEffective);
  const recentRequestCount = await countRecentRideRequests();
  const onlineDrivers = await countOnlineDrivers();

  const finalized = finalizeDynamicMultiplier({
    multiplierRaw,
    previousMultiplier,
    recentEffectiveMultipliers,
    recentRequestCount,
    onlineDrivers,
    categoryCap: category.dynamicCap,
    regulatoryMaxMultiplier: guard.regulatoryMaxMultiplier,
    minSampleRequests: guard.minSampleRequests,
    minOnlineDrivers: guard.minOnlineDrivers,
    conservativeMode: guard.conservativeMode,
    conservativeMaxMultiplier: guard.conservativeMaxMultiplier,
  });

  const multiplierEffective = clampDynamic(finalized.multiplierEffective, category.dynamicCap);

  if (useMemory()) {
    memorySnapshots.set(snapshotKey(regionId, categoryCode), {
      multiplier: multiplierEffective,
      raw: multiplierRaw,
      at: new Date(),
      factors,
      guardFlags: finalized.guardFlags,
    });
    return {
      categoryCode,
      regionId,
      multiplierRaw,
      multiplierEffective,
      factors,
      guardFlags: finalized.guardFlags,
      calculationVersion: DYNAMIC_PRICING_CALC_VERSION,
    };
  }

  await pool.query(
    `INSERT INTO dynamic_pricing_snapshots
       (region_id, category_code, demand_pressure, weather_pressure, event_pressure, airport_pressure,
        traffic_pressure, supply_shortage, time_pressure, conversion_pressure, multiplier_raw,
        multiplier_effective, guard_flags, calculation_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
      JSON.stringify(finalized.guardFlags),
      DYNAMIC_PRICING_CALC_VERSION,
    ],
  );

  await appendCalculationLog({
    regionId,
    categoryCode,
    multiplierRaw,
    multiplierEffective,
    previousMultiplier,
    factors,
    guardFlags: finalized.guardFlags,
  });

  return {
    categoryCode,
    regionId,
    multiplierRaw,
    multiplierEffective,
    factors,
    guardFlags: finalized.guardFlags,
    calculationVersion: DYNAMIC_PRICING_CALC_VERSION,
  };
}

export async function getDynamicMultiplier(
  categoryCode: RideCategoryCode,
  regionId = config.defaultPricingRegionId,
  context?: { lat?: number; lng?: number; trafficIndex?: number },
) {
  if (useMemory()) {
    const cached = memorySnapshots.get(snapshotKey(regionId, categoryCode));
    if (cached && Date.now() - cached.at.getTime() < 2 * 60_000) {
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
    if (age < 2 * 60_000) return Number(rows[0].multiplier_effective);
  }

  const fresh = await refreshDynamicPricing(categoryCode, regionId, context);
  return fresh.multiplierEffective;
}

export async function quoteWithDynamicPricing(
  categoryCode: RideCategoryCode,
  distanceKm: number,
  durationMin: number,
  context?: { lat?: number; lng?: number; toLat?: number; toLng?: number; trafficIndex?: number; rideId?: string },
) {
  const { quoteWithEngine } = await import('./pricingEngineService.js');
  return quoteWithEngine(categoryCode, distanceKm, durationMin, context);
}

const REFRESH_CATEGORIES: RideCategoryCode[] = [
  'economico',
  'comfort',
  'executivo',
  'moto',
  'aeroporto',
  'compartilhado',
];

export async function refreshAllDynamicPricing(regionId = config.defaultPricingRegionId) {
  const results: DynamicPricingSnapshot[] = [];
  for (const categoryCode of REFRESH_CATEGORIES) {
    results.push(await refreshDynamicPricing(categoryCode, regionId));
  }
  return results;
}

export function startDynamicPricingScheduler() {
  void refreshAllDynamicPricing();
  return setInterval(() => {
    void refreshAllDynamicPricing();
  }, 2 * 60_000);
}
