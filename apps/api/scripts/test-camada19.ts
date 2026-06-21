process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { tokenizePaymentMethod, getPaymentPublicConfig } = await import('../src/payments/tokenizationService.js');
  const { authorizeRidePayment, captureRidePayment, attachIntentToRide } = await import(
    '../src/payments/paymentService.js'
  );
  const { handlePspWebhookWithIdempotency } = await import('../src/payments/webhookService.js');
  const { requestPaymentRefund } = await import('../src/payments/refundService.js');
  const { findTransactionByIdempotencyKey } = await import('../src/payments/transactionStore.js');
  const { DEMO_PAYMENT_METHOD_IDS } = await import('../src/payments/paymentStore.js');

  const userId = randomUUID();
  const rideId = randomUUID();

  const config = getPaymentPublicConfig();
  if (!config.supportedMethods.includes('pix')) throw new Error('Config missing pix');
  console.log('Payment config:', config.pspProvider, 'tokenization:', config.tokenizationEnabled);

  const savedCard = await tokenizePaymentMethod({
    userId,
    methodType: 'card',
    providerToken: 'pm_demo_token_4242',
    lastFour: '4242',
    brand: 'Visa',
    setDefault: false,
  });
  if (!savedCard.id || savedCard.lastFour !== '4242') throw new Error('Tokenize failed');
  console.log('Tokenized card:', savedCard.id);

  const cardAuth = await authorizeRidePayment({
    userId,
    paymentMethodId: savedCard.id,
    amountCentavos: 4500,
    idempotencyKey: 'camada19-card-token',
  });
  if (cardAuth.intent.status !== 'authorized') throw new Error('Card auth with token failed');

  const cardAgain = await authorizeRidePayment({
    userId,
    paymentMethodId: savedCard.id,
    amountCentavos: 4500,
    idempotencyKey: 'camada19-card-token',
  });
  if (cardAgain.intent.id !== cardAuth.intent.id) throw new Error('Intent idempotency failed');
  console.log('Intent idempotency OK');

  const { intent, pix } = await authorizeRidePayment({
    userId,
    paymentMethodId: DEMO_PAYMENT_METHOD_IDS.pix,
    amountCentavos: 2800,
    rideId,
    idempotencyKey: 'camada19-pix',
  });
  if (!pix) throw new Error('PIX charge expected');

  await attachIntentToRide(rideId, intent.id);

  const webhook1 = await handlePspWebhookWithIdempotency(
    { event: 'pix.paid', txid: pix.txid, idempotencyKey: 'wh-camada19-pix' },
    { provider: 'psp', eventId: 'evt-camada19-pix' },
  );
  const webhookIntent = (webhook1 as { intent?: { status?: string } }).intent;
  if (webhookIntent?.status !== 'authorized') throw new Error('PIX webhook confirm failed');

  const webhookDup = await handlePspWebhookWithIdempotency(
    { event: 'pix.paid', txid: pix.txid, idempotencyKey: 'wh-camada19-pix' },
    { provider: 'psp', eventId: 'evt-camada19-pix' },
  );
  if (!webhookDup.duplicate) throw new Error('Webhook idempotency expected duplicate');
  console.log('Webhook idempotency OK');

  await captureRidePayment(rideId, 2800, {
    categoryCode: 'economico',
    driverUserId: randomUUID(),
  });

  const refund = await requestPaymentRefund({
    intentId: intent.id,
    userId,
    reason: 'Teste camada 19',
    idempotencyKey: 'camada19-refund',
  });
  if (refund.status !== 'succeeded') throw new Error('Refund failed');
  console.log('Refund OK:', refund.id);

  const refundDup = await requestPaymentRefund({
    intentId: intent.id,
    userId,
    idempotencyKey: 'camada19-refund',
  });
  if (refundDup.id !== refund.id) throw new Error('Refund idempotency failed');

  const txn = await findTransactionByIdempotencyKey('camada19-refund');
  if (!txn || txn.txnType !== 'refund') throw new Error('Refund transaction missing');

  console.log('Camada 19 pagamentos produção tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
