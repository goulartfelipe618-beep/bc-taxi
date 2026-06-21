process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    applyFraudBlock,
    listActiveBlocks,
    enforceFromRiskScore,
    assertNotFraudBlocked,
    __testResetEnforcementMemory,
  } = await import('../src/fraud/fraudEnforcementService.js');
  const {
    __testSeedDeviceGraph,
    __testResetDeviceGraphMemory,
    getDeviceGraph,
  } = await import('../src/fraud/deviceGraphService.js');
  const {
    recordLocationTrustEvent,
    getLocationTrust,
    __testResetLocationTrustMemory,
  } = await import('../src/fraud/locationTrustService.js');
  const {
    __testSeedCase,
    autoReviewCase,
    processPendingFraudCases,
    __testResetCaseReviewMemory,
  } = await import('../src/fraud/fraudCaseReviewService.js');
  const { recordFraudSignal, getUserRiskScore } = await import('../src/fraud/fraudService.js');
  const { evaluateRideRisk, recordDeviceFingerprint } = await import('../src/fraud/riskEngine.js');

  __testResetEnforcementMemory();
  __testResetDeviceGraphMemory();
  __testResetLocationTrustMemory();
  __testResetCaseReviewMemory();

  const userA = randomUUID();
  const userB = randomUUID();
  const deviceId = 'camada27-shared-device';

  await recordDeviceFingerprint({ userId: userA, deviceId });
  await recordDeviceFingerprint({ userId: userB, deviceId });
  __testSeedDeviceGraph(userA, userB, deviceId);

  const graph = await getDeviceGraph(userB);
  if (graph.linkedUserCount < 1) throw new Error('Device graph should link accounts');
  console.log('Device graph flags:', graph.riskFlags);

  const risk = await evaluateRideRisk({
    userId: userB,
    deviceId,
    paymentMethodType: 'pix',
    amountCentavos: 65000,
  });
  if (!risk.reasonCodes.includes('MULTI_ACCOUNT_DEVICE')) {
    throw new Error('Risk should flag shared device');
  }
  console.log('Risk decision:', risk.decision, risk.reasonCodes);

  await recordLocationTrustEvent({ userId: userA, deviceId, eventType: 'GPS_JUMP' });
  await recordLocationTrustEvent({ userId: userA, deviceId, eventType: 'GPS_JUMP' });
  await recordLocationTrustEvent({ userId: userA, deviceId, eventType: 'GPS_JUMP' });
  await recordLocationTrustEvent({ userId: userA, deviceId, eventType: 'GPS_JUMP' });
  const trust = await getLocationTrust(userA, deviceId);
  if (!trust || trust.trustScore >= 0.5) throw new Error('Location trust should degrade');
  console.log('Location trust:', trust.trustScore);

  for (let i = 0; i < 10; i++) {
    await recordFraudSignal({ userId: userA, signalType: 'GPS_JUMP', deviceId });
  }
  const score = await getUserRiskScore(userA);
  if (score < 0.75) throw new Error(`Risk score too low: ${score}`);

  const blocks = await listActiveBlocks({ userId: userA });
  if (blocks.length === 0) throw new Error('Expected auto blocks from fraud signals');

  await applyFraudBlock({
    deviceId: 'blocked-device-27',
    blockScope: 'promo',
    reasonCode: 'TEST_DEVICE_BLOCK',
    summary: 'Test device promo block',
    sourceType: 'auto',
  });

  try {
    await assertNotFraudBlocked({ userId: randomUUID(), deviceId: 'blocked-device-27', blockScope: 'promo' });
    throw new Error('Device block should throw');
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('Dispositivo')) {
      throw err;
    }
  }

  const caseId = randomUUID();
  __testSeedCase({
    id: caseId,
    userId: userA,
    status: 'open',
    riskScore: 0.92,
    summary: 'High risk cluster',
    priority: 50,
    reviewStatus: 'pending',
    reasonCodes: ['GPS_JUMP', 'MULTI_ACCOUNT_DEVICE'],
  });

  const reviewed = await autoReviewCase(caseId);
  if (!reviewed || reviewed.decision !== 'block') {
    throw new Error(`Expected block decision, got ${reviewed?.decision}`);
  }

  const batch = await processPendingFraudCases(5);
  console.log('Auto-reviewed cases:', batch.length);

  const enforced = await enforceFromRiskScore({
    userId: userB,
    deviceId,
    riskScore: 0.88,
    reasonCodes: ['MULTI_ACCOUNT_DEVICE'],
  });
  if (enforced.length === 0) throw new Error('Enforcement should apply blocks');

  console.log('Camada 27 production antifraud tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
