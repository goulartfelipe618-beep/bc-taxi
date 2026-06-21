import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { listActivePromos, validatePromoCode } from '../promotions/couponService.js';
import {
  getPromoEligibility,
  resolvePaymentFingerprint,
} from '../promotions/couponAbuseService.js';

export const promotionsRouter = Router();

promotionsRouter.get('/catalog', async (_req, res) => {
  const promos = await listActivePromos();
  res.json({ promos });
});

promotionsRouter.get('/eligibility', authMiddleware, async (req, res) => {
  const eligibility = await getPromoEligibility(req.user!.id);
  res.json({ eligibility });
});

const validateSchema = z.object({
  code: z.string().min(2),
  categoryCode: z.string(),
  fareCentavos: z.number().int().positive(),
  paymentMethodId: z.string().optional(),
  regionId: z.string().uuid().optional(),
  stackedPromoCodes: z.array(z.string()).optional(),
});

promotionsRouter.post('/validate', authMiddleware, async (req, res) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const deviceId = req.header('x-device-id') ?? undefined;
  const paymentFingerprint = await resolvePaymentFingerprint(
    req.user!.id,
    parsed.data.paymentMethodId,
  );

  const result = await validatePromoCode({
    code: parsed.data.code,
    userId: req.user!.id,
    categoryCode: parsed.data.categoryCode,
    fareCentavos: parsed.data.fareCentavos,
    deviceId,
    paymentFingerprint,
    regionId: parsed.data.regionId,
    stackedPromoCodes: parsed.data.stackedPromoCodes,
  });

  res.json({
    valid: result.valid,
    discountCentavos: result.discountCentavos,
    fareAfterCentavos: result.fareAfterCentavos,
    label: result.promo?.label,
    reason: result.reason,
  });
});
