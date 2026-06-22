import { publishRealtimeEvent, REDIS_CHANNEL } from './distributedCache.js';
import { dispatchPushForEvent } from '../notifications/notificationService.js';
import { getActiveTraceContext } from '../observability/observabilityProductionService.js';
import { buildEvent, markOutboxPublished, persistOutboxEvent } from './outboxStore.js';
import { redisSubscribe } from './redisClient.js';
import type { RealtimeEvent, RealtimeEventType } from './types.js';
import { wsHub } from './wsHub.js';

export async function emitEvent<T extends Record<string, unknown>>(
  type: RealtimeEventType,
  aggregateType: string,
  aggregateId: string,
  payload: T,
  opts?: { idempotencyKey?: string; userIds?: string[]; rideId?: string; driverId?: string },
) {
  const event = buildEvent(type, aggregateType, aggregateId, payload, opts);
  const activeTrace = getActiveTraceContext();
  if (activeTrace && !event.traceId) {
    event.traceId = activeTrace.traceId;
  }
  await persistOutboxEvent(event);
  const json = JSON.stringify(event);
  wsHub.broadcast(event);
  await publishRealtimeEvent(json);
  void dispatchPushForEvent(event);
  await markOutboxPublished(event.eventId);
  return event;
}

export function startRedisFanout() {
  return redisSubscribe(REDIS_CHANNEL, (message) => {
    try {
      const event = JSON.parse(message) as RealtimeEvent;
      wsHub.broadcast(event);
    } catch {
      /* ignore malformed */
    }
  });
}
