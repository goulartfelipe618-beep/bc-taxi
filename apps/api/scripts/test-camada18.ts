process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    listAccessibilityNeeds,
    validateAccessibilityBooking,
    registerAccessibilityRequest,
    isDriverCompatibleWithNeed,
    seedMemoryPcdDriver,
    upsertDriverAccessibilityProfile,
  } = await import('../src/accessibility/accessibilityService.js');
  const { createRideRequest, startMatching } = await import('../src/match/matchService.js');
  const { filterEligibleDrivers } = await import('../src/match/eligibility.js');
  const { memoryMatchStore, syncMemoryDriverFromFleet } = await import('../src/stores/memoryMatchStore.js');
  const { seedDemoFleetCompliance } = await import('../src/fleet/fleetStore.js');

  const needs = listAccessibilityNeeds();
  if (needs.length < 5) throw new Error('Expected accessibility catalog');

  const walkerOk = await validateAccessibilityBooking({
    categoryCode: 'pcd',
    accessibilityNeedCode: 'walker',
  });
  if (!walkerOk.ok) throw new Error('Walker booking should be valid');

  const wheelchairOk = await validateAccessibilityBooking({
    categoryCode: 'pcd',
    accessibilityNeedCode: 'wheelchair',
  });
  if (!wheelchairOk.ok || !wheelchairOk.needsWheelchair) throw new Error('Wheelchair validation failed');

  const passengerId = randomUUID();
  const ride = await createRideRequest({
    passengerId,
    categoryCode: 'pcd',
    pickupLat: -26.9194,
    pickupLng: -49.0661,
    dropoffLat: -26.99,
    dropoffLng: -48.63,
    accessibilityNeedCode: 'wheelchair',
    needsWheelchair: true,
    estimatedFareCentavos: 12000,
  });

  const reg = await registerAccessibilityRequest({
    rideId: ride.id,
    needCode: 'wheelchair',
    assistiveDeviceCount: 1,
  });
  if (!reg.id) throw new Error('Accessibility request missing');

  memoryMatchStore.ensureSeeded();

  const pcdDriverId = randomUUID();
  const pcdDriver = syncMemoryDriverFromFleet(pcdDriverId, {
    enabledCategories: ['pcd', 'economico'],
    wheelchairAccessible: true,
    petReady: false,
    comfortApproved: false,
  });
  pcdDriver.isOnline = true;
  pcdDriver.operationalStatus = 'online';
  pcdDriver.lat = -26.9195;
  pcdDriver.lng = -49.0662;
  pcdDriver.locationUpdatedAt = new Date();
  pcdDriver.reputationScore = 4.8;
  seedMemoryPcdDriver(pcdDriverId, { wheelchair: true });

  const regularDriverId = randomUUID();
  const regularDriver = syncMemoryDriverFromFleet(regularDriverId, {
    enabledCategories: ['economico'],
    wheelchairAccessible: false,
    petReady: false,
    comfortApproved: false,
  });
  regularDriver.isOnline = true;
  regularDriver.operationalStatus = 'online';
  regularDriver.lat = -26.9196;
  regularDriver.lng = -49.0663;
  regularDriver.locationUpdatedAt = new Date();
  regularDriver.reputationScore = 4.8;

  seedDemoFleetCompliance(pcdDriverId, ['pcd', 'economico'], { wheelchairAccessible: true });
  seedDemoFleetCompliance(regularDriverId, ['economico'], { wheelchairAccessible: false });

  if (await isDriverCompatibleWithNeed(regularDriver, 'wheelchair')) {
    throw new Error('Regular driver should not match wheelchair');
  }
  if (!(await isDriverCompatibleWithNeed(pcdDriver, 'wheelchair'))) {
    throw new Error('PCD wheelchair driver should be compatible');
  }
  if (!(await isDriverCompatibleWithNeed(pcdDriver, 'walker'))) {
    throw new Error('PCD driver should accept walker need');
  }

  const eligible = await filterEligibleDrivers(
    [pcdDriver, regularDriver],
    ride,
    { passengerId, reputationScore: 4.8, tier: 'confiavel', isCorporate: false },
    5000,
  );
  if (eligible.length !== 1 || eligible[0]!.userId !== pcdDriverId) {
    throw new Error('Only wheelchair-capable PCD driver should be eligible');
  }

  await upsertDriverAccessibilityProfile({ driverId: pcdDriverId, pcdOptIn: true });
  await startMatching(ride.id, 4.8);

  console.log('Camada 18 PCD accessibility tests OK');
  console.log('Catalog:', needs.map((n) => n.code).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
