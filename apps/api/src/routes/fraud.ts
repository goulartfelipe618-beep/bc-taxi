import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import { getUserRiskScore } from '../fraud/fraudService.js';
import { evaluateRideRisk, getLatestRiskDecision } from '../fraud/riskEngine.js';
import { listActiveBlocks } from '../fraud/fraudEnforcementService.js';
import { getDeviceGraph } from '../fraud/deviceGraphService.js';
import { getLocationTrust } from '../fraud/locationTrustService.js';
import { processPendingFraudCases, autoReviewCase } from '../fraud/fraudCaseReviewService.js';

export const fraudRouter = Router();

fraudRouter.use(authMiddleware);

fraudRouter.get('/risk/me', async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.header('x-device-id') ?? undefined;
  const [riskScore, latest, blocks, graph] = await Promise.all([
    getUserRiskScore(userId),
    getLatestRiskDecision(userId),
    listActiveBlocks({ userId }),
    getDeviceGraph(userId),
  ]);
  const locationTrust = deviceId ? await getLocationTrust(userId, deviceId) : null;
  res.json({
    riskScore,
    latestDecision: latest,
    activeBlocks: blocks,
    deviceGraph: {
      linkedUserCount: graph.linkedUserCount,
      sharedDeviceCount: graph.sharedDeviceCount,
      riskFlags: graph.riskFlags,
    },
    locationTrust,
  });
});

fraudRouter.get('/blocks/me', async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.header('x-device-id') ?? undefined;
  const [userBlocks, deviceBlocks] = await Promise.all([
    listActiveBlocks({ userId }),
    deviceId ? listActiveBlocks({ deviceId }) : Promise.resolve([]),
  ]);
  res.json({ userBlocks, deviceBlocks });
});

fraudRouter.get('/graph/me', async (req, res) => {
  const graph = await getDeviceGraph(req.user!.id);
  res.json({ graph });
});

fraudRouter.post('/risk/evaluate', async (req, res) => {
  const deviceId = req.header('x-device-id') ?? undefined;
  const evaluation = await evaluateRideRisk({
    userId: req.user!.id,
    deviceId,
    paymentMethodType: req.body?.paymentMethodType,
    amountCentavos: req.body?.amountCentavos,
  });
  res.json(evaluation);
});

fraudRouter.use(adminAuthMiddleware);

fraudRouter.post('/cases/process', async (_req, res) => {
  const results = await processPendingFraudCases(50);
  res.json({ processed: results.length, results });
});

fraudRouter.post('/cases/:caseId/review', async (req, res) => {
  const result = await autoReviewCase(req.params.caseId);
  if (!result) {
    res.status(404).json({ error: 'Caso não encontrado ou já revisado' });
    return;
  }
  res.json({ result });
});
