process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { config } = await import('../src/config.js');
  const {
    getObservabilityProductionConfig,
    captureSloSnapshot,
    listSloSnapshots,
    evaluateProductionMetricAlerts,
    evaluateProductionHealthAlerts,
    recordLinkedTraceSpan,
    runWithTraceContext,
    __testResetObservabilityProductionMemory,
    __testGetObservabilityProductionEvents,
    __testGetObservabilityProductionAlerts,
  } = await import('../src/observability/observabilityProductionService.js');
  const {
    generateTraceId,
    getTraceBundleByTraceId,
    __testResetTraceMemory,
  } = await import('../src/observability/traceService.js');
  const { emitEvent } = await import('../src/realtime/eventBus.js');
  const { __testResetHealthMemory, __testSeedHealth } = await import(
    '../src/observability/platformHealthService.js'
  );
  const { __testResetAlertMemory } = await import('../src/observability/opsAlertService.js');

  __testResetObservabilityProductionMemory();
  __testResetTraceMemory();
  __testResetHealthMemory();
  __testResetAlertMemory();

  const cfg = await getObservabilityProductionConfig();
  if (cfg.paymentFailureThreshold !== 0.15) throw new Error('Production config mismatch');
  console.log('Observability config OK:', cfg.configVersion);

  const metrics = {
    bucketHour: new Date().toISOString(),
    requestToAssignMsAvg: 150_000,
    acceptRate: 0.3,
    cancelRate: 0.35,
    paymentFailureRate: 0.2,
    rideCount: 42,
  };

  const slo = await captureSloSnapshot({
    metrics,
    regionId: config.defaultServiceRegionId,
    categoryCode: 'comfort',
    reputationTier: 'confiavel',
  });
  if (slo.rideCount !== 42) throw new Error('SLO snapshot incomplete');

  const listed = await listSloSnapshots({ categoryCode: 'comfort' });
  if (!listed.some((s) => s.id === slo.id)) throw new Error('SLO not listed');
  console.log('SLO snapshot OK');

  const metricAlerts = await evaluateProductionMetricAlerts(metrics);
  if (metricAlerts.length < 3) throw new Error(`Expected production metric alerts, got ${metricAlerts.length}`);
  console.log(
    'Metric alerts:',
    metricAlerts.map((a) => a.alertType),
  );

  __testSeedHealth({ routeRecalcCount15m: 40, fraudSignalCount15m: 20 });
  const health = await import('../src/observability/platformHealthService.js').then((m) =>
    m.getLatestPlatformHealth(),
  );
  const healthAlerts = await evaluateProductionHealthAlerts(health);
  if (healthAlerts.length < 2) throw new Error('Expected production health alerts');
  console.log(
    'Health alerts:',
    healthAlerts.map((a) => a.alertType),
  );

  const traceId = generateTraceId();
  const rideId = randomUUID();
  const root = await recordLinkedTraceSpan({
    traceId,
    rideId,
    spanName: 'match_start',
    component: 'match',
    durationMs: 30,
  });

  await runWithTraceContext({ traceId, parentSpanId: root.id, rideId }, async () => {
    await recordLinkedTraceSpan({
      spanName: 'redis_fanout',
      component: 'redis',
      durationMs: 5,
    });
    await emitEvent('RIDE_DRIVER_ASSIGNED', 'ride', rideId, { driverId: randomUUID() }, {
      userIds: [randomUUID()],
      rideId,
    });
  });

  const bundle = await getTraceBundleByTraceId(traceId);
  if (bundle.spans.length < 2) throw new Error('Linked trace bundle incomplete');
  if (!bundle.spans.some((s) => s.parentSpanId)) throw new Error('Expected parent span linkage');
  console.log('Distributed trace OK:', bundle.spans.length, 'spans');

  const events = __testGetObservabilityProductionEvents();
  if (!events.some((e) => e.eventType === 'slo_captured')) throw new Error('Missing slo event');
  if (!events.some((e) => e.eventType === 'trace_linked')) throw new Error('Missing trace_linked event');

  const prodAlerts = __testGetObservabilityProductionAlerts();
  if (prodAlerts.length < 1) throw new Error('Production alerts should be stored in memory');

  console.log('Camada 41 observability production tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
