import { config } from '../config.js';
import { getCategory } from '../domain/rideCategories.js';
import { formatFare } from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';
import { pool } from '../db.js';
import { getRide } from '../match/matchService.js';
import type { RideRecord } from '../match/types.js';
import { getDriverPayoutSettlement } from '../payments/driverPayoutService.js';
import { getPaymentIntentForRide } from '../payments/paymentStore.js';
import { getRideReceipt, issueRideReceipt, toPublicReceipt } from '../receipts/receiptService.js';
import { getRideCompletionProduction } from '../ride/rideCompletionProductionService.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';
import { findUserById } from '../userStore.js';
import { getRideActivityProductionConfig } from './rideActivityProductionService.js';

export interface RideActivityDetailProductionConfig {
  configVersion: string;
  receiptDetailEnabled: boolean;
  rebookEnabled: boolean;
  driverEarningsBreakdownEnabled: boolean;
  timelineEnabled: boolean;
}

const memoryConfig: RideActivityDetailProductionConfig = {
  configVersion: 'camada52-memory-v1',
  receiptDetailEnabled: true,
  rebookEnabled: true,
  driverEarningsBreakdownEnabled: true,
  timelineEnabled: true,
};

function assertRideAccess(ride: RideRecord, userId: string, role: 'passenger' | 'driver') {
  if (role === 'passenger' && ride.passengerId !== userId) {
    throw new Error('Corrida não encontrada');
  }
  if (role === 'driver' && ride.driverId !== userId) {
    throw new Error('Corrida não encontrada');
  }
}

export async function getRideActivityDetailProductionConfig(): Promise<RideActivityDetailProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM ride_activity_detail_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada52-v1' };
  return {
    configVersion: r.config_version as string,
    receiptDetailEnabled: Boolean(r.receipt_detail_enabled),
    rebookEnabled: Boolean(r.rebook_enabled),
    driverEarningsBreakdownEnabled: Boolean(r.driver_earnings_breakdown_enabled),
    timelineEnabled: Boolean(r.timeline_enabled),
  };
}

async function resolveDriverName(driverId: string) {
  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(driverId);
    return driver?.fullName;
  }
  const { rows } = await pool.query(
    `SELECT u.full_name, d.reputation_score FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1`,
    [driverId],
  );
  if (!rows[0]) return undefined;
  return {
    name: rows[0].full_name as string,
    rating: rows[0].reputation_score != null ? Number(rows[0].reputation_score) : undefined,
  };
}

