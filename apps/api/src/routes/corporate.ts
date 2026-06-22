import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  approveCorporateRideBooking,
  bookCorporateRide,
  ensureDemoCorporateMember,
  getCorporateMembership,
  listCorporateInvoiceLines,
} from '../corporate/corporateService.js';
import {
  closeCorporateBillingPeriod,
  getCorporateProductionPolicy,
  listCorporateBillingStatements,
} from '../corporate/corporateProductionService.js';

export const corporateRouter = Router();

corporateRouter.use(authMiddleware);

corporateRouter.get('/account', async (req, res) => {
  await ensureDemoCorporateMember(req.user!.id);
  const membership = await getCorporateMembership(req.user!.id);
  if (!membership) {
    res.status(404).json({ error: 'Conta corporativa não encontrada' });
    return;
  }
  const prodPolicy = await getCorporateProductionPolicy(membership.account.id);
  res.json({
    account: membership.account,
    member: { role: membership.member.role, approvalStatus: membership.member.approvalStatus },
    policy: {
      allowedCategoryCodes: membership.policy.allowedCategoryCodes,
      maxFareCentavos: membership.policy.maxFareCentavos,
      blockPublicPromos: membership.policy.blockPublicPromos,
      weekdayStartHour: membership.policy.weekdayStartHour,
      weekdayEndHour: membership.policy.weekdayEndHour,
      approvalThresholdCentavos: prodPolicy?.approvalThresholdCentavos,
      requireCostCenter: prodPolicy?.requireCostCenter ?? true,
      configVersion: prodPolicy?.configVersion,
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

corporateRouter.get('/statements', async (req, res) => {
  const membership = await getCorporateMembership(req.user!.id);
  if (!membership) {
    res.status(404).json({ error: 'Conta corporativa não encontrada' });
    return;
  }
  if (!['manager', 'admin'].includes(membership.member.role)) {
    res.status(403).json({ error: 'Somente gestores podem ver faturas consolidadas' });
    return;
  }
  const statements = await listCorporateBillingStatements(membership.account.id);
  res.json({ statements });
});

const closePeriodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

corporateRouter.post('/billing/close-period', async (req, res) => {
  const membership = await getCorporateMembership(req.user!.id);
  if (!membership) {
    res.status(404).json({ error: 'Conta corporativa não encontrada' });
    return;
  }
  if (!['manager', 'admin'].includes(membership.member.role)) {
    res.status(403).json({ error: 'Somente gestores podem fechar período' });
    return;
  }
  const parsed = closePeriodSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const prodPolicy = await getCorporateProductionPolicy(membership.account.id);
  try {
    const statement = await closeCorporateBillingPeriod({
      accountId: membership.account.id,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      configVersion: prodPolicy?.configVersion ?? 'camada38-v1',
    });
    res.status(201).json({ statement });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao fechar período';
    res.status(400).json({ error: message });
  }
});

corporateRouter.post('/approvals/:id/approve', async (req, res) => {
  const membership = await getCorporateMembership(req.user!.id);
  if (!membership) {
    res.status(404).json({ error: 'Conta corporativa não encontrada' });
    return;
  }
  if (!['manager', 'admin'].includes(membership.member.role)) {
    res.status(403).json({ error: 'Somente gestores podem aprovar corridas' });
    return;
  }
  try {
    const result = await approveCorporateRideBooking({
      approvalId: req.params.id,
      accountId: membership.account.id,
      decidedByUserId: req.user!.id,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao aprovar';
    res.status(400).json({ error: message });
  }
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
      pendingApproval: result.pendingApproval,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao reservar';
    res.status(400).json({ error: message });
  }
});
