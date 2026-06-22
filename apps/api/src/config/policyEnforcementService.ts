import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getCategory } from '../domain/rideCategories.js';
import { getTier } from '../domain/reputation.js';
import type { RideCategoryCode } from '../domain/types.js';
import type { RideRecord } from '../match/types.js';
import { resolveServiceRegionIdAtPoint } from '../region/serviceRegionGeoService.js';
import {
  getCategoryOperationalParams,
  getUserSegmentPolicy,
  type ArrivalWaitPolicy,
  type CancellationFeePolicy,
  type CategoryOperationalParams,
} from './operationalParamsService.js';

export interface PolicyFeeResult {
  feeCentavos: number;
  policyVersion: string;
  metadata: Record<string, unknown>;
}

export interface PolicyChargeRecord {
  id: string;
  rideId: string;
  chargeType: 'cancellation_fee' | 'arrival_wait_fee';
  amountCentavos: number;
  policyVersion: string;
  status: string;
}

const memoryCharges: PolicyChargeRecord[] = [];
const memoryEvents: Array<{ rideId: string; eventType: string; policyVersion: string }> = [];

export async function resolveOperationalParamsForRide(ride: RideRecord): Promise<CategoryOperationalParams> {
  const regionId =
    (await resolveServiceRegionIdAtPoint(ride.pickupLat, ride.pickupLng)) ?? config.defaultServiceRegionId;
  return getCategoryOperationalParams(ride.categoryCode, regionId);
}

