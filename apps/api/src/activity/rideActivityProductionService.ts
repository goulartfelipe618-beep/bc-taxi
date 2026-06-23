import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getCategory } from '../domain/rideCategories.js';
import { formatFare } from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';
import { pool } from '../db.js';
import type { RideRecord, RideStatus } from '../match/types.js';
import { getRideCompletionProduction } from '../ride/rideCompletionProductionService.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';
import { findUserById } from '../userStore.js';

export interface RideActivityProductionConfig {
  configVersion: string;
  defaultPageSize: number;
  maxPageSize: number;
  includeCancelled: boolean;
  includeReceiptLinks: boolean;
  driverEarningsVisible: boolean;
}

export interface RideActivityListItem {
  rideId: string;
  status: RideStatus;
  categoryCode: string;
  categoryLabel: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  displayTitle: string;
  dateLabel: string;
  priceCentavos?: number;
  priceLabel?: string;
  driverName?: string;
  passengerName?: string;
  completedAt?: string;
  cancelledAt?: string;
  receiptAvailable: boolean;
  receiptId?: string;
  reviewPending: boolean;
  isPinned: boolean;
}

export interface RideActivityListResult {
  configVersion: string;
  items: RideActivityListItem[];
  total: number;
  hasMore: boolean;
}

const memoryConfig: RideActivityProductionConfig = {
  configVersion: 'camada50-memory-v1',
  defaultPageSize: 30,
  maxPageSize: 100,
  includeCancelled: true,
  includeReceiptLinks: true,
  driverEarningsVisible: true,
};

const memoryPins = new Map<string, Set<string>>();
const memorySeededUsers = new Set<string>();

const TERMINAL_STATUSES: RideStatus[] = ['COMPLETED', 'CANCELLED'];
const ACTIVE_STATUSES: RideStatus[] = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
  'OFFERING',
  'REQUESTED',
];

function formatActivityDate(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).replace(',', ' ·');
}

function shortAddress(address?: string): string {
  if (!address) return 'Destino';
  const parts = address.split(',').map((p) => p.trim());
  return parts[0] || address;
}

function resolveStatuses(
  cfg: RideActivityProductionConfig,
  filter?: string,
): RideStatus[] {
  if (filter === 'active') return ACTIVE_STATUSES;
  if (filter === 'completed') return ['COMPLETED'];
  if (filter === 'cancelled') return cfg.includeCancelled ? ['CANCELLED'] : [];
  const statuses: RideStatus[] = ['COMPLETED'];
  if (cfg.includeCancelled) statuses.push('CANCELLED');
  return statuses;
}

export async function getRideActivityProductionConfig(): Promise<RideActivityProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM ride_activity_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada50-v1' };
  return {
    configVersion: r.config_version as string,
    defaultPageSize: Number(r.default_page_size),
    maxPageSize: Number(r.max_page_size),
    includeCancelled: Boolean(r.include_cancelled),
    includeReceiptLinks: Boolean(r.include_receipt_links),
    driverEarningsVisible: Boolean(r.driver_earnings_visible),
  };
}

