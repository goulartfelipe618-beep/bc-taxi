import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  getPassengerAccountDashboard,
  getPassengerSecuritySummary,
  getPassengerWallet,
  listPassengerInboxMessages,
  markPassengerInboxMessageRead,
  setPassengerTwoFactor,
  updatePassengerPassword,
  updatePassengerProfile,
} from '../passenger/passengerAccountProductionService.js';

export const passengerAccountRouter = Router();

passengerAccountRouter.use(authMiddleware);

passengerAccountRouter.use((req, res, next) => {
  if (req.user?.role !== 'passenger') {
    res.status(403).json({ error: 'Disponível apenas para passageiros' });
    return;
  }
  next();
});

passengerAccountRouter.get('/dashboard', async (req, res) => {
  const dashboard = await getPassengerAccountDashboard(req.user!);
  res.json(dashboard);
});

passengerAccountRouter.get('/wallet', async (req, res) => {
  const wallet = await getPassengerWallet(req.user!.id);
  res.json({ wallet });
});

passengerAccountRouter.get('/messages', async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit ?? 30));
  const messages = await listPassengerInboxMessages(req.user!.id, limit);
  res.json({ messages });
});

passengerAccountRouter.post('/messages/:id/read', async (req, res) => {
  const result = await markPassengerInboxMessageRead(req.user!.id, req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Mensagem não encontrada' });
    return;
  }
  res.json({ ok: true });
});

passengerAccountRouter.get('/security', async (req, res) => {
  const security = await getPassengerSecuritySummary(req.user!);
  res.json({ security });
});

const profileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(8).optional(),
  gender: z.string().min(2).optional(),
  recoveryPhone: z.string().min(8).optional(),
  preferredLanguage: z.string().min(2).optional(),
});

passengerAccountRouter.patch('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const dashboard = await updatePassengerProfile(req.user!, parsed.data);
    res.json(dashboard);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Falha ao atualizar perfil' });
  }
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

passengerAccountRouter.post('/security/password', async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await updatePassengerPassword(
      req.user!,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Falha ao alterar palavra-passe' });
  }
});

passengerAccountRouter.post('/security/two-factor', async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const profile = await setPassengerTwoFactor(req.user!, enabled);
  res.json({ profile: { twoFactorEnabled: profile.twoFactorEnabled } });
});
