import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type {
  DriverRecord,
  MatchAttemptRecord,
  MatchCandidateRecord,
  RideOfferRecord,
  RideRecord,
  RideRequestInput,
  RideStatus,
} from '../match/types.js';

type BlockEntry = {
  passengerId: string;
  driverId: string;
  rideId?: string;
  blockType: string;
  expiresAt: Date;
};

export const memoryBlockStore = {
  blocks: [] as BlockEntry[],

  isBlocked(passengerId: string, driverId: string) {
    const now = Date.now();
    return this.blocks.some(
      (b) =>
        b.passengerId === passengerId &&
        b.driverId === driverId &&
        b.expiresAt.getTime() > now,
    );
  },

  addBlock(entry: BlockEntry) {
    this.blocks.push(entry);
  },
};

const rides = new Map<string, RideRecord>();
const drivers = new Map<string, DriverRecord>();
const attempts = new Map<string, MatchAttemptRecord>();
const candidates = new Map<string, MatchCandidateRecord[]>();
const offers = new Map<string, RideOfferRecord>();

function seedDemoDrivers() {
  if (drivers.size > 0) return;
  const demo = [
    { name: 'Carlos M.', lat: -26.9905, lng: -48.6348, rep: 4.92, cats: ['economico', 'comfort'] },
    { name: 'Ana P.', lat: -26.988, lng: -48.632, rep: 4.85, cats: ['economico', 'executivo'] },
    { name: 'João S.', lat: -26.993, lng: -48.638, rep: 4.78, cats: ['economico', 'suv'] },
    { name: 'Marcos T.', lat: -26.987, lng: -48.629, rep: 4.65, cats: ['economico', 'moto'] },
    { name: 'Paula R.', lat: -26.995, lng: -48.641, rep: 4.88, cats: ['comfort', 'black', 'executivo'], comfort: true },
  ];

  for (const d of demo) {
    const userId = randomUUID();
    drivers.set(userId, {
      userId,
      fullName: d.name,
      isOnline: true,
      operationalStatus: 'online',
      lat: d.lat,
      lng: d.lng,
      locationUpdatedAt: new Date(),
      enabledCategories: d.cats,
      reputationScore: d.rep,
      completedRides: 800,
      acceptanceRate: 0.82,
      cancellationRate: 0.06,
      onlineMinutesToday: 240,
      wheelchairAccessible: false,
      petReady: d.cats.includes('pet'),
      comfortApproved: d.comfort ?? false,
      vehicleType: d.cats.includes('moto') ? 'moto' : 'economico',
    });
  }
}

