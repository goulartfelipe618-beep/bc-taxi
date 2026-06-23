import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  cancelPassengerScheduleProduction,
  createPassengerScheduleProduction,
  getPassengerScheduleDashboard,
  getPassengerScheduleDetail,
  reschedulePassengerSchedule,
} from '../passenger/schedulingProductionService.js';
import { quoteWithEngine } from '../pricing/pricingEngineService.js';
import type { RideCategoryCode } from '../domain/types.js';

export const passengerSchedulingRouter = Router();

passengerSchedulingRouter.use(authMiddleware);

passengerSchedulingRouter.use((req, res, next) => {
  if (req.user?.role !== 'passenger') {
    res.status(403).json({ error: 'Disponível apenas para passageiros' });
    return;
  }
  next();
});

passengerSchedulingRouter.get('/dashboard', async (req, res) => {
  const dashboard = await getPassengerScheduleDashboard(req.user!.id);
  res.json(dashboard);
});

passengerSchedulingRouter.get('/:id', async (req, res) => {
  try {
    const schedule = await getPassengerScheduleDetail(req.user!.id, req.params.id);
    res.json({ schedule });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao carregar agendamento';
    res.status(msg.includes('não encontrado') ? 404 : 400).json({ error: msg });
  }
});

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

passengerSchedulingRouter.post('/', async (req, res) => {
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
    const schedule = await createPassengerScheduleProduction({
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
    res.status(201).json({ schedule });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao agendar';
    res.status(400).json({ error: message });
  }
});

const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

passengerSchedulingRouter.patch('/:id/reschedule', async (req, res) => {
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const schedule = await reschedulePassengerSchedule(
      req.user!.id,
      req.params.id,
      new Date(parsed.scheduledAt),
    );
    res.json({ schedule });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao reagendar';
    res.status(400).json({ error: message });
  }
});

passengerSchedulingRouter.post('/:id/cancel', async (req, res) => {
  try {
    const schedule = await cancelPassengerScheduleProduction(
      req.user!.id,
      req.params.id,
      req.body?.reason,
    );
    res.json({ schedule });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao cancelar';
    res.status(400).json({ error: message });
  }
});
