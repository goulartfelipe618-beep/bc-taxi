import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getCategory } from '../domain/rideCategories.js';
import { getActivePricingRule } from '../pricing/pricingRuleStore.js';
import type { RideCategoryCode, ReputationTier } from '../domain/types.js';

export interface ArrivalWaitPolicy {
  includedWaitMinutes: number;
  perMinuteCentavos: number;
}

export interface CancellationFeePolicy {
  freeWindowSeconds: number;
  feeCentavos: number;
}

export interface PcdPriorityRules {
  matchWeightBonus: number;
}

export interface AirportFeeRules {
  terminalCongestionCap: number;
}

export interface CategoryOperationalParams {
  regionId: string;
  categoryCode: string;
  configVersion: string;
  dynamicCap: number;
  driverDynamicShareBps: number;
  searchRadiusStagesM: number[];
  offerTimeoutSeconds: number;
  cashAllowedMinReputation: number;
  premiumMinReputation: number;
  arrivalWaitPolicy: ArrivalWaitPolicy;
  cancellationFeePolicy: CancellationFeePolicy;
  pcdPriorityRules: PcdPriorityRules;
  airportFeeRules: AirportFeeRules;
  baseFareCentavos?: number;
  distanceRateCentavosKm?: number;
  timeRateCentavosMin?: number;
  minimumFareCentavos?: number;
}

export interface UserSegmentPolicy {
  regionId: string;
  reputationTier: ReputationTier | string;
  configVersion: string;
  dispatchPriorityPct: number;
  allowedPaymentMethods: string[];
  promoEligible: boolean;
  sharedRideEligible: boolean;
  premiumCategoryEligible: boolean;
  antifraudLevel: string;
}

const DEFAULT_REGION = config.defaultServiceRegionId;

const memoryCategoryParams = new Map<string, CategoryOperationalParams>();
const memorySegmentPolicies = new Map<string, UserSegmentPolicy>();
const memorySnapshots: Array<{ rideId: string; configVersion: string }> = [];

function paramKey(regionId: string, categoryCode: string) {
  return `${regionId}:${categoryCode}`;
}

function segmentKey(regionId: string, tier: string) {
  return `${regionId}:${tier}`;
}

function domainDefaults(categoryCode: string, regionId: string): CategoryOperationalParams {
  const category = getCategory(categoryCode as RideCategoryCode);
  return {
    regionId,
    categoryCode,
    configVersion: 'domain-static',
    dynamicCap: category?.dynamicCap ?? 2.2,
    driverDynamicShareBps: 7500,
    searchRadiusStagesM: category?.searchRadiusStagesM ?? [800, 1500, 2500, 4000, 6500, 10000],
    offerTimeoutSeconds: category?.offerTimeoutSeconds ?? 8,
    cashAllowedMinReputation: 4.0,
    premiumMinReputation: category?.driverRequirements.minRating ?? 4.75,
    arrivalWaitPolicy: { includedWaitMinutes: 3, perMinuteCentavos: 80 },
    cancellationFeePolicy: { freeWindowSeconds: 180, feeCentavos: 600 },
    pcdPriorityRules: { matchWeightBonus: 0.08 },
    airportFeeRules: { terminalCongestionCap: 1.15 },
  };
}

function defaultSegmentPolicy(regionId: string, tier: string): UserSegmentPolicy {
  return {
    regionId,
    reputationTier: tier,
    configVersion: 'domain-static',
    dispatchPriorityPct: 0,
    allowedPaymentMethods: ['pix', 'card', 'cash'],
    promoEligible: tier !== 'restrito' && tier !== 'observacao',
    sharedRideEligible: tier !== 'restrito',
    premiumCategoryEligible: tier === 'elite' || tier === 'premium',
    antifraudLevel: tier === 'restrito' ? 'elevated' : 'standard',
  };
}

