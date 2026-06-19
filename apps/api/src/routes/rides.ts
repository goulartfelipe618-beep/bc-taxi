import { Router } from 'express';
import { z } from 'zod';
import { getCategory } from '../domain/rideCategories.js';
import { computeQuote } from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  acceptOffer,
  cancelRide,
  createRideRequest,
  getDriverPendingOffers,
  getRide,
  rejectOffer,
  startMatching,
} from '../match/matchService.js';
import { memoryMatchStore, setDriverOnlinePg, useMemory } from '../stores/memoryMatchStore.js';

const createRideSchema = z.object({
  categoryCode: z.string(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().optional(),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  dropoffAddress: z.string().optional(),
  passengerCount: z.number().int().min(1).max(24).optional(),
  isCorporate: z.boolean().optional(),
  isShared: z.boolean().optional(),
  hasPet: z.boolean().optional(),
  needsWheelchair: z.boolean().optional(),
  distanceKm: z.number().positive().optional(),
  durationMin: z.number().positive().optional(),
});

export const ridesRouter = Router();

ridesRouter.use(authMiddleware);

ridesRouter.post('/', async (req, res) => {
  if (req.user!.role !== 'passenger') {
    res.status(403).json({ error: 'Somente passageiros podem solicitar corridas' });
    return;
  }

  const parsed = createRideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const category = getCategory(parsed.data.categoryCode as RideCategoryCode);
  if (!category || !category.isPassengerRide) {
    res.status(400).json({ error: 'Categoria inválida para corrida de passageiro' });
    return;
  }

  let estimatedFareCentavos: number | undefined;
  if (parsed.data.distanceKm && parsed.data.durationMin) {
    const quote = computeQuote({
      categoryCode: parsed.data.categoryCode as RideCategoryCode,
      distanceKm: parsed.data.distanceKm,
      durationMin: parsed.data.durationMin,
    });
    estimatedFareCentavos = quote.passengerFareCentavos;
  }

  const ride = await createRideRequest({
    passengerId: req.user!.id,
    categoryCode: parsed.data.categoryCode,
    pickupLat: parsed.data.pickupLat,
    pickupLng: parsed.data.pickupLng,
    pickupAddress: parsed.data.pickupAddress,
    dropoffLat: parsed.data.dropoffLat,
    dropoffLng: parsed.data.dropoffLng,
    dropoffAddress: parsed.data.dropoffAddress,
    passengerCount: parsed.data.passengerCount,
    isCorporate: parsed.data.isCorporate,
    isShared: parsed.data.isShared,
    hasPet: parsed.data.hasPet,
    needsWheelchair: parsed.data.needsWheelchair,
    estimatedFareCentavos,
  });

  const matched = await startMatching(ride.id);
  res.status(201).json({ ride: matched ?? ride });
});

ridesRouter.get('/:id', async (req, res) => {
  const ride = await getRide(req.params.id);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  res.json({ ride });
});

ridesRouter.post('/:id/cancel', async (req, res) => {
  const ride = await cancelRide(req.params.id, req.user!.id, req.body?.reason);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada ou não cancelável' });
    return;
  }
  res.json({ ride });
});

export const driverRouter = Router();

driverRouter.use(authMiddleware);

const statusSchema = z.object({
  online: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  enabledCategories: z.array(z.string()).optional(),
});

driverRouter.post('/status', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (useMemory()) {
    const driver = await memoryMatchStore.setDriverOnline(
      req.user!.id,
      parsed.data.online,
      parsed.data.lat,
      parsed.data.lng,
    );
    if (parsed.data.enabledCategories) {
      driver.enabledCategories = parsed.data.enabledCategories;
      await memoryMatchStore.upsertDriver(driver);
    }
    res.json({ driver });
    return;
  }

  await setDriverOnlinePg(req.user!.id, parsed.data.online, parsed.data.lat, parsed.data.lng);
  res.json({ ok: true });
});

driverRouter.get('/offers', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  const offers = await getDriverPendingOffers(req.user!.id);
  const enriched = await Promise.all(
    offers.map(async (o) => {
      const ride = await getRide(o.rideId);
      return { offer: o, ride };
    }),
  );
  res.json({ offers: enriched });
});

driverRouter.post('/offers/:offerId/accept', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  const ride = await acceptOffer(req.params.offerId, req.user!.id);
  if (!ride) {
    res.status(409).json({ error: 'Oferta indisponível ou expirada' });
    return;
  }
  res.json({ ride });
});

driverRouter.post('/offers/:offerId/reject', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  const ok = await rejectOffer(req.params.offerId, req.user!.id);
  if (!ok) {
    res.status(409).json({ error: 'Oferta indisponível' });
    return;
  }
  res.json({ ok: true });
});
