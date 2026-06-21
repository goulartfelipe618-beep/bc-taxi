import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { haversineKm } from '../mapbox/mockPlaces.js';
import { getDriverCompliance } from '../fleet/complianceService.js';
import { listVehicleDocuments, isDocValid } from '../fleet/fleetStore.js';
import { detectZoneAt } from './airportService.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';
import { emitEvent } from '../realtime/eventBus.js';
import type { DriverRecord, RideRecord, ScoredCandidate } from '../match/types.js';

export interface AirportQueuePool {
  id: string;
  zoneId: string;
  name: string;
  terminalCode?: string;
  centerLat: number;
  centerLng: number;
  radiusM: number;
  allowedCategories: string[];
  isActive: boolean;
}

export interface AirportQueueEntry {
  id: string;
  poolId: string;
  zoneId: string;
  driverId: string;
  queuePosition: number;
  terminalCode?: string;
  categories: string[];
  status: 'waiting' | 'offered' | 'exited' | 'expired';
  enteredAt: Date;
  exitedAt?: Date;
  exitReason?: string;
}

const DEMO_POOL_ID = '00000000-0000-4000-8000-000000000401';
const DEMO_ZONE_ID = '00000000-0000-4000-8000-000000000301';

const AIRPORT_QUEUE_CATEGORIES = ['aeroporto', 'economico', 'comfort', 'executivo', 'black', 'suv'];
const SCORE_TIE_THRESHOLD = 0.02;

const memoryPools: AirportQueuePool[] = [
  {
    id: DEMO_POOL_ID,
    zoneId: DEMO_ZONE_ID,
    name: 'Bolsão aplicativos NVT',
    terminalCode: 'MAIN',
    centerLat: -26.8799,
    centerLng: -48.6514,
    radiusM: 450,
    allowedCategories: AIRPORT_QUEUE_CATEGORIES,
    isActive: true,
  },
];

const memoryEntries: AirportQueueEntry[] = [];
const memoryEvents: Array<{ eventType: string; driverId?: string; queuePosition?: number }> = [];

function mapPool(row: Record<string, unknown>): AirportQueuePool {
  return {
    id: row.id as string,
    zoneId: row.zone_id as string,
    name: row.name as string,
    terminalCode: (row.terminal_code as string) ?? undefined,
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    radiusM: Number(row.radius_m),
    allowedCategories: (row.allowed_categories as string[]) ?? [],
    isActive: Boolean(row.is_active),
  };
}

function mapEntry(row: Record<string, unknown>): AirportQueueEntry {
  return {
    id: row.id as string,
    poolId: row.pool_id as string,
    zoneId: row.zone_id as string,
    driverId: row.driver_id as string,
    queuePosition: Number(row.queue_position),
    terminalCode: (row.terminal_code as string) ?? undefined,
    categories: (row.categories_json as string[]) ?? [],
    status: row.status as AirportQueueEntry['status'],
    enteredAt: new Date(row.entered_at as string),
    exitedAt: row.exited_at ? new Date(row.exited_at as string) : undefined,
    exitReason: (row.exit_reason as string) ?? undefined,
  };
}

function pointInPool(lat: number, lng: number, pool: AirportQueuePool): boolean {
  return haversineKm(lat, lng, pool.centerLat, pool.centerLng) * 1000 <= pool.radiusM;
}

export async function listAirportQueuePools(zoneId?: string): Promise<AirportQueuePool[]> {
  if (config.useMemoryDb) {
    return memoryPools.filter((p) => p.isActive && (!zoneId || p.zoneId === zoneId));
  }
  const { rows } = zoneId
    ? await pool.query(
        `SELECT * FROM airport_queue_pools WHERE is_active = TRUE AND zone_id = $1 ORDER BY name`,
        [zoneId],
      )
    : await pool.query(`SELECT * FROM airport_queue_pools WHERE is_active = TRUE ORDER BY name`);
  return rows.map(mapPool);
}

async function detectPoolAt(lat: number, lng: number): Promise<AirportQueuePool | undefined> {
  const pools = await listAirportQueuePools();
  for (const p of pools) {
    if (pointInPool(lat, lng, p)) return p;
  }
  return undefined;
}

