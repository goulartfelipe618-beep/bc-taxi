import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import {
  computeCancellationFee,
  resolveOperationalParamsForRide,
} from '../config/policyEnforcementService.js';
import { formatFare } from '../domain/pricing.js';
import { pool } from '../db.js';
import type { RideRecord } from '../match/types.js';

export type CancellationActor = 'passenger' | 'driver';
export type CancellationReasonCode = 'normal' | 'safety' | 'fraud' | 'other';

export interface RideCancellationProductionConfig {
  passengerCancelEnabled: boolean;
  driverCancelEnabled: boolean;
  previewRequired: boolean;
  waiveOnSafetyReason: boolean;
  waiveOnFraudReason: boolean;
  driverReputationPenaltyAfterArrival: boolean;
  configVersion: string;
}

export interface CancellationPreview {
  canCancel: boolean;
  actor: CancellationActor;
  priorStatus: string;
  feeCentavos: number;
  feeLabel: string;
  feeWaived: boolean;
  waiveReason?: string;
  reputationImpact: boolean;
  freeWindowRemainingSeconds: number | null;
  policyVersion: string;
  configVersion: string;
}

export interface RideCancellationProductionPayload {
  cancelledBy: string;
  priorStatus: string;
  feeCentavos: number;
  feeLabel: string;
  feeWaived: boolean;
  reasonCode: string | null;
  reputationImpact: boolean;
  configVersion: string;
}

const memoryConfig: RideCancellationProductionConfig = {
  passengerCancelEnabled: true,
  driverCancelEnabled: true,
  previewRequired: true,
  waiveOnSafetyReason: true,
  waiveOnFraudReason: true,
  driverReputationPenaltyAfterArrival: true,
  configVersion: 'camada48-memory-v1',
};

const memorySnapshots = new Map<string, RideCancellationProductionPayload & { rideId: string }>();

function formatFeeLabel(centavos: number): string {
  if (centavos <= 0) return 'Sem taxa';
  return formatFare(centavos);
}

export async function getRideCancellationProductionConfig(): Promise<RideCancellationProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM ride_cancellation_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada48-v1' };
  return {
    passengerCancelEnabled: Boolean(r.passenger_cancel_enabled),
    driverCancelEnabled: Boolean(r.driver_cancel_enabled),
    previewRequired: Boolean(r.preview_required),
    waiveOnSafetyReason: Boolean(r.waive_on_safety_reason),
    waiveOnFraudReason: Boolean(r.waive_on_fraud_reason),
    driverReputationPenaltyAfterArrival: Boolean(r.driver_reputation_penalty_after_arrival),
    configVersion: r.config_version as string,
  };
}

export function seedMemoryRideCancellationProductionConfig(
  patch: Partial<RideCancellationProductionConfig> = {},
): RideCancellationProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}

export function __testResetRideCancellationProductionMemory() {
  memorySnapshots.clear();
  Object.assign(memoryConfig, {
    passengerCancelEnabled: true,
    driverCancelEnabled: true,
    previewRequired: true,
    waiveOnSafetyReason: true,
    waiveOnFraudReason: true,
    driverReputationPenaltyAfterArrival: true,
    configVersion: 'camada48-memory-v1',
  });
}

export function __testGetCancellationSnapshots() {
  return [...memorySnapshots.values()];
}

function computeFreeWindowRemainingSeconds(
  ride: RideRecord,
  freeWindowSeconds: number,
): number | null {
  const anchor = ride.assignedAt ?? ride.arrivedAt;
  if (!anchor) return null;
  const remaining = freeWindowSeconds - (Date.now() - anchor.getTime()) / 1000;
  return Math.max(0, Math.ceil(remaining));
}

function shouldWaiveFee(
  cfg: RideCancellationProductionConfig,
  reasonCode?: CancellationReasonCode,
): { waived: boolean; reason?: string } {
  if (reasonCode === 'safety' && cfg.waiveOnSafetyReason) {
    return { waived: true, reason: 'safety_exemption' };
  }
  if (reasonCode === 'fraud' && cfg.waiveOnFraudReason) {
    return { waived: true, reason: 'fraud_exemption' };
  }
  return { waived: false };
}

function passengerCanCancelStatus(status: RideRecord['status']): boolean {
  return ['REQUESTED', 'OFFERING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'].includes(status);
}

function driverCanCancelStatus(status: RideRecord['status']): boolean {
  return ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(status);
}

