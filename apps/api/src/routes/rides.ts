import { Router } from 'express';
import { z } from 'zod';
import { getCategory } from '../domain/rideCategories.js';
import { isCashPaymentAllowed, isPassengerCategoryAllowed, isPassengerPrepayRequired } from '../domain/reputation.js';
import type { RideCategoryCode } from '../domain/types.js';
import { quoteWithDynamicPricing } from '../pricing/dynamicPricingService.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  acceptOffer,
  cancelRide,
  createRideRequest,
  driverCancelRide,
  getDriverPendingOffers,
  getRide,
  rejectOffer,
  startMatching,
} from '../match/matchService.js';
import type { RideRecord, RideStatus } from '../match/types.js';
import { DEMO_PAYMENT_METHOD_IDS } from '../payments/paymentStore.js';
import { assertUserNotBlocked, checkGpsIntegrity, recordFraudSignal } from '../fraud/fraudService.js';
import { toPublicPaymentIntent } from '../payments/types.js';
import {
  attachIntentToRide,
  authorizeRidePayment,
  getIntentPix,
} from '../payments/paymentService.js';
import { evaluateRideRisk } from '../fraud/riskEngine.js';
import {
  driverCompleteRide,
  driverMarkArrived,
  getRideActiveRoute,
  getRideVerification,
  recalculateRideRoute,
  reissueStartCodesForRide,
  toPublicActiveRoute,
  verifyStartCode,
} from '../ride/lifecycleService.js';
import { submitRideReview } from '../reviews/reviewService.js';
import { getPassengerReputation } from '../reviews/reputationService.js';
import {
  getRideTracking,
  resolveDriverActiveRideId,
  toPublicTracking,
} from '../ride/rideTrackingService.js';
import { memoryMatchStore, setDriverOnlinePg, useMemory } from '../stores/memoryMatchStore.js';
import { getDriverCompliance, toPublicCompliance } from '../fleet/complianceService.js';
import {
  ensureDriverFleetBootstrap,
  syncDriverProfileFromFleet,
} from '../fleet/driverProfileSync.js';
import {
  endOnlineSession,
  startOnlineSession,
  updateDriverLocation,
} from '../driver/driverLocationService.js';
import { validatePromoCode, recordCouponRedemption } from '../promotions/couponService.js';
import { publicPromosBlockedForCorporate } from '../corporate/corporateService.js';

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
  couponCode: z.string().optional(),
});

