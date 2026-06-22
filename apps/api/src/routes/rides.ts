import { Router } from 'express';
import { z } from 'zod';
import { getCategory } from '../domain/rideCategories.js';
import { isPassengerCategoryAllowed, isPassengerPrepayRequired, getTier } from '../domain/reputation.js';
import {
  isCashAllowedByPolicy,
  isPremiumCategoryAllowedByPolicy,
  assessPassengerCancellationPolicy,
} from '../config/policyEnforcementService.js';
import { resolveServiceRegionIdAtPoint } from '../region/serviceRegionGeoService.js';
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
  settleCancelPolicyFee,
  cancelRidePayment,
} from '../payments/paymentService.js';
import { evaluateRideRisk } from '../fraud/riskEngine.js';
import {
  captureRideOperationalConfigSnapshot,
  isPaymentMethodAllowed,
} from '../config/operationalParamsService.js';
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
  getRideTrackingProduction,
  listRideTrackingSnapshots,
  toPublicRideTrackingProduction,
} from '../ride/rideTrackingProductionService.js';
import {
  getRideLifecycleProductionWithDriverCoords,
  recordLifecycleProductionEvent,
  toPublicRideLifecycleProduction,
} from '../ride/rideLifecycleProductionService.js';
import { resolveDriverActiveRideId } from '../ride/rideTrackingService.js';
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
import { captureRideGovernanceSnapshot, getRideGovernanceTrail } from '../governance/governanceService.js';
import { captureRideAirportSnapshot, resolveAirportContext, toPublicContext } from '../airport/airportService.js';
import { getRouteQuote } from '../route/routeStore.js';
import { toPublicRouteQuote } from '../route/routeService.js';
import { pool } from '../db.js';
import { logRideDecision } from '../observability/decisionLogService.js';
import { recordRideMetric } from '../observability/opsMetricsService.js';
import { validatePromoCode, recordCouponRedemption } from '../promotions/couponService.js';
import { publicPromosBlockedForCorporate } from '../corporate/corporateService.js';
import {
  dispatchReadyPools,
  getPoolBookings,
  quoteSharedRide,
  registerSharedBooking,
  toPublicPool,
  toPublicSharedQuote,
} from '../shared/sharedRideService.js';
import {
  registerAccessibilityRequest,
  toPublicAccessibilityRequest,
  validateAccessibilityBooking,
} from '../accessibility/accessibilityService.js';

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
  hasLargeBaggage: z.boolean().optional(),
  distanceKm: z.number().positive().optional(),
  durationMin: z.number().positive().optional(),
  paymentMethodId: z.string().uuid().optional(),
  couponCode: z.string().optional(),
  routeRequestId: z.string().uuid().optional(),
  routeStrategy: z.enum(['fastest', 'shortest', 'economical', 'less_traffic']).optional(),
  accessibilityNeedCode: z
    .enum(['wheelchair', 'walker', 'mobility_aid', 'visual_assistance', 'hearing_assistance'])
    .optional(),
  assistiveDeviceCount: z.number().int().min(0).max(3).optional(),
  accessibilityNotes: z.string().max(300).optional(),
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

  const { resolveRegionContextAtPoint } = await import('../region/serviceRegionGeoService.js');
  const regionCtx = await resolveRegionContextAtPoint(parsed.data.pickupLat, parsed.data.pickupLng);
  if (!regionCtx.inCoverage) {
    res.status(400).json({ error: 'Origem fora da área de cobertura operacional' });
    return;
  }
  if (!regionCtx.enabledCategoryCodes.includes(parsed.data.categoryCode)) {
    res.status(400).json({
      error: 'Categoria indisponível nesta praça',
      serviceRegionId: regionCtx.serviceRegion?.id,
      enabledCategories: regionCtx.enabledCategoryCodes,
    });
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
  const passengerTier = getTier(passengerRepScore);
  if (!isPassengerCategoryAllowed(passengerRepScore, parsed.data.categoryCode)) {
    res.status(403).json({
      error: 'Reputação insuficiente para esta categoria',
      reputationScore: passengerRepScore,
    });
    return;
  }

  const accessibilityCheck = await validateAccessibilityBooking({
    categoryCode: parsed.data.categoryCode,
    accessibilityNeedCode: parsed.data.accessibilityNeedCode,
    needsWheelchair: parsed.data.needsWheelchair,
    assistiveDeviceCount: parsed.data.assistiveDeviceCount,
  });
  if (!accessibilityCheck.ok) {
    res.status(400).json({ error: accessibilityCheck.reason });
    return;
  }

  const paymentMethodId = parsed.data.paymentMethodId ?? DEMO_PAYMENT_METHOD_IDS.pix;
  const { resolveMethodType, getPaymentMethod } = await import('../payments/paymentStore.js');
  const paymentMethod = await getPaymentMethod(req.user!.id, paymentMethodId);
  const methodType =
    paymentMethod?.methodType ?? resolveMethodType(paymentMethodId) ?? 'pix';
  const deviceId = req.header('x-device-id') ?? undefined;
  const { resolvePaymentFingerprint } = await import('../promotions/couponAbuseService.js');
  const paymentFingerprint = await resolvePaymentFingerprint(req.user!.id, paymentMethodId);

  const serviceRegionId =
    (await resolveServiceRegionIdAtPoint(parsed.data.pickupLat, parsed.data.pickupLng)) ?? undefined;

  if (methodType === 'cash' && !(await isCashAllowedByPolicy(passengerRepScore, parsed.data.categoryCode, serviceRegionId))) {
    res.status(403).json({ error: 'Pagamento em dinheiro não permitido para sua reputação atual' });
    return;
  }

  const categoryMeta = getCategory(parsed.data.categoryCode);
  if (categoryMeta?.isPremium) {
    const premiumCheck = await isPremiumCategoryAllowedByPolicy({
      reputationScore: passengerRepScore,
      categoryCode: parsed.data.categoryCode,
      regionId: serviceRegionId,
    });
    if (!premiumCheck.allowed) {
      res.status(403).json({
        error: 'Reputação ou segmento insuficiente para categoria premium',
        reason: premiumCheck.reason,
      });
      return;
    }
  }
  if (!(await isPaymentMethodAllowed(methodType, passengerTier))) {
    res.status(403).json({ error: 'Forma de pagamento não habilitada para seu segmento' });
    return;
  }
  if (isPassengerPrepayRequired(passengerRepScore) && methodType === 'cash') {
    res.status(403).json({ error: 'Pré-pagamento obrigatório — use PIX ou cartão' });
    return;
  }

  let estimatedFareCentavos: number | undefined;
  let quoteResult: Awaited<ReturnType<typeof quoteWithDynamicPricing>> | undefined;
  let sharedQuoteResult: Awaited<ReturnType<typeof quoteSharedRide>> | undefined;
  let routeQuotePayload: ReturnType<typeof toPublicRouteQuote> | undefined;

  const isSharedRide =
    parsed.data.categoryCode === 'compartilhado' || parsed.data.isShared === true;

  if (parsed.data.routeRequestId) {
    const routeQuote = await getRouteQuote(parsed.data.routeRequestId);
    if (!routeQuote) {
      res.status(400).json({ error: 'Cotação de rota inválida ou expirada' });
      return;
    }
    const strategy = parsed.data.routeStrategy ?? routeQuote.selectedStrategy;
    const alt = routeQuote.alternatives.find((a) => a.strategy === strategy) ?? routeQuote.recommended;
    parsed.data.distanceKm = parsed.data.distanceKm ?? alt.distanceM / 1000;
    parsed.data.durationMin = parsed.data.durationMin ?? alt.etaSeconds / 60;
    if (alt.estimatedFareCentavos != null) {
      estimatedFareCentavos = alt.estimatedFareCentavos;
    }
    routeQuotePayload = toPublicRouteQuote({ ...routeQuote, selectedStrategy: strategy, recommended: alt });
  }

  if (isSharedRide) {
    if (!parsed.data.distanceKm || !parsed.data.durationMin) {
      res.status(400).json({ error: 'distanceKm e durationMin são obrigatórios para compartilhado' });
      return;
    }
    if (parsed.data.hasLargeBaggage) {
      res.status(400).json({ error: 'Bagagem grande não é permitida em viagem compartilhada' });
      return;
    }
    try {
      sharedQuoteResult = await quoteSharedRide({
        distanceKm: parsed.data.distanceKm,
        durationMin: parsed.data.durationMin,
        pickupLat: parsed.data.pickupLat,
        pickupLng: parsed.data.pickupLng,
        dropoffLat: parsed.data.dropoffLat,
        dropoffLng: parsed.data.dropoffLng,
        hasLargeBaggage: parsed.data.hasLargeBaggage,
        passengerId: req.user!.id,
        reputationScore: passengerRepScore,
      });
      estimatedFareCentavos = sharedQuoteResult.finalFareCentavos;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao cotar compartilhado';
      res.status(400).json({ error: message });
      return;
    }
  } else if (parsed.data.distanceKm && parsed.data.durationMin && estimatedFareCentavos == null) {
    quoteResult = await quoteWithDynamicPricing(
      parsed.data.categoryCode as RideCategoryCode,
      parsed.data.distanceKm,
      parsed.data.durationMin,
      {
        lat: parsed.data.pickupLat,
        lng: parsed.data.pickupLng,
        toLat: parsed.data.dropoffLat,
        toLng: parsed.data.dropoffLng,
      },
    );
    estimatedFareCentavos = quoteResult.passengerFareCentavos;
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
      deviceId,
      paymentFingerprint,
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
    isShared: parsed.data.isShared ?? parsed.data.categoryCode === 'compartilhado',
    hasPet: parsed.data.hasPet,
    needsWheelchair: accessibilityCheck.needsWheelchair,
    accessibilityNeedCode: accessibilityCheck.needCode,
    assistiveDeviceCount: parsed.data.assistiveDeviceCount,
    estimatedFareCentavos,
  });

  void captureRideOperationalConfigSnapshot({
    rideId: ride.id,
    categoryCode: ride.categoryCode,
    regionId: regionCtx.serviceRegion?.id ?? regionCtx.pricingRegionId,
    reputationTier: passengerTier,
  });

  let accessibilityPayload: ReturnType<typeof toPublicAccessibilityRequest> | undefined;
  if (accessibilityCheck.needCode) {
    const req_ = await registerAccessibilityRequest({
      rideId: ride.id,
      needCode: accessibilityCheck.needCode,
      assistiveDeviceCount: parsed.data.assistiveDeviceCount,
      notes: parsed.data.accessibilityNotes,
    });
    accessibilityPayload = toPublicAccessibilityRequest(req_);
  }

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
      deviceId,
      paymentFingerprint,
    });
  }

  recordRideMetric({
    rideId: ride.id,
    categoryCode: parsed.data.categoryCode,
    quoted: true,
    booked: true,
  });
  void logRideDecision({
    rideId: ride.id,
    decisionType: 'RIDE_CREATED',
    payload: {
      categoryCode: parsed.data.categoryCode,
      estimatedFareCentavos,
      discountCentavos,
      paymentMethodId: paymentMethodIdFinal,
    },
  });

  if (quoteResult) {
    const { lockDynamicMultiplierForRide } = await import('../pricing/rideDynamicLockService.js');
    const { computeLiveFactors } = await import('../pricing/dynamicPricingService.js');
    const factors = await computeLiveFactors(parsed.data.pickupLat, parsed.data.pickupLng);
    await lockDynamicMultiplierForRide({
      rideId: ride.id,
      categoryCode: parsed.data.categoryCode,
      regionId: quoteResult.regionId,
      lockedMultiplier: quoteResult.dynamicMultiplier,
      factors,
    });

    await captureRideGovernanceSnapshot({
      rideId: ride.id,
      phase: 'quote',
      pricingRuleVersionId: quoteResult.ruleVersionId,
      dynamicMultiplier: quoteResult.dynamicMultiplier,
      quotedFareCentavos: estimatedFareCentavos,
      snapshotJson: {
        ruleVersionId: quoteResult.ruleVersionId,
        regionId: quoteResult.regionId,
        platformFeeCentavos: quoteResult.platformFeeCentavos,
      },
    });
  }

  const airportCtx =
    quoteResult?.airportContext ??
    toPublicContext(
      await resolveAirportContext({
        fromLat: parsed.data.pickupLat,
        fromLng: parsed.data.pickupLng,
        toLat: parsed.data.dropoffLat,
        toLng: parsed.data.dropoffLng,
        categoryCode: parsed.data.categoryCode,
      }),
    );
  if (airportCtx.isAirportRide) {
    await captureRideAirportSnapshot({
      rideId: ride.id,
      context: {
        isAirportRide: airportCtx.isAirportRide,
        airportFeeCentavos: airportCtx.airportFeeCentavos,
        pricingMode: airportCtx.pricingMode as 'standard' | 'airport_category',
        airportPressure: airportCtx.airportPressure,
        feeLabel: airportCtx.feeLabel,
        pickupInstructions: airportCtx.pickupInstructions,
        pickupZone: airportCtx.pickupZone
          ? {
              id: airportCtx.pickupZone.id,
              name: airportCtx.pickupZone.name,
              iataCode: airportCtx.pickupZone.iataCode,
              centerLat: airportCtx.pickupZone.centerLat,
              centerLng: airportCtx.pickupZone.centerLng,
              radiusKm: airportCtx.pickupZone.radiusKm,
              pickupInstructions: airportCtx.pickupZone.pickupInstructions,
              isActive: true,
            }
          : undefined,
        dropoffZone: airportCtx.dropoffZone
          ? {
              id: airportCtx.dropoffZone.id,
              name: airportCtx.dropoffZone.name,
              iataCode: airportCtx.dropoffZone.iataCode,
              centerLat: airportCtx.dropoffZone.centerLat,
              centerLng: airportCtx.dropoffZone.centerLng,
              radiusKm: airportCtx.dropoffZone.radiusKm,
              pickupInstructions: airportCtx.dropoffZone.pickupInstructions,
              isActive: true,
            }
          : undefined,
      },
    });
  }

  if (parsed.data.routeRequestId && !useMemory()) {
    await pool.query(
      `UPDATE rides SET route_request_id = $2, route_strategy = $3, updated_at = NOW() WHERE id = $1`,
      [ride.id, parsed.data.routeRequestId, parsed.data.routeStrategy ?? routeQuotePayload?.selectedStrategy ?? null],
    );
  }

  const passengerRep = await getPassengerReputation(req.user!.id);

  let sharedPoolPayload: ReturnType<typeof toPublicPool> | undefined;
  if (isSharedRide && parsed.data.distanceKm && parsed.data.durationMin) {
    const shared = await registerSharedBooking({
      rideId: ride.id,
      passengerId: req.user!.id,
      pickupLat: parsed.data.pickupLat,
      pickupLng: parsed.data.pickupLng,
      dropoffLat: parsed.data.dropoffLat,
      dropoffLng: parsed.data.dropoffLng,
      passengerCount: parsed.data.passengerCount,
      hasLargeBaggage: parsed.data.hasLargeBaggage,
      distanceKm: parsed.data.distanceKm,
      durationMin: parsed.data.durationMin,
      reputationScore: passengerRepScore,
    });
    estimatedFareCentavos = shared.booking.finalFareCentavos;
    sharedPoolPayload = toPublicPool(shared.pool, await getPoolBookings(shared.pool.id));
    if (shared.pool.status === 'ready') {
      await dispatchReadyPools();
    }
  }

  const matched =
    isSharedRide && sharedPoolPayload?.status === 'waiting'
      ? null
      : await startMatching(ride.id, passengerRep);
  const finalRide = matched ?? ride;
  res.status(201).json({
    ride: toPublicRide(finalRide),
    paymentIntentId,
    payment: paymentPayload,
    risk,
    discountCentavos: discountCentavos || undefined,
    promoCode: promoCodeApplied,
    airportContext: airportCtx.isAirportRide ? airportCtx : undefined,
    sharedPool: sharedPoolPayload,
    sharedQuote: sharedQuoteResult ? toPublicSharedQuote(sharedQuoteResult) : undefined,
    routeQuote: routeQuotePayload,
    accessibility: accessibilityPayload,
  });
});

