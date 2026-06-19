import { generateSixDigitCode, hashRideCode, verifyCodeHash } from '../src/ride/codeCrypto.js';
import {
  getPlainCodesForTest,
  issueStartCodes,
  reissueStartCodes,
  validateStartCode,
} from '../src/ride/codeStore.js';
import {
  driverCompleteRide,
  driverMarkArrived,
  verifyStartCode,
} from '../src/ride/lifecycleService.js';
import { acceptOffer, getDriverPendingOffers, startMatching } from '../src/match/matchService.js';
import { captureRidePayment, authorizeRidePayment, attachIntentToRide } from '../src/payments/paymentService.js';
import { DEMO_PAYMENT_METHOD_IDS } from '../src/payments/paymentStore.js';
import { memoryMatchStore } from '../src/stores/memoryMatchStore.js';

memoryMatchStore.ensureSeeded();

const passengerId = 'lifecycle-passenger';
const ride = await memoryMatchStore.createRide({
  passengerId,
  categoryCode: 'economico',
  pickupLat: -26.9905,
  pickupLng: -48.6348,
  dropoffLat: -26.985,
  dropoffLng: -48.628,
  estimatedFareCentavos: 1458,
});

const intent = await authorizeRidePayment({
  userId: passengerId,
  paymentMethodId: DEMO_PAYMENT_METHOD_IDS.pix,
  amountCentavos: 1458,
});
await attachIntentToRide(ride.id, intent.id);
await memoryMatchStore.updateRideLifecycle(ride.id, { paymentIntentId: intent.id });

console.log('1. Crypto');
const code = generateSixDigitCode();
const hash = hashRideCode(code, ride.id, 'passenger');
console.assert(/^\d{6}$/.test(code), 'code 6 digits');
console.assert(verifyCodeHash(code, ride.id, 'passenger', hash), 'hash verify');

console.log('2. Match + accept');
await startMatching(ride.id);
await new Promise((r) => setTimeout(r, 300));
const drivers = await memoryMatchStore.findOnlineDrivers();
const driver = drivers[0]!;
const offers = await getDriverPendingOffers(driver.userId);
console.assert(offers.length > 0, 'offer exists');
const assigned = await acceptOffer(offers[0]!.id, driver.userId);
console.assert(assigned?.status === 'DRIVER_ASSIGNED', 'assigned');

console.log('3. Arrived + codes');
const arrived = await driverMarkArrived(ride.id, driver.userId);
console.assert(arrived.ride.status === 'DRIVER_ARRIVED', 'arrived');
const plain = getPlainCodesForTest(ride.id)!;
console.assert(plain.passenger.length === 6, 'passenger code');

console.log('4. Dual verification');
const p1 = await verifyStartCode(ride.id, driver.userId, 'passenger', plain.passenger);
console.assert(p1.ok && !p1.started, 'passenger verified, not started yet');
const p2 = await verifyStartCode(ride.id, passengerId, 'driver', plain.driver);
console.assert(p2.ok && p2.started, 'both verified, started');

console.log('5. Reissue limit');
const reissueRide = await memoryMatchStore.createRide({
  passengerId,
  categoryCode: 'economico',
  pickupLat: -26.99,
  pickupLng: -48.63,
  dropoffLat: -26.985,
  dropoffLng: -48.628,
});
await issueStartCodes(reissueRide.id, new Date());
await reissueStartCodes(reissueRide.id, new Date());
await reissueStartCodes(reissueRide.id, new Date());
try {
  await reissueStartCodes(reissueRide.id, new Date());
  console.error('Should have failed reissue limit');
  process.exit(1);
} catch {
  console.log('Reissue limit OK');
}

console.log('6. Cooldown after bad attempts');
const cooldownRide = await memoryMatchStore.createRide({
  passengerId,
  categoryCode: 'economico',
  pickupLat: -26.991,
  pickupLng: -48.635,
  dropoffLat: -26.986,
  dropoffLng: -48.629,
});
const fresh = await issueStartCodes(cooldownRide.id, new Date());
for (let i = 0; i < 5; i++) {
  await validateStartCode(cooldownRide.id, 'passenger', '000000');
}
const blocked = await validateStartCode(cooldownRide.id, 'passenger', fresh.passengerCode);
console.assert(!blocked.ok && blocked.reason.toLowerCase().includes('cooldown'), 'cooldown active');

console.log('7. Complete + capture');
const completed = await driverCompleteRide(ride.id, driver.userId);
console.assert(completed.status === 'COMPLETED', 'completed');

console.log('Lifecycle test OK');
