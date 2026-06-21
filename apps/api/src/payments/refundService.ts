import { randomUUID } from 'node:crypto';
import { emitEvent } from '../realtime/eventBus.js';
import { getPspProvider } from './psp/pspProvider.js';
import { getPaymentIntent, updatePaymentIntentStatus } from './paymentStore.js';
import {
  createRefundRequest,
  getRefundByIdempotencyKey,
  updateRefundRequest,
} from './refundStore.js';
import { recordPaymentTransaction } from './transactionStore.js';

export async function requestPaymentRefund(params: {
  intentId: string;
  userId: string;
  amountCentavos?: number;
  reason?: string;
  idempotencyKey?: string;
}) {
  const idempotencyKey = params.idempotencyKey ?? `refund-${params.intentId}-${randomUUID().slice(0, 8)}`;

  const existing = await getRefundByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const intent = await getPaymentIntent(params.intentId);
  if (!intent) throw new Error('Intent não encontrado');
  if (intent.userId !== params.userId) throw new Error('Intent não pertence ao usuário');
  if (intent.status !== 'captured') {
    throw new Error(`Estorno permitido apenas após captura (status: ${intent.status})`);
  }

  const amount = params.amountCentavos ?? intent.amountCapturedCentavos;
  if (amount <= 0 || amount > intent.amountCapturedCentavos) {
    throw new Error('Valor de estorno inválido');
  }

  if (intent.paymentMethodType === 'cash') {
    throw new Error('Estorno não aplicável a pagamento em dinheiro');
  }

  const refund = await createRefundRequest({
    paymentIntentId: intent.id,
    amountCentavos: amount,
    reason: params.reason,
    requestedByUserId: params.userId,
    idempotencyKey,
  });

  await updateRefundRequest(refund.id, { status: 'processing' });

  if (!intent.providerRef) {
    await updateRefundRequest(refund.id, {
      status: 'failed',
      failureReason: 'Sem referência PSP',
      processedAt: new Date(),
    });
    throw new Error('Sem referência PSP para estorno');
  }

  const psp = getPspProvider();
  const result = await psp.refund({
    providerRef: intent.providerRef,
    amountCentavos: amount,
    idempotencyKey,
  });

  if (result.status === 'failed') {
    await updateRefundRequest(refund.id, {
      status: 'failed',
      failureReason: result.failureReason ?? 'Estorno recusado',
      processedAt: new Date(),
    });
    throw new Error(result.failureReason ?? 'Estorno recusado pelo PSP');
  }

  await recordPaymentTransaction({
    paymentIntentId: intent.id,
    txnType: 'refund',
    amountCentavos: amount,
    provider: psp.name,
    providerRef: result.providerRef,
    idempotencyKey,
  });

  const updatedRefund = await updateRefundRequest(refund.id, {
    status: 'succeeded',
    providerRef: result.providerRef,
    processedAt: new Date(),
  });

  if (amount >= intent.amountCapturedCentavos) {
    await updatePaymentIntentStatus(intent.id, 'voided', { failureReason: params.reason ?? 'Estornado' });
  }

  void emitEvent('PAYMENT_REFUNDED', 'payment', intent.id, { amountCentavos: amount, reason: params.reason }, {
    rideId: intent.rideId,
    userIds: [intent.userId],
  });

  return updatedRefund!;
}
