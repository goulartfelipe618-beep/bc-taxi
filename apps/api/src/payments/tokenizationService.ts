import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { resolvePspProviderForMethod } from './pspProductionService.js';
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
  const { provider: psp } = await resolvePspProviderForMethod(input.methodType);
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

export async function getPaymentPublicConfig() {
  const provider = config.pspProvider;
  const { listPspRoutingConfigs } = await import('./pspProductionService.js');
  const routing = await listPspRoutingConfigs(config.defaultServiceRegionId);
  return {
    pspProvider: provider,
    production: provider !== 'demo' || routing.some((r) => r.providerCode !== 'demo'),
    tokenizationEnabled: provider === 'stripe' || provider === 'mercadopago' || provider === 'pagarme' || config.useMemoryDb,
    stripePublishableKey: provider === 'stripe' ? config.stripePublishableKey || undefined : undefined,
    supportedMethods: ['pix', 'card', 'debit', 'cash'] as PaymentMethodType[],
    routing: routing.map((r) => ({
      methodType: r.methodType,
      provider: r.providerCode,
      configVersion: r.configVersion,
    })),
  };
}

export function newClientIdempotencyKey(prefix = 'pay'): string {
  return `${prefix}-${randomUUID()}`;
}
