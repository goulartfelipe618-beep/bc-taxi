process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getRideActivityDetailProductionConfig,
    getRideActivityDetail,
    getRideActivityRebookDraft,
    __testResetRideActivityDetailProductionMemory,
  } = await import('../src/activity/rideActivityDetailProductionService.js');
  const {
    listRideActivity,
    __testResetRideActivityProductionMemory,
  } = await import('../src/activity/rideActivityProductionService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetRideActivityProductionMemory();
  __testResetRideActivityDetailProductionMemory();

  const cfg = await getRideActivityDetailProductionConfig();
  if (!cfg.rebookEnabled || !cfg.receiptDetailEnabled) {
    throw new Error('Activity detail production config incomplete');
  }
  console.log('Detail config OK:', cfg.configVersion);

  const passenger = await createUser({
    email: `camada52-pass-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Passageiro Camada 52',
    role: 'passenger',
  });

  const driver = await createUser({
    email: `camada52-driver-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Motorista Camada 52',
    role: 'driver',
  });

  const passengerList = await listRideActivity(passenger.id, 'passenger');
  const rideId = passengerList.items[0]?.rideId;
  if (!rideId) throw new Error('No seeded ride for passenger');

  const detail = await getRideActivityDetail(passenger.id, 'passenger', rideId);
  if (!detail.pickup.address || !detail.dropoff.address || !detail.fare) {
    throw new Error('Passenger detail missing fields');
  }
  if (!detail.rebookEnabled) throw new Error('Rebook should be enabled for completed ride');
  console.log('Passenger detail OK — fare:', detail.fare.totalLabel);

  const rebook = await getRideActivityRebookDraft(passenger.id, rideId);
  if (!rebook.pickupLat || !rebook.dropoffLat || rebook.categoryCode !== 'economico') {
    throw new Error('Rebook draft incomplete');
  }
  console.log('Rebook draft OK:', rebook.dropoffName);

  const driverList = await listRideActivity(driver.id, 'driver');
  const driverRideId = driverList.items[0]?.rideId;
  if (!driverRideId) throw new Error('No seeded ride for driver');

  const driverDetail = await getRideActivityDetail(driver.id, 'driver', driverRideId);
  if (!driverDetail.driverEarnings?.grossCentavos) {
    throw new Error('Driver earnings breakdown missing');
  }
  console.log('Driver detail OK — earnings:', driverDetail.driverEarnings.grossLabel);

  try {
    await getRideActivityDetail(passenger.id, 'passenger', driverRideId);
    throw new Error('Should deny access to another user ride');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!msg.includes('não encontrada')) throw e;
  }
  console.log('Access control OK');

  console.log('\nCamada 52 — detalhe de atividade produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
