import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listBadgeCatalog, listUserBadges, toPublicBadge } from '../reviews/badgeService.js';
import {
  getFullReputationDashboard,
  getUserReputationProfile,
  listAvailableReviewTags,
  recalculateUserReputation,
} from '../reviews/reputationService.js';
import { getPendingReviewsForUser } from '../reviews/pendingReviewService.js';
import { revokeReputationBenefits } from '../reviews/revocationService.js';
import { listReviewTags } from '../reviews/reviewStore.js';
import { config } from '../config.js';

export const reputationRouter = Router();

reputationRouter.get('/tags', async (_req, res) => {
  const tags = await listReviewTags();
  res.json({ tags });
});

reputationRouter.get('/badges', async (req, res) => {
  const role = req.query.role as 'passenger' | 'driver' | undefined;
  const badges = await listBadgeCatalog(role);
  res.json({ badges });
});

reputationRouter.use(authMiddleware);

reputationRouter.get('/me', async (req, res) => {
  const role = req.user!.role as 'passenger' | 'driver';
  if (role !== 'passenger' && role !== 'driver') {
    res.status(403).json({ error: 'Perfil reputacional indisponível' });
    return;
  }
  const dashboard = await getFullReputationDashboard(req.user!.id, role);
  res.json(dashboard);
});

reputationRouter.get('/me/summary', async (req, res) => {
  const role = req.user!.role as 'passenger' | 'driver';
  const profile = await getUserReputationProfile(req.user!.id, role);
  res.json({ profile });
});

reputationRouter.get('/me/pending-reviews', async (req, res) => {
  const pending = await getPendingReviewsForUser(req.user!.id);
  res.json({ pending });
});

reputationRouter.get('/me/badges', async (req, res) => {
  const badges = await listUserBadges(req.user!.id);
  res.json({ badges: badges.map(toPublicBadge) });
});

reputationRouter.get('/me/tags', async (req, res) => {
  const role = req.user!.role as 'passenger' | 'driver';
  const tags = await listAvailableReviewTags(role === 'driver' ? 'driver' : 'passenger');
  res.json({ tags });
});

reputationRouter.post('/me/recalculate', async (req, res) => {
  const role = req.user!.role as 'passenger' | 'driver';
  if (role !== 'passenger' && role !== 'driver') {
    res.status(403).json({ error: 'Recálculo indisponível' });
    return;
  }
  const score = await recalculateUserReputation(req.user!.id, role);
  const dashboard = await getFullReputationDashboard(req.user!.id, role);
  res.json({ score, ...dashboard });
});

/** Admin/demo: revoga benefícios por fraude (guia §184). */
reputationRouter.post('/revoke-benefits', async (req, res) => {
  const adminKey = req.header('x-admin-key') ?? req.header('X-Admin-Key');
  if (adminKey !== config.adminApiKey || !config.adminApiKey) {
    res.status(403).json({ error: 'Não autorizado' });
    return;
  }

  const body = req.body as {
    userId?: string;
    userRole?: 'passenger' | 'driver';
    reason?: string;
    sourceType?: 'fraud' | 'gps_spoof' | 'admin' | 'policy';
    sourceRef?: string;
  };

  if (!body.userId || !body.userRole || !body.reason) {
    res.status(400).json({ error: 'userId, userRole e reason são obrigatórios' });
    return;
  }

  const revocation = await revokeReputationBenefits({
    userId: body.userId,
    userRole: body.userRole,
    reason: body.reason,
    sourceType: body.sourceType ?? 'admin',
    sourceRef: body.sourceRef,
  });

  res.status(201).json({ revocation });
});
