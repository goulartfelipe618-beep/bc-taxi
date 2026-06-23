import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  dismissPassengerReputationInsight,
  getPassengerReputationProductionDashboard,
  listPassengerReputationBadges,
} from '../passenger/passengerReputationProductionService.js';

export const passengerReputationRouter = Router();

passengerReputationRouter.use(authMiddleware);

passengerReputationRouter.use((req, res, next) => {
  if (req.user?.role !== 'passenger') {
    res.status(403).json({ error: 'Disponível apenas para passageiros' });
    return;
  }
  next();
});

passengerReputationRouter.get('/dashboard', async (req, res) => {
  const dashboard = await getPassengerReputationProductionDashboard(req.user!.id);
  res.json(dashboard);
});

passengerReputationRouter.get('/badges', async (req, res) => {
  const badges = await listPassengerReputationBadges(req.user!.id);
  res.json({ badges });
});

passengerReputationRouter.post('/insights/:code/dismiss', async (req, res) => {
  const result = await dismissPassengerReputationInsight(req.user!.id, req.params.code);
  res.json(result);
});
