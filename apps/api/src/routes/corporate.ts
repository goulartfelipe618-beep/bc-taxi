import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  bookCorporateRide,
  ensureDemoCorporateMember,
  getCorporateMembership,
  listCorporateInvoiceLines,
} from '../corporate/corporateService.js';

export const corporateRouter = Router();

corporateRouter.use(authMiddleware);

corporateRouter.get('/account', async (req, res) => {
  await ensureDemoCorporateMember(req.user!.id);
  const membership = await getCorporateMembership(req.user!.id);
  if (!membership) {
    res.status(404).json({ error: 'Conta corporativa não encontrada' });
    return;
  }
  res.json({
    account: membership.account,
    member: { role: membership.member.role, approvalStatus: membership.member.approvalStatus },
    policy: {
      allowedCategoryCodes: membership.policy.allowedCategoryCodes,
      maxFareCentavos: membership.policy.maxFareCentavos,
      blockPublicPromos: membership.policy.blockPublicPromos,
      weekdayStartHour: membership.policy.weekdayStartHour,
      weekdayEndHour: membership.policy.weekdayEndHour,
    },
    costCenters: membership.costCenters,
  });
});

corporateRouter.get('/invoices', async (req, res) => {
  const membership = await getCorporateMembership(req.user!.id);
  if (!membership) {
    res.status(404).json({ error: 'Conta corporativa não encontrada' });
    return;
  }
  const lines = await listCorporateInvoiceLines(membership.account.id);
  res.json({ lines });
});

const bookSchema = z.object({
  accountId: z.string().uuid(),
  costCenterId: z.string().uuid(),
  categoryCode: z.string().default('corporativo'),
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().optional(),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  dropoffAddress: z.string().optional(),
  distanceKm: z.number().positive().optional(),
  durationMin: z.number().positive().optional(),
});

corporateRouter.post('/book', async (req, res) => {
  if (req.user!.role !== 'passenger') {
    res.status(403).json({ error: 'Somente passageiros podem reservar corporativo' });
    return;
  }
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await bookCorporateRide({
      passengerId: req.user!.id,
      ...parsed.data,
    });
    res.status(201).json({
      ride: result.ride,
      billingMode: result.billingMode,
      costCenter: result.costCenter,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao reservar';
    res.status(400).json({ error: message });
  }
});
