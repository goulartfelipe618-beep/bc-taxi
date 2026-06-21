import { randomUUID } from 'node:crypto';
import { emitEvent } from '../realtime/eventBus.js';
import { quoteWithEngine } from '../pricing/pricingEngineService.js';
import type { RideCategoryCode } from '../domain/types.js';
import { recordPaymentSettlement } from './ledgerService.js';
import { createPixCharge, getPixForIntent, toPublicPixCharge } from './pixStore.js';
import { getPspProvider } from './psp/pspProvider.js';
import {
  attachIntentToRideStore,
  createPaymentIntent,
  getMethodPspDetails,
  getPaymentIntent,
  getPaymentIntentByIdempotencyKey,
  getPaymentIntentForRide,
  getPaymentMethod,
  listPaymentMethods,
  resolveMethodType,
  updatePaymentIntentStatus,
} from './paymentStore.js';
import { recordPaymentTransaction } from './transactionStore.js';
import type { PaymentIntentRecord, PaymentMethodType, PixChargePublic } from './types.js';

const DEFAULT_AUTHORIZE_AMOUNT = 5000;

export interface AuthorizeResult {
  intent: PaymentIntentRecord;
  pix?: PixChargePublic;
}

export async function authorizeRidePayment(params: {
  userId: string;
  paymentMethodId: string;
  amountCentavos?: number;
  rideId?: string;
  idempotencyKey?: string;
}): Promise<AuthorizeResult> {
  const amount = params.amountCentavos ?? DEFAULT_AUTHORIZE_AMOUNT;
  const idempotencyKey = params.idempotencyKey ?? randomUUID();

  const existing = await getPaymentIntentByIdempotencyKey(idempotencyKey);
  if (existing) {
    const pix = await getPixForIntent(existing.id);
    return { intent: existing, pix: pix ? toPublicPixCharge(pix) : undefined };
  }

  let method = await getPaymentMethod(params.userId, params.paymentMethodId);

  if (!method) {
    const type = resolveMethodType(params.paymentMethodId);
    if (!type) throw new Error('Método de pagamento inválido');
    method = {
      id: params.paymentMethodId,
      userId: params.userId,
      methodType: type,
      label: type.toUpperCase(),
      isDefault: type === 'pix',
      isActive: true,
    };
  }

  const psp = getPspProvider();
  const pspDetails = await getMethodPspDetails(method.id);
  const pspResult = await psp.authorize({
    amountCentavos: amount,
    currency: 'BRL',
    methodType: method.methodType,
    idempotencyKey,
    userId: params.userId,
    description: params.rideId ? `Corrida ${params.rideId}` : 'BC Taxi',
    providerPaymentMethodId: pspDetails?.providerRef,
  });

  if (pspResult.status === 'failed') {
    throw new Error(pspResult.failureReason ?? 'Falha na autorização PSP');
  }

  const intentStatus =
    pspResult.status === 'requires_action'
      ? 'requires_action'
      : pspResult.status === 'pending'
        ? 'pending'
        : 'authorized';

  const intent = await createPaymentIntent({
    userId: params.userId,
    paymentMethodId: method.id,
    paymentMethodType: method.methodType,
    amountCentavos: amount,
    rideId: params.rideId,
    status: intentStatus,
    provider: psp.name,
    providerRef: pspResult.providerRef,
    idempotencyKey,
    expiresAt: pspResult.pix?.expiresAt,
  });

  await recordPaymentTransaction({
    paymentIntentId: intent.id,
    txnType: 'authorize',
    amountCentavos: amount,
    provider: psp.name,
    providerRef: pspResult.providerRef,
    idempotencyKey: `auth-${idempotencyKey}`,
    status: intentStatus === 'authorized' ? 'succeeded' : 'pending',
  });

  let pixPublic: PixChargePublic | undefined;
  if (pspResult.pix && method.methodType === 'pix') {
    const pix = await createPixCharge({
      paymentIntentId: intent.id,
      txid: pspResult.pix.txid,
      qrCodePayload: pspResult.pix.qrCodePayload,
      amountCentavos: amount,
      expiresAt: pspResult.pix.expiresAt,
    });
    pixPublic = toPublicPixCharge(pix);
  }

  if (intent.status === 'authorized') {
    void emitEvent('PAYMENT_AUTHORIZED', 'payment', intent.id, { method: method.methodType }, {
      rideId: params.rideId,
      userIds: [params.userId],
    });
  }

  return { intent, pix: pixPublic };
}

