import { createHash, randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import type {
  PspAuthorizeParams,
  PspAuthorizeResult,
  PspCaptureParams,
  PspCaptureResult,
  PspProvider,
  PspVoidParams,
} from './types.js';

type MpPayment = {
  id: number;
  status: string;
  status_detail?: string;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string };
  };
};

async function mpRequest<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mercadoPagoAccessToken}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { message?: string; cause?: Array<{ description?: string }> };
  if (!res.ok) {
    const detail = json.cause?.[0]?.description ?? json.message ?? res.statusText;
    throw new Error(detail);
  }
  return json;
}

function buildPixPayload(txid: string, amountCentavos: number): string {
  const amount = (amountCentavos / 100).toFixed(2);
  return `00020126580014br.gov.bcb.pix0136${txid}520400005303986540${amount.length}${amount}5802BR5925BC TAXI6009BALNEARIO62070503***6304`;
}

export class MercadoPagoPspProvider implements PspProvider {
  name = 'mercadopago';

  async authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult> {
    if (params.methodType === 'cash') {
      return { providerRef: `cash-${params.idempotencyKey}`, status: 'authorized' };
    }

    if (params.methodType === 'pix') {
      const payment = await mpRequest<MpPayment>(
        '/v1/payments',
        {
          transaction_amount: params.amountCentavos / 100,
          description: params.description ?? 'BC Taxi',
          payment_method_id: 'pix',
          payer: { email: `${params.userId.slice(0, 8)}@bctaxi.app` },
        },
        params.idempotencyKey,
      );

      const qrPayload =
        payment.point_of_interaction?.transaction_data?.qr_code ??
        buildPixPayload(String(payment.id), params.amountCentavos);

      return {
        providerRef: String(payment.id),
        status: payment.status === 'approved' ? 'authorized' : 'requires_action',
        pix: {
          txid: String(payment.id),
          qrCodePayload: qrPayload,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      };
    }

    const payment = await mpRequest<MpPayment>(
      '/v1/payments',
      {
        transaction_amount: params.amountCentavos / 100,
        token: params.providerPaymentMethodId ?? params.idempotencyKey,
        description: params.description ?? 'BC Taxi',
        installments: 1,
        payment_method_id: 'visa',
        payer: { email: `${params.userId.slice(0, 8)}@bctaxi.app` },
        capture: false,
      },
      params.idempotencyKey,
    );

    return {
      providerRef: String(payment.id),
      status: payment.status === 'approved' || payment.status === 'authorized' ? 'authorized' : 'requires_action',
    };
  }

  async capture(params: PspCaptureParams): Promise<PspCaptureResult> {
    try {
      await mpRequest(`/v1/payments/${params.providerRef}`, { capture: true }, params.idempotencyKey);
      return { providerRef: params.providerRef, status: 'captured' };
    } catch (e) {
      return {
        providerRef: params.providerRef,
        status: 'failed',
        failureReason: e instanceof Error ? e.message : 'Mercado Pago capture failed',
      };
    }
  }

  async void(params: PspVoidParams) {
    try {
      await mpRequest(
        `/v1/payments/${params.providerRef}/refunds`,
        { amount: 0 },
        params.idempotencyKey,
      );
      return { status: 'voided' as const };
    } catch {
      return { status: 'voided' as const };
    }
  }

  async refund(params: import('./types.js').PspRefundParams) {
    try {
      const result = await mpRequest<{ id: number }>(
        `/v1/payments/${params.providerRef}/refunds`,
        { amount: params.amountCentavos / 100 },
        params.idempotencyKey,
      );
      return { providerRef: String(result.id), status: 'refunded' as const };
    } catch (e) {
      return {
        providerRef: params.providerRef,
        status: 'failed' as const,
        failureReason: e instanceof Error ? e.message : 'Mercado Pago refund failed',
      };
    }
  }
}

export function createMercadoPagoProvider() {
  if (!config.mercadoPagoAccessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
  return new MercadoPagoPspProvider();
}

/** Fallback demo-compatible quando token ausente em dev. */
export class MercadoPagoDemoPspProvider implements PspProvider {
  name = 'mercadopago-demo';

  async authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult> {
    const providerRef = `mp-demo-${randomUUID().slice(0, 10)}`;
    if (params.methodType === 'pix') {
      const txid = createHash('sha256').update(params.idempotencyKey).digest('hex').slice(0, 32);
      return {
        providerRef,
        status: 'requires_action',
        pix: {
          txid,
          qrCodePayload: buildPixPayload(txid, params.amountCentavos),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      };
    }
    return { providerRef, status: 'authorized' };
  }

  async capture(params: PspCaptureParams) {
    return { providerRef: params.providerRef, status: 'captured' as const };
  }

  async void() {
    return { status: 'voided' as const };
  }

  async refund(params: import('./types.js').PspRefundParams) {
    return { providerRef: `mp-refund-${params.providerRef}`, status: 'refunded' as const };
  }
}
