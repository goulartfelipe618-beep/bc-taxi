process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { config } = await import('../src/config.js');
  const {
    getCategoryRequirementProfile,
    getCategoryLocationFreshnessSeconds,
    validateDriverCategoryProduction,
    __testResetCategoryDocumentProductionMemory,
  } = await import('../src/catalog/categoryDocumentProductionService.js');
  const {
    getClientProductionConfig,
    getClientBootstrap,
    __testResetClientBootstrapProductionMemory,
  } = await import('../src/catalog/clientBootstrapProductionService.js');
  const {
    getGeoGoMatchConfig,
    findNearbyDriversGeoGo,
    __testResetGeoGoMatchMemory,
    __testGetGeoGoMatchEvents,
  } = await import('../src/match/geoGoMatchService.js');
  const { memoryMatchStore, __testAgeAllDriverLocations } = await import(
    '../src/stores/memoryMatchStore.js'
  );
  const { createUser } = await import('../src/userStore.js');

  __testResetCategoryDocumentProductionMemory();
  __testResetClientBootstrapProductionMemory();
  __testResetGeoGoMatchMemory();

  const regionId = config.defaultServiceRegionId;
  const clientCfg = await getClientProductionConfig(regionId);
  if (!clientCfg.useApiCategories) throw new Error('Client config should use API categories');
  console.log('Client production config OK:', clientCfg.configVersion);

  const airportProfile = await getCategoryRequirementProfile(regionId, 'aeroporto');
  if (!airportProfile || airportProfile.locationFreshnessSeconds !== 60) {
    throw new Error('Airport category profile missing or wrong SLA');
  }
  const economicoSla = await getCategoryLocationFreshnessSeconds('economico', regionId);
  if (economicoSla !== 120) throw new Error(`Economico SLA expected 120, got ${economicoSla}`);
  console.log('Category requirement profiles OK');

  const bootstrap = await getClientBootstrap({
    lat: -26.99,
    lng: -48.6348,
  });
  if (!bootstrap.inCoverage || bootstrap.categories.length < 5) {
    throw new Error('Bootstrap categories incomplete');
  }
  if (!bootstrap.categoryRequirementProfiles.length) {
    throw new Error('Bootstrap missing category requirement profiles');
  }
  console.log('Client bootstrap OK:', bootstrap.categories.length, 'categories');

  const passenger = await createUser({
    email: `camada43-${randomUUID()}@test.local`,
    password: 'test12345',
    fullName: 'Passageiro Camada 43',
    role: 'passenger',
  });
  const authedBootstrap = await getClientBootstrap({
    lat: -26.99,
    lng: -48.6348,
    userId: passenger.id,
    userEmail: passenger.email,
    userFullName: passenger.full_name,
    userRole: passenger.role,
  });
  if (!authedBootstrap.profile || authedBootstrap.payment.methods.length < 3) {
    throw new Error('Authenticated bootstrap missing profile or payment methods');
  }
  console.log('Authenticated bootstrap OK — methods:', authedBootstrap.payment.methods.length);

  memoryMatchStore.ensureSeeded();
  const freshNearby = await findNearbyDriversGeoGo({
    lat: -26.99,
    lng: -48.6348,
    radiusM: 15000,
    categoryCode: 'economico',
    regionId,
  });
  if (freshNearby.length === 0) throw new Error('Expected nearby drivers with fresh locations');

  __testAgeAllDriverLocations(200_000);
  const staleNearby = await findNearbyDriversGeoGo({
    lat: -26.99,
    lng: -48.6348,
    radiusM: 15000,
    categoryCode: 'economico',
    regionId,
  });
  if (staleNearby.length > 0) throw new Error('Stale drivers should be filtered by geo-go SLA');

  const events = __testGetGeoGoMatchEvents();
  if (!events.some((e) => e.eventType === 'sla_filtered')) {
    throw new Error('Expected sla_filtered geo-go event');
  }
  console.log('geo-go SLA filtering OK');

  const geoCfg = await getGeoGoMatchConfig(regionId);
  if (geoCfg.mode !== 'internal') throw new Error('geo-go should default to internal mode');
  console.log('geo-go config OK:', geoCfg.configVersion);

  const demoDriverId = freshNearby[0]?.userId;
  if (demoDriverId) {
    const aeroportoValidation = await validateDriverCategoryProduction({
      driverId: demoDriverId,
      categoryCode: 'aeroporto',
      regionId,
      reputationScore: 4.8,
      completedRides: 100,
    });
    if (aeroportoValidation.ok) {
      throw new Error('Demo driver should not pass aeroporto without airport docs');
    }
    console.log('Airport production gate OK:', aeroportoValidation.reason);
  }

  console.log('\nCamada 43 — client bootstrap + documentos/categorias + geo-go: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