export async function getRideActivityDetail(
  userId: string,
  role: 'passenger' | 'driver',
  rideId: string,
) {
  const ride = await getRide(rideId);
  if (!ride) throw new Error('Corrida não encontrada');
  assertRideAccess(ride, userId, role);

  const [detailCfg, activityCfg] = await Promise.all([
    getRideActivityDetailProductionConfig(),
    getRideActivityProductionConfig(),
  ]);

  const category = getCategory(ride.categoryCode as RideCategoryCode);
  const paymentIntent = await getPaymentIntentForRide(ride.id);

  let fare: {
    baseFareCentavos: number;
    waitFeeCentavos: number;
    totalCentavos: number;
    totalLabel: string;
    fareSource?: string;
  } | null = null;
  let receipt = null;
  let reviewPending = false;

  if (ride.status === 'COMPLETED') {
    const completion = await getRideCompletionProduction(ride, userId);
    if (completion) {
      fare = {
        baseFareCentavos: completion.fare.baseFareCentavos,
        waitFeeCentavos: completion.fare.waitFeeCentavos,
        totalCentavos: completion.fare.totalCentavos,
        totalLabel: completion.fare.totalLabel,
        fareSource: completion.fare.fareSource,
      };
      reviewPending = completion.reviewPending;
      if (detailCfg.receiptDetailEnabled && role === 'passenger' && activityCfg.includeReceiptLinks) {
        if (completion.receipt) {
          receipt = completion.receipt;
        } else {
          let receiptRecord = await getRideReceipt(ride.id, ride.passengerId);
          if (!receiptRecord) receiptRecord = await issueRideReceipt(ride);
          receipt = receiptRecord ? toPublicReceipt(receiptRecord) : null;
        }
      }
    }
  } else if (ride.estimatedFareCentavos != null) {
    fare = {
      baseFareCentavos: ride.estimatedFareCentavos,
      waitFeeCentavos: 0,
      totalCentavos: ride.estimatedFareCentavos,
      totalLabel: formatFare(ride.estimatedFareCentavos),
      fareSource: 'estimated',
    };
  }

  let driverInfo: { name: string; rating?: number } | undefined;
  if (ride.driverId) {
    const resolved = await resolveDriverName(ride.driverId);
    if (typeof resolved === 'string') {
      driverInfo = { name: resolved };
    } else if (resolved) {
      driverInfo = resolved;
    }
  }

  let passengerInfo: { name: string } | undefined;
  if (role === 'driver') {
    const passenger = await findUserById(ride.passengerId);
    if (passenger) passengerInfo = { name: passenger.full_name };
  }

  let driverEarnings: {
    grossCentavos: number;
    grossLabel: string;
    platformFeeCentavos?: number;
  } | null = null;

  if (
    role === 'driver' &&
    detailCfg.driverEarningsBreakdownEnabled &&
    activityCfg.driverEarningsVisible &&
    ride.status === 'COMPLETED'
  ) {
    const settlement = await getDriverPayoutSettlement(ride.id);
    if (settlement) {
      driverEarnings = {
        grossCentavos: settlement.driverGrossCentavos,
        grossLabel: formatFare(settlement.driverGrossCentavos),
        platformFeeCentavos: settlement.platformFeeCentavos,
      };
    } else if (fare) {
      const gross = Math.round(fare.totalCentavos * 0.78);
      driverEarnings = {
        grossCentavos: gross,
        grossLabel: formatFare(gross),
        platformFeeCentavos: fare.totalCentavos - gross,
      };
    }
  }

  const timeline = detailCfg.timelineEnabled
    ? {
        assignedAt: ride.assignedAt?.toISOString(),
        arrivedAt: ride.arrivedAt?.toISOString(),
        startedAt: ride.startedAt?.toISOString(),
        completedAt: ride.completedAt?.toISOString(),
        cancelledAt: ride.status === 'CANCELLED' ? ride.updatedAt.toISOString() : undefined,
      }
    : null;

  return {
    configVersion: detailCfg.configVersion,
    rideId: ride.id,
    status: ride.status,
    categoryCode: ride.categoryCode,
    categoryLabel: category?.name ?? ride.categoryCode,
    pickup: {
      address: ride.pickupAddress,
      lat: ride.pickupLat,
      lng: ride.pickupLng,
    },
    dropoff: {
      address: ride.dropoffAddress,
      lat: ride.dropoffLat,
      lng: ride.dropoffLng,
    },
    timeline,
    fare,
    paymentMethodType: paymentIntent?.paymentMethodType,
    paymentMethodLabel: paymentIntent?.paymentMethodType?.toUpperCase(),
    driver: driverInfo,
    passenger: passengerInfo,
    receipt,
    reviewPending,
    cancelReason: ride.cancelReason,
    driverEarnings,
    rebookEnabled: detailCfg.rebookEnabled && role === 'passenger' && ride.status === 'COMPLETED',
    isPinned: false,
  };
}

export async function getRideActivityRebookDraft(userId: string, rideId: string) {
  const ride = await getRide(rideId);
  if (!ride) throw new Error('Corrida não encontrada');
  if (ride.passengerId !== userId) throw new Error('Corrida não encontrada');

  const detailCfg = await getRideActivityDetailProductionConfig();
  if (!detailCfg.rebookEnabled) throw new Error('Re-reserva desabilitada');
  if (ride.status !== 'COMPLETED') throw new Error('Somente corridas concluídas podem ser reservadas novamente');

  if (!config.useMemoryDb) {
    await pool.query(
      `INSERT INTO ride_activity_rebook_events (user_id, source_ride_id) VALUES ($1, $2)`,
      [userId, rideId],
    );
  }

  const paymentIntent = await getPaymentIntentForRide(ride.id);

  return {
    configVersion: detailCfg.configVersion,
    sourceRideId: ride.id,
    pickupAddress: ride.pickupAddress ?? 'Origem',
    pickupLat: ride.pickupLat,
    pickupLng: ride.pickupLng,
    dropoffAddress: ride.dropoffAddress ?? 'Destino',
    dropoffLat: ride.dropoffLat,
    dropoffLng: ride.dropoffLng,
    dropoffName: ride.dropoffAddress?.split(',')[0]?.trim() ?? 'Destino',
    categoryCode: ride.categoryCode,
    suggestedPaymentMethodId: paymentIntent?.paymentMethodId,
    suggestedPaymentMethodType: paymentIntent?.paymentMethodType,
  };
}

export function __testResetRideActivityDetailProductionMemory() {
  Object.assign(memoryConfig, {
    configVersion: 'camada52-memory-v1',
    receiptDetailEnabled: true,
    rebookEnabled: true,
    driverEarningsBreakdownEnabled: true,
    timelineEnabled: true,
  });
}

export function seedMemoryRideActivityDetailProductionConfig(
  patch: Partial<RideActivityDetailProductionConfig> = {},
): RideActivityDetailProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}
