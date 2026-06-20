import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { emitEvent } from '../realtime/eventBus.js';
import { getPixByTxid, markPixPaid } from './pixStore.js';
import { getPaymentIntent, updatePaymentIntentStatus } from './paymentStore.js';
import { recordPaymentTransaction } from './transactionStore.js';
import { getPspProvider } from './psp/pspProvider.js';

export function verifyWebhookSignature(rawBody: string, signatureHeader?: string): boolean {
  if (!config.pspWebhookSecret) return true;
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', config.pspWebhookSecret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function handlePspWebhook(payload: {
  event: string;
  txid?: string;
  paymentIntentId?: string;
  idempotencyKey?: string;
}) {
  if (payload.event === 'pix.paid' && payload.txid) {
    return confirmPixPayment(payload.txid, payload.idempotencyKey);
  }
  if (payload.event === 'charge.failed' && payload.paymentIntentId) {
    return failPaymentIntent(payload.paymentIntentId, 'PSP charge failed');
  }
  return { handled: false };
}

export async function confirmPixPayment(txid: string, idempotencyKey?: string) {
  const pix = await getPixByTxid(txid);
  if (!pix) throw new Error('Cobrança PIX não encontrada');
  if (pix.status === 'paid') {
    const intent = await getPaymentIntent(pix.paymentIntentId);
    return { intent, pix, duplicate: true };
  }

  const updatedPix = await markPixPaid(txid);
  if (!updatedPix) throw new Error('Falha ao confirmar PIX');

  const intent = await updatePaymentIntentStatus(pix.paymentIntentId, 'authorized');
  if (!intent) throw new Error('Intent não encontrado');

  const psp = getPspProvider();
  await recordPaymentTransaction({
    paymentIntentId: intent.id,
    txnType: 'authorize',
    amountCentavos: pix.amountCentavos,
    provider: psp.name,
    providerRef: txid,
    idempotencyKey: idempotencyKey ?? `pix-paid-${txid}`,
  });

  void emitEvent('PAYMENT_AUTHORIZED', 'payment', intent.id, { method: 'pix', txid }, {
    rideId: intent.rideId,
    userIds: [intent.userId],
  });

  return { intent, pix: updatedPix, duplicate: false };
}

export async function failPaymentIntent(intentId: string, reason: string) {
  const intent = await updatePaymentIntentStatus(intentId, 'failed', { failureReason: reason });
  if (intent) {
    void emitEvent('PAYMENT_FAILED', 'payment', intentId, { reason }, {
      rideId: intent.rideId,
      userIds: [intent.userId],
    });
  }
  return intent;
}
