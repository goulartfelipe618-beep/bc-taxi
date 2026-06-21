process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    ensureDemoCorporateMember,
    getCorporateMembership,
    bookCorporateRide,
    validateCorporatePolicy,
    listCorporateInvoiceLines,
  } = await import('../src/corporate/corporateService.js');
  const {
    createDeliveryJob,
    confirmDeliveryProof,
    validatePackageDeclaration,
    listRequesterDeliveries,
  } = await import('../src/delivery/deliveryService.js');
  const { getAdminOverview } = await import('../src/admin/adminService.js');

  const userId = randomUUID();
  await ensureDemoCorporateMember(userId);
  const membership = await getCorporateMembership(userId);
  if (!membership) throw new Error('Corporate membership missing');

  const policyOk = validateCorporatePolicy(membership.policy, {
    categoryCode: 'corporativo',
    fareCentavos: 8000,
  });
  if (!policyOk.ok) throw new Error(`Policy should pass: ${policyOk.reason}`);

  const blocked = validatePackageDeclaration('caixa com explosivo');
  if (blocked.ok) throw new Error('Forbidden package should be blocked');

  const corporate = await bookCorporateRide({
    passengerId: userId,
    accountId: membership.account.id,
    costCenterId: membership.costCenters[0]!.id,
    categoryCode: 'corporativo',
    pickupLat: -26.9194,
    pickupLng: -49.0661,
    pickupAddress: 'Centro',
    dropoffLat: -26.99,
    dropoffLng: -48.63,
    dropoffAddress: 'Praia',
    distanceKm: 8,
    durationMin: 20,
  });
  console.log('Corporate ride:', corporate.ride.id, corporate.billingMode);

  const lines = await listCorporateInvoiceLines(membership.account.id);
  if (lines.length < 1) throw new Error('Expected invoice line');

  const delivery = await createDeliveryJob({
    requesterId: userId,
    pickupLat: -26.91,
    pickupLng: -49.06,
    pickupAddress: 'Loja A',
    dropoffLat: -26.95,
    dropoffLng: -48.9,
    dropoffAddress: 'Cliente B',
    packageDescription: 'Documentos',
    isFragile: true,
    distanceKm: 5,
    durationMin: 12,
  });
  console.log('Delivery:', delivery.job.id, 'PINs issued');

  await confirmDeliveryProof({
    jobId: delivery.job.id,
    actorUserId: userId,
    proofType: 'pickup_pin',
    pin: delivery.pins.pickupPin,
  });
  await confirmDeliveryProof({
    jobId: delivery.job.id,
    actorUserId: userId,
    proofType: 'dropoff_pin',
    pin: delivery.pins.dropoffPin,
  });

  const list = await listRequesterDeliveries(userId);
  if (!list.some((j) => j.status === 'delivered')) throw new Error('Delivery not completed');

  const overview = await getAdminOverview();
  if (typeof overview.pendingCorporateInvoices !== 'number') {
    throw new Error('Admin overview missing corporate KPIs');
  }

  console.log('Camada 12 corporate + delivery tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
