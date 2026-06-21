import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  getDriverAccessibilityProfile,
  listAccessibilityNeeds,
  toPublicNeed,
  upsertDriverAccessibilityProfile,
  validateAccessibilityBooking,
} from '../accessibility/accessibilityService.js';

export const accessibilityRouter = Router();

accessibilityRouter.get('/needs', (_req, res) => {
  res.json({ needs: listAccessibilityNeeds().map(toPublicNeed) });
});

const validateSchema = z.object({
  categoryCode: z.string(),
  accessibilityNeedCode: z.string().optional(),
  needsWheelchair: z.boolean().optional(),
  assistiveDeviceCount: z.number().int().min(0).max(3).optional(),
});

accessibilityRouter.post('/validate', authMiddleware, async (req, res) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await validateAccessibilityBooking(parsed.data);
  if (!result.ok) {
    res.status(400).json({ error: result.reason });
    return;
  }
  res.json({
    valid: true,
    needCode: result.needCode,
    needsWheelchair: result.needsWheelchair,
  });
});

const profileSchema = z.object({
  pcdOptIn: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
  notes: z.string().max(500).optional(),
});

accessibilityRouter.get('/driver/profile', authMiddleware, async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const profile = await getDriverAccessibilityProfile(req.user!.id);
  res.json({ profile });
});

accessibilityRouter.put('/driver/profile', authMiddleware, async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const profile = await upsertDriverAccessibilityProfile({
    driverId: req.user!.id,
    ...parsed.data,
  });
  res.json({ profile });
});
