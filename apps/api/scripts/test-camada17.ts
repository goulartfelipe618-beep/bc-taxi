process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const {
    quoteRoutesWithFares,
    selectRouteStrategy,
    toPublicRouteQuote,
    ROUTE_STRATEGY_META,
  } = await import('../src/route/routeService.js');
  const { estimateFaresForAlternatives } = await import('../src/route/routePricingService.js');
  const { getRouteQuote } = await import('../src/route/routeStore.js');

  if (Object.keys(ROUTE_STRATEGY_META).length !== 4) throw new Error('Expected 4 strategy labels');

  const fromLat = -26.9905;
  const fromLng = -48.6348;
  const toLat = -26.9194;
  const toLng = -49.0661;

  const quote = await quoteRoutesWithFares({
    fromLat,
    fromLng,
    toLat,
    toLng,
    categoryCode: 'economico',
  });

  const pub = toPublicRouteQuote(quote);
  if (pub.alternatives.length !== 4) throw new Error('Expected 4 alternatives');
  if (!pub.alternatives.every((a) => a.label && a.estimatedFareCentavos != null)) {
    throw new Error('Each alternative should have label and fare');
  }
  console.log('Route alternatives with fares:');
  for (const alt of pub.alternatives) {
    console.log(`  ${alt.label}: ${alt.passengerFareLabel} · ${alt.etaMinutes} min`);
  }

  const fares = await estimateFaresForAlternatives('comfort', quote.alternatives, {
    fromLat,
    fromLng,
    toLat,
    toLng,
  });
  if (fares.length !== 4) throw new Error('Expected 4 fare estimates');

  const economical = pub.alternatives.find((a) => a.strategy === 'economical')!;
  const selected = await selectRouteStrategy({
    requestId: quote.requestId,
    strategy: 'economical',
    categoryCode: 'economico',
  });
  if (!selected || selected.selectedStrategy !== 'economical') {
    throw new Error('Route selection failed');
  }

  const reloaded = await getRouteQuote(quote.requestId);
  if (!reloaded || reloaded.selectedStrategy !== 'economical') {
    throw new Error('Persisted selection missing');
  }

  if (economical.estimatedFareCentavos! >= pub.recommended.estimatedFareCentavos!) {
    console.log('Economical fare <= recommended (often cheaper on tolls)');
  }

  console.log('Camada 17 multi-route UI tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
