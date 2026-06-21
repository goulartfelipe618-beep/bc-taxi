import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  getPool,
  getPoolBookings,
  quoteSharedRide,
  toPublicPool,
  toPublicSharedQuote,
} from '../shared/sharedRideService.js';

export const sharedRouter = Router();

const quoteSchema = z.object({
  distanceKm: z.number().positive(),
  durationMin: z.number().positive(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  hasLargeBaggage: z.boolean().optional(),
});

sharedRouter.post('/quote', authMiddleware, async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const quote = await quoteSharedRide({
      ...parsed.data,
      passengerId: req.user!.id,
    });
    res.json(toPublicSharedQuote(quote));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao cotar compartilhado';
    res.status(400).json({ error: message });
  }
});

sharedRouter.get('/pools/:id', authMiddleware, async (req, res) => {
  const pool = await getPool(req.params.id);
  if (!pool) {
    res.status(404).json({ error: 'Pool não encontrado' });
    return;
  }
  const bookings = await getPoolBookings(pool.id);
  res.json(toPublicPool(pool, bookings));
});

sharedRouter.get('/config', async (_req, res) => {
  res.json({
    maxBookingsPerPool: 2,
    maxWaitMin: 3,
    maxDetourMin: 12,
    maxPickupRadiusKm: 2.5,
    maxDropoffRadiusKm: 3.0,
    detourDiscountRange: { min: 0.05, max: 0.18 },
    driverOccupancyBonus: 1.04,
  });
});
