process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { config } = await import('../src/config.js');
  const {
    seedMemoryPspRouting,
    resolvePspProviderForMethod,
    getPspRoutingConfig,
    enqueuePspRetryJob,
    processPspRetryJob,
    getPspProductionHealth,
    __testResetPspProductionMemory,
    __testGetRetryJobs,
  } = await import('../src/payments/pspProductionService.js');
  const { getPaymentPublicConfig } = await import('../src/payments/tokenizationService.js');
  const { authorizeRidePayment, attachIntentToRide } = await import('../src/payments/paymentService.js');
  const { handleMercadoPagoWebhook, handlePspWebhookWithIdempotency } = await import(
    '../src/payments/webhookService.js'
  );
  const { DEMO_PAYMENT_METHOD_IDS } = await import('../src/payments/paymentStore.js');

  __testResetPspProductionMemory();

  const regionId = config.defaultServiceRegionId;
  seedMemoryPspRouting([
    { regionId, methodType: 'pix', providerCode: 'mercadopago', configVersion: 'test-camada36-v1', priority: 0 },
    { regionId, methodType: 'card', providerCode: 'stripe', configVersion: 'test-camada36-v1', priority: 0 },
    { regionId, methodType: 'debit', providerCode: 'stripe', configVersion: 'test-camada36-v1', priority: 0 },
    { regionId, methodType: 'cash', providerCode: 'demo', configVersion: 'test-camada36-v1', priority: 0 },
  ]);

  const pixRouting = await getPspRoutingConfig('pix', regionId);
  if (pixRouting?.providerCode !== 'mercadopago') {
    throw new Error(`Expected mercadopago for pix, got ${pixRouting?.providerCode}`);
  }

  const pixPsp = await resolvePspProviderForMethod('pix', regionId);
  if (pixPsp.providerCode !== 'mercadopago') {
    throw new Error('resolvePspProviderForMethod pix failed');
  }
  console.log('PIX routed to:', pixPsp.provider.name, pixPsp.configVersion);

  const cardPsp = await resolvePspProviderForMethod('card', regionId);
  if (cardPsp.providerCode !== 'stripe') throw new Error(`Card routing failed: ${cardPsp.providerCode}`);
  console.log('Card routed to:', cardPsp.providerCode, cardPsp.provider.name);

  const publicConfig = await getPaymentPublicConfig();
  if (!publicConfig.routing?.length || publicConfig.routing[0].provider !== 'mercadopago') {
    throw new Error('Public config routing missing');
  }
  console.log('Public routing entries:', publicConfig.routing.length);

  const health = await getPspProductionHealth();
  if (!health.routing.length) throw new Error('PSP health routing empty');
  console.log('PSP health pending retries:', health.pendingRetryJobs);

  const userId = randomUUID();
  const rideId = randomUUID();
  const { intent, pix } = await authorizeRidePayment({
    userId,
    paymentMethodId: DEMO_PAYMENT_METHOD_IDS.pix,
    amountCentavos: 3200,
    rideId,
    idempotencyKey: 'camada36-pix-auth',
  });
  if (!pix || !intent.provider.includes('mercadopago')) {
    throw new Error(`Expected mercadopago provider, got ${intent.provider}`);
  }
  await attachIntentToRide(rideId, intent.id);

  const mpBody = JSON.stringify({
    id: 9001,
    type: 'payment',
    action: 'payment.updated',
    data: { id: intent.providerRef },
  });
  const mp1 = await handleMercadoPagoWebhook(mpBody);
  const mpIntent = (mp1 as { intent?: { status?: string } }).intent;
  if (mpIntent?.status !== 'authorized' && !(mp1 as { duplicate?: boolean }).duplicate) {
    throw new Error(`MP webhook failed: ${JSON.stringify(mp1)}`);
  }
  const mp2 = await handleMercadoPagoWebhook(mpBody);
  if (!(mp2 as { duplicate?: boolean }).duplicate) throw new Error('MP webhook idempotency failed');
  console.log('Mercado Pago webhook OK');

  const retryJob = await enqueuePspRetryJob({
    jobType: 'webhook_replay',
    provider: 'psp',
    idempotencyKey: 'camada36-retry-wh',
    payloadJson: { event: 'pix.paid', txid: pix.txid, idempotencyKey: 'camada36-retry-wh-inner' },
  });
  const retryResult = await processPspRetryJob(retryJob);
  if (!retryResult.ok) throw new Error(`Retry job failed: ${retryResult.error}`);
  console.log('Webhook replay retry OK');

  const jobs = __testGetRetryJobs();
  const succeeded = jobs.find((j) => j.idempotencyKey === 'camada36-retry-wh');
  if (!succeeded || succeeded.status !== 'succeeded') throw new Error('Retry job status incorrect');

  console.log('Camada 36 PSP produção tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
