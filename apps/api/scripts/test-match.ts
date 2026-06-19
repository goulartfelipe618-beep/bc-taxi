import { getDriverPendingOffers, acceptOffer, getRide, startMatching } from '../src/match/matchService.js';
import { memoryMatchStore } from '../src/stores/memoryMatchStore.js';

memoryMatchStore.ensureSeeded();

const ride = await memoryMatchStore.createRide({
  passengerId: 'passenger-test-1',
  categoryCode: 'economico',
  pickupLat: -26.9905,
  pickupLng: -48.6348,
  dropoffLat: -26.985,
  dropoffLng: -48.628,
});

console.log('Ride criada:', ride.id);
await startMatching(ride.id);
await new Promise((r) => setTimeout(r, 300));

const drivers = await memoryMatchStore.findOnlineDrivers();
const driver = drivers[0];
if (!driver) {
  console.error('Nenhum motorista demo');
  process.exit(1);
}

const offers = await getDriverPendingOffers(driver.userId);
console.log('Ofertas pendentes:', offers.length);

if (offers.length > 0) {
  const accepted = await acceptOffer(offers[0]!.id, driver.userId);
  console.log('Corrida após aceite:', accepted?.status, accepted?.driverId);
} else {
  const updated = await getRide(ride.id);
  console.log('Status:', updated?.status, 'stage', updated?.matchStage);
}

console.log('Match engine OK');
