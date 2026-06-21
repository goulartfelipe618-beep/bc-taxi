import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getRide } from '../match/matchService.js';
import { getRideGovernanceTrail } from '../governance/governanceService.js';

export const governanceRouter = Router();

governanceRouter.use(authMiddleware);

governanceRouter.get('/rides/:rideId', async (req, res) => {
  const ride = await getRide(req.params.rideId);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const trail = await getRideGovernanceTrail(req.params.rideId);
  res.json(trail);
});