export async function isDriverAirportPoolEligible(driverId: string): Promise<boolean> {
  if (config.useMemoryDb) {
    const driver = await memoryMatchStore.getDriver(driverId);
    if (!driver?.isOnline || driver.operationalStatus !== 'online') return false;
    if (driver.reputationScore < 4.7 || driver.completedRides < 250) return false;
    return driver.enabledCategories.some((c) => AIRPORT_QUEUE_CATEGORIES.includes(c));
  }

  const profile = await getDriverCompliance(driverId);
  if (!profile.canOperate || !profile.activeVehicle) return false;

  const training = profile.driverDocuments.find((d) => d.docType === 'AIRPORT_TRAINING');
  if (!training || !isDocValid(training)) return false;

  const vehicleDocs = await listVehicleDocuments(profile.activeVehicle.id);
  const auth = vehicleDocs.find((d) => d.docType === 'AIRPORT_AUTHORIZATION');
  if (!auth || !isDocValid(auth)) return false;

  return profile.enabledCategories.some((c) => AIRPORT_QUEUE_CATEGORIES.includes(c));
}

async function driverCategoriesForQueue(driverId: string): Promise<string[]> {
  if (config.useMemoryDb) {
    const driver = await memoryMatchStore.getDriver(driverId);
    return (driver?.enabledCategories ?? []).filter((c) => AIRPORT_QUEUE_CATEGORIES.includes(c));
  }
  const profile = await getDriverCompliance(driverId);
  return profile.enabledCategories.filter((c) => AIRPORT_QUEUE_CATEGORIES.includes(c));
}

async function recordQueueEvent(input: {
  zoneId?: string;
  poolId?: string;
  driverId?: string;
  rideId?: string;
  eventType: 'entered' | 'exited' | 'position_updated' | 'offered' | 'accepted' | 'skipped';
  queuePosition?: number;
  metadata?: Record<string, unknown>;
}) {
  if (config.useMemoryDb) {
    memoryEvents.push({
      eventType: input.eventType,
      driverId: input.driverId,
      queuePosition: input.queuePosition,
    });
    return;
  }
  await pool.query(
    `INSERT INTO airport_queue_events
       (zone_id, pool_id, driver_id, ride_id, event_type, queue_position, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.zoneId ?? null,
      input.poolId ?? null,
      input.driverId ?? null,
      input.rideId ?? null,
      input.eventType,
      input.queuePosition ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

async function getActiveEntryForDriver(driverId: string): Promise<AirportQueueEntry | null> {
  if (config.useMemoryDb) {
    return (
      memoryEntries.find((e) => e.driverId === driverId && (e.status === 'waiting' || e.status === 'offered')) ??
      null
    );
  }
  const { rows } = await pool.query(
    `SELECT * FROM airport_queue_entries
     WHERE driver_id = $1 AND status IN ('waiting','offered')
     ORDER BY entered_at DESC LIMIT 1`,
    [driverId],
  );
  return rows[0] ? mapEntry(rows[0]) : null;
}

async function nextQueuePosition(poolId: string): Promise<number> {
  if (config.useMemoryDb) {
    const waiting = memoryEntries.filter((e) => e.poolId === poolId && e.status === 'waiting');
    if (waiting.length === 0) return 1;
    return Math.max(...waiting.map((e) => e.queuePosition)) + 1;
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next_pos
     FROM airport_queue_entries WHERE pool_id = $1 AND status = 'waiting'`,
    [poolId],
  );
  return Number(rows[0]?.next_pos ?? 1);
}

