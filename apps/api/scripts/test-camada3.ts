/**
 * Camada 3: cancel blocks + reputation recalc (memory mode).
 */
process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

import { randomUUID } from 'node:crypto';

async function main() {
  const { isPairBlocked } = await import('../src/match/blockService.js');
  const {
    acceptOffer,
    cancelRide,
    createRideRequest,
    driverCancelRide,
    getDriverPendingOffers,
    startMatching,
  } = await import('../src/match/matchService.js');
  const { getPassengerReputation, recalculateUserReputation } = await import(
    '../src/reviews/reputationService.js'
  );
  const { insertReview } = await import('../src/reviews/reviewStore.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');

  memoryMatchStore.ensureSeeded();

  const passengerId = randomUUID();

  async function assignFirstDriver() {
    const ride = await createRideRequest({
      passengerId,
      categoryCode: 'economico',
      pickupLat: -26.9905,
      pickupLng: -48.6348,
      dropoffLat: -26.985,
      dropoffLng: -48.628,
      estimatedFareCentavos: 1800,
    });
    await startMatching(ride.id);
    await new Promise((r) => setTimeout(r, 300));
    const driver = (await memoryMatchStore.findOnlineDrivers())[0]!;
    const offers = await getDriverPendingOffers(driver.userId);
    const accepted = await acceptOffer(offers[0]!.id, driver.userId);
    if (!accepted || accepted.status !== 'DRIVER_ASSIGNED') {
      throw new Error('Accept failed');
    }
    return { rideId: accepted.id, driverId: driver.userId };
  }

  const { rideId: ride1, driverId: driver1 } = await assignFirstDriver();
  await driverCancelRide(ride1, driver1, 'test driver cancel');
  if (!(await isPairBlocked(passengerId, driver1))) {
    throw new Error('Expected block after driver cancel');
  }
  console.log('Driver cancel block OK');

  const drivers = await memoryMatchStore.findOnlineDrivers();
  const driver2 = drivers.find((d) => d.userId !== driver1) ?? drivers[1]!;
  const ride2 = await createRideRequest({
    passengerId,
    categoryCode: 'economico',
    pickupLat: -26.9905,
    pickupLng: -48.6348,
    dropoffLat: -26.985,
    dropoffLng: -48.628,
    estimatedFareCentavos: 1800,
  });
  await startMatching(ride2.id);
  await new Promise((r) => setTimeout(r, 300));
  const offers2 = await getDriverPendingOffers(driver2.userId);
  const accepted2 = await acceptOffer(offers2[0]!.id, driver2.userId);
  if (!accepted2) throw new Error('Second accept failed');

  await cancelRide(accepted2.id, passengerId, 'test passenger cancel');
  if (!(await isPairBlocked(passengerId, driver2.userId))) {
    throw new Error('Expected block after passenger cancel');
  }
  console.log('Passenger cancel block OK');

  const completedRide = await memoryMatchStore.createRide({
    passengerId,
    categoryCode: 'economico',
    pickupLat: -26.99,
    pickupLng: -48.63,
    dropoffLat: -26.985,
    dropoffLng: -48.628,
    estimatedFareCentavos: 1500,
  });
  await memoryMatchStore.updateRideStatus(completedRide.id, 'COMPLETED', {
    driverId: driver2.userId,
  });

  await insertReview({
    rideId: completedRide.id,
    reviewerUserId: passengerId,
    reviewedUserId: driver2.userId,
    reviewerRole: 'passenger',
    reviewedRole: 'driver',
    stars: 5,
  });
  const driverRep = await recalculateUserReputation(driver2.userId, 'driver');
  console.log('Driver reputation recalc OK:', driverRep);

  await insertReview({
    rideId: completedRide.id,
    reviewerUserId: driver2.userId,
    reviewedUserId: passengerId,
    reviewerRole: 'driver',
    reviewedRole: 'passenger',
    stars: 4,
  });
  await recalculateUserReputation(passengerId, 'passenger');
  const passengerRep = await getPassengerReputation(passengerId);
  console.log('Passenger reputation OK:', passengerRep);

  console.log('Camada 3 tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
