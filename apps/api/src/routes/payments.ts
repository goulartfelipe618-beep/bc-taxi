import { Router, type Request, type Response } from 'express';
import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  authorizeRidePayment,
  getIntentById,
  getIntentPix,
  getUserPaymentMethods,
} from '../payments/paymentService.js';
import { requestPaymentRefund } from '../payments/refundService.js';
import { confirmPixPayment, verifyWebhookSignature } from '../payments/pixService.js';
import { getPaymentPublicConfig, tokenizePaymentMethod } from '../payments/tokenizationService.js';
import {
  handlePspWebhookWithIdempotency,
  handleStripeWebhook,
  verifyStripeWebhookSignature,
} from '../payments/webhookService.js';
import { config } from '../config.js';
import { toPublicPaymentIntent, toPublicPaymentMethod } from '../payments/types.js';

const authorizeSchema = z.object({
  paymentMethodId: z.string().uuid(),
  amountCentavos: z.number().int().positive().optional(),
  rideId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const tokenizeSchema = z.object({
  methodType: z.enum(['card', 'debit']),
  providerToken: z.string().min(4).max(256),
  label: z.string().max(80).optional(),
  lastFour: z.string().regex(/^\d{4}$/).optional(),
  brand: z.string().max(32).optional(),
  setDefault: z.boolean().optional(),
});

const refundSchema = z.object({
  amountCentavos: z.number().int().positive().optional(),
  reason: z.string().max(200).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const webhookSchema = z.object({
  event: z.enum(['pix.paid', 'charge.failed']),
  txid: z.string().optional(),
  paymentIntentId: z.string().uuid().optional(),
  idempotencyKey: z.string().optional(),
});

export async function pspWebhookHandler(req: Request, res: Response) {
  const rawBody =
    Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : '';
  const signature = req.header('x-psp-signature') ?? req.header('X-PSP-Signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Assinatura inválida' });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await handlePspWebhookWithIdempotency(parsed.data);
    res.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha no webhook';
    res.status(400).json({ error: message });
  }
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  const rawBody =
    Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : '';
  const signature = req.header('stripe-signature') ?? req.header('Stripe-Signature');

  if (!verifyStripeWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Assinatura Stripe inválida' });
    return;
  }

  try {
    const result = await handleStripeWebhook(rawBody);
    res.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha no webhook Stripe';
    res.status(400).json({ error: message });
  }
}

export const paymentsRouter = Router();

paymentsRouter.get('/config', (_req, res) => {
  res.json(getPaymentPublicConfig());
});

paymentsRouter.post('/webhooks/psp', express.raw({ type: 'application/json' }), pspWebhookHandler);
paymentsRouter.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

paymentsRouter.use(authMiddleware);

paymentsRouter.get('/methods', async (req, res) => {
  const methods = await getUserPaymentMethods(req.user!.id);
  res.json({ methods: methods.map(toPublicPaymentMethod) });
});

paymentsRouter.post('/methods/tokenize', async (req, res) => {
  const parsed = tokenizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const method = await tokenizePaymentMethod({
      userId: req.user!.id,
      ...parsed.data,
    });
    res.status(201).json({ method: toPublicPaymentMethod(method) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao tokenizar cartão';
    res.status(400).json({ error: message });
  }
});

paymentsRouter.post('/intents/authorize', async (req, res) => {
  const parsed = authorizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const { intent, pix } = await authorizeRidePayment({
      userId: req.user!.id,
      paymentMethodId: parsed.data.paymentMethodId,
      amountCentavos: parsed.data.amountCentavos,
      rideId: parsed.data.rideId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    res.status(201).json({ intent: toPublicPaymentIntent(intent, pix) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao autorizar pagamento';
    res.status(400).json({ error: message });
  }
});

paymentsRouter.get('/intents/:id', async (req, res) => {
  const intent = await getIntentById(req.params.id);
  if (!intent || intent.userId !== req.user!.id) {
    res.status(404).json({ error: 'Intent não encontrado' });
    return;
  }
  const pix = await getIntentPix(intent.id);
  res.json({ intent: toPublicPaymentIntent(intent, pix ?? undefined) });
});

paymentsRouter.post('/intents/:id/refund', async (req, res) => {
  const parsed = refundSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const refund = await requestPaymentRefund({
      intentId: req.params.id,
      userId: req.user!.id,
      amountCentavos: parsed.data.amountCentavos,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    res.status(201).json({ refund });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao solicitar estorno';
    res.status(400).json({ error: message });
  }
});

/** Demo: simula confirmação PIX (produção usa webhook PSP). */
paymentsRouter.post('/pix/:txid/simulate-paid', async (req, res) => {
  if (config.pspProvider !== 'demo' && !config.useMemoryDb) {
    res.status(403).json({ error: 'Disponível apenas em modo demo' });
    return;
  }
  try {
    const result = await confirmPixPayment(req.params.txid);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao confirmar PIX';
    res.status(400).json({ error: message });
  }
});
