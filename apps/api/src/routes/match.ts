import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import { getRide } from '../match/matchService.js';
import { getMatchTrail } from '../match/matchEngineRepository.js';

export const matchRouter = Router();

matchRouter.get('/rides/:rideId/trail', authMiddleware, async (req, res) => {
  const ride = await getRide(req.params.rideId);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const trail = await getMatchTrail(req.params.rideId);
  res.json(trail);
});

matchRouter.get('/admin/rides/:rideId/trail', adminAuthMiddleware, async (req, res) => {
  const ride = await getRide(req.params.rideId);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }

  const trail = await getMatchTrail(req.params.rideId);
  res.json(trail);
});
