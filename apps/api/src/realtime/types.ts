export type RealtimeEventType =
  | 'RIDE_REQUESTED'
  | 'RIDE_OFFERED'
  | 'RIDE_ACCEPTED'
  | 'RIDE_REJECTED'
  | 'RIDE_DRIVER_ASSIGNED'
  | 'RIDE_DRIVER_ARRIVED'
  | 'RIDE_STARTED'
  | 'RIDE_COMPLETED'
  | 'RIDE_CANCELLED'
  | 'RIDE_MATCH_TIMEOUT'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_CAPTURED'
  | 'REVIEW_CREATED'
  | 'PRICING_UPDATED'
  | 'FRAUD_SIGNAL'
  | 'GPS_INTEGRITY_ALERT'
  | 'DRIVER_LOCATION_UPDATED'
  | 'RIDE_START_CODE_ISSUED'
  | 'ROUTE_RECALCULATED'
  | 'PAYMENT_FAILED'
  | 'SCHEDULED_RIDE_CREATED'
  | 'SCHEDULED_RIDE_DISPATCHED';

export interface RealtimeEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: RealtimeEventType;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  producer: string;
  schemaVersion: number;
  idempotencyKey?: string;
  traceId?: string;
  payload: T;
  /** Canais derivados para fan-out WS */
  userIds?: string[];
  rideId?: string;
  driverId?: string;
}
