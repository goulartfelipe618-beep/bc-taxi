import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  getDriverAccountDashboard,
  getDriverEarnings,
  getDriverSecuritySummary,
  listDriverInboxMessages,
  markDriverInboxMessageRead,
  setDriverTwoFactor,
  updateDriverPassword,
  updateDriverProfile,
} from '../driver/driverAccountProductionService.js';

export const driverAccountRouter = Router();

driverAccountRouter.use(authMiddleware);

driverAccountRouter.use((req, res, next) => {
  if (req.user?.role !== 'driver') {
    res.status(403).json({ error: 'Disponível apenas para motoristas' });
    return;
  }
  next();
});

driverAccountRouter.get('/dashboard', async (req, res) => {
  const dashboard = await getDriverAccountDashboard(req.user!);
  res.json(dashboard);
});

driverAccountRouter.get('/earnings', async (req, res) => {
  const earnings = await getDriverEarnings(req.user!.id);
  res.json({ earnings });
});

driverAccountRouter.get('/messages', async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit ?? 30));
  const messages = await listDriverInboxMessages(req.user!.id, limit);
  res.json({ messages });
});

driverAccountRouter.post('/messages/:id/read', async (req, res) => {
  const result = await markDriverInboxMessageRead(req.user!.id, req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Mensagem não encontrada' });
    return;
  }
  res.json({ ok: true });
});

driverAccountRouter.get('/security', async (req, res) => {
  const security = await getDriverSecuritySummary(req.user!);
  res.json({ security });
});

const profileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(8).optional(),
  emergencyContact: z.string().min(8).optional(),
  preferredPayoutMethod: z.enum(['pix', 'bank_transfer']).optional(),
  preferredLanguage: z.string().min(2).optional(),
});

driverAccountRouter.patch('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const dashboard = await updateDriverProfile(req.user!, parsed.data);
    res.json(dashboard);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Falha ao atualizar perfil' });
  }
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

driverAccountRouter.post('/security/password', async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await updateDriverPassword(
      req.user!,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Falha ao alterar palavra-passe' });
  }
});

driverAccountRouter.post('/security/two-factor', async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const profile = await setDriverTwoFactor(req.user!, enabled);
  res.json({ profile: { twoFactorEnabled: profile.twoFactorEnabled } });
});