async function mapRideToActivityItem(
  ride: RideRecord,
  viewerRole: 'passenger' | 'driver',
  viewerId: string,
  cfg: RideActivityProductionConfig,
  pinned: boolean,
): Promise<RideActivityListItem> {
  const category = getCategory(ride.categoryCode as RideCategoryCode);
  const eventDate = ride.completedAt ?? ride.updatedAt;
  let priceCentavos = ride.estimatedFareCentavos;
  let receiptAvailable = false;
  let receiptId: string | undefined;
  let reviewPending = false;

  if (ride.status === 'COMPLETED') {
    try {
      const completion = await getRideCompletionProduction(ride, viewerId);
      if (completion) {
        priceCentavos = completion.fare.totalCentavos;
        reviewPending = completion.reviewPending;
        if (cfg.includeReceiptLinks && viewerRole === 'passenger') {
          receiptAvailable = Boolean(completion.receipt);
          receiptId = completion.receipt?.id;
        }
      }
    } catch {
      // keep estimated fare
    }
  }

  let driverName: string | undefined;
  let passengerName: string | undefined;

  if (ride.driverId) {
    if (useMemory()) {
      const driver = await memoryMatchStore.getDriver(ride.driverId);
      driverName = driver?.fullName;
    } else {
      const { rows } = await pool.query(
        `SELECT u.full_name FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1`,
        [ride.driverId],
      );
      driverName = (rows[0]?.full_name as string) ?? undefined;
    }
  }

  if (viewerRole === 'driver') {
    const passenger = await findUserById(ride.passengerId);
    passengerName = passenger?.full_name ?? undefined;
  }

  return {
    rideId: ride.id,
    status: ride.status,
    categoryCode: ride.categoryCode,
    categoryLabel: category?.name ?? ride.categoryCode,
    pickupAddress: ride.pickupAddress,
    dropoffAddress: ride.dropoffAddress,
    displayTitle: shortAddress(ride.dropoffAddress),
    dateLabel: formatActivityDate(eventDate),
    priceCentavos,
    priceLabel: priceCentavos != null ? formatFare(priceCentavos) : undefined,
    driverName,
    passengerName,
    completedAt: ride.completedAt?.toISOString(),
    cancelledAt: ride.status === 'CANCELLED' ? ride.updatedAt.toISOString() : undefined,
    receiptAvailable,
    receiptId,
    reviewPending,
    isPinned: pinned,
  };
}

async function seedMemoryActivityIfNeeded(userId: string, role: 'passenger' | 'driver') {
  const key = `${role}:${userId}`;
  if (memorySeededUsers.has(key)) return;

  const existing = await memoryMatchStore.listRidesForUser(userId, role);
  const hasTerminal = existing.some((r) => TERMINAL_STATUSES.includes(r.status));
  if (!hasTerminal) {
    const driverId = role === 'driver' ? userId : randomUUID();
    if (role === 'driver') {
      await memoryMatchStore.setDriverOnline(userId, false);
    } else {
      await memoryMatchStore.setDriverOnline(driverId, true, -26.99, -48.6348);
    }

    const samples = [
      {
        pickupAddress: 'Centro, Balneário Camboriú',
        dropoffAddress: 'Hotel Blumenau, Barra Norte',
        fare: 1458,
        daysAgo: 0,
      },
      {
        pickupAddress: 'Av. Brasil, 800',
        dropoffAddress: 'Rua 2500, 910 — Centro',
        fare: 999,
        daysAgo: 1,
      },
      {
        pickupAddress: 'Shopping Atlântico',
        dropoffAddress: 'Aeroporto Navegantes',
        fare: 4520,
        daysAgo: 5,
      },
    ];

    for (const sample of samples) {
      const passengerId = role === 'passenger' ? userId : randomUUID();
      const assignedDriverId = role === 'driver' ? userId : driverId;
      const ride = await memoryMatchStore.createRide({
        passengerId,
        categoryCode: 'economico',
        pickupLat: -26.99,
        pickupLng: -48.6348,
        dropoffLat: -26.9194,
        dropoffLng: -49.0661,
        pickupAddress: sample.pickupAddress,
        dropoffAddress: sample.dropoffAddress,
        estimatedFareCentavos: sample.fare,
      });
      await memoryMatchStore.assignDriverToRide(ride.id, assignedDriverId);
      const completedAt = new Date(Date.now() - sample.daysAgo * 86_400_000);
      await memoryMatchStore.updateRideLifecycle(ride.id, {
        status: 'COMPLETED',
        startedAt: new Date(completedAt.getTime() - 18 * 60_000),
        completedAt,
      });
    }
  }

  memorySeededUsers.add(key);
}

async function getPinnedRideIds(userId: string): Promise<Set<string>> {
  if (config.useMemoryDb) {
    return new Set(memoryPins.get(userId) ?? []);
  }
  const { rows } = await pool.query(
    `SELECT ride_id FROM ride_activity_pins WHERE user_id = $1`,
    [userId],
  );
  return new Set(rows.map((r) => r.ride_id as string));
}

