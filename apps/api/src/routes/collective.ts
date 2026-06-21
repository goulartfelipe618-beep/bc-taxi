import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  bookCollectiveTransport,
  getCollectiveBooking,
  listCollectiveBookingsForPassenger,
  quoteCollectiveTransport,
  toPublicCollectiveBooking,
  toPublicCollectiveQuote,
} from '../collective/collectiveTransportService.js';

export const collectiveRouter = Router();

const categoryEnum = z.enum(['van', 'micro_onibus']);

const quoteSchema = z.object({
  categoryCode: categoryEnum,
  distanceKm: z.number().positive(),
  durationMin: z.number().positive(),
  passengerCount: z.number().int().positive(),
  baggageCount: z.number().int().min(0).optional(),
  isAirportShuttle: z.boolean().optional(),
  isLargeGroup: z.boolean().optional(),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
});

const bookSchema = quoteSchema.extend({
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().max(200).optional(),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  dropoffAddress: z.string().max(200).optional(),
  scheduledAt: z.string().datetime(),
  groupLabel: z.string().max(80).optional(),
  pickupNotes: z.string().max(300).optional(),
  paymentMethodId: z.string().uuid().optional(),
});

collectiveRouter.get('/config', (_req, res) => {
  res.json({
    categories: ['van', 'micro_onibus'],
    van: { maxPassengers: 12, maxBaggagePerPassenger: 1, minScheduleLeadMin: 30 },
    micro_onibus: { maxPassengers: 24, minScheduleLeadMin: 120, prefersReservation: true },
    multipliers: {
      van: { group_coordination: 1.06, airport_shuttle: 1.1 },
      micro_onibus: { reservation: 1.08, large_group: 1.12 },
    },
  });
});

collectiveRouter.post('/quote', authMiddleware, async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const quote = await quoteCollectiveTransport(parsed.data);
    res.json(toPublicCollectiveQuote(quote));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao cotar transporte coletivo';
    res.status(400).json({ error: message });
  }
});

collectiveRouter.post('/bookings', authMiddleware, async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await bookCollectiveTransport({
      passengerId: req.user!.id,
      ...parsed.data,
      scheduledAt: new Date(parsed.data.scheduledAt),
    });
    res.status(201).json({
      booking: toPublicCollectiveBooking(result.booking),
      scheduleId: result.scheduleId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao reservar transporte coletivo';
    res.status(400).json({ error: message });
  }
});

collectiveRouter.get('/bookings', authMiddleware, async (req, res) => {
  const bookings = await listCollectiveBookingsForPassenger(req.user!.id);
  res.json({ bookings: bookings.map(toPublicCollectiveBooking) });
});

collectiveRouter.get('/bookings/:id', authMiddleware, async (req, res) => {
  const booking = await getCollectiveBooking(req.params.id);
  if (!booking || booking.passengerId !== req.user!.id) {
    res.status(404).json({ error: 'Reserva não encontrada' });
    return;
  }
  res.json({ booking: toPublicCollectiveBooking(booking) });
});
