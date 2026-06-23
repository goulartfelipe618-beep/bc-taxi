import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listRideActivity, pinRideActivity } from '../activity/rideActivityProductionService.js';

function createRideActivityRouter(role: 'passenger' | 'driver') {
  const router = Router();
  router.use(authMiddleware);
  router.use((req, res, next) => {
    if (req.user?.role !== role) {
      res.status(403).json({
        error: role === 'passenger' ? 'Disponível apenas para passageiros' : 'Disponível apenas para motoristas',
      });
      return;
    }
    next();
  });

  router.get('/rides', async (req, res) => {
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await listRideActivity(req.user!.id, role, { status, limit, offset });
    res.json(result);
  });

  router.post('/rides/:id/pin', async (req, res) => {
    const result = await pinRideActivity(req.user!.id, req.params.id);
    res.json(result);
  });

  return router;
}

export const passengerActivityRouter = createRideActivityRouter('passenger');
export const driverActivityRouter = createRideActivityRouter('driver');