export async function listRideActivity(
  userId: string,
  role: 'passenger' | 'driver',
  options: { status?: string; limit?: number; offset?: number } = {},
): Promise<RideActivityListResult> {
  const cfg = await getRideActivityProductionConfig();
  const limit = Math.min(
    cfg.maxPageSize,
    Math.max(1, options.limit ?? cfg.defaultPageSize),
  );
  const offset = Math.max(0, options.offset ?? 0);
  const statuses = resolveStatuses(cfg, options.status);
  const pinned = await getPinnedRideIds(userId);

  let rides: RideRecord[] = [];
  let total = 0;

  if (config.useMemoryDb) {
    const all = await memoryMatchStore.listRidesForUser(userId, role);
    await seedMemoryActivityIfNeeded(userId, role);
    const refreshed = await memoryMatchStore.listRidesForUser(userId, role);
    const filtered = refreshed
      .filter((r) => statuses.includes(r.status))
      .sort((a, b) => {
        const aTime = (a.completedAt ?? a.updatedAt).getTime();
        const bTime = (b.completedAt ?? b.updatedAt).getTime();
        return bTime - aTime;
      });
    total = filtered.length;
    rides = filtered.slice(offset, offset + limit);
  } else {
    const col = role === 'passenger' ? 'passenger_id' : 'driver_id';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM rides
       WHERE ${col} = $1 AND status = ANY($2::text[])`,
      [userId, statuses],
    );
    total = Number(countResult.rows[0]?.total ?? 0);
    const { rows } = await pool.query(
      `SELECT * FROM rides
       WHERE ${col} = $1 AND status = ANY($2::text[])
       ORDER BY COALESCE(completed_at, cancelled_at, updated_at) DESC
       LIMIT $3 OFFSET $4`,
      [userId, statuses, limit, offset],
    );
    rides = rows.map((row) => ({
      id: row.id as string,
      passengerId: row.passenger_id as string,
      driverId: (row.driver_id as string) ?? undefined,
      categoryCode: row.category_code as string,
      status: row.status as RideStatus,
      pickupLat: Number(row.pickup_lat),
      pickupLng: Number(row.pickup_lng),
      pickupAddress: (row.pickup_address as string) ?? undefined,
      dropoffLat: Number(row.dropoff_lat),
      dropoffLng: Number(row.dropoff_lng),
      dropoffAddress: (row.dropoff_address as string) ?? undefined,
      passengerCount: Number(row.passenger_count ?? 1),
      isCorporate: Boolean(row.is_corporate),
      isShared: Boolean(row.is_shared),
      hasPet: Boolean(row.has_pet),
      needsWheelchair: Boolean(row.needs_wheelchair),
      estimatedFareCentavos: row.estimated_fare_centavos != null ? Number(row.estimated_fare_centavos) : undefined,
      rideVersion: Number(row.ride_version ?? 1),
      matchStage: Number(row.match_stage ?? 0),
      assignedAt: row.assigned_at ? new Date(row.assigned_at as string) : undefined,
      arrivedAt: row.arrived_at ? new Date(row.arrived_at as string) : undefined,
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      cancelReason: (row.cancel_reason as string) ?? undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }));
  }

  const items = await Promise.all(
    rides.map((ride) =>
      mapRideToActivityItem(ride, role, userId, cfg, pinned.has(ride.id)),
    ),
  );

  items.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return 0;
  });

  return {
    configVersion: cfg.configVersion,
    items,
    total,
    hasMore: offset + items.length < total,
  };
}

export async function pinRideActivity(userId: string, rideId: string) {
  if (config.useMemoryDb) {
    const pins = memoryPins.get(userId) ?? new Set<string>();
    pins.add(rideId);
    memoryPins.set(userId, pins);
    return { ok: true };
  }
  await pool.query(
    `INSERT INTO ride_activity_pins (user_id, ride_id) VALUES ($1, $2)
     ON CONFLICT (user_id, ride_id) DO NOTHING`,
    [userId, rideId],
  );
  return { ok: true };
}

export function __testResetRideActivityProductionMemory() {
  memoryPins.clear();
  memorySeededUsers.clear();
  Object.assign(memoryConfig, {
    configVersion: 'camada50-memory-v1',
    defaultPageSize: 30,
    maxPageSize: 100,
    includeCancelled: true,
    includeReceiptLinks: true,
    driverEarningsVisible: true,
  });
}

export function seedMemoryRideActivityProductionConfig(
  patch: Partial<RideActivityProductionConfig> = {},
): RideActivityProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}
