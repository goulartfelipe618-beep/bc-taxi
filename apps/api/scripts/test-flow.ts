import { autocompletePlaces, getDrivingRoute } from '../src/mapbox/mapboxClient.js';
import { acceptOffer, getDriverPendingOffers, startMatching } from '../src/match/matchService.js';
import {
  attachIntentToRide,
  authorizeRidePayment,
  cancelRidePayment,
  getUserPaymentMethods,
} from '../src/payments/paymentService.js';
import { DEMO_PAYMENT_METHOD_IDS } from '../src/payments/paymentStore.js';
import {
  driverCompleteRide,
  driverMarkArrived,
  verifyStartCode,
} from '../src/ride/lifecycleService.js';
import { getPlainCodesForTest } from '../src/ride/codeStore.js';
import { memoryMatchStore } from '../src/stores/memoryMatchStore.js';

memoryMatchStore.ensureSeeded();

const passengerId = 'flow-passenger';

console.log('=== Mapbox mock ===');
const places = await autocompletePlaces('Blumenau');
console.log('Places:', places.length, places[0]?.label);
const route = await getDrivingRoute(-26.9905, -48.6348, -26.985, -48.628);
console.log('Route:', route.distanceKm, 'km', route.durationMin, 'min', route.source);

console.log('=== Payments ===');
const methods = await getUserPaymentMethods(passengerId);
console.log('Methods:', methods.map((m) => m.methodType).join(', '));

console.log('=== Ride flow ===');
const ride = await memoryMatchStore.createRide({
  passengerId,
  categoryCode: 'economico',
  pickupLat: -26.9905,
  pickupLng: -48.6348,
  dropoffLat: -26.985,
  dropoffLng: -48.628,
  estimatedFareCentavos: 1800,
});

const intent = await authorizeRidePayment({
  userId: passengerId,
  paymentMethodId: DEMO_PAYMENT_METHOD_IDS.pix,
  amountCentavos: 1800,
});
await attachIntentToRide(ride.id, intent.id);
await memoryMatchStore.updateRideLifecycle(ride.id, { paymentIntentId: intent.id });
console.log('Payment authorized:', intent.status);

await startMatching(ride.id);
await new Promise((r) => setTimeout(r, 300));

const driver = (await memoryMatchStore.findOnlineDrivers())[0]!;
const offers = await getDriverPendingOffers(driver.userId);
const accepted = await acceptOffer(offers[0]!.id, driver.userId);
console.log('Assigned:', accepted?.status);

await driverMarkArrived(ride.id, driver.userId);
const codes = getPlainCodesForTest(ride.id)!;
await verifyStartCode(ride.id, driver.userId, 'passenger', codes.passenger);
await verifyStartCode(ride.id, passengerId, 'driver', codes.driver);
console.log('In progress');

const done = await driverCompleteRide(ride.id, driver.userId);
console.log('Completed:', done.status, 'fare', done.estimatedFareCentavos);

console.log('=== Cancel void ===');
const ride2 = await memoryMatchStore.createRide({
  passengerId,
  categoryCode: 'economico',
  pickupLat: -26.99,
  pickupLng: -48.63,
  dropoffLat: -26.985,
  dropoffLng: -48.628,
});
const intent2 = await authorizeRidePayment({
  userId: passengerId,
  paymentMethodId: DEMO_PAYMENT_METHOD_IDS.card,
  amountCentavos: 1200,
});
await attachIntentToRide(ride2.id, intent2.id);
await cancelRidePayment(ride2.id);
console.log('Void OK');

console.log('Full flow test OK');
