import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  confirmDeliveryProof,
  createDeliveryJob,
  getDeliveryJob,
  listRequesterDeliveries,
  toPublicDeliveryJob,
} from '../delivery/deliveryService.js';

export const deliveriesRouter = Router();

deliveriesRouter.use(authMiddleware);

const createSchema = z.object({
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().optional(),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  dropoffAddress: z.string().optional(),
  packageDescription: z.string().min(3),
  declaredWeightKg: z.number().positive().optional(),
  declaredValueCentavos: z.number().int().min(0).optional(),
  isFragile: z.boolean().optional(),
  isPriority: z.boolean().optional(),
  distanceKm: z.number().positive().optional(),
  durationMin: z.number().positive().optional(),
  paymentMethodId: z.string().uuid().optional(),
});

deliveriesRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await createDeliveryJob({
      requesterId: req.user!.id,
      ...parsed.data,
    });
    res.status(201).json({
      delivery: toPublicDeliveryJob(result.job, result.pins),
      ride: result.ride,
      paymentIntentId: result.paymentIntentId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao criar entrega';
    res.status(400).json({ error: message });
  }
});

deliveriesRouter.get('/', async (req, res) => {
  const jobs = await listRequesterDeliveries(req.user!.id);
  res.json({ deliveries: jobs.map((j) => toPublicDeliveryJob(j)) });
});

deliveriesRouter.get('/:id', async (req, res) => {
  const job = await getDeliveryJob(req.params.id, req.user!.id);
  if (!job) {
    res.status(404).json({ error: 'Entrega não encontrada' });
    return;
  }
  res.json({ delivery: toPublicDeliveryJob(job) });
});

const proofSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

deliveriesRouter.post('/:id/proof/pickup', async (req, res) => {
  const parsed = proofSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const job = await confirmDeliveryProof({
      jobId: req.params.id,
      actorUserId: req.user!.id,
      proofType: 'pickup_pin',
      pin: parsed.data.pin,
    });
    res.json({ delivery: toPublicDeliveryJob(job) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha na confirmação';
    res.status(400).json({ error: message });
  }
});

deliveriesRouter.post('/:id/proof/dropoff', async (req, res) => {
  const parsed = proofSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const job = await confirmDeliveryProof({
      jobId: req.params.id,
      actorUserId: req.user!.id,
      proofType: 'dropoff_pin',
      pin: parsed.data.pin,
    });
    res.json({ delivery: toPublicDeliveryJob(job) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha na confirmação';
    res.status(400).json({ error: message });
  }
});
