import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export type DiscountType = 'percent' | 'fixed';

export interface PromoCodeRecord {
  id: string;
  code: string;
  label: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCentavos?: number;
  minFareCentavos: number;
  maxRedemptions?: number;
  maxPerUser: number;
  validFrom: Date;
  validTo?: Date;
  categoryCodes?: string[];
  cofundedBps: number;
  isActive: boolean;
  promoKind?: 'general' | 'acquisition' | 'retention' | 'referral';
  campaignId?: string;
  incompatibleGroup?: string;
  maxPerDevice?: number;
  maxPerPaymentFingerprint?: number;
  maxPerRegionDaily?: number;
  regionId?: string;
}

export interface CouponValidation {
  valid: boolean;
  promo?: PromoCodeRecord;
  discountCentavos: number;
  fareAfterCentavos: number;
  reason?: string;
}

const memoryPromos: PromoCodeRecord[] = [
  {
    id: 'promo-bctaxi10',
    code: 'BCTAXI10',
    label: '10% de desconto',
    discountType: 'percent',
    discountValue: 10,
    maxDiscountCentavos: 800,
    minFareCentavos: 1000,
    maxPerUser: 5,
    validFrom: new Date(),
    cofundedBps: 0,
    isActive: true,
    promoKind: 'general',
    incompatibleGroup: 'percent_stack',
    maxPerDevice: 3,
  },
  {
    id: 'promo-primeira15',
    code: 'PRIMEIRA15',
    label: 'R$ 15 na primeira corrida',
    discountType: 'fixed',
    discountValue: 1500,
    minFareCentavos: 2000,
    maxPerUser: 1,
    validFrom: new Date(),
    cofundedBps: 0,
    isActive: true,
    promoKind: 'acquisition',
    incompatibleGroup: 'first_ride',
    maxPerDevice: 1,
    maxPerPaymentFingerprint: 1,
  },
];

const memoryRedemptions: Array<{ promoCodeId: string; userId: string; discountCentavos: number }> = [];

function mapPromoRow(row: Record<string, unknown>): PromoCodeRecord {
  return {
    id: row.id as string,
    code: row.code as string,
    label: row.label as string,
    discountType: row.discount_type as DiscountType,
    discountValue: Number(row.discount_value),
    maxDiscountCentavos: row.max_discount_centavos != null ? Number(row.max_discount_centavos) : undefined,
    minFareCentavos: Number(row.min_fare_centavos),
    maxRedemptions: row.max_redemptions != null ? Number(row.max_redemptions) : undefined,
    maxPerUser: Number(row.max_per_user),
    validFrom: new Date(row.valid_from as string),
    validTo: row.valid_to ? new Date(row.valid_to as string) : undefined,
    categoryCodes: (row.category_codes as string[]) ?? undefined,
    cofundedBps: Number(row.cofunded_bps),
    isActive: Boolean(row.is_active),
    promoKind: (row.promo_kind as PromoCodeRecord['promoKind']) ?? 'general',
    campaignId: (row.campaign_id as string) ?? undefined,
    incompatibleGroup: (row.incompatible_group as string) ?? undefined,
    maxPerDevice: row.max_per_device != null ? Number(row.max_per_device) : undefined,
    maxPerPaymentFingerprint:
      row.max_per_payment_fingerprint != null ? Number(row.max_per_payment_fingerprint) : undefined,
    maxPerRegionDaily: row.max_per_region_daily != null ? Number(row.max_per_region_daily) : undefined,
    regionId: (row.region_id as string) ?? undefined,
  };
}

function computeDiscount(promo: PromoCodeRecord, fareCentavos: number): number {
  if (fareCentavos < promo.minFareCentavos) return 0;
  let discount =
    promo.discountType === 'percent'
      ? Math.round(fareCentavos * (promo.discountValue / 100))
      : promo.discountValue;
  if (promo.maxDiscountCentavos != null) {
    discount = Math.min(discount, promo.maxDiscountCentavos);
  }
  return Math.min(discount, Math.max(0, fareCentavos - 100));
}

