process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { validatePromoCode, listActivePromos, recordCouponRedemption } = await import(
    '../src/promotions/couponService.js'
  );
  const {
    createScheduledRide,
    dispatchDueScheduledRides,
    listPassengerSchedules,
    cancelScheduledRide,
    toPublicScheduledRide,
  } = await import('../src/scheduling/scheduleService.js');
  const { renderAdminDashboardHtml } = await import('../src/admin/dashboardHtml.js');

  const userId = randomUUID();
  const promos = await listActivePromos();
  if (promos.length < 1) throw new Error('Expected seeded promos in memory mode');

  const validation = await validatePromoCode({
    code: 'BCTAXI10',
    userId,
    categoryCode: 'economico',
    fareCentavos: 5000,
  });
  if (!validation.valid || validation.discountCentavos !== 500) {
    throw new Error(`BCTAXI10 validation failed: ${JSON.stringify(validation)}`);
  }
  console.log('Coupon BCTAXI10 discount:', validation.discountCentavos, '→', validation.fareAfterCentavos);

  if (validation.promo) {
    await recordCouponRedemption({
      promo: validation.promo,
      userId,
      fareBeforeCentavos: 5000,
      discountCentavos: validation.discountCentavos,
    });
  }

  const scheduledAt = new Date(Date.now() + 35 * 60_000);
  const schedule = await createScheduledRide({
    passengerId: userId,
    categoryCode: 'economico',
    pickupLat: -26.9194,
    pickupLng: -49.0661,
    pickupAddress: 'Centro BC',
    dropoffLat: -26.9905,
    dropoffLng: -48.6348,
    dropoffAddress: 'Praia Central',
    scheduledAt,
    estimatedFareCentavos: 4500,
    promoCode: 'PRIMEIRA15',
    dispatchLeadMinutes: 40,
  });
  console.log('Scheduled:', toPublicScheduledRide(schedule).id, schedule.discountCentavos);

  const list = await listPassengerSchedules(userId);
  if (list.length !== 1) throw new Error('Expected one schedule for passenger');

  const dispatched = await dispatchDueScheduledRides();
  if (dispatched !== 1) throw new Error(`Expected 1 dispatch, got ${dispatched}`);

  const html = renderAdminDashboardHtml('http://localhost:3000');
  if (!html.includes('BC Taxi Admin')) throw new Error('Admin dashboard HTML missing title');

  const cancelled = await cancelScheduledRide(
    (
      await createScheduledRide({
        passengerId: userId,
        categoryCode: 'economico',
        pickupLat: -26.91,
        pickupLng: -49.06,
        dropoffLat: -26.99,
        dropoffLng: -48.63,
        scheduledAt: new Date(Date.now() + 45 * 60_000),
        estimatedFareCentavos: 3000,
      })
    ).id,
    userId,
    'test cancel',
  );
  if (cancelled.status !== 'cancelled') throw new Error('Cancel failed');

  console.log('Camada 11 promos + scheduling + admin dashboard tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
