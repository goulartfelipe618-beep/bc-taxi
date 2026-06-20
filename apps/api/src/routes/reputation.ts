import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getUserReputationProfile,
  listAvailableReviewTags,
  recalculateUserReputation,
} from '../reviews/reputationService.js';
import { listReviewTags } from '../reviews/reviewStore.js';

export const reputationRouter = Router();

reputationRouter.get('/tags', async (_req, res) => {
  const tags = await listReviewTags();
  res.json({ tags });
});

reputationRouter.use(authMiddleware);

reputationRouter.get('/me', async (req, res) => {
  const role = req.user!.role as 'passenger' | 'driver';
  if (role !== 'passenger' && role !== 'driver') {
    res.status(403).json({ error: 'Perfil reputacional indisponível' });
    return;
  }
  const profile = await getUserReputationProfile(req.user!.id, role);
  res.json({ profile });
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
  const profile = await getUserReputationProfile(req.user!.id, role);
  res.json({ score, profile });
});