export async function previewRideCancellation(input: {
  ride: RideRecord;
  actor: CancellationActor;
  reasonCode?: CancellationReasonCode;
}): Promise<CancellationPreview> {
  const cfg = await getRideCancellationProductionConfig();
  const params = await resolveOperationalParamsForRide(input.ride);
  const priorStatus = input.ride.status;

  if (input.actor === 'passenger' && !cfg.passengerCancelEnabled) {
    return {
      canCancel: false,
      actor: input.actor,
      priorStatus,
      feeCentavos: 0,
      feeLabel: 'Sem taxa',
      feeWaived: true,
      reputationImpact: false,
      freeWindowRemainingSeconds: null,
      policyVersion: params.configVersion,
      configVersion: cfg.configVersion,
    };
  }

  if (input.actor === 'driver' && !cfg.driverCancelEnabled) {
    return {
      canCancel: false,
      actor: input.actor,
      priorStatus,
      feeCentavos: 0,
      feeLabel: 'Sem taxa',
      feeWaived: true,
      reputationImpact: false,
      freeWindowRemainingSeconds: null,
      policyVersion: params.configVersion,
      configVersion: cfg.configVersion,
    };
  }

  const canCancel =
    input.actor === 'passenger'
      ? passengerCanCancelStatus(priorStatus)
      : driverCanCancelStatus(priorStatus);

  let feeCentavos = 0;
  let feeWaived = false;
  let waiveReason: string | undefined;
  let reputationImpact = false;
  let freeWindowRemainingSeconds: number | null = null;

  if (input.actor === 'passenger') {
    const feeResult = computeCancellationFee(input.ride, params, priorStatus);
    feeCentavos = feeResult.feeCentavos;
    freeWindowRemainingSeconds = computeFreeWindowRemainingSeconds(
      input.ride,
      params.cancellationFeePolicy.freeWindowSeconds,
    );
    const waive = shouldWaiveFee(cfg, input.reasonCode);
    if (waive.waived) {
      feeCentavos = 0;
      feeWaived = true;
      waiveReason = waive.reason;
    }
  } else if (
    cfg.driverReputationPenaltyAfterArrival &&
    ['DRIVER_ARRIVED', 'IN_PROGRESS'].includes(priorStatus)
  ) {
    reputationImpact = true;
  }

  return {
    canCancel,
    actor: input.actor,
    priorStatus,
    feeCentavos,
    feeLabel: formatFeeLabel(feeCentavos),
    feeWaived: feeWaived || feeCentavos === 0,
    waiveReason,
    reputationImpact,
    freeWindowRemainingSeconds,
    policyVersion: params.configVersion,
    configVersion: cfg.configVersion,
  };
}

export async function recordCancellationProductionSnapshot(input: {
  rideId: string;
  cancelledBy: CancellationActor | 'system';
  priorStatus: string;
  feeCentavos: number;
  feeWaived: boolean;
  reasonCode?: string;
  reputationImpact: boolean;
  policyVersion: string;
}) {
  const cfg = await getRideCancellationProductionConfig();
  const payload: RideCancellationProductionPayload = {
    cancelledBy: input.cancelledBy,
    priorStatus: input.priorStatus,
    feeCentavos: input.feeCentavos,
    feeLabel: formatFeeLabel(input.feeCentavos),
    feeWaived: input.feeWaived,
    reasonCode: input.reasonCode ?? null,
    reputationImpact: input.reputationImpact,
    configVersion: cfg.configVersion,
  };

  if (config.useMemoryDb) {
    memorySnapshots.set(input.rideId, { rideId: input.rideId, ...payload });
    return;
  }

  await pool.query(
    `INSERT INTO ride_cancellation_snapshots (
      ride_id, cancelled_by, prior_status, fee_centavos, fee_waived,
      reason_code, reputation_impact, policy_version, config_version
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (ride_id) DO UPDATE SET
      cancelled_by = EXCLUDED.cancelled_by,
      prior_status = EXCLUDED.prior_status,
      fee_centavos = EXCLUDED.fee_centavos,
      fee_waived = EXCLUDED.fee_waived,
      reason_code = EXCLUDED.reason_code,
      reputation_impact = EXCLUDED.reputation_impact,
      policy_version = EXCLUDED.policy_version,
      config_version = EXCLUDED.config_version`,
    [
      input.rideId,
      input.cancelledBy,
      input.priorStatus,
      input.feeCentavos,
      input.feeWaived,
      input.reasonCode ?? null,
      input.reputationImpact,
      input.policyVersion,
      cfg.configVersion,
    ],
  );
}

export async function getRideCancellationProduction(
  ride: RideRecord,
): Promise<RideCancellationProductionPayload | null> {
  if (ride.status !== 'CANCELLED') return null;

  if (config.useMemoryDb) {
    const snap = memorySnapshots.get(ride.id);
    if (!snap) return null;
    const { rideId: _r, ...payload } = snap;
    return payload;
  }

  const { rows } = await pool.query(`SELECT * FROM ride_cancellation_snapshots WHERE ride_id = $1`, [
    ride.id,
  ]);
  const r = rows[0];
  if (!r) return null;
  return {
    cancelledBy: r.cancelled_by as string,
    priorStatus: r.prior_status as string,
    feeCentavos: Number(r.fee_centavos),
    feeLabel: formatFeeLabel(Number(r.fee_centavos)),
    feeWaived: Boolean(r.fee_waived),
    reasonCode: r.reason_code as string | null,
    reputationImpact: Boolean(r.reputation_impact),
    configVersion: r.config_version as string,
  };
}

export function toPublicRideCancellationProduction(payload: RideCancellationProductionPayload) {
  return payload;
}

export function toPublicCancellationPreview(preview: CancellationPreview) {
  return preview;
}

export function parseCancellationReasonCode(value: unknown): CancellationReasonCode {
  if (value === 'safety' || value === 'fraud' || value === 'other') return value;
  return 'normal';
}
