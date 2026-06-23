process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getDriverReputationProductionConfig,
    getDriverReputationProductionDashboard,
    dismissDriverReputationInsight,
    __testResetDriverReputationProductionMemory,
    __testSeedDriverReputationMemory,
  } = await import('../src/driver/driverReputationProductionService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetDriverReputationProductionMemory();

  const cfg = await getDriverReputationProductionConfig();
  if (!cfg.kpiDashboardEnabled || !cfg.tierProgressEnabled) {
    throw new Error('Driver reputation production config incomplete');
  }
  console.log('Reputation config OK:', cfg.configVersion);

  const user = await createUser({
    email: `camada51-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Motorista Camada 51',
    role: 'driver',
  });

  await __testSeedDriverReputationMemory(user.id, {
    completedRides: 420,
    acceptanceRate: 0.88,
    cancellationRate: 0.06,
    reputationScore: 4.82,
  });

  const dashboard = await getDriverReputationProductionDashboard(user.id);
  if (!dashboard.profile.tier || !dashboard.kpis) {
    throw new Error('Dashboard missing profile or KPIs');
  }
  if (dashboard.kpis.completedRides < 400) throw new Error('KPI completed rides mismatch');
  if (!dashboard.tierProgress?.currentTier) throw new Error('Tier progress missing');
  if (dashboard.insights.length < 1) throw new Error('Insights missing');
  if (dashboard.badgeCatalog.length < 2) throw new Error('Badge catalog missing');
  if (!dashboard.operationalBreakdown.pickupPunctuality) {
    throw new Error('Operational breakdown missing');
  }
  console.log('Dashboard OK — tier:', dashboard.profile.tier, 'score:', dashboard.profile.displayScore);

  const insightCode = dashboard.insights[0].code;
  await dismissDriverReputationInsight(user.id, insightCode);
  const afterDismiss = await getDriverReputationProductionDashboard(user.id);
  if (afterDismiss.insights.some((i) => i.code === insightCode)) {
    throw new Error('Insight dismiss failed in memory mode');
  }
  console.log('Insight dismiss OK');

  console.log('\nCamada 51 — reputação motorista produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
