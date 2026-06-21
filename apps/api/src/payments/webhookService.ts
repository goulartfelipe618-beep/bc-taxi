import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { getPaymentIntentByProviderRef, updatePaymentIntentStatus } from './paymentStore.js';
import { claimWebhookEvent, getWebhookEventResult, markWebhookProcessed } from './webhookStore.js';

export function verifyStripeWebhookSignature(rawBody: string, signatureHeader?: string): boolean {
  if (!config.stripeWebhookSecret) return config.useMemoryDb;
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', config.stripeWebhookSecret).update(signedPayload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

async function handleStripePaymentIntentSucceeded(intentObject: Record<string, unknown>) {
  const providerRef = intentObject.id as string;
  const amount = Number(intentObject.amount_received ?? intentObject.amount ?? 0);

  const intent = await getPaymentIntentByProviderRef(providerRef);
  if (!intent) {
    return { handled: false, reason: 'intent_not_found', providerRef };
  }

  if (intent.status === 'authorized' || intent.status === 'captured') {
    return { handled: true, duplicate: true, intentId: intent.id };
  }

  if (intent.paymentMethodType === 'pix' && intent.status === 'requires_action') {
    const txid = providerRef.replace('pi_', '');
    const { confirmPixPayment } = await import('./pixService.js');
    return confirmPixPayment(txid, `stripe-${providerRef}`);
  }

  const updated = await updatePaymentIntentStatus(intent.id, 'authorized');
  return { handled: true, intent: updated, amountCentavos: amount, intentId: intent.id };
}

async function handleStripePaymentIntentFailed(intentObject: Record<string, unknown>) {
  const providerRef = intentObject.id as string;
  const intent = await getPaymentIntentByProviderRef(providerRef);
  if (!intent) return { handled: false, reason: 'intent_not_found' };

  const reason =
    (intentObject.last_payment_error as { message?: string } | undefined)?.message ?? 'Stripe payment failed';
  const { failPaymentIntent } = await import('./pixService.js');
  await failPaymentIntent(intent.id, reason);
  return { handled: true, intentId: intent.id, reason };
}

export async function handleStripeWebhook(rawBody: string) {
  const event = JSON.parse(rawBody) as StripeEvent;
  const { event: webhookEvent, duplicate } = await claimWebhookEvent({
    provider: 'stripe',
    eventId: event.id,
    eventType: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (duplicate) {
    const cached = await getWebhookEventResult('stripe', event.id);
    return { ...(cached ?? { handled: true }), duplicate: true };
  }

  let result: Record<string, unknown>;

  switch (event.type) {
    case 'payment_intent.succeeded':
      result = await handleStripePaymentIntentSucceeded(event.data.object);
      break;
    case 'payment_intent.payment_failed':
      result = await handleStripePaymentIntentFailed(event.data.object);
      break;
    default:
      result = { handled: false, ignored: true, type: event.type };
  }

  await markWebhookProcessed(webhookEvent.id, result);
  return result;
}

export async function handlePspWebhookWithIdempotency(
  payload: {
    event: string;
    txid?: string;
    paymentIntentId?: string;
    idempotencyKey?: string;
  },
  meta?: { provider?: string; eventId?: string },
) {
  const provider = meta?.provider ?? 'psp';
  const eventId =
    meta?.eventId ?? payload.idempotencyKey ?? `${payload.event}:${payload.txid ?? payload.paymentIntentId ?? 'unknown'}`;

  const { event: webhookEvent, duplicate } = await claimWebhookEvent({
    provider,
    eventId,
    eventType: payload.event,
    payload: payload as unknown as Record<string, unknown>,
  });

  if (duplicate) {
    const cached = await getWebhookEventResult(provider, eventId);
    return { ...(cached ?? { handled: true }), duplicate: true };
  }

  let result: Record<string, unknown>;
  if (payload.event === 'pix.paid' && payload.txid) {
    const { confirmPixPayment } = await import('./pixService.js');
    result = await confirmPixPayment(payload.txid, payload.idempotencyKey ?? `webhook-${eventId}`);
  } else if (payload.event === 'charge.failed' && payload.paymentIntentId) {
    const { failPaymentIntent } = await import('./pixService.js');
    const intent = await failPaymentIntent(payload.paymentIntentId, 'PSP charge failed');
    result = { handled: true, intent };
  } else {
    result = { handled: false };
  }

  await markWebhookProcessed(webhookEvent.id, result);
  return result;
}
