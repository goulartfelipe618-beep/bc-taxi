process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { listSavedPlaces, upsertSavedPlace, deleteSavedPlace } = await import(
    '../src/places/savedPlaceStore.js'
  );

  const userId = 'saved-places-user';

  const home = await upsertSavedPlace(userId, {
    placeType: 'home',
    label: 'Casa',
    address: 'Rua Teste, 1 - Blumenau',
    lat: -26.9194,
    lng: -49.0661,
    featureId: 'mapbox.home.test',
  });
  console.log('Home saved:', home.label);

  const work = await upsertSavedPlace(userId, {
    placeType: 'work',
    label: 'Trabalho',
    address: 'Av. Brasil, 1200 - Blumenau',
    lat: -26.91,
    lng: -49.05,
    featureId: 'mapbox.work.test',
  });
  console.log('Work saved:', work.label);

  const homeUpdate = await upsertSavedPlace(userId, {
    placeType: 'home',
    label: 'Minha Casa',
    address: 'Rua Nova, 99 - Blumenau',
    lat: -26.92,
    lng: -49.07,
  });
  if (homeUpdate.id !== home.id) throw new Error('Home upsert should update same row');
  console.log('Home updated:', homeUpdate.label);

  const list = await listSavedPlaces(userId);
  if (list.length !== 2) throw new Error(`Expected 2 saved places, got ${list.length}`);

  const fav = await upsertSavedPlace(userId, {
    placeType: 'favorite',
    label: 'Shopping',
    address: 'Shopping Neumarkt',
    lat: -26.915,
    lng: -49.06,
  });
  if (listSavedPlaces(userId).then((l) => l.length) && (await listSavedPlaces(userId)).length !== 3) {
    throw new Error('Favorite not added');
  }
  console.log('Favorite saved:', fav.label);

  const deleted = await deleteSavedPlace(userId, fav.id);
  if (!deleted) throw new Error('Delete failed');
  const afterDelete = await listSavedPlaces(userId);
  if (afterDelete.length !== 2) throw new Error('Delete did not remove favorite');

  console.log('Saved places OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
