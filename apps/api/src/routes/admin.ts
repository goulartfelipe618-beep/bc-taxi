import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import {
  getAdminOverview,
  listOpenFraudCases,
  listRecentRides,
  logAdminAction,
} from '../admin/adminService.js';

export const adminRouter = Router();

adminRouter.use(adminAuthMiddleware);

adminRouter.get('/overview', async (_req, res) => {
  const overview = await getAdminOverview();
  res.json({ overview });
});

adminRouter.get('/rides', async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit ?? 50));
  const rides = await listRecentRides(limit);
  await logAdminAction('list_rides', 'rides', undefined, { limit });
  res.json({ rides });
});

adminRouter.get('/fraud/cases', async (_req, res) => {
  const cases = await listOpenFraudCases();
  await logAdminAction('list_fraud_cases', 'fraud_cases');
  res.json({ cases });
});

adminRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'admin' });
});
