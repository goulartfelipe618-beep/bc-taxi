import { getRide } from '../match/matchService.js';
import type { RideRecord } from '../match/types.js';
import { captureRidePayment } from '../payments/paymentService.js';
import { openReviewObligationsForRide } from '../reviews/pendingReviewService.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';
import { releaseDriverPg, updateRideLifecyclePg } from '../stores/rideRepository.js';
import {
  bothCodesVerified,
  getActivePair,
  getVerificationStatus,
  issueStartCodes,
  reissueStartCodes,
  toVerificationPublic,
  validateStartCode,
} from './codeStore.js';
import type { CodeRole, VerifyCodeResult, VerificationPublic } from './types.js';
import { captureRideGovernanceSnapshot } from '../governance/governanceService.js';
import { emitEvent } from '../realtime/eventBus.js';
import { issueRideReceipt } from '../receipts/receiptService.js';
import { recordFraudSignal } from '../fraud/fraudService.js';
import { bindRouteToRide, getActiveRoute, recalculateActiveRoute, toPublicActiveRoute } from '../route/routeService.js';
import { emitRouteRecalculatedEvent } from '../route/liveRouteMonitorService.js';

async function updateLifecycle(
  rideId: string,
  patch: {
    status?: RideRecord['status'];
    arrivedAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
  },
): Promise<RideRecord | null> {
  if (useMemory()) {
    return memoryMatchStore.updateRideLifecycle(rideId, patch);
  }
  return updateRideLifecyclePg(rideId, patch);
}

async function releaseDriver(ride: RideRecord) {
  if (!ride.driverId) return;
  if (useMemory()) {
    await memoryMatchStore.releaseDriver(ride.driverId);
    return;
  }
  await releaseDriverPg(ride.driverId);
}

export async function driverMarkArrived(
  rideId: string,
  driverId: string,
): Promise<{ ride: RideRecord; verification: VerificationPublic; codes?: { passenger: string; driver: string } }> {
  const ride = await getRide(rideId);
  if (!ride || ride.driverId !== driverId) {
    throw new Error('Corrida não encontrada ou motorista não autorizado');
  }
  if (ride.status !== 'DRIVER_ASSIGNED') {
    throw new Error(`Status inválido para chegada: ${ride.status}`);
  }

  const arrivedAt = new Date();
  const issued = await issueStartCodes(rideId, arrivedAt);
  const updated = await updateLifecycle(rideId, {
    status: 'DRIVER_ARRIVED',
    arrivedAt,
  });
  if (!updated) throw new Error('Falha ao atualizar corrida');

  const verification = toVerificationPublic(issued.pair);
  const result: {
    ride: RideRecord;
    verification: VerificationPublic;
    codes?: { passenger: string; driver: string };
  } = { ride: updated, verification };

  if (useMemory()) {
    result.codes = { passenger: issued.passengerCode, driver: issued.driverCode };
  }
  void emitEvent('RIDE_DRIVER_ARRIVED', 'ride', rideId, { driverId }, {
    rideId,
    driverId,
    userIds: [ride.passengerId],
  });
  void emitEvent('RIDE_START_CODE_ISSUED', 'ride', rideId, { driverId }, {
    rideId,
    driverId,
    userIds: [ride.passengerId, driverId],
  });
  return result;
}

export async function verifyStartCode(
  rideId: string,
  actorUserId: string,
  role: CodeRole,
  code: string,
): Promise<VerifyCodeResult> {
  const ride = await getRide(rideId);
  if (!ride) return { ok: false, reason: 'Corrida não encontrada' };

  if (role === 'passenger') {
    if (ride.driverId !== actorUserId) return { ok: false, reason: 'Motorista não autorizado' };
  } else if (ride.passengerId !== actorUserId) {
    return { ok: false, reason: 'Passageiro não autorizado' };
  }

  if (!['DRIVER_ARRIVED', 'IN_PROGRESS'].includes(ride.status)) {
    return { ok: false, reason: `Status inválido para verificação: ${ride.status}` };
  }

  const result = await validateStartCode(rideId, role, code);
  if (!result.ok) {
    const signalType = result.cooldownUntil ? 'CODE_COOLDOWN' : 'CODE_VERIFY_FAIL';
    void recordFraudSignal({
      userId: actorUserId,
      rideId,
      signalType,
      metadata: { role, reason: result.reason },
    });
    return {
      ok: false,
      reason: result.reason,
      cooldownUntil: result.cooldownUntil?.toISOString(),
    };
  }

  let started = ride.status === 'IN_PROGRESS';
  if (!started && (await bothCodesVerified(rideId))) {
    const startedAt = new Date();
    await updateLifecycle(rideId, { status: 'IN_PROGRESS', startedAt });
    started = true;

    void bindRouteToRide({
      rideId,
      fromLat: ride.pickupLat,
      fromLng: ride.pickupLng,
      toLat: ride.dropoffLat,
      toLng: ride.dropoffLng,
      userId: ride.passengerId,
    }).catch(() => undefined);

    void emitEvent('RIDE_STARTED', 'ride', rideId, {}, {
      rideId,
      userIds: [ride.passengerId],
      driverId: ride.driverId,
    });
  }

  return { ok: true, role, started };
}

