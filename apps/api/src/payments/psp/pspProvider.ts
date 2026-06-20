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

function makeTxid(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

function buildPixPayload(txid: string, amountCentavos: number): string {
  const amount = (amountCentavos / 100).toFixed(2);
  return `00020126580014br.gov.bcb.pix0136${txid}520400005303986540${amount.length}${amount}5802BR5925BC TAXI6009BALNEARIO62070503***6304`;
}

class DemoPspProvider implements PspProvider {
  name = 'demo';

  async authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult> {
    const providerRef = `demo-${randomUUID().slice(0, 12)}`;

    if (params.methodType === 'cash') {
      return { providerRef, status: 'authorized' };
    }

    if (params.methodType === 'pix') {
      const txid = makeTxid(params.idempotencyKey);
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

  async capture(params: PspCaptureParams): Promise<PspCaptureResult> {
    if (params.providerRef.includes('fail')) {
      return { providerRef: params.providerRef, status: 'failed', failureReason: 'PSP capture declined' };
    }
    return { providerRef: params.providerRef, status: 'captured' };
  }

  async void(_params: PspVoidParams) {
    return { status: 'voided' as const };
  }
}

class HttpPspProvider implements PspProvider {
  name: string;
  private baseUrl: string;
  private secret: string;

  constructor(baseUrl: string, secret: string, name = 'http-psp') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secret = secret;
    this.name = name;
  }

  private headers(idempotencyKey: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.secret}`,
      'Idempotency-Key': idempotencyKey,
    };
  }

  async authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult> {
    const res = await fetch(`${this.baseUrl}/v1/charges/authorize`, {
      method: 'POST',
      headers: this.headers(params.idempotencyKey),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const text = await res.text();
      return { providerRef: '', status: 'failed', failureReason: text || res.statusText };
    }
    return (await res.json()) as PspAuthorizeResult;
  }

  async capture(params: PspCaptureParams): Promise<PspCaptureResult> {
    const res = await fetch(`${this.baseUrl}/v1/charges/capture`, {
      method: 'POST',
      headers: this.headers(params.idempotencyKey),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      return { providerRef: params.providerRef, status: 'failed', failureReason: await res.text() };
    }
    return (await res.json()) as PspCaptureResult;
  }

  async void(params: PspVoidParams) {
    const res = await fetch(`${this.baseUrl}/v1/charges/void`, {
      method: 'POST',
      headers: this.headers(params.idempotencyKey),
      body: JSON.stringify(params),
    });
    if (!res.ok) return { status: 'failed' as const, failureReason: await res.text() };
    return { status: 'voided' as const };
  }
}

let cached: PspProvider | null = null;

export function getPspProvider(): PspProvider {
  if (cached) return cached;
  if (config.pspProvider === 'http' && config.pspApiUrl && config.pspApiSecret) {
    cached = new HttpPspProvider(config.pspApiUrl, config.pspApiSecret, config.pspProvider);
  } else {
    cached = new DemoPspProvider();
  }
  return cached;
}
