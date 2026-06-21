import { randomUUID } from 'node:crypto';
import { getCategory } from '../domain/rideCategories.js';
import type { RideCategoryCode } from '../domain/types.js';
import type { EngineQuoteResult } from './pricingEngineService.js';
import { getActivePricingRule } from '../pricing/pricingRuleStore.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export interface DriverPayoutBreakdown {
  rideId?: string;
  driverUserId?: string;
  categoryCode: RideCategoryCode;
  passengerGrossCentavos: number;
  driverGrossCentavos: number;
  platformFeeCentavos: number;
  baseComponentCentavos: number;
  distanceComponentCentavos: number;
  timeComponentCentavos: number;
  dynamicShareCentavos: number;
  eliteBonusCentavos: number;
  tollRepassCentavos: number;
  airportShareCentavos: number;
  trafficSurchargeCentavos: number;
  passengerDiscountCentavos: number;
  incentivePreviewCentavos: number;
  dynamicMultiplier: number;
  driverDynamicShareBps: number;
  reputationTier?: string;
  labels: {
    driverPayout: string;
    passengerFare: string;
  };
}

const PREMIUM_CATEGORIES = new Set<RideCategoryCode>([
  'comfort',
  'executivo',
  'black',
  'suv',
  'aeroporto',
]);

const AIRPORT_DRIVER_SHARE_BPS = 7000;

export function computeEliteDynamicBonusPct(reputationTier?: string): number {
  switch (reputationTier) {
    case 'elite':
      return 0.03;
    case 'premium':
      return 0.02;
    case 'confiavel':
      return 0.01;
    default:
      return 0;
  }
}

export async function computeDriverPayoutBreakdown(input: {
  quote: EngineQuoteResult;
  driverUserId?: string;
  rideId?: string;
  passengerDiscountCentavos?: number;
  reputationTier?: string;
  hasOpenDispute?: boolean;
}): Promise<DriverPayoutBreakdown> {
  const category = getCategory(input.quote.categoryCode);
  if (!category) throw new Error('Categoria inválida');

  const rule = await getActivePricingRule(input.quote.categoryCode, input.quote.regionId);
  const takeRate = rule.takeRateBps / 10000;
  let driverDynamicShareBps = rule.driverDynamicShareBps;
  if (PREMIUM_CATEGORIES.has(input.quote.categoryCode) && driverDynamicShareBps < 7800) {
    driverDynamicShareBps = 7800;
  }
  const driverDynamicShare = driverDynamicShareBps / 10000;

  const passengerDiscount = input.passengerDiscountCentavos ?? 0;
  const baseComponent = input.quote.breakdown.base;
  const distanceComponent = input.quote.breakdown.distance;
  const timeComponent = input.quote.breakdown.time;
  const tollRepass = input.quote.breakdown.tolls ?? 0;
  const airportFee = input.quote.breakdown.airport ?? 0;
  const trafficSurcharge = input.quote.trafficSurchargeCentavos ?? 0;

  const fareBeforeDiscount =
    Math.max(
      input.quote.breakdown.minimum,
      baseComponent + distanceComponent + timeComponent + tollRepass + airportFee + trafficSurcharge,
    ) * input.quote.dynamicMultiplier;

  const dynamicDelta = Math.max(0, fareBeforeDiscount - Math.max(input.quote.breakdown.minimum, baseComponent + distanceComponent + timeComponent));

  const driverBase = Math.round((baseComponent + distanceComponent + timeComponent) * (1 - takeRate));
  const driverDynamic = Math.round(dynamicDelta * driverDynamicShare);
  const eliteBonusPct = computeEliteDynamicBonusPct(input.reputationTier);
  const eliteBonusCentavos = Math.round(driverDynamic * eliteBonusPct);
  const airportShareCentavos = Math.round(airportFee * (AIRPORT_DRIVER_SHARE_BPS / 10000));

  const incentivePreviewCentavos = input.hasOpenDispute ? 0 : eliteBonusCentavos;

  const driverGrossCentavos =
    driverBase + driverDynamic + eliteBonusCentavos + tollRepass + airportShareCentavos + trafficSurcharge;

  const passengerGrossCentavos = Math.max(0, input.quote.passengerFareCentavos);
  const platformFeeCentavos = Math.max(0, passengerGrossCentavos - driverGrossCentavos + passengerDiscount);

  const { formatFare } = await import('../domain/pricing.js');

  return {
    rideId: input.rideId,
    driverUserId: input.driverUserId,
    categoryCode: input.quote.categoryCode,
    passengerGrossCentavos,
    driverGrossCentavos,
    platformFeeCentavos,
    baseComponentCentavos: baseComponent,
    distanceComponentCentavos: distanceComponent,
    timeComponentCentavos: timeComponent,
    dynamicShareCentavos: driverDynamic,
    eliteBonusCentavos,
    tollRepassCentavos: tollRepass,
    airportShareCentavos,
    trafficSurchargeCentavos: trafficSurcharge,
    passengerDiscountCentavos: passengerDiscount,
    incentivePreviewCentavos,
    dynamicMultiplier: input.quote.dynamicMultiplier,
    driverDynamicShareBps,
    reputationTier: input.reputationTier,
    labels: {
      driverPayout: formatFare(driverGrossCentavos),
      passengerFare: formatFare(passengerGrossCentavos),
    },
  };
}