const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const reviewSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  tags: z.array(z.string()).max(8).optional(),
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

  const weather = await getWeatherAtPoint(parsed.data.pickupLat, parsed.data.pickupLng);
  if (isCategoryBlockedByWeather(parsed.data.categoryCode, weather.weatherState)) {
    res.status(409).json({
      error: 'Categoria Moto indisponível devido às condições climáticas atuais',
      weather: weather.weatherState,
    });
    return;
  }

  const passengerRepScore = await getPassengerReputation(req.user!.id);
  if (!isPassengerCategoryAllowed(passengerRepScore, parsed.data.categoryCode)) {
    res.status(403).json({
      error: 'Reputação insuficiente para esta categoria',
      reputationScore: passengerRepScore,
    });
    return;
  }

  const paymentMethodId = parsed.data.paymentMethodId ?? DEMO_PAYMENT_METHOD_IDS.pix;
  const { resolveMethodType, getPaymentMethod } = await import('../payments/paymentStore.js');
  const methodType =
    (await getPaymentMethod(req.user!.id, paymentMethodId))?.methodType ??
    resolveMethodType(paymentMethodId) ??
    'pix';

  if (methodType === 'cash' && !isCashPaymentAllowed(passengerRepScore)) {
    res.status(403).json({ error: 'Pagamento em dinheiro não permitido para sua reputação atual' });
    return;
  }
  if (isPassengerPrepayRequired(passengerRepScore) && methodType === 'cash') {
    res.status(403).json({ error: 'Pré-pagamento obrigatório — use PIX ou cartão' });
    return;
  }

  let estimatedFareCentavos: number | undefined;
  if (parsed.data.distanceKm && parsed.data.durationMin) {
    const quote = await quoteWithDynamicPricing(
      parsed.data.categoryCode as RideCategoryCode,
      parsed.data.distanceKm,
      parsed.data.durationMin,
      { lat: parsed.data.pickupLat, lng: parsed.data.pickupLng },
    );
    estimatedFareCentavos = quote.passengerFareCentavos;
  }

  let discountCentavos = 0;
  let promoCodeApplied: string | undefined;
  let fareBeforeCoupon = estimatedFareCentavos;
  let promoRecord: Awaited<ReturnType<typeof validatePromoCode>>['promo'];

  if (parsed.data.couponCode && estimatedFareCentavos && estimatedFareCentavos > 0) {
    if (parsed.data.isCorporate || (await publicPromosBlockedForCorporate(req.user!.id))) {
      res.status(400).json({ error: 'Cupons públicos não aplicáveis a viagens corporativas' });
      return;
    }
    const coupon = await validatePromoCode({
      code: parsed.data.couponCode,
      userId: req.user!.id,
      categoryCode: parsed.data.categoryCode,
      fareCentavos: estimatedFareCentavos,
    });
    if (!coupon.valid) {
      res.status(400).json({ error: coupon.reason ?? 'Cupom inválido' });
      return;
    }
    promoRecord = coupon.promo;
    discountCentavos = coupon.discountCentavos;
    estimatedFareCentavos = coupon.fareAfterCentavos;
    promoCodeApplied = parsed.data.couponCode.toUpperCase();
  }

  const paymentMethodIdFinal = paymentMethodId;
  let paymentIntentId: string | undefined;
  let paymentPayload: ReturnType<typeof toPublicPaymentIntent> | undefined;

  const deviceId = req.header('x-device-id') ?? undefined;
  const risk = await evaluateRideRisk({
    userId: req.user!.id,
    deviceId,
    paymentMethodType: methodType,
    amountCentavos: estimatedFareCentavos,
  });
  if (risk.decision === 'block') {
    res.status(403).json({ error: 'Solicitação bloqueada por análise de risco', risk });
    return;
  }

  try {
    const { intent, pix } = await authorizeRidePayment({
      userId: req.user!.id,
      paymentMethodId: paymentMethodIdFinal,
      amountCentavos: estimatedFareCentavos ?? 5000,
    });
    paymentIntentId = intent.id;
    paymentPayload = toPublicPaymentIntent(intent, pix);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao autorizar pagamento';
    res.status(402).json({ error: message });
    return;
  }

  try {
    await assertUserNotBlocked(req.user!.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Conta restrita';
    res.status(403).json({ error: message });
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

  if (promoRecord && discountCentavos > 0) {
    await recordCouponRedemption({
      promo: promoRecord,
      userId: req.user!.id,
      fareBeforeCentavos: fareBeforeCoupon ?? estimatedFareCentavos ?? 0,
      discountCentavos,
      rideId: ride.id,
    });
  }

  const passengerRep = await getPassengerReputation(req.user!.id);
  const matched = await startMatching(ride.id, passengerRep);
  const finalRide = matched ?? ride;
  res.status(201).json({
    ride: toPublicRide(finalRide),
    paymentIntentId,
    payment: paymentPayload,
    risk,
    discountCentavos: discountCentavos || undefined,
    promoCode: promoCodeApplied,
  });
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
  const tracking = await getRideTracking(ride);
  let startCodes: { yours: string; partner: string } | undefined;
  let payment: ReturnType<typeof toPublicPaymentIntent> | undefined;
  if (ride.paymentIntentId) {
    const { getIntentById } = await import('../payments/paymentService.js');
    const intent = await getIntentById(ride.paymentIntentId);
    if (intent) {
      const pix = await getIntentPix(intent.id);
      payment = toPublicPaymentIntent(intent, pix ?? undefined);
    }
  }
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
  res.json({
    ride: toPublicRide(ride),
    verification,
    ...(payment ? { payment } : {}),
    ...(tracking ? { tracking: toPublicTracking(tracking) } : {}),
    ...(startCodes ? { startCodes } : {}),
  });
});

