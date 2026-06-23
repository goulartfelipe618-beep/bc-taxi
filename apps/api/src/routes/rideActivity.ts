import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getRideActivityDetail,
  getRideActivityRebookDraft,
} from '../activity/rideActivityDetailProductionService.js';
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

  router.get('/rides/:id', async (req, res) => {
    try {
      const detail = await getRideActivityDetail(req.user!.id, role, req.params.id);
      res.json(detail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar detalhe';
      res.status(msg.includes('não encontrada') ? 404 : 400).json({ error: msg });
    }
  });

  if (role === 'passenger') {
    router.get('/rides/:id/rebook', async (req, res) => {
      try {
        const draft = await getRideActivityRebookDraft(req.user!.id, req.params.id);
        res.json({ rebook: draft });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao preparar re-reserva';
        res.status(400).json({ error: msg });
      }
    });
  }

  router.post('/rides/:id/pin', async (req, res) => {
    const result = await pinRideActivity(req.user!.id, req.params.id);
    res.json(result);
  });

  return router;
}

export const passengerActivityRouter = createRideActivityRouter('passenger');
export const driverActivityRouter = createRideActivityRouter('driver');