export function computeCancellationFee(
  ride: RideRecord,
  params: CategoryOperationalParams,
  priorStatus: RideRecord['status'],
): PolicyFeeResult {
  const policy = params.cancellationFeePolicy;
  if (!['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(priorStatus)) {
    return {
      feeCentavos: 0,
      policyVersion: params.configVersion,
      metadata: { reason: 'before_driver_assigned', priorStatus },
    };
  }

  const anchor = ride.assignedAt ?? ride.arrivedAt;
  if (!anchor) {
    return {
      feeCentavos: policy.feeCentavos,
      policyVersion: params.configVersion,
      metadata: { reason: 'assigned_without_timestamp', priorStatus },
    };
  }

  const elapsedSec = (Date.now() - anchor.getTime()) / 1000;
  if (elapsedSec <= policy.freeWindowSeconds) {
    return {
      feeCentavos: 0,
      policyVersion: params.configVersion,
      metadata: { reason: 'within_free_window', elapsedSec, priorStatus },
    };
  }

  return {
    feeCentavos: policy.feeCentavos,
    policyVersion: params.configVersion,
    metadata: { reason: 'after_free_window', elapsedSec, priorStatus },
  };
}

export function computeArrivalWaitFee(
  ride: RideRecord,
  params: CategoryOperationalParams,
): PolicyFeeResult {
  const policy = params.arrivalWaitPolicy;
  if (!ride.arrivedAt) {
    return { feeCentavos: 0, policyVersion: params.configVersion, metadata: { reason: 'no_arrival' } };
  }

  const end = ride.startedAt ?? ride.completedAt ?? new Date();
  const waitMinutes = Math.max(0, (end.getTime() - ride.arrivedAt.getTime()) / 60_000);
  const billableMinutes = Math.max(0, waitMinutes - policy.includedWaitMinutes);
  const feeCentavos = Math.round(billableMinutes * policy.perMinuteCentavos);

  return {
    feeCentavos,
    policyVersion: params.configVersion,
    metadata: {
      waitMinutes,
      includedWaitMinutes: policy.includedWaitMinutes,
      billableMinutes,
      perMinuteCentavos: policy.perMinuteCentavos,
    },
  };
}

export async function isCashAllowedByPolicy(
  reputationScore: number,
  categoryCode: string,
  regionId?: string,
): Promise<boolean> {
  const params = await getCategoryOperationalParams(categoryCode, regionId);
  return reputationScore >= params.cashAllowedMinReputation;
}

export async function isPremiumCategoryAllowedByPolicy(input: {
  reputationScore: number;
  categoryCode: string;
  regionId?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  const category = getCategory(input.categoryCode as RideCategoryCode);
  if (!category?.isPremium) return { allowed: true };

  const regionId = input.regionId ?? config.defaultServiceRegionId;
  const params = await getCategoryOperationalParams(input.categoryCode, regionId);
  const tier = getTier(input.reputationScore);
  const segment = await getUserSegmentPolicy(tier, regionId);

  if (input.reputationScore < params.premiumMinReputation) {
    return { allowed: false, reason: 'below_premium_min_reputation' };
  }
  if (!segment.premiumCategoryEligible) {
    return { allowed: false, reason: 'segment_premium_not_eligible' };
  }
  return { allowed: true };
}

async function persistPolicyCharge(input: {
  rideId: string;
  chargeType: 'cancellation_fee' | 'arrival_wait_fee';
  amountCentavos: number;
  policyVersion: string;
  chargedToUserId?: string;
  status: 'pending' | 'captured' | 'waived' | 'voided';
  metadata?: Record<string, unknown>;
}): Promise<PolicyChargeRecord> {
  const record: PolicyChargeRecord = {
    id: randomUUID(),
    rideId: input.rideId,
    chargeType: input.chargeType,
    amountCentavos: input.amountCentavos,
    policyVersion: input.policyVersion,
    status: input.status,
  };

  if (config.useMemoryDb) {
    memoryCharges.push(record);
    return record;
  }

  await pool.query(
    `INSERT INTO ride_policy_charges
       (id, ride_id, charge_type, amount_centavos, policy_version, charged_to_user_id, status, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      record.id,
      input.rideId,
      input.chargeType,
      input.amountCentavos,
      input.policyVersion,
      input.chargedToUserId ?? null,
      input.status,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return record;
}

async function recordPolicyEvent(input: {
  rideId: string;
  eventType: string;
  policyVersion: string;
  metadata?: Record<string, unknown>;
}) {
  if (config.useMemoryDb) {
    memoryEvents.push({
      rideId: input.rideId,
      eventType: input.eventType,
      policyVersion: input.policyVersion,
    });
    return;
  }
  await pool.query(
    `INSERT INTO ride_policy_events (ride_id, event_type, policy_version, metadata_json)
     VALUES ($1,$2,$3,$4)`,
    [input.rideId, input.eventType, input.policyVersion, JSON.stringify(input.metadata ?? {})],
  );
}

async function updateRideFeeColumns(
  rideId: string,
  patch: { cancellationFeeCentavos?: number; arrivalWaitFeeCentavos?: number },
) {
  if (config.useMemoryDb) return;
  const sets: string[] = [];
  const vals: unknown[] = [rideId];
  if (patch.cancellationFeeCentavos != null) {
    vals.push(patch.cancellationFeeCentavos);
    sets.push(`cancellation_fee_centavos = $${vals.length}`);
  }
  if (patch.arrivalWaitFeeCentavos != null) {
    vals.push(patch.arrivalWaitFeeCentavos);
    sets.push(`arrival_wait_fee_centavos = $${vals.length}`);
  }
  if (sets.length === 0) return;
  await pool.query(`UPDATE rides SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, vals);
}

export async function assessPassengerCancellationPolicy(
  ride: RideRecord,
  priorStatus: RideRecord['status'],
): Promise<PolicyFeeResult> {
  const params = await resolveOperationalParamsForRide(ride);
  const result = computeCancellationFee(ride, params, priorStatus);
  if (result.feeCentavos > 0) {
    await persistPolicyCharge({
      rideId: ride.id,
      chargeType: 'cancellation_fee',
      amountCentavos: result.feeCentavos,
      policyVersion: result.policyVersion,
      chargedToUserId: ride.passengerId,
      status: 'pending',
      metadata: result.metadata,
    });
    await updateRideFeeColumns(ride.id, { cancellationFeeCentavos: result.feeCentavos });
    await recordPolicyEvent({
      rideId: ride.id,
      eventType: 'cancel_fee_assessed',
      policyVersion: result.policyVersion,
      metadata: result.metadata,
    });
  } else {
    await recordPolicyEvent({
      rideId: ride.id,
      eventType: 'cancel_fee_waived',
      policyVersion: result.policyVersion,
      metadata: result.metadata,
    });
  }
  return result;
}

export async function assessArrivalWaitPolicy(ride: RideRecord): Promise<PolicyFeeResult> {
  const params = await resolveOperationalParamsForRide(ride);
  const result = computeArrivalWaitFee(ride, params);
  if (result.feeCentavos > 0) {
    await persistPolicyCharge({
      rideId: ride.id,
      chargeType: 'arrival_wait_fee',
      amountCentavos: result.feeCentavos,
      policyVersion: result.policyVersion,
      chargedToUserId: ride.passengerId,
      status: 'pending',
      metadata: result.metadata,
    });
    await updateRideFeeColumns(ride.id, { arrivalWaitFeeCentavos: result.feeCentavos });
    await recordPolicyEvent({
      rideId: ride.id,
      eventType: 'wait_fee_assessed',
      policyVersion: result.policyVersion,
      metadata: result.metadata,
    });
  }
  return result;
}

export async function markPolicyChargesCaptured(
  rideId: string,
  chargeType: PolicyChargeRecord['chargeType'],
) {
  if (config.useMemoryDb) {
    for (const c of memoryCharges) {
      if (c.rideId === rideId && c.chargeType === chargeType && c.status === 'pending') {
        c.status = 'captured';
      }
    }
    return;
  }
  await pool.query(
    `UPDATE ride_policy_charges SET status = 'captured'
     WHERE ride_id = $1 AND charge_type = $2 AND status = 'pending'`,
    [rideId, chargeType],
  );
}

export async function listPolicyChargesForRide(rideId: string): Promise<PolicyChargeRecord[]> {
  if (config.useMemoryDb) return memoryCharges.filter((c) => c.rideId === rideId);
  const { rows } = await pool.query(
    `SELECT id, ride_id, charge_type, amount_centavos, policy_version, status
     FROM ride_policy_charges WHERE ride_id = $1 ORDER BY created_at ASC`,
    [rideId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    rideId: r.ride_id as string,
    chargeType: r.charge_type as PolicyChargeRecord['chargeType'],
    amountCentavos: Number(r.amount_centavos),
    policyVersion: r.policy_version as string,
    status: r.status as string,
  }));
}

export function __testResetPolicyEnforcementMemory() {
  memoryCharges.length = 0;
  memoryEvents.length = 0;
}

export function __testGetPolicyEvents() {
  return memoryEvents;
}

export type { CancellationFeePolicy, ArrivalWaitPolicy };