export async function attachIntentToRide(rideId: string, intentId: string) {
  await attachIntentToRideStore(rideId, intentId);
}

export async function cancelRidePayment(rideId: string) {
  const intent = await getPaymentIntentForRide(rideId);
  if (!intent) return null;
  if (intent.status === 'voided' || intent.status === 'captured') return intent;

  if (intent.providerRef) {
    const psp = getPspProvider();
    await psp.void({ providerRef: intent.providerRef, idempotencyKey: `void-${intent.id}` });
    await recordPaymentTransaction({
      paymentIntentId: intent.id,
      txnType: 'void',
      amountCentavos: intent.amountAuthorizedCentavos,
      provider: psp.name,
      providerRef: intent.providerRef,
      idempotencyKey: `void-${intent.id}`,
    });
  }

  return updatePaymentIntentStatus(intent.id, 'voided');
}

export async function captureRidePayment(
  rideId: string,
  amountCentavos?: number,
  rideContext?: {
    categoryCode?: RideCategoryCode;
    distanceKm?: number;
    durationMin?: number;
    driverUserId?: string;
  },
) {
  const intent = await getPaymentIntentForRide(rideId);
  if (!intent) throw new Error('Pagamento não encontrado para a corrida');
  if (intent.status === 'captured') return intent;
  if (intent.status !== 'authorized' && intent.paymentMethodType !== 'cash') {
    throw new Error(`Pagamento não autorizado (status: ${intent.status})`);
  }

  const captureAmount = amountCentavos ?? intent.amountAuthorizedCentavos;

  if (intent.paymentMethodType !== 'cash' && intent.providerRef) {
    const psp = getPspProvider();
    const captureResult = await psp.capture({
      providerRef: intent.providerRef,
      amountCentavos: captureAmount,
      idempotencyKey: `capture-${intent.id}`,
    });

    if (captureResult.status === 'failed') {
      await updatePaymentIntentStatus(intent.id, 'failed', {
        failureReason: captureResult.failureReason ?? 'Capture failed',
      });
      void emitEvent('PAYMENT_FAILED', 'payment', intent.id, { reason: captureResult.failureReason }, {
        rideId,
        userIds: [intent.userId],
      });
      throw new Error(captureResult.failureReason ?? 'Falha na captura');
    }

    await recordPaymentTransaction({
      paymentIntentId: intent.id,
      txnType: 'capture',
      amountCentavos: captureAmount,
      provider: psp.name,
      providerRef: captureResult.providerRef,
      idempotencyKey: `capture-${intent.id}`,
    });
  }

  const captured = await updatePaymentIntentStatus(intent.id, 'captured', {
    amountCapturedCentavos: captureAmount,
  });

  if (captured && rideContext?.driverUserId && rideContext.categoryCode) {
    const quote = await quoteWithEngine(
      rideContext.categoryCode,
      rideContext.distanceKm ?? 5,
      rideContext.durationMin ?? 15,
    );
    quote.passengerFareCentavos = captureAmount;
    await recordPaymentSettlement({
      rideId,
      driverUserId: rideContext.driverUserId,
      paymentIntentId: intent.id,
      paymentMethodType: intent.paymentMethodType,
      quote,
      confirmedByUserId: rideContext.driverUserId,
    });
  }

  if (captured) {
    void emitEvent('PAYMENT_CAPTURED', 'payment', intent.id, { amountCentavos: captureAmount }, {
      rideId,
      userIds: [intent.userId],
      driverId: rideContext?.driverUserId,
    });
  }

  return captured;
}

export async function getUserPaymentMethods(userId: string) {
  return listPaymentMethods(userId);
}

export async function getIntentById(intentId: string) {
  return getPaymentIntent(intentId);
}

export async function getIntentPix(intentId: string) {
  const pix = await getPixForIntent(intentId);
  return pix ? toPublicPixCharge(pix) : null;
}

export type { PaymentMethodType };
