import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  cancelScheduledRide,
  createScheduledRide,
  listPassengerSchedules,
  toPublicScheduledRide,
} from '../scheduling/scheduleService.js';
import { quoteWithEngine } from '../pricing/pricingEngineService.js';
import type { RideCategoryCode } from '../domain/types.js';

export const schedulingRouter = Router();

schedulingRouter.use(authMiddleware);

const createSchema = z.object({
  categoryCode: z.string(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().optional(),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  dropoffAddress: z.string().optional(),
  scheduledAt: z.string().datetime(),
  paymentMethodId: z.string().uuid().optional(),
  promoCode: z.string().optional(),
  distanceKm: z.number().positive().optional(),
  durationMin: z.number().positive().optional(),
  dispatchLeadMinutes: z.number().int().min(5).max(120).optional(),
});

schedulingRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  let estimatedFareCentavos: number | undefined;
  if (parsed.data.distanceKm && parsed.data.durationMin) {
    const quote = await quoteWithEngine(
      parsed.data.categoryCode as RideCategoryCode,
      parsed.data.distanceKm,
      parsed.data.durationMin,
      { lat: parsed.data.pickupLat, lng: parsed.data.pickupLng },
    );
    estimatedFareCentavos = quote.passengerFareCentavos;
  }

  try {
    const schedule = await createScheduledRide({
      passengerId: req.user!.id,
      categoryCode: parsed.data.categoryCode,
      pickupLat: parsed.data.pickupLat,
      pickupLng: parsed.data.pickupLng,
      pickupAddress: parsed.data.pickupAddress,
      dropoffLat: parsed.data.dropoffLat,
      dropoffLng: parsed.data.dropoffLng,
      dropoffAddress: parsed.data.dropoffAddress,
      scheduledAt: new Date(parsed.data.scheduledAt),
      paymentMethodId: parsed.data.paymentMethodId,
      estimatedFareCentavos,
      promoCode: parsed.data.promoCode,
      dispatchLeadMinutes: parsed.data.dispatchLeadMinutes,
    });
    res.status(201).json({ schedule: toPublicScheduledRide(schedule) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao agendar';
    res.status(400).json({ error: message });
  }
});

schedulingRouter.get('/', async (req, res) => {
  const schedules = await listPassengerSchedules(req.user!.id);
  res.json({ schedules: schedules.map(toPublicScheduledRide) });
});

schedulingRouter.post('/:id/cancel', async (req, res) => {
  try {
    const schedule = await cancelScheduledRide(req.params.id, req.user!.id, req.body?.reason);
    res.json({ schedule: toPublicScheduledRide(schedule) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao cancelar';
    res.status(400).json({ error: message });
  }
});
