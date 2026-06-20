import { config } from '../config.js';
import { pool } from '../db.js';
import type { RideCategoryCode } from '../domain/types.js';
import { DEFAULT_PRICING_REGION } from '../domain/pricing.js';

export interface PricingRuleVersion {
  id: string;
  ruleSetId: string;
  categoryCode: RideCategoryCode;
  regionId: string;
  baseFareCentavos: number;
  distanceRateCentavosKm: number;
  timeRateCentavosMin: number;
  minimumFareCentavos: number;
  bookingFeeCentavos: number;
  trafficCoefficient: number;
  takeRateBps: number;
  driverDynamicShareBps: number;
  regulatoryFeeCentavos: number;
}

const memoryRules = new Map<string, PricingRuleVersion>();

function ruleKey(regionId: string, categoryCode: string) {
  return `${regionId}:${categoryCode}`;
}

function fallbackRule(categoryCode: RideCategoryCode, regionId: string): PricingRuleVersion {
  return {
    id: 'memory-default',
    ruleSetId: 'memory',
    categoryCode,
    regionId,
    baseFareCentavos: DEFAULT_PRICING_REGION.baseFareCentavos,
    distanceRateCentavosKm: DEFAULT_PRICING_REGION.distanceRateCentavosKm,
    timeRateCentavosMin: DEFAULT_PRICING_REGION.timeRateCentavosMin,
    minimumFareCentavos: DEFAULT_PRICING_REGION.minimumFareCentavos,
    bookingFeeCentavos: DEFAULT_PRICING_REGION.bookingFeeCentavos,
    trafficCoefficient: DEFAULT_PRICING_REGION.trafficCoefficient,
    takeRateBps: 2200,
    driverDynamicShareBps: 7500,
    regulatoryFeeCentavos: 50,
  };
}

function mapRow(row: Record<string, unknown>): PricingRuleVersion {
  return {
    id: row.id as string,
    ruleSetId: row.rule_set_id as string,
    categoryCode: row.category_code as RideCategoryCode,
    regionId: row.region_id as string,
    baseFareCentavos: Number(row.base_fare_centavos),
    distanceRateCentavosKm: Number(row.distance_rate_centavos_km),
    timeRateCentavosMin: Number(row.time_rate_centavos_min),
    minimumFareCentavos: Number(row.minimum_fare_centavos),
    bookingFeeCentavos: Number(row.booking_fee_centavos),
    trafficCoefficient: Number(row.traffic_coefficient),
    takeRateBps: Number(row.take_rate_bps),
    driverDynamicShareBps: Number(row.driver_dynamic_share_bps),
    regulatoryFeeCentavos: Number(row.regulatory_fee_centavos),
  };
}

export async function getActivePricingRule(
  categoryCode: RideCategoryCode,
  regionId = config.defaultPricingRegionId,
): Promise<PricingRuleVersion> {
  if (config.useMemoryDb) {
    return memoryRules.get(ruleKey(regionId, categoryCode)) ?? fallbackRule(categoryCode, regionId);
  }

  const { rows } = await pool.query(
    `SELECT v.* FROM pricing_rule_versions v
     JOIN pricing_rule_sets s ON s.id = v.rule_set_id AND s.is_active = TRUE
     WHERE v.region_id = $1 AND v.category_code = $2
       AND v.effective_from <= NOW()
       AND (v.effective_to IS NULL OR v.effective_to > NOW())
     ORDER BY v.effective_from DESC LIMIT 1`,
    [regionId, categoryCode],
  );

  if (!rows[0]) return fallbackRule(categoryCode, regionId);
  return mapRow(rows[0]);
}

export function seedMemoryPricingRule(rule: PricingRuleVersion) {
  memoryRules.set(ruleKey(rule.regionId, rule.categoryCode), rule);
}
