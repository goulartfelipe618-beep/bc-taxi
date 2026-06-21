import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { listActivePromos, validatePromoCode } from '../promotions/couponService.js';

export const promotionsRouter = Router();

promotionsRouter.get('/catalog', async (_req, res) => {
  const promos = await listActivePromos();
  res.json({ promos });
});

const validateSchema = z.object({
  code: z.string().min(2),
  categoryCode: z.string(),
  fareCentavos: z.number().int().positive(),
});

promotionsRouter.post('/validate', authMiddleware, async (req, res) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await validatePromoCode({
    code: parsed.data.code,
    userId: req.user!.id,
    categoryCode: parsed.data.categoryCode,
    fareCentavos: parsed.data.fareCentavos,
  });

  res.json({
    valid: result.valid,
    discountCentavos: result.discountCentavos,
    fareAfterCentavos: result.fareAfterCentavos,
    label: result.promo?.label,
    reason: result.reason,
  });
});
