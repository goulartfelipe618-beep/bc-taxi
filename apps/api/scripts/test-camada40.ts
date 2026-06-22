process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getRealtimeProductionConfig,
    isCriticalRealtimeEvent,
    shouldBroadcastDriverLocationToUi,
    smoothDriverLocationForUi,
    shouldSkipPushDueToDedup,
    getReplayEventsSince,
    recordWebSocketEventAck,
    seedMemoryRealtimeProductionConfig,
    __testResetRealtimeProductionMemory,
    __testBuildEvent,
  } = await import('../src/realtime/realtimeProductionService.js');
  const { persistOutboxEvent, __testGetMemoryOutbox } = await import('../src/realtime/outboxStore.js');
  const { dispatchPushForEvent } = await import('../src/notifications/notificationService.js');
  const {
    upsertPushToken,
    __testGetMemoryPushLog,
    __testResetMemoryPushLog,
  } = await import('../src/notifications/pushTokenStore.js');
  const {
    startOnlineSession,
    updateDriverLocation,
  } = await import('../src/driver/driverLocationService.js');
  const { memoryMatchStore } = await import('../src/stores/memoryMatchStore.js');

  __testResetRealtimeProductionMemory();
  __testResetMemoryPushLog();

  seedMemoryRealtimeProductionConfig({ gpsUiMinIntervalMs: 2000, gpsSmoothFactor: 0.4 });

  const cfg = await getRealtimeProductionConfig();
  if (cfg.gpsUiMinIntervalMs !== 2000) throw new Error('Config seed failed');
  console.log('Realtime config OK:', cfg.configVersion);

  if (!isCriticalRealtimeEvent('RIDE_DRIVER_ASSIGNED')) throw new Error('Assigned should be critical');
  if (isCriticalRealtimeEvent('DRIVER_LOCATION_UPDATED')) throw new Error('Location should not be critical');
  console.log('Critical event flags OK');

  const rideId = randomUUID();
  const driverId = randomUUID();
  const first = shouldBroadcastDriverLocationToUi(driverId, rideId, cfg);
  const second = shouldBroadcastDriverLocationToUi(driverId, rideId, cfg);
  if (!first || second) throw new Error('GPS UI throttle should allow first and block second burst');
  console.log('GPS throttle OK');

  const smoothA = smoothDriverLocationForUi(driverId, -26.99, -48.63, cfg.gpsSmoothFactor);
  const smoothB = smoothDriverLocationForUi(driverId, -26.985, -48.625, cfg.gpsSmoothFactor);
  if (smoothA.lat === smoothB.lat && smoothA.lng === smoothB.lng) {
    throw new Error('Smoothed location should blend coordinates');
  }
  console.log('GPS smoothing OK');

  const passengerId = randomUUID();
  const checkpoint = new Date(Date.now() - 60_000).toISOString();
  const replayEvent = __testBuildEvent(
    'RIDE_DRIVER_ASSIGNED',
    rideId,
    { driverName: 'João' },
    { userIds: [passengerId], rideId },
  );
  replayEvent.occurredAt = new Date().toISOString();
  await persistOutboxEvent(replayEvent);

  const replayed = await getReplayEventsSince(passengerId, checkpoint);
  if (!replayed.some((e) => e.eventId === replayEvent.eventId)) {
    throw new Error('Replay should return missed events');
  }
  console.log('WS replay OK:', replayed.length);

  await recordWebSocketEventAck(passengerId, replayEvent.eventId);
  console.log('WS ack recorded');

  await upsertPushToken({ userId: passengerId, platform: 'android', token: 'demo-token-40' });
  const pushEvent = __testBuildEvent(
    'RIDE_DRIVER_ARRIVED',
    rideId,
    {},
    { userIds: [passengerId], rideId, idempotencyKey: 'idem-40' },
  );

  await dispatchPushForEvent(pushEvent);
  await dispatchPushForEvent(pushEvent);

  const pushLog = __testGetMemoryPushLog();
  const sent = pushLog.filter((l) => l.status === 'sent');
  const dedupSkipped = pushLog.filter((l) => l.status === 'skipped' && l.payload?.reason === 'dedup');
  if (sent.length < 1) throw new Error('Expected at least one push sent');
  if (dedupSkipped.length < 1) throw new Error('Expected dedup skip on second push');
  console.log('Push dedup OK — sent:', sent.length, 'dedup:', dedupSkipped.length);

  const dup = await shouldSkipPushDueToDedup(passengerId, 'TEST', 'same-key');
  const dupAgain = await shouldSkipPushDueToDedup(passengerId, 'TEST', 'same-key');
  if (!dupAgain) throw new Error('Dedup helper should block immediate repeat');
  void dup;
  console.log('Dedup helper OK');

  const locationDriverId = randomUUID();
  await memoryMatchStore.upsertDriver({
    userId: locationDriverId,
    fullName: 'Driver 40',
    isOnline: true,
    operationalStatus: 'online',
    lat: -26.99,
    lng: -48.63,
    reputationScore: 4.8,
    completedRides: 120,
    cancellationRate: 0.03,
    acceptanceRate: 0.92,
    enabledCategories: ['economico', 'entrega'],
    petReady: false,
    comfortApproved: false,
    wheelchairAccessible: false,
    collectiveCertified: false,
    locationUpdatedAt: new Date(),
  });
  await startOnlineSession(locationDriverId, -26.99, -48.63);

  const outboxBefore = __testGetMemoryOutbox().length;
  await updateDriverLocation({
    driverId: locationDriverId,
    lat: -26.991,
    lng: -48.631,
    rideId,
  });
  await updateDriverLocation({
    driverId: locationDriverId,
    lat: -26.992,
    lng: -48.632,
    rideId,
  });
  const locationEvents = __testGetMemoryOutbox().slice(outboxBefore).filter(
    (e) => e.eventType === 'DRIVER_LOCATION_UPDATED',
  );
  if (locationEvents.length !== 1) {
    throw new Error(`Expected 1 throttled location event, got ${locationEvents.length}`);
  }
  if (!locationEvents[0]!.payload.smoothed) throw new Error('Location payload should be smoothed');
  console.log('Driver location integration OK');

  console.log('Camada 40 realtime + push + GPS throttle tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
