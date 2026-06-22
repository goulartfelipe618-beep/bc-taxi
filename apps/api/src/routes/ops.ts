import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import { getOpsDashboard, acknowledgeOpsAlert, resolveOpsAlert } from '../observability/opsAlertService.js';
import { capturePlatformHealthSnapshot, getLatestPlatformHealth } from '../observability/platformHealthService.js';
import { getLatestMetrics, listOpenOpsAlerts } from '../observability/opsMetricsService.js';
import {
  getObservabilityProductionConfig,
  listSloSnapshots,
} from '../observability/observabilityProductionService.js';
import { getRideTraceBundle, getTraceBundleByTraceId } from '../observability/traceService.js';
import { wsHub } from '../realtime/wsHub.js';
import { config } from '../config.js';

export const opsRouter = Router();

opsRouter.get('/health', async (_req, res) => {
  const ws = wsHub.detailedStats();
  const platform = (await getLatestPlatformHealth()) ?? (await capturePlatformHealthSnapshot());
  res.json({
    ok: true,
    mode: config.useMemoryDb ? 'memory' : 'postgres',
    ws,
    redisConfigured: Boolean(config.redisUrl),
    redisConnected: platform.redisConnected,
    activeRidesInProgress: platform.activeRidesInProgress,
    capturedAt: platform.capturedAt.toISOString(),
  });
});

opsRouter.get('/dashboard', async (_req, res) => {
  const dashboard = await getOpsDashboard();
  res.json(dashboard);
});

opsRouter.get('/metrics', async (_req, res) => {
  const metrics = await getLatestMetrics();
  res.json({ metrics });
});

opsRouter.get('/alerts', async (_req, res) => {
  const alerts = await listOpenOpsAlerts();
  res.json({ alerts });
});

opsRouter.get('/config', async (_req, res) => {
  const cfg = await getObservabilityProductionConfig();
  res.json({ observability: cfg });
});

opsRouter.get('/slo', async (req, res) => {
  const snapshots = await listSloSnapshots({
    regionId: typeof req.query.regionId === 'string' ? req.query.regionId : undefined,
    categoryCode: typeof req.query.categoryCode === 'string' ? req.query.categoryCode : undefined,
    reputationTier: typeof req.query.reputationTier === 'string' ? req.query.reputationTier : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 20,
  });
  res.json({ snapshots });
});

opsRouter.get('/traces/:rideId', authMiddleware, async (req, res) => {
  const bundle = await getRideTraceBundle(req.params.rideId);
  res.json(bundle);
});

opsRouter.get('/traces/by-trace/:traceId', authMiddleware, async (req, res) => {
  const bundle = await getTraceBundleByTraceId(req.params.traceId);
  res.json(bundle);
});

opsRouter.post('/alerts/:id/acknowledge', adminAuthMiddleware, async (req, res) => {
  const alert = await acknowledgeOpsAlert(req.params.id, req.body?.userId ?? 'admin');
  if (!alert) {
    res.status(404).json({ error: 'Alerta não encontrado ou já encerrado' });
    return;
  }
  res.json({ alert });
});

opsRouter.post('/alerts/:id/resolve', adminAuthMiddleware, async (req, res) => {
  await resolveOpsAlert(req.params.id);
  res.json({ ok: true });
});
