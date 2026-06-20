process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { buildEngineQuote } = await import('../src/pricing/pricingEngineService.js');
  const { estimateTollsCentavos } = await import('../src/pricing/tollService.js');
  const { getActivePricingRule, seedMemoryPricingRule } = await import('../src/pricing/pricingRuleStore.js');
  const { authorizeRidePayment, captureRidePayment, attachIntentToRide } = await import(
    '../src/payments/paymentService.js'
  );
  const { confirmPixPayment } = await import('../src/payments/pixService.js');
  const { DEMO_PAYMENT_METHOD_IDS } = await import('../src/payments/paymentStore.js');
  const { getDriverLedgerSummary } = await import('../src/payments/ledgerService.js');
  const { randomUUID } = await import('node:crypto');

  const userId = randomUUID();
  const driverId = randomUUID();
  const rideId = randomUUID();

  seedMemoryPricingRule({
    id: 'test-rule',
    ruleSetId: 'test-set',
    categoryCode: 'economico',
    regionId: '00000000-0000-4000-8000-000000000010',
    baseFareCentavos: 500,
    distanceRateCentavosKm: 220,
    timeRateCentavosMin: 35,
    minimumFareCentavos: 800,
    bookingFeeCentavos: 150,
    trafficCoefficient: 12,
    takeRateBps: 2200,
    driverDynamicShareBps: 7500,
    regulatoryFeeCentavos: 50,
  });

  const rule = await getActivePricingRule('economico');
  if (rule.takeRateBps !== 2200) throw new Error('Pricing rule seed failed');

  const tolls = await estimateTollsCentavos({
    fromLat: -26.99,
    fromLng: -48.63,
    toLat: -26.92,
    toLng: -49.07,
    distanceKm: 18,
  });
  console.log('Tolls estimate:', tolls.tollsCentavos, tolls.tollNames);

  const quote = await buildEngineQuote({
    categoryCode: 'economico',
    distanceKm: 12,
    durationMin: 22,
    trafficIndex: 0.8,
    fromLat: -26.99,
    fromLng: -48.63,
    toLat: -26.92,
    toLng: -49.07,
  });
  if (quote.passengerFareCentavos < quote.estimatedDriverPayoutCentavos) {
    throw new Error('Passenger fare should exceed driver payout');
  }
  if (quote.platformFeeCentavos <= 0) throw new Error('Platform fee missing');
  console.log('Engine quote:', quote.passengerFareCentavos, 'platform', quote.platformFeeCentavos);

  const { intent, pix } = await authorizeRidePayment({
    userId,
    paymentMethodId: DEMO_PAYMENT_METHOD_IDS.pix,
    amountCentavos: quote.passengerFareCentavos,
    rideId,
    idempotencyKey: 'camada8-test-pix',
  });
  if (!pix || intent.status !== 'requires_action') throw new Error('PIX charge expected');
  console.log('PIX txid:', pix.txid);

  await attachIntentToRide(rideId, intent.id);
  const confirmed = await confirmPixPayment(pix.txid);
  if (confirmed.intent?.status !== 'authorized') throw new Error('PIX confirm failed');

  await captureRidePayment(rideId, quote.passengerFareCentavos, {
    categoryCode: 'economico',
    driverUserId: driverId,
  });

  const ledger = await getDriverLedgerSummary(driverId);
  if (ledger.totalCentavos <= 0) throw new Error('Driver ledger empty');
  console.log('Driver ledger total:', ledger.totalCentavos);

  const cardAuth = await authorizeRidePayment({
    userId,
    paymentMethodId: DEMO_PAYMENT_METHOD_IDS.card,
    amountCentavos: 3200,
    idempotencyKey: 'camada8-test-card',
  });
  if (cardAuth.intent.status !== 'authorized') throw new Error('Card auth failed');
  console.log('Card authorized:', cardAuth.intent.provider);

  console.log('Camada 8 payments + pricing engine tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
