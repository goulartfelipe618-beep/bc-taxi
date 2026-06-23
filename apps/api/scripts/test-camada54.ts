process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getPassengerReputationProductionConfig,
    getPassengerReputationProductionDashboard,
    dismissPassengerReputationInsight,
    __testResetPassengerReputationProductionMemory,
  } = await import('../src/passenger/passengerReputationProductionService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetPassengerReputationProductionMemory();

  const cfg = await getPassengerReputationProductionConfig();
  if (!cfg.kpiDashboardEnabled || !cfg.benefitsPanelEnabled) {
    throw new Error('Passenger reputation production config incomplete');
  }
  console.log('Reputation config OK:', cfg.configVersion);

  const passenger = await createUser({
    email: `camada54-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Passageiro Camada 54',
    role: 'passenger',
  });

  const dashboard = await getPassengerReputationProductionDashboard(passenger.id);
  if (!dashboard.profile.tier || !dashboard.kpis) {
    throw new Error('Dashboard missing profile or KPIs');
  }
  if (dashboard.kpis.completedRides < 1) throw new Error('KPI completed rides missing');
  if (!dashboard.tierProgress?.currentTier) throw new Error('Tier progress missing');
  if (dashboard.insights.length < 1) throw new Error('Insights missing');
  if (!dashboard.benefits) throw new Error('Benefits panel missing');
  if (!dashboard.operationalBreakdown.paymentSuccess) {
    throw new Error('Operational breakdown missing');
  }
  console.log('Dashboard OK — tier:', dashboard.profile.tier, 'score:', dashboard.profile.displayScore);

  const insightCode = dashboard.insights[0].code;
  await dismissPassengerReputationInsight(passenger.id, insightCode);
  const afterDismiss = await getPassengerReputationProductionDashboard(passenger.id);
  if (afterDismiss.insights.some((i) => i.code === insightCode)) {
    throw new Error('Insight dismiss failed in memory mode');
  }
  console.log('Insight dismiss OK');

  console.log('\nCamada 54 — reputação passageiro produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
