process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { getPspProvider, resetPspProviderCache } = await import('../src/payments/psp/pspProvider.js');
  const { evaluateRideRisk, recordDeviceFingerprint } = await import('../src/fraud/riskEngine.js');
  const { isPostgisMatchEnabled } = await import('../src/match/geoMatchStore.js');
  const { haversineMeters } = await import('../src/match/eligibility.js');
  const { randomUUID } = await import('node:crypto');

  resetPspProviderCache();
  const demo = getPspProvider();
  if (demo.name !== 'demo') throw new Error('Expected demo PSP by default');

  process.env.PSP_PROVIDER = 'mercadopago';
  resetPspProviderCache();
  const mp = getPspProvider();
  const mpAuth = await mp.authorize({
    amountCentavos: 2500,
    currency: 'BRL',
    methodType: 'pix',
    idempotencyKey: 'camada9-mp',
    userId: randomUUID(),
  });
  if (!mpAuth.pix || mpAuth.status !== 'requires_action') throw new Error('MP demo PIX failed');
  console.log('Mercado Pago demo PIX:', mp.name, mpAuth.pix.txid);

  process.env.PSP_PROVIDER = 'pagarme';
  resetPspProviderCache();
  const pg = getPspProvider();
  const pgAuth = await pg.authorize({
    amountCentavos: 1800,
    currency: 'BRL',
    methodType: 'card',
    idempotencyKey: 'camada9-pg',
    userId: randomUUID(),
  });
  if (pgAuth.status !== 'authorized') throw new Error('Pagar.me demo card failed');
  console.log('Pagar.me demo card:', pg.name);

  process.env.PSP_PROVIDER = 'demo';

  const userA = randomUUID();
  const userB = randomUUID();
  await recordDeviceFingerprint({ userId: userA, deviceId: 'shared-device-9' });
  await recordDeviceFingerprint({ userId: userB, deviceId: 'shared-device-9' });

  const risk = await evaluateRideRisk({
    userId: userB,
    deviceId: 'shared-device-9',
    paymentMethodType: 'pix',
    amountCentavos: 60000,
  });
  if (risk.reasonCodes.length === 0 && risk.riskScore <= 0) {
    throw new Error('Risk engine should flag linked device or high value');
  }
  console.log('Risk decision:', risk.decision, risk.reasonCodes);

  if (isPostgisMatchEnabled()) throw new Error('PostGIS should be off in memory mode');

  const dist = haversineMeters(-26.99, -48.63, -26.92, -49.07);
  if (dist <= 0) throw new Error('Haversine sanity failed');

  console.log('Camada 9 PSP + antifraud + geo tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