export async function enterAirportQueue(input: {
  driverId: string;
  pool: AirportQueuePool;
}): Promise<AirportQueueEntry | null> {
  const existing = await getActiveEntryForDriver(input.driverId);
  if (existing) return existing;

  if (!(await isDriverAirportPoolEligible(input.driverId))) return null;

  const categories = await driverCategoriesForQueue(input.driverId);
  const position = await nextQueuePosition(input.pool.id);

  if (config.useMemoryDb) {
    const entry: AirportQueueEntry = {
      id: randomUUID(),
      poolId: input.pool.id,
      zoneId: input.pool.zoneId,
      driverId: input.driverId,
      queuePosition: position,
      terminalCode: input.pool.terminalCode,
      categories,
      status: 'waiting',
      enteredAt: new Date(),
    };
    memoryEntries.push(entry);
    await recordQueueEvent({
      zoneId: input.pool.zoneId,
      poolId: input.pool.id,
      driverId: input.driverId,
      eventType: 'entered',
      queuePosition: position,
    });
    void emitEvent(
      'AIRPORT_QUEUE_ENTERED',
      'airport_queue',
      input.pool.zoneId,
      { driverId: input.driverId, queuePosition: position, poolId: input.pool.id },
      { driverId: input.driverId },
    );
    return entry;
  }

  const { rows } = await pool.query(
    `INSERT INTO airport_queue_entries
       (pool_id, zone_id, driver_id, queue_position, terminal_code, categories_json, status)
     VALUES ($1,$2,$3,$4,$5,$6,'waiting')
     RETURNING *`,
    [
      input.pool.id,
      input.pool.zoneId,
      input.driverId,
      position,
      input.pool.terminalCode ?? null,
      JSON.stringify(categories),
    ],
  );
  const entry = mapEntry(rows[0]);
  await recordQueueEvent({
    zoneId: input.pool.zoneId,
    poolId: input.pool.id,
    driverId: input.driverId,
    eventType: 'entered',
    queuePosition: position,
  });
  void emitEvent(
    'AIRPORT_QUEUE_ENTERED',
    'airport_queue',
    input.pool.zoneId,
    { driverId: input.driverId, queuePosition: position, poolId: input.pool.id },
    { driverId: input.driverId },
  );
  return entry;
}

export async function leaveAirportQueue(
  driverId: string,
  reason = 'manual',
): Promise<AirportQueueEntry | null> {
  const entry = await getActiveEntryForDriver(driverId);
  if (!entry) return null;

  if (config.useMemoryDb) {
    entry.status = 'exited';
    entry.exitedAt = new Date();
    entry.exitReason = reason;
  } else {
    await pool.query(
      `UPDATE airport_queue_entries
       SET status = 'exited', exited_at = NOW(), exit_reason = $2, updated_at = NOW()
       WHERE id = $1`,
      [entry.id, reason],
    );
  }

  await recordQueueEvent({
    zoneId: entry.zoneId,
    poolId: entry.poolId,
    driverId,
    eventType: 'exited',
    queuePosition: entry.queuePosition,
    metadata: { reason },
  });
  return entry;
}

export async function syncAirportQueueFromLocation(
  driverId: string,
  lat: number,
  lng: number,
): Promise<{ inPool: boolean; entry?: AirportQueueEntry }> {
  const poolAt = await detectPoolAt(lat, lng);
  const active = await getActiveEntryForDriver(driverId);

  if (poolAt) {
    const entry = await enterAirportQueue({ driverId, pool: poolAt });
    return { inPool: true, entry: entry ?? undefined };
  }

  if (active) {
    await leaveAirportQueue(driverId, 'left_geofence');
  }
  return { inPool: false };
}

export async function listWaitingQueueEntries(input: {
  zoneId: string;
  terminalCode?: string;
  categoryCode?: string;
}): Promise<AirportQueueEntry[]> {
  const filter = (e: AirportQueueEntry) => {
    if (e.zoneId !== input.zoneId || e.status !== 'waiting') return false;
    if (input.terminalCode && e.terminalCode && e.terminalCode !== input.terminalCode) return false;
    if (input.categoryCode && e.categories.length > 0 && !e.categories.includes(input.categoryCode)) {
      return false;
    }
    return true;
  };

  if (config.useMemoryDb) {
    return memoryEntries.filter(filter).sort((a, b) => a.queuePosition - b.queuePosition);
  }

  const { rows } = await pool.query(
    `SELECT * FROM airport_queue_entries
     WHERE zone_id = $1 AND status = 'waiting'
       AND ($2::text IS NULL OR terminal_code IS NULL OR terminal_code = $2)
     ORDER BY queue_position ASC`,
    [input.zoneId, input.terminalCode ?? null],
  );
  return rows.map(mapEntry).filter((e) => {
    if (!input.categoryCode || e.categories.length === 0) return true;
    return e.categories.includes(input.categoryCode);
  });
}

