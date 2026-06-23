process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getPassengerScheduleProductionConfig,
    getPassengerScheduleDashboard,
    createPassengerScheduleProduction,
    reschedulePassengerSchedule,
    cancelPassengerScheduleProduction,
    getPassengerScheduleDetail,
    __testResetPassengerScheduleProductionMemory,
  } = await import('../src/passenger/schedulingProductionService.js');
  const { __testResetScheduleMemory } = await import('../src/scheduling/scheduleService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetScheduleMemory();
  __testResetPassengerScheduleProductionMemory();

  const cfg = await getPassengerScheduleProductionConfig();
  if (!cfg.rescheduleEnabled || !cfg.remindersEnabled) {
    throw new Error('Schedule production config incomplete');
  }
  console.log('Schedule config OK:', cfg.configVersion);

  const passenger = await createUser({
    email: `camada53-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Passageiro Camada 53',
    role: 'passenger',
  });

  const scheduledAt = new Date(Date.now() + 2 * 60 * 60_000);
  const created = await createPassengerScheduleProduction({
    passengerId: passenger.id,
    categoryCode: 'economico',
    pickupLat: -26.99,
    pickupLng: -48.6348,
    pickupAddress: 'Centro, BC',
    dropoffLat: -26.9194,
    dropoffLng: -49.0661,
    dropoffAddress: 'Aeroporto Navegantes',
    scheduledAt,
    estimatedFareCentavos: 4520,
  });

  if (!created.scheduledLabel || !created.canReschedule) {
    throw new Error('Created schedule missing enriched fields');
  }
  console.log('Create schedule OK:', created.scheduledLabel);

  const dashboard = await getPassengerScheduleDashboard(passenger.id);
  if (dashboard.upcoming.length < 1) throw new Error('Dashboard upcoming empty');
  if (!dashboard.features.rescheduleEnabled) throw new Error('Features missing');
  console.log('Dashboard OK — upcoming:', dashboard.upcoming.length);

  const detail = await getPassengerScheduleDetail(passenger.id, created.id);
  if (detail.id !== created.id) throw new Error('Detail mismatch');
  console.log('Detail OK');

  const newTime = new Date(Date.now() + 3 * 60 * 60_000);
  const rescheduled = await reschedulePassengerSchedule(passenger.id, created.id, newTime);
  if (new Date(rescheduled.scheduledAt).getTime() !== newTime.getTime()) {
    throw new Error('Reschedule time mismatch');
  }
  console.log('Reschedule OK:', rescheduled.scheduledLabel);

  const schedule2 = await createPassengerScheduleProduction({
    passengerId: passenger.id,
    categoryCode: 'comfort',
    pickupLat: -26.99,
    pickupLng: -48.6348,
    dropoffLat: -26.95,
    dropoffLng: -48.63,
    dropoffAddress: 'Shopping',
    scheduledAt: new Date(Date.now() + 24 * 60 * 60_000),
    estimatedFareCentavos: 2200,
  });

  await cancelPassengerScheduleProduction(passenger.id, schedule2.id, 'Teste cancelamento');
  const afterCancel = await getPassengerScheduleDashboard(passenger.id);
  if (afterCancel.upcoming.find((s) => s.id === schedule2.id)) {
    throw new Error('Cancelled schedule still in upcoming');
  }
  console.log('Cancel OK');

  console.log('\nCamada 53 — agendamento passageiro produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