function mapCategoryRow(row: Record<string, unknown>, regionId: string, categoryCode: string): Partial<CategoryOperationalParams> {
  return {
    configVersion: row.config_version as string,
    dynamicCap: row.dynamic_cap != null ? Number(row.dynamic_cap) : undefined,
    driverDynamicShareBps: row.driver_dynamic_share_bps != null ? Number(row.driver_dynamic_share_bps) : undefined,
    searchRadiusStagesM: row.search_radius_stages_m as number[] | undefined,
    offerTimeoutSeconds: row.offer_timeout_seconds != null ? Number(row.offer_timeout_seconds) : undefined,
    cashAllowedMinReputation:
      row.cash_allowed_min_reputation != null ? Number(row.cash_allowed_min_reputation) : undefined,
    premiumMinReputation:
      row.premium_min_reputation != null ? Number(row.premium_min_reputation) : undefined,
    arrivalWaitPolicy: row.arrival_wait_policy_json as ArrivalWaitPolicy | undefined,
    cancellationFeePolicy: row.cancellation_fee_policy_json as CancellationFeePolicy | undefined,
    pcdPriorityRules: row.pcd_priority_rules_json as PcdPriorityRules | undefined,
    airportFeeRules: row.airport_fee_rules_json as AirportFeeRules | undefined,
    regionId,
    categoryCode,
  };
}

function mergeParams(
  base: CategoryOperationalParams,
  override: Partial<CategoryOperationalParams>,
): CategoryOperationalParams {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined)),
    arrivalWaitPolicy: override.arrivalWaitPolicy ?? base.arrivalWaitPolicy,
    cancellationFeePolicy: override.cancellationFeePolicy ?? base.cancellationFeePolicy,
    pcdPriorityRules: override.pcdPriorityRules ?? base.pcdPriorityRules,
    airportFeeRules: override.airportFeeRules ?? base.airportFeeRules,
    configVersion: override.configVersion ?? base.configVersion,
  };
}

export async function getCategoryOperationalParams(
  categoryCode: string,
  regionId = DEFAULT_REGION,
): Promise<CategoryOperationalParams> {
  if (config.useMemoryDb) {
    const cached = memoryCategoryParams.get(paramKey(regionId, categoryCode));
    if (cached) return cached;
    return domainDefaults(categoryCode, regionId);
  }

  const { rows } = await pool.query(
    `SELECT e.* FROM operational_param_entries e
     JOIN operational_param_sets s ON s.id = e.param_set_id AND s.is_active = TRUE
     WHERE e.region_id = $1 AND e.category_code = $2
       AND e.effective_from <= NOW()
       AND (e.effective_to IS NULL OR e.effective_to > NOW())
     ORDER BY e.effective_from DESC LIMIT 1`,
    [regionId, categoryCode],
  );

  const base = domainDefaults(categoryCode, regionId);
  if (!rows[0]) return base;
  return mergeParams(base, mapCategoryRow(rows[0], regionId, categoryCode));
}

export async function getUserSegmentPolicy(
  reputationTier: string,
  regionId = DEFAULT_REGION,
): Promise<UserSegmentPolicy> {
  if (config.useMemoryDb) {
    return memorySegmentPolicies.get(segmentKey(regionId, reputationTier))
      ?? defaultSegmentPolicy(regionId, reputationTier);
  }

  const { rows } = await pool.query(
    `SELECT * FROM user_segment_policies
     WHERE region_id = $1 AND reputation_tier = $2
       AND effective_from <= NOW()
       AND (effective_to IS NULL OR effective_to > NOW())
     ORDER BY effective_from DESC LIMIT 1`,
    [regionId, reputationTier],
  );

  if (!rows[0]) return defaultSegmentPolicy(regionId, reputationTier);
  const row = rows[0];
  return {
    regionId,
    reputationTier: row.reputation_tier as string,
    configVersion: row.config_version as string,
    dispatchPriorityPct: Number(row.dispatch_priority_pct),
    allowedPaymentMethods: row.allowed_payment_methods as string[],
    promoEligible: Boolean(row.promo_eligible),
    sharedRideEligible: Boolean(row.shared_ride_eligible),
    premiumCategoryEligible: Boolean(row.premium_category_eligible),
    antifraudLevel: row.antifraud_level as string,
  };
}

export async function resolveDynamicCap(
  categoryCode: string,
  regionId = DEFAULT_REGION,
): Promise<number> {
  const params = await getCategoryOperationalParams(categoryCode, regionId);
  return params.dynamicCap;
}