async function countUserRedemptions(promoId: string, userId: string): Promise<number> {
  if (config.useMemoryDb) {
    return memoryRedemptions.filter((r) => r.promoCodeId === promoId && r.userId === userId).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM coupon_redemption_audit
     WHERE promo_code_id = $1 AND user_id = $2 AND status = 'applied'`,
    [promoId, userId],
  );
  return rows[0]?.c ?? 0;
}

async function countTotalRedemptions(promoId: string): Promise<number> {
  if (config.useMemoryDb) {
    return memoryRedemptions.filter((r) => r.promoCodeId === promoId).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM coupon_redemption_audit WHERE promo_code_id = $1 AND status = 'applied'`,
    [promoId],
  );
  return rows[0]?.c ?? 0;
}

export async function getPromoByCode(code: string): Promise<PromoCodeRecord | null> {
  const normalized = code.trim().toUpperCase();
  if (config.useMemoryDb) {
    return memoryPromos.find((p) => p.code === normalized && p.isActive) ?? null;
  }
  const { rows } = await pool.query(
    `SELECT * FROM promo_codes WHERE UPPER(code) = $1 AND is_active = TRUE`,
    [normalized],
  );
  return rows[0] ? mapPromoRow(rows[0]) : null;
}

export async function listActivePromos() {
  if (config.useMemoryDb) {
    return memoryPromos.filter((p) => p.isActive).map((p) => ({
      code: p.code,
      label: p.label,
      discountType: p.discountType,
      discountValue: p.discountValue,
    }));
  }
  const { rows } = await pool.query(
    `SELECT code, label, discount_type, discount_value FROM promo_codes
     WHERE is_active = TRUE AND (valid_to IS NULL OR valid_to > NOW())
     ORDER BY code`,
  );
  return rows.map((r) => ({
    code: r.code as string,
    label: r.label as string,
    discountType: r.discount_type as string,
    discountValue: Number(r.discount_value),
  }));
}

