import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import type { DynamicPricingFactors } from './dynamicPricingService.js';

export type DynamicGuardFlags =
  | 'MIN_SAMPLE_HOLD'
  | 'HYSTERESIS_HOLD'
  | 'SPIKE_CAPPED'
  | 'CONSERVATIVE_MODE'
  | 'REGULATORY_CAP'
  | 'GPS_FRAUD_CONSERVATIVE';

export interface RegionGuardConfig {
  regionId: string;
  regulatoryMaxMultiplier: number;
  minSampleRequests: number;
  minOnlineDrivers: number;
  conservativeMode: boolean;
  conservativeMaxMultiplier: number;
}

export interface CalculationLogRecord {
  id: string;
  regionId: string;
  categoryCode: string;
  multiplierRaw: number;
  multiplierEffective: number;
  previousMultiplier?: number;
  factors: DynamicPricingFactors;
  guardFlags: DynamicGuardFlags[];
  createdAt: Date;
}

export interface RideDynamicLock {
  rideId: string;
  regionId: string;
  categoryCode: string;
  lockedMultiplier: number;
  factors: DynamicPricingFactors;
  calculationLogId?: string;
  lockedAt: Date;
}

const DEFAULT_GUARD: RegionGuardConfig = {
  regionId: '00000000-0000-4000-8000-000000000010',
  regulatoryMaxMultiplier: 2.5,
  minSampleRequests: 5,
  minOnlineDrivers: 3,
  conservativeMode: false,
  conservativeMaxMultiplier: 1.15,
};

const memoryGuards = new Map<string, RegionGuardConfig>();
const memoryLogs: CalculationLogRecord[] = [];
const memoryLocks = new Map<string, RideDynamicLock>();

export async function getRegionGuardConfig(regionId: string): Promise<RegionGuardConfig> {
  if (useMemory()) {
    return memoryGuards.get(regionId) ?? { ...DEFAULT_GUARD, regionId };
  }

  const { rows } = await pool.query(
    `SELECT region_id, regulatory_max_multiplier, min_sample_requests, min_online_drivers,
            conservative_mode, conservative_max_multiplier
     FROM dynamic_pricing_region_guards WHERE region_id = $1`,
    [regionId],
  );
  if (!rows[0]) return { ...DEFAULT_GUARD, regionId };

  return {
    regionId,
    regulatoryMaxMultiplier: Number(rows[0].regulatory_max_multiplier),
    minSampleRequests: rows[0].min_sample_requests as number,
    minOnlineDrivers: rows[0].min_online_drivers as number,
    conservativeMode: Boolean(rows[0].conservative_mode),
    conservativeMaxMultiplier: Number(rows[0].conservative_max_multiplier),
  };
}

export async function setRegionConservativeMode(regionId: string, enabled: boolean) {
  if (useMemory()) {
    const current = await getRegionGuardConfig(regionId);
    memoryGuards.set(regionId, { ...current, conservativeMode: enabled });
    return;
  }

  await pool.query(
    `INSERT INTO dynamic_pricing_region_guards (region_id, conservative_mode, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (region_id) DO UPDATE SET conservative_mode = EXCLUDED.conservative_mode, updated_at = NOW()`,
    [regionId, enabled],
  );
}

export async function appendCalculationLog(input: {
  regionId: string;
  categoryCode: string;
  multiplierRaw: number;
  multiplierEffective: number;
  previousMultiplier?: number;
  factors: DynamicPricingFactors;
  guardFlags: DynamicGuardFlags[];
}): Promise<string> {
  const id = randomUUID();
  const record: CalculationLogRecord = {
    id,
    regionId: input.regionId,
    categoryCode: input.categoryCode,
    multiplierRaw: input.multiplierRaw,
    multiplierEffective: input.multiplierEffective,
    previousMultiplier: input.previousMultiplier,
    factors: input.factors,
    guardFlags: input.guardFlags,
    createdAt: new Date(),
  };

  if (useMemory()) {
    memoryLogs.unshift(record);
    return id;
  }

  await pool.query(
    `INSERT INTO dynamic_pricing_calculation_logs
       (id, region_id, category_code, multiplier_raw, multiplier_effective, previous_multiplier,
        factors_json, guard_flags, calculation_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'camada24-v1')`,
    [
      id,
      input.regionId,
      input.categoryCode,
      input.multiplierRaw,
      input.multiplierEffective,
      input.previousMultiplier ?? null,
      JSON.stringify(input.factors),
      JSON.stringify(input.guardFlags),
    ],
  );

  return id;
}

export async function getRecentCalculationLogs(regionId: string, categoryCode: string, limit = 10) {
  if (useMemory()) {
    return memoryLogs
      .filter((l) => l.regionId === regionId && l.categoryCode === categoryCode)
      .slice(0, limit);
  }

  const { rows } = await pool.query(
    `SELECT id, multiplier_raw, multiplier_effective, previous_multiplier, factors_json,
            guard_flags, created_at
     FROM dynamic_pricing_calculation_logs
     WHERE region_id = $1 AND category_code = $2
     ORDER BY created_at DESC LIMIT $3`,
    [regionId, categoryCode, limit],
  );

  return rows.map((row) => ({
    id: row.id as string,
    multiplierRaw: Number(row.multiplier_raw),
    multiplierEffective: Number(row.multiplier_effective),
    previousMultiplier: row.previous_multiplier != null ? Number(row.previous_multiplier) : undefined,
    factors: row.factors_json as DynamicPricingFactors,
    guardFlags: row.guard_flags as DynamicGuardFlags[],
    createdAt: new Date(row.created_at as string),
  }));
}

export async function saveRideDynamicLock(input: {
  rideId: string;
  regionId: string;
  categoryCode: string;
  lockedMultiplier: number;
  factors: DynamicPricingFactors;
  calculationLogId?: string;
}) {
  const lock: RideDynamicLock = {
    rideId: input.rideId,
    regionId: input.regionId,
    categoryCode: input.categoryCode,
    lockedMultiplier: input.lockedMultiplier,
    factors: input.factors,
    calculationLogId: input.calculationLogId,
    lockedAt: new Date(),
  };

  if (useMemory()) {
    memoryLocks.set(input.rideId, lock);
    return lock;
  }

  await pool.query(
    `INSERT INTO ride_dynamic_locks
       (ride_id, region_id, category_code, locked_multiplier, factors_json, calculation_log_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (ride_id) DO NOTHING`,
    [
      input.rideId,
      input.regionId,
      input.categoryCode,
      input.lockedMultiplier,
      JSON.stringify(input.factors),
      input.calculationLogId ?? null,
    ],
  );

  return lock;
}

export async function getRideDynamicLock(rideId: string): Promise<RideDynamicLock | null> {
  if (useMemory()) return memoryLocks.get(rideId) ?? null;

  const { rows } = await pool.query(
    `SELECT ride_id, region_id, category_code, locked_multiplier, factors_json, calculation_log_id, locked_at
     FROM ride_dynamic_locks WHERE ride_id = $1`,
    [rideId],
  );
  if (!rows[0]) return null;

  return {
    rideId: rows[0].ride_id as string,
    regionId: rows[0].region_id as string,
    categoryCode: rows[0].category_code as string,
    lockedMultiplier: Number(rows[0].locked_multiplier),
    factors: rows[0].factors_json as DynamicPricingFactors,
    calculationLogId: (rows[0].calculation_log_id as string) ?? undefined,
    lockedAt: new Date(rows[0].locked_at as string),
  };
}

export function __testResetMemoryGuards() {
  memoryGuards.clear();
  memoryLogs.length = 0;
  memoryLocks.clear();
}