export async function getDriverQueueStatus(driverId: string) {
  const entry = await getActiveEntryForDriver(driverId);
  if (!entry) return { inQueue: false as const };
  const waitingAhead = config.useMemoryDb
    ? memoryEntries.filter(
        (e) =>
          e.zoneId === entry.zoneId &&
          e.status === 'waiting' &&
          e.queuePosition < entry.queuePosition,
      ).length
    : (
        await pool.query(
          `SELECT COUNT(*)::int AS c FROM airport_queue_entries
           WHERE zone_id = $1 AND status = 'waiting' AND queue_position < $2`,
          [entry.zoneId, entry.queuePosition],
        )
      ).rows[0]?.c ?? 0;

  return {
    inQueue: true as const,
    entry: {
      id: entry.id,
      zoneId: entry.zoneId,
      poolId: entry.poolId,
      queuePosition: entry.queuePosition,
      terminalCode: entry.terminalCode,
      categories: entry.categories,
      status: entry.status,
      enteredAt: entry.enteredAt.toISOString(),
      waitingAhead,
    },
  };
}

export async function shouldApplyAirportQueue(ride: RideRecord): Promise<boolean> {
  if (ride.categoryCode === 'aeroporto') return true;
  const zone = await detectZoneAt(ride.pickupLat, ride.pickupLng);
  return Boolean(zone);
}

export async function rankCandidatesForAirportQueue(
  scored: ScoredCandidate[],
  ride: RideRecord,
): Promise<ScoredCandidate[]> {
  const zone = await detectZoneAt(ride.pickupLat, ride.pickupLng);
  if (!zone) return scored;

  const queueEntries = await listWaitingQueueEntries({
    zoneId: zone.id,
    terminalCode: zone.terminalCode,
    categoryCode: ride.categoryCode,
  });
  const queueMap = new Map(queueEntries.map((e) => [e.driverId, e]));

  const inQueue = scored.filter((c) => queueMap.has(c.driver.userId));
  const notInQueue = scored.filter((c) => !queueMap.has(c.driver.userId));

  inQueue.sort((a, b) => {
    const qa = queueMap.get(a.driver.userId)!;
    const qb = queueMap.get(b.driver.userId)!;
    const posDiff = Math.abs(qa.queuePosition - qb.queuePosition);
    if (posDiff <= 1 && Math.abs(a.score - b.score) > SCORE_TIE_THRESHOLD) {
      return b.score - a.score;
    }
    return qa.queuePosition - qb.queuePosition;
  });

  if (ride.categoryCode === 'aeroporto') {
    return inQueue;
  }
  return [...inQueue, ...notInQueue];
}

export async function markQueueOffered(driverId: string, rideId: string) {
  const entry = await getActiveEntryForDriver(driverId);
  if (!entry) return;
  if (config.useMemoryDb) {
    entry.status = 'offered';
  } else {
    await pool.query(
      `UPDATE airport_queue_entries SET status = 'offered', updated_at = NOW() WHERE id = $1`,
      [entry.id],
    );
  }
  await recordQueueEvent({
    zoneId: entry.zoneId,
    poolId: entry.poolId,
    driverId,
    rideId,
    eventType: 'offered',
    queuePosition: entry.queuePosition,
  });
}

export async function markQueueAccepted(driverId: string, rideId: string) {
  await leaveAirportQueue(driverId, 'ride_accepted');
  await recordQueueEvent({
    driverId,
    rideId,
    eventType: 'accepted',
  });
}

export function __testResetAirportQueueMemory() {
  memoryEntries.length = 0;
  memoryEvents.length = 0;
}

export function __testGetAirportQueueEvents() {
  return memoryEvents;
}

export function __testSeedAirportDriver(input: {
  userId: string;
  lat: number;
  lng: number;
  categories?: string[];
}) {
  const driver: DriverRecord = {
    userId: input.userId,
    fullName: 'Airport Driver',
    isOnline: true,
    operationalStatus: 'online',
    lat: input.lat,
    lng: input.lng,
    locationUpdatedAt: new Date(),
    enabledCategories: input.categories ?? ['executivo', 'aeroporto'],
    reputationScore: 4.85,
    completedRides: 800,
    acceptanceRate: 0.85,
    cancellationRate: 0.05,
    onlineMinutesToday: 200,
    wheelchairAccessible: false,
    petReady: false,
    comfortApproved: true,
    vehicleType: 'sedan',
  };
  void memoryMatchStore.upsertDriver(driver);
  return driver;
}
