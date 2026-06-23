import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  dismissDriverReputationInsight,
  getDriverReputationProductionDashboard,
  listDriverReputationBadges,
} from '../driver/driverReputationProductionService.js';

export const driverReputationRouter = Router();

driverReputationRouter.use(authMiddleware);

driverReputationRouter.use((req, res, next) => {
  if (req.user?.role !== 'driver') {
    res.status(403).json({ error: 'Disponível apenas para motoristas' });
    return;
  }
  next();
});

driverReputationRouter.get('/dashboard', async (req, res) => {
  const dashboard = await getDriverReputationProductionDashboard(req.user!.id);
  res.json(dashboard);
});

driverReputationRouter.get('/badges', async (req, res) => {
  const badges = await listDriverReputationBadges(req.user!.id);
  res.json({ badges });
});

driverReputationRouter.post('/insights/:code/dismiss', async (req, res) => {
  const result = await dismissDriverReputationInsight(req.user!.id, req.params.code);
  res.json(result);
});
