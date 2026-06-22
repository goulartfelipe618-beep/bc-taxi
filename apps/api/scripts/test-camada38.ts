process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    DEMO_ACCOUNT_ID,
    ensureDemoCorporateMember,
    getCorporateMembership,
    bookCorporateRide,
    approveCorporateRideBooking,
    captureCorporateInvoiceLine,
    listCorporateInvoiceLines,
    __testSetCorporateMemberRole,
  } = await import('../src/corporate/corporateService.js');
  const {
    seedMemoryCorporateProductionPolicy,
    validateCorporatePolicyProduction,
    requiresCorporateApproval,
    closeCorporateBillingPeriod,
    listCorporateBillingStatements,
    __testResetCorporateProductionMemory,
    __testGetCorporateApprovals,
    __testGetCorporateProductionEvents,
  } = await import('../src/corporate/corporateProductionService.js');

  __testResetCorporateProductionMemory();

  const employeeId = randomUUID();
  const managerId = randomUUID();
  await ensureDemoCorporateMember(employeeId);
  await ensureDemoCorporateMember(managerId);
  __testSetCorporateMemberRole(managerId, 'manager');

  const membership = await getCorporateMembership(employeeId);
  if (!membership) throw new Error('Corporate membership missing');

  const BC_REGION_ID = '00000000-0000-4000-8000-000000000020';
  seedMemoryCorporateProductionPolicy(DEMO_ACCOUNT_ID, {
    ...membership.policy,
    approvalThresholdCentavos: 12000,
    allowedRegionIds: [BC_REGION_ID],
    requireCostCenter: true,
    configVersion: 'camada38-test-v1',
  });

  const regionOk = await validateCorporatePolicyProduction(
    {
      ...membership.policy,
      approvalThresholdCentavos: 12000,
      allowedRegionIds: [BC_REGION_ID],
      requireCostCenter: true,
      configVersion: 'camada38-test-v1',
    },
    {
      categoryCode: 'corporativo',
      fareCentavos: 8000,
      pickupLat: -26.99,
      pickupLng: -48.6348,
      costCenterId: membership.costCenters[0]!.id,
    },
  );
  if (!regionOk.ok) throw new Error(`BC region should pass: ${regionOk.reason}`);
  console.log('Region policy OK');

  const regionBlocked = await validateCorporatePolicyProduction(
    {
      ...membership.policy,
      allowedRegionIds: [BC_REGION_ID],
      requireCostCenter: true,
      configVersion: 'camada38-test-v1',
    },
    {
      categoryCode: 'corporativo',
      fareCentavos: 8000,
      pickupLat: -23.55,
      pickupLng: -46.63,
      costCenterId: membership.costCenters[0]!.id,
    },
  );
  if (regionBlocked.ok) throw new Error('São Paulo pickup should be blocked');
  console.log('Region block OK');

  if (!requiresCorporateApproval(
    {
      ...membership.policy,
      approvalThresholdCentavos: 12000,
      requireCostCenter: true,
      configVersion: 'camada38-test-v1',
    },
    15000,
  )) {
    throw new Error('High fare should require approval');
  }
  console.log('Approval threshold OK');

  const pending = await bookCorporateRide({
    passengerId: employeeId,
    accountId: membership.account.id,
    costCenterId: membership.costCenters[0]!.id,
    categoryCode: 'corporativo',
    pickupLat: -26.99,
    pickupLng: -48.6348,
    pickupAddress: 'Centro BC',
    dropoffLat: -26.99,
    dropoffLng: -48.63,
    dropoffAddress: 'Praia',
    distanceKm: 45,
    durationMin: 70,
  });
  if (!pending.pendingApproval) throw new Error('Expected pending approval for high fare');
  console.log('Pending approval:', pending.pendingApproval.id);

  const approvals = __testGetCorporateApprovals();
  if (approvals.length < 1) throw new Error('Approval record missing');

  const approved = await approveCorporateRideBooking({
    approvalId: pending.pendingApproval.id,
    accountId: membership.account.id,
    decidedByUserId: managerId,
  });
  if (approved.approval.status !== 'approved') throw new Error('Approval not granted');
  console.log('Approval granted, ride:', approved.ride?.id ?? pending.ride.id);

  const rideId = pending.ride.id;
  const captured = await captureCorporateInvoiceLine(rideId, 14200);
  if (!captured) throw new Error('Invoice capture failed');

  const today = new Date().toISOString().slice(0, 10);
  const statement = await closeCorporateBillingPeriod({
    accountId: membership.account.id,
    periodStart: today,
    periodEnd: today,
    configVersion: 'camada38-test-v1',
  });
  if (statement.lineCount < 1 || statement.totalCentavos < 1) {
    throw new Error('Statement should aggregate invoice lines');
  }
  console.log('Billing statement:', statement.id, statement.totalCentavos);

  const statements = await listCorporateBillingStatements(membership.account.id);
  if (!statements.some((s) => s.id === statement.id)) throw new Error('Statement not listed');

  const lines = await listCorporateInvoiceLines(membership.account.id);
  if (!lines.some((l) => l.status === 'invoiced')) throw new Error('Lines should be invoiced');

  const events = __testGetCorporateProductionEvents();
  if (!events.some((e) => e.eventType === 'approval_requested')) throw new Error('Missing approval event');
  if (!events.some((e) => e.eventType === 'statement_closed')) throw new Error('Missing statement event');

  console.log('Camada 38 corporate B2B production tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
