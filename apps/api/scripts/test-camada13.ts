process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    listActiveEvents,
    computeEventPressure,
    createEventSurge,
    listEventsNear,
  } = await import('../src/events/eventSurgeService.js');
  const { computeLiveFactors } = await import('../src/pricing/dynamicPricingService.js');
  const { logRideDecision, getRideDecisionLogs } = await import('../src/observability/decisionLogService.js');
  const {
    recordRideMetric,
    aggregateHourlyMetrics,
    evaluateOpsAlerts,
    listOpenOpsAlerts,
  } = await import('../src/observability/opsMetricsService.js');
  const { getAdminOverview } = await import('../src/admin/adminService.js');

  const events = await listActiveEvents();
  if (events.length < 1) throw new Error('Expected seeded surge event');

  const near = await listEventsNear(-26.99, -48.6348);
  if (near.length < 1) throw new Error('Expected event near arena');

  const pressure = await computeEventPressure(-26.99, -48.6348, 'economico');
  if (pressure <= 0) throw new Error(`Event pressure should be > 0, got ${pressure}`);
  console.log('Event pressure at arena:', pressure.toFixed(3));

  const factors = await computeLiveFactors(-26.99, -48.6348);
  if (factors.eventPressure <= 0) throw new Error('Dynamic pricing should include event pressure');
  console.log('Dynamic event factor:', factors.eventPressure.toFixed(3));

  const custom = await createEventSurge({
    eventName: 'Test Festival',
    eventType: 'festival',
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 86400_000),
    centerLat: -26.92,
    centerLng: -49.07,
    intensityIndex: 0.6,
    impactedCategories: ['economico'],
  });
  if (!custom.id) throw new Error('createEventSurge failed');

  const rideId = randomUUID();
  await logRideDecision({
    rideId,
    decisionType: 'PRICING_QUOTED',
    payload: { eventPressure: pressure, fareCentavos: 4200 },
  });
  const logs = await getRideDecisionLogs(rideId);
  if (logs.length !== 1) throw new Error('Decision log missing');

  recordRideMetric({ rideId, categoryCode: 'economico', quoted: true, booked: true, cancelled: true });
  recordRideMetric({ rideId: randomUUID(), categoryCode: 'economico', quoted: true, booked: true, accepted: true });
  const metrics = await aggregateHourlyMetrics();
  if (!metrics) throw new Error('Metrics aggregation failed');

  const alerts = await evaluateOpsAlerts({
    bucketHour: new Date().toISOString(),
    cancelRate: 0.9,
    acceptRate: 0.2,
    paymentFailureRate: 0.2,
    rideCount: 10,
  });
  if (alerts.length < 1) throw new Error('Expected ops alerts from bad metrics');
  console.log('Ops alerts:', alerts.length);

  const openAlerts = await listOpenOpsAlerts();
  if (openAlerts.length < 1) throw new Error('Open alerts list empty');

  const overview = await getAdminOverview();
  if (typeof overview.activeSurgeEvents !== 'number') {
    throw new Error('Admin overview missing surge KPIs');
  }

  console.log('Camada 13 events + observability tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
