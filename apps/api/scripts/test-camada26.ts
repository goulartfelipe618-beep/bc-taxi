process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    capturePlatformHealthSnapshot,
    __testResetHealthMemory,
    __testSeedHealth,
  } = await import('../src/observability/platformHealthService.js');
  const {
    evaluatePlatformHealthAlerts,
    getOpsDashboard,
    __testResetAlertMemory,
  } = await import('../src/observability/opsAlertService.js');
  const {
    generateTraceId,
    recordTraceSpan,
    getRideTraceBundle,
    __testResetTraceMemory,
  } = await import('../src/observability/traceService.js');
  const { wsHub } = await import('../src/realtime/wsHub.js');

  __testResetHealthMemory();
  __testResetAlertMemory();
  __testResetTraceMemory();

  const stats = wsHub.detailedStats();
  if (typeof stats.connections !== 'number') throw new Error('WS detailed stats missing');

  const health = await capturePlatformHealthSnapshot();
  if (health.wsConnections !== stats.connections) throw new Error('Health WS mismatch');
  console.log('Platform health:', health.wsConnections, 'ws, redis:', health.redisConnected);

  __testSeedHealth({
    activeRidesInProgress: 10,
    wsConnections: 0,
    routeRecalcCount15m: 40,
    fraudSignalCount15m: 20,
  });

  const seeded = await import('../src/observability/platformHealthService.js').then((m) =>
    m.getLatestPlatformHealth(),
  );
  const alerts = await evaluatePlatformHealthAlerts(seeded);
  if (alerts.length < 2) throw new Error(`Expected platform alerts, got ${alerts.length}`);
  console.log(
    'Platform alerts:',
    alerts.map((a) => a.alertType),
  );

  const traceId = generateTraceId();
  const rideId = randomUUID();
  await recordTraceSpan({
    traceId,
    rideId,
    spanName: 'ride_created',
    component: 'match',
    durationMs: 42,
  });
  await recordTraceSpan({
    traceId,
    rideId,
    spanName: 'payment_authorized',
    component: 'psp',
    durationMs: 120,
  });

  const bundle = await getRideTraceBundle(rideId);
  if (bundle.spans.length !== 2) throw new Error('Trace bundle incomplete');

  const dashboard = await getOpsDashboard();
  if (!dashboard.platformHealth && !dashboard.metrics) {
    throw new Error('Dashboard should include health or metrics');
  }

  console.log('Camada 26 operational observability tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
