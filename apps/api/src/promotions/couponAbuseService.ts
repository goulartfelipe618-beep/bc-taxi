import { createHash } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { listActiveBlocks } from '../fraud/fraudEnforcementService.js';
import type { PromoCodeRecord } from './couponService.js';

export interface CouponAbuseContext {
  userId: string;
  promo: PromoCodeRecord;
  deviceId?: string;
  paymentFingerprint?: string;
  regionId?: string;
  stackedPromoCodes?: string[];
}

export interface CouponAbuseCheck {
  allowed: boolean;
  reason?: string;
  reasonCode?: string;
  abuseDelta?: number;
  eligibilityFactor?: number;
}

interface AbuseProfile {
  userId: string;
  abuseScore: number;
  promoEligibilityFactor: number;
  blockedUntil?: Date;
}

const memoryProfiles = new Map<string, AbuseProfile>();
const memoryRedemptionKeys: Array<{
  promoId: string;
  userId: string;
  deviceId?: string;
  fingerprint?: string;
  regionId?: string;
  incompatibleGroup?: string;
  createdAt: Date;
}> = [];
const memoryEvents: Array<{ userId: string; eventType: string; reasonCode: string }> = [];

function computeEligibilityFactor(abuseScore: number): number {
  if (abuseScore >= 0.8) return 0;
  if (abuseScore >= 0.6) return 0.35;
  if (abuseScore >= 0.4) return 0.65;
  if (abuseScore >= 0.2) return 0.85;
  return 1;
}

export function fingerprintPaymentMethod(userId: string, paymentMethodId: string): string {
  return createHash('sha256').update(`${userId}:${paymentMethodId}`).digest('hex').slice(0, 32);
}

export async function resolvePaymentFingerprint(
  userId: string,
  paymentMethodId?: string,
): Promise<string | undefined> {
  if (!paymentMethodId) return undefined;
  if (useMemory()) return fingerprintPaymentMethod(userId, paymentMethodId);

  const { rows } = await pool.query(
    `SELECT fingerprint_hash, last_four, method_type FROM payment_methods WHERE id = $1 AND user_id = $2`,
    [paymentMethodId, userId],
  );
  if (!rows[0]) return fingerprintPaymentMethod(userId, paymentMethodId);
  if (rows[0].fingerprint_hash) return rows[0].fingerprint_hash as string;
  return createHash('sha256')
    .update(`${rows[0].method_type}:${rows[0].last_four ?? paymentMethodId}`)
    .digest('hex')
    .slice(0, 32);
}

async function getAbuseProfile(userId: string): Promise<AbuseProfile> {
  if (useMemory()) {
    return (
      memoryProfiles.get(userId) ?? {
        userId,
        abuseScore: 0,
        promoEligibilityFactor: 1,
      }
    );
  }
  const { rows } = await pool.query(`SELECT * FROM coupon_abuse_profiles WHERE user_id = $1`, [userId]);
  if (!rows[0]) {
    return { userId, abuseScore: 0, promoEligibilityFactor: 1 };
  }
  return {
    userId,
    abuseScore: Number(rows[0].abuse_score),
    promoEligibilityFactor: Number(rows[0].promo_eligibility_factor),
    blockedUntil: rows[0].blocked_until ? new Date(rows[0].blocked_until as string) : undefined,
  };
}

async function bumpAbuseScore(userId: string, delta: number, reasonCode: string) {
  const profile = await getAbuseProfile(userId);
  profile.abuseScore = Math.min(1, profile.abuseScore + delta);
  profile.promoEligibilityFactor = computeEligibilityFactor(profile.abuseScore);

  if (useMemory()) {
    memoryProfiles.set(userId, profile);
    return profile;
  }

  await pool.query(
    `INSERT INTO coupon_abuse_profiles (user_id, abuse_score, promo_eligibility_factor, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       abuse_score = LEAST(1, coupon_abuse_profiles.abuse_score + $4),
       promo_eligibility_factor = $3,
       updated_at = NOW()`,
    [userId, profile.abuseScore, profile.promoEligibilityFactor, delta],
  );
  void reasonCode;
  return profile;
}