ridesRouter.get('/:id/route', async (req, res) => {
  const ride = await getRide(req.params.id);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const route = await getRideActiveRoute(ride.id);
  if (!route) {
    res.status(404).json({ error: 'Rota ativa não encontrada para esta corrida' });
    return;
  }
  res.json({ route: toPublicActiveRoute(route) });
});

ridesRouter.post('/:id/route/recalculate', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat e lng são obrigatórios' });
    return;
  }
  try {
    const route = await recalculateRideRoute(req.params.id, req.user!.id, lat, lng, req.body?.reasonCode);
    if (!route) {
      res.status(404).json({ error: 'Rota ativa não encontrada' });
      return;
    }
    res.json({ route: toPublicActiveRoute(route) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao recalcular rota';
    res.status(400).json({ error: message });
  }
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

ridesRouter.post('/:id/driver-cancel', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  const ride = await driverCancelRide(req.params.id, req.user!.id, req.body?.reason);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada ou não cancelável pelo motorista' });
    return;
  }

  void recordFraudSignal({
    userId: req.user!.id,
    rideId: ride.id,
    signalType: 'RAPID_CANCEL',
    metadata: { cancelledBy: 'driver' },
  }).catch(() => undefined);

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
      tags: parsed.data.tags,
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

  await ensureDriverFleetBootstrap(req.user!.id);

  if (parsed.data.online) {
    const compliance = await syncDriverProfileFromFleet(req.user!.id);
    if (!compliance.canOperate) {
      res.status(403).json({
        error: 'Documentação incompleta para operar',
        compliance: toPublicCompliance(compliance),
      });
      return;
    }
  }

  if (useMemory()) {
    const prev = await memoryMatchStore.getDriver(req.user!.id);
    if (parsed.data.lat != null && parsed.data.lng != null) {
      void checkGpsIntegrity({
        driverId: req.user!.id,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        prevLat: prev?.lat,
        prevLng: prev?.lng,
        prevAt: prev?.locationUpdatedAt,
      });
    }
    const compliance = await syncDriverProfileFromFleet(req.user!.id);
    const driver = await memoryMatchStore.setDriverOnline(
      req.user!.id,
      parsed.data.online,
      parsed.data.lat,
      parsed.data.lng,
    );
    driver.enabledCategories = compliance.enabledCategories;
    driver.wheelchairAccessible = compliance.activeVehicle?.wheelchairAccessible ?? false;
    driver.petReady = compliance.activeVehicle?.petReady ?? false;
    driver.comfortApproved = compliance.activeVehicle?.comfortApproved ?? false;
    await memoryMatchStore.upsertDriver(driver);
    if (parsed.data.online) {
      await startOnlineSession(req.user!.id, parsed.data.lat, parsed.data.lng);
    } else {
      await endOnlineSession(req.user!.id, 'offline');
    }
    res.json({ ok: true, driver, compliance: toPublicCompliance(compliance) });
    return;
  }

  const compliance = await getDriverCompliance(req.user!.id);
  await setDriverOnlinePg(
    req.user!.id,
    parsed.data.online,
    parsed.data.lat,
    parsed.data.lng,
    parsed.data.online ? compliance.enabledCategories : undefined,
  );
  if (parsed.data.online) {
    await startOnlineSession(req.user!.id, parsed.data.lat, parsed.data.lng);
  } else {
    await endOnlineSession(req.user!.id, 'offline');
  }
  res.json({ ok: true, compliance: toPublicCompliance(compliance) });
});

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  heading: z.number().optional(),
  rideId: z.string().uuid().optional(),
});

driverRouter.post('/location', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }

  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const online = await isDriverOnlineForLocation(req.user!.id);
  if (!online) {
    res.status(409).json({ error: 'Motorista precisa estar online para enviar localização' });
    return;
  }

  const result = await updateDriverLocation({
    driverId: req.user!.id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    heading: parsed.data.heading,
    rideId: parsed.data.rideId,
  });
  res.json(result);
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