export async function validatePromoCode(input: {
  code: string;
  userId: string;
  categoryCode: string;
  fareCentavos: number;
  deviceId?: string;
  paymentFingerprint?: string;
  regionId?: string;
  stackedPromoCodes?: string[];
}): Promise<CouponValidation> {
  const promo = await getPromoByCode(input.code);
  if (!promo) {
    return { valid: false, discountCentavos: 0, fareAfterCentavos: input.fareCentavos, reason: 'Cupom inválido' };
  }

  const now = Date.now();
  if (promo.validFrom.getTime() > now) {
    return { valid: false, discountCentavos: 0, fareAfterCentavos: input.fareCentavos, reason: 'Cupom ainda não válido' };
  }
  if (promo.validTo && promo.validTo.getTime() < now) {
    return { valid: false, discountCentavos: 0, fareAfterCentavos: input.fareCentavos, reason: 'Cupom expirado' };
  }
  if (promo.categoryCodes?.length && !promo.categoryCodes.includes(input.categoryCode)) {
    return { valid: false, discountCentavos: 0, fareAfterCentavos: input.fareCentavos, reason: 'Cupom não válido para esta categoria' };
  }

  const userUses = await countUserRedemptions(promo.id, input.userId);
  if (userUses >= promo.maxPerUser) {
    return { valid: false, discountCentavos: 0, fareAfterCentavos: input.fareCentavos, reason: 'Limite de uso do cupom atingido' };
  }

  if (promo.maxRedemptions != null) {
    const total = await countTotalRedemptions(promo.id);
    if (total >= promo.maxRedemptions) {
      return { valid: false, discountCentavos: 0, fareAfterCentavos: input.fareCentavos, reason: 'Cupom esgotado' };
    }
  }

  const discountCentavos = computeDiscount(promo, input.fareCentavos);
  if (discountCentavos <= 0) {
    return { valid: false, discountCentavos: 0, fareAfterCentavos: input.fareCentavos, reason: 'Valor mínimo não atingido' };
  }

  const { assessCouponAbuse, recordCouponAbuseEvent } = await import('./couponAbuseService.js');
  const abuseCheck = await assessCouponAbuse({
    userId: input.userId,
    promo,
    deviceId: input.deviceId,
    paymentFingerprint: input.paymentFingerprint,
    regionId: input.regionId,
    stackedPromoCodes: input.stackedPromoCodes ?? [input.code.toUpperCase()],
  });
  if (!abuseCheck.allowed) {
    if (abuseCheck.abuseDelta) {
      await recordCouponAbuseEvent({
        userId: input.userId,
        promoId: promo.id,
        deviceId: input.deviceId,
        paymentFingerprint: input.paymentFingerprint,
        regionId: input.regionId,
        eventType: 'VALIDATION_BLOCKED',
        reasonCode: abuseCheck.reasonCode ?? 'VALIDATION_BLOCKED',
        abuseDelta: abuseCheck.abuseDelta,
      });
    }
    return {
      valid: false,
      discountCentavos: 0,
      fareAfterCentavos: input.fareCentavos,
      reason: abuseCheck.reason ?? 'Cupom bloqueado por política antifraude',
    };
  }

  const factor = abuseCheck.eligibilityFactor ?? 1;
  const adjustedDiscount = factor < 1 ? Math.round(discountCentavos * factor) : discountCentavos;
  if (adjustedDiscount <= 0) {
    return {
      valid: false,
      discountCentavos: 0,
      fareAfterCentavos: input.fareCentavos,
      reason: 'Elegibilidade reduzida por score de abuso de cupons',
    };
  }

  return {
    valid: true,
    promo,
    discountCentavos: adjustedDiscount,
    fareAfterCentavos: input.fareCentavos - adjustedDiscount,
  };
}

export async function recordCouponRedemption(input: {
  promo: PromoCodeRecord;
  userId: string;
  fareBeforeCentavos: number;
  discountCentavos: number;
  rideId?: string;
  scheduledRideId?: string;
  deviceId?: string;
  paymentFingerprint?: string;
  regionId?: string;
}) {
  const fareAfter = input.fareBeforeCentavos - input.discountCentavos;

  if (config.useMemoryDb) {
    memoryRedemptions.push({
      promoCodeId: input.promo.id,
      userId: input.userId,
      discountCentavos: input.discountCentavos,
    });
    const { trackRedemptionForAbuse } = await import('./couponAbuseService.js');
    trackRedemptionForAbuse({
      promoId: input.promo.id,
      userId: input.userId,
      deviceId: input.deviceId,
      fingerprint: input.paymentFingerprint,
      regionId: input.regionId,
      incompatibleGroup: input.promo.incompatibleGroup,
    });
    return { id: randomUUID() };
  }

  const { rows } = await pool.query(
    `INSERT INTO coupon_redemption_audit
      (promo_code_id, user_id, ride_id, scheduled_ride_id, discount_centavos, fare_before_centavos, fare_after_centavos,
       device_id, payment_fingerprint_hash, region_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      input.promo.id,
      input.userId,
      input.rideId ?? null,
      input.scheduledRideId ?? null,
      input.discountCentavos,
      input.fareBeforeCentavos,
      fareAfter,
      input.deviceId ?? null,
      input.paymentFingerprint ?? null,
      input.regionId ?? null,
    ],
  );
  return { id: rows[0].id as string };
}

export async function linkRedemptionToRide(redemptionId: string, rideId: string) {
  if (config.useMemoryDb) return;
  await pool.query(`UPDATE coupon_redemption_audit SET ride_id = $2 WHERE id = $1`, [redemptionId, rideId]);
}