export async function recordCouponAbuseEvent(input: {
  userId: string;
  promoId?: string;
  deviceId?: string;
  paymentFingerprint?: string;
  regionId?: string;
  eventType: string;
  reasonCode: string;
  abuseDelta?: number;
}) {
  const delta = input.abuseDelta ?? 0.05;
  if (useMemory()) {
    memoryEvents.push({ userId: input.userId, eventType: input.eventType, reasonCode: input.reasonCode });
  } else {
    await pool.query(
      `INSERT INTO coupon_abuse_events
         (user_id, promo_code_id, device_id, payment_fingerprint_hash, region_id, event_type, reason_code, abuse_delta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.userId,
        input.promoId ?? null,
        input.deviceId ?? null,
        input.paymentFingerprint ?? null,
        input.regionId ?? null,
        input.eventType,
        input.reasonCode,
        delta,
      ],
    );
  }
  await bumpAbuseScore(input.userId, delta, input.reasonCode);
}

async function countDeviceRedemptions(promoId: string, deviceId: string): Promise<number> {
  if (useMemory()) {
    return memoryRedemptionKeys.filter((r) => r.promoId === promoId && r.deviceId === deviceId).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM coupon_redemption_audit
     WHERE promo_code_id = $1 AND device_id = $2 AND status = 'applied'`,
    [promoId, deviceId],
  );
  return rows[0]?.c ?? 0;
}

async function countFingerprintRedemptions(promoId: string, fingerprint: string): Promise<number> {
  if (useMemory()) {
    return memoryRedemptionKeys.filter((r) => r.promoId === promoId && r.fingerprint === fingerprint).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM coupon_redemption_audit
     WHERE promo_code_id = $1 AND payment_fingerprint_hash = $2 AND status = 'applied'`,
    [promoId, fingerprint],
  );
  return rows[0]?.c ?? 0;
}

async function countAcquisitionReuse(promoKind: string, fingerprint: string, userId: string): Promise<number> {
  if (promoKind !== 'acquisition') return 0;
  if (useMemory()) {
    return memoryRedemptionKeys.filter(
      (r) => r.fingerprint === fingerprint && r.userId !== userId,
    ).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT cra.user_id)::int AS c
     FROM coupon_redemption_audit cra
     JOIN promo_codes pc ON pc.id = cra.promo_code_id
     WHERE pc.promo_kind = 'acquisition'
       AND cra.payment_fingerprint_hash = $1
       AND cra.user_id <> $2
       AND cra.status = 'applied'`,
    [fingerprint, userId],
  );
  return rows[0]?.c ?? 0;
}

async function hasIncompatibleGroupRedemption(
  userId: string,
  incompatibleGroup: string,
  withinDays = 30,
): Promise<boolean> {
  if (useMemory()) {
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    return memoryRedemptionKeys.some(
      (r) =>
        r.userId === userId &&
        r.incompatibleGroup === incompatibleGroup &&
        r.createdAt.getTime() >= cutoff,
    );
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM coupon_redemption_audit cra
     JOIN promo_codes pc ON pc.id = cra.promo_code_id
     WHERE cra.user_id = $1
       AND pc.incompatible_group = $2
       AND cra.status = 'applied'
       AND cra.created_at > NOW() - ($3 || ' days')::interval`,
    [userId, incompatibleGroup, String(withinDays)],
  );
  return (rows[0]?.c ?? 0) > 0;
}

async function countRegionDailyRedemptions(promoId: string, regionId: string): Promise<number> {
  if (useMemory()) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    return memoryRedemptionKeys.filter(
      (r) => r.promoId === promoId && r.regionId === regionId && r.createdAt >= dayStart,
    ).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM coupon_redemption_audit
     WHERE promo_code_id = $1 AND region_id = $2 AND status = 'applied'
       AND created_at >= date_trunc('day', NOW())`,
    [promoId, regionId],
  );
  return rows[0]?.c ?? 0;
}

export async function assessCouponAbuse(input: CouponAbuseContext): Promise<CouponAbuseCheck> {
  const promoBlocks = await listActiveBlocks({
    userId: input.userId,
    deviceId: input.deviceId,
    blockScope: 'promo',
  });
  if (promoBlocks.length > 0) {
    return {
      allowed: false,
      reason: 'Promoções bloqueadas por análise de risco',
      reasonCode: 'PROMO_BLOCK_ACTIVE',
      abuseDelta: 0.02,
    };
  }

  const profile = await getAbuseProfile(input.userId);
  if (profile.blockedUntil && profile.blockedUntil > new Date()) {
    return {
      allowed: false,
      reason: 'Elegibilidade a promoções temporariamente suspensa',
      reasonCode: 'PROMO_SUSPENDED',
    };
  }
  if (profile.promoEligibilityFactor <= 0) {
    return {
      allowed: false,
      reason: 'Score de abuso de cupons reduziu elegibilidade a promoções',
      reasonCode: 'ELIGIBILITY_EXHAUSTED',
      eligibilityFactor: profile.promoEligibilityFactor,
    };
  }

  if (input.promo.regionId && input.regionId && input.promo.regionId !== input.regionId) {
    return {
      allowed: false,
      reason: 'Cupom não válido nesta região',
      reasonCode: 'REGION_MISMATCH',
      abuseDelta: 0.03,
    };
  }

  if (input.promo.maxPerRegionDaily != null && input.regionId) {
    const regionUses = await countRegionDailyRedemptions(input.promo.id, input.regionId);
    if (regionUses >= input.promo.maxPerRegionDaily) {
      return {
        allowed: false,
        reason: 'Limite diário regional do cupom atingido',
        reasonCode: 'REGION_LIMIT',
        abuseDelta: 0.04,
      };
    }
  }

  if (input.deviceId && input.promo.maxPerDevice != null) {
    const deviceUses = await countDeviceRedemptions(input.promo.id, input.deviceId);
    if (deviceUses >= input.promo.maxPerDevice) {
      return {
        allowed: false,
        reason: 'Limite de uso do cupom neste dispositivo atingido',
        reasonCode: 'DEVICE_LIMIT',
        abuseDelta: 0.08,
      };
    }
  }

  if (input.paymentFingerprint) {
    const fpUses = await countFingerprintRedemptions(input.promo.id, input.paymentFingerprint);
    const maxFp = input.promo.maxPerPaymentFingerprint ?? (input.promo.promoKind === 'acquisition' ? 1 : undefined);
    if (maxFp != null && fpUses >= maxFp) {
      return {
        allowed: false,
        reason: 'Limite de uso do cupom para esta forma de pagamento atingido',
        reasonCode: 'PAYMENT_FINGERPRINT_LIMIT',
        abuseDelta: 0.1,
      };
    }

    const identityReuse = await countAcquisitionReuse(
      input.promo.promoKind ?? 'general',
      input.paymentFingerprint,
      input.userId,
    );
    if (identityReuse > 0) {
      return {
        allowed: false,
        reason: 'Cupom de aquisição já utilizado por identidade financeira vinculada',
        reasonCode: 'IDENTITY_REUSE',
        abuseDelta: 0.15,
      };
    }
  }

  if (input.promo.incompatibleGroup) {
    const used = await hasIncompatibleGroupRedemption(input.userId, input.promo.incompatibleGroup);
    if (used) {
      return {
        allowed: false,
        reason: 'Cupom incompatível com promoção recente do mesmo grupo',
        reasonCode: 'INCOMPATIBLE_GROUP',
        abuseDelta: 0.06,
      };
    }
  }

  if (input.stackedPromoCodes && input.stackedPromoCodes.length > 1) {
    return {
      allowed: false,
      reason: 'Não é permitido combinar múltiplos cupons',
      reasonCode: 'STACKING_FORBIDDEN',
      abuseDelta: 0.05,
    };
  }

  return { allowed: true, eligibilityFactor: profile.promoEligibilityFactor };
}

export async function getPromoEligibility(userId: string) {
  const profile = await getAbuseProfile(userId);
  return {
    abuseScore: profile.abuseScore,
    promoEligibilityFactor: profile.promoEligibilityFactor,
    blockedUntil: profile.blockedUntil?.toISOString(),
    eligible: profile.promoEligibilityFactor > 0,
  };
}

export function trackRedemptionForAbuse(input: {
  promoId: string;
  userId: string;
  deviceId?: string;
  fingerprint?: string;
  regionId?: string;
  incompatibleGroup?: string;
}) {
  if (!useMemory()) return;
  memoryRedemptionKeys.push({
    ...input,
    createdAt: new Date(),
  });
}

export function __testResetCouponAbuseMemory() {
  memoryProfiles.clear();
  memoryRedemptionKeys.length = 0;
  memoryEvents.length = 0;
}