ridesRouter.get('/:id/governance', async (req, res) => {
  const ride = await getRide(req.params.id);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const trail = await getRideGovernanceTrail(req.params.id);
  res.json(trail);
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
  const tracking = await getRideTrackingProduction(ride);
  const lifecycle = await getRideLifecycleProductionWithDriverCoords(ride);
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
    ...(tracking ? { tracking: toPublicRideTrackingProduction(tracking) } : {}),
    ...(lifecycle ? { lifecycle: toPublicRideLifecycleProduction(lifecycle) } : {}),
    ...(startCodes ? { startCodes } : {}),
  });
});

ridesRouter.get('/:id/tracking', async (req, res) => {
  const ride = await getRide(req.params.id);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const tracking = await getRideTrackingProduction(ride);
  if (!tracking) {
    res.status(404).json({ error: 'Tracking indisponível para o status atual' });
    return;
  }
  res.json({ tracking: toPublicRideTrackingProduction(tracking) });
});

ridesRouter.get('/:id/lifecycle', async (req, res) => {
  const ride = await getRide(req.params.id);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const lifecycle = await getRideLifecycleProductionWithDriverCoords(ride);
  if (!lifecycle) {
    res.status(404).json({ error: 'Lifecycle indisponível para o status atual' });
    return;
  }
  res.json({ lifecycle: toPublicRideLifecycleProduction(lifecycle) });
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
  const existing = await getRide(req.params.id);
  if (!existing || existing.passengerId !== req.user!.id) {
    res.status(404).json({ error: 'Corrida não encontrada ou não cancelável' });
    return;
  }
  const priorStatus = existing.status;
  const cancelPolicy = await assessPassengerCancellationPolicy(existing, priorStatus);

  const ride = await cancelRide(req.params.id, req.user!.id, req.body?.reason);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada ou não cancelável' });
    return;
  }

  if (cancelPolicy.feeCentavos > 0) {
    await settleCancelPolicyFee(ride.id, cancelPolicy.feeCentavos);
  } else {
    await cancelRidePayment(ride.id);
  }

  res.json({
    ride: toPublicRide(ride),
    cancellationFeeCentavos: cancelPolicy.feeCentavos,
  });
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
    void recordLifecycleProductionEvent({
      rideId: req.params.id,
      eventType: 'manual_arrived',
      actorUserId: req.user!.id,
    });
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
  void recordLifecycleProductionEvent({
    rideId: req.params.id,
    eventType: result.started ? 'ride_started' : 'code_verified',
    actorUserId: req.user!.id,
    payload: { role: 'passenger' },
  });

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
  void recordLifecycleProductionEvent({
    rideId: req.params.id,
    eventType: result.started ? 'ride_started' : 'code_verified',
    actorUserId: req.user!.id,
    payload: { role: 'driver' },
  });

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
