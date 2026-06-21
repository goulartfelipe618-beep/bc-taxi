import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUserRiskScore } from '../fraud/fraudService.js';
import { evaluateRideRisk, getLatestRiskDecision } from '../fraud/riskEngine.js';

export const fraudRouter = Router();

fraudRouter.use(authMiddleware);

fraudRouter.get('/risk/me', async (req, res) => {
  const userId = req.user!.id;
  const [riskScore, latest] = await Promise.all([
    getUserRiskScore(userId),
    getLatestRiskDecision(userId),
  ]);
  res.json({
    riskScore,
    latestDecision: latest,
  });
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
