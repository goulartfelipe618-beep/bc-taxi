import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { listUserNotifications, upsertPushToken } from '../notifications/pushTokenStore.js';

export const notificationsRouter = Router();

notificationsRouter.use(authMiddleware);

const registerSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'expo']),
  token: z.string().min(8).max(512),
});

notificationsRouter.post('/push/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const record = await upsertPushToken({
    userId: req.user!.id,
    platform: parsed.data.platform,
    token: parsed.data.token,
  });

  res.status(201).json({
    token: {
      id: record.id,
      platform: record.platform,
      isActive: record.isActive,
    },
  });
});

notificationsRouter.get('/history', async (req, res) => {
  const history = await listUserNotifications(req.user!.id);
  res.json({ notifications: history });
});
