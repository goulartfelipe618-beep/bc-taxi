process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { quoteRoutes, toPublicRouteQuote } = await import('../src/route/routeService.js');
  const { getWeatherAtPoint, isCategoryBlockedByWeather } = await import('../src/weather/weatherService.js');
  const { computeLiveFactors } = await import('../src/pricing/dynamicPricingService.js');
  const { deriveStrategyVariant, pickRecommended } = await import('../src/route/routeCost.js');

  const fromLat = -26.9905;
  const fromLng = -48.6348;
  const toLat = -26.9194;
  const toLng = -49.0661;

  const weather = await getWeatherAtPoint(fromLat, fromLng);
  console.log('Weather:', weather.weatherState, 'pressure', weather.weatherPressure);
  console.log('Moto blocked:', isCategoryBlockedByWeather('moto', weather.weatherState));

  const quote = await quoteRoutes({ fromLat, fromLng, toLat, toLng });
  console.log('Route quote:', toPublicRouteQuote(quote).selectedStrategy, quote.distanceKm, 'km');
  if (quote.alternatives.length !== 4) throw new Error('Expected 4 route strategies');

  const base = { distanceM: 12000, etaSeconds: 900, tollsCentavos: 800 };
  const alts = ['fastest', 'shortest', 'economical', 'less_traffic'].map((s) =>
    deriveStrategyVariant(base, s as 'fastest'),
  );
  const best = pickRecommended(alts.map((a) => ({ ...a, geometry: undefined, isRecommended: false })));
  console.log('Recommended strategy:', best.strategy);

  const factors = await computeLiveFactors(fromLat, fromLng);
  if (typeof factors.weatherPressure !== 'number') throw new Error('weatherPressure missing');
  console.log('Dynamic factors weather:', factors.weatherPressure);

  console.log('Camada 6 routes + weather tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
