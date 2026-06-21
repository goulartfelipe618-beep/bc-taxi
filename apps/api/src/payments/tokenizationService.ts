import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getPspProvider } from './psp/pspProvider.js';
import {
  getPaymentMethod,
  getMethodPspDetails,
  saveTokenizedPaymentMethod,
  type MethodPspDetails,
} from './paymentStore.js';
import type { PaymentMethodRecord, PaymentMethodType } from './types.js';

export interface TokenizePaymentMethodInput {
  userId: string;
  methodType: 'card' | 'debit';
  providerToken: string;
  label?: string;
  lastFour?: string;
  brand?: string;
  setDefault?: boolean;
}

function fingerprintToken(userId: string, provider: string, token: string): string {
  return createHash('sha256').update(`${userId}:${provider}:${token}`).digest('hex').slice(0, 32);
}

export async function tokenizePaymentMethod(input: TokenizePaymentMethodInput): Promise<PaymentMethodRecord> {
  const psp = getPspProvider();
  const provider = psp.name;
  const fingerprint = fingerprintToken(input.userId, provider, input.providerToken);

  const label =
    input.label ??
    (input.lastFour ? `${input.methodType === 'debit' ? 'Débito' : 'Cartão'} •••• ${input.lastFour}` : 'Cartão salvo');

  return saveTokenizedPaymentMethod({
    userId: input.userId,
    methodType: input.methodType,
    label,
    lastFour: input.lastFour,
    brand: input.brand,
    provider,
    providerRef: input.providerToken,
    fingerprintHash: fingerprint,
    setDefault: input.setDefault ?? false,
  });
}

export async function resolveMethodPspDetails(
  userId: string,
  methodId: string,
): Promise<{ method: PaymentMethodRecord; psp: MethodPspDetails | null }> {
  const method = await getPaymentMethod(userId, methodId);
  if (!method) throw new Error('Método de pagamento inválido');

  const pspDetails = await getMethodPspDetails(methodId);
  return { method, psp: pspDetails };
}

export function getPaymentPublicConfig() {
  const provider = config.pspProvider;
  return {
    pspProvider: provider,
    production: provider !== 'demo',
    tokenizationEnabled: provider === 'stripe' || provider === 'mercadopago' || provider === 'pagarme' || config.useMemoryDb,
    stripePublishableKey: provider === 'stripe' ? config.stripePublishableKey || undefined : undefined,
    supportedMethods: ['pix', 'card', 'debit', 'cash'] as PaymentMethodType[],
  };
}

export function newClientIdempotencyKey(prefix = 'pay'): string {
  return `${prefix}-${randomUUID()}`;
}
