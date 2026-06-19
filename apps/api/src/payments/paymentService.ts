import {
  attachIntentToRideStore,
  createPaymentIntent,
  getPaymentIntent,
  getPaymentIntentForRide,
  getPaymentMethod,
  listPaymentMethods,
  resolveMethodType,
  updatePaymentIntentStatus,
} from './paymentStore.js';
import type { PaymentIntentRecord, PaymentMethodType } from './types.js';

const DEFAULT_AUTHORIZE_AMOUNT = 5000;

export async function authorizeRidePayment(params: {
  userId: string;
  paymentMethodId: string;
  amountCentavos?: number;
  rideId?: string;
}): Promise<PaymentIntentRecord> {
  const amount = params.amountCentavos ?? DEFAULT_AUTHORIZE_AMOUNT;
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

  if (method.methodType === 'cash') {
    return createPaymentIntent({
      userId: params.userId,
      paymentMethodId: method.id,
      paymentMethodType: 'cash',
      amountCentavos: amount,
      rideId: params.rideId,
    });
  }

  return createPaymentIntent({
    userId: params.userId,
    paymentMethodId: method.id,
    paymentMethodType: method.methodType,
    amountCentavos: amount,
    rideId: params.rideId,
  });
}

export async function attachIntentToRide(rideId: string, intentId: string) {
  await attachIntentToRideStore(rideId, intentId);
}

export async function cancelRidePayment(rideId: string) {
  const intent = await getPaymentIntentForRide(rideId);
  if (!intent) return null;
  if (intent.status === 'voided' || intent.status === 'captured') return intent;
  return updatePaymentIntentStatus(intent.id, 'voided');
}

export async function captureRidePayment(rideId: string, amountCentavos?: number) {
  const intent = await getPaymentIntentForRide(rideId);
  if (!intent) throw new Error('Pagamento não encontrado para a corrida');
  if (intent.status === 'captured') return intent;
  if (intent.status !== 'authorized') {
    throw new Error(`Pagamento não autorizado (status: ${intent.status})`);
  }

  const captureAmount = amountCentavos ?? intent.amountAuthorizedCentavos;
  if (intent.paymentMethodType === 'cash') {
    return updatePaymentIntentStatus(intent.id, 'captured', {
      amountCapturedCentavos: captureAmount,
    });
  }

  return updatePaymentIntentStatus(intent.id, 'captured', {
    amountCapturedCentavos: captureAmount,
  });
}

export async function getUserPaymentMethods(userId: string) {
  return listPaymentMethods(userId);
}

export async function getIntentById(intentId: string) {
  return getPaymentIntent(intentId);
}

export type { PaymentMethodType };
