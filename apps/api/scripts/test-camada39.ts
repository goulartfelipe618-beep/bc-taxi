process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    createDeliveryJob,
    confirmDeliveryProof,
    recordDeliveryJobWait,
    listRequesterDeliveries,
  } = await import('../src/delivery/deliveryService.js');
  const {
    computeDeliveryProductionFare,
    computeDeliveryWaitFee,
    validatePackageDeclarationProduction,
    assertDeliveryDriverEligible,
    confirmDeliveryPhotoProof,
    getDeliveryProductionConfig,
    seedMemoryDeliveryDriverRestriction,
    __testResetDeliveryProductionMemory,
    __testGetDeliveryProductionEvents,
    __testGetDeliveryWaitFees,
  } = await import('../src/delivery/deliveryProductionService.js');
  const { filterEligibleDrivers } = await import('../src/match/eligibility.js');

  __testResetDeliveryProductionMemory();

  const cfg = await getDeliveryProductionConfig();
  if (cfg.fragileMultiplier !== 1.08 || cfg.priorityMultiplier !== 1.18) {
    throw new Error('Production multipliers mismatch');
  }
  console.log('Config OK:', cfg.configVersion);

  const weightBlocked = validatePackageDeclarationProduction('Documentos', {
    declaredWeightKg: 45,
    maxWeightKg: cfg.maxDeclaredWeightKg,
  });
  if (weightBlocked.ok) throw new Error('Heavy package should be blocked');
  console.log('Weight gate OK');

  const fare = computeDeliveryProductionFare(
    4000,
    { isFragile: true, isPriority: true, declaredValueCentavos: 50_000 },
    cfg,
  );
  if (fare.estimatedFareCentavos <= 4000) throw new Error('Multipliers should increase fare');
  console.log('Production fare:', fare.estimatedFareCentavos, 'insurance:', fare.insuranceFeeCentavos);

  const waitPickup = computeDeliveryWaitFee('pickup', 12, cfg);
  if (waitPickup.feeCentavos !== (12 - cfg.pickupIncludedWaitMinutes) * cfg.pickupWaitPerMinuteCentavos) {
    throw new Error(`Unexpected pickup wait fee: ${waitPickup.feeCentavos}`);
  }
  console.log('Wait fee pickup:', waitPickup.feeCentavos);

  try {
    await assertDeliveryDriverEligible(randomUUID(), 4.2);
    throw new Error('Low reputation driver should be blocked');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!msg.includes('Reputação')) throw e;
  }
  await assertDeliveryDriverEligible(randomUUID(), 4.8);
  console.log('Driver reputation gate OK');

  const restrictedDriverId = randomUUID();
  seedMemoryDeliveryDriverRestriction(restrictedDriverId, 'extravio recente');
  const ride = {
    id: randomUUID(),
    passengerId: randomUUID(),
    categoryCode: 'entrega',
    status: 'REQUESTED' as const,
    pickupLat: -26.99,
    pickupLng: -48.63,
    dropoffLat: -26.98,
    dropoffLng: -48.62,
    passengerCount: 0,
    isCorporate: false,
    isShared: false,
    hasPet: false,
    needsWheelchair: false,
    rideVersion: 1,
    matchStage: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const passenger = { passengerId: ride.passengerId, reputationScore: 4.8, tier: 'confiavel' as const };
  const eligible = await filterEligibleDrivers(
    [
      {
        userId: restrictedDriverId,
        fullName: 'Restricted',
        isOnline: true,
        operationalStatus: 'online',
        lat: -26.99,
        lng: -48.63,
        locationUpdatedAt: new Date(),
        reputationScore: 4.9,
        completedRides: 200,
        cancellationRate: 0.02,
        acceptanceRate: 0.9,
        enabledCategories: ['entrega', 'economico'],
        petReady: false,
        comfortApproved: false,
        wheelchairAccessible: false,
        collectiveCertified: false,
      },
    ],
    ride,
    passenger,
    5000,
  );
  if (eligible.length > 0) throw new Error('Restricted driver should be excluded from entrega match');
  console.log('Driver restriction in match OK');

  const userId = randomUUID();
  const created = await createDeliveryJob({
    requesterId: userId,
    pickupLat: -26.99,
    pickupLng: -48.6348,
    pickupAddress: 'Loja',
    dropoffLat: -26.95,
    dropoffLng: -48.9,
    dropoffAddress: 'Cliente',
    packageDescription: 'Caixa pequena',
    declaredWeightKg: 5,
    declaredValueCentavos: 10_000,
    isFragile: true,
    isPriority: false,
    distanceKm: 8,
    durationMin: 18,
  });
  console.log('Delivery job:', created.job.id, 'fare:', created.job.estimatedFareCentavos);

  await recordDeliveryJobWait({
    jobId: created.job.id,
    userId,
    phase: 'pickup',
    waitMinutes: 10,
  });
  await recordDeliveryJobWait({
    jobId: created.job.id,
    userId,
    phase: 'dropoff',
    waitMinutes: 8,
  });

  const waits = __testGetDeliveryWaitFees(created.job.id);
  if (!waits?.pickup || !waits?.dropoff) throw new Error('Wait fees not recorded');

  await confirmDeliveryPhotoProof({
    jobId: created.job.id,
    proofType: 'pickup_photo',
    photoRef: 'https://storage.example/pickup-abc123.jpg',
    actorUserId: userId,
  });

  await confirmDeliveryProof({
    jobId: created.job.id,
    actorUserId: userId,
    proofType: 'pickup_pin',
    pin: created.pins.pickupPin,
  });

  await confirmDeliveryProof({
    jobId: created.job.id,
    actorUserId: userId,
    proofType: 'dropoff_pin',
    pin: created.pins.dropoffPin,
  });

  const list = await listRequesterDeliveries(userId);
  const delivered = list.find((j) => j.id === created.job.id);
  if (!delivered || delivered.status !== 'delivered') throw new Error('Delivery not completed');
  if (!delivered.finalFareCentavos || delivered.finalFareCentavos <= (delivered.estimatedFareCentavos ?? 0)) {
    throw new Error('Final fare should include wait fees');
  }
  console.log('Settled fare:', delivered.finalFareCentavos);

  const events = __testGetDeliveryProductionEvents();
  if (!events.some((e) => e.eventType === 'wait_fee_assessed')) throw new Error('Missing wait event');
  if (!events.some((e) => e.eventType === 'fare_settled')) throw new Error('Missing settle event');

  console.log('Camada 39 delivery production tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