const memorySettlements = new Map<string, DriverPayoutBreakdown & { id: string; createdAt: Date }>();
const memoryIncentives: Array<{
  id: string;
  driverUserId: string;
  rideId?: string;
  incentiveType: string;
  amountCentavos: number;
  status: string;
}> = [];

export async function saveDriverPayoutSettlement(input: {
  breakdown: DriverPayoutBreakdown;
  paymentIntentId?: string;
}) {
  const id = randomUUID();
  const record = { ...input.breakdown, id, createdAt: new Date() };

  if (useMemory()) {
    if (input.breakdown.rideId) memorySettlements.set(input.breakdown.rideId, record);
    return record;
  }

  await pool.query(
    `INSERT INTO driver_payout_settlements
       (id, ride_id, driver_user_id, payment_intent_id, category_code,
        passenger_gross_centavos, driver_gross_centavos, platform_fee_centavos,
        base_component_centavos, distance_component_centavos, time_component_centavos,
        dynamic_share_centavos, elite_bonus_centavos, toll_repass_centavos, airport_share_centavos,
        traffic_surcharge_centavos, passenger_discount_centavos, incentive_preview_centavos,
        dynamic_multiplier, driver_dynamic_share_bps, reputation_tier, breakdown_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (ride_id) DO UPDATE SET
       driver_gross_centavos = EXCLUDED.driver_gross_centavos,
       platform_fee_centavos = EXCLUDED.platform_fee_centavos,
       breakdown_json = EXCLUDED.breakdown_json`,
    [
      id,
      input.breakdown.rideId,
      input.breakdown.driverUserId,
      input.paymentIntentId ?? null,
      input.breakdown.categoryCode,
      input.breakdown.passengerGrossCentavos,
      input.breakdown.driverGrossCentavos,
      input.breakdown.platformFeeCentavos,
      input.breakdown.baseComponentCentavos,
      input.breakdown.distanceComponentCentavos,
      input.breakdown.timeComponentCentavos,
      input.breakdown.dynamicShareCentavos,
      input.breakdown.eliteBonusCentavos,
      input.breakdown.tollRepassCentavos,
      input.breakdown.airportShareCentavos,
      input.breakdown.trafficSurchargeCentavos,
      input.breakdown.passengerDiscountCentavos,
      input.breakdown.incentivePreviewCentavos,
      input.breakdown.dynamicMultiplier,
      input.breakdown.driverDynamicShareBps,
      input.breakdown.reputationTier ?? null,
      JSON.stringify(input.breakdown),
    ],
  );

  if (input.breakdown.eliteBonusCentavos > 0 && input.breakdown.driverUserId) {
    await createIncentiveGrant({
      driverUserId: input.breakdown.driverUserId,
      rideId: input.breakdown.rideId,
      incentiveType: 'elite_bonus',
      amountCentavos: input.breakdown.eliteBonusCentavos,
      status: input.breakdown.incentivePreviewCentavos > 0 ? 'approved' : 'held',
      reason: `Bônus dinâmica faixa ${input.breakdown.reputationTier ?? 'padrão'}`,
    });
  }

  return record;
}