export async function reissueStartCodesForRide(
  rideId: string,
  actorUserId: string,
): Promise<{ verification: VerificationPublic; codes?: { passenger: string; driver: string } }> {
  const ride = await getRide(rideId);
  if (!ride) throw new Error('Corrida não encontrada');
  if (ride.passengerId !== actorUserId && ride.driverId !== actorUserId) {
    throw new Error('Usuário não autorizado');
  }
  if (ride.status !== 'DRIVER_ARRIVED') {
    throw new Error('Reemissão permitida apenas após chegada do motorista');
  }

  const issued = await reissueStartCodes(rideId, ride.arrivedAt);
  const verification = toVerificationPublic(issued.pair);
  const result: { verification: VerificationPublic; codes?: { passenger: string; driver: string } } = {
    verification,
  };
  if (useMemory()) {
    result.codes = { passenger: issued.passengerCode, driver: issued.driverCode };
  }
  return result;
}

export async function driverCompleteRide(rideId: string, driverId: string): Promise<RideRecord> {
  const ride = await getRide(rideId);
  if (!ride || ride.driverId !== driverId) {
    throw new Error('Corrida não encontrada ou motorista não autorizado');
  }
  if (ride.status !== 'IN_PROGRESS') {
    throw new Error(`Status inválido para conclusão: ${ride.status}`);
  }

  const { assessArrivalWaitPolicy, markPolicyChargesCaptured } = await import(
    '../config/policyEnforcementService.js'
  );
  const waitFee = await assessArrivalWaitPolicy(ride);
  const baseFare = ride.estimatedFareCentavos ?? 0;
  const amount = baseFare + waitFee.feeCentavos;

  await captureRidePayment(rideId, amount > 0 ? amount : undefined, {
    categoryCode: ride.categoryCode as import('../domain/types.js').RideCategoryCode,
    driverUserId: driverId,
  });
  if (waitFee.feeCentavos > 0) {
    await markPolicyChargesCaptured(rideId, 'arrival_wait_fee');
  }

  const completed = await updateLifecycle(rideId, {
    status: 'COMPLETED',
    completedAt: new Date(),
  });
  if (!completed) throw new Error('Falha ao concluir corrida');

  await captureRideGovernanceSnapshot({
    rideId,
    phase: 'settlement',
    quotedFareCentavos: amount,
    snapshotJson: {
      capturedAmountCentavos: amount,
      baseFareCentavos: baseFare,
      arrivalWaitFeeCentavos: waitFee.feeCentavos,
      driverId,
    },
  });

  await releaseDriver(completed);

  if (completed.driverId) {
    await openReviewObligationsForRide({
      rideId: completed.id,
      passengerId: completed.passengerId,
      driverId: completed.driverId,
      completedAt: completed.completedAt ?? new Date(),
    });
  }

  if (completed.isCorporate) {
    const { captureCorporateInvoiceOnRideComplete } = await import(
      '../corporate/corporateProductionService.js'
    );
    await captureCorporateInvoiceOnRideComplete(rideId, amount);
  }

  const receipt = await issueRideReceipt(completed);
  void emitEvent('RIDE_COMPLETED', 'ride', rideId, {
    fareCentavos: amount,
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
  }, {
    rideId,
    userIds: [completed.passengerId],
    driverId: completed.driverId,
  });

  void import('../fraud/suspiciousRideService.js').then(({ analyzeCompletedRide }) =>
    analyzeCompletedRide(completed),
  );

  return completed;
}

export async function getRideVerification(rideId: string): Promise<VerificationPublic | null> {
  return getVerificationStatus(rideId);
}

export async function getRideActiveRoute(rideId: string) {
  return getActiveRoute(rideId);
}

export async function recalculateRideRoute(
  rideId: string,
  driverId: string,
  driverLat: number,
  driverLng: number,
  reasonCode: import('../route/types.js').RouteRecalcReasonCode = 'MANUAL',
) {
  const ride = await getRide(rideId);
  if (!ride || ride.driverId !== driverId) {
    throw new Error('Corrida não encontrada ou motorista não autorizado');
  }
  if (ride.status !== 'IN_PROGRESS') {
    throw new Error('Recálculo permitido apenas com corrida em andamento');
  }

  const outcome = await recalculateActiveRoute({
    rideId,
    fromLat: driverLat,
    fromLng: driverLng,
    toLat: ride.dropoffLat,
    toLng: ride.dropoffLng,
    reasonCode,
  });

  if (outcome.applied) {
    await emitRouteRecalculatedEvent(rideId, ride.passengerId, driverId, outcome);
  }

  return outcome.state;
}

export { toPublicActiveRoute };

export async function ensureCodesIssued(rideId: string) {
  const existing = await getActivePair(rideId);
  if (existing) return existing;
  const issued = await issueStartCodes(rideId);
  return issued.pair;
}
