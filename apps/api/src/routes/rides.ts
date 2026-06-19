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
import type { RideRecord, RideStatus } from '../match/types.js';
import { DEMO_PAYMENT_METHOD_IDS } from '../payments/paymentStore.js';
import {
  attachIntentToRide,
  authorizeRidePayment,
  cancelRidePayment,
} from '../payments/paymentService.js';
import {
  driverCompleteRide,
  driverMarkArrived,
  getRideVerification,
  reissueStartCodesForRide,
  verifyStartCode,
} from '../ride/lifecycleService.js';
import { submitRideReview } from '../reviews/reviewService.js';
import { getPlainCodesForTest } from '../ride/codeStore.js';
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
  paymentMethodId: z.string().uuid().optional(),
});

const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const reviewSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export function statusLabel(status: RideStatus): string {
  const labels: Record<RideStatus, string> = {
    REQUESTED: 'Solicitada',
    OFFERING: 'Buscando motorista',
    DRIVER_ASSIGNED: 'Motorista a caminho',
    DRIVER_ARRIVED: 'Motorista no local',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
    NO_DRIVERS: 'Sem motoristas',
  };
  return labels[status] ?? status;
}

function toPublicRide(ride: RideRecord) {
  return {
    ...ride,
    statusLabel: statusLabel(ride.status),
  };
}

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

  const paymentMethodId = parsed.data.paymentMethodId ?? DEMO_PAYMENT_METHOD_IDS.pix;
  let paymentIntentId: string | undefined;

  try {
    const intent = await authorizeRidePayment({
      userId: req.user!.id,
      paymentMethodId,
      amountCentavos: estimatedFareCentavos ?? 5000,
    });
    paymentIntentId = intent.id;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao autorizar pagamento';
    res.status(402).json({ error: message });
    return;
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

  if (paymentIntentId) {
    await attachIntentToRide(ride.id, paymentIntentId);
    if (useMemory()) {
      await memoryMatchStore.updateRideLifecycle(ride.id, { paymentIntentId });
    }
  }

  const matched = await startMatching(ride.id);
  const finalRide = matched ?? ride;
  res.status(201).json({ ride: toPublicRide(finalRide), paymentIntentId });
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
  const verification = await getRideVerification(ride.id);
  let startCodes: { yours: string; partner: string } | undefined;
  if (useMemory()) {
    const plain = getPlainCodesForTest(ride.id);
    if (plain) {
      if (ride.passengerId === req.user!.id) {
        startCodes = { yours: plain.passenger, partner: plain.driver };
      } else if (ride.driverId === req.user!.id) {
        startCodes = { yours: plain.driver, partner: plain.passenger };
      }
    }
  }
  res.json({ ride: toPublicRide(ride), verification, ...(startCodes ? { startCodes } : {}) });
});

ridesRouter.post('/:id/cancel', async (req, res) => {
  const ride = await cancelRide(req.params.id, req.user!.id, req.body?.reason);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada ou não cancelável' });
    return;
  }
  await cancelRidePayment(ride.id);
  res.json({ ride: toPublicRide(ride) });
});

ridesRouter.post('/:id/arrived', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  try {
    const result = await driverMarkArrived(req.params.id, req.user!.id);
    res.json({
      ride: toPublicRide(result.ride),
      verification: result.verification,
      ...(result.codes ? { codes: result.codes } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao registrar chegada';
    res.status(409).json({ error: message });
  }
});

ridesRouter.post('/:id/verify-passenger-code', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas validam código do passageiro' });
    return;
  }

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await verifyStartCode(req.params.id, req.user!.id, 'passenger', parsed.data.code);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }

  const ride = await getRide(req.params.id);
  res.json({ ...result, ride: ride ? toPublicRide(ride) : undefined });
});

ridesRouter.post('/:id/verify-driver-code', async (req, res) => {
  if (req.user!.role !== 'passenger') {
    res.status(403).json({ error: 'Somente passageiros validam código do motorista' });
    return;
  }

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await verifyStartCode(req.params.id, req.user!.id, 'driver', parsed.data.code);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }

  const ride = await getRide(req.params.id);
  res.json({ ...result, ride: ride ? toPublicRide(ride) : undefined });
});

ridesRouter.post('/:id/reissue-codes', async (req, res) => {
  try {
    const result = await reissueStartCodesForRide(req.params.id, req.user!.id);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao reemitir códigos';
    res.status(409).json({ error: message });
  }
});

ridesRouter.post('/:id/review', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const role = req.user!.role as 'passenger' | 'driver';
  if (role !== 'passenger' && role !== 'driver') {
    res.status(403).json({ error: 'Papel inválido para avaliação' });
    return;
  }

  try {
    const review = await submitRideReview({
      rideId: req.params.id,
      reviewerUserId: req.user!.id,
      reviewerRole: role,
      stars: parsed.data.stars,
      comment: parsed.data.comment,
    });
    res.status(201).json({ review });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao enviar avaliação';
    const status = message.includes('já enviada') ? 409 : message.includes('não encontrada') ? 404 : 409;
    res.status(status).json({ error: message });
  }
});

ridesRouter.post('/:id/complete', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  try {
    const ride = await driverCompleteRide(req.params.id, req.user!.id);
    res.json({ ride: toPublicRide(ride) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao concluir corrida';
    res.status(409).json({ error: message });
  }
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
      return { offer: o, ride: ride ? toPublicRide(ride) : null };
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
  res.json({ ride: toPublicRide(ride) });
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
