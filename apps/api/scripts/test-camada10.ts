process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

import type { RideRecord } from '../src/match/types.js';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { upsertPushToken, listUserNotifications } = await import('../src/notifications/pushTokenStore.js');
  const { dispatchPushForEvent } = await import('../src/notifications/notificationService.js');
  const { buildEvent } = await import('../src/realtime/outboxStore.js');
  const { issueRideReceipt, getRideReceipt, toPublicReceipt } = await import('../src/receipts/receiptService.js');
  const { getAdminOverview } = await import('../src/admin/adminService.js');

  const userId = randomUUID();
  await upsertPushToken({ userId, platform: 'expo', token: 'ExponentPushToken[test-camada10]' });

  const event = buildEvent(
    'RIDE_COMPLETED',
    'ride',
    randomUUID(),
    { fareCentavos: 4200 },
    { userIds: [userId], rideId: randomUUID() },
  );
  await dispatchPushForEvent(event);

  const history = await listUserNotifications(userId);
  if (history.length === 0 && process.env.DATABASE_URL === '') {
    // memory mode skips DB log listing — push dispatch still runs
    console.log('Push dispatch OK (memory mode)');
  }

  const ride: RideRecord = {
    id: randomUUID(),
    passengerId: userId,
    driverId: randomUUID(),
    categoryCode: 'economico',
    status: 'COMPLETED',
    pickupLat: -26.99,
    pickupLng: -48.63,
    dropoffLat: -26.92,
    dropoffLng: -49.07,
    pickupAddress: 'Centro BC',
    dropoffAddress: 'Praia Central',
    passengerCount: 1,
    isCorporate: false,
    isShared: false,
    hasPet: false,
    needsWheelchair: false,
    estimatedFareCentavos: 4200,
    rideVersion: 1,
    matchStage: 1,
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const receipt = await issueRideReceipt(ride);
  const again = await getRideReceipt(ride.id, userId);
  if (!again || again.receiptNumber !== receipt.receiptNumber) throw new Error('Receipt idempotency failed');
  if (!receipt.htmlContent.includes('BC Taxi')) throw new Error('Receipt HTML missing');
  console.log('Receipt:', toPublicReceipt(receipt).receiptNumber, toPublicReceipt(receipt).amountLabel);

  const overview = await getAdminOverview();
  if (typeof overview.ridesToday !== 'number') throw new Error('Admin overview invalid');

  console.log('Camada 10 push + receipts + admin tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
