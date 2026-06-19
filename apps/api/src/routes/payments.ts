import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { authorizeRidePayment, getUserPaymentMethods } from '../payments/paymentService.js';
import { toPublicPaymentIntent, toPublicPaymentMethod } from '../payments/types.js';

const authorizeSchema = z.object({
  paymentMethodId: z.string().uuid(),
  amountCentavos: z.number().int().positive().optional(),
  rideId: z.string().uuid().optional(),
});

export const paymentsRouter = Router();

paymentsRouter.use(authMiddleware);

paymentsRouter.get('/methods', async (req, res) => {
  const methods = await getUserPaymentMethods(req.user!.id);
  res.json({ methods: methods.map(toPublicPaymentMethod) });
});

paymentsRouter.post('/intents/authorize', async (req, res) => {
  const parsed = authorizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const intent = await authorizeRidePayment({
      userId: req.user!.id,
      paymentMethodId: parsed.data.paymentMethodId,
      amountCentavos: parsed.data.amountCentavos,
      rideId: parsed.data.rideId,
    });
    res.status(201).json({ intent: toPublicPaymentIntent(intent) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao autorizar pagamento';
    res.status(400).json({ error: message });
  }
});
