process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const {
    listAirportZones,
    detectZoneAt,
    resolveAirportContext,
    computeAirportPressure,
    captureRideAirportSnapshot,
  } = await import('../src/airport/airportService.js');
  const { buildEngineQuote } = await import('../src/pricing/pricingEngineService.js');
  const { computeLiveFactors } = await import('../src/pricing/dynamicPricingService.js');
  const { randomUUID } = await import('node:crypto');

  const zones = await listAirportZones();
  if (zones.length < 1) throw new Error('Expected seeded airport zone');

  const atAirport = await detectZoneAt(-26.8799, -48.6514);
  if (!atAirport || atAirport.iataCode !== 'NVT') throw new Error('Airport detection failed');
  console.log('Detected:', atAirport.name);

  const ctx = await resolveAirportContext({
    fromLat: -26.8799,
    fromLng: -48.6514,
    toLat: -26.9194,
    toLng: -49.0661,
    categoryCode: 'economico',
  });
  if (!ctx.isAirportRide) throw new Error('Should be airport ride');
  if (ctx.airportFeeCentavos !== 0) throw new Error('Default fee should be 0 (Uber model)');
  console.log('Airport context OK — fee R$ 0, pressure:', ctx.airportPressure.toFixed(3));

  const pressure = await computeAirportPressure(-26.8799, -48.6514, 'economico');
  if (pressure < 0) throw new Error('Invalid airport pressure');

  const factors = await computeLiveFactors(-26.8799, -48.6514);
  if (factors.airportPressure <= 0) throw new Error('Dynamic pricing should include airport pressure at NVT');
  console.log('Dynamic airport factor:', factors.airportPressure.toFixed(3));

  const quote = await buildEngineQuote({
    categoryCode: 'economico',
    distanceKm: 45,
    durationMin: 55,
    fromLat: -26.8799,
    fromLng: -48.6514,
    toLat: -26.9194,
    toLng: -49.0661,
  });
  if (!quote.airportContext?.isAirportRide) throw new Error('Quote missing airport context');
  console.log('Quote fare:', quote.passengerFareCentavos, 'centavos');

  const airportQuote = await buildEngineQuote({
    categoryCode: 'aeroporto',
    distanceKm: 45,
    durationMin: 55,
    fromLat: -26.8799,
    fromLng: -48.6514,
    toLat: -26.9194,
    toLng: -49.0661,
  });
  if (airportQuote.airportContext?.pricingMode !== 'airport_category') {
    throw new Error('Aeroporto category should set pricingMode');
  }
  console.log('Aeroporto category quote:', airportQuote.passengerFareCentavos, 'centavos');

  const snap = await captureRideAirportSnapshot({
    rideId: randomUUID(),
    context: ctx,
  });
  if (!snap.id) throw new Error('Snapshot capture failed');

  console.log('Camada 15 airport (Uber-style) tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
