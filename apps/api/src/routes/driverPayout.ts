import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import type { RideCategoryCode } from '../domain/types.js';
import { buildEngineQuote } from '../pricing/pricingEngineService.js';
import {
  computeDriverPayoutBreakdown,
  computeEliteDynamicBonusPct,
  getDriverPayoutSettlement,
  getDriverPayoutSummary,
  toPublicPayoutBreakdown,
} from '../payments/driverPayoutService.js';
import { getUserReputationProfile } from '../reviews/reputationService.js';

export const driverPayoutRouter = Router();

driverPayoutRouter.use(authMiddleware);

driverPayoutRouter.get('/summary', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const summary = await getDriverPayoutSummary(req.user!.id);
  res.json({ summary });
});

driverPayoutRouter.get('/rides/:rideId/breakdown', async (req, res) => {
  const breakdown = await getDriverPayoutSettlement(req.params.rideId);
  if (!breakdown) {
    res.status(404).json({ error: 'Repasse não encontrado para esta corrida' });
    return;
  }
  if (breakdown.driverUserId !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  res.json({ breakdown: toPublicPayoutBreakdown(breakdown) });
});

const previewSchema = z.object({
  categoryCode: z.string(),
  distanceKm: z.number().positive(),
  durationMin: z.number().positive(),
  passengerDiscountCentavos: z.number().min(0).optional(),
  fromLat: z.number().optional(),
  fromLng: z.number().optional(),
  toLat: z.number().optional(),
  toLng: z.number().optional(),
  trafficIndex: z.number().min(0).optional(),
});

driverPayoutRouter.post('/preview', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const profile = await getUserReputationProfile(req.user!.id, 'driver');
  const quote = await buildEngineQuote({
    categoryCode: parsed.data.categoryCode as RideCategoryCode,
    distanceKm: parsed.data.distanceKm,
    durationMin: parsed.data.durationMin,
    fromLat: parsed.data.fromLat,
    fromLng: parsed.data.fromLng,
    toLat: parsed.data.toLat,
    toLng: parsed.data.toLng,
    trafficIndex: parsed.data.trafficIndex,
  });

  const breakdown = await computeDriverPayoutBreakdown({
    quote,
    driverUserId: req.user!.id,
    reputationTier: profile?.tier,
    passengerDiscountCentavos: parsed.data.passengerDiscountCentavos,
  });

  res.json({
    breakdown: toPublicPayoutBreakdown(breakdown),
    eliteBonusPct: computeEliteDynamicBonusPct(profile?.tier),
  });
});
