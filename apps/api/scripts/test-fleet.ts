process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { getDriverCompliance } = await import('../src/fleet/complianceService.js');
  const {
    createVehicle,
    seedDemoFleetCompliance,
    upsertDriverDocument,
    upsertVehicleDocument,
    listDriverVehicles,
  } = await import('../src/fleet/fleetStore.js');

  const driverId = 'fleet-test-driver';
  seedDemoFleetCompliance(driverId, ['economico', 'comfort'], { comfortApproved: true });

  let profile = await getDriverCompliance(driverId);
  if (!profile.canOperate) throw new Error(`Demo seed should be compliant: ${profile.blockReasons.join(', ')}`);
  console.log('Demo compliance OK, categories:', profile.enabledCategories.join(', '));

  const compliantComfort = await (
    await import('../src/fleet/complianceService.js')
  ).isDriverCompliantForCategory(driverId, 'comfort');
  if (!compliantComfort) throw new Error('Should support comfort');
  console.log('Comfort category OK');

  const vehicle = await createVehicle(driverId, {
    plate: 'TST1A23',
    make: 'Fiat',
    model: 'Argo',
    year: 2020,
    categoryCodes: ['economico'],
  });

  const far = new Date();
  far.setFullYear(far.getFullYear() + 1);
  const exp = far.toISOString().slice(0, 10);

  await upsertDriverDocument(driverId, { docType: 'CNH', status: 'approved', expiresAt: exp });
  await upsertVehicleDocument(vehicle.id, { docType: 'CRLV', status: 'approved', expiresAt: exp });
  await upsertVehicleDocument(vehicle.id, { docType: 'INSURANCE', status: 'approved', expiresAt: exp });

  profile = await getDriverCompliance(driverId);
  if (!profile.canOperate) throw new Error('Should be compliant after docs');

  const vehicles = await listDriverVehicles(driverId);
  if (vehicles.length < 1) throw new Error('Expected vehicles');

  console.log('Fleet compliance tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
