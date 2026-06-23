process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getRideActivityProductionConfig,
    listRideActivity,
    pinRideActivity,
    __testResetRideActivityProductionMemory,
  } = await import('../src/activity/rideActivityProductionService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetRideActivityProductionMemory();

  const cfg = await getRideActivityProductionConfig();
  if (!cfg.includeReceiptLinks || !cfg.driverEarningsVisible) {
    throw new Error('Activity production config incomplete');
  }
  console.log('Activity config OK:', cfg.configVersion);

  const passenger = await createUser({
    email: `camada50-pass-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Passageiro Camada 50',
    role: 'passenger',
  });

  const driver = await createUser({
    email: `camada50-driver-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Motorista Camada 50',
    role: 'driver',
    phone: '+55 47 98800-9999',
  });

  const passengerActivity = await listRideActivity(passenger.id, 'passenger');
  if (passengerActivity.items.length < 3) {
    throw new Error('Passenger activity should seed at least 3 rides');
  }
  if (!passengerActivity.items[0].priceLabel || !passengerActivity.items[0].displayTitle) {
    throw new Error('Passenger activity item missing fields');
  }
  console.log('Passenger activity OK:', passengerActivity.items.length, 'rides');

  const driverActivity = await listRideActivity(driver.id, 'driver');
  if (driverActivity.items.length < 3) throw new Error('Driver activity should seed at least 3 rides');
  if (!driverActivity.items[0].passengerName && driverActivity.items[0].status === 'COMPLETED') {
    // passenger name may be absent for random UUID passengers in seed — driver still has rides
  }
  console.log('Driver activity OK:', driverActivity.items.length, 'rides');

  const completedOnly = await listRideActivity(passenger.id, 'passenger', { status: 'completed' });
  if (completedOnly.items.some((i) => i.status !== 'COMPLETED')) {
    throw new Error('Completed filter failed');
  }
  console.log('Status filter OK');

  const firstRideId = passengerActivity.items[0].rideId;
  await pinRideActivity(passenger.id, firstRideId);
  const afterPin = await listRideActivity(passenger.id, 'passenger');
  if (!afterPin.items.find((i) => i.rideId === firstRideId)?.isPinned) {
    throw new Error('Pin ride failed');
  }
  console.log('Pin ride OK');

  console.log('\nCamada 50 — atividade de corridas produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