export async function getDriverPayoutSettlement(rideId: string): Promise<DriverPayoutBreakdown | null> {
  if (useMemory()) {
    const s = memorySettlements.get(rideId);
    if (!s) return null;
    const { id: _id, createdAt: _at, ...rest } = s;
    return rest;
  }

  const { rows } = await pool.query(
    `SELECT * FROM driver_payout_settlements WHERE ride_id = $1`,
    [rideId],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    rideId: row.ride_id as string,
    driverUserId: row.driver_user_id as string,
    categoryCode: row.category_code as RideCategoryCode,
    passengerGrossCentavos: row.passenger_gross_centavos as number,
    driverGrossCentavos: row.driver_gross_centavos as number,
    platformFeeCentavos: row.platform_fee_centavos as number,
    baseComponentCentavos: row.base_component_centavos as number,
    distanceComponentCentavos: row.distance_component_centavos as number,
    timeComponentCentavos: row.time_component_centavos as number,
    dynamicShareCentavos: row.dynamic_share_centavos as number,
    eliteBonusCentavos: row.elite_bonus_centavos as number,
    tollRepassCentavos: row.toll_repass_centavos as number,
    airportShareCentavos: row.airport_share_centavos as number,
    trafficSurchargeCentavos: row.traffic_surcharge_centavos as number,
    passengerDiscountCentavos: row.passenger_discount_centavos as number,
    incentivePreviewCentavos: row.incentive_preview_centavos as number,
    dynamicMultiplier: Number(row.dynamic_multiplier),
    driverDynamicShareBps: row.driver_dynamic_share_bps as number,
    reputationTier: (row.reputation_tier as string) ?? undefined,
    labels: {
      driverPayout: `R$ ${((row.driver_gross_centavos as number) / 100).toFixed(2).replace('.', ',')}`,
      passengerFare: `R$ ${((row.passenger_gross_centavos as number) / 100).toFixed(2).replace('.', ',')}`,
    },
  };
}

export async function getDriverPayoutSummary(driverUserId: string) {
  if (useMemory()) {
    const entries = [...memorySettlements.values()].filter((s) => s.driverUserId === driverUserId);
    const total = entries.reduce((sum, e) => sum + e.driverGrossCentavos, 0);
    const incentives = memoryIncentives.filter((i) => i.driverUserId === driverUserId && i.status === 'approved');
    return {
      totalGrossCentavos: total,
      rideCount: entries.length,
      pendingIncentiveCentavos: incentives.reduce((s, i) => s + i.amountCentavos, 0),
    };
  }

  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(driver_gross_centavos), 0)::int AS total,
       COUNT(*)::int AS rides
     FROM driver_payout_settlements WHERE driver_user_id = $1`,
    [driverUserId],
  );

  const { rows: incRows } = await pool.query(
    `SELECT COALESCE(SUM(amount_centavos), 0)::int AS total
     FROM driver_incentive_grants
     WHERE driver_user_id = $1 AND status IN ('approved', 'pending')`,
    [driverUserId],
  );

  return {
    totalGrossCentavos: rows[0]?.total ?? 0,
    rideCount: rows[0]?.rides ?? 0,
    pendingIncentiveCentavos: incRows[0]?.total ?? 0,
  };
}

export async function createIncentiveGrant(input: {
  driverUserId: string;
  rideId?: string;
  incentiveType: 'mission' | 'guarantee' | 'elite_bonus' | 'airport_bonus';
  amountCentavos: number;
  status?: 'pending' | 'approved' | 'paid' | 'held' | 'cancelled';
  reason?: string;
}) {
  const id = randomUUID();
  if (useMemory()) {
    memoryIncentives.push({
      id,
      driverUserId: input.driverUserId,
      rideId: input.rideId,
      incentiveType: input.incentiveType,
      amountCentavos: input.amountCentavos,
      status: input.status ?? 'pending',
    });
    return id;
  }

  await pool.query(
    `INSERT INTO driver_incentive_grants
       (id, driver_user_id, ride_id, incentive_type, amount_centavos, status, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      input.driverUserId,
      input.rideId ?? null,
      input.incentiveType,
      input.amountCentavos,
      input.status ?? 'pending',
      input.reason ?? null,
    ],
  );
  return id;
}

export function toPublicPayoutBreakdown(b: DriverPayoutBreakdown) {
  return {
    rideId: b.rideId,
    categoryCode: b.categoryCode,
    passengerGrossCentavos: b.passengerGrossCentavos,
    driverGrossCentavos: b.driverGrossCentavos,
    platformFeeCentavos: b.platformFeeCentavos,
    components: {
      base: b.baseComponentCentavos,
      distance: b.distanceComponentCentavos,
      time: b.timeComponentCentavos,
      dynamicShare: b.dynamicShareCentavos,
      eliteBonus: b.eliteBonusCentavos,
      tollRepass: b.tollRepassCentavos,
      airportShare: b.airportShareCentavos,
      trafficSurcharge: b.trafficSurchargeCentavos,
      passengerDiscount: b.passengerDiscountCentavos,
      incentivePreview: b.incentivePreviewCentavos,
    },
    dynamicMultiplier: b.dynamicMultiplier,
    driverDynamicShareBps: b.driverDynamicShareBps,
    reputationTier: b.reputationTier,
    labels: b.labels,
  };
}

export function __testResetPayoutMemory() {
  memorySettlements.clear();
  memoryIncentives.length = 0;
}
