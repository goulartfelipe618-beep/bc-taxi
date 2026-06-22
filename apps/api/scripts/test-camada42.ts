process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getBackofficeProductionConfig,
    getBackofficeConsoleDashboard,
    listBackofficeTaskQueue,
    acknowledgeBackofficeAlert,
    resolveBackofficeAlert,
    resolveBackofficeFraudCase,
    restrictDriverDeliveryFromBackoffice,
    approveCorporateFromBackoffice,
    seedMemoryBackofficeFraudTask,
    __testResetBackofficeProductionMemory,
    __testGetBackofficeOperatorActions,
  } = await import('../src/admin/backofficeProductionService.js');
  const {
    evaluateProductionMetricAlerts,
    captureSloSnapshot,
    __testResetObservabilityProductionMemory,
  } = await import('../src/observability/observabilityProductionService.js');
  const { __testResetAlertMemory } = await import('../src/observability/opsAlertService.js');
  const {
    createCorporateRideApproval,
    __testResetCorporateProductionMemory,
    listPendingCorporateRideApprovals,
  } = await import('../src/corporate/corporateProductionService.js');
  const {
    isDriverRestrictedForDelivery,
    __testResetDeliveryProductionMemory,
  } = await import('../src/delivery/deliveryProductionService.js');

  __testResetBackofficeProductionMemory();
  __testResetObservabilityProductionMemory();
  __testResetAlertMemory();
  __testResetCorporateProductionMemory();
  __testResetDeliveryProductionMemory();

  const cfg = await getBackofficeProductionConfig();
  if (cfg.taskQueueLimit !== 50) throw new Error('Backoffice config mismatch');
  console.log('Backoffice config OK:', cfg.configVersion);

  const metrics = {
    bucketHour: new Date().toISOString(),
    requestToAssignMsAvg: 150_000,
    acceptRate: 0.3,
    cancelRate: 0.35,
    paymentFailureRate: 0.2,
    rideCount: 10,
  };
  const alerts = await evaluateProductionMetricAlerts(metrics);
  if (alerts.length < 2) throw new Error(`Expected production alerts, got ${alerts.length}`);
  console.log('Production alerts seeded:', alerts.length);

  const caseId = randomUUID();
  seedMemoryBackofficeFraudTask({
    targetId: caseId,
    priority: 90,
    summary: 'Fraude suspeita — múltiplos cancelamentos',
    severity: 'critical',
    createdAt: new Date().toISOString(),
  });

  const accountId = randomUUID();
  const approval = await createCorporateRideApproval({
    accountId,
    rideId: randomUUID(),
    requesterUserId: randomUUID(),
    quotedFareCentavos: 25000,
    policyVersion: 'camada42-test',
  });
  console.log('Corporate approval pending:', approval.id);

  await captureSloSnapshot({
    metrics,
    regionId: '00000000-0000-4000-8000-000000000010',
    categoryCode: 'economico',
    reputationTier: 'all',
  });

  const tasks = await listBackofficeTaskQueue();
  if (tasks.length < 3) throw new Error(`Expected task queue items, got ${tasks.length}`);
  if (!tasks.some((t) => t.taskType === 'ops_alert')) throw new Error('Missing ops alert task');
  if (!tasks.some((t) => t.taskType === 'fraud_case')) throw new Error('Missing fraud task');
  if (!tasks.some((t) => t.taskType === 'corporate_approval')) throw new Error('Missing corporate task');
  console.log('Task queue OK:', tasks.length, 'items');

  const dashboard = await getBackofficeConsoleDashboard();
  if (dashboard.taskQueue.total < 3) throw new Error('Dashboard task queue incomplete');
  if (!dashboard.sloSnapshots.length) throw new Error('Dashboard missing SLO snapshots');
  console.log('Console dashboard OK');

  const alertId = alerts[0]!.id;
  const acked = await acknowledgeBackofficeAlert({
    alertId,
    operatorLabel: 'ops-lead',
  });
  if (acked.status !== 'acknowledged') throw new Error('Alert not acknowledged');
  console.log('Alert acknowledged');

  await resolveBackofficeAlert({ alertId, operatorLabel: 'ops-lead' });
  console.log('Alert resolved');

  const fraudResult = await resolveBackofficeFraudCase({
    caseId,
    operatorLabel: 'fraud-analyst',
    decision: 'cleared',
  });
  if (fraudResult.status !== 'cleared') throw new Error('Fraud case not cleared');
  console.log('Fraud case cleared');

  const driverId = randomUUID();
  await restrictDriverDeliveryFromBackoffice({
    driverUserId: driverId,
    reason: 'Documentação de entrega pendente',
    operatorLabel: 'delivery-ops',
  });
  if (!(await isDriverRestrictedForDelivery(driverId))) {
    throw new Error('Driver restriction not applied');
  }
  console.log('Driver delivery restriction OK');

  const managerId = randomUUID();
  const approved = await approveCorporateFromBackoffice({
    approvalId: approval.id,
    accountId,
    operatorLabel: 'corp-manager',
    operatorUserId: managerId,
  });
  if (approved.status !== 'approved') throw new Error('Corporate approval failed');
  const pending = await listPendingCorporateRideApprovals();
  if (pending.some((p) => p.id === approval.id)) throw new Error('Approval still pending');
  console.log('Corporate approval OK');

  const actions = __testGetBackofficeOperatorActions();
  if (actions.length < 5) throw new Error(`Expected operator audit actions, got ${actions.length}`);
  console.log('Operator audit trail OK:', actions.length);

  console.log('\nCamada 42 — backoffice ops produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
