process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    validatePromoCode,
    recordCouponRedemption,
    getPromoByCode,
  } = await import('../src/promotions/couponService.js');
  const {
    assessCouponAbuse,
    getPromoEligibility,
    fingerprintPaymentMethod,
    trackRedemptionForAbuse,
    __testResetCouponAbuseMemory,
  } = await import('../src/promotions/couponAbuseService.js');

  __testResetCouponAbuseMemory();

  const userA = randomUUID();
  const userB = randomUUID();
  const deviceId = 'camada28-device';
  const paymentFp = fingerprintPaymentMethod(userA, 'pix-demo');

  const primeira = await getPromoByCode('PRIMEIRA15');
  if (!primeira || primeira.promoKind !== 'acquisition') {
    throw new Error('PRIMEIRA15 should be acquisition promo');
  }

  const ok = await validatePromoCode({
    code: 'PRIMEIRA15',
    userId: userA,
    categoryCode: 'economico',
    fareCentavos: 5000,
    deviceId,
    paymentFingerprint: paymentFp,
  });
  if (!ok.valid) throw new Error(`First validation failed: ${ok.reason}`);
  console.log('PRIMEIRA15 discount:', ok.discountCentavos);

  await recordCouponRedemption({
    promo: primeira,
    userId: userA,
    fareBeforeCentavos: 5000,
    discountCentavos: ok.discountCentavos,
    deviceId,
    paymentFingerprint: paymentFp,
  });

  trackRedemptionForAbuse({
    promoId: primeira.id,
    userId: userA,
    deviceId,
    fingerprint: paymentFp,
    incompatibleGroup: primeira.incompatibleGroup,
  });

  const reuseDevice = await validatePromoCode({
    code: 'PRIMEIRA15',
    userId: userB,
    categoryCode: 'economico',
    fareCentavos: 5000,
    deviceId,
    paymentFingerprint: fingerprintPaymentMethod(userB, 'pix-demo'),
  });
  if (reuseDevice.valid) throw new Error('Should block acquisition reuse on shared device');

  const reuseFp = await validatePromoCode({
    code: 'PRIMEIRA15',
    userId: userB,
    categoryCode: 'economico',
    fareCentavos: 5000,
    deviceId: 'other-device',
    paymentFingerprint: paymentFp,
  });
  if (reuseFp.valid) throw new Error('Should block acquisition reuse on shared payment fingerprint');
  console.log('Acquisition blocks:', reuseDevice.reason, '|', reuseFp.reason);

  const bctaxi = await getPromoByCode('BCTAXI10');
  if (!bctaxi) throw new Error('BCTAXI10 missing');

  trackRedemptionForAbuse({
    promoId: bctaxi.id,
    userId: userA,
    incompatibleGroup: bctaxi.incompatibleGroup,
  });

  const incompatible = await validatePromoCode({
    code: 'PRIMEIRA15',
    userId: userA,
    categoryCode: 'economico',
    fareCentavos: 5000,
    deviceId: 'fresh-device',
    paymentFingerprint: fingerprintPaymentMethod(userA, 'card-demo'),
  });
  if (incompatible.valid) throw new Error('Should block incompatible group redemption');
  console.log('Incompatible group:', incompatible.reason);

  const stack = await assessCouponAbuse({
    userId: userA,
    promo: bctaxi,
    stackedPromoCodes: ['BCTAXI10', 'PRIMEIRA15'],
  });
  if (stack.allowed) throw new Error('Stacking should be forbidden');

  const eligibility = await getPromoEligibility(userB);
  if (eligibility.abuseScore <= 0) {
    throw new Error('User B should accumulate abuse score from blocked attempts');
  }
  console.log('User B eligibility factor:', eligibility.promoEligibilityFactor);

  console.log('Camada 28 coupon abuse prevention tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
