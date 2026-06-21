process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    computeSuggestionScore,
    computeTextRelevance,
    SUGGESTION_WEIGHTS,
  } = await import('../src/places/suggestionRankService.js');
  const { searchPlacesIntelligent } = await import('../src/places/intelligentSearchService.js');
  const { upsertPlaceAlias } = await import('../src/places/aliasStore.js');
  const { upsertSavedPlace } = await import('../src/places/savedPlaceStore.js');
  const { recordPlaceConfirmation } = await import('../src/places/placeStore.js');
  const { reverseGeocode } = await import('../src/mapbox/mapboxClient.js');
  const { getPopularityForFeature } = await import('../src/places/popularityStore.js');

  const userId = randomUUID();

  const textScore = computeTextRelevance('shopping', 'Shopping Neumarkt', 'Centro Blumenau');
  if (textScore < 0.5) throw new Error('Text relevance too low');

  const composite = computeSuggestionScore({
    query: 'shopping',
    label: 'Shopping Neumarkt',
    address: 'Centro Blumenau SC',
    lat: -26.9182,
    lng: -49.0685,
    proximityLat: -26.9194,
    proximityLng: -49.0661,
    userUseCount: 5,
    globalPopularity: 890,
    daysSinceUse: 2,
  });
  if (composite <= 0 || composite > 1.5) throw new Error(`Unexpected composite score: ${composite}`);
  console.log('Suggestion score:', composite, 'weights sum:', Object.values(SUGGESTION_WEIGHTS).reduce((a, b) => a + b));

  await upsertSavedPlace(userId, {
    placeType: 'home',
    label: 'Casa',
    address: 'Rua XV de Novembro, Blumenau',
    lat: -26.9194,
    lng: -49.0661,
    featureId: 'mock-centro-blumenau',
  });

  await recordPlaceConfirmation(userId, {
    id: 'mock-shopping-neumarkt',
    label: 'Shopping Neumarkt',
    address: 'Shopping Neumarkt, Blumenau',
    lat: -26.9182,
    lng: -49.0685,
    featureId: 'mock-shopping-neumarkt',
    source: 'mock',
  });

  await upsertPlaceAlias(userId, {
    alias: 'mercado',
    place: {
      id: 'mock-shopping-neumarkt',
      label: 'Shopping Neumarkt',
      address: 'Neumarkt Blumenau',
      lat: -26.9182,
      lng: -49.0685,
      featureId: 'mock-shopping-neumarkt',
      source: 'mock',
    },
  });

  const results = await searchPlacesIntelligent({
    query: 'shop',
    userId,
    proximityLat: -26.9194,
    proximityLng: -49.0661,
    sessionToken: 'camada22-session',
    limit: 8,
  });
  if (results.length === 0) throw new Error('Intelligent search returned empty');
  if (results[0]!.suggestionScore <= 0) throw new Error('Missing suggestion score');
  console.log(
    'Top suggestions:',
    results.slice(0, 3).map((s) => `${s.label} (${s.suggestionSource})=${s.suggestionScore}`),
  );

  const aliasHit = results.find((s) => s.suggestionSource === 'alias' || s.label.includes('Neumarkt'));
  if (!aliasHit) throw new Error('Expected shopping/alias in results');

  const pop = await getPopularityForFeature('mock-shopping-neumarkt');
  if (pop <= 0) throw new Error('Popularity should increase after search');

  const reversed = await reverseGeocode(-26.9194, -49.0661);
  if (!reversed?.label) throw new Error('Reverse geocode failed');
  console.log('Reverse geocode:', reversed.label);

  console.log('Camada 22 endereços inteligentes tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
