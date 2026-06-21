import { Router } from 'express';
import { config } from '../config.js';
import { renderAdminDashboardHtml } from '../admin/dashboardHtml.js';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import {
  getAdminOverview,
  listOpenFraudCases,
  listRecentRides,
  logAdminAction,
} from '../admin/adminService.js';
import { createEventSurge, listActiveEvents, toPublicEvent } from '../events/eventSurgeService.js';
import { getRideDecisionLogs, toPublicDecisionLog } from '../observability/decisionLogService.js';
import {
  getLatestMetrics,
  listOpenOpsAlerts,
} from '../observability/opsMetricsService.js';
import { z } from 'zod';

export const adminRouter = Router();

adminRouter.get('/dashboard', (_req, res) => {
  const apiBase = process.env.PUBLIC_API_URL ?? `http://localhost:${config.port}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderAdminDashboardHtml(apiBase));
});

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

adminRouter.get('/ops/metrics', async (_req, res) => {
  const metrics = await getLatestMetrics();
  res.json({ metrics });
});

adminRouter.get('/ops/alerts', async (_req, res) => {
  const alerts = await listOpenOpsAlerts();
  res.json({ alerts });
});

adminRouter.get('/events', async (_req, res) => {
  const events = await listActiveEvents();
  res.json({ events: events.map(toPublicEvent) });
});

const eventSchema = z.object({
  eventName: z.string().min(2),
  eventType: z.enum(['show', 'sports', 'festival', 'conference', 'other']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  centerLat: z.number(),
  centerLng: z.number(),
  radiusKm: z.number().positive().optional(),
  intensityIndex: z.number().min(0).max(1).optional(),
  impactedCategories: z.array(z.string()).optional(),
  regionId: z.string().uuid().optional(),
});

adminRouter.post('/events', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const event = await createEventSurge({
    ...parsed.data,
    startsAt: new Date(parsed.data.startsAt),
    endsAt: new Date(parsed.data.endsAt),
  });
  await logAdminAction('create_event_surge', 'event_surge_inputs', event.id);
  res.status(201).json({ event: toPublicEvent(event) });
});

adminRouter.get('/rides/:id/decisions', async (req, res) => {
  const logs = await getRideDecisionLogs(req.params.id);
  res.json({ decisions: logs.map(toPublicDecisionLog) });
});

adminRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'admin' });
});