export const memoryMatchStore = {
  ensureSeeded() {
    seedDemoDrivers();
  },

  async createRide(input: RideRequestInput): Promise<RideRecord> {
    this.ensureSeeded();
    const ride: RideRecord = {
      id: randomUUID(),
      passengerId: input.passengerId,
      categoryCode: input.categoryCode,
      status: 'REQUESTED',
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      pickupAddress: input.pickupAddress,
      dropoffLat: input.dropoffLat,
      dropoffLng: input.dropoffLng,
      dropoffAddress: input.dropoffAddress,
      passengerCount: input.passengerCount ?? 1,
      isCorporate: input.isCorporate ?? false,
      isShared: input.isShared ?? false,
      hasPet: input.hasPet ?? false,
      needsWheelchair: input.needsWheelchair ?? false,
      estimatedFareCentavos: input.estimatedFareCentavos,
      rideVersion: 1,
      matchStage: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    rides.set(ride.id, ride);
    return ride;
  },

  async getRide(id: string) {
    return rides.get(id) ?? null;
  },

  async updateRideStatus(id: string, status: RideStatus, patch: Partial<RideRecord> = {}) {
    const ride = rides.get(id);
    if (!ride) return null;
    Object.assign(ride, patch, { status, updatedAt: new Date() });
    rides.set(id, ride);
    return ride;
  },

  async updateRideLifecycle(
    id: string,
    patch: {
      status?: RideStatus;
      arrivedAt?: Date;
      startedAt?: Date;
      completedAt?: Date;
      paymentIntentId?: string;
    },
  ) {
    const ride = rides.get(id);
    if (!ride) return null;
    Object.assign(ride, patch, { updatedAt: new Date() });
    if (patch.status) ride.status = patch.status;
    rides.set(id, ride);
    return ride;
  },

  async releaseDriver(driverId: string) {
    const driver = drivers.get(driverId);
    if (!driver) return;
    driver.activeRideId = undefined;
    driver.operationalStatus = driver.isOnline ? 'online' : 'offline';
  },

  async incrementRideVersion(id: string) {
    const ride = rides.get(id);
    if (!ride) return null;
    ride.rideVersion += 1;
    ride.updatedAt = new Date();
    return ride;
  },

  async findOnlineDrivers(): Promise<DriverRecord[]> {
    this.ensureSeeded();
    return [...drivers.values()];
  },

  async getDriver(userId: string) {
    return drivers.get(userId) ?? null;
  },

  async upsertDriver(driver: DriverRecord) {
    drivers.set(driver.userId, driver);
    return driver;
  },

  async setDriverOnline(userId: string, online: boolean, lat?: number, lng?: number) {
    let driver = drivers.get(userId);
    if (!driver) {
      driver = {
        userId,
        fullName: 'Motorista',
        isOnline: online,
        operationalStatus: online ? 'online' : 'offline',
        enabledCategories: ['economico'],
        reputationScore: 4.8,
        completedRides: 100,
        acceptanceRate: 0.75,
        cancellationRate: 0.08,
        onlineMinutesToday: 60,
        wheelchairAccessible: false,
        petReady: false,
        comfortApproved: false,
        vehicleType: 'economico',
      };
    }
    driver.isOnline = online;
    driver.operationalStatus = online ? 'online' : 'offline';
    if (lat != null && lng != null) {
      driver.lat = lat;
      driver.lng = lng;
      driver.locationUpdatedAt = new Date();
    }
    drivers.set(userId, driver);
    return driver;
  },

  async assignDriverToRide(rideId: string, driverId: string) {
    const ride = rides.get(rideId);
    const driver = drivers.get(driverId);
    if (!ride || !driver) return null;
    ride.driverId = driverId;
    ride.status = 'DRIVER_ASSIGNED';
    ride.assignedAt = new Date();
    ride.updatedAt = new Date();
    driver.activeRideId = rideId;
    driver.operationalStatus = 'busy';
    return ride;
  },

  async createAttempt(record: Omit<MatchAttemptRecord, 'id'> & { id?: string }) {
    const id = record.id ?? randomUUID();
    const attempt: MatchAttemptRecord = { ...record, id };
    attempts.set(id, attempt);
    return attempt;
  },

  async finishAttempt(id: string, resultStatus: string) {
    const attempt = attempts.get(id);
    if (!attempt) return;
    attempt.resultStatus = resultStatus;
    attempt.endedAt = new Date();
  },

  async saveCandidates(attemptId: string, list: MatchCandidateRecord[]) {
    candidates.set(attemptId, list);
  },

  async createOffer(record: Omit<RideOfferRecord, 'id' | 'createdAt'> & { id?: string }) {
    const id = record.id ?? randomUUID();
    const offer: RideOfferRecord = { ...record, id, createdAt: new Date() };
    offers.set(id, offer);
    return offer;
  },

  async getOffer(id: string) {
    return offers.get(id) ?? null;
  },

  async getPendingOffersForDriver(driverId: string) {
    const now = Date.now();
    return [...offers.values()].filter(
      (o) => o.driverId === driverId && o.status === 'pending' && o.expiresAt.getTime() > now,
    );
  },

  async updateOfferStatus(id: string, status: RideOfferRecord['status'], claimToken?: string) {
    const offer = offers.get(id);
    if (!offer) return null;
    offer.status = status;
    if (claimToken) offer.claimToken = claimToken;
    return offer;
  },

  async expirePendingOffersForRide(rideId: string) {
    for (const offer of offers.values()) {
      if (offer.rideId === rideId && offer.status === 'pending') {
        offer.status = 'superseded';
      }
    }
  },
};

// Postgres repository
export async function createRidePg(input: RideRequestInput): Promise<RideRecord> {
  const result = await pool.query(
    `INSERT INTO rides (
      passenger_id, category_code, pickup_lat, pickup_lng, pickup_address,
      dropoff_lat, dropoff_lng, dropoff_address, passenger_count,
      is_corporate, is_shared, has_pet, needs_wheelchair, estimated_fare_centavos
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      input.passengerId,
      input.categoryCode,
      input.pickupLat,
      input.pickupLng,
      input.pickupAddress ?? null,
      input.dropoffLat,
      input.dropoffLng,
      input.dropoffAddress ?? null,
      input.passengerCount ?? 1,
      input.isCorporate ?? false,
      input.isShared ?? false,
      input.hasPet ?? false,
      input.needsWheelchair ?? false,
      input.estimatedFareCentavos ?? null,
    ],
  );
  return mapRideRow(result.rows[0]);
}

export function mapRideRow(row: Record<string, unknown>): RideRecord {
  return {
    id: row.id as string,
    passengerId: row.passenger_id as string,
    driverId: (row.driver_id as string) ?? undefined,
    categoryCode: row.category_code as string,
    status: row.status as RideRecord['status'],
    pickupLat: Number(row.pickup_lat),
    pickupLng: Number(row.pickup_lng),
    pickupAddress: (row.pickup_address as string) ?? undefined,
    dropoffLat: Number(row.dropoff_lat),
    dropoffLng: Number(row.dropoff_lng),
    dropoffAddress: (row.dropoff_address as string) ?? undefined,
    passengerCount: Number(row.passenger_count),
    isCorporate: Boolean(row.is_corporate),
    isShared: Boolean(row.is_shared),
    hasPet: Boolean(row.has_pet),
    needsWheelchair: Boolean(row.needs_wheelchair),
    estimatedFareCentavos: row.estimated_fare_centavos != null ? Number(row.estimated_fare_centavos) : undefined,
    rideVersion: Number(row.ride_version),
    matchStage: Number(row.match_stage),
    assignedAt: row.assigned_at ? new Date(row.assigned_at as string) : undefined,
    arrivedAt: row.arrived_at ? new Date(row.arrived_at as string) : undefined,
    startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    paymentIntentId: (row.payment_intent_id as string) ?? undefined,
    cancelReason: (row.cancel_reason as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapDriverRow(row: Record<string, unknown>, fullName: string): DriverRecord {
  return {
    userId: row.user_id as string,
    fullName,
    isOnline: Boolean(row.is_online),
    operationalStatus: row.operational_status as DriverRecord['operationalStatus'],
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    locationUpdatedAt: row.location_updated_at ? new Date(row.location_updated_at as string) : undefined,
    enabledCategories: (row.enabled_categories as string[]) ?? ['economico'],
    reputationScore: Number(row.reputation_score ?? row.rating ?? 5),
    completedRides: Number(row.completed_rides ?? 0),
    acceptanceRate: Number(row.acceptance_rate ?? 1),
    cancellationRate: Number(row.cancellation_rate ?? 0),
    onlineMinutesToday: Number(row.online_minutes_today ?? 0),
    activeRideId: (row.active_ride_id as string) ?? undefined,
    wheelchairAccessible: Boolean(row.wheelchair_accessible),
    petReady: Boolean(row.pet_ready),
    comfortApproved: Boolean(row.comfort_approved),
    vehicleType: (row.vehicle_type as string) ?? 'economico',
  };
}

export async function getRidePg(id: string) {
  const result = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
  return result.rowCount ? mapRideRow(result.rows[0]) : null;
}

export async function findOnlineDriversPg(): Promise<DriverRecord[]> {
  const result = await pool.query(
    `SELECT d.*, u.full_name FROM drivers d
     JOIN users u ON u.id = d.user_id
     WHERE d.is_online = TRUE AND d.operational_status = 'online' AND d.active_ride_id IS NULL`,
  );
  return result.rows.map((r) => mapDriverRow(r, r.full_name as string));
}

export async function setDriverOnlinePg(userId: string, online: boolean, lat?: number, lng?: number) {
  await pool.query(
    `UPDATE drivers SET
      is_online = $2,
      operational_status = $3,
      lat = COALESCE($4, lat),
      lng = COALESCE($5, lng),
      location_updated_at = CASE WHEN $4 IS NOT NULL THEN NOW() ELSE location_updated_at END
     WHERE user_id = $1`,
    [userId, online, online ? 'online' : 'offline', lat ?? null, lng ?? null],
  );
}

export async function assignDriverToRidePg(rideId: string, driverId: string, rideVersion: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rideResult = await client.query(
      `UPDATE rides SET driver_id = $2, status = 'DRIVER_ASSIGNED', assigned_at = NOW(),
        ride_version = ride_version + 1, updated_at = NOW()
       WHERE id = $1 AND ride_version = $3 AND status IN ('REQUESTED','OFFERING')
       RETURNING *`,
      [rideId, driverId, rideVersion],
    );
    if (!rideResult.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE drivers SET active_ride_id = $2, operational_status = 'busy' WHERE user_id = $1`,
      [driverId, rideId],
    );
    await client.query('COMMIT');
    return mapRideRow(rideResult.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export function useMemory() {
  return config.useMemoryDb;
}