export async function resolveRadiusStages(
  categoryCode: string,
  regionId = DEFAULT_REGION,
): Promise<number[]> {
  const params = await getCategoryOperationalParams(categoryCode, regionId);
  return params.searchRadiusStagesM;
}

export async function resolveOfferTimeoutSeconds(
  categoryCode: string,
  regionId = DEFAULT_REGION,
): Promise<number> {
  const params = await getCategoryOperationalParams(categoryCode, regionId);
  return params.offerTimeoutSeconds;
}

export async function isPaymentMethodAllowed(
  method: string,
  reputationTier: string,
  regionId = DEFAULT_REGION,
): Promise<boolean> {
  const policy = await getUserSegmentPolicy(reputationTier, regionId);
  return policy.allowedPaymentMethods.includes(method);
}

export async function isPromoEligibleForTier(
  reputationTier: string,
  regionId = DEFAULT_REGION,
): Promise<boolean> {
  const policy = await getUserSegmentPolicy(reputationTier, regionId);
  return policy.promoEligible;
}

export async function buildOperationalParamsWithPricing(
  categoryCode: string,
  regionId = DEFAULT_REGION,
): Promise<CategoryOperationalParams> {
  const params = await getCategoryOperationalParams(categoryCode, regionId);
  const rule = await getActivePricingRule(categoryCode as RideCategoryCode, regionId);
  return {
    ...params,
    baseFareCentavos: rule.baseFareCentavos,
    distanceRateCentavosKm: rule.distanceRateCentavosKm,
    timeRateCentavosMin: rule.timeRateCentavosMin,
    minimumFareCentavos: rule.minimumFareCentavos,
    driverDynamicShareBps: params.driverDynamicShareBps ?? rule.driverDynamicShareBps,
  };
}

export async function captureRideOperationalConfigSnapshot(input: {
  rideId: string;
  categoryCode: string;
  regionId?: string;
  reputationTier?: string;
}) {
  const regionId = input.regionId ?? DEFAULT_REGION;
  const params = await buildOperationalParamsWithPricing(input.categoryCode, regionId);
  const segment = input.reputationTier
    ? await getUserSegmentPolicy(input.reputationTier, regionId)
    : null;

  const payload = {
    regionId,
    categoryCode: input.categoryCode,
    configVersion: params.configVersion,
    params,
    segmentPolicy: segment,
  };

  if (config.useMemoryDb) {
    memorySnapshots.push({ rideId: input.rideId, configVersion: params.configVersion });
    return { id: randomUUID(), ...payload };
  }

  const { rows } = await pool.query(
    `INSERT INTO ride_operational_config_snapshots
       (ride_id, region_id, category_code, config_version, params_json, segment_policy_json)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      input.rideId,
      regionId,
      input.categoryCode,
      params.configVersion,
      JSON.stringify(params),
      JSON.stringify(segment ?? {}),
    ],
  );
  return { id: rows[0].id as string, ...payload };
}

export async function getRideOperationalConfigSnapshot(rideId: string) {
  if (config.useMemoryDb) {
    const snap = memorySnapshots.find((s) => s.rideId === rideId);
    return snap ? { rideId, configVersion: snap.configVersion } : null;
  }
  const { rows } = await pool.query(
    `SELECT * FROM ride_operational_config_snapshots WHERE ride_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [rideId],
  );
  return rows[0] ?? null;
}

export function seedMemoryOperationalParams(input: {
  regionId: string;
  categoryCode: string;
  params: Partial<CategoryOperationalParams> & { configVersion: string };
}) {
  const base = domainDefaults(input.categoryCode, input.regionId);
  memoryCategoryParams.set(
    paramKey(input.regionId, input.categoryCode),
    mergeParams(base, input.params),
  );
}

export function seedMemorySegmentPolicy(policy: UserSegmentPolicy) {
  memorySegmentPolicies.set(segmentKey(policy.regionId, policy.reputationTier as string), policy);
}

export function __testResetOperationalParamsMemory() {
  memoryCategoryParams.clear();
  memorySegmentPolicies.clear();
  memorySnapshots.length = 0;
}
