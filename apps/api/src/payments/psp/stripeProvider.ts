import { config } from '../../config.js';
import type {
  PspAuthorizeParams,
  PspAuthorizeResult,
  PspCaptureParams,
  PspCaptureResult,
  PspProvider,
  PspVoidParams,
} from './types.js';

async function stripeRequest<T>(
  path: string,
  secretKey: string,
  body: Record<string, string | number | string[]>,
  idempotencyKey?: string,
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => params.append(`${key}[${i}]`, v));
    } else {
      params.append(key, String(value));
    }
  }

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: params,
  });

  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
  }
  return json;
}

type StripeIntent = {
  id: string;
  status: string;
  next_action?: {
    pix_display_qr_code?: { data?: string };
  };
};

export class StripePspProvider implements PspProvider {
  name = 'stripe';

  constructor(private secretKey: string) {}

  async authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult> {
    if (params.methodType === 'cash') {
      return { providerRef: `cash-${params.idempotencyKey}`, status: 'authorized' };
    }

    const paymentMethodTypes =
      params.methodType === 'pix' ? ['pix'] : ['card'];

    const intent = await stripeRequest<StripeIntent>(
      'payment_intents',
      this.secretKey,
      {
        amount: params.amountCentavos,
        currency: 'brl',
        capture_method: 'manual',
        'payment_method_types[]': paymentMethodTypes,
        description: params.description ?? 'BC Taxi',
      },
      params.idempotencyKey,
    );

    if (params.methodType === 'pix') {
      const qrPayload = intent.next_action?.pix_display_qr_code?.data;
      if (!qrPayload) {
        return {
          providerRef: intent.id,
          status: 'requires_action',
          pix: {
            txid: intent.id.replace('pi_', ''),
            qrCodePayload: intent.id,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        };
      }
      return {
        providerRef: intent.id,
        status: 'requires_action',
        pix: {
          txid: intent.id.replace('pi_', ''),
          qrCodePayload: qrPayload,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      };
    }

    const status = intent.status === 'requires_action' ? 'requires_action' : 'authorized';
    return { providerRef: intent.id, status };
  }

  async capture(params: PspCaptureParams): Promise<PspCaptureResult> {
    try {
      const intent = await stripeRequest<StripeIntent>(
        `payment_intents/${params.providerRef}/capture`,
        this.secretKey,
        { amount_to_capture: params.amountCentavos },
        params.idempotencyKey,
      );
      return {
        providerRef: intent.id,
        status: intent.status === 'succeeded' ? 'captured' : 'failed',
      };
    } catch (e) {
      return {
        providerRef: params.providerRef,
        status: 'failed',
        failureReason: e instanceof Error ? e.message : 'Stripe capture failed',
      };
    }
  }

  async void(params: PspVoidParams) {
    try {
      await stripeRequest(`payment_intents/${params.providerRef}/cancel`, this.secretKey, {}, params.idempotencyKey);
      return { status: 'voided' as const };
    } catch (e) {
      return {
        status: 'failed' as const,
        failureReason: e instanceof Error ? e.message : 'Stripe void failed',
      };
    }
  }
}

export function createStripeProvider() {
  if (!config.stripeSecretKey) throw new Error('STRIPE_SECRET_KEY não configurada');
  return new StripePspProvider(config.stripeSecretKey);
}
