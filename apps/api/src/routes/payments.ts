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
import { confirmPixPayment, handlePspWebhook, verifyWebhookSignature } from '../payments/pixService.js';
import { config } from '../config.js';
import { toPublicPaymentIntent, toPublicPaymentMethod } from '../payments/types.js';

const authorizeSchema = z.object({
  paymentMethodId: z.string().uuid(),
  amountCentavos: z.number().int().positive().optional(),
  rideId: z.string().uuid().optional(),
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
    const result = await handlePspWebhook(parsed.data);
    res.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha no webhook';
    res.status(400).json({ error: message });
  }
}

export const paymentsRouter = Router();

paymentsRouter.post('/webhooks/psp', express.raw({ type: 'application/json' }), pspWebhookHandler);

paymentsRouter.use(authMiddleware);

paymentsRouter.get('/methods', async (req, res) => {
  const methods = await getUserPaymentMethods(req.user!.id);
  res.json({ methods: methods.map(toPublicPaymentMethod) });
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
