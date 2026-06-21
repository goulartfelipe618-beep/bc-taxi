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

type PagarmeOrder = {
  id: string;
  status: string;
  charges?: Array<{
    id: string;
    status: string;
    last_transaction?: { qr_code?: string; qr_code_url?: string };
  }>;
};

async function pagarmeRequest<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const auth = Buffer.from(`${config.pagarmeApiKey}:`).toString('base64');
  const res = await fetch(`https://api.pagar.me/core/v5${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { message?: string };
  if (!res.ok) throw new Error(json.message ?? `Pagar.me error ${res.status}`);
  return json;
}

function buildPixPayload(txid: string, amountCentavos: number): string {
  const amount = (amountCentavos / 100).toFixed(2);
  return `00020126580014br.gov.bcb.pix0136${txid}520400005303986540${amount.length}${amount}5802BR5925BC TAXI6009BALNEARIO62070503***6304`;
}

export class PagarmePspProvider implements PspProvider {
  name = 'pagarme';

  async authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult> {
    if (params.methodType === 'cash') {
      return { providerRef: `cash-${params.idempotencyKey}`, status: 'authorized' };
    }

    const paymentMethod = params.methodType === 'pix' ? 'pix' : 'credit_card';
    const order = await pagarmeRequest<PagarmeOrder>(
      '/orders',
      {
        customer: {
          name: 'Passageiro BC Taxi',
          email: `${params.userId.slice(0, 8)}@bctaxi.app`,
          type: 'individual',
          document: '00000000000',
          document_type: 'CPF',
          phones: {},
        },
        items: [
          {
            amount: params.amountCentavos,
            description: params.description ?? 'Corrida BC Taxi',
            quantity: 1,
            code: params.idempotencyKey.slice(0, 20),
          },
        ],
        payments: [
          {
            payment_method: paymentMethod,
            amount: params.amountCentavos,
            ...(paymentMethod === 'pix'
              ? { pix: { expires_in: 1800 } }
              : {
                  credit_card: {
                    installments: 1,
                    statement_descriptor: 'BC TAXI',
                    card: {
                      number: '4111111111111111',
                      holder_name: 'Passageiro',
                      exp_month: 12,
                      exp_year: 2030,
                      cvv: '123',
                    },
                  },
                }),
          },
        ],
      },
      params.idempotencyKey,
    );

    const charge = order.charges?.[0];
    const providerRef = charge?.id ?? order.id;

    if (params.methodType === 'pix') {
      const qrPayload =
        charge?.last_transaction?.qr_code ?? buildPixPayload(providerRef, params.amountCentavos);
      return {
        providerRef,
        status: 'requires_action',
        pix: {
          txid: providerRef.replace(/\W/g, '').slice(0, 32),
          qrCodePayload: qrPayload,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      };
    }

    const authorized = charge?.status === 'paid' || charge?.status === 'pending';
    return { providerRef, status: authorized ? 'authorized' : 'requires_action' };
  }

  async capture(params: PspCaptureParams): Promise<PspCaptureResult> {
    try {
      await pagarmeRequest(
        `/charges/${params.providerRef}/capture`,
        { amount: params.amountCentavos },
        params.idempotencyKey,
      );
      return { providerRef: params.providerRef, status: 'captured' };
    } catch (e) {
      return {
        providerRef: params.providerRef,
        status: 'failed',
        failureReason: e instanceof Error ? e.message : 'Pagar.me capture failed',
      };
    }
  }

  async void(params: PspVoidParams) {
    try {
      await pagarmeRequest(`/charges/${params.providerRef}/cancel`, {}, params.idempotencyKey);
      return { status: 'voided' as const };
    } catch {
      return { status: 'voided' as const };
    }
  }
}

export class PagarmeDemoPspProvider implements PspProvider {
  name = 'pagarme-demo';

  async authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult> {
    const providerRef = `pg-demo-${randomUUID().slice(0, 10)}`;
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
}

export function createPagarmeProvider() {
  if (!config.pagarmeApiKey) return new PagarmeDemoPspProvider();
  return new PagarmePspProvider();
}
